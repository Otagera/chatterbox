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
import { services } from "../db";
import { AppKey, AppKeyStatus, OTP, User } from "../entities";
import { HTTPError, NotFoundError } from "../utils/error.util";
import constantsUtil from "../utils/constants.util";
import { IAppKey } from "../interfaces";

const { HTTP_STATUS_CODES } = constantsUtil;

export const generateSaveAndSendOTP = async (user: User) => {
	const generatedOTP = generateOTP();
	const otp = new OTP(hashOTPs(generatedOTP), user);
	services.em.persist(otp);
	await services.em.flush();
	// Simulate sending email
	sendOTP(generatedOTP, user.email);
};

// Add password to this cause the original idea was to be passwordless
// but there has been a significante gap between email and OTP right
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

	let user = await services.users.findOne({ email });
	let existingOTP = await services.OTPs.findOne({ user, otp: hashOTPs(otp) });
	if (!existingOTP) {
		throw new Error("Invalid OTP");
	}
};

export const createApplication = async (params: Record<string, any>) => {
	const spec = z
		.object({
			email: z.string().email(),
			appName: z.string(),
			expires: z.coerce.number().int().min(1).default(10),
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { email, appName, expires } = validateSpec<specType>(spec, params);

	const user = await services.users.findOne({ email });
	if (!user) {
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

	services.appKeys.create(appKey as IAppKey);
	services.em.persist(appKey);
	return { appName, token, apiSecret, email };
};

export const authorizeService = async (params: Record<string, any>) => {
	const spec = z
		.object({
			email: z.string().email(),
			appName: z.string(),
			expires: z.coerce.number().int().min(1).default(10),
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
		const appKeyIsActive =
			existingAppKey.status === "active" && existingAppKey.expires > Date.now();

		if (appKeyIsActive) {
			throw new HTTPError({
				statusCode: HTTP_STATUS_CODES.CONFLICT,
				message: `Application: ${appName} has already been authorized`,
			});
		}

		existingAppKey.token = hashedToken;
		existingAppKey.expires = Date.now() + expires * 1000;
	} else {
		await createApplication({ email, appName, expires });
	}
	await services.em.flush();

	return { appName, token, email };
};

export const apiAuthorizeService = async (params: Record<string, any>) => {
	const spec = z
		.object({
			email: z.string().email(),
			appName: z.string(),
			expires: z.coerce.number().int().min(1).default(10),
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

	if (appKeyIsActive) {
		throw new HTTPError({
			statusCode: HTTP_STATUS_CODES.CONFLICT,
			message: `Application: ${appName} has already been authorized.`,
		});
	}

	existingAppKey.apiSecret = hashedApiSecret;
	existingAppKey.expires = Date.now() + expires * 1000;

	await services.em.flush();

	return { appName, apiSecret, email };
};
