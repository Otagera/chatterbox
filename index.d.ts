export = ChatterboxSDK;
/**
 * @typedef {Object} LogEntry
 * @property {string} id - A unique ID for the log entry (usually MD5 hash of data).
 * @property {any} data - The actual log data payload.
 */
/**
 * A SDK for interacting with the Chatterbox logging service.
 * Handles sending logs, bulk sending, queueing failures, and retries.
 */
declare class ChatterboxSDK {
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
	constructor(_options: {
		appName: string;
		apiSecret: string;
		logFile?: string;
		retryDelayMS?: number;
		maxBulkLog?: number;
	});
	/**
	 * @property {string} CHATTERBOX_API_URL - The base URL for the Chatterbox API. Loaded from config.
	 */
	CHATTERBOX_API_URL: string;
	/**
	 * @property {string} CHATTERBOX_APP_NAME - The name of the application sending logs. Set during construction.
	 */
	CHATTERBOX_APP_NAME: string;
	/**
	 * @property {string} CHATTERBOX_API_SECRET - The API secret for authentication. Set during construction.
	 */
	CHATTERBOX_API_SECRET: string;
	/**
	 * @property {string} LOG_FILE - The path to the file used for queueing failed logs. Loaded from options or config.
	 */
	LOG_FILE: string;
	/**
	 * @property {number} RETRY_DELAY_MS - The delay in milliseconds between retry attempts for queued logs. Loaded from options or config.
	 */
	RETRY_DELAY_MS: string | number;
	/**
	 * @property {number} MAX_BULK_LOG - The maximum number of logs to include in a single bulk request. Loaded from options or config.
	 */
	MAX_BULK_LOG: string | number;
	/**
	 * @property {string} LOGGING_API_URL - The endpoint for sending single logs relative to CHATTERBOX_API_URL.
	 */
	LOGGING_API_URL: string;
	/**
	 * @property {string} BULK_LOGGING_API_URL - The endpoint for sending logs in bulk relative to CHATTERBOX_API_URL.
	 */
	BULK_LOGGING_API_URL: string;
	/**
	 * @property {Headers} myHeaders - The HTTP headers used for API requests, including authentication.
	 */
	myHeaders: Headers;
	/**
	 * @property {Array<LogEntry>} logQueue - The queue of logs that failed to send, loaded from/saved to the log file.
	 */
	logQueue: any;
	/**
	 * Saves the current log queue to the configured log file.
	 * @private
	 * @returns {void}
	 */
	private saveQueue;
	/**
	 * Generates a unique ID for each log entry based on its content.
	 * Used to prevent duplicate entries in the queue if retry logic re-adds the same log multiple times.
	 * @private
	 * @param {any} logData - The log data to generate an ID for.
	 * @returns {string} - A unique MD5 hash string based on the log data content.
	 */
	private generateLogId;
	/**
	 * Attempts to send a single log entry to the API.
	 * @param {any} log - The log entry data to send.
	 * @returns {Promise<boolean>} - Resolves to true if the log was sent successfully (status 2xx), false otherwise.
	 */
	sendLog: (log: any) => Promise<boolean>;
	/**
	 * Attempts to send multiple log entries in a single bulk request to the API.
	 * @param {Array<any>} logs - An array of log entry data objects to send in bulk.
	 * @returns {Promise<boolean>} - Resolves to true if the bulk request was successful (status 2xx), false otherwise.
	 */
	sendLogs: (logs: Array<any>) => Promise<boolean>;
	/**
	 * Adds a log entry to the in-memory queue and saves the queue to file.
	 * Avoids adding duplicates based on log content hash.
	 * @param {any} logData - The log entry data to queue.
	 * @returns {void}
	 */
	queueLog: (logData: any) => void;
	/**
	 * Adds multiple log entries to the in-memory queue and saves the queue to file.
	 * Uses queueLog internally to avoid duplicates.
	 * @param {Array<any>} logs - An array of log entry data objects to queue.
	 * @returns {void}
	 */
	queueLogs: (logs: Array<any>) => void;
	/**
	 * Creates and returns a custom Node.js writable stream.
	 * Data written to this stream (expected to be JSON string chunks representing log entries)
	 * will be parsed, attempted to be sent, and queued if sending fails.
	 * @returns {stream.Writable} - A custom writable stream for logging.
	 */
	getCustomStream: () => stream.Writable;
}
declare namespace ChatterboxSDK {
	export { LogEntry };
}
import stream = require("stream");
type LogEntry = {
	/**
	 * - A unique ID for the log entry (usually MD5 hash of data).
	 */
	id: string;
	/**
	 * - The actual log data payload.
	 */
	data: any;
};
