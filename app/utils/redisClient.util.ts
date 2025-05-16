import RedisClient from "ioredis";
import config from "../config/config";

const redisClient = new RedisClient(config.redis.url, {
	maxRetriesPerRequest: null,
	enableReadyCheck: false,
	showFriendlyErrorStack: true,
});

export default redisClient;
