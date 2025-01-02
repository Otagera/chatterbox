import { Request, Response } from "express";
import Router from "express-promise-router";
import { z } from "zod";
import md5 from "md5";
import crypto from "crypto";

import { paginationState } from "../../index";
import { services } from "../db";
import { IAppKey, ILog } from "../interfaces";
import { AppKeyStatus } from "../entities";

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

const validateSpec = <T>(
	spec: any,
	data: { [key: string]: unknown },
	optionalConfig = {}
): T => {
	try {
		const value = spec.parse(data, {
			allowUnknown: true,
			stripUnknown: true,
			errors: {
				wrap: {
					label: "",
				},
			},
			...optionalConfig,
		});
		return value;
	} catch (error) {
		throw error;
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

router.get("/get-log-data/:id", async (req: Request, res: Response) => {
	const id = req.params.id;
	try {
		const log = await services.logs.findOneOrFail(id);
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

router.post("/logs", async (req: Request, res: Response) => {
	const log: ILog = req.body?.log;
	services.logs.create(log);
	await services.em.flush();
	res.status(200).json({ success: true });
});

router.post("/logs/bulk", async (req: Request, res: Response) => {
	const logs: ILog[] = req.body?.logs;
	logs.forEach((log) => {
		services.logs.create(log);
	});
	await services.em.flush();
	res.status(200).json({ success: true });
});

const createChecksum = (appName: string) => {
	return crypto
		.createHash("sha256")
		.update(appName + "JZl04")
		.digest("hex");
};

const hashKeys = (key: string) => {
	return crypto
		.createHash("sha256")
		.update(key + "LP90", "utf-8")
		.digest("hex");
};

const createSecretKey = (appName: string) => {
	const checkSum = createChecksum(appName);
	const apiKey = crypto.randomBytes(24).toString("base64url");

	return `chbxsk_${apiKey}${checkSum}_ZEE`;
};

router.post("/apps/authorize", async (req: Request, res: Response) => {
	try {
		const spec = z
			.object({
				appName: z.string(),
				expires: z.number().int().min(1),
			})
			.required();
		type specType = z.infer<typeof spec>;
		const { appName, expires } = validateSpec<specType>(spec, req.body);

		const expiresinMiliSecs = Date.now() + expires * 1000;
		const apiSecret = createSecretKey(appName);
		const hashedApiSecret = hashKeys(apiSecret);
		const existingAppKey = await services.appKeys.findOne({ appName: appName });

		if (existingAppKey) {
			const appKeyIsActive =
				existingAppKey.status === "active" &&
				existingAppKey.expires > Date.now();
			if (appKeyIsActive) {
				return res.status(409).json({
					success: false,
					message: `Application: ${appName} has already been authorized`,
				});
			}

			existingAppKey.apiSecret = hashedApiSecret;
			existingAppKey.expires = Date.now() + expires * 1000;
		} else {
			let appKey = {
				appName,
				apiSecret: hashedApiSecret,
				expires: expiresinMiliSecs,
				status: AppKeyStatus.DISABLED,
			};

			services.appKeys.create(appKey as IAppKey);
		}
		await services.em.flush();

		return res.status(201).json({
			success: true,
			message: `Application: ${appName} has been successfully authorized`,
			apiSecret,
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

router.post("/apps/verify", async (req: Request, res: Response) => {
	try {
		const spec = z
			.object({
				appName: z.string(),
				apiSecret: z.string(),
			})
			.required();
		type specType = z.infer<typeof spec>;
		const { appName, apiSecret } = validateSpec<specType>(spec, req.body);

		// Extract the appName and the public/private key data from the apiKey and apiSecret
		const [typeApiSecret, _privateKeyHashWithChecksum] = apiSecret.split("_");

		if (typeApiSecret !== "chbxsk") {
			return res.status(400).json({
				success: false,
				message: "Invalid API key format",
			});
		}

		const appKey = await services.appKeys.findOne({ appName: appName });
		if (!appKey) {
			return res.status(404).json({
				success: false,
				message: `Application: ${appName} not found`,
			});
		}

		const recomputedPrivateKey = appKey.apiSecret;

		// Check if the recomputed hashes match the original API key and secret
		const isApiSecretValid = hashKeys(apiSecret) === recomputedPrivateKey;

		if (isApiSecretValid) {
			return res.status(200).json({
				success: true,
				message: "API secret is valid",
			});
		}
		return res.status(401).json({
			success: false,
			message: "Invalid API secret",
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Invalid API secret",
		});
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
		appKey?.status = AppKeyStatus.DISABLED;
		await services.em.flush();
		if (!appKey) {
			return res.status(404).json({
				success: false,
				message: `Application: ${appName} not found`,
			});
		}
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "API secret revocation not succesfully",
		});
	}
});

export const LogAPIController = router;
