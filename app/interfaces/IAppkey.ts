import { AppKeyStatus } from "../entities";
import { IBaseEntity } from "./IBaseEntity";
import { IUser } from "./IUser";

export interface IAppKey extends IBaseEntity {
	appName: string;

	token: string;

	apiSecret: string;

	config?: string;

	expires: number;

	status: AppKeyStatus;

	user: IUser;
}
