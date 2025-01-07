import { OTPStatus } from "../entities";
import { IBaseEntity } from "./IBaseEntity";
import { IUser } from "./IUser";

export interface IOTP extends IBaseEntity {
	otp: string;

	user: IUser;

	status: OTPStatus;
}
