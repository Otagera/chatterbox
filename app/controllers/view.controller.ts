import { Request, Response } from "express";
import Router from "express-promise-router";

import { paginationState } from "../../index";
import { services } from "../config/db";
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
const LIMIT = 20;

/**
 * Determines the CSS class for styling log levels.
 * @param {string} level - The log level string (e.g., "info", "error", "trace").
 * @returns {string} The corresponding Tailwind CSS class.
 */
const getLevelStyle = (level: string): string => {
	// These classes should be applied to the <td> containing the log level.
	// They provide padding, text size, font weight, background, and text color.
	// Adjust 'px-2 py-1 text-xs font-semibold rounded-full' part as needed for overall cell styling,
	// the specific bg/text colors are per level.
	const baseClasses =
		"px-3 py-1 text-xs font-semibold rounded-full text-center"; // Added text-center
	switch (level.toLowerCase()) {
		case "info":
			return `${baseClasses} bg-blue-100 text-blue-700`;
		case "error":
			return `${baseClasses} bg-red-100 text-red-700`;
		case "warn": // Assuming 'warn' level might exist, mapped from 'trace' or new
			return `${baseClasses} bg-yellow-100 text-yellow-700`;
		case "trace":
			return `${baseClasses} bg-indigo-100 text-indigo-700`; // Changed from yellow to indigo for variety
		case "fatal":
			return `${baseClasses} bg-pink-100 text-pink-700 font-bold`;
		case "debug":
			return `${baseClasses} bg-gray-100 text-gray-700`;
		default:
			return `${baseClasses} bg-sky-100 text-sky-700`; // A generic fallback
	}
};

// Helper for consistent error message styling
const renderError = (message: string): string => {
	return `<div class="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md shadow-sm">
            <p class="font-medium">Error:</p>
            <p>${message}</p>
          </div>`;
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

		const logs = await getRecentLogs(appName as string, LIMIT);

		return res.render("index", {
			logs,
			appName,
			user: user,
			email,
			maskKey: maskKey(user as string),
		});
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || `Error loading dashboard: ${error}`;
		return res.status(500).send(renderError(message));
	}
});

router.get(
	"/analytics",
	authMiddleware,
	async (req: Request, res: Response) => {
		try {
			const { appName, user, email } = req.session;

			const logVolumeData = await aggregateLogVolume(appName as string, 7);
			const logLevelData = await aggregateLogLevels(appName as string, 7);
			const topKeysData = await aggregateTopKeys(appName as string, 7, 10);
			const errorRateData = await aggregateErrorRate(appName as string, 7);

			// 5. Average Response Time (Optional, if applicable)
			// const avgTimeData = await aggregateAvgTime(appName as string, 7); // Returns { labels: [...], datasets: [...] }

			return res.render("analytics", {
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
			const message =
				error instanceof ZodError
					? error.errors[0].message
					: error?.message || `Error loading analytics: ${error}`;
			return res.status(500).send(renderError(message));
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
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || "Something went wrong!!!";
		return res.status(500).send(renderError(message));
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
		const logsResult = await services.logs.findByCursor(
			{},
			{
				first: LIMIT,
				after: paginationState.getCurrentCursor() as string,
				orderBy: { createdAt: "desc" },
			}
		);

		paginationState.setCurrentCursor(logsResult.endCursor);
		paginationState.setHasNextPage(logsResult.hasNextPage);

		let logsHTML = ``;

		logsResult.items.forEach((log) => {
			const formattedDate = log.createdAt;
			// ? new Date(log.createdAt).toLocaleString()
			// : "N/A";
			const levelDisplayClasses = getLevelStyle(log.level);

			// Note: ensure log.id and log.key are properly escaped if they can contain HTML special characters.
			// For simplicity here, assuming they are safe.
			const logHTML = `
				<tr class="hover:bg-gray-50 transition-colors duration-150">
					<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${log.id}</td>
					<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${log.key}</td>
					<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer hover:bg-gray-100" hx-get="/view/get-log-data/${log.id}" hx-target="this" role="button">
						<span class="text-xs">${formattedDate}</span>
					</td>
					<td class="px-6 py-4 whitespace-nowrap text-sm">
							<span class="${levelDisplayClasses}">${log.level}</span>
					</td>
				</tr>
			`;
			logsHTML = logsHTML.concat(logHTML);
		});

		if (paginationState.getHasNextPage()) {
			logsHTML = logsHTML.concat(
				`<tr hx-get="/view/get-more-logs" hx-trigger="revealed" hx-swap="outerHTML swap:0.5s" hx-target="this">
          <td colspan="4" class="px-6 py-4 text-center text-gray-500 text-base">Loading more...</td>
        </tr>
        `
			);
		} else {
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500 text-base font-semibold">END OF LOGS</td></tr>`
			);
		}

		return res.send(logsHTML);
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || "Something went wrong fetching more logs!!!";
		return res.status(500).send(renderError(message));
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

			let logDataToDisplay: any = {};
			const {
				data: possibleEncryptedData,
				name,
				context,
				traceId,
				request,
				response,
				timeTaken,
				time,
				createdAt,
			} = log;
			let decryptedData = possibleEncryptedData;
			if (typeof possibleEncryptedData === "string") {
				try {
					decryptedData = decryptObj(possibleEncryptedData, req.appName || "");
				} catch (decryptionError) {
					console.warn(
						`Failed to decrypt log data for log ID ${id}:`,
						decryptionError
					);
					decryptedData = {
						decryption_error: "Could not decrypt data.",
						original_data_preview:
							possibleEncryptedData.substring(0, 100) + "...",
					};
				}
			}

			logDataToDisplay = {
				...(typeof decryptedData === "object" && decryptedData !== null
					? decryptedData
					: { data: decryptedData }),
				name,
				context,
				traceId,
				request,
				response,
				timeTaken,
			};

			const formattedTime =
				time || (createdAt ? new Date(createdAt).toLocaleString() : "N/A");

			return res.send(
				`
          <div class="px-6 py-4 text-sm text-gray-700 max-w-2xl mx-auto">
            <span class="block text-xs text-gray-500 mb-2">Log Time: ${formattedTime}</span>
            <pre class="block p-3 my-2 text-xs leading-relaxed text-gray-800 bg-gray-50 border border-gray-300 rounded-md whitespace-pre-wrap break-words overflow-auto shadow-sm">${JSON.stringify(
							logDataToDisplay,
							null,
							2
						)}</pre>
          </div>
        `
			); // Using max-w-2xl, whitespace-pre-wrap, break-words
		} catch (error: any) {
			const message =
				error instanceof ZodError
					? error.errors[0].message
					: error?.message || "Something went wrong fetching log data!!!";
			return res.status(500).send(renderError(message)); // Send styled error
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
		appName?: string;
		level?: string;
		key?: string;
		time?: {
			$gte?: Date;
			$lt?: Date;
		};
	} = { time: {}, appName: req.session.appName };
	console.log("req.body", req.body);
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
		const logsResult = await services.logs.findByCursor(filter, {
			first: LIMIT,
			after: paginationState.getCurrentCursor() as string,
			orderBy: { createdAt: "desc" },
		});

		paginationState.setCurrentCursor(logsResult.endCursor);
		paginationState.setHasNextPage(logsResult.hasNextPage);

		let logsHTML = ``;
		if (logsResult.items.length === 0) {
			logsHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-gray-500 text-lg font-medium">No logs found matching your criteria.</td></tr>`;
		} else {
			logsResult.items.forEach((log) => {
				const formattedDate = log.createdAt;
				// ? new Date(log.createdAt).toLocaleString()
				// : "N/A";
				const levelDisplayClasses = getLevelStyle(log.level);

				const logHTML = `
            <tr class="hover:bg-gray-50 transition-colors duration-150">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${log.id}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${log.key}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer hover:bg-gray-100" hx-get="/view/get-log-data/${log.id}" hx-target="this" role="button">
                <span class="text-xs">${formattedDate}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="${levelDisplayClasses}">${log.level}</span>
              </td>
            </tr>
          `;
				logsHTML = logsHTML.concat(logHTML);
			});

			if (paginationState.getHasNextPage()) {
				logsHTML = logsHTML.concat(
					`<tr id="more-search-logs" class="h-7">
						<td colspan="4" class="px-6 py-4 text-center text-gray-500 text-base h-7">
							<p>Loading...</p>
							<form class="collapse h-7" hx-post="/view/search" hx-trigger="revealed" hx-swap="outerHTML swap:0.5s" hx-target="#more-search-logs">
								<input class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" type="text" placeholder="Level" name="level" list="levelDatalistOptions" value="${
									req.body.level
								}">
								<datalist id="levelDatalistOptions">
									<option value="info"></option>
									<option value="error"></option>
									<option value="warn"></option>
									<option value="trace"></option>
									<option value="fatal"></option>
									<option value="debug"></option>
								</datalist>
								<input class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" type="text" placeholder="Key" name="key" value="${
									req.body.key ? req.body.key : ""
								}">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1" for="startDate">Start Date:</label>
									<input class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" type="datetime-local" name="startDate" id="startDate" value="${
										req.body.startDate ? req.body.startDate : ""
									}">
								</div>
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1" for="endDate">Finish Date:</label>
									<input class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" type="datetime-local" name="endDate" id="endDate" value="${
										req.body.endDate ? req.body.endDate : ""
									}">
								</div>
							</form>
						</td>
					</tr>
					`
				);
			} else {
				logsHTML = logsHTML.concat(
					`<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500 text-base font-semibold">END OF LOGS</td></tr>`
				);
			}
			// Note: Infinite scroll for search results might need its own hx-get target if different from main log list.
		}
		return res.send(logsHTML);
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || "Something went wrong during search!!!";
		return res.status(500).send(renderError(message));
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
	if (apps.length === 0) {
		return `<li class="py-2 text-gray-500">No applications found for this user.</li>`;
	}
	apps.forEach((app, index) => {
		const encodedAppName = encodeURIComponent(app.appName);
		const encodedLoginToken = encodeURIComponent(loginToken);
		const encodedEmail = encodeURIComponent(email);

		appHTML += `
      <li class="flex justify-between items-center py-3 border-b border-gray-200 last:border-b-0">
        <span
          hx-trigger="click"
          hx-target="#appsListContainer" 
          hx-swap="innerHTML" 
          hx-get="/view/apps?appName=${encodedAppName}&loginToken=${encodedLoginToken}"
          class="text-blue-600 hover:text-blue-800 underline cursor-pointer font-medium">
            ${app.appName}
        </span>
        <div id="app-delete-box-${index}" class="text-sm">
          <button
            type="button"
            hx-trigger="click"
            hx-target="#app-delete-box-${index}"
            hx-swap="innerHTML"
            hx-get="/view/apps/delete-confirmation?appName=${encodedAppName}&loginToken=${encodedLoginToken}&email=${encodedEmail}&appIndex=${index}"
            class="text-red-500 hover:text-red-700 hover:underline cursor-pointer font-medium">
            Delete
          </button>
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
		req.session.email = email;

		const encodedLoginToken = encodeURIComponent(loginToken);
		const encodedEmail = encodeURIComponent(email);

		const appsHTML = `
      <div id="appsListContainer" class="mt-6 bg-white p-6">
        <h2 class="text-xl font-semibold text-gray-700 mb-4">Your Applications</h2>
        <ul class="divide-y divide-gray-200">
          ${getApps(existingApps, loginToken, email)}
        </ul>
        <div class="mt-6">
          <button
              type="button"
              hx-trigger="click"
              hx-target="#appsListContainer"
              hx-swap="innerHTML"
              hx-get="/view/apps?newEmail=${encodedEmail}&loginToken=${encodedLoginToken}"
              class="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                Add New Application
          </button>
        </div>
      </div>
    `;
		return res.send(appsHTML);
	} catch (error: any) {
		let errorMessage = "Login failed. Please try again.";
		if (error instanceof ZodError) {
			errorMessage = error.errors.map((e) => e.message).join(", ");
		} else if (error && error.message) {
			errorMessage = error.message;
		}

		return res.send(`
      <div class="max-w-md w-full bg-white shadow-xl rounded-lg p-8 space-y-6">
        <h1 class="text-3xl font-bold text-center text-gray-800">Chatterbox Login</h1>
        <form hx-post="/view/login" hx-swap="outerHTML" class="space-y-6">
          <input type="email" placeholder="Email" name="email" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
          <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline">Login</button>
        </form>
        ${renderError(errorMessage)}
      </div>
    `);
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
					res.setHeader("HX-Redirect", "/login");
					return res
						.status(500)
						.send(renderError("Could not log out properly."));
				}
				res.setHeader("HX-Redirect", "/");
				return res.send();
			});
		} else {
			res.setHeader("HX-Redirect", "/");
			res.send();
		}
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || "Something went wrong during logout!!!";
		return res.status(500).send(renderError(message));
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
	loginToken: string,
	userEmail?: string
): Promise<string> => {
	const app = await services.appKeys.findOne({
		appName: appName as string,
	});

	if (!app) {
		throw new Error("Application not found.");
	}
	const user = await services.users.findOne({
		id: app.user.id,
		loginToken: hashLogintoken(loginToken as string),
	});

	if (!user)
		throw new Error(
			"User authentication failed or user not found for this app."
		);

	await generateSaveAndSendOTP(user, appName);

	const displayEmail = userEmail || user.email;
	const encodedAppName = encodeURIComponent(appName);

	const otpFormHTML = `
    <div id="otpFormContainer" class="bg-white p-6 w-full max-w-md mx-auto">
      <h2 class="text-xl font-semibold text-gray-700 mb-1">Verify Access for <span class="font-bold">${appName}</span></h2>
      <p class="text-sm text-gray-600 mb-4">An OTP has been sent to: ${displayEmail}</p>
      <form hx-post="/view/otp?appName=${encodedAppName}" hx-swap="innerHTML" hx-target="#otpFormContainer">
        <input type="email" name="email" class="hidden" value="${displayEmail}" />
        <div class="mb-4">
          <label for="otp" class="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
          <input type="number" placeholder="6-digit OTP" name="otp" id="otp" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>
        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline">Verify & Login</button>
      </form>
      <div id="otpErrorMsg" class="mt-3"></div>
    </div>
  `;
	return otpFormHTML;
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
			const userEmailFromSession = req.session.email;
			const appsHTML = await getViewApps(
				appName as string,
				loginToken as string,
				userEmailFromSession
			);
			return res.send(appsHTML);
		} else if (newEmail && loginToken) {
			const user = await services.users.findOne({
				email: newEmail as string,
				loginToken: hashLogintoken(loginToken as string),
			});

			if (!user)
				throw new Error(
					"User not found for creating a new app. Please log in again."
				);

			const encodedLoginToken = encodeURIComponent(loginToken as string);

			const newAppFormHTML = `
        <div id="newAppFormContainer" class="mt-6 bg-white shadow-md rounded-lg p-6 w-full max-w-md mx-auto">
          <h2 class="text-xl font-semibold text-gray-700 mb-4">Create New Application</h2>
          <p class="text-sm text-gray-600 mb-4">For user: ${user.email}</p>
          <form hx-post="/view/apps?loginToken=${encodedLoginToken}" hx-swap="innerHTML" hx-target="#newAppFormContainer">
            <input type="email" name="email" class="hidden" value="${user.email}" />
            <div class="mb-4">
              <label for="appNameInput" class="block text-sm font-medium text-gray-700 mb-1">Application Name</label>
              <input type="text" placeholder="Enter App Name" name="appName" id="appNameInput" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <input type="number" name="expires" class="hidden" value="10" /> <button type="submit" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline">Create Application</button>
          </form>
          <div id="newAppErrorMsg" class="mt-3"></div>
        </div>
      `;
			return res.send(newAppFormHTML);
		} else {
			throw new Error(
				"Invalid parameters. Please select an app or choose to create a new one."
			);
		}
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || "Something went wrong navigating apps section!!!";
		// Target for this error message might need to be specific if this is within an HTMX swap
		return res.send(renderError(message));
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
	const { loginToken } = req.query;
	try {
		if (!loginToken) throw new Error("Login token is required.");

		const { appName, email } = await createApplication(req.body);

		const appsHTML = await getViewApps(
			appName as string,
			loginToken as string,
			email || req.body.email
		);
		return res.send(appsHTML);
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors.map((e) => e.message).join(", ")
				: error?.message || "Failed to create application.";
		// Attempt to resend the form with the error, might need more context for hx-target
		// For now, sending a general error or the form again if possible.
		// This specific error should ideally be handled by HTMX to target an error message area within the form.
		const userEmailForForm = req.body.email;
		const encodedLoginToken = encodeURIComponent(loginToken as string);
		const newAppFormWithErrorHTML = `
        <div id="newAppFormContainer" class="mt-6 bg-white shadow-md rounded-lg p-6 w-full max-w-md mx-auto">
          <h2 class="text-xl font-semibold text-gray-700 mb-4">Create New Application</h2>
          ${
						userEmailForForm
							? `<p class="text-sm text-gray-600 mb-4">For user: ${userEmailForForm}</p>`
							: ""
					}
          <form hx-post="/view/apps?loginToken=${encodedLoginToken}" hx-swap="innerHTML" hx-target="#newAppFormContainer">
            <input type="email" name="email" class="hidden" value="${userEmailForForm}" />
            <div class="mb-4">
              <label for="appNameInput" class="block text-sm font-medium text-gray-700 mb-1">Application Name</label>
              <input type="text" placeholder="Enter App Name" name="appName" id="appNameInput" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value="${
								req.body.appName || ""
							}" required />
            </div>
            <input type="number" name="expires" class="hidden" value="10" />
            <button type="submit" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline">Create Application</button>
          </form>
          <div id="newAppErrorMsg" class="mt-3 text-red-500 text-sm">${message}</div>
        </div>
      `;
		return res.send(newAppFormWithErrorHTML);
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
			const encodedAppName = encodeURIComponent(appName as string);
			const encodedLoginToken = encodeURIComponent(loginToken as string);
			const encodedEmail = encodeURIComponent(email as string);

			const confirmationHTML = `
        <div class="flex justify-end items-center space-x-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <span class="text-sm text-yellow-700">Delete ${appName}?</span>
          <button
            type="button"
            hx-trigger="click"
            hx-target="#app-delete-box-${appIndex}"
            hx-swap="innerHTML"
            hx-get="/view/apps/delete-cancel?appName=${encodedAppName}&loginToken=${encodedLoginToken}&email=${encodedEmail}&appIndex=${appIndex}"
            class="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400">
              Cancel
          </button>
          <button
            type="button"
            hx-trigger="click"
            hx-target="#appsListContainer" 
            hx-swap="innerHTML"
            hx-delete="/view/apps?appName=${encodedAppName}&loginToken=${encodedLoginToken}&email=${encodedEmail}&appIndex=${appIndex}"
            class="px-3 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500">
              Confirm Delete
          </button>
        </div>
      `;
			return res.send(confirmationHTML);
		} catch (error: any) {
			const message =
				error instanceof ZodError
					? error.errors[0].message
					: error?.message || "Error showing delete confirmation.";
			return res.status(500).send(renderError(message));
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
		const encodedAppName = encodeURIComponent(appName as string);
		const encodedLoginToken = encodeURIComponent(loginToken as string);
		const encodedEmail = encodeURIComponent(email as string);

		const cancelHTML = `
      <button
        type="button"
        hx-trigger="click"
        hx-target="#app-delete-box-${appIndex}"
        hx-swap="innerHTML"
        hx-get="/view/apps/delete-confirmation?appName=${encodedAppName}&loginToken=${encodedLoginToken}&email=${encodedEmail}&appIndex=${appIndex}"
        class="text-red-500 hover:text-red-700 hover:underline cursor-pointer font-medium">
        Delete
      </button>
      `;
		return res.send(cancelHTML);
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || "Error cancelling deletion.";
		return res.status(500).send(renderError(message));
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
	const { appName, loginToken, email } = req.query;
	try {
		if (!appName || !loginToken || !email) {
			throw new Error("Missing parameters for deleting an application.");
		}

		let user = await services.users.findOne({
			email: email as string,
			loginToken: hashLogintoken(loginToken as string),
		});
		if (!user) {
			throw new Error(
				"Invalid User or unauthorized to delete this application."
			);
		}

		let appKeyEntry = await services.appKeys.findOne({
			appName: appName as string,
			user: user,
		});

		if (!appKeyEntry) {
			throw new Error("Application not found or does not belong to this user.");
		}

		await services.em.removeAndFlush(appKeyEntry);

		const existingApps = await services.appKeys.find({ user });
		const encodedLoginToken = encodeURIComponent(loginToken as string);
		const encodedUserEmail = encodeURIComponent(user.email);

		const updatedAppsListHTML = `
      <div id="appsListContainer" class="mt-6 bg-white p-6">
        <h2 class="text-xl font-semibold text-gray-700 mb-4">Your Applications</h2>
        <ul class="divide-y divide-gray-200">
          ${getApps(existingApps, loginToken as string, user.email)}
        </ul>
        <div class="mt-6">
          <button
              type="button"
              hx-trigger="click"
              hx-target="#appsListContainer"
              hx-swap="innerHTML"
              hx-get="/view/apps?newEmail=${encodedUserEmail}&loginToken=${encodedLoginToken}"
              class="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                Add New Application
          </button>
        </div>
        <p class="mt-4 text-sm text-green-600">Application '${appName}' deleted successfully.</p>
      </div>
    `;
		return res.send(updatedAppsListHTML);
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || "Failed to delete application.";
		// If deletion fails, ideally, we'd send back the original list with an error message.
		// For simplicity, sending a general error that HTMX can place.
		// Or, you could re-fetch the original list and add an error message above/below it.
		const existingApps =
			req.session.email && loginToken
				? await services.appKeys.find({
						user: {
							email: req.session.email,
							loginToken: hashLogintoken(loginToken as string),
						},
				  })
				: [];
		const appsListWithError = `
    <div id="appsListContainer" class="mt-6 bg-white p-6">
       ${renderError(
					message
				)} <h2 class="text-xl font-semibold text-gray-700 mb-4">Your Applications</h2>
        <ul class="divide-y divide-gray-200">
          ${getApps(
						existingApps,
						loginToken as string,
						req.session.email || ""
					)}
        </ul>
        <div class="mt-6">
          <button
              type="button"
              hx-trigger="click"
              hx-target="#appsListContainer"
              hx-swap="innerHTML"
              hx-get="/view/apps?newEmail=${encodeURIComponent(
								req.session.email || ""
							)}&loginToken=${encodeURIComponent(loginToken as string)}"
              class="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                Add New Application
          </button>
        </div>
      </div>`;
		return res.status(400).send(appsListWithError);
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
		const userEmailFromSession = req.session.email;
		if (!userEmailFromSession) {
			throw new Error(
				"Session expired or email not found. Please login again."
			);
		}
		await OTPService({ otp: req.body.otp, email: userEmailFromSession });

		const { appName, token } = await authorizeService({
			email: req.session.email,
			appName: req.query.appName as string,
		});

		req.session.user = token;
		req.session.appName = appName;

		res.setHeader("HX-Redirect", "/");
		res.send();
	} catch (error: any) {
		let errorMessage = "OTP verification failed. Please try again.";
		if (error instanceof ZodError) {
			errorMessage = error.errors.map((e) => e.message).join(", ");
		} else if (error && error.message) {
			errorMessage = error.message;
		}

		const appNameQuery = req.query.appName as string;
		const userEmailForForm = req.session.email || req.body.email;

		const encodedAppNameQuery = encodeURIComponent(appNameQuery);

		const otpFormWithErrorHTML = `
      <div id="otpFormContainer" class="bg-white p-6 w-full max-w-md mx-auto">
        <h2 class="text-xl font-semibold text-gray-700 mb-1">Verify Access for <span class="font-bold">${appNameQuery}</span></h2>
        <p class="text-sm text-gray-600 mb-4">An OTP has been sent to: ${userEmailForForm}</p>
        <form hx-post="/view/otp?appName=${encodedAppNameQuery}" hx-swap="innerHTML" hx-target="#otpFormContainer">
          <input type="email" name="email" class="hidden" value="${userEmailForForm}" />
          <div class="mb-4">
            <label for="otp" class="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
            <input type="number" placeholder="6-digit OTP" name="otp" id="otp" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline">Verify & Login</button>
        </form>
        <div id="otpErrorMsg" class="mt-3 text-red-500 text-sm p-2 bg-red-50 rounded-md border border-red-200">${errorMessage}</div>
      </div>
    `;
		return res.status(401).send(otpFormWithErrorHTML); // 401 Unauthorized or 400 Bad Request
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
			throw new Error(
				"User session not found or app not selected. Please log in."
			);
		}
		const { apiSecret } = await apiAuthorizeService({ email, appName });
		req.session.user = apiSecret;
		const apiKeyDisplayHTML = `
      <div id="apiKeyDisplaySection" class="p-4 bg-gray-50 rounded-lg shadow-sm border border-gray-200">
        <p class="text-sm font-medium text-gray-700 mb-1">Your API Secret Key for <span class="font-semibold">${appName}</span>:</p>
        <div class="flex items-center space-x-2 bg-gray-100 p-2 rounded-md">
          <span id="apiKeyToCopy" class="font-mono text-sm text-gray-800 break-all">${maskKey(
						apiSecret
					)}</span>
          <button 
            type="button"
            title="Copy API Key"
            class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            onclick="navigator.clipboard.writeText('${apiSecret}').then(() => { const el = document.getElementById('copyFeedback-${appName}'); if(el) { el.textContent = 'Copied!'; setTimeout(() => el.textContent = '', 2000); } }).catch(err => console.error('Failed to copy: ', err))">
            ${svgContent.replace("<svg", '<svg class="w-5 h-5 fill-current"')}
          </button>
        </div>
        <span id="copyFeedback-${appName}" class="text-xs text-green-600 mt-1 h-4 block"></span>
      </div>
    `;
		return res.send(apiKeyDisplayHTML);
	} catch (error: any) {
		const message =
			error instanceof ZodError
				? error.errors[0].message
				: error?.message || "Could not retrieve API key.";
		return res.status(500).send(renderError(message));
	}
});

export const ViewController = router;
