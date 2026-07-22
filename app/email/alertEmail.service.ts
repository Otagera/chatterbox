import path from "path";
import ejs from "ejs";
import sendMail from "./sendEmail.handler";

export type AlertEmailData = {
	appName: string;
	metric: string;
	threshold: number;
	value: number;
	windowMinutes: number;
	total: number;
	errors: number;
};

const METRIC_LABELS: Record<string, string> = {
	error_rate: "Error rate",
	error_count: "Error count",
	fatal_count: "Fatal count",
};

const format = (metric: string, value: number) =>
	metric === "error_rate" ? `${value.toFixed(1)}%` : String(Math.round(value));

/**
 * Sends an alert notification for a breached rule.
 *
 * @param {string} recipient Email to notify
 * @param {AlertEmailData} data Details of the breach
 */
export const alertEmail = async (recipient: string, data: AlertEmailData) => {
	const templatePath = path.join(
		path.resolve(__dirname, "../../../views/email"),
		`alert.ejs`
	);

	const metricLabel = METRIC_LABELS[data.metric] || data.metric;

	const html = await ejs.renderFile(templatePath, {
		appName: data.appName,
		metricLabel,
		value: format(data.metric, data.value),
		threshold: format(data.metric, data.threshold),
		windowMinutes: data.windowMinutes,
		total: data.total,
		errors: data.errors,
	});

	return sendMail({
		to: recipient,
		subject: `[${data.appName}] ${metricLabel} ${format(
			data.metric,
			data.value
		)} exceeded ${format(data.metric, data.threshold)}`,
		html,
	});
};
