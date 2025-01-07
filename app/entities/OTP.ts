import { Entity, Enum, ManyToOne, Property } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";
import { User } from "./User";

export enum OTPStatus {
	ACTIVE = "active",
	DISABLED = "disabled",
}

@Entity({ tableName: "otp" })
export class OTP extends BaseEntity {
	@Property()
	otp: string;

	@ManyToOne({ entity: () => User, nullable: true })
	user: User;

	@Enum({ items: () => OTPStatus, default: OTPStatus.ACTIVE })
	status: OTPStatus = OTPStatus.ACTIVE;

	constructor(otp: string, user: User, status = OTPStatus.ACTIVE) {
		super();
		this.otp = otp;
		this.status = status;
		this.user = user;
	}
}
