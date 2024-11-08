import { ObjectId } from "@mikro-orm/mongodb";

export interface IBaseEntity {
	_id: ObjectId;
	id: string;
	createdAt: Date;
	updatedAt: Date;
}
