import { alertEmail } from "../../email/alertEmail.service";
import logger from "../../utils/logger.util";

/**
 * Sends an alert notification email.
 *
 * @param {object} data Job payload
 * @param {object} data.meta Alert details produced by the evaluator
 */
const run = async (data: {
	meta: {
		email: string;
		appName: string;
		metric: string;
		threshold: number;
		value: number;
		windowMinutes: number;
		total: number;
		errors: number;
	};
}) => {
	try {
		const { email, ...details } = data.meta;
		await alertEmail(email, details);

		logger.info(
			{ appName: details.appName, metric: details.metric },
			"ALERT-EMAIL-SENT"
		);
		return { status: "Success", message: "Alert email sent" };
	} catch (error: any) {
		logger.error(error, "ALERT-EMAIL-FAILED");
		throw error;
	}
};

module.exports = run;
