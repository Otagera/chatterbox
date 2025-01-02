import { AppKeyStatus } from "../entities";
import { IBaseEntity } from "./IBaseEntity";

export interface IAppKey extends IBaseEntity {
	appName: string;

	apiSecret: string;

	config?: string;

	expires: number;

	status: AppKeyStatus;
}
