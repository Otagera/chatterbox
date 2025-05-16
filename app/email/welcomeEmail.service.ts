import path from "path";
import _ from "lodash";
import sendMail from "./sendEmail.handler";

const activationEmail = async (
	recipient: string,
	data: { firstName: string; lastName: string }
) => {
	try {
		const templatePath = path.join(
			path.resolve(__dirname, "../../../views/email"),
			`welcome.pug`
		);
		const fullName = `${_.capitalize(data.firstName)} ${_.capitalize(
			data.lastName
		)}`;
		const contextObj = { fullName };
		const mailOptions = {
			to: recipient,
			subject: `Hi ${fullName}, Activate Your Account`,
			template: {
				name: templatePath,
				engine: "pug",
				context: contextObj,
			},
		};

		return sendMail(mailOptions);
	} catch (error) {
		throw error;
	}
};

module.exports = activationEmail;
