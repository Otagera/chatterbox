import { Entity, Enum, ManyToOne, Property } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";
import { User } from "./User";

/** What an alert rule watches over its evaluation window. */
export enum AlertMetric {
	/** Percentage of logs in the window at error or fatal level. */
	ERROR_RATE = "error_rate",
	/** Absolute count of error + fatal logs. */
	ERROR_COUNT = "error_count",
	/** Absolute count of fatal logs. */
	FATAL_COUNT = "fatal_count",
}

@Entity({ tableName: "alertRule" })
export class AlertRule extends BaseEntity {
	@Property()
	appName: string;

	@Enum({ items: () => AlertMetric })
	metric: AlertMetric;

	/** Fires when the measured value is greater than this. */
	@Property()
	threshold: number;

	/** How far back each evaluation looks, in minutes. */
	@Property()
	windowMinutes: number;

	/** Minimum gap between notifications so one incident doesn't spam. */
	@Property()
	cooldownMinutes: number;

	@Property()
	email: string;

	@Property()
	enabled: boolean = true;

	@Property({ nullable: true })
	lastFiredAt?: Date;

	@ManyToOne({ entity: () => User, nullable: true })
	user?: User;

	constructor(
		appName: string,
		metric: AlertMetric,
		threshold: number,
		email: string,
		windowMinutes = 15,
		cooldownMinutes = 60,
		user?: User
	) {
		super();
		this.appName = appName;
		this.metric = metric;
		this.threshold = threshold;
		this.email = email;
		this.windowMinutes = windowMinutes;
		this.cooldownMinutes = cooldownMinutes;
		this.user = user;
	}
}
