import { Entity, Index, Property } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";

@Entity({ tableName: "log" })
export class Log extends BaseEntity {
	@Property()
	level: string;

	@Index({ type: "fulltext" })
	@Property()
	name: string;

	@Property({ nullable: true })
	context?: object;

	@Property()
	time: Date;

	@Index({ type: "fulltext" })
	@Property({ nullable: true })
	data?: Record<string, any> | string;

	@Property({ nullable: true })
	traceId?: string;

	@Property({ nullable: true })
	request?: string;

	@Property({ nullable: true })
	response?: string;

	@Property({ nullable: true })
	timeTaken?: string;

	@Index({ type: "fulltext" })
	@Property()
	key: string;

	@Index({ type: "fulltext" })
	@Property()
	appName: string;

	constructor(
		name: string,
		data: Record<string, any> | string,
		context: [] | object,
		time: Date,
		level: string,
		traceId: string,
		request: string,
		response: string,
		timeTaken: string,
		key: string,
		appName: string
	) {
		super();
		this.name = name;
		this.data = data;
		this.context = context;
		this.time = time;
		this.level = level;
		this.traceId = traceId;
		this.request = request;
		this.response = response;
		this.timeTaken = timeTaken;
		this.key = key;
		this.appName = appName;
	}
}
