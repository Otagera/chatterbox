/**
 * Pino transport for sending logs directly to a custom HTTP destination (e.g., Chatterbox).
 * If HTTP sending fails, logs are added to an in-memory queue and then appended to a local file.
 *
 * @param {object} opts - Options for the transport.
 * @param {string} opts.apiUrl - The URL of your Chatterbox API.
 * @param {string} [opts.apiKey] - Optional API key for your Chatterbox API.
 * @param {string} opts.fallbackQueueFilePath - The path to the file for queuing failed logs.
 * @returns {Promise<import('pino-abstract-transport').Transport>} - A pino transport stream.
 */
export default function _default(opts: {
    apiUrl: string;
    apiKey?: string;
    fallbackQueueFilePath: string;
}): Promise<import('pino-abstract-transport').Transport>;
