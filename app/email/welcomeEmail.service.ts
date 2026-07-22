import path from "path";
import _ from "lodash";
import ejs from "ejs";
import sendMail from "./sendEmail.handler";

const activationEmail = async (
	recipient: string,
	data: { firstName: string; lastName: string }
) => {
	const templatePath = path.join(
		path.resolve(__dirname, "../../../views/email"),
		`welcome.ejs`
	);
	const fullName = `${_.capitalize(data.firstName)} ${_.capitalize(
		data.lastName
	)}`;

	// Render the EJS template (with its partials) to HTML for Resend.
	const html = await ejs.renderFile(templatePath, { fullName });

	return sendMail({
		to: recipient,
		subject: `Hi ${fullName}, Activate Your Account`,
		html,
	});
};

export default activationEmail;
