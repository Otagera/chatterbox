/**
 * Pino transport for sending logs to Chatterbox.
 *
 * @param {object} opts - Options for the transport, passed from Pino configuration.
 * @param {string} opts.appName - The application name.
 * @param {string} opts.apiSecret - The API secret for authentication.
 * @param {string} opts.fallbackQueueFilePath - Path for the fallback queue file.
 * @returns {Promise<import('pino-abstract-transport').Transport>} - A pino transport stream.
 */
export default function _default(opts: {
    appName: string;
    apiSecret: string;
    fallbackQueueFilePath: string;
}): Promise<import("pino-abstract-transport").Transport>;
