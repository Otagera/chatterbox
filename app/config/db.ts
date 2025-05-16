import dotenv from "dotenv";
import { MikroORM, Options } from "@mikro-orm/mongodb";
import { MongoHighlighter } from "@mikro-orm/mongo-highlighter";
import { IServices } from "../interfaces";
import { Log, AppKey, User, OTP } from "../entities";
import config from "./config";

dotenv.config();
export const initORMOption = {
	entities: ["./dist/app/entities"],
	entitiesTs: ["./entities"],
	dbName: config.dbName,
	highlighter: new MongoHighlighter(),
	debug: true,
	clientUrl: config.dbURL,
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
