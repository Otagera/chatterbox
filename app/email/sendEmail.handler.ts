import { Resend } from "resend";
import config from "../config/config";

const resend = new Resend(config.resend.apiKey);

interface MailOptions {
	to: string | string[];
	subject: string;
	html: string;
}

/**
 * Sends an email via Resend. Templates are rendered to HTML by the caller (see
 * the *.service.ts files) and passed in as `html`.
 */
const sendMail = async (mailOptions: MailOptions) => {
	const { data, error } = await resend.emails.send({
		from: config.resend.sender,
		to: mailOptions.to,
		subject: mailOptions.subject,
		html: mailOptions.html,
	});

	if (error) {
		throw error;
	}

	return data;
};

export default sendMail;
