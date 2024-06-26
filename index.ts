import "reflect-metadata";
import http from "http";
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import dotenv from "dotenv";
import {
	EntityManager,
	EntityRepository,
	MikroORM,
	RequestContext,
} from "@mikro-orm/mongodb";

import { LogController } from "./app/controllers";
import { Log } from "./app/entities";

export const DI = {} as {
	server: http.Server;
	orm: MikroORM;
	em: EntityManager;
	logs: EntityRepository<Log>;
};

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3005;

export const init = (async () => {
	app.use(express.json());
	app.use((req, res, next) => RequestContext.create(DI.orm.em, next));

	// Configuring body parser middleware
	app.use(bodyParser.urlencoded({ extended: false }));
	app.use(bodyParser.json());

  app.set( "views", path.join( __dirname, "../views" ) );
	app.set("view engine", "pug");

	DI.orm = await MikroORM.init();
	DI.em = DI.orm.em;
	DI.logs = DI.orm.em.getRepository(Log);

	app.use("/", LogController);

	app.use((req, res) => res.status(404).json({ message: "No route found" }));

	DI.server = app.listen(PORT, () => {
		console.log(`Service started on port ${PORT}`);
	});
})();
