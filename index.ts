import "reflect-metadata";
import express, { NextFunction, Request, Response } from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
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

/** Length-safe, constant-time string comparison. */
const safeEqual = (a: string, b: string): boolean => {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/**
 * Guards the BullMQ dashboard with HTTP Basic auth.
 *
 * Queue job payloads include OTP codes (see the sendOTPEmail job), so this
 * route must never be publicly reachable. It fails closed: if credentials are
 * not configured, the dashboard is disabled entirely outside development.
 */
const bullBoardAuth = (req: Request, res: Response, next: NextFunction) => {
	const user = process.env.BULL_BOARD_USER;
	const password = process.env.BULL_BOARD_PASSWORD;

	if (!user || !password) {
		if (config.env === "development") return next();
		return res.status(404).json({ message: "No route found" });
	}

	const [scheme, encoded] = (req.headers.authorization || "").split(" ");
	if (scheme === "Basic" && encoded) {
		const [suppliedUser, suppliedPassword] = Buffer.from(encoded, "base64")
			.toString()
			.split(":");
		if (
			safeEqual(suppliedUser ?? "", user) &&
			safeEqual(suppliedPassword ?? "", password)
		) {
			return next();
		}
	}

	res.setHeader("WWW-Authenticate", 'Basic realm="Chatterbox queues"');
	return res.status(401).send("Authentication required");
};

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

	// Evaluate alert rules on a schedule. A fixed jobId keeps BullMQ from
	// stacking up a new repeatable job on every restart.
	if (config.env !== "test") {
		await queueServices.defaultQueueLib.addJob(
			"evaluateAlerts",
			{ meta: {}, worker: "evaluateAlerts" },
			{
				repeat: { every: Number(process.env.ALERT_INTERVAL_MS) || 60_000 },
				jobId: "alert-evaluator",
				removeOnComplete: 20,
				removeOnFail: 20,
			}
		);

		// Roll raw logs into hourly buckets so long-range charts stay fast and
		// history outlives the 30-day TTL on the log collection.
		await queueServices.defaultQueueLib.addJob(
			"rollupLogs",
			{ meta: {}, worker: "rollupLogs" },
			{
				repeat: { every: Number(process.env.ROLLUP_INTERVAL_MS) || 900_000 },
				jobId: "log-rollup",
				removeOnComplete: 20,
				removeOnFail: 20,
			}
		);
	}

	// Liveness probe. Declared before the HTTP logger so container healthchecks
	// don't flood the logs.
	app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

	// Queue dashboard — behind Basic auth (job payloads contain OTPs).
	app.use("/worker/admin", bullBoardAuth, serverAdapter.getRouter());
	app.use(logger.httpLoggerInstance);
	app.use(express.json());
	app.set("trust proxy", 1);
	app.use(
		session({
			secret: config.sessionSecret,
			// Don't rewrite/create sessions that weren't modified — avoids session
			// fixation and needless session-store writes for anonymous visitors.
			resave: false,
			saveUninitialized: false,
			// Only send over HTTPS in prod, Prevents client-side JS from reading the
			// cookie, SameSite=lax mitigates CSRF on state-changing requests, 24 hours.
			cookie: {
				secure: process.env.NODE_ENV === "production",
				httpOnly: true,
				sameSite: "lax",
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
	// Templates live in views/ alongside the static assets, so serving that
	// directory wholesale also exposed their source (/layout.pug, /email/otp.ejs).
	// Block template extensions before the static handler sees them.
	app.use((req, res, next) => {
		if (/\.(pug|ejs)$/i.test(req.path)) {
			return res.status(404).json({ message: "No route found" });
		}
		return next();
	});
	app.use(express.static(path.join(__dirname, "../views")));

	app.use("/", ViewController);
	// Rate limiting must run BEFORE the API routes, otherwise the controller
	// handles (and responds to) the request and the limiter never executes.
	app.use("/api", (req, res, next) => {
		if (config.env === "test") {
			next();
		} else {
			limiter(req, res, next);
		}
	});
	app.use("/api", APIController);

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
