import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const config = {
	env: process.env.NODE_ENV || "development",
	sessionSecret: String(process.env.SESSION_SECRET),
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
	mailgun: {
		apiKey: process.env.MAILGUN_API_KEY || "",
		domain: process.env.MAILGUN_DOMAIN || "",
		sender: process.env.MAILGUN_SENDER,
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
