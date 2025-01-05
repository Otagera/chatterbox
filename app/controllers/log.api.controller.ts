import { Request, Response, NextFunction } from "express";
import Router from "express-promise-router";
import { z } from "zod";
import md5 from "md5";
import crypto from "crypto";

import { paginationState } from "../../index";
import { services } from "../db";
import { IAppKey, ILog } from "../interfaces";
import { AppKeyStatus } from "../entities";
import {
	InvalidKeyError,
	HTTPError,
	AppNotFoundError,
} from "../utils/error.util";
import constantsUtil from "../utils/constants.util";

const { HTTP_STATUS_CODES } = constantsUtil;
const router = Router();
console.log("here");
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
type ObjType = { [key: string]: unknown };
const validateSpec = <T>(spec: any, data: ObjType, optionalConfig = {}): T => {
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

router.post(
	"/logs",
	async (req: Request, res: Response, next: NextFunction) => {
		const { authorization: token, appName } = req.headers;
		if (token) {
			try {
				let apiSecret = "";
				if (token.startsWith("Bearer ")) {
					apiSecret = token.split(" ")[1];
				}
				const isApiSecretValid = await verify({
					apiSecret,
					appName: appName as string,
				});

				req.isApiSecretValid = isApiSecretValid;
				return next();
			} catch (error) {
				return res
					.status(error?.statusCode || HTTP_STATUS_CODES.UNAUTHORIZED)
					.send({
						status: "error",
						message:
							error?.message ||
							"Unauthorized request, please provide a valid token.",
						data: null,
					});
			}
		} else {
			return res.status(HTTP_STATUS_CODES.UNAUTHORIZED).send({
				status: "error",
				message: "Unauthorized request, please login",
				data: null,
			});
		}
	},
	async (req: Request, res: Response) => {
		const log: ILog = req.body?.log;
		services.logs.create(log);
		await services.em.flush();
		res.status(HTTP_STATUS_CODES.OK).json({ success: true });
	}
);

router.post("/logs/bulk", async (req: Request, res: Response) => {
	const logs: ILog[] = req.body?.logs;
	logs.forEach((log) => {
		services.logs.create(log);
	});
	await services.em.flush();
	res.status(HTTP_STATUS_CODES.OK).json({ success: true });
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

const getKeyAndIV = (id: string) => {
	const key = crypto.createHash("sha256").update(id).digest(); // 32 bytes for AES-256
	const iv = crypto.createHash("md5").update(id).digest();
	return { key, iv };
};

const encryptObj = (obj: object) => encrypt(JSON.stringify(obj));
const decryptObj = (ciphertext: string) => JSON.parse(decrypt(ciphertext));

/**
 * Encrypts a given text using AES-256-CBC.
 * @param {string} plaintext - The text to encrypt.
 * @returns {string} - The encrypted text in base64 format.
 */
const encrypt = (plaintext: string): string => {
	const { key, iv } = getKeyAndIV("672f733601e71da46a3f1224");
	const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
	let encrypted = cipher.update(plaintext, "utf8", "base64");
	encrypted += cipher.final("base64");
	return encrypted;
};

/**
 * Decrypts a given encrypted text using AES-256-CBC.
 * @param {string} ciphertext - The encrypted text in base64 format.
 * @returns {string} - The decrypted text.
 */
const decrypt = (ciphertext: string): string => {
	const { key, iv } = getKeyAndIV("672f733601e71da46a3f1224");
	const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
	let decrypted = decipher.update(ciphertext, "base64", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
};

// Example usage
const text = "Server started on port 3682";
const encryptedText = encrypt(text);
const decryptedText = decrypt(encryptedText);

const obj = {
	msg: "Server started on port 3682",
	duration: "0.663s",
};
const encryptedObj = encryptObj(obj);
const decryptedObj = decryptObj(encryptedObj);

console.log("Original Text:", text);
console.log("Encrypted Text:", encryptedText);
console.log("Decrypted Text:", decryptedText);

console.log("Original Obj:", obj);
console.log("Encrypted Obj:", encryptedObj);
console.log("Decrypted Obj:", decryptedObj);

const createSecretKey = (appName: string) => {
	const checkSum = createChecksum(appName);
	const apiKey = crypto.randomBytes(24).toString("base64url");

	return `chbxsk_${apiKey}${checkSum}_ZEE`;
};

const verify = async (params: { appName: string; apiSecret: string }) => {
	const spec = z
		.object({
			appName: z.string(),
			apiSecret: z.string(),
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { appName, apiSecret } = validateSpec<specType>(spec, params);

	// Extract the appName and the public/private key data from the apiKey and apiSecret
	const [typeApiSecret, _privateKeyHashWithChecksum] = apiSecret.split("_");

	if (typeApiSecret !== "chbxsk") {
		throw new InvalidKeyError({});
	}

	const appKey = await services.appKeys.findOne({ appName: appName });
	if (!appKey) {
		throw new AppNotFoundError({
			message: `Application: ${appName} not found`,
		});
	}

	const recomputedPrivateKey = appKey.apiSecret;

	// Check if the recomputed hashes match the original API key and secret
	return hashKeys(apiSecret) === recomputedPrivateKey;
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
				return res.status(HTTP_STATUS_CODES.CONFLICT).json({
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

		return res.status(HTTP_STATUS_CODES.CREATED).json({
			success: true,
			message: `Application: ${appName} has been successfully authorized`,
			apiSecret,
		});
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

router.post("/apps/verify", async (req: Request, res: Response) => {
	try {
		const isApiSecretValid = await verify(req.body);

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

export const LogAPIController = router;
