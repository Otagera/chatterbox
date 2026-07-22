import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import {
	pino,
	stdSerializers,
	LoggerOptions,
	Logger,
	SerializedResponse,
	SerializedRequest,
} from "pino";
import { pinoHttp } from "pino-http";
import { green, isColorSupported } from "colorette";
import { DateTime } from "luxon";

import { ChatterboxConfigType, ChatterboxKey } from "../interfaces/IUtil";
import config from "../config/config";

// NOTE: Chatterbox does not log to itself. The Chatterbox SDK (see ./sdk) is for
// *other* applications to ship their logs here; this server just writes its own
// logs to the console via pino-pretty.

class PinoLogger {
	httpLoggerInstance;
	_config;

	constructor(_config: ChatterboxConfigType) {
		this._config = _config;
		const pinoLogger = pino(this._getPinoOptions());
		this.httpLoggerInstance = pinoHttp(this._getPinoHttpOptions(pinoLogger));
	}

	log(message: string) {
		// console.log('🌶️', message);
		// console.log('🎁', green(message));
		this.trace({ message: green(message), context: "log" });
	}
	info(data: {}, key: ChatterboxKey) {
		this.httpLoggerInstance.logger.info({ data }, key);
	}
	warn(data: {}, key: ChatterboxKey) {
		this.httpLoggerInstance.logger.warn({ data }, key);
	}
	trace(data: {}, key?: ChatterboxKey) {
		// console.log('🍅--> ', obj, key, '**', context);
		this.httpLoggerInstance.logger.trace({ data }, key);
	}
	fatal(error: { name: string; stack: any }, message: string, context?: any) {
		this.httpLoggerInstance.logger.fatal(
			{
				context: [context, this._config.appName].find(Boolean),
				type: error.name,
				formattedTimestamp: `${this._getDateFormat()}`,
				application: this._config.appName,
				stack: error.stack,
			},
			message
		);
	}
	error(context: any, key?: ChatterboxKey) {
		this.httpLoggerInstance.logger.error({ context }, key);
	}

	_getDateFormat(date = new Date(), format = "dd-MM-yyyy HH:mm:ss") {
		return DateTime.fromJSDate(date).setZone("system").toFormat(format);
	}

	_getPinoOptions(): LoggerOptions {
		const transportConfig = this._getLogDestination();

		return {
			name: this._config.appName,
			level: this._config.level,
			base: undefined,
			messageKey: this._config.messageKey,
			errorKey: "error",
			transport: transportConfig,
		};
	}

	_getPinoConfig() {
		return {
			colorize: isColorSupported,
			levelFirst: true,
			ignore: "pid,hostname",
			quietReqLogger: true,
			messageFormat: (log: Record<string, any>, messageKey: string) => {
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
		// Chatterbox writes its own logs to the console only — it is not a client
		// of its own logging API.
		const targets: any = [];

		if (this._config.enableConsoleLogs) {
			targets.push({
				target: "pino-pretty",
				options: {
					colorize: true,
					colorizeObjects: true,
					messageKey: this._config.messageKey,
					ignore: "pid,hostname,name",
					singleLine: config.env === "development",
					translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
					customColors: {
						info: "green",
						warn: "yellow",
						trace: "gray",
						fatal: "red",
					},
				},
			});
		}

		return {
			targets: targets,
		};
	}

	_getPinoHttpOptions(logger: Logger) {
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
			customReceivedMessage: (req: Request) => {
				return `REQUEST-INITIATED-${req.id}`;
			},
			customSuccessMessage: (req: Request, res: Response) => {
				if (res.statusCode >= 400) {
					return `REQUEST-FAILED-${req.id}`;
				}
				return `REQUEST-COMPLETE-${req.id}`;
			},
			customErrorMessage: (req: Request) => {
				return `REQUEST-FAILED-${req.id}`;
			},
			customReceivedObject: (req: Request) => {
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
				err: stdSerializers.err,
				req: (req: SerializedRequest) => {
					return process.env.NODE_ENV === "development"
						? `${req.method} ${req.url}`
						: req;
				},
				res: (res: SerializedResponse) =>
					process.env.NODE_ENV === "development"
						? `${res.statusCode} ${res.headers["content-type"]}`
						: res,
			},
			customLogLevel: (_req: Request, res: Response) => {
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
	appName: config.chatterbox.appName,
	level: "debug",
	messageKey: "key",
	enableConsoleLogs: true,
});

export default logger;
