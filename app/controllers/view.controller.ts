import { Request, Response } from "express";
import Router from "express-promise-router";

import { paginationState } from "../../index";
import { services } from "../db";
import { authMiddleware } from "../middlewares/auth.middleware";

import { AppKey, Log } from "../entities";
import { decryptObj, hashLogintoken, maskKey } from "../utils/security.util";
import {
	OTPService,
	authorizeService,
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

const aggregateLogVolume = async (appName: string, days: number) => {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	// Optional: Set time to the beginning of that day if needed
	// startDate.setHours(0, 0, 0, 0);

	const pipeline = [
		{
			$match: {
				createdAt: {
					$gte: startDate, // $gte selects documents where createdAt is greater than or equal to startDate
					// You could add an $lt: new Date() if you want to exclude future dates,
					// but usually not necessary if data ingestion is correct.
				},
				appName,
			},
		},
		{
			$group: {
				_id: {
					// Compound group key
					level: "$level",
					day: {
						// Extract the date part (YYYY-MM-DD) from createdAt
						// $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
						// Alternative using $dateTrunc (MongoDB 5.0+)
						$dateTrunc: { date: "$createdAt", unit: "day" },
					},
				},
				logVolume: { $count: {} }, // Accumulator: count documents in each group
			},
		},
		{
			// Rename _id field to level for better readability
			$project: {
				_id: 0, // Exclude the default _id field
				day: "$_id.day", // Extract day from the compound _id
				level: "$_id.level", // Extract level from the compound _id
				logVolume: 1, // Include the calculated logVolume
			},
		},
		{
			$sort: {
				day: 1,
				level: 1,
			},
		},
	];
	type label = "Info" | "Warning" | "Error" | "Debug";
	type LogAggregatorType = {
		logVolume: number;
		day: Date;
		level: "info" | "warning" | "error" | "debug";
	};
	type DatasetType = {
		label: label;
		data: number[];
		backgroundColor: string;
	};
	const logAggregates: LogAggregatorType[] = await services.orm.em.aggregate(
		Log,
		pipeline
	);
	const dateLabels: string[] = [];
	const infoDataset: DatasetType = {
		label: "Info",
		data: [],
		backgroundColor: "rgba(54, 162, 235, 0.7)",
	};
	const warningDataset: DatasetType = {
		label: "Warning",
		data: [],
		backgroundColor: "rgba(255, 159, 64, 0.7)",
	};
	const errorDataset: DatasetType = {
		label: "Error",
		data: [],
		backgroundColor: "rgba(255, 99, 132, 0.7)",
	};
	const debugDataset: DatasetType = {
		label: "Debug",
		data: [],
		backgroundColor: "rgba(75, 192, 192, 0.7)",
	};
	const obj: Record<
		string,
		{ info: number; warning: number; error: number; debug: number }
	> = {};
	logAggregates.forEach((log) => {
		const date = log.day.toISOString().split("T")[0];
		const getLabels = () => {
			switch (log.level) {
				case "info":
					return {
						info: log.logVolume,
						warning: 0,
						error: 0,
						debug: 0,
					};
				case "warning":
					return {
						info: 0,
						warning: log.logVolume,
						error: 0,
						debug: 0,
					};
				case "error":
					return {
						info: 0,
						warning: 0,
						error: log.logVolume,
						debug: 0,
					};
				case "debug":
					return {
						info: 0,
						warning: 0,
						error: 0,
						debug: log.logVolume,
					};
				default:
					return {
						info: 0,
						warning: 0,
						error: 0,
						debug: 0,
					};
			}
		};
		if (obj[date]) {
			switch (log.level) {
				case "info":
					obj[date].info = log.logVolume;
					obj[date].warning = obj[date].warning ? obj[date].warning : 0;
					obj[date].error = obj[date].error ? obj[date].error : 0;
					obj[date].debug = obj[date].debug ? obj[date].debug : 0;
					break;
				case "warning":
					obj[date].info = obj[date].info ? obj[date].info : 0;
					obj[date].warning = log.logVolume;
					obj[date].error = obj[date].error ? obj[date].error : 0;
					obj[date].debug = obj[date].debug ? obj[date].debug : 0;
					break;
				case "error":
					obj[date].info = obj[date].info ? obj[date].info : 0;
					obj[date].warning = obj[date].warning ? obj[date].warning : 0;
					obj[date].error = log.logVolume;
					obj[date].debug = obj[date].debug ? obj[date].debug : 0;
					break;
				case "debug":
					obj[date].info = obj[date].info ? obj[date].info : 0;
					obj[date].warning = obj[date].warning ? obj[date].warning : 0;
					obj[date].error = obj[date].error ? obj[date].error : 0;
					obj[date].debug = log.logVolume;
					break;
				default:
					obj[date].info = 0;
					obj[date].warning = 0;
					obj[date].error = 0;
					obj[date].debug = 0;
					break;
			}
		} else {
			obj[date] = getLabels();
			dateLabels.push(date);
		}
	});
	Object.keys(obj).forEach((key) => {
		infoDataset.data.push(obj[key].info);
		warningDataset.data.push(obj[key].warning);
		errorDataset.data.push(obj[key].error);
		debugDataset.data.push(obj[key].debug);
	});

	const datasets: DatasetType[] = [
		infoDataset,
		warningDataset,
		errorDataset,
		debugDataset,
	];

	return {
		labels: dateLabels,
		datasets,
	};
};

const aggregateLogLevels = async (appName: string, days: number) => {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);

	const pipeline = [
		{
			$match: {
				createdAt: {
					$gte: startDate,
				},
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
			$sort: {
				level: 1,
			},
		},
	];
	type label = "Info" | "Warning" | "Error" | "Debug";
	type LogAggregatorType = {
		logVolume: number;
		level: "info" | "warning" | "error" | "debug";
	};
	const logAggregates: LogAggregatorType[] = await services.orm.em.aggregate(
		Log,
		pipeline
	);
	const labelsColor = {
		Info: "rgba(54, 162, 235, 0.7)",
		Warning: "rgba(255, 159, 64, 0.7)",
		Error: "rgba(255, 99, 132, 0.7)",
		Debug: "rgba(75, 192, 192, 0.7)",
	};
	const labels = Object.keys(labelsColor);

	const datasets = [
		{
			label: "Log Levels",
			data: new Array(labels.length).fill(0),
			backgroundColor: [
				"rgba(54, 162, 235, 0.7)",
				"rgba(255, 159, 64, 0.7)",
				"rgba(255, 99, 132, 0.7)",
				"rgba(75, 192, 192, 0.7)",
			],
			hoverOffset: 4,
		},
	];
	const capitalizeFirstLetter = (str: string) => {
		if (!str) {
			return "";
		}
		return str.charAt(0).toUpperCase() + str.slice(1);
	};
	logAggregates.forEach((log) => {
		const index = labels.indexOf(capitalizeFirstLetter(log.level));
		datasets[0].data[index] = log.logVolume;
	});

	return {
		labels,
		datasets,
	};
};

const aggregateTopKeys = async (
	appName: string,
	days: number,
	limit: number
) => {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);

	const pipeline = [
		{
			$match: {
				createdAt: {
					$gte: startDate,
				},
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
		{
			$sort: {
				logVolume: -1,
			},
		},
		{ $limit: limit },
	];
	type LogAggregatorType = {
		logVolume: number;
		key: string;
	};
	const logAggregates: LogAggregatorType[] = await services.orm.em.aggregate(
		Log,
		pipeline
	);

	const labels: string[] = [];
	const data: number[] = [];
	logAggregates.forEach((log) => {
		labels.push(log.key);
		data.push(log.logVolume);
	});
	return {
		labels: labels,
		datasets: [
			{
				label: "Top Log Keys",
				data,
				axis: "y",
				fill: false,
				backgroundColor: "rgba(75, 192, 192, 0.7)",
				borderColor: "rgba(75, 192, 192, 1)",
				borderWidth: 1,
			},
		],
	};
};

const aggregateErrorRate = async (appName: string, days: number) => {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);

	const pipeline = [
		{
			// Stage 1: Filter documents by date range and appName
			$match: {
				createdAt: {
					$gte: startDate, // Logs created on or after the start date
				},
				appName: appName, // Filter by the specific application name
			},
		},
		{
			// Stage 2: Group documents by day
			$group: {
				_id: {
					// Group by the day part of 'createdAt'
					// Using $dateTrunc to keep it as a Date object (MongoDB 5.0+)
					// For older versions, you might use $dateToString as in previous examples
					day: { $dateTrunc: { date: "$createdAt", unit: "day" } },
				},
				// Calculate total logs for the day
				totalLogs: { $sum: 1 },
				// Calculate error logs for the day
				errorLogs: {
					$sum: {
						// $cond: if 'level' is 'error', then 1, else 0
						$cond: [{ $eq: ["$level", "error"] }, 1, 0],
					},
				},
			},
		},
		{
			// Stage 3: Calculate the error rate and reshape the output
			$project: {
				_id: 0, // Exclude the default _id field
				day: "$_id.day", // The day
				totalLogs: 1, // Include total logs (optional, for context)
				errorLogs: 1, // Include error logs (optional, for context)
				errorRate: {
					// Calculate (errorLogs / totalLogs) * 100
					// Handle division by zero: if totalLogs is 0, errorRate is 0
					$cond: {
						if: { $eq: ["$totalLogs", 0] }, // Check if totalLogs is 0
						then: 0, // If 0, error rate is 0
						else: {
							$multiply: [{ $divide: ["$errorLogs", "$totalLogs"] }, 100],
						},
					},
				},
			},
		},
		{
			// Stage 4: Sort the results by day
			$sort: {
				day: 1, // Sort by day ascending
			},
		},
	];
	type LogAggregatorType = {
		logVolume: number;
		errorLogs: number;
		day: Date;
		errorRate: number;
	};
	const logAggregates: LogAggregatorType[] = await services.orm.em.aggregate(
		Log,
		pipeline
	);
	const labels: string[] = [];
	const data: number[] = [];
	logAggregates.forEach((log) => {
		const date = log.day.toISOString().split("T")[0];
		labels.push(date);
		data.push(log.errorRate);
	});

	return {
		labels,
		datasets: [
			{
				label: "Error Rate (%)",
				data,
				backgroundColor: "rgba(255, 99, 132, 0.5)",
				borderColor: "rgb(255, 99, 132)",
				tension: 0.1,
				borderWidth: 1,
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
			return res.send(`<p>${error.errors[0].message}</p>`);
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
    <form hx-post="/view/otp?appName=${appName}" hx-boost="true">
      <h3>${user.email}</h3>
      <input type="email" placeholder="Email" name="email" class="d-none form-control mb-3" value="${user.email}"/>
      <input type="number" placeholder="OTP" name="otp" class="form-control mb-3" />
      <button type="submit" class="btn btn-primary"> Login </button>
    </form>
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

		const { appName } = await authorizeService(req.body);

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

		const { appName, apiSecret } = await authorizeService({
			email: req.session.email,
			appName: req.query.appName as string,
		});

		req.session.user = apiSecret;
		req.session.appName = appName;

		res.setHeader("HX-Redirect", "/");
		res.send();
	} catch (error: any) {
		let errorMessage = "Please login again";
		if (error && error.message) {
			errorMessage = error.message;
		}
		return res.send(`
      <p>${errorMessage}</p>
      <form hx-post="/view/login" hx-swap="outerHTML" class="mb-3">
        <input type="email" placeholder="Email" name="email" class="form-control mb-3" />
        <button type="submit" class="btn btn-primary"> Login </button>
      </form>
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
		const { apiSecret } = await authorizeService({ email, appName });

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
