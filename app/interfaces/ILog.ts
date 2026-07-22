import { IBaseEntity } from "./IBaseEntity";

export interface ILog extends IBaseLog, IBaseEntity {}

export interface IBaseLog {
	level: string;
	name: string;
	context?: object;
	time: Date;
	data?: object | string;
	traceId?: string;
	request?: Record<string, any> | string;
	response?: Record<string, any> | string;
	timeTaken?: number | string;
	key: string;
	appName: string;
}
