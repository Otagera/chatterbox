import { IBaseEntity } from "./IBaseEntity";

export interface IUser extends IBaseEntity {
	email: string;
	loginToken?: string;
}
