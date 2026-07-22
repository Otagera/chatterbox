/**
 * Chatterbox SDK — usage example
 * ------------------------------------------------------------------
 * Demonstrates how another application ships its logs to a running
 * Chatterbox server using the SDK's direct client.
 *
 * Prerequisites:
 *   1. A running Chatterbox server (see the project README).
 *   2. An application + API secret. Create one against the server:
 *        POST /api/users/login   { "email": "you@example.com" }
 *        POST /api/users/apps     { "email": "you@example.com", "appName": "my-service" }
 *      The second response contains `apiSecret` — that is your CHATTERBOX_API_SECRET.
 *   3. Copy `.env.example` to `.env` in this folder and fill in the CHATTERBOX_* values.
 *
 * Run:  node example.js
 * ------------------------------------------------------------------
 */
require("dotenv").config();
const { ChatterboxSDK } = require("./index");

const appName = process.env.CHATTERBOX_APP_NAME;
const apiSecret = process.env.CHATTERBOX_API_SECRET;

if (!appName || !apiSecret) {
	console.error(
		"[example] Missing CHATTERBOX_APP_NAME / CHATTERBOX_API_SECRET.\n" +
			"          Copy .env.example to .env and fill them in first."
	);
	process.exit(1);
}

// One SDK instance per application. It authenticates every request with your
// API secret and transparently queues + retries logs if the server is down.
const chatterbox = new ChatterboxSDK({ appName, apiSecret });

/**
 * Build a log entry matching the Chatterbox log schema.
 * Required: level, name, key, time, appName. Everything else is optional.
 * `data` is any JSON payload — the server encrypts it at rest.
 */
const buildLog = (level, key, data) => ({
	level, // "info" | "warn" | "error" | "debug" | "trace" | "fatal"
	name: appName, // logical source name
	key, // short event key, e.g. "USER_SIGNUP"
	time: Date.now(),
	data,
	appName,
});

async function main() {
	console.log(`[example] Sending logs to ${process.env.CHATTERBOX_API_URL} …`);

	// 1) Send a single log.
	const okSingle = await chatterbox.sendLog(
		buildLog("info", "USER_SIGNUP", { userId: 42, plan: "pro" })
	);
	console.log(`[example] single log sent: ${okSingle}`);

	// 2) Send several logs in one bulk request.
	const okBulk = await chatterbox.sendLogs([
		buildLog("warn", "RATE_LIMIT_NEAR", { ip: "203.0.113.5", remaining: 3 }),
		buildLog("error", "PAYMENT_FAILED", {
			orderId: "ord_123",
			reason: "card_declined",
		}),
	]);
	console.log(`[example] bulk logs sent: ${okBulk}`);

	// 3) Flush any queued (failed) logs and stop the retry timer before exiting.
	//    If the server was unreachable above, the logs are persisted to the local
	//    queue file and retried — nothing is lost.
	await chatterbox.close();
	console.log("[example] done.");
}

main().catch((err) => {
	console.error("[example] failed:", err);
	process.exit(1);
});
