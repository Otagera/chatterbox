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

	@Property()
	expiresAt: Date;

	constructor(
		otp: string,
		user: User,
		expiresAt: Date,
		status = OTPStatus.ACTIVE
	) {
		super();
		this.otp = otp;
		this.status = status;
		this.user = user;
		this.expiresAt = expiresAt;
	}
}
