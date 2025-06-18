import {
	generateOTP,
	createChecksum,
	hashKeys,
	hashOTPs,
	createSecretKey,
	maskKey,
	encrypt,
	decrypt,
	getKeyAndIV,
} from "../../utils/security.util";

describe("Security Utilities", () => {
	// Test OTP Generation
	describe("generateOTP", () => {
		it("should generate an OTP of the specified length", () => {
			const otp = generateOTP(6);
			expect(otp).toHaveLength(6);
			expect(otp).toMatch(/^[0-9]{6}$/);
		});

		it("should generate an 8-digit OTP when asked", () => {
			const otp = generateOTP(8);
			expect(otp).toHaveLength(8);
			expect(otp).toMatch(/^[0-9]{8}$/);
		});
	});

	// Test Hashing Functions
	describe("Hashing Functions", () => {
		it("should produce a consistent checksum for the same input", () => {
			const appName = "test-app";
			const checksum1 = createChecksum(appName);
			const checksum2 = createChecksum(appName);
			expect(checksum1).toBe(checksum2);
			expect(checksum1).not.toBe(createChecksum("another-app"));
		});

		it("should produce a consistent hash for the same key", () => {
			const key = "some_secret_key";
			const hash1 = hashKeys(key);
			const hash2 = hashKeys(key);
			expect(hash1).toBe(hash2);
			expect(hash1).not.toBe(hashKeys("another_key"));
		});

		it("should produce a consistent hash for the same OTP", () => {
			const otp = "123456";
			const hash1 = hashOTPs(otp);
			const hash2 = hashOTPs(otp);
			expect(hash1).toBe(hash2);
			expect(hash1).not.toBe(hashOTPs("654321"));
		});
	});

	// Test Key Generation and Masking
	describe("Key Generation and Masking", () => {
		it("should create a secret key with the correct format", () => {
			const appName = "my-awesome-app";
			const secretKey = createSecretKey(appName);
			expect(secretKey).toMatch(/^chbxsk_.*_ZEE$/);
		});

		it("should mask a key correctly", () => {
			const key = "chbxsk_someverylongkeygoeshere_ZEE";
			const masked = maskKey(key);
			expect(masked).toBe("chbxsk_XXXXXXXXXXXXX_ZEE");
		});
	});

	// Test Encryption/Decryption
	describe("Encryption and Decryption", () => {
		const appId = "app-id-for-encryption";
		const plaintext = "This is a secret message.";
		const plainObject = { user: "test", permissions: ["read", "write"] };

		it("should encrypt and decrypt a string successfully", () => {
			const encrypted = encrypt(plaintext, appId);
			expect(encrypted).not.toBe(plaintext);

			const decrypted = decrypt(encrypted, appId);
			expect(decrypted).toBe(plaintext);
		});

		it("should encrypt and decrypt an object successfully", () => {
			const encryptedObj = encrypt(JSON.stringify(plainObject), appId);
			const decryptedObj = JSON.parse(decrypt(encryptedObj, appId));

			expect(decryptedObj).toEqual(plainObject);
		});

		it("should fail decryption with the wrong appId", () => {
			const encrypted = encrypt(plaintext, appId);
			// Decryption should throw an error or return garbage with the wrong key/iv
			expect(() => {
				decrypt(encrypted, "wrong-app-id");
			}).toThrow(); // Expecting an error due to bad padding or similar crypto error
		});
	});
});
