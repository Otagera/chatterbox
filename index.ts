import "reflect-metadata";
import express, { NextFunction, Request, Response } from "express";
import bodyParser from "body-parser";
import path from "path";
import dotenv from "dotenv";
import { RequestContext } from "@mikro-orm/mongodb";
import session from "express-session";
import MongoStore from "connect-mongo";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { ViewController, APIController } from "./app/controllers";
import { initORM, initORMOption } from "./app/config/db";
import config from "./app/config/config";
import QueueWorkersHandler from "./app/queue/queueWorkers.handler";
import constants from "./app/config/constants";
import { queueServices } from "./app/queue/queue.service";
import logger from "./app/utils/logger.util";
import limiter from "./app/utils/rateLimiter.util";

dotenv.config();
const app = express();
const PORT = config.port;

class PaginationState {
	private currentCursor!: string | null;
	private hasNextPage!: boolean;

	constructor() {}
	setCurrentCursor = (currentCursor: string | null) =>
		(this.currentCursor = currentCursor);
	setHasNextPage = (hasNextPage: boolean) => (this.hasNextPage = hasNextPage);
	getCurrentCursor = () => this.currentCursor;
	getHasNextPage = () => this.hasNextPage;
}
export const paginationState = new PaginationState();

export const init = (async () => {
	const services = await initORM(initORMOption);

	// For dashboard to virtually see queues and jobs
	const serverAdapter = new ExpressAdapter();
	serverAdapter.setBasePath("/worker/admin");
	createBullBoard({
		queues: [
			new BullMQAdapter(queueServices.defaultQueueLib.getQueue()),
			new BullMQAdapter(queueServices.emailQueueLib.getQueue()),
		],
		serverAdapter: serverAdapter,
	});

	// Starting the workers handlers
	new QueueWorkersHandler(constants.BULL_QUEUE_NAMES.DEFAULT);
	new QueueWorkersHandler(constants.BULL_QUEUE_NAMES.EMAIL);

	// To make sure /worker/admin points to the bull queue dashboard
	app.use("/worker/admin", serverAdapter.getRouter());
	app.use(logger.httpLoggerInstance);
	app.use(express.json());
	app.use(
		session({
			secret: config.sessionSecret,
			resave: true,
			saveUninitialized: true,
			// Only send over HTTPS in prod, Prevents client-side JS from reading the cookie & 24 hours
			cookie: {
				// secure: process.env.NODE_ENV === "production",
				httpOnly: true,
				maxAge: 24 * 60 * 60 * 1000,
			},
			store: MongoStore.create({
				mongoUrl: `${config.dbURL}/${config.dbName}`,
			}),
		})
	);
	app.use((_req, _res, next) => RequestContext.create(services.em, next));

	app.use(bodyParser.urlencoded({ extended: false }));
	app.use(bodyParser.json());
	// Middleware to determine if the request is from a browser
	app.use((req, _res, next) => {
		const userAgent = req.get("User-Agent") || "";
		const acceptHeader = req.get("Accept") || "";
		const origin = req.get("Origin") || null;

		// Use multiple indicators to determine if it's a browser
		if (
			/mozilla|chrome|safari/i.test(userAgent) && // User-Agent suggests a browser
			(acceptHeader.includes("text/html") || origin) // Accept or Origin suggests a browser
		) {
			req.isBrowser = true;
		} else {
			req.isBrowser = false;
		}
		next();
	});

	app.set("views", path.join(__dirname, "../views"));
	app.locals.basedir = path.join(__dirname, "views");
	app.set("view engine", "pug");
	app.use(express.static(path.join(__dirname, "../views")));

	app.use("/", ViewController);
	app.use("/api", APIController);
	app.use("/api", (req, res, next) => {
		if (config.env === "test") {
			next();
		} else {
			limiter(req, res, next);
		}
	});

	app.use((_req, res) => res.status(404).json({ message: "No route found" }));
	app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
		logger.fatal(err, "UNHANDLED-APPLICATION-ERROR");

		const status = err.statusCode || 500;
		const message =
			config.env === "production"
				? "An unexpected error occurred."
				: err.message;

		res.status(status).json({ status: "error", message });
	});

	services.server = app.listen(PORT, () => {
		logger.info(`Service started on port ${PORT}`, "STARTUP-EVENT");
	});
})();
