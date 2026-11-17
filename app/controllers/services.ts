import z from "zod";
import { validateSpec } from "../utils/validate.util";
import {
	createLoginToken,
	createSecretKey,
	createToken,
	generateOTP,
	hashKeys,
	hashLogintoken,
	hashOTPs,
	sendOTP,
} from "../utils/security.util";
import { services } from "../config/db";
import { AppKey, AppKeyStatus, OTP, OTPStatus, User } from "../entities";
import { HTTPError, NotFoundError } from "../utils/error.util";
import constantsUtil from "../utils/constants.util";
import logger from "../utils/logger.util";

const { HTTP_STATUS_CODES } = constantsUtil;

// How long a generated OTP remains valid before it must be re-requested.
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const generateSaveAndSendOTP = async (user: User, appName: string) => {
	// Invalidate any previously issued OTPs for this user so only the most
	// recent one is ever valid (limits replay / brute-force surface).
	await services.OTPs.nativeDelete({ user });

	const generatedOTP = generateOTP();
	const expiresAt = new Date(Date.now() + OTP_TTL_MS);
	const otp = new OTP(hashOTPs(generatedOTP), user, expiresAt);
	services.em.persist(otp);
	await services.em.flush();

	logger.info({ userId: user.id, appName }, "OTP-GENERATED-AND-SAVED");
	await sendOTP(generatedOTP, user.email, appName);
};

// Add password to this cause the original idea was to be password-less
// but there has been a significant gap between email and OTP right
// now so I would need to add password for better security
export const loginService = async (params: Record<string, any>) => {
	const spec = z
		.object({
			email: z.string().email(),
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { email } = validateSpec<specType>(spec, params);

	let user = await services.users.findOne({ email });
	const loginToken = createLoginToken(email);

	const hashedLoginToken = hashLogintoken(loginToken);

	if (!user) {
		user = new User(email, hashedLoginToken);
		services.em.persist(user);
	} else {
		user.loginToken = hashedLoginToken;
	}
	await services.em.flush();

	let existingApps = await services.appKeys.find({ user });

	return { email, existingApps, loginToken };
};

export const OTPService = async (params: Record<string, any>) => {
	const spec = z
		.object({
			otp: z.string(),
			email: z.string().email(),
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { otp, email } = validateSpec<specType>(spec, params);

	const user = await services.users.findOne({ email });
	if (!user) {
		// Do not reveal whether the account exists.
		logger.warn({ email }, "OTP-VALIDATION-INVALID");
		throw new Error("Invalid OTP");
	}

	const existingOTP = await services.OTPs.findOne({
		user,
		otp: hashOTPs(otp),
		status: OTPStatus.ACTIVE,
	});
	// Never log the raw OTP — it is a sensitive credential.
	if (!existingOTP) {
		logger.warn({ email }, "OTP-VALIDATION-INVALID");
		throw new Error("Invalid OTP");
	}

	if (existingOTP.expiresAt.getTime() < Date.now()) {
		// Expired — consume it so it cannot be retried and force re-request.
		await services.em.removeAndFlush(existingOTP);
		logger.warn({ email }, "OTP-VALIDATION-EXPIRED");
		throw new Error("OTP has expired, please request a new one");
	}

	// Single-use: consume the OTP on successful verification.
	await services.em.removeAndFlush(existingOTP);
};

export const createApplication = async (params: Record<string, any>) => {
	const spec = z
		.object({
			email: z.string().email(),
			// Restrict the charset at creation time as defense-in-depth: appName is
			// interpolated into HTML in many places, so keeping it to a safe set
			// neutralises app-name-based injection regardless of output context.
			appName: z
				.string()
				.regex(
					/^[A-Za-z0-9 _.-]+$/,
					"App name may only contain letters, numbers, spaces, and _ . -"
				),
			expires: z.coerce.number().int().min(1).default(31536000), // seconds (default: 1 year)
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { email, appName, expires } = validateSpec<specType>(spec, params);

	const user = await services.users.findOne({ email });
	if (!user) {
		logger.warn({ email }, "APP-CREATION-USER-NOT-FOUND");
		throw new NotFoundError({ message: `User: ${email} not found` });
	}
	const expiresinMiliSecs = Date.now() + expires * 1000;
	const token = createToken(appName);
	const apiSecret = createSecretKey(appName);
	const hashedToken = hashKeys(token);
	const hashedApiSecret = hashKeys(apiSecret);
	let appKey = new AppKey(
		appName,
		hashedToken,
		hashedApiSecret,
		expiresinMiliSecs,
		AppKeyStatus.ACTIVE,
		user
	);

	// Persist AND flush: callers such as POST /api/users/apps return the
	// apiSecret immediately, so the AppKey must actually be written to the
	// database here — otherwise later authentication fails with "not found".
	services.em.persist(appKey);
	await services.em.flush();
	return { appName, token, apiSecret, email };
};

export const authorizeService = async (params: Record<string, any>) => {
	const spec = z
		.object({
			email: z.string().email(),
			appName: z.string(),
			expires: z.coerce.number().int().min(1).default(31536000), // seconds (default: 1 year)
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { email, appName, expires } = validateSpec<specType>(spec, params);

	const token = createToken(appName);
	const hashedToken = hashKeys(token);
	const user = await services.users.findOne({ email });

	if (!user) {
		throw new NotFoundError({ message: `User: ${email} not found` });
	}
	const existingAppKey = await services.appKeys.findOne({ appName, user });

	if (existingAppKey) {
		existingAppKey.token = hashedToken;
	} else {
		await createApplication({ email, appName, expires });
	}
	await services.em.flush();

	return { appName, token, email };
};

export const apiAuthorizeService = async (
	params: Record<string, any>,
	options: { rotate?: boolean } = {}
) => {
	const spec = z
		.object({
			email: z.string().email(),
			appName: z.string(),
			expires: z.coerce.number().int().min(1).default(31536000), // seconds (default: 1 year)
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { email, appName, expires } = validateSpec<specType>(spec, params);

	const apiSecret = createSecretKey(appName);
	const hashedApiSecret = hashKeys(apiSecret);
	const user = await services.users.findOne({ email });

	if (!user) {
		throw new NotFoundError({ message: `User: ${email} not found.` });
	}
	const existingAppKey = await services.appKeys.findOne({ appName, user });

	if (!existingAppKey) {
		throw new HTTPError({
			statusCode: HTTP_STATUS_CODES.CONFLICT,
			message: `Application: ${appName} doesn't exist.`,
		});
	}
	const appKeyIsActive =
		existingAppKey.status === "active" && existingAppKey.expires > Date.now();

	if (appKeyIsActive && !options.rotate) {
		throw new HTTPError({
			statusCode: HTTP_STATUS_CODES.CONFLICT,
			message: `Application: ${appName} has already been authorized.`,
		});
	}

	existingAppKey.apiSecret = hashedApiSecret;
	existingAppKey.status = AppKeyStatus.ACTIVE;
	existingAppKey.expires = Date.now() + expires * 1000;

	await services.em.flush();

	return { appName, apiSecret, email };
};
