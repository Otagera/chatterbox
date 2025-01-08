import { Request, Response } from "express";
import Router from "express-promise-router";

import { paginationState } from "../../index";
import { services } from "../db";
import { authMiddleware } from "../middlewares/auth.middleware";

import { AppKey } from "../entities";
import { decryptObj, hashLogintoken } from "../utils/security.util";
import {
	OTPService,
	authorizeService,
	generateSaveAndSendOTP,
	loginService,
} from "./services";

const router = Router();

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

router.get("/", authMiddleware, async (req: Request, res: Response) => {
	try {
		const logs = await services.logs.findByCursor(
			{},
			{
				first: 100,
				orderBy: { time: "desc" },
			}
		);

		paginationState.setCurrentCursor(logs.endCursor);
		paginationState.setHasNextPage(logs.hasNextPage);

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

router.get("/login", async (req: Request, res: Response) => {
	try {
		return res.render("login");
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

//htmx
router.get("/view/get-more-logs", async (req: Request, res: Response) => {
	if (!paginationState.getHasNextPage()) return res.send();

	try {
		const logs = await services.logs.findByCursor(
			{},
			{
				first: 100,
				after: paginationState.getCurrentCursor() as string,
				orderBy: { time: "desc" },
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
              <small class="text-muted">${log.time}</small>
            </td>
            <td class=${levelStyle}> ${log.level} </td>
          </tr>
        `;
			logsHTML = logsHTML.concat(logHTML);
		});

		if (!paginationState.getHasNextPage()) {
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1">END!!!</td></tr>`
			);
		}
		return res.send(logsHTML);
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

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
			return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
		}
	}
);

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
			after: paginationState.getCurrentCursor() as string,
			orderBy: { time: "desc" },
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
		} else if (!paginationState.getHasNextPage())
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1 text-center">END!!!</td></tr>`
			);

		return res.send(logsHTML);
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

router.post("/view/login", async (req: Request, res: Response) => {
	try {
		const { email, existingApps, loginToken } = await loginService(req.body);
		const getApps = (apps: AppKey[]) => {
			let appHTML = "";
			apps.forEach((app) => {
				appHTML += `
					<li class="flex">
					<p>App: <span 
						hx-trigger="click"
						hx-target="#appsList"
						hx-swap="outerHTML"
						hx-get="/view/apps?appName=${app.appName}&loginToken=${loginToken}"
						class="text-primary text-decoration-underline"
						style="cursor:pointer"> 
							${app.appName}
						</span></p>
					</li>
				`;
			});
			return appHTML;
		};

		const appsHTML = `
			<div id="appsList">
				<ol>
					${getApps(existingApps)}
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
	} catch (error) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

const getViewApps = async (appName: string, loginToken: string) => {
	const app = await services.appKeys.findOne({
		appName: appName as string,
	});
	const user = await services.users.findOne({
		id: app?.user.id,
		loginToken: hashLogintoken(loginToken as string),
	});
	if (user) {
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
	throw new Error("Login failed, please try again");
};

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
			throw new Error();
		}
	} catch (error) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

router.post("/view/apps", async (req: Request, res: Response) => {
	try {
		const { loginToken } = req.query;
		const { appName } = await authorizeService(req.body);

		const appsHTML = await getViewApps(appName as string, loginToken as string);
		return res.send(appsHTML);
	} catch (error) {
		console.log("error", error);
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

router.post("/view/otp", async (req: Request, res: Response) => {
	try {
		await OTPService(req.body);
		const { appName, apiSecret } = await authorizeService({
			email: req.session.email,
			appName: req.query.appName,
		});

		req.session.user = apiSecret;
		req.session.appName = appName;

		res.setHeader("HX-Redirect", "/");
		res.send();
	} catch (error) {
		console.log("error", error);
		return res.send(`
			<p>Please login again</p>
			<form hx-post="/view/login" hx-swap="outerHTML" class="mb-3">
				<input type="email" placeholder="Email" name="email" class="form-control mb-3" />
				<button type="submit" class="btn btn-primary"> Login </button>
			</form>
		`);
	}
});

export const ViewController = router;
