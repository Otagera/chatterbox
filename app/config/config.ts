import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

/**
 * Reads a required secret from the environment. In production a missing value
 * is fatal (fail fast) rather than silently falling back to a predictable
 * default; outside production we allow a clearly-insecure dev fallback so the
 * app still boots for local development and tests.
 */
const requireSecret = (name: string, devFallback: string): string => {
	const value = process.env[name];
	if (value && value.length > 0) {
		return value;
	}
	if (isProduction) {
		throw new Error(`Environment variable ${name} is required in production`);
	}
	return devFallback;
};

const config = {
	env,
	sessionSecret: requireSecret(
		"SESSION_SECRET",
		"chatterbox-insecure-dev-session-secret"
	),
	// Master key used to derive per-application encryption keys for log data.
	encryptionKey: requireSecret(
		"ENCRYPTION_KEY",
		"chatterbox-insecure-dev-encryption-key"
	),
	// Server-side pepper mixed into token/OTP hashes. Empty by default so that
	// existing hashes remain valid when unset; set HASH_PEPPER to strengthen.
	hashPepper: process.env.HASH_PEPPER || "",
	dbURL: process.env.DB_URL,
	dbName: process.env.DB_NAME,
	apiURL: "http://localhost",
	baseApiURL: "http://localhost",
	port: process.env.PORT || 3005,
	workerPort: process.env.WORKER_PORT || 3805,
	redis: {
		port: process.env.REDIS_PORT,
		host: process.env.REDIS_HOSTNAME,
		username: process.env.REDIS_USERNAME || "default",
		password: process.env.REDIS_PASSWORD || "",
		url: process.env.REDIS_URL || "",
	},
	resend: {
		apiKey: process.env.RESEND_API_KEY || "",
		sender: process.env.RESEND_SENDER || "",
	},
	processEmails: process.env.PROCESS_EMAILS || false,

	// chatterbox
	chatterbox: {
		logFile: process.env.LOG_FILE || "logQueue.json",
		retryDelayMS: Number(process.env.RETRY_DELAY_MS) || 10000,
		maxBilkLog: Number(process.env.MAX_BULK_LOG) || 10,
		APIUrl: process.env.CHATTERBOX_API_URL,
		loggingApiUrl: process.env.LOGGING_API_URL,
		bulkLoggingApiUrl: process.env.BULK_LOGGING_API_URL,
		appName: process.env.CHATTERBOX_APP_NAME || "chatterbox",
		APISecret: process.env.CHATTERBOX_API_SECRET,
	},
};

export default config;
