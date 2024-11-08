import http from "http";
import { EntityManager, EntityRepository, MikroORM } from "@mikro-orm/mongodb";
import { Log } from "../entities/Log";

export interface IServices {
	server?: http.Server;
	orm: MikroORM;
	em: EntityManager;
	logs: EntityRepository<Log>;
}
