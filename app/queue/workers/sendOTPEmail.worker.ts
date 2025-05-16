import { otpEmail } from "../../email/otpEmail.service";

/**
 * Send email with otp
 *
 * @param {object} data The request parameters
 * @param {object} data.meta Meta parameters
 * @param {string} data.meta.email Email to send email to
 * @param {string} data.meta.appName: string; otp: string
 * @param {string} data.meta.otp Application OTP
 */

const run = async (data: {
	meta: { email: string; appName: string; otp: string };
}) => {
	try {
		const email = await otpEmail(data.meta.email, {
			appName: data.meta.appName,
			otp: data.meta.otp,
		});

		return { status: "Success", message: `Successfully sent OTP email`, email };
	} catch (error: any) {
		throw error;
	}
};
module.exports = run;
