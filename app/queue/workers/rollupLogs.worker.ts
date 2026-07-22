import { services } from "../../config/db";
import { Log, LogRollup } from "../../entities";
import logger from "../../utils/logger.util";

/**
 * Rebuilds hourly log rollups for the recent past.
 *
 * Recomputing a small trailing window (rather than only the newest hour) means
 * late-arriving logs are still counted, and makes the job idempotent: rows are
 * upserted on (appName, bucket, level), so running it twice is harmless.
 *
 * Runs as a repeatable job on the `default` queue.
 */
const run = async () => {
	const lookbackHours = Number(process.env.ROLLUP_LOOKBACK_HOURS) || 3;
	const since = new Date(Date.now() - lookbackHours * 60 * 60_000);
	since.setMinutes(0, 0, 0);

	const em = services.orm.em.fork();

	const rows: { _id: { bucket: Date; appName: string; level: string }; n: number }[] =
		await em.aggregate(Log, [
			{ $match: { createdAt: { $gte: since } } },
			{
				$group: {
					_id: {
						appName: "$appName",
						level: "$level",
						bucket: { $dateTrunc: { date: "$createdAt", unit: "hour" } },
					},
					n: { $sum: 1 },
				},
			},
		]);

	if (!rows.length) {
		return { status: "Success", message: "No logs to roll up" };
	}

	const collection = em.getCollection(LogRollup);
	await collection.bulkWrite(
		rows.map((r) => ({
			updateOne: {
				filter: {
					appName: r._id.appName,
					bucket: r._id.bucket,
					level: r._id.level,
				},
				update: {
					$set: { count: r.n, updatedAt: new Date() },
					$setOnInsert: { createdAt: new Date() },
				},
				upsert: true,
			},
		}))
	);

	logger.info(
		{ buckets: rows.length, sinceISO: since.toISOString() },
		"LOG-ROLLUP-COMPLETED"
	);

	return { status: "Success", message: `Rolled up ${rows.length} bucket(s)` };
};

module.exports = run;
