import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import Redis from "ioredis";
import redisClient from "./redisClient.util";

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers

	// Redis store configuration
	store: new RedisStore({
		// Explicitly define the args as a tuple-like rest parameter
		// The first element is the command (string), subsequent elements are arguments (string | number)
		sendCommand: async (...args: [string, ...(string | number)[]]) => {
			// Destructure the arguments to separate the command from its parameters
			const [command, ...commandArgs] = args;

			// Now pass them explicitly to ioredis.call
			const result = await (redisClient as Redis).call(command, ...commandArgs);

			// Cast the result to 'any' for compatibility with rate-limit-redis's expected RedisReply type.
			// As discussed, ioredis's call returns a broad union, and 'any' is pragmatic here.
			return result as any;
		},
	}),
});

export default limiter;
