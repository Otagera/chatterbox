import { IBaseEntity } from "./IBaseEntity";

export interface ILog extends IBaseLog, IBaseEntity {}

export interface IBaseLog {
	level: string;
	name: string;
	context?: object;
	time: Date;
	data?: object | string;
	traceId?: string;
	request?: string;
	response?: string;
	timeTaken?: string;
	key: string;
	appName: string;
}
