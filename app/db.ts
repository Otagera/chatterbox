import { MikroORM, Options } from "@mikro-orm/mongodb";
import { IServices } from "./interfaces";
import { Log, AppKey, User, OTP } from "./entities";

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
