import http from "http";
import { EntityManager, EntityRepository, MikroORM } from "@mikro-orm/mongodb";
import { Log, AppKey, User, OTP } from "../entities";

export interface IServices {
	server?: http.Server;
	orm: MikroORM;
	em: EntityManager;
	logs: EntityRepository<Log>;
	appKeys: EntityRepository<AppKey>;
	users: EntityRepository<User>;
	OTPs: EntityRepository<OTP>;
}
