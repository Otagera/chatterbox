import path from "path";
import ejs from "ejs";
import sendMail from "./sendEmail.handler";

/**
 * Send email with otp
 *
 * @param {string} recipient Email to send email to
 * @param {object} data The request parameters
 * @param {string} data.appName Application name
 * @param {string} data.otp Application OTP
 */
export const otpEmail = async (
	recipient: string,
	data: { appName: string; otp: string }
) => {
	const templatePath = path.join(
		path.resolve(__dirname, "../../../views/email"),
		`otp.ejs`
	);

	// Render the EJS template (with its partials) to HTML for Resend.
	const html = await ejs.renderFile(templatePath, {
		appName: data.appName,
		otp: data.otp,
	});

	return sendMail({
		to: recipient,
		subject: `Your OTP to login into ${data.appName}`,
		html,
	});
};
