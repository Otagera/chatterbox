import { IncomingHttpHeaders } from "http";
import * as express from "express";
import session from "express-session";

declare module "express-session" {
	export interface SessionData {
		user: string;
		email: string;
		appName: string;
	}
}

declare global {
	namespace Express {
		interface Request {
			isApiSecretValid?: boolean;
			appName?: string;
			isBrowser?: boolean;
		}
	}
}

declare module "http" {
	interface IncomingHttpHeaders {
		appname?: string;
	}
}
