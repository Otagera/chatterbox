const stream = require("stream");
const fs = require("fs");
const crypto = require("crypto");
const config = require("./config"); // Assuming config.js exists

/**
 * @typedef {Object} LogEntry
 * @property {string} id - A unique ID for the log entry (usually MD5 hash of data).
 * @property {any} data - The actual log data payload.
 */

/**
 * A SDK for interacting with the Chatterbox logging service.
 * Handles sending logs, bulk sending, queueing failures, and retries.
 */
class ChatterboxSDK {
	/**
	 * @property {string} CHATTERBOX_API_URL - The base URL for the Chatterbox API. Loaded from config.
	 */
	CHATTERBOX_API_URL = config.CHATTERBOX_API_URL;

	/**
	 * @property {string} CHATTERBOX_APP_NAME - The name of the application sending logs. Set during construction.
	 */
	CHATTERBOX_APP_NAME;

	/**
	 * @property {string} CHATTERBOX_API_SECRET - The API secret for authentication. Set during construction.
	 */
	CHATTERBOX_API_SECRET;

	/**
	 * @property {string} LOG_FILE - The path to the file used for queueing failed logs. Loaded from options or config.
	 */
	LOG_FILE;

	/**
	 * @property {number} RETRY_DELAY_MS - The delay in milliseconds between retry attempts for queued logs. Loaded from options or config.
	 */
	RETRY_DELAY_MS;

	/**
	 * @property {number} MAX_BULK_LOG - The maximum number of logs to include in a single bulk request. Loaded from options or config.
	 */
	MAX_BULK_LOG;

	/**
	 * @property {string} LOGGING_API_URL - The endpoint for sending single logs relative to CHATTERBOX_API_URL.
	 */
	LOGGING_API_URL = "/api/logs";

	/**
	 * @property {string} BULK_LOGGING_API_URL - The endpoint for sending logs in bulk relative to CHATTERBOX_API_URL.
	 */
	BULK_LOGGING_API_URL = "/api/logs/bulk";

	/**
	 * @property {Headers} myHeaders - The HTTP headers used for API requests, including authentication.
	 */
	myHeaders = new Headers();

	/**
	 * @property {Array<LogEntry>} logQueue - The queue of logs that failed to send, loaded from/saved to the log file.
	 */
	logQueue = [];

	queueFileWriter;
	queueFilePath;

	/**
	 * Initializes the Chatterbox Logger with the provided options.
	 * Sets up configuration, loads queued logs, and starts the retry interval.
	 *
	 * @constructor
	 * @param {Object} _options - Configuration options for the logger.
	 * @param {string} _options.appName - **(Required)** The application name.
	 * @param {string} _options.apiSecret - **(Required)** The API secret for authentication.
	 * @param {string} [_options.logFile] - The log file path. Defaults to `config.LOG_FILE`.
	 * @param {number} [_options.retryDelayMS] - The retry delay in milliseconds. Defaults to `config.RETRY_DELAY_MS`.
	 * @param {number} [_options.maxBulkLog] - The maximum number of logs to send in bulk. Defaults to `config.MAX_BULK_LOG`.
	 */
	constructor(_options) {
		if (!_options?.appName || !_options?.apiSecret) {
			throw new Error(
				"appName and apiSecret are required options for ChatterboxSDK."
			);
		}

		this.CHATTERBOX_APP_NAME = _options.appName;
		this.CHATTERBOX_API_SECRET = _options.apiSecret;

		this.LOG_FILE = _options?.logFile || config.LOG_FILE;
		try {
			this.logQueue = fs.existsSync(this.LOG_FILE)
				? JSON.parse(fs.readFileSync(this.LOG_FILE, "utf8"))
				: [];
		} catch (e) {
			console.error(`Error reading log queue from ${this.LOG_FILE}:`, e);
			this.logQueue = [];
		}

		this.RETRY_DELAY_MS = _options?.retryDelayMS || config.RETRY_DELAY_MS;
		this.MAX_BULK_LOG = _options?.maxBulkLog || config.MAX_BULK_LOG;

		this.myHeaders.append("Content-Type", "application/json");
		this.myHeaders.append("appName", this.CHATTERBOX_APP_NAME);
		this.myHeaders.append(
			"Authorization",
			`Bearer ${this.CHATTERBOX_API_SECRET}`
		);

		setInterval(async () => {
			if (this.logQueue.length > 0) {
				console.log(`Retrying ${this.logQueue.length} queued logs...`);

				const unsentLogs = [...this.logQueue];
				this.logQueue = [];
				await this.saveQueue();

				while (unsentLogs.length > this.MAX_BULK_LOG) {
					const nextBatchToSend = unsentLogs
						.splice(0, this.MAX_BULK_LOG)
						.map((log) => log.data);
					const success = await this.sendLogs(nextBatchToSend);
					if (!success) {
						// If bulk failed, re-queue individual logs from the batch
						nextBatchToSend.forEach((logData) => this.queueLog(logData));
					}
				}

				// Process any remaining logs individually
				for (const logEntry of unsentLogs) {
					const success = await this.sendLog(logEntry.data);
					if (!success) {
						this.queueLog(logEntry.data); // Re-queue if sending failed
					}
				}
			}
		}, this.RETRY_DELAY_MS);
	}

	/**
	 * Saves the current log queue to the configured log file.
	 * @private
	 * @returns {Promise<void>}
	 */
	saveQueue = async () => {
		try {
			await getQueueFileWriter(this.LOG_FILE);
		} catch (e) {
			console.error(`Error saving log queue to ${this.LOG_FILE}:`, e);
		}
	};

	/**
	 * Generates a unique ID for each log entry based on its content.
	 * Used to prevent duplicate entries in the queue if retry logic re-adds the same log multiple times.
	 * @private
	 * @param {any} logData - The log data to generate an ID for.
	 * @returns {string} - A unique MD5 hash string based on the log data content.
	 */
	generateLogId = (logData) => {
		return crypto
			.createHash("md5")
			.update(JSON.stringify(logData))
			.digest("hex");
	};

	/**
	 * Attempts to send a single log entry to the API.
	 * @param {any} log - The log entry data to send.
	 * @returns {Promise<boolean>} - Resolves to true if the log was sent successfully (status 2xx), false otherwise.
	 */
	sendLog = async (log) => {
		try {
			const response = await fetch(
				`${this.CHATTERBOX_API_URL}${this.LOGGING_API_URL}`,
				{
					method: "POST",
					headers: this.myHeaders,
					body: JSON.stringify({ log }),
				}
			);

			if (!response.ok) {
				console.error(
					`Failed to send log. API responded with status: ${response.status}`
				);
				return false;
			}

			console.log("Log sent successfully");
			return true;
		} catch (error) {
			if (
				error.cause?.code === "ECONNRESET" ||
				error.cause?.code === "ECONNREFUSED"
			) {
				console.error(
					"Logging server unavailable or connection issue, queuing log"
				);
			} else {
				console.error("Unexpected error sending log:", error);
			}
			return false;
		}
	};

	/**
	 * Attempts to send multiple log entries in a single bulk request to the API.
	 * @param {Array<any>} logs - An array of log entry data objects to send in bulk.
	 * @returns {Promise<boolean>} - Resolves to true if the bulk request was successful (status 2xx), false otherwise.
	 */
	sendLogs = async (logs) => {
		if (logs.length === 0) {
			return true;
		}
		try {
			const response = await fetch(
				`${this.CHATTERBOX_API_URL}${this.BULK_LOGGING_API_URL}`,
				{
					method: "POST",
					headers: this.myHeaders,
					body: JSON.stringify({ logs }),
				}
			);

			if (!response.ok) {
				console.error(
					`Failed to send bulk logs. API responded with status: ${response.status}`
				);
				return false;
			}

			console.log(`Bulk logs (${logs.length}) sent successfully`);
			return true;
		} catch (error) {
			if (
				error.cause?.code === "ECONNRESET" ||
				error.cause?.code === "ECONNREFUSED"
			) {
				console.error(
					"Logging server unavailable or connection issue, queuing logs"
				);
			} else {
				console.error("Unexpected error sending bulk logs:", error);
			}
			return false;
		}
	};

	/**
	 * Adds a log entry to the in-memory queue and saves the queue to file.
	 * Avoids adding duplicates based on log content hash.
	 * @param {any} logData - The log entry data to queue.
	 * @returns {Promise<void>}
	 */
	queueLog = async (logData) => {
		const logId = this.generateLogId(logData);
		const exists = this.logQueue.some((log) => log.id === logId);

		if (!exists) {
			this.logQueue.push({ id: logId, data: logData });
			await this.saveQueue();
			console.log(`Log queued: ${logId}`);

			try {
				// Append the new log entry to the file immediately
				const writer = await this.getQueueFileWriter(fallbackQueueFilePath);
				const logLine = JSON.stringify(logData) + "\n";
				const toDrain = !writer.write(logLine);

				if (toDrain) {
					await once(writer, "drain");
				}
				// console.log(`Log queued to file: ${logId}`); // Avoid excessive console.log in prod
			} catch (error) {
				console.error(`Failed to write log ${logId} to queue file:`, error);
				// If writing to the queue file fails, you might want another fallback here
				// (e.g., log to console as a last resort, or use process.stderr)
				console.error(
					`LAST RESORT: Failed to queue log ${logId}`,
					JSON.stringify(logData)
				);
			}
		} else {
			console.log(`Log already in queue, skipping: ${logId}`);
		}
	};

	/**
	 * Adds multiple log entries to the in-memory queue and saves the queue to file.
	 * Uses queueLog internally to avoid duplicates.
	 * @param {Array<any>} logs - An array of log entry data objects to queue.
	 * @returns {void}
	 */
	queueLogs = (logs) => {
		logs.forEach((logData) => this.queueLog(logData));
	};

	/**
	 * Initializes or gets the SonicBoom instance for writing queued logs.
	 * @param {string} filePath - The path to the file where queued logs should be written.
	 * @returns {Promise<SonicBoom>}
	 */
	getQueueFileWriter = async (filePath) => {
		if (!this.queueFileWriter || this.queueFilePath !== filePath) {
			if (this.queueFileWriter) {
				// If path changed or old instance exists, close it first
				this.queueFileWriter.end();
				await once(this.queueFileWriter, "close");
			}
			this.queueFileWriter = new SonicBoom({
				dest: filePath,
				sync: false, // Async writing for performance
				append: true, // Append to the file if it exists
			});
			queueFilePath = filePath;
			await once(this.queueFileWriter, "ready");
			console.log(`Initialized queue log file writer to: ${filePath}`);
		}
		return this.queueFileWriter;
	};

	/**
	 * Creates and returns a custom Node.js writable stream.
	 * Data written to this stream (expected to be JSON string chunks representing log entries)
	 * will be parsed, attempted to be sent, and queued if sending fails.
	 * @returns {stream.Writable} - A custom writable stream for logging.
	 */
	getCustomStream = () => {
		const self = this;
		return new stream.Writable({
			objectMode: true,
			async write(logChunk, encoding, callback) {
				let logData;
				try {
					logData = JSON.parse(logChunk.toString());
				} catch (e) {
					console.error(
						"Failed to parse log chunk as JSON:",
						e,
						logChunk.toString()
					);

					callback();
					return;
				}

				const success = await self.sendLog(logData);
				if (!success) {
					self.queueLog(logData);
				}
				callback();
			},
			final(callback) {
				console.log("Chatterbox stream finalized.");
				callback();
			},
		});
	};
}

module.exports = ChatterboxSDK;
