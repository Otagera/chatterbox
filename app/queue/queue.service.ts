import { JobsOptions, Queue } from "bullmq";
import constants from "../config/constants";
import redisClient from "../utils/redisClient.util";

export const queueConnectionConfig = { connection: redisClient };

// The queues
const defaultQueue = new Queue(
	constants.BULL_QUEUE_NAMES.DEFAULT,
	queueConnectionConfig
);
export const emailQueue = new Queue(
	constants.BULL_QUEUE_NAMES.EMAIL,
	queueConnectionConfig
);
type WorkerTypes = "sendOTPEmail" | "welcomeEmail";
// The lib that contain adding the job and getting the queue
export class QueueLib {
	_queue: Queue;
	constructor(queue: Queue) {
		this._queue = queue;
	}

	async addJob(
		queueName: WorkerTypes,
		data: { meta: {}; worker: WorkerTypes },
		options?: JobsOptions
	) {
		await this._queue.add(queueName, data, options);
		return;
	}
	getQueue() {
		return this._queue;
	}
}

class QueueServices {
	defaultQueueLib;
	emailQueueLib;

	constructor() {
		this.defaultQueueLib = new QueueLib(defaultQueue);
		this.emailQueueLib = new QueueLib(emailQueue);
	}
}

export const queueServices = new QueueServices();
