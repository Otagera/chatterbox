import { IncomingHttpHeaders } from "http";
import * as express from "express";

declare global {
	namespace Express {
		interface Request {
			isApiSecretValid?: boolean; // Use `?` if it can be optional, otherwise just `userId: string`.
		}
	}
}

declare module "http" {
	interface IncomingHttpHeaders {
		appName?: string;
	}
}
