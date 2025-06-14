import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import {
	pino,
	LoggerOptions,
	Logger,
	SerializedResponse,
	SerializedRequest,
} from "pino";
import { pinoHttp } from "pino-http";
import { green, isColorSupported } from "colorette";
import { DateTime } from "luxon";
import ChatterboxSDK from "@chatterbox/chatterbox-sdk";

import { ChatterboxConfigType, ChatterboxKey } from "../interfaces/IUtil";

// const chatterbox = new ChatterboxSDK({
// 	apiSecret: process.env.CHATTERBOX_API_SECRET || "",
// 	appName: process.env.CHATTERBOX_APP_NAME || "",
// });

const config: ChatterboxConfigType = {
	appName: process.env.CHATTERBOX_APP_NAME || "",
};
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
	fatal(error: { name: string; stack: any }, message: string, context: any) {
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
		const targets: any = [
			{
				target: "@chatterbox/chatterbox-sdk/chatterboxTransport.mjs",
				options: {
					appName: this._config.appName,
					apiSecret: process.env.CHATTERBOX_API_SECRET,
					fallbackQueueFilePath: "chatterbox-queue.json",
				},
			},
		];

		if (this._config.enableConsoleLogs) {
			targets.push({
				target: "pino-pretty",
				options: {
					colorize: true,
					colorizeObjects: true,
					messageKey: this._config.messageKey,
					ignore: "pid,hostname,name",
					singleLine: process.env.NODE_ENV === "development",
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
			customSuccessMessage: (req: Request) => {
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
				err: () => false,
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
	appName: config.appName,
	level: "debug",
	messageKey: "key",
	enableConsoleLogs: true,
});

logger.info({ test: "info" }, "exampleTest");
setInterval(() => {
	console.log("Running....");
}, 2000);
