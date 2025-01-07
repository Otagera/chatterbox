import { Request, Response } from "express";
import Router from "express-promise-router";
import { ZodError, z } from "zod";

import { paginationState } from "../../index";
import { services } from "../db";
import { ILog } from "../interfaces";
import { AppKey, AppKeyStatus } from "../entities";
import { HTTPError } from "../utils/error.util";
import constantsUtil from "../utils/constants.util";
import { authMiddleware, verifyService } from "../middlewares/auth.middleware";
import { decryptObj, encrypt, encryptObj } from "../utils/security.util";
import { validateSpec } from "../utils/validate.util";
import { OTPService, authorizeService, loginService } from "./services";

const { HTTP_STATUS_CODES } = constantsUtil;
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

//htmx
router.get("/get-more-logs", async (req: Request, res: Response) => {
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
            
            <td hx-get=/get-log-data/${log.id} hx-target="this" role="button">
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
	"/get-log-data/:id",
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
		} else if (!paginationState.getHasNextPage())
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1 text-center">END!!!</td></tr>`
			);

		return res.send(logsHTML);
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

router.post("/login", async (req: Request, res: Response) => {
	try {
		const { email, existingApps } = await loginService(req.body);
		const getApps = (apps: AppKey[]) => {
			let appHTML = "";
			apps.forEach((app) => {
				appHTML += `
					<li class="flex">
					<p>App: <span 
						hx-trigger="click"
						hx-target="#appsList"
						hx-swap="outerHTML"
						hx-get="/api/apps?appName=${app.appName}"
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
		<ol id="appsList">
			${getApps(existingApps)}
		</ol>
		    `;

		req.session.email = email;
		return res.send(appsHTML);
	} catch (error) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

router.get("/apps", async (req: Request, res: Response) => {
	try {
		const { appName } = req.query;
		if (appName) {
			const app = await services.appKeys.findOne({
				appName: appName as string,
			});
			const user = await services.users.findOne({ id: app?.user.id });

			const logHTML = `
			<form hx-post="/api/otp?appName=${appName}" hx-boost="true">
			<h3>${user?.email}</h3>
				<input type="email" placeholder="Email" name="email" class="d-none form-control mb-3" value="${user?.email}"/>
				<input type="number" placeholder="OTP" name="otp" class="form-control mb-3" />
				<button type="submit" class="btn btn-primary"> Login </button>
			</form>
        `;
			return res.send(logHTML);
		}
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

router.post("/otp", async (req: Request, res: Response) => {
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
			<form hx-post="/api/login" hx-swap="outerHTML" class="mb-3">
				<input type="email" placeholder="Email" name="email" class="form-control mb-3" />
				<button type="submit" class="btn btn-primary"> Login </button>
			</form>
		`);
	}
});

router.post("/logs", authMiddleware, async (req: Request, res: Response) => {
	try {
		const logParam = req.body?.log;
		const spec = z.object({
			level: z.string(),
			name: z.string(),
			context: z.object({}).optional(),
			time: z.union([z.date(), z.number()]),
			data: z.union([z.record(z.any()), z.string()]).optional(),
			traceId: z.string().optional(),
			request: z.string().optional(),
			response: z.string().optional(),
			timeTaken: z.string().optional(),
			key: z.string(),
			appName: z.string(),
		});
		type specType = z.infer<typeof spec>;
		const log = validateSpec<specType>(spec, logParam);

		const appKey = await services.appKeys.findOne({ appName: log.appName });
		if (log.data && appKey?.appName) {
			if (typeof log.data === "string") {
				log.data = encrypt(log.data, appKey.appName);
			} else {
				log.data = encryptObj(log.data, appKey.appName);
			}
		}

		services.logs.create(log as ILog);
		await services.em.flush();
		res
			.status(HTTP_STATUS_CODES.OK)
			.json({ success: true, message: "Logged succesfully" });
	} catch (error) {
		if (error instanceof HTTPError) {
			return res.status(error?.statusCode).json({
				success: false,
				message: error?.message,
			});
		} else if (error instanceof ZodError) {
			return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
				success: false,
				message: JSON.parse(error?.message),
			});
		} else {
			return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
				success: false,
				message: "Invalid API secret",
			});
		}
	}
});

router.post("/logs/bulk", async (req: Request, res: Response) => {
	const logs: ILog[] = req.body?.logs;
	logs.forEach((log) => {
		services.logs.create(log);
	});
	await services.em.flush();
	res.status(HTTP_STATUS_CODES.OK).json({ success: true });
});

router.post("/users/login", async (req: Request, res: Response) => {
	try {
		const { email, generatedOTP } = await loginService(req.body);
		return res.status(HTTP_STATUS_CODES.CREATED).json({
			success: true,
			message: `User: ${email} OTP sent successfully`,
			// remove this
			generatedOTP,
		});
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

router.post("/users/otp", async (req: Request, res: Response) => {
	try {
		await OTPService(req.body);

		return res.status(HTTP_STATUS_CODES.OK).json({
			success: true,
			message: `Okay`,
		});
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

router.post("/apps/authorize", async (req: Request, res: Response) => {
	try {
		const { appName, apiSecret } = await authorizeService(req.body);

		return res.status(HTTP_STATUS_CODES.CREATED).json({
			success: true,
			message: `Application: ${appName} has been successfully authorized`,
			apiSecret,
		});
	} catch (error) {
		console.log("error", error);
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

router.post("/apps/verify", async (req: Request, res: Response) => {
	try {
		const isApiSecretValid = await verifyService(req.body);

		if (isApiSecretValid) {
			return res.status(HTTP_STATUS_CODES.OK).json({
				success: true,
				message: "API secret is valid",
			});
		}
		return res.status(HTTP_STATUS_CODES.UNAUTHORIZED).json({
			success: false,
			message: "Invalid API secret",
		});
	} catch (error) {
		if (error instanceof HTTPError) {
			return res.status(error?.statusCode).json({
				success: false,
				message: error?.message,
			});
		} else {
			return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
				success: false,
				message: "Invalid API secret",
			});
		}
	}
});

router.post("/apps/revoke", async (req: Request, res: Response) => {
	try {
		const spec = z
			.object({
				appName: z.string(),
			})
			.required();
		type specType = z.infer<typeof spec>;
		const { appName } = validateSpec<specType>(spec, req.body);

		const appKey = await services.appKeys.findOne({ appName: appName });
		if (!appKey) {
			return res.status(HTTP_STATUS_CODES.NOTFOUND).json({
				success: false,
				message: `Application: ${appName} not found`,
			});
		}
		appKey.status = AppKeyStatus.DISABLED;
		await services.em.flush();

		return res.status(HTTP_STATUS_CODES.NOTFOUND).json({
			success: false,
			message: `Application: ${appName} not found`,
		});
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE).json({
			success: false,
			message: "API secret revocation not succesfully",
		});
	}
});

export const APIController = router;
