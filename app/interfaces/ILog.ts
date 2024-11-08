import { IBaseEntity } from "./IBaseEntity";

export interface ILog extends IBaseEntity {
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
}
