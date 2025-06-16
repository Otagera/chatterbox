import { Writable } from "stream";
import net from "net";
import path from "path";
import os from "os";

const socketPath = path.join(os.tmpdir(), "chatterbox.sock");

const blockedUrls = ["/api/logs", "/api/logs/bulk"];

/**
 * Creates a writable stream for Pino to transport logs.
 * This transport intelligently filters out success logs from its own API endpoints
 * to prevent feedback loops, while still allowing error logs from those same endpoints
 * to be captured.
 *
 * @param {object} opts - Options passed by Pino.
 * @returns {Promise<Writable>} A Promise that resolves to our custom Writable stream.
 */
export default async function (opts) {
	const client = net.createConnection({ path: socketPath });

	client.on("error", (err) => {
		console.error(
			"[Chatterbox Transport] Could not connect to the Chatterbox logging server. Is it running?",
			err.message
		);
	});

	// Instead of returning the client directly, we create and return a new Writable stream. Pino will write logs to THIS stream.
	const transportStream = new Writable({
		// The `write` method is called for every single log. This is our "gatekeeper".
		write(chunk, encoding, callback) {
			try {
				const log = JSON.parse(chunk.toString());

				const regex =
					/REQUEST-INITIATED-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
				console.log("log.key.match(regex)", log.key.match(regex));
				const isRequestLog = !!log.request;
				const isInitiatedLog =
					!!log.key.match(regex) ||
					(log.response && log.response.statusCode < 400);
				const isBlockedUrl = blockedUrls.includes(log.request.url);
				const isCorrectTypeToBlock = isRequestLog || isInitiatedLog;

				if (isBlockedUrl && isCorrectTypeToBlock) {
					return callback();
				}
			} catch (e) {}

			client.write(chunk, encoding, callback);
		},
	});

	// When Pino is done with our transport, we'll close the connection to the server.
	transportStream.on("close", () => {
		client.end();
	});

	return transportStream;
}
