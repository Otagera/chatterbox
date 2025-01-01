import { Entity, Enum, Index, Property, Unique } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";

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
	apiKey: string;

	@Property()
	apiSecret: string;

	@Property()
	config: string;

	@Property()
	expires: number;

	@Enum({ items: () => AppKeyStatus, default: AppKeyStatus.ACTIVE })
	status: AppKeyStatus = AppKeyStatus.ACTIVE;

	constructor(
		appName: string,
		apiKey: string,
		apiSecret: string,
		config: string,
		expires: number,
		status: AppKeyStatus
	) {
		super();
		this.appName = appName;
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
		this.config = config;
		this.expires = expires;
		this.status = status;
	}
}
