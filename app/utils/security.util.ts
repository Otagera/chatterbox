import crypto from "crypto";
import { queueServices } from "../queue/queue.service";
import config from "../config/config";

export const generateOTP = (length = 6) => {
	if (!Number.isInteger(length) || length <= 0) {
		throw new Error("Length must be a positive integer");
	}

	let otp = "";
	for (let i = 0; i < length; i++) {
		otp += crypto.randomInt(10); // Generate a digit between 0-9
	}
	return otp;
};

export const sendOTP = async (otp: string, email: string, appName: string) => {
	console.log(`email: ${email} -> otp: ${otp}`);
	if (config.processEmails) {
		queueServices.emailQueueLib.addJob("sendOTPEmail", {
			meta: {
				email,
				otp,
				appName,
			},
			worker: "sendOTPEmail",
		});
	}
};

export const createChecksum = (appName: string) => {
	return crypto
		.createHash("sha256")
		.update(appName + "JZl04")
		.digest("hex");
};

export const hashKeys = (key: string) => {
	return crypto
		.createHash("sha256")
		.update(key + "LP90", "utf-8")
		.digest("hex");
};

export const hashOTPs = (otp: string) => {
	return crypto
		.createHash("sha256")
		.update(otp + "OTP90", "utf-8")
		.digest("hex");
};

export const hashLogintoken = (key: string) => {
	return crypto
		.createHash("sha256")
		.update(key + "ETR90", "utf-8")
		.digest("hex");
};

export const getKeyAndIV = (id: string) => {
	const key = crypto.createHash("sha256").update(id).digest(); // 32 bytes for AES-256
	const iv = crypto.createHash("md5").update(id).digest();
	return { key, iv };
};

export const encryptObj = (obj: Record<string, any>, appId: string) =>
	encrypt(JSON.stringify(obj), appId);
export const decryptObj = (
	ciphertext: string,
	appId: string
): Record<string, any> | string | undefined => {
	const decrypted = decrypt(ciphertext, appId);
	try {
		const obj = JSON.parse(decrypted);
		return obj;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return decrypted;
		}
	}
};

/**
 * Encrypts a given text using AES-256-CBC.
 * @param {string} plaintext - The text to encrypt.
 * @returns {string} - The encrypted text in base64 format.
 */
export const encrypt = (plaintext: string, appId: string): string => {
	const { key, iv } = getKeyAndIV(appId);
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
export const decrypt = (ciphertext: string, appId: string): string => {
	const { key, iv } = getKeyAndIV(appId);
	const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
	let decrypted = decipher.update(ciphertext, "base64", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
};

export const createSecretKey = (appName: string) => {
	const checkSum = createChecksum(appName);
	const apiKey = crypto.randomBytes(24).toString("base64url");

	return `chbxsk_${apiKey}${checkSum}_ZEE`;
};

export const createToken = (appName: string) => {
	const checkSum = createChecksum(appName);
	const apiKey = crypto.randomBytes(24).toString("base64url");

	return `chbxtkn_${apiKey}${checkSum}_ZEE`;
};

export const createLoginToken = (email: string) => {
	const checkSum = createChecksum(email);
	const apiKey = crypto.randomBytes(24).toString("base64url");

	return `${apiKey}${checkSum}_ETR`;
};

export const maskKey = (key: string) => {
	const spliter = key.split("_");
	return `${spliter[0]}_XXXXXXXXXXXXX_${spliter[spliter.length - 1]}`;
};
