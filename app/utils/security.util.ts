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
	// Deliver via email when email processing is enabled.
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

	// Dev convenience: when email delivery is off (or not configured), print the
	// OTP to the console so the login flow can still be completed locally. This
	// is guarded to non-production — the raw OTP must never be logged in prod.
	if (config.env !== "production") {
		console.log(`[dev] OTP for ${email} (app: ${appName}): ${otp}`);
	}
};

// Server-side pepper mixed into every hash. Empty string by default so hashes
// computed before this pepper was introduced remain valid; set HASH_PEPPER to
// rotate. Kept alongside the per-function domain-separation suffixes.
const pepper = config.hashPepper;

export const createChecksum = (appName: string) => {
	return crypto
		.createHash("sha256")
		.update(appName + pepper + "JZl04")
		.digest("hex");
};

export const hashKeys = (key: string) => {
	return crypto
		.createHash("sha256")
		.update(key + pepper + "LP90", "utf-8")
		.digest("hex");
};

export const hashOTPs = (otp: string) => {
	return crypto
		.createHash("sha256")
		.update(otp + pepper + "OTP90", "utf-8")
		.digest("hex");
};

export const hashLogintoken = (key: string) => {
	return crypto
		.createHash("sha256")
		.update(key + pepper + "ETR90", "utf-8")
		.digest("hex");
};

/**
 * Derives a 32-byte AES-256 key for a given application. The key is derived
 * from a server-held master secret (config.encryptionKey) using HKDF, with the
 * appId supplied as the salt/context. Because the master secret is required,
 * knowing only the (non-secret) appName is no longer enough to decrypt data.
 */
const deriveKey = (appId: string): Buffer => {
	const masterKey = crypto
		.createHash("sha256")
		.update(config.encryptionKey)
		.digest();
	const derived = crypto.hkdfSync(
		"sha256",
		masterKey,
		Buffer.from(appId, "utf-8"),
		Buffer.from("chatterbox-log-encryption", "utf-8"),
		32
	);
	return Buffer.from(derived);
};

// Marker prefix for the AES-256-GCM ciphertext format: v2.<iv>.<tag>.<data>
const CIPHERTEXT_PREFIX = "v2";

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
			// Not JSON — return the raw decrypted string.
			return decrypted;
		}
		// Any other error is unexpected; surface it rather than silently
		// returning undefined.
		throw error;
	}
};

/**
 * Encrypts a given text using AES-256-GCM with a random per-message IV and an
 * authentication tag. The key is derived from a server-held master secret, so
 * ciphertext is confidential even to someone who knows the appName.
 * @param {string} plaintext - The text to encrypt.
 * @param {string} appId - Application identifier used for key derivation.
 * @returns {string} - `v2.<iv>.<tag>.<ciphertext>`, each part base64-encoded.
 */
export const encrypt = (plaintext: string, appId: string): string => {
	const key = deriveKey(appId);
	const iv = crypto.randomBytes(12); // 96-bit nonce recommended for GCM
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return [
		CIPHERTEXT_PREFIX,
		iv.toString("base64"),
		tag.toString("base64"),
		encrypted.toString("base64"),
	].join(".");
};

/**
 * Decrypts a value produced by {@link encrypt}. Throws if the ciphertext format
 * is unrecognised, the appId is wrong, or the data has been tampered with (the
 * GCM auth tag fails to verify).
 * @param {string} ciphertext - `v2.<iv>.<tag>.<ciphertext>` string.
 * @param {string} appId - Application identifier used for key derivation.
 * @returns {string} - The decrypted text.
 */
export const decrypt = (ciphertext: string, appId: string): string => {
	const parts = ciphertext.split(".");
	if (parts.length !== 4 || parts[0] !== CIPHERTEXT_PREFIX) {
		throw new Error("Unsupported or malformed ciphertext format");
	}
	const [, ivB64, tagB64, dataB64] = parts;
	const key = deriveKey(appId);
	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		key,
		Buffer.from(ivB64, "base64")
	);
	decipher.setAuthTag(Buffer.from(tagB64, "base64"));
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(dataB64, "base64")),
		decipher.final(),
	]);
	return decrypted.toString("utf8");
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
