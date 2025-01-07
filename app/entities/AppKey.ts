import { Entity, Enum, ManyToOne, Property, Unique } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";
import { User } from "./User";

export enum AppKeyStatus {
	ACTIVE = "active",
	DISABLED = "disabled",
}

@Entity({ tableName: "appKey" })
export class AppKey extends BaseEntity {
	@Property()
	@Unique()
	appName: string;

	@Property()
	apiSecret: string;

	@Property()
	config?: string;

	@Property()
	expires: number;

	@Enum({ items: () => AppKeyStatus, default: AppKeyStatus.ACTIVE })
	status: AppKeyStatus = AppKeyStatus.ACTIVE;

	@ManyToOne({ entity: () => User, nullable: true })
	user: User;

	constructor(
		appName: string,
		apiSecret: string,
		config: string,
		expires: number,
		status: AppKeyStatus,
		user: User
	) {
		super();
		this.appName = appName;
		this.apiSecret = apiSecret;
		this.config = config;
		this.expires = expires;
		this.status = status;
		this.user = user;
	}
}
