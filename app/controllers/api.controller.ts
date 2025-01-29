import { Request, Response } from "express";
import Router from "express-promise-router";
import { ZodError, z } from "zod";

import { services } from "../db";
import { ILog } from "../interfaces";
import { AppKeyStatus } from "../entities";
import { HTTPError } from "../utils/error.util";
import constantsUtil from "../utils/constants.util";
import { authMiddleware, verifyService } from "../middlewares/auth.middleware";
import { encrypt, encryptObj, hashLogintoken } from "../utils/security.util";
import { validateSpec } from "../utils/validate.util";
import {
	OTPService,
	authorizeService,
	generateSaveAndSendOTP,
	loginService,
} from "./services";

const { HTTP_STATUS_CODES } = constantsUtil;
const router = Router();

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
		const { email, existingApps, loginToken } = await loginService(req.body);
		return res.status(HTTP_STATUS_CODES.CREATED).json({
			success: true,
			message: `User: ${email} OTP sent successfully`,
			loginToken,
			existingApps,
		});
	} catch (error) {
		return res.status(HTTP_STATUS_CODES.SERVER_ERROR).json({
			success: false,
			message: `Application has not been authorized successfully`,
		});
	}
});

const sendLoginOTP = async (appName: string, loginToken: string) => {
	const app = await services.appKeys.findOne({
		appName: appName as string,
	});
	const user = await services.users.findOne({
		id: app?.user.id,
		loginToken: hashLogintoken(loginToken as string),
	});
	if (user) {
		await generateSaveAndSendOTP(user);

		return true;
	}
	throw new Error("Login failed, please try again");
};

// Create new app
router.post("/users/apps", async (req: Request, res: Response) => {
	try {
		const { appName, apiSecret } = await authorizeService(req.body);

		return res.status(HTTP_STATUS_CODES.CREATED).json({
			success: true,
			message: `Application: ${appName} has been successfully created & authorized`,
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

// Login to existing app
router.get("/users/apps", async (req: Request, res: Response) => {
	try {
		const { appName, loginToken } = req.query;

		if (appName && loginToken) {
			const otpSent = await sendLoginOTP(
				appName as string,
				loginToken as string
			);
			if (otpSent) {
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

router.post("/users/otp", async (req: Request, res: Response) => {
	try {
		await OTPService(req.body);
		const { apiSecret } = await authorizeService(req.body);

		return res.status(HTTP_STATUS_CODES.OK).json({
			success: true,
			message: `OTP success...`,
			apiSecret,
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
