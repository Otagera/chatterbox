import { Entity, Enum, ManyToOne, Property, Unique } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";
import { User } from "./User";

export enum AppKeyStatus {
	ACTIVE = "active",
	DISABLED = "disabled",
}

@Entity({ tableName: "appKey" })
@Unique({ properties: ["appName", "user"] })
export class AppKey extends BaseEntity {
	@Property()
	appName: string;

	@Property()
	token: string;

	@Property()
	apiSecret: string;

	@Property()
	expires: number;

	@Enum({ items: () => AppKeyStatus, default: AppKeyStatus.ACTIVE })
	status: AppKeyStatus = AppKeyStatus.ACTIVE;

	@ManyToOne({ entity: () => User, nullable: true })
	user: User;

	@Property({ nullable: true })
	config?: string;

	constructor(
		appName: string,
		token: string,
		apiSecret: string,
		expires: number,
		status: AppKeyStatus,
		user: User,
		config?: string
	) {
		super();
		this.appName = appName;
		this.token = token;
		this.apiSecret = apiSecret;
		this.expires = expires;
		this.status = status;
		this.user = user;
		this.config = config;
	}
}
