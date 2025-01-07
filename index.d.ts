import { IncomingHttpHeaders } from "http";
import * as express from "express";

declare global {
	namespace Express {
		interface Request {
			isApiSecretValid?: boolean;
			appName?: string;
		}
	}
}

declare module "http" {
	interface IncomingHttpHeaders {
		appname?: string;
	}
}
