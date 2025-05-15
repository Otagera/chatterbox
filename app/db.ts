import dotenv from "dotenv";
import { MikroORM, Options } from "@mikro-orm/mongodb";
import { MongoHighlighter } from "@mikro-orm/mongo-highlighter";
import { IServices } from "./interfaces";
import { Log, AppKey, User, OTP } from "./entities";

dotenv.config();
export const initORMOption = {
	entities: ["./dist/app/entities"],
	entitiesTs: ["./entities"],
	dbName: process.env.DB_NAME || "chatterbox",
	highlighter: new MongoHighlighter(),
	debug: true,
	clientUrl: process.env.DB_URL || "mongodb://127.0.0.1:27017",
	ensureIndexes: true,
};

export let services: IServices;

export const initORM = async (options?: Options): Promise<IServices> => {
	if (services) {
		return services;
	}

	const orm = await MikroORM.init(options);

	// save to cache before returning
	return (services = {
		orm,
		em: orm.em,
		logs: orm.em.getRepository(Log),
		appKeys: orm.em.getRepository(AppKey),
		users: orm.em.getRepository(User),
		OTPs: orm.em.getRepository(OTP),
	});
};
