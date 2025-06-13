import { once } from "event";
import { build } from "pino-abstract-transport";
import SonicBoom from "sonic-boom";
import ChatterboxSDK from "./index";

const chatterbox = new ChatterboxSDK({
	apiSecret: process.env.CHATTERBOX_API_SECRET,
	appName: process.env.CHATTERBOX_APP_NAME,
});

//
let queueFileWriter;

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
export default async function (opts) {
	if (!opts.fallbackQueueFilePath) {
		throw new Error(
			'Chatterbox transport: "fallbackQueueFilePath" option is required for queuing failed logs.'
		);
	}

	// Initialize the queue file writer early
	try {
		await chatterbox.getQueueFileWriter(opts.fallbackQueueFilePath);
	} catch (error) {
		console.error("Failed to initialize queue file writer on startup:", error);
		throw error;
	}

	return build(
		async function (source) {
			for await (const obj of source) {
				const logData = obj;

				// Attempt to send the log data via HTTP
				const success = await chatterbox.sendLog(logData);

				// If sending fails, queue the log to the file
				if (!success) {
					await chatterbox.queueLog(logData, opts.fallbackQueueFilePath);
				}

				// NO SonicBoom.write() here for the primary log path.
				// This transport's primary output is the HTTP call.
				// The file writing is a secondary fallback mechanism.
			}
		},
		{
			async close(err) {
				if (err) {
					console.error("Chatterbox HTTP transport closing due to error:", err);
				} else {
					console.log("Chatterbox HTTP transport finalizing.");
				}

				// Close the queue file writer if it exists
				if (queueFileWriter) {
					queueFileWriter.end();
					await once(queueFileWriter, "close");
					console.log("Queue file writer closed.");
				}

				console.log("Chatterbox HTTP transport closed.");
			},
		}
	);
}
