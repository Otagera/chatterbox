import { Entity, Index, Property } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";

@Entity({ tableName: "log" })
@Index({
	name: "idx_search",
	properties: ["name", "data", "key", "appName"],
	type: "fulltext",
})
@Index({ properties: ["createdAt"], options: { expireAfterSeconds: 2592000 } }) // expires after 30 days
export class Log extends BaseEntity {
	@Property()
	level: string;

	@Property()
	name: string;

	@Property({ nullable: true })
	context?: object;

	@Property()
	time: Date;

	@Property({ nullable: true })
	data?: Record<string, any> | string;

	@Property({ nullable: true })
	traceId?: string;

	// Stored structured (an object) so endpoint metrics can aggregate on
	// request.url / response.statusCode. Older rows may still hold a JSON
	// string, so readers must handle both shapes.
	@Property({ nullable: true })
	request?: Record<string, any> | string;

	@Property({ nullable: true })
	response?: Record<string, any> | string;

	// Milliseconds. Older rows may hold a string like "42ms".
	@Property({ nullable: true })
	timeTaken?: number | string;

	@Property()
	key: string;

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
