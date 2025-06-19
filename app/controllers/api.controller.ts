import { Request, Response } from "express";
import Router from "express-promise-router";
import { ZodError, z } from "zod";

import { services } from "../config/db";
import { ILog } from "../interfaces";
import { AppKeyStatus } from "../entities";
import { HTTPError } from "../utils/error.util";
import constantsUtil from "../utils/constants.util";
import {
	apiAuthMiddleware,
	verifyService,
} from "../middlewares/auth.middleware";
import { encrypt, encryptObj, hashLogintoken } from "../utils/security.util";
import { validateSpec } from "../utils/validate.util";
import {
	OTPService,
	apiAuthorizeService,
	createApplication,
	generateSaveAndSendOTP,
	loginService,
} from "./services";
import logger from "../utils/logger.util";

const { HTTP_STATUS_CODES } = constantsUtil;
const router = Router();

const Keys = z.union([z.string(), z.number(), z.symbol()]);
const AnyObject = z.record(Keys, z.unknown());
const logSpec = z.object({
	level: z.string(),
	name: z.string(),
	context: z.union([AnyObject.optional(), z.string()]).optional(),
	time: z.union([z.date(), z.number()]),
	data: z.union([AnyObject, z.string()]).optional(),
	traceId: z.string().optional(),
	request: z.union([
		z
			.object({
				id: z.string(),
				method: z.string(),
				url: z.string(),
				query: AnyObject.optional(),
				params: AnyObject.optional(),
				headers: z.string().optional(),
				remoteAddress: z.string().optional(),
				remotePort: z.string().optional(),
			})
			.optional(),
		z.string(),
	]),
	response: z.union([
		z
			.object({
				statusCode: z.number(),
				headers: z.string(),
			})
			.optional(),
		z.string(),
	]),
	error: z
		.object({
			type: z.string().optional(),
			message: z.string().optional(),
			stack: z.string().optional(),
		})
		.optional(),
	timeTaken: z.union([z.date(), z.number()]).optional(),
	key: z.string(),
	appName: z.string(),
});

/**
 * @route POST /logs
 * @description Creates a single log entry. Requires authentication.
 * Encrypts log data if an appKey is found.
 */
router.post("/logs", apiAuthMiddleware, async (req: Request, res: Response) => {
	try {
		const logParam = req.body?.log;
		type specType = z.infer<typeof logSpec>;
		const log = validateSpec<specType>(logSpec, logParam);
		const appKey = req.appKey;

		if (log.data && appKey?.appName) {
			if (typeof log.data === "string") {
				log.data = encrypt(log.data, appKey.appName);
			} else {
				log.data = encryptObj(log.data, appKey.appName);
			}
		}

		services.logs.create(log as ILog);
		await services.em.flush();
		logger.info({ appName: appKey?.appName }, "LOG-INGESTION-SUCCESS");
		return res
			.status(HTTP_STATUS_CODES.OK)
			.json({ success: true, message: "Logged successfully" });
	} catch (error) {
		logger.error(
			{ appName: req.appKey?.appName, error },
			"LOG-INGESTION-FAILED"
		);
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

/**
 * @route POST /logs/bulk
 * @description Creates multiple log entries from an array of logs.
 */
router.post(
	"/logs/bulk",
	apiAuthMiddleware,
	async (req: Request, res: Response) => {
		try {
			const logsParam = req.body?.logs;
			const logsSpec = z.array(logSpec);
			type specType = z.infer<typeof logsSpec>;
			const logs = validateSpec<specType>(logsSpec, logsParam);

			const appKey = req.appKey;

			logs.forEach((log) => {
				if (log.data && appKey?.appName) {
					if (typeof log.data === "string") {
						log.data = encrypt(log.data, appKey.appName);
					} else {
						log.data = encryptObj(log.data, appKey.appName);
					}
				}
				services.logs.create(log as ILog);
			});
			await services.em.flush();

			// I am commenting this out because it creates a circular logging call.
			// logger.info(
			// 	{ appName: appKey?.appName, count: logs.length },
			// 	"BULK-LOG-INGESTION-SUCCESS"
			// );
			return res
				.status(HTTP_STATUS_CODES.OK)
				.json({ success: true, message: "Bulk Logs successfully" });
		} catch (error) {
			logger.error(
				{ appName: req.appKey?.appName, error },
				"BULK-LOG-INGESTION-FAILED"
			);
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
	}
);

/**
 * @route POST /users/login
 * @description Initiates user login process by sending an OTP.
 * Returns a login token and a list of existing applications for the user.
 */
router.post("/users/login", async (req: Request, res: Response) => {
	try {
		const spec = z.object({
			email: z.string().email(),
		});
		type specType = z.infer<typeof spec>;
		const body = validateSpec<specType>(spec, req.body);
		const { email, existingApps, loginToken } = await loginService(body);

		logger.info({ email }, "API-LOGIN-INITIATED");
		return res.status(HTTP_STATUS_CODES.CREATED).json({
			success: true,
			message: `User: ${email} OTP sent successfully`,
			loginToken,
			existingApps,
		});
	} catch (error) {
		logger.error(
			{ email: req.body.email, error },
			"API-LOGIN-INITIATION-FAILED"
		);
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

/**
 * @function sendLoginOTP
 * @description Finds a user by appName and loginToken, then generates and sends an OTP to the user.
 * @param {string} appName - The name of the application.
 * @param {string} loginToken - The user's login token.
 * @returns {Promise<boolean>} True if OTP was sent successfully.
 * @throws {Error} If login fails (e.g., user or app not found).
 */
const sendLoginOTP = async (appName: string, loginToken: string) => {
	const app = await services.appKeys.findOne({
		appName: appName as string,
	});
	const user = await services.users.findOne({
		id: app?.user.id,
		loginToken: hashLogintoken(loginToken as string),
	});
	if (user) {
		await generateSaveAndSendOTP(user, appName);

		return true;
	}
	throw new Error("Login failed, please try again");
};

/**
 * @route POST /users/apps
 * @description Creates a new application for a user and returns an API secret.
 */
router.post("/users/apps", async (req: Request, res: Response) => {
	try {
		const spec = z
			.object({
				email: z.string().email(),
				appName: z.string(),
				expires: z.coerce.number().int().min(1).default(10),
			})
			.required();
		type specType = z.infer<typeof spec>;
		const body = validateSpec<specType>(spec, req.body);
		const { appName, apiSecret } = await createApplication(body);

		logger.info({ appName, email: req.body.email }, "API-APP-CREATION-SUCCESS");
		return res.status(HTTP_STATUS_CODES.CREATED).json({
			success: true,
			message: `Application: ${appName} has been successfully created & authorized`,
			apiSecret,
		});
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

/**
 * @route GET /users/apps
 * @description Sends an OTP for logging into an existing application.
 * Requires appName and loginToken as query parameters.
 */
router.get("/users/apps", async (req: Request, res: Response) => {
	try {
		const spec = z.object({
			appName: z.string(),
			loginToken: z.string(),
		});
		type specType = z.infer<typeof spec>;
		const query = validateSpec<specType>(spec, req.query);
		const { appName, loginToken } = query;

		if (appName && loginToken) {
			const otpSent = await sendLoginOTP(
				appName as string,
				loginToken as string
			);
			if (otpSent) {
				logger.info({ appName }, "API-OTP-REQUEST-SUCCESS");
				return res.status(HTTP_STATUS_CODES.CREATED).json({
					success: true,
					message: `OTP for Application: ${appName} has been sent`,
				});
			}
			throw new Error("Existing - Something went wrong!!!");
		}
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

/**
 * @route POST /users/otp
 * @description Verifies the OTP provided by the user and returns an API secret upon success.
 */
router.post("/users/otp", async (req: Request, res: Response) => {
	try {
		const spec = z.object({
			otp: z.string(),
			email: z.string().email(),
			appName: z.string(),
		});
		type specType = z.infer<typeof spec>;
		const body = validateSpec<specType>(spec, req.body);
		await OTPService(req.body);
		const { apiSecret } = await apiAuthorizeService(body);

		logger.info(
			{ email: req.body.email, appName: req.body.appName },
			"API-OTP-VERIFICATION-SUCCESS"
		);
		return res.status(HTTP_STATUS_CODES.OK).json({
			success: true,
			message: `OTP success...`,
			apiSecret,
		});
	} catch (error) {
		logger.error(
			{ email: req.body.email, appName: req.body.appName, error },
			"API-OTP-VERIFICATION-FAILED"
		);
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

/**
 * @route POST /apps/authorize
 * @description Authorizes an application and returns an API secret.
 * Typically used for the initial setup or re-authorization of an application.
 */
router.post("/apps/authorize", async (req: Request, res: Response) => {
	try {
		const spec = z
			.object({
				email: z.string().email(),
				appName: z.string(),
				expires: z.coerce.number().int().min(1).default(10),
			})
			.required();
		type specType = z.infer<typeof spec>;
		const body = validateSpec<specType>(spec, req.body);
		const { appName, apiSecret } = await apiAuthorizeService(body);

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

/**
 * @route POST /apps/verify
 * @description Verifies if a provided API secret is valid for an application.
 */
router.post("/apps/verify", async (req: Request, res: Response) => {
	try {
		const spec = z
			.object({
				appName: z.string(),
				token: z.string(),
				email: z.string().email(),
			})
			.required();
		type specType = z.infer<typeof spec>;
		const body = validateSpec<specType>(spec, req.body);
		const isApiSecretValid = await verifyService(body);

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

/**
 * @route POST /apps/revoke
 * @description Revokes access for an application by disabling its AppKey.
 */
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

		// Bug: Should likely return a success message here if revocation is successful
		logger.warn({ appName }, "API-APP-REVOCATION-SUCCESS");
		return res.status(HTTP_STATUS_CODES.OK).json({
			success: true,
			message: `Application: ${appName} has been revoked`,
		});
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE).json({
			success: false,
			message: "API secret revocation not successfully",
		});
	}
});

export const APIController = router;
