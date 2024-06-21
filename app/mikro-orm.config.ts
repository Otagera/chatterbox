import { defineConfig } from "@mikro-orm/mongodb";
import { MongoHighlighter } from "@mikro-orm/mongo-highlighter";
import { Log, BaseEntity } from "./entities";

export default defineConfig({
	entities: [Log, BaseEntity],
	dbName: "entryboost-server-node-dev",
	highlighter: new MongoHighlighter(),
	debug: true,
});
