import z from "zod";
import { validateSpec } from "../utils/validate.util";
import {
	createSecretKey,
	generateOTP,
	hashKeys,
	hashOTPs,
	sendOTP,
} from "../utils/security.util";
import { services } from "../db";
import { AppKey, AppKeyStatus, OTP, User } from "../entities";
import { HTTPError, NotFoundError } from "../utils/error.util";
import constantsUtil from "../utils/constants.util";
import { IAppKey } from "../interfaces";

const { HTTP_STATUS_CODES } = constantsUtil;

export const loginService = async (params: Record<string, any>) => {
	const spec = z
		.object({
			email: z.string().email(),
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { email } = validateSpec<specType>(spec, params);

	let user = await services.users.findOne({ email });
	const generatedOTP = generateOTP();

	if (!user) {
		user = new User(email);
		services.em.persist(user);
	}
	const otp = new OTP(hashOTPs(generatedOTP), user);
	services.em.persist(otp);
	await services.em.flush();
	// Simulate sending email
	sendOTP(generatedOTP, email);

	let existingApps = await services.appKeys.find({ user });
	return { generatedOTP, email, existingApps };
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

export const authorizeService = async (params: Record<string, any>) => {
	const spec = z
		.object({
			email: z.string().email(),
			appName: z.string(),
			expires: z.number().int().min(1).default(10),
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { email, appName, expires } = validateSpec<specType>(spec, params);

	const expiresinMiliSecs = Date.now() + expires * 1000;
	const apiSecret = createSecretKey(appName);
	const hashedApiSecret = hashKeys(apiSecret);
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

		existingAppKey.apiSecret = hashedApiSecret;
		existingAppKey.expires = Date.now() + expires * 1000;
	} else {
		let appKey = new AppKey(
			appName,
			hashedApiSecret,
			expiresinMiliSecs,
			AppKeyStatus.ACTIVE,
			user
		);

		services.appKeys.create(appKey as IAppKey);
		services.em.persist(appKey);
	}
	await services.em.flush();

	return { appName, apiSecret, email };
};
