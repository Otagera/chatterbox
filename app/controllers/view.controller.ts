import { Request, Response } from "express";
import Router from "express-promise-router";

import { paginationState } from "../../index";
import { services } from "../db";
import { authMiddleware } from "../middlewares/auth.middleware";

import { AppKey, Log } from "../entities";
import { decryptObj, hashLogintoken, maskKey } from "../utils/security.util";
import {
	OTPService,
	apiAuthorizeService,
	authorizeService,
	createApplication,
	generateSaveAndSendOTP,
	loginService,
} from "./services";

import fs from "fs";
import path from "path";
import { ZodError } from "zod";

const svgPath = path.join(__dirname, "../../../views/assets/copy.svg");
const svgContent = fs.readFileSync(svgPath, "utf8");

const router = Router();

/**
 * Determines the CSS class for styling log levels.
 * @param {string} level - The log level string (e.g., "info", "error", "trace").
 * @returns {string} The corresponding CSS class.
 */
const getLevelStyle = (level: string): string => {
	switch (level) {
		case "info":
			return "text-success-emphasis";
		case "error":
			return "text-danger";
		case "trace":
			return "text-warning";
		default:
			return "text-info-emphasis";
	}
};

const getRecentLogs = async (appName: string, limit = 100) => {
	const logs = await services.logs.findByCursor(
		{ appName },
		{
			first: limit,
			orderBy: { createdAt: "desc" },
		}
	);

	paginationState.setCurrentCursor(logs.endCursor);
	paginationState.setHasNextPage(logs.hasNextPage);
	return logs.items.map((log) => {
		let levelStyle = getLevelStyle(log.level);
		return { ...log, id: log._id, levelStyle };
	});
};

type LogLevelConfigItem = {
	label: "Info" | "Warning" | "Error" | "Debug" | "Trace";
	color: string;
};

const LOG_LEVEL_CONFIG: Record<string, LogLevelConfigItem> = {
	info: { label: "Info", color: "rgba(54, 162, 235, 0.7)" },
	warning: { label: "Warning", color: "rgba(255, 159, 64, 0.7)" },
	error: { label: "Error", color: "rgba(255, 99, 132, 0.7)" },
	debug: { label: "Debug", color: "rgba(75, 192, 192, 0.7)" },
	trace: { label: "Trace", color: "rgba(100, 100, 255, 0.7)" },
	// Add other levels if needed
};

const KNOWN_LEVEL_KEYS = Object.keys(LOG_LEVEL_CONFIG);

type LevelKey = keyof typeof LOG_LEVEL_CONFIG; // "info" | "warning" | ...

type LogVolumeAggregate = {
	day: Date;
	level: LevelKey;
	logVolume: number;
};

type ChartDataset = {
	label: LogLevelConfigItem["label"] | string; // Allow specific level labels or general labels like "Error Rate (%)"
	data: number[];
	backgroundColor?: string | string[];
	borderColor?: string;
	tension?: number;
	borderWidth?: number;
	axis?: "x" | "y"; // For bar charts if needed
	fill?: boolean; // For line charts if needed
	hoverOffset?: number;
};

type ChartData = {
	labels: string[];
	datasets: ChartDataset[];
};

/**
 * Aggregates log volume per level per day for a given appName and number of past days.
 * Optimized for creating stacked bar/area charts or multi-line charts.
 * @param appName The name of the application.
 * @param days The number of past days to include in the aggregation.
 * @returns ChartData object with labels (dates) and datasets (one per log level).
 */
export const aggregateLogVolume = async (
	appName: string,
	days: number
): Promise<ChartData> => {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	startDate.setHours(0, 0, 0, 0);

	const pipeline = [
		{
			$match: {
				createdAt: { $gte: startDate },
				appName,
			},
		},
		{
			$group: {
				_id: {
					level: "$level",
					day: { $dateTrunc: { date: "$createdAt", unit: "day" } },
				},
				logVolume: { $count: {} },
			},
		},
		{
			$project: {
				_id: 0,
				day: "$_id.day",
				level: "$_id.level",
				logVolume: 1,
			},
		},
		{
			// Sort by day first, then by level to ensure consistent processing order
			// though the later processing logic handles unsorted data too.
			$sort: {
				day: 1,
				level: 1,
			},
		},
	];

	const logAggregates: LogVolumeAggregate[] = await services.orm.em.aggregate(
		Log,
		pipeline
	);

	// Key: YYYY-MM-DD date string
	// Value: Record<LevelKey, number> (e.g., { info: 10, error: 2 })
	const dailyLevelCounts = new Map<string, Record<LevelKey, number>>();

	// Populate dailyLevelCounts, ensuring all known levels are initialized for each day
	logAggregates.forEach((agg) => {
		const dateStr = agg.day.toISOString().split("T")[0];
		if (!dailyLevelCounts.has(dateStr)) {
			const initialCounts = {} as Record<LevelKey, number>;
			KNOWN_LEVEL_KEYS.forEach((levelKey) => {
				initialCounts[levelKey as LevelKey] = 0;
			});
			dailyLevelCounts.set(dateStr, initialCounts);
		}
		// Ensure the level from DB is one of the known keys before assigning
		if (KNOWN_LEVEL_KEYS.includes(agg.level)) {
			dailyLevelCounts.get(dateStr)![agg.level] = agg.logVolume;
		}
	});

	// Get sorted unique date labels
	const dateLabels = Array.from(dailyLevelCounts.keys()).sort();

	const datasets: ChartDataset[] = [];

	// Create a dataset for each known log level
	KNOWN_LEVEL_KEYS.forEach((levelKey) => {
		const config = LOG_LEVEL_CONFIG[levelKey as LevelKey];
		if (config) {
			datasets.push({
				label: config.label,
				data: dateLabels.map(
					(dateStr) =>
						dailyLevelCounts.get(dateStr)?.[levelKey as LevelKey] || 0
				),
				backgroundColor: config.color,
			});
		}
	});

	return {
		labels: dateLabels,
		datasets,
	};
};

/**
 * Aggregates total log volume per level for a given appName and number of past days.
 * Optimized for pie or doughnut charts.
 * @param appName The name of the application.
 * @param days The number of past days to include in the aggregation.
 * @returns ChartData object with labels (log levels) and one dataset.
 */
export const aggregateLogLevels = async (
	appName: string,
	days: number
): Promise<ChartData> => {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	startDate.setHours(0, 0, 0, 0);

	const pipeline = [
		{
			$match: {
				createdAt: { $gte: startDate },
				appName,
			},
		},
		{
			$group: {
				_id: "$level",
				logVolume: { $count: {} },
			},
		},
		{
			$project: {
				_id: 0,
				level: "$_id",
				logVolume: 1,
			},
		},
		{
			$sort: { level: 1 },
		},
	];

	type LogLevelAggregate = {
		level: LevelKey;
		logVolume: number;
	};

	const logAggregates: LogLevelAggregate[] = await services.orm.em.aggregate(
		Log,
		pipeline
	);

	const chartLabels: LogLevelConfigItem["label"][] = [];
	const chartDataValues: number[] = [];
	const backgroundColors: string[] = [];

	const levelDataMap = new Map<LevelKey, number>();
	logAggregates.forEach((agg) => {
		if (KNOWN_LEVEL_KEYS.includes(agg.level)) {
			levelDataMap.set(agg.level, agg.logVolume);
		}
	});

	KNOWN_LEVEL_KEYS.forEach((levelKey) => {
		const config = LOG_LEVEL_CONFIG[levelKey as LevelKey];
		const volume = levelDataMap.get(levelKey as LevelKey) || 0;

		// Only add to chart if there's data or you want to show all levels
		if (volume > 0) {
			chartLabels.push(config.label);
			chartDataValues.push(volume);
			backgroundColors.push(config.color);
		}
	});

	return {
		labels: chartLabels,
		datasets: [
			{
				label: "Log Levels",
				data: chartDataValues,
				backgroundColor: backgroundColors,
				hoverOffset: 4,
			},
		],
	};
};

/**
 * Aggregates top log keys by volume for a given appName, number of past days, and limit.
 * @param appName The name of the application.
 * @param days The number of past days to include.
 * @param limit The maximum number of top keys to return.
 * @returns ChartData object for a bar chart.
 */
export const aggregateTopKeys = async (
	appName: string,
	days: number,
	limit: number
): Promise<ChartData> => {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	startDate.setHours(0, 0, 0, 0);

	const pipeline = [
		{
			$match: {
				createdAt: { $gte: startDate },
				appName,
			},
		},
		{
			$group: {
				_id: "$key",
				logVolume: { $count: {} },
			},
		},
		{
			$project: {
				_id: 0,
				key: "$_id",
				logVolume: 1,
			},
		},
		{ $sort: { logVolume: -1 } },
		{ $limit: limit },
	];

	type TopKeyAggregate = {
		key: string;
		logVolume: number;
	};

	const logAggregates: TopKeyAggregate[] = await services.orm.em.aggregate(
		Log,
		pipeline
	);

	return {
		labels: logAggregates.map((agg) => agg.key),
		datasets: [
			{
				label: "Top Log Keys",
				data: logAggregates.map((agg) => agg.logVolume),
				// Horizontal bar chart
				axis: "y",
				backgroundColor: "rgba(75, 192, 192, 0.7)",
				borderColor: "rgba(75, 192, 192, 1)",
				borderWidth: 1,
			},
		],
	};
};

/**
 * Aggregates error rate per day for a given appName and number of past days.
 * @param appName The name of the application.
 * @param days The number of past days to include.
 * @returns ChartData object for a line chart.
 */
export const aggregateErrorRate = async (
	appName: string,
	days: number
): Promise<ChartData> => {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	startDate.setHours(0, 0, 0, 0);

	const pipeline = [
		{
			$match: {
				createdAt: { $gte: startDate },
				appName: appName,
			},
		},
		{
			$group: {
				_id: { day: { $dateTrunc: { date: "$createdAt", unit: "day" } } },
				totalLogs: { $sum: 1 },
				errorLogs: { $sum: { $cond: [{ $eq: ["$level", "error"] }, 1, 0] } },
			},
		},
		{
			$project: {
				_id: 0,
				day: "$_id.day",
				errorRate: {
					$cond: {
						if: { $eq: ["$totalLogs", 0] },
						then: 0,
						else: {
							$multiply: [{ $divide: ["$errorLogs", "$totalLogs"] }, 100],
						},
					},
				},
			},
		},
		{ $sort: { day: 1 } },
	];

	type ErrorRateAggregate = {
		day: Date;
		errorRate: number;
	};

	const logAggregates: ErrorRateAggregate[] = await services.orm.em.aggregate(
		Log,
		pipeline
	);

	return {
		labels: logAggregates.map((agg) => agg.day.toISOString().split("T")[0]),
		datasets: [
			{
				label: "Error Rate (%)",
				data: logAggregates.map((agg) => parseFloat(agg.errorRate.toFixed(2))),
				backgroundColor: "rgba(255, 99, 132, 0.5)",
				borderColor: "rgb(255, 99, 132)",
				tension: 0.1,
				borderWidth: 1,
				fill: true,
			},
		],
	};
};

/**
 * @route GET /
 * @description Renders the main page, displaying logs for the authenticated user's application.
 * Requires authentication.
 * @param {Request} req - Express request object. Expects `req.session` to contain `appName`, `user`, and `email`.
 * @param {Response} res - Express response object.
 * @returns {void} Renders the 'index' view with logs, appName, user, email, and masked API key.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
	try {
		const { appName, user, email } = req.session;

		const logs = await getRecentLogs(appName as string, 20);

		return res.render("index", {
			logs,
			appName,
			user: user,
			email,
			maskKey: maskKey(user as string),
		});
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Error loading dashboard: ${error}<p>`);
		}
	}
});

router.get(
	"/analytics",
	authMiddleware,
	async (req: Request, res: Response) => {
		try {
			const { appName, user, email } = req.session;

			const logs = await getRecentLogs(appName as string, 100);

			// 1. Log Volume Over Time (e.g., last 7 days)
			const logVolumeData = await aggregateLogVolume(appName as string, 7); // Returns { labels: [...], datasets: [...] }

			// 2. Log Levels Distribution (e.g., last 7 days)
			const logLevelData = await aggregateLogLevels(appName as string, 7); // Returns { labels: [...], datasets: [...] }

			// 3. Top Log Keys (e.g., last 7 days, top 10)
			const topKeysData = await aggregateTopKeys(appName as string, 7, 10); // Returns { labels: [...], datasets: [...] }

			// 4. Error Rate Over Time (e.g., last 7 days)
			const errorRateData = await aggregateErrorRate(appName as string, 7); // Returns { labels: [...], datasets: [...] }

			// 5. Average Response Time (Optional, if applicable)
			// const avgTimeData = await aggregateAvgTime(appName as string, 7); // Returns { labels: [...], datasets: [...] }

			return res.render("analytics", {
				logs,
				chartData: {
					logVolume: logVolumeData,
					logLevel: logLevelData,
					topKeys: topKeysData,
					errorRate: errorRateData,
					// avgTime: avgTimeData // Uncomment if used
				},
				appName,
				user: user,
				email,
				maskKey: maskKey(user as string),
			});
		} catch (error: any) {
			console.error("Error loading dashboard:", error);
			if (error instanceof ZodError) {
				return res.send(`<p>${error.errors[0].message}</p>`);
			} else if (error && error.message) {
				return res.send(`<p>${error.message}</p>`);
			} else {
				return res.send(`<p>Error loading dashboard: ${error}<p>`);
			}
		}
	}
);

/**
 * @route GET /login
 * @description Renders the login page.
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {void} Renders the 'login' view.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/login", async (req: Request, res: Response) => {
	try {
		return res.render("login");
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route GET /view/get-more-logs
 * @description Fetches and returns more logs for infinite scrolling (HTMX).
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing table rows of logs.
 * Sends an empty response if no more logs are available or an error message as HTML if an error occurs.
 */
router.get("/view/get-more-logs", async (req: Request, res: Response) => {
	if (!paginationState.getHasNextPage()) return res.send();

	try {
		const logs = await services.logs.findByCursor(
			{},
			{
				first: 20,
				after: paginationState.getCurrentCursor() as string,
				orderBy: { createdAt: "desc" },
			}
		);

		paginationState.setCurrentCursor(logs.endCursor);
		paginationState.setHasNextPage(logs.hasNextPage);

		let logsHTML = ``;

		logs.items.forEach((log) => {
			let levelStyle = getLevelStyle(log.level);

			const logHTML = `
          <tr>
            <td scope="row"> ${log.id}</td>
            <td> ${log.key} </td>

            <td hx-get=/view/get-log-data/${log.id} hx-target="this" role="button">
              <small class="text-muted">${log.createdAt}</small>
            </td>
            <td class=${levelStyle}> ${log.level} </td>
          </tr>
        `;
			logsHTML = logsHTML.concat(logHTML);
		});

		if (paginationState.getHasNextPage()) {
			logsHTML = logsHTML.concat(
				`<tr hx-get="/view/get-more-logs" hx-trigger="revealed" hx-swap="outerHTML swap:0.5s" hx-target="this">
					<td colspan="4" class="fs-1"> Loading more...</td>
				</tr>
				`
			);
		} else {
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1">END!!!</td></tr>`
			);
		}

		return res.send(logsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route GET /view/get-log-data/:id
 * @description Fetches and returns detailed data for a specific log entry (HTMX).
 * Requires authentication.
 * @param {Request} req - Express request object. Expects `req.params.id` for the log ID and `req.appName` from session/middleware.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing a table cell with formatted log data.
 * Sends an error message as HTML if the log is not found or another error occurs.
 */
router.get(
	"/view/get-log-data/:id",
	authMiddleware,
	async (req: Request, res: Response) => {
		const id = req.params.id;
		try {
			const log = await services.logs.findOneOrFail(id);
			if (!log) {
				throw new Error("Something went wrong!!!");
			}
			let logData = {};
			const {
				data: possibleData,
				name,
				context,
				traceId,
				request,
				response,
				timeTaken,
			} = log;
			let data = possibleData;
			if (typeof data === "string") {
				data = decryptObj(data, req.appName || "");
			}

			logData = {
				...data,
				name,
				context,
				traceId,
				request,
				response,
				timeTaken,
			};

			return res.send(
				`
          <td style="max-width: 400px;">
            <small class="text-muted"> ${log?.time}</small>
            <br>
            <pre style="
            font-size:10px;
            display: block;
            padding: 9.5px;
            margin: 0 0 10px;
            font-size: 13px;
            line-height: 1.42857143;
            color: #333;
            word-break: break-all;
            word-wrap: break-word;
            background-color: #f5f5f5;
            border: 1px solid #ccc;
            border-radius: 4px;
            overflow-wrap: break-word;
            overflow-x: auto;
            overflow-y: auto;
            "> ${JSON.stringify(logData, null, 4)} </pre>
          </td>
        `
			);
		} catch (error: any) {
			if (error instanceof ZodError) {
				return res.send(`<p>${error.errors[0].message}</p>`);
			} else if (error && error.message) {
				return res.send(`<p>${error.message}</p>`);
			} else {
				return res.send(`<p>Something went wrong!!!<p>`);
			}
		}
	}
);

/**
 * @route POST /view/search
 * @description Searches logs based on filters provided in the request body (HTMX).
 * @param {Request} req - Express request object. Expects filter criteria in `req.body` (startDate, endDate, level, key).
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing table rows of matching logs.
 * Sends an error message as HTML if an error occurs.
 */
router.post("/view/search", async (req: Request, res: Response) => {
	let filter: {
		level?: string;
		key?: string;
		time?: {
			$gte?: Date;
			$lt?: Date;
		};
	} = { time: {} };
	if ("startDate" in req.body && req.body.startDate.length) {
		if (filter.time) filter.time["$gte"] = new Date(req.body.startDate);
	}
	if ("endDate" in req.body && req.body.endDate.length) {
		if (filter.time) filter.time["$lt"] = new Date(req.body.endDate);
	}
	if ("level" in req.body && req.body.level.length) {
		filter.level = req.body.level;
	}
	if ("key" in req.body && req.body.key.length) {
		filter.key = req.body.key;
	}

	if (!Object.entries(filter.time as string).length) {
		delete filter.time;
	}
	try {
		const logs = await services.logs.findByCursor(filter, {
			first: 100,
			// after: paginationState.getCurrentCursor() as string, // Commented out as search might need to reset pagination
			orderBy: { createdAt: "desc" },
		});

		paginationState.setCurrentCursor(logs.endCursor);
		paginationState.setHasNextPage(logs.hasNextPage);

		let logsHTML = ``;
		logs.items.forEach((log) => {
			let levelStyle = getLevelStyle(log.level);

			const logHTML = `
          <tr>
            <td scope="row"> ${log.id}</td>
            <td> ${log.key} </td>

            <td hx-get=/view/get-log-data/${log.id} hx-target="this" role="button">
              <small class="text-muted">${log.createdAt}</small>
            </td>
            <td class=${levelStyle}> ${log.level} </td>
          </tr>
        `;
			logsHTML = logsHTML.concat(logHTML);
		});
		if (logs.items.length === 0) {
			// Corrected: was logs.length
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1 text-center">Empty</td></tr>`
			);
		} else if (!paginationState.getHasNextPage())
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1 text-center">END!!!</td></tr>`
			);

		return res.send(logsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * Generates HTML for a list of applications.
 * @param {AppKey[]} apps - An array of AppKey entities.
 * @param {string} loginToken - The user's login token.
 * @param {string} email - The user's email.
 * @returns {string} An HTML string representing the list of applications.
 */
const getApps = (apps: AppKey[], loginToken: string, email: string): string => {
	let appHTML = "";
	apps.forEach((app, index) => {
		appHTML += `
      <li class="d-flex justify-content-between">
      <p>App: <span
        hx-trigger="click"
        hx-target="#appsList"
        hx-swap="outerHTML"
        hx-get="/view/apps?appName=${app.appName}&loginToken=${loginToken}"
        class="text-primary text-decoration-underline"
        style="cursor:pointer">
          ${app.appName}
        </span></p>
        <div id="app-delete-box-${index}">
          <p
            hx-trigger="click"
            hx-target="#app-delete-box-${index}"
            hx-swap="innerHTML"
            hx-get="/view/apps/delete-confirmation?appName=${app.appName}&loginToken=${loginToken}&email=${email}&appIndex=${index}"
            class="text-primary"
            style="cursor:pointer">
            Delete
          </p>
        </div>
      </li>
    `;
	});
	return appHTML;
};

/**
 * @route POST /view/login
 * @description Handles user login. Expects email in `req.body`.
 * On successful login, it generates a list of user's applications or an option to add a new one.
 * Sets `req.session.email`.
 * @param {Request} req - Express request object, expects `req.body` with user credentials (e.g., email).
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing the list of apps or an add new app link.
 * Sends an error message as HTML if login fails or another error occurs.
 */
router.post("/view/login", async (req: Request, res: Response) => {
	try {
		const { email, existingApps, loginToken } = await loginService(req.body);

		const appsHTML = `
      <div id="appsList">
        <ol>
          ${getApps(existingApps, loginToken, email)}
        </ol>
        <p
            hx-trigger="click"
            hx-target="#appsList"
            hx-swap="outerHTML"
            hx-get="/view/apps?newEmail=${email}&loginToken=${loginToken}"
            class="text-primary text-decoration-underline"
            style="cursor:pointer">
              Add new Application
            </p>
      </div>
    `;

		req.session.email = email;
		return res.send(appsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`
			<form class="mb-3" hx-post="/view/login" hx-swap="outerHTML"><input class="form-control mb-3" type="email" placeholder="Email" name="email">
				<button class="btn btn-primary" type="submit">Login</button>
			</form>
			<p>${error.errors[0].message}</p>
			`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route POST /view/logout
 * @description Handles user logout by destroying the session.
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an empty response with an 'HX-Redirect' header to '/'.
 * Sends an error message as HTML if an error occurs during session destruction.
 */
router.post("/view/logout", async (req: Request, res: Response) => {
	try {
		if (req.session) {
			req.session.destroy((err: any) => {
				if (err) {
					throw err;
				}
			});
		}
		res.setHeader("HX-Redirect", "/");
		res.send();
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * Generates an HTML form for OTP verification for a specific app.
 * @param {string} appName - The name of the application.
 * @param {string} loginToken - The user's login token.
 * @returns {Promise<string>} A promise that resolves to an HTML string for the OTP form.
 * @throws {Error} If the user or app is not found, or if login token is invalid.
 */
const getViewApps = async (
	appName: string,
	loginToken: string
): Promise<string> => {
	const app = await services.appKeys.findOne({
		appName: appName as string,
	});

	if (!app) {
		throw new Error("App not found.");
	}
	const user = await services.users.findOne({
		id: app.user.id,
		loginToken: hashLogintoken(loginToken as string),
	});
	if (user && app) {
		// Ensure user and app are found
		await generateSaveAndSendOTP(user);

		const logHTML = `
    <form hx-post="/view/otp?appName=${appName}" hx-boost="true" hx-swap="innerHTML" hx-target="#otpErrorMsg">
      <h3>${user.email}</h3>
      <input type="email" placeholder="Email" name="email" class="d-none form-control mb-3" value="${user.email}"/>
      <input type="number" placeholder="OTP" name="otp" class="form-control mb-3" />
      <button type="submit" class="btn btn-primary"> Login </button>
    </form>
		<p id="otpErrorMsg"></p>
  `;
		return logHTML;
	}
	throw new Error("Login failed, please try again. User or App not found.");
};

/**
 * @route GET /view/apps
 * @description Handles viewing a specific app (requires OTP) or creating a new app form.
 * Query parameters determine the action:
 * - `appName` and `loginToken`: Shows OTP form for the app.
 * - `newEmail` and `loginToken`: Shows form to create a new app for the user.
 * @param {Request} req - Express request object. Expects query parameters `appName`, `newEmail`, `loginToken`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML content for either OTP form or new app form.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/view/apps", async (req: Request, res: Response) => {
	try {
		const { appName, newEmail, loginToken } = req.query;
		if (appName && loginToken) {
			const appsHTML = await getViewApps(
				appName as string,
				loginToken as string
			);
			return res.send(appsHTML);
		} else if (newEmail && loginToken) {
			const user = await services.users.findOne({
				email: newEmail as string,
				loginToken: hashLogintoken(loginToken as string),
			});

			if (user) {
				const logHTML = `
        <form hx-post="/view/apps?loginToken=${loginToken}" hx-boost="true">
          <h3>Create New App</h3>
          <h3>${user?.email}</h3>
          <input type="email" placeholder="Email" name="email" class="d-none form-control mb-3" value="${user?.email}" />
          <input type="text" placeholder="App Name" name="appName" class="form-control mb-3" />
          <input type="number" placeholder="Expires (In seconds)" name="expires" class="d-none form-control mb-3" value="1" />
          <button type="submit" class="btn btn-primary"> Create App </button>
        </form>
      `;
				return res.send(logHTML);
			}
			throw new Error("User not found for creating a new app.");
		} else {
			throw new Error("Invalid parameters for /view/apps.");
		}
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route POST /view/apps
 * @description Handles creation of a new application.
 * Expects `loginToken` in query and app details (email, appName) in `req.body`.
 * After creating the app, it shows the OTP form for the newly created app.
 * @param {Request} req - Express request object. Query: `loginToken`. Body: `email`, `appName`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML content for the OTP form of the newly created app.
 * Sends an error message as HTML if an error occurs.
 */
router.post("/view/apps", async (req: Request, res: Response) => {
	try {
		const { loginToken } = req.query;
		if (!loginToken) throw new Error("Login token is required.");

		const { appName } = await createApplication(req.body);

		const appsHTML = await getViewApps(appName as string, loginToken as string);
		return res.send(appsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route GET /view/apps/delete-confirmation
 * @description Provides confirmation buttons (Cancel/Delete) for deleting an application (HTMX).
 * @param {Request} req - Express request object. Expects query parameters: `appName`, `loginToken`, `email`, `appIndex`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML with "Cancel" and "Delete" options.
 * Sends an error message as HTML if an error occurs.
 */
router.get(
	"/view/apps/delete-confirmation",
	async (req: Request, res: Response) => {
		try {
			const { appName, loginToken, email, appIndex } = req.query;
			if (!appName || !loginToken || !email || appIndex === undefined) {
				throw new Error("Missing parameters for delete confirmation.");
			}
			const logHTML = `
        <div class="d-flex justify-content-between">
          <p
            hx-trigger="click"
            hx-target="#app-delete-box-${appIndex}"
            hx-swap="innerHTML"
            hx-get="/view/apps/delete-cancel?appName=${appName}&loginToken=${loginToken}&email=${email}&appIndex=${appIndex}"
            class="text-primary"
            style="cursor:pointer; margin-right: 5px;">
              Cancel
          </p>
          <p
            hx-trigger="click"
            hx-target="#appsList"
            hx-swap="outerHTML"
            hx-delete="/view/apps?appName=${appName}&loginToken=${loginToken}&email=${email}&appIndex=${appIndex}"
            class="text-primary"
            style="cursor:pointer; margin-left: 5px;">
              Delete
          </p>
        </div>
      `;
			return res.send(logHTML);
		} catch (error: any) {
			if (error instanceof ZodError) {
				return res.send(`<p>${error.errors[0].message}</p>`);
			} else if (error && error.message) {
				return res.send(`<p>${error.message}</p>`);
			} else {
				return res.send(`<p>Something went wrong!!!<p>`);
			}
		}
	}
);

/**
 * @route GET /view/apps/delete-cancel
 * @description Reverts the delete confirmation UI to the initial "Delete" link (HTMX).
 * @param {Request} req - Express request object. Expects query parameters: `appName`, `loginToken`, `email`, `appIndex`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML for the "Delete" link.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/view/apps/delete-cancel", async (req: Request, res: Response) => {
	try {
		const { appName, loginToken, email, appIndex } = req.query;
		if (!appName || !loginToken || !email || appIndex === undefined) {
			throw new Error("Missing parameters for delete cancellation.");
		}
		const logHTML = `
      <p
        hx-trigger="click"
        hx-target="#app-delete-box-${appIndex}"
        hx-swap="outerHTML"
        hx-get="/view/apps/delete-confirmation?appName=${appName}&loginToken=${loginToken}&email=${email}&appIndex=${appIndex}"
        class="text-primary"
        style="cursor:pointer">
        Delete
      </p>
      `;
		return res.send(logHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route DELETE /view/apps
 * @description Deletes a specified application.
 * Expects query parameters `appName`, `loginToken`, `email`.
 * After deletion, it re-fetches and sends the updated list of applications.
 * @param {Request} req - Express request object. Query: `appName`, `loginToken`, `email`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing the updated list of applications.
 * Sends an error message as HTML if an error occurs (e.g., invalid user, app not found).
 */
router.delete("/view/apps", async (req: Request, res: Response) => {
	try {
		const { appName, loginToken, email } = req.query;
		if (!appName || !loginToken || !email) {
			throw new Error("Missing parameters for deleting an app.");
		}

		let user = await services.users.findOne({
			email: email as string,
			loginToken: hashLogintoken(loginToken as string),
		});
		if (!user) {
			throw new Error("Invalid User or unauthorized.");
		}

		let appKeyEntry = await services.appKeys.findOne({
			appName: appName as string,
			user: user,
		});

		if (appKeyEntry) {
			await services.em.removeAndFlush(appKeyEntry);
		} else {
			throw new Error("App not found or does not belong to this user.");
		}

		let existingApps = await services.appKeys.find({ user });
		const appsHTML = `
    <div id="appsList">
      <ol>
        ${getApps(existingApps, loginToken as string, email as string)}
      </ol>
      <p
          hx-trigger="click"
          hx-target="#appsList"
          hx-swap="outerHTML"
          hx-get="/view/apps?newEmail=${user.email}&loginToken=${loginToken}"
          class="text-primary text-decoration-underline"
          style="cursor:pointer">
            Add new Application
          </p>
    </div>
  `;

		return res.send(appsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route POST /view/otp
 * @description Verifies the OTP provided by the user.
 * If OTP is valid, it authorizes the application for the session.
 * Sets `req.session.user` (apiSecret) and `req.session.appName`.
 * @param {Request} req - Express request object. Expects `req.body` with OTP and `req.query.appName`. `req.session.email` should be set.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an empty response with 'HX-Redirect' header to '/' on success.
 * Sends an HTML form to re-enter email for login if OTP verification fails.
 */
router.post("/view/otp", async (req: Request, res: Response) => {
	try {
		if (!req.session.email) {
			throw new Error("Session email not found. Please login again.");
		}
		await OTPService({ ...req.body, email: req.session.email });

		const { appName, token } = await authorizeService({
			email: req.session.email,
			appName: req.query.appName as string,
		});

		req.session.user = token;
		req.session.appName = appName;

		res.setHeader("HX-Redirect", "/");
		res.send();
	} catch (error: any) {
		let errorMessage = "Please login again";
		if (error && error.message) {
			errorMessage = error.message;
		}
		return res.send(`
			${errorMessage}
		`);
	}
});

/**
 * @route GET /view/authorize
 * @description Retrieves and displays the masked API secret key for the current session's application.
 * This is typically used to show the user their key after successful authentication.
 * @param {Request} req - Express request object. Expects `req.session` to contain `email` and `appName`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML displaying the masked API secret key and a copy icon.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/view/authorize", async (req: Request, res: Response) => {
	try {
		const { email, appName } = req.session;
		if (!email || !appName) {
			throw new Error("User session not found or app not selected.");
		}
		const { apiSecret } = await apiAuthorizeService({ email, appName });
		req.session.user = apiSecret;
		return res.send(`
			<p> Secret Key: </p>
       <span id="apiKey"> ${maskKey(apiSecret)}  </span>
       <div
          style="
            width: 20px;
            height: 20px;
            padding-left: 10px;
            cursor:pointer;
            display: inline-block; /* Added for better layout with span */
            vertical-align: middle; /* Added for better layout with span */
          "
          id="copyIconContainer"
          title="Copy API Key"
          onclick="navigator.clipboard.writeText('${apiSecret}')"> ${svgContent}
      </div>
    `);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

export const ViewController = router;
