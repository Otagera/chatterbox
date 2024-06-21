import { Request, Response } from "express";
import Router from "express-promise-router";

import { DI } from "../../index";

const router = Router();
let currentCursor: string | null;
let hasNextPage: boolean;

const getLevelStyle = (level: string) => {
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

router.get("/", async (req: Request, res: Response) => {
	try {
		const logs = await DI.logs.findByCursor(
			{},
			{
				first: 100,
				orderBy: { time: "desc" },
			}
		);
		currentCursor = logs.endCursor;
		hasNextPage = logs.hasNextPage;

		return res.render("index", {
			logs: logs.items.map((log) => {
				let levelStyle = getLevelStyle(log.level);
				return { ...log, id: log._id, levelStyle };
			}),
		});
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

router.get("/get-more-logs", async (req: Request, res: Response) => {
	if (!hasNextPage) return res.send();

	try {
		const logs = await DI.logs.findByCursor(
			{},
			{
				first: 100,
				after: currentCursor as string,
				orderBy: { time: "desc" },
			}
		);
		currentCursor = logs.endCursor;
		hasNextPage = logs.hasNextPage;
		let logsHTML = ``;

		logs.items.forEach((log) => {
			let levelStyle = getLevelStyle(log.level);

			const logHTML = `
          <tr>
            <td scope="row"> ${log.id}</td>
            <td> ${log.key} </td>
            
            <td hx-get=/get-log-data/${log.id} hx-target="this" role="button">
              <small class="text-muted">${log.time}</small>
            </td>
            <td class=${levelStyle}> ${log.level} </td>
          </tr>
        `;
			logsHTML = logsHTML.concat(logHTML);
		});

		if (!hasNextPage) {
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1">END!!!</td></tr>`
			);
		}
		return res.send(logsHTML);
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

router.get("/get-log-data/:id", async (req: Request, res: Response) => {
	const id = req.params.id;
	try {
		const log = await DI.logs.findOneOrFail(id);
		if (!log) {
			throw new Error("Something went wrong!!!");
		}
		let logData = {};
		const { data, name, context, traceId, request, response, timeTaken } = log;
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
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

router.post("/search", async (req: Request, res: Response) => {
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
		const logs = await DI.logs.findByCursor(filter, {
			first: 100,
			after: currentCursor as string,
			orderBy: { time: "desc" },
		});

		currentCursor = logs.endCursor;
		hasNextPage = logs.hasNextPage;

		let logsHTML = ``;
		logs.items.forEach((log) => {
			let levelStyle = getLevelStyle(log.level);

			const logHTML = `
          <tr>
            <td scope="row"> ${log.id}</td>
            <td> ${log.key} </td>
            
            <td hx-get=/get-log-data/${log.id} hx-target="this" role="button">
              <small class="text-muted">${log.time}</small>
            </td>
            <td class=${levelStyle}> ${log.level} </td>
          </tr>
        `;
			logsHTML = logsHTML.concat(logHTML);
		});
		if (logs.length === 0) {
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1 text-center">Empty</td></tr>`
			);
		} else if (!hasNextPage)
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1 text-center">END!!!</td></tr>`
			);

		return res.send(logsHTML);
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

export const LogController = router;
