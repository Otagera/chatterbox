import { Entity, Enum, Index, Property, Unique } from "@mikro-orm/mongodb";
import { BaseEntity } from "./BaseEntity";

@Entity({ tableName: "user" })
export class User extends BaseEntity {
	@Property()
	@Unique()
	email: string;

	@Property()
	loginToken?: string;

	constructor(email: string, loginToken?: string) {
		super();
		this.email = email;
		this.loginToken = loginToken;
	}
}
