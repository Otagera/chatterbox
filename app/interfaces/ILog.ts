import { IBaseEntity } from "./IBaseEntity";

export interface ILog extends IBaseLog, IBaseEntity {}

export interface IBaseLog {
	level: string;
	name: string;
	context?: object;
	time: Date;
	data?: object;
	traceId?: string;
	request?: string;
	response?: string;
	timeTaken?: string;
	key: string;
	appName: string;
}
