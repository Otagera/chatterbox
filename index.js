require("dotenv");
const stream = require("stream");
const fs = require("fs");
const crypto = require("crypto");
const net = require("net");
const os = require("os");

const config = require("./config");
const path = require("path");

/**
 * @constant {Object.<number, string>} PINO_LEVEL_LABELS - A mapping from Pino numeric log levels to their corresponding string labels.
 */
const PINO_LEVEL_LABELS = {
	60: "fatal",
	50: "error",
	40: "warn",
	30: "info",
	20: "debug",
	10: "trace",
};

/**
 * @typedef {Object} LogEntry
 * @property {string} id - A unique ID for the log entry, typically an MD5 hash of its data, used to prevent duplicates.
 * @property {any} data - The actual log data payload, which can be any serializable JSON object.
 */

/**
 * A Software Development Kit (SDK) for interacting with the Chatterbox logging service.
 * This class provides functionality for sending individual logs, sending logs in bulk,
 * queueing logs that fail to send, and managing retry attempts for those queued logs.
 * It handles authentication and persistence of failed logs to a local file.
 */
class ChatterboxSDK {
	/**
	 * @property {string} CHATTERBOX_API_URL - The base URL for the Chatterbox API, loaded from the application's configuration.
	 */
	CHATTERBOX_API_URL = config.CHATTERBOX_API_URL;

	/**
	 * @property {string} CHATTERBOX_APP_NAME - The name of the application or service sending logs, provided during SDK initialization.
	 */
	CHATTERBOX_APP_NAME;

	/**
	 * @property {string} CHATTERBOX_API_SECRET - The API secret used for authenticating requests to the Chatterbox service, provided during SDK initialization.
	 */
	CHATTERBOX_API_SECRET;

	/**
	 * @property {string} LOG_FILE - The path to the file used for persisting and queuing failed log entries. Defaults to a value from the config.
	 */
	LOG_FILE;

	/**
	 * @property {number} RETRY_DELAY_MS - The delay in milliseconds between attempts to retry sending queued logs. Defaults to a value from the config.
	 */
	RETRY_DELAY_MS;

	/**
	 * @property {number} MAX_BULK_LOG - The maximum number of log entries to include in a single bulk API request. Defaults to a value from the config.
	 */
	MAX_BULK_LOG;

	/**
	 * @property {string} LOGGING_API_URL - The specific API endpoint for sending a single log entry, relative to `CHATTERBOX_API_URL`.
	 * @constant
	 */
	LOGGING_API_URL = "/api/logs";

	/**
	 * @property {string} BULK_LOGGING_API_URL - The specific API endpoint for sending multiple log entries in a bulk request, relative to `CHATTERBOX_API_URL`.
	 * @constant
	 */
	BULK_LOGGING_API_URL = "/api/logs/bulk";

	/**
	 * @property {Headers} myHeaders - The HTTP headers configured for all API requests, including `Content-Type`, `appName`, and `Authorization`.
	 */
	myHeaders = new Headers();

	/**
	 * @property {Array<LogEntry>} logQueue - An in-memory queue of log entries that failed to be sent to the Chatterbox service. This queue is loaded from and saved to the `LOG_FILE`.
	 */
	logQueue = [];

	/**
	 * @property {NodeJS.Timeout} retryInterval - The ID of the interval timer responsible for periodically processing the `logQueue`.
	 */
	retryInterval;

	/**
	 * Initializes the Chatterbox SDK instance.
	 * This constructor sets up the SDK's configuration, attempts to load any previously queued logs
	 * from the specified log file, and starts a recurring interval to process and retry sending these logs.
	 *
	 * @constructor
	 * @param {Object} _options - Configuration options for the SDK.
	 * @param {string} _options.appName - **(Required)** The name of the application using the SDK. This is included in log metadata.
	 * @param {string} _options.apiSecret - **(Required)** The API secret key for authenticating with the Chatterbox service.
	 * @param {string} [_options.logFile] - Optional. The file path for storing queued logs. Defaults to `config.LOG_FILE`.
	 * @param {number} [_options.retryDelayMS] - Optional. The delay (in milliseconds) between retry attempts for queued logs. Defaults to `config.RETRY_DELAY_MS`.
	 * @param {number} [_options.maxBulkLog] - Optional. The maximum number of logs to send in a single bulk request. Defaults to `config.MAX_BULK_LOG`.
	 * @throws {Error} If `appName` or `apiSecret` are not provided in the options.
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

		const dataDirPath = path.join(__dirname, "data");

		if (!fs.existsSync(dataDirPath)) {
			console.log(
				`[ChatterboxSDK] Data directory not found. Creating it at: ${dataDirPath}`
			);

			fs.mkdirSync(dataDirPath, { recursive: true });
		}

		const pathToLogFile = path.join(dataDirPath, this.LOG_FILE);

		// Load existing queued logs from file
		try {
			this.logQueue = fs.existsSync(pathToLogFile)
				? JSON.parse(fs.readFileSync(pathToLogFile, "utf8"))
				: [];
		} catch (e) {
			console.error(`Error reading log queue from ${this.LOG_FILE}:`, e);
			this.logQueue = []; // Reset queue on read error to prevent app crash
		}

		this.RETRY_DELAY_MS = _options?.retryDelayMS || config.RETRY_DELAY_MS;
		this.MAX_BULK_LOG = _options?.maxBulkLog || config.MAX_BULK_LOG;

		// Set up HTTP headers for API requests
		this.myHeaders.append("Content-Type", "application/json");
		this.myHeaders.append("appName", this.CHATTERBOX_APP_NAME);
		this.myHeaders.append(
			"Authorization",
			`Bearer ${this.CHATTERBOX_API_SECRET}`
		);

		// Start the interval for processing queued logs
		this.retryInterval = setInterval(this.processQueue, this.RETRY_DELAY_MS);
	}

	/**
	 * Processes the in-memory log queue. It attempts to send logs in batches
	 * to the Chatterbox API. If a batch fails to send, its logs are re-queued for
	 * a subsequent retry interval. After processing, the queue is saved to the log file.
	 * This method is automatically called by the `retryInterval`.
	 * @private
	 * @returns {Promise<void>} A Promise that resolves when the queue processing for the current interval is complete.
	 */
	processQueue = async () => {
		if (this.logQueue.length === 0) {
			return;
		}

		console.log(
			`[ChatterboxSDK] Retrying ${this.logQueue.length} queued logs...`
		);

		const logsToProcess = [...this.logQueue];
		this.logQueue = [];

		while (logsToProcess.length > 0) {
			const batch = logsToProcess.splice(0, this.MAX_BULK_LOG);
			const batchData = batch.map((log) => log.data);

			console.log(
				`[ChatterboxSDK] Attempting to send a batch of ${batch.length} logs.`
			);
			const success = await this.sendLogs(batchData);

			if (!success) {
				console.error(
					`[ChatterboxSDK] Batch send failed. Re-queuing ${batch.length} logs for the next interval.`
				);

				this.queueLogs(batchData);
			}
		}

		// Persist the updated queue state to the log file
		await this.saveQueue();
	};

	/**
	 * Performs a graceful shutdown of the Chatterbox SDK.
	 * This method stops the retry interval and then attempts one final time to
	 * process any remaining logs in the queue before exiting.
	 * @returns {Promise<void>} A Promise that resolves when the shutdown process is complete.
	 */
	close = async () => {
		console.log("[ChatterboxSDK] Closing... Stopping retry interval.");
		// Stop the periodic retry mechanism
		clearInterval(this.retryInterval);

		// Attempt to send any remaining queued logs
		await this.processQueue();
		console.log("[ChatterboxSDK] Shutdown complete.");
	};

	/**
	 * Saves the current in-memory `logQueue` to the configured `LOG_FILE`.
	 * This method overwrites the existing file content with the current state of the queue.
	 * @private
	 * @returns {Promise<void>} A Promise that resolves when the queue has been successfully saved, or rejects if an error occurs during file writing.
	 */
	saveQueue = async () => {
		try {
			fs.writeFileSync(
				path.join(__dirname, "data", this.LOG_FILE),
				JSON.stringify(this.logQueue, null, 2),
				"utf8"
			);
		} catch (e) {
			console.error(
				`[ChatterboxSDK] Error saving log queue to ${this.LOG_FILE}:`,
				e
			);
		}
	};

	/**
	 * Generates a unique ID for a given log entry based on its content using MD5 hashing.
	 * This ID is used to prevent duplicate log entries from being added to the queue during retries.
	 * @private
	 * @param {any} logData - The log data payload for which to generate an ID.
	 * @returns {string} A unique hexadecimal MD5 hash string representing the log data.
	 */
	generateLogId = (logData) => {
		return crypto
			.createHash("md5")
			.update(JSON.stringify(logData))
			.digest("hex");
	};

	/**
	 * Attempts to send a single log entry to the Chatterbox API.
	 * If the API request is successful (HTTP status 2xx), it returns `true`.
	 * If the request fails due to network issues (e.g., connection refused/reset) or
	 * an API error (non-2xx status), it logs the error and returns `false`.
	 * @param {any} log - The log entry data to send.
	 * @returns {Promise<boolean>} A Promise that resolves to `true` if the log was sent successfully, `false` otherwise.
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
				const errorText = await response.text();
				throw new Error(errorText);
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
	 * Attempts to send multiple log entries in a single bulk request to the Chatterbox API.
	 * Returns `true` if the request is successful (HTTP status 2xx), `false` otherwise.
	 * Similar to `sendLog`, it handles network and API errors.
	 * @param {Array<any>} logs - An array of log entry data objects to send in bulk.
	 * @returns {Promise<boolean>} A Promise that resolves to `true` if the bulk request was successful, `false` otherwise.
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
				const errorText = await response.text();
				throw new Error(errorText);
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
	 * Adds a single log entry to the in-memory `logQueue`. Before adding, it generates
	 * a unique ID for the log and checks if a log with the same ID already exists in the queue
	 * to prevent duplicates. After adding, it persists the updated queue to the `LOG_FILE`.
	 * @param {any} logData - The log entry data to queue.
	 * @returns {Promise<void>} A Promise that resolves when the log has been added (if not a duplicate) and the queue saved.
	 */
	queueLog = async (logData) => {
		const logId = this.generateLogId(logData);
		const exists = this.logQueue.some((log) => log.id === logId);

		if (!exists) {
			this.logQueue.push({ id: logId, data: logData });
			await this.saveQueue();
			console.log(
				`[ChatterboxSDK] Log queued: ${logId}. Queue size: ${this.logQueue.length}`
			);
		}
	};

	/**
	 * Adds multiple log entries to the in-memory queue. It iterates through the provided
	 * array of logs and calls `queueLog` for each, ensuring duplicate checks and persistence
	 * for every log added.
	 * @param {Array<any>} logs - An array of log entry data objects to queue.
	 * @returns {void}
	 */
	queueLogs = (logs) => {
		logs.forEach((logData) => this.queueLog(logData));
	};

	/**
	 * Creates and returns a custom Node.js writable stream. This stream is intended
	 * to be used as a Pino transport. When data (expected to be JSON stringified log
	 * objects) is written to this stream, it attempts to parse the data, send it to
	 * the Chatterbox API, and if sending fails, it queues the log for retry.
	 * @returns {stream.Writable} A custom writable stream that processes log chunks.
	 */
	getCustomStream = () => {
		const self = this;
		return new stream.Writable({
			objectMode: true,
			/**
			 * The `_write` method is called when data is written to the stream.
			 * @param {Buffer|string} logChunk - The chunk of data written to the stream, expected to be a JSON string.
			 * @param {string} encoding - The encoding of the chunk (e.g., 'utf8').
			 * @param {Function} callback - A callback function to be called when the write operation is complete.
			 */
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
			/**
			 * The `_final` method is called when the writable stream is about to close.
			 * @param {Function} callback - A callback function to be called when the finalization is complete.
			 */
			final(callback) {
				console.log("Chatterbox stream finalized.");
				callback();
			},
		});
	};
}

/**
 * Initializes and starts the Chatterbox logging server.
 * This server creates a Unix domain socket to receive log data from Pino transports
 * (or other clients). It uses the `ChatterboxSDK` to process incoming logs,
 * send them to the Chatterbox API, and manage failed logs through queuing and retries.
 * It also handles graceful shutdown, cleaning up the socket file on exit.
 *
 * @param {Object} options - Configuration options passed directly to the `ChatterboxSDK` constructor.
 * @param {string} options.appName - The name of the application.
 * @param {string} options.apiSecret - The API secret for authentication.
 * @param {string} [options.logFile] - The log file path.
 * @param {number} [options.retryDelayMS] - The retry delay in milliseconds.
 * @param {number} [options.maxBulkLog] - The maximum number of logs to send in bulk.
 * @returns {net.Server} The Node.js `net.Server` instance.
 */
const startChatterboxServer = (options) => {
	const socketPath = path.join(os.tmpdir(), "chatterbox.sock");

	if (fs.existsSync(socketPath)) {
		fs.unlinkSync(socketPath);
	}

	const sdk = new ChatterboxSDK(options);
	console.log(
		"[Chatterbox Server] SDK instance created and retry mechanism started."
	);

	// Create the Unix domain socket server
	const server = net.createServer((socket) => {
		console.log("[Chatterbox Server] A transport connected.");

		// Listen for incoming data from connected clients (Pino transports)
		socket.on("data", (data) => {
			try {
				const logString = data.toString();

				// Logs might be concatenated, so split them by newline character
				logString.split("\n").forEach((logLine) => {
					if (logLine) {
						const log = JSON.parse(logLine);

						if (typeof log.level === "number") {
							log.level = PINO_LEVEL_LABELS[log.level] || `${log.level}`;
						}
						sdk.queueLog(log);
					}
				});
			} catch (e) {
				console.error(
					"[Chatterbox Server] Error processing data from transport:",
					e
				);
			}
		});

		socket.on("end", () => {
			console.log("[Chatterbox Server] A transport disconnected.");
		});
	});

	// Start the server listening on the Unix domain socket
	server.listen(socketPath, () => {
		console.log(`[Chatterbox Server] Listening on socket: ${socketPath}`);
	});

	// Register a process exit handler for graceful shutdown
	process.on("exit", () => {
		console.log("[Chatterbox Server] Shutting down.");
		// Close the socket server
		server.close();

		// Close the SDK and flush any remaining logs
		sdk.close();

		// Ensure the socket file is removed on exit
		if (fs.existsSync(socketPath)) {
			fs.unlinkSync(socketPath);
		}
	});

	return server;
};

/**
 * Exports the ChatterboxSDK class and the startChatterboxServer function.
 * @module chatterbox-sdk
 * @property {ChatterboxSDK} ChatterboxSDK - The SDK class for interacting with the Chatterbox logging service.
 * @property {function(Object): net.Server} startChatterboxServer - A function to initialize and start the Chatterbox logging server.
 */
module.exports = { ChatterboxSDK, startChatterboxServer };
