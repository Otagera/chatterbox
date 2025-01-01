import dotenv from "dotenv";
import { defineConfig } from "@mikro-orm/mongodb";
import { MongoHighlighter } from "@mikro-orm/mongo-highlighter";
import { Log, AppKey, BaseEntity } from "./entities";

dotenv.config();
export default defineConfig({
	entities: ["./dist/app/entities"],
	dbName: process.env.DB_NAME || "chatterbox",
	highlighter: new MongoHighlighter(),
	debug: true,
	clientUrl: process.env.DB_URL || "mongodb://127.0.0.1:27017",
});
