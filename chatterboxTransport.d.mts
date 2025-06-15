/**
 * Creates a writable stream for Pino to transport logs to a Chatterbox logging server via a Unix domain socket.
 *
 * This function is designed to be used as a Pino transport. It establishes a connection
 * to a Unix domain socket located at `chatterbox.sock` in the same directory as this module.
 *
 * Connection errors are handled to prevent the transport process from crashing if the
 * Chatterbox server is not running.
 *
 * @param {object} opts - Options passed by Pino (currently not used in this transport but required by Pino's API).
 * @returns {Promise<net.Socket>} A Promise that resolves to a `net.Socket` (a Duplex stream), which Pino will use as a writable stream for logs.
 */
export default function _default(opts: object): Promise<net.Socket>;
