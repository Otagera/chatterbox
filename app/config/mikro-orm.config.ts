import dotenv from "dotenv";
import { defineConfig } from "@mikro-orm/mongodb";

import { Log, AppKey, BaseEntity } from "../entities";
import { initORMOption } from "./db";

dotenv.config();
export default defineConfig(initORMOption);
