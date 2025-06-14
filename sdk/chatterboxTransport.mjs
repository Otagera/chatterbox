import pinoAbstractTransport from "pino-abstract-transport";
import ChatterboxSDK from "./index.js";

const PINO_LEVEL_LABELS = {
	60: "fatal",
	50: "error",
	40: "warn",
	30: "info",
	20: "debug",
	10: "trace",
};

/**
 * Pino transport for sending logs to Chatterbox.
 *
 * @param {object} opts - Options for the transport, passed from Pino configuration.
 * @param {string} opts.appName - The application name.
 * @param {string} opts.apiSecret - The API secret for authentication.
 * @param {string} opts.fallbackQueueFilePath - Path for the fallback queue file.
 * @returns {Promise<import('pino-abstract-transport').Transport>} - A pino transport stream.
 */
export default async function (opts) {
	if (!opts.apiSecret || !opts.appName) {
		throw new Error(
			'Chatterbox transport: "apiSecret" and "appName" options are required.'
		);
	}

	const chatterbox = new ChatterboxSDK({
		apiSecret: opts.apiSecret,
		appName: opts.appName,
		logFile: opts.fallbackQueueFilePath,
	});

	return pinoAbstractTransport(
		async function (source) {
			for await (const obj of source) {
				if (typeof obj.level === "number") {
					obj.level = PINO_LEVEL_LABELS[obj.level] || obj.level;
				}
				const success = await chatterbox.sendLog(obj);
				if (!success) {
					chatterbox.queueLog(obj);
				}
			}
		},
		{
			async close(err) {
				if (err) {
					console.error(
						"Chatterbox transport is closing due to an error:",
						err
					);
				}
				console.log("Chatterbox transport has closed.");
			},
		}
	);
}
