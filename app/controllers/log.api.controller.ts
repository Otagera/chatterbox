import { Request, Response } from "express";
import Router from "express-promise-router";
import { z } from "zod";
import md5 from "md5";
import NodeRSA from "encrypt-rsa";
import crypto from "crypto";

import { paginationState } from "../../index";
import { services } from "../db";
import { ILog } from "../interfaces";

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

const nodeRSA = new NodeRSA();
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

const shortenedKey = (key: string, checkSum: string) => {
	return Buffer.from(`${hashKeys(key)}_${checkSum}`, "utf-8").toString(
		"base64"
	);
};

const reverseShortenedKey = (shortenedKey: string) => {
	const decoded = Buffer.from(shortenedKey, "base64").toString("utf-8");
	// const [originalKey, checksum] = decoded.split("_");
	return decoded;
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

		const appKey = await services.appKeys.findOne({ appName: appName });
		if (!appKey) {
			return res
				.status(404)
				.json({ success: false, message: `Application: ${appName} not found` });
		}

		const appKeyIsActive =
			appKey.status === "active" && appKey.expires > Date.now();
		if (appKeyIsActive) {
			return res.status(409).json({
				success: false,
				message: `Application: ${appName} has already been authorized`,
			});
		}

		const { publicKey, privateKey } = nodeRSA.createPrivateAndPublicKeys();
		const checkSum = createChecksum(appName);
		console.log("checkSum", checkSum);
		const shortApiKey = shortenedKey(publicKey, checkSum);
		const shortApiSecret = shortenedKey(privateKey, checkSum);
		const apiKey = `chbxpk_${shortApiKey}_ZEE`;
		const apiSecret = `chbxsk_${shortApiSecret}_ZEE`;
		console.log("publicKey", publicKey);
		console.log("shortApiKey", shortApiKey);
		console.log("reverseShortenedKey", reverseShortenedKey(shortApiKey));
		console.log("shortApiSecret", shortApiSecret);
		console.log("apiKey", apiKey);
		console.log("apiSecret", apiSecret);

		appKey.apiKey = apiKey;
		appKey.apiSecret = hashKeys(apiSecret);
		appKey.expires = Date.now() + expires * 1000;

		await services.em.flush();

		return res.status(201).json({
			success: true,
			message: `Application: ${appName} has been successfully authorized`,
			apiKey,
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
				apiKey: z.string(),
				apiSecret: z.string(),
			})
			.required();
		type specType = z.infer<typeof spec>;
		const { apiKey, apiSecret } = validateSpec<specType>(spec, req.body);

		// Extract the appName and the public/private key data from the apiKey and apiSecret
		const [typeApiKey, publicKeyHashWithChecksum] = apiKey.split("_");
		const [typeApiSecret, _privateKeyHashWithChecksum] = apiSecret.split("_");

		if (typeApiKey !== "chbxpk" || typeApiSecret !== "chbxsk") {
			return res.status(400).json({
				success: false,
				message: "Invalid API key format",
			});
		}

		// Here, we assume that the appName is stored alongside the API key or can be retrieved via another mechanism.
		const appName = "entryboost"; // You would retrieve this from the request context or database

		const appKey = await services.appKeys.findOne({ appName: appName });
		if (!appKey) {
			return res.status(404).json({
				success: false,
				message: `Application: ${appName} not found`,
			});
		}

		const checksum = createChecksum(appName);
		const recomputedPublicKey = reverseShortenedKey(appKey.apiKey);
		const recomputedPrivateKey = appKey.apiSecret;

		// Check if the recomputed hashes match the original API key and secret
		const isApiKeyValid = publicKeyHashWithChecksum === recomputedPublicKey;
		const isApiSecretValid = hashKeys(apiSecret) === recomputedPrivateKey;
		console.log("isApiKeyValid", isApiKeyValid);
		console.log("isApiSecretValid", isApiSecretValid);
		console.log("publicKeyHashWithChecksum", publicKeyHashWithChecksum);
		console.log("recomputedPublicKey", recomputedPublicKey);
		if (isApiKeyValid && isApiSecretValid) {
			return res.status(200).json({
				success: true,
				message: "API key and secret are valid",
			});
		}
		return res.status(401).json({
			success: false,
			message: "Invalid API key or secret",
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Invalid API key or secret",
		});
	}
});

router.post("/apps/revoke", async () => {});

export const LogAPIController = router;
