const { randomUUID } = require("node:crypto");
const { pino, transport, multistream } = require("pino");
const pinoPretty = require("pino-pretty");
const { pinoHttp } = require("pino-http");
const { green, isColorSupported } = require("colorette");
const { DateTime } = require("luxon");

const ChatterboxSDK = require("./index");

const chatterbox = new ChatterboxSDK({
	apiSecret: process.env.CHATTERBOX_API_SECRET,
	appName: process.env.CHATTERBOX_APP_NAME,
});

const config = {
	app_name: process.env.CHATTERBOX_APP_NAME,
};
class PinoLogger {
	httpLoggerInstance;
	_config;

	constructor(_config) {
		this._config = _config;
		const pinoLogger = pino(this._getPinoOptions(), this._getLogDestination());
		this.httpLoggerInstance = pinoHttp(this._getPinoHttpOptions(pinoLogger));
	}

	log(message) {
		// console.log('🌶️', message);
		// console.log('🎁', green(message));
		this.trace({ message: green(message), context: "log" });
	}
	info(data, key) {
		this.httpLoggerInstance.logger.info({ data }, key);
	}
	warn(data, key) {
		this.httpLoggerInstance.logger.warn({ data }, key);
	}
	trace(data, key) {
		// console.log('🍅--> ', obj, key, '**', context);
		this.httpLoggerInstance.logger.trace({ data }, key);
	}
	fatal(error, message, context) {
		this.httpLoggerInstance.logger.fatal(
			{
				context: [context, this._config.appName].find(Boolean),
				type: error.name,
				formatedTimestamp: `${this._getDateFormat()}`,
				application: this._config.appName,
				stack: error.stack,
			},
			message
		);
	}
	error(context, key) {
		this.httpLoggerInstance.logger.error({ context }, key);
	}

	_getDateFormat(date = new Date(), format = "dd-MM-yyyy HH:mm:ss") {
		return DateTime.fromJSDate(date).setZone("system").toFormat(format);
	}
	_getPinoOptions() {
		return {
			name: this._config.appName,
			level: this._config.level,
			formatters: {
				level(label) {
					return { level: label };
				},
			},
			base: undefined,
			messageKey: this._config.messageKey,
			errorKey: "error",
		};
	}

	_getPinoConfig() {
		return {
			colorize: isColorSupported,
			levelFirst: true,
			ignore: "pid,hostname",
			quietReqLogger: true,
			messageFormat: (log, messageKey) => {
				const message = log[String(messageKey)];
				if (this._config.appName) {
					return `[${this._config.appName}] ${message}`;
				}

				return message;
			},
			customPrettifiers: {
				time: () => {
					return `[${this._getDateFormat()}]`;
				},
			},
		};
	}

	_getLogDestination() {
		const streams = [chatterbox.getCustomStream()];

		if (this._config.enableConsoleLogs) {
			streams.push({
				level: "trace",
				stream: pinoPretty({
					colorize: true,
					colorizeObjects: true,
					messageKey: this._config.messageKey,
					ignore: "pid,hostname,name",
					singleLine: process.env.NODE_ENV === "development",
					translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
					messageFormat: (log, messageKey) => {
						const message = log[String(messageKey)];

						return `[${this._config.appName}] ${message}`;
					},
					customColors: {
						trace: "green",
						info: "green",
						warn: "yellow",
						trace: "gray",
						fatal: "red",
					},
				}),
			});
		}
		console.log("streams", streams);

		return multistream(streams);
	}

	_getPinoHttpOptions(logger) {
		return {
			logger,
			quietReqLogger: true,
			genReqId: function () {
				return randomUUID();
			},
			customAttributeKeys: {
				req: "request",
				res: "response",
				err: "error",
				responseTime: "timeTaken",
				reqId: "traceId",
			},
			customReceivedMessage: (req) => {
				return `REQUEST-INITIATED-${req.id}`;
			},
			customSuccessMessage: (req) => {
				return `REQUEST-COMPLETE-${req.id}`;
			},
			customErrorMessage: (req) => {
				return `REQUEST-FAILED-${req.id}`;
			},
			customReceivedObject: (req) => {
				return {
					request: {
						id: req.id,
						method: req.method,
						url: req.url,
						query: req.query,
						params: req.params,
						body: req.body,
					},
				};
			},
			serializers: {
				err: () => false,
				req: (req) => {
					return process.env.NODE_ENV === "development"
						? `${req.method} ${req.url}`
						: req;
				},
				res: (res) =>
					process.env.NODE_ENV === "development"
						? `${res.statusCode} ${res.headers["content-type"]}`
						: res,
			},
			customLogLevel: (req, res) => {
				if (res.statusCode >= 400) {
					return "error";
				}

				if (res.statusCode >= 300 && res.statusCode < 400) {
					return "silent";
				}

				return "info";
			},
			redact: {
				censor: "********",
				paths: [
					"request.body.password",
					"response.headers",
					"request.headers",
					"request.remoteAddress",
					"request.remotePort",
				],
			},
		};
	}
}

const logger = new PinoLogger({
	appName: config.app_name,
	level: "debug",
	messageKey: "key",
	enableConsoleLogs: true,
});

logger.info("info", "example-test");
