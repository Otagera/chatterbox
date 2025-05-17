import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const config = {
	dbURL: process.env.DB_URL || "mongodb://127.0.0.1:27017",
	dbName: process.env.DB_NAME || "chatterbox",
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
};

export default config;
