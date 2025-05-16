import path from "path";
import _ from "lodash";
import sendMail from "./sendEmail.handler";
import config from "../config/config";

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
	try {
		const templatePath = path.join(
			path.resolve(__dirname, "../../../views/email"),
			`otp.ejs`
		);
		const contextObj = {
			appName: data.appName,
			otp: data.otp,
		};

		const mailOptions = {
			to: recipient,
			subject: `Your OTP to login into ${data.appName}`,
			template: {
				name: templatePath,
				engine: "ejs",
				context: contextObj,
			},
		};

		return sendMail(mailOptions);
	} catch (error) {
		throw error;
	}
};
