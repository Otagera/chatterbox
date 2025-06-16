import "reflect-metadata";
import express from "express";
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
			secret: "keyboard cat",
			resave: true,
			saveUninitialized: true,
			cookie: { maxAge: 6000000 },
			store: MongoStore.create({
				mongoUrl: `${config.dbURL}/${config.dbName}`,
			}),
		})
	);
	app.use((req, res, next) => RequestContext.create(services.em, next));

	// Configuring body parser middleware
	app.use(bodyParser.urlencoded({ extended: false }));
	app.use(bodyParser.json());
	// Middleware to determine if the request is from a browser
	app.use((req, res, next) => {
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

	app.use((req, res) => res.status(404).json({ message: "No route found" }));

	services.server = app.listen(PORT, () => {
		logger.info(`Service started on port ${PORT}`, "STARTUP_EVENT");
	});
})();
