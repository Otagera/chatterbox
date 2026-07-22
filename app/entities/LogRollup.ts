import { Entity, Index, Property, Unique } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";

/**
 * Pre-aggregated log counts, one row per (application, hour, level).
 *
 * Raw logs expire after 30 days via a TTL index, and scanning them for long
 * ranges is slow. Rollups keep long-range charts fast and let history outlive
 * the raw data.
 */
@Entity({ tableName: "logRollup" })
@Unique({ properties: ["appName", "bucket", "level"] })
@Index({ properties: ["appName", "bucket"] })
export class LogRollup extends BaseEntity {
	@Property()
	appName: string;

	/** Start of the hour this row summarises. */
	@Property()
	bucket: Date;

	@Property()
	level: string;

	@Property()
	count: number;

	constructor(appName: string, bucket: Date, level: string, count: number) {
		super();
		this.appName = appName;
		this.bucket = bucket;
		this.level = level;
		this.count = count;
	}
}
