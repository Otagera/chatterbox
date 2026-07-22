import { services } from "../../config/db";
import { AlertMetric, AlertRule, Log } from "../../entities";
import { queueServices } from "../queue.service";
import logger from "../../utils/logger.util";

/**
 * Measures a rule's metric over its window.
 * Returns the observed value and the counts it was derived from.
 */
const measure = async (rule: AlertRule) => {
	const since = new Date(Date.now() - rule.windowMinutes * 60_000);
	const em = services.orm.em.fork();

	const rows: { _id: string; n: number }[] = await em.aggregate(Log, [
		{ $match: { appName: rule.appName, createdAt: { $gte: since } } },
		{ $group: { _id: "$level", n: { $sum: 1 } } },
	]);

	const counts: Record<string, number> = {};
	let total = 0;
	rows.forEach((r) => {
		counts[r._id] = r.n;
		total += r.n;
	});

	const errors = (counts.error || 0) + (counts.fatal || 0);
	const fatals = counts.fatal || 0;

	let value: number;
	switch (rule.metric) {
		case AlertMetric.ERROR_RATE:
			value = total ? (errors / total) * 100 : 0;
			break;
		case AlertMetric.FATAL_COUNT:
			value = fatals;
			break;
		default:
			value = errors;
	}

	return { value, total, errors, fatals, since };
};

/**
 * Evaluates every enabled alert rule and queues a notification for any that
 * breach their threshold and are outside their cooldown.
 *
 * Runs as a repeatable job on the `default` queue.
 */
const run = async () => {
	const em = services.orm.em.fork();
	const rules = await em.find(AlertRule, { enabled: true });

	let fired = 0;
	for (const rule of rules) {
		try {
			const { value, total, errors, since } = await measure(rule);

			if (value <= rule.threshold) continue;

			// Respect the cooldown so a sustained incident notifies once, not
			// on every evaluation tick.
			const cooldownMs = rule.cooldownMinutes * 60_000;
			if (
				rule.lastFiredAt &&
				Date.now() - new Date(rule.lastFiredAt).getTime() < cooldownMs
			) {
				continue;
			}

			await queueServices.emailQueueLib.addJob("sendAlertEmail", {
				meta: {
					email: rule.email,
					appName: rule.appName,
					metric: rule.metric,
					threshold: rule.threshold,
					value,
					windowMinutes: rule.windowMinutes,
					total,
					errors,
					since: since.toISOString(),
				},
				worker: "sendAlertEmail",
			});

			rule.lastFiredAt = new Date();
			await em.persistAndFlush(rule);
			fired++;

			logger.warn(
				{ appName: rule.appName, metric: rule.metric, value, threshold: rule.threshold },
				"ALERT-TRIGGERED"
			);
		} catch (error) {
			logger.error({ ruleId: rule.id, error }, "ALERT-EVALUATION-FAILED");
		}
	}

	return {
		status: "Success",
		message: `Evaluated ${rules.length} rule(s), fired ${fired}`,
	};
};

module.exports = run;
