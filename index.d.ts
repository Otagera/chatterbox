export type LogEntry = {
    /**
     * - A unique ID for the log entry, typically an MD5 hash of its data, used to prevent duplicates.
     */
    id: string;
    /**
     * - The actual log data payload, which can be any serializable JSON object.
     */
    data: any;
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
export class ChatterboxSDK {
    /**
     * Initializes the Chatterbox SDK instance.
     * This constructor sets up the SDK's configuration, attempts to load any previously queued logs
     * from the specified log file, and starts a recurring interval to process and retry sending these logs.
     *
     * @constructor
     * @param {Object} _options - Configuration options for the SDK.
     * @param {string} _options.appName - **(Required)** The name of the application using the SDK. This is included in log metadata.
     * @param {string} _options.apiSecret - **(Required)** The API secret key for authenticating with the Chatterbox service.
     * @param {string} [_options.apiUrl] - Base URL of your Chatterbox server, e.g. `https://logs.example.com`. Falls back to the `CHATTERBOX_API_URL` env var.
     * @param {string} [_options.logFile] - Optional. File name used for the on-disk retry queue.
     * @param {string} [_options.dataDir] - Optional. Directory for the retry queue. Defaults to `<cwd>/.chatterbox`.
     * @param {number} [_options.retryDelayMS] - Optional. The delay (in milliseconds) between retry attempts for queued logs.
     * @param {number} [_options.maxBulkLog] - Optional. The maximum number of logs to send in a single bulk request.
     * @throws {Error} If `appName`, `apiSecret`, or the API URL are missing.
     */
    constructor(_options: {
        appName: string;
        apiSecret: string;
        apiUrl?: string;
        logFile?: string;
        dataDir?: string;
        retryDelayMS?: number;
        maxBulkLog?: number;
    });
    /**
     * @property {string} CHATTERBOX_API_URL - The base URL for the Chatterbox API, loaded from the application's configuration.
     */
    CHATTERBOX_API_URL: string;
    /**
     * @property {string} CHATTERBOX_APP_NAME - The name of the application or service sending logs, provided during SDK initialization.
     */
    CHATTERBOX_APP_NAME: string;
    /**
     * @property {string} CHATTERBOX_API_SECRET - The API secret used for authenticating requests to the Chatterbox service, provided during SDK initialization.
     */
    CHATTERBOX_API_SECRET: string;
    /**
     * @property {string} LOG_FILE - The path to the file used for persisting and queuing failed log entries. Defaults to a value from the config.
     */
    LOG_FILE: string;
    /**
     * @property {number} RETRY_DELAY_MS - The delay in milliseconds between attempts to retry sending queued logs. Defaults to a value from the config.
     */
    RETRY_DELAY_MS: string | number;
    /**
     * @property {number} MAX_BULK_LOG - The maximum number of log entries to include in a single bulk API request. Defaults to a value from the config.
     */
    MAX_BULK_LOG: string | number;
    /**
     * @property {string} LOGGING_API_URL - The specific API endpoint for sending a single log entry, relative to `CHATTERBOX_API_URL`.
     * @constant
     */
    LOGGING_API_URL: string;
    /**
     * @property {string} BULK_LOGGING_API_URL - The specific API endpoint for sending multiple log entries in a bulk request, relative to `CHATTERBOX_API_URL`.
     * @constant
     */
    BULK_LOGGING_API_URL: string;
    /**
     * @property {Headers} myHeaders - The HTTP headers configured for all API requests, including `Content-Type`, `appName`, and `Authorization`.
     */
    myHeaders: Headers;
    /**
     * @property {Array<LogEntry>} logQueue - An in-memory queue of log entries that failed to be sent to the Chatterbox service. This queue is loaded from and saved to the `LOG_FILE`.
     */
    logQueue: any[];
    /**
     * @property {NodeJS.Timeout} retryInterval - The ID of the interval timer responsible for periodically processing the `logQueue`.
     */
    retryInterval: NodeJS.Timeout;
    DATA_DIR: string;
    /**
     * Processes the in-memory log queue. It attempts to send logs in batches
     * to the Chatterbox API. If a batch fails to send, its logs are re-queued for
     * a subsequent retry interval. After processing, the queue is saved to the log file.
     * This method is automatically called by the `retryInterval`.
     * @private
     * @returns {Promise<void>} A Promise that resolves when the queue processing for the current interval is complete.
     */
    private processQueue;
    /**
     * Performs a graceful shutdown of the Chatterbox SDK.
     * This method stops the retry interval and then attempts one final time to
     * process any remaining logs in the queue before exiting.
     * @returns {Promise<void>} A Promise that resolves when the shutdown process is complete.
     */
    close: () => Promise<void>;
    /**
     * Saves the current in-memory `logQueue` to the configured `LOG_FILE`.
     * This method overwrites the existing file content with the current state of the queue.
     * @private
     * @returns {Promise<void>} A Promise that resolves when the queue has been successfully saved, or rejects if an error occurs during file writing.
     */
    private saveQueue;
    /**
     * Generates a unique ID for a given log entry based on its content using MD5 hashing.
     * This ID is used to prevent duplicate log entries from being added to the queue during retries.
     * @private
     * @param {any} logData - The log data payload for which to generate an ID.
     * @returns {string} A unique hexadecimal MD5 hash string representing the log data.
     */
    private generateLogId;
    /**
     * Attempts to send a single log entry to the Chatterbox API.
     * If the API request is successful (HTTP status 2xx), it returns `true`.
     * If the request fails due to network issues (e.g., connection refused/reset) or
     * an API error (non-2xx status), it logs the error and returns `false`.
     * @param {any} log - The log entry data to send.
     * @returns {Promise<boolean>} A Promise that resolves to `true` if the log was sent successfully, `false` otherwise.
     */
    sendLog: (log: any) => Promise<boolean>;
    /**
     * Attempts to send multiple log entries in a single bulk request to the Chatterbox API.
     * Returns `true` if the request is successful (HTTP status 2xx), `false` otherwise.
     * Similar to `sendLog`, it handles network and API errors.
     * @param {Array<any>} logs - An array of log entry data objects to send in bulk.
     * @returns {Promise<boolean>} A Promise that resolves to `true` if the bulk request was successful, `false` otherwise.
     */
    sendLogs: (logs: Array<any>) => Promise<boolean>;
    /**
     * Adds a single log entry to the in-memory `logQueue`. Before adding, it generates
     * a unique ID for the log and checks if a log with the same ID already exists in the queue
     * to prevent duplicates. After adding, it persists the updated queue to the `LOG_FILE`.
     * @param {any} logData - The log entry data to queue.
     * @returns {Promise<void>} A Promise that resolves when the log has been added (if not a duplicate) and the queue saved.
     */
    queueLog: (logData: any) => Promise<void>;
    /**
     * Adds multiple log entries to the in-memory queue. It iterates through the provided
     * array of logs and calls `queueLog` for each, ensuring duplicate checks and persistence
     * for every log added.
     * @param {Array<any>} logs - An array of log entry data objects to queue.
     * @returns {void}
     */
    queueLogs: (logs: Array<any>) => void;
    /**
     * Creates and returns a custom Node.js writable stream. This stream is intended
     * to be used as a Pino transport. When data (expected to be JSON stringified log
     * objects) is written to this stream, it attempts to parse the data, send it to
     * the Chatterbox API, and if sending fails, it queues the log for retry.
     * @returns {stream.Writable} A custom writable stream that processes log chunks.
     */
    getCustomStream: () => stream.Writable;
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
 * @param {string} [options.socketPath] - Override the Unix socket path.
 * @param {string} [options.dataDir] - Override where the retry queue is stored.
 * @returns {net.Server} The Node.js `net.Server` instance.
 */
export function startChatterboxServer(options: {
    appName: string;
    apiSecret: string;
    logFile?: string;
    retryDelayMS?: number;
    maxBulkLog?: number;
    socketPath?: string;
    dataDir?: string;
}): net.Server;
/**
 * Resolves the Unix socket used between a pino transport and the Chatterbox
 * forwarder. The path is derived per application so that several apps running
 * on the same host do not fight over a single shared socket.
 *
 * NOTE: this logic is duplicated in `chatterboxTransport.mjs` (ESM cannot
 * import from this CJS module at transport-load time). Keep both in sync.
 *
 * @param {string} appName
 * @param {string} [explicit] Explicit socketPath option, wins if provided.
 * @returns {string}
 */
export function resolveSocketPath(appName: string, explicit?: string): string;
/**
 * Resolves the directory used to persist the retry queue.
 * Order: explicit option -> CHATTERBOX_DATA_DIR env -> <cwd>/.chatterbox
 * Never defaults inside the package directory (node_modules).
 * @param {string} [explicit]
 * @returns {string}
 */
export function resolveDataDir(explicit?: string): string;
import stream = require("stream");
import net = require("net");
