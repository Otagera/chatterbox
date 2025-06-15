import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const socketPath = path.join(__dirname, "chatterbox.sock");

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
export default async function (opts) {
	const client = net.createConnection({ path: socketPath });

	// It's good practice to handle connection errors.
	// This will prevent the transport process from crashing if the main server isn't running.
	client.on("error", (err) => {
		console.error(
			"[Chatterbox Transport] Could not connect to the Chatterbox logging server. Is it running?",
			err.message
		);
	});

	// A net.Socket is a Duplex stream (both readable and writable).
	// We can return it directly, and Pino will pipe logs into it.
	return client;
}
