import http from "http";
import { EntityManager, EntityRepository, MikroORM } from "@mikro-orm/mongodb";
import { Log, AppKey } from "../entities";

export interface IServices {
	server?: http.Server;
	orm: MikroORM;
	em: EntityManager;
	logs: EntityRepository<Log>;
	appKeys: EntityRepository<AppKey>;
}
