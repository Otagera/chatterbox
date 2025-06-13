
const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  LOG_FILE: process.env.LOG_FILE || "logQueue.json",
  RETRY_DELAY_MS: process.env.RETRY_DELAY_MS || 10000,
  MAX_BULK_LOG: process.env.MAX_BULK_LOG || 10,
  LOGGING_API_URL: process.env.LOGGING_API_URL,
  BULK_LOGGING_API_URL: process.env.BULK_LOGGING_API_URL,
  CHATTERBOX_API_URL: process.env.CHATTERBOX_API_URL,
};