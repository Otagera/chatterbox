import { NextFunction, Request, Response } from "express";
import z from "zod";

import { validateSpec } from "../utils/validate.util";
import {
	AppNotFoundError,
	HTTPError,
	InvalidKeyError,
	OperationError,
} from "../utils/error.util";
import { services } from "../config/db";
import { hashKeys } from "../utils/security.util";
import constantsUtil from "../utils/constants.util";

const { HTTP_STATUS_CODES } = constantsUtil;

export const verifyService = async (params: {
	appName?: string;
	token?: string;
}) => {
	const spec = z
		.object({
			appName: z.string(),
			token: z.string(),
		})
		.required();
	type specType = z.infer<typeof spec>;
	const { appName, token } = validateSpec<specType>(spec, params);

	// Extract the appName and the public/private key data from the apiKey and token
	const [typeApiSecret, _privateKeyHashWithChecksum] = token.split("_");

	if (typeApiSecret !== "chbxtkn") {
		throw new InvalidKeyError({});
	}

	const appKey = await services.appKeys.findOne({ appName });
	if (!appKey) {
		throw new AppNotFoundError({
			message: `Application: ${appName} not found`,
		});
	}

	const recomputedPrivateKey = appKey.token;

	// Check if the recomputed hashes match the original API key and secret
	return hashKeys(token) === recomputedPrivateKey;
};
export const apiVerifyService = async (params: {
	appName?: string;
	apiSecret?: string;
}) => {
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

	const appKey = await services.appKeys.findOne({ appName });
	if (!appKey) {
		throw new AppNotFoundError({
			message: `Application: ${appName} not found`,
		});
	}

	const recomputedPrivateKey = appKey.apiSecret;

	// Check if the recomputed hashes match the original API key and secret
	return hashKeys(apiSecret) === recomputedPrivateKey;
};

// middleware
export const authMiddleware = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { user, appName } = req.session;
	try {
		if (user) {
			let token = user;

			const isTokenValid = await verifyService({
				token,
				appName,
			});

			if (isTokenValid) {
				req.appName = appName;
				return next();
			}

			throw new HTTPError({});
		} else {
			throw new OperationError({ message: "Unauthorized request." });
		}
	} catch (error) {
		return res.send(`
        <html>
          <head>
            <title>Redirecting...</title>
            <script>
              setTimeout(() => {
                window.location.href = '/login';
              }, 3000); // Redirect after 3 seconds
            </script>
          </head>
          <body>
            <h1>Please wait, you are being redirected...</h1>
            <p>If you are not redirected automatically, <a href="/login">click here</a>.</p>
          </body>
        </html>
      `);
	}
};
export const apiAuthMiddleware = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { authorization: token, appname } = req.headers;
	try {
		if (token) {
			let apiSecret = "";
			if (token && token.startsWith("Bearer ")) {
				apiSecret = token.split(" ")[1];
			}
			const isApiSecretValid = await apiVerifyService({
				apiSecret,
				appName: appname,
			});

			if (isApiSecretValid) {
				req.body.log.appName = appname;
				req.appName = appname;
				return next();
			}

			throw new HTTPError({});
		} else {
			throw new OperationError({ message: "Unauthorized request." });
		}
	} catch (error) {
		if (error instanceof HTTPError) {
			return res.status(error?.statusCode).json({
				status: "error",
				message: error?.message,
			});
		} else {
			return res.status(HTTP_STATUS_CODES.UNAUTHORIZED).json({
				status: "error",
				message: "Unauthorized request, please provide a valid secret key.",
			});
		}
	}
};
