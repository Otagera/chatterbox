import nodemailer from "nodemailer";
import mg from "nodemailer-mailgun-transport";
import config from "../config/config";

const auth = {
	auth: {
		api_key: config.mailgun.apiKey,
		domain: config.mailgun.domain,
	},
	ssl: false,
};

const sendMail = async (mailOptions: {}) => {
	try {
		const nodemailerMailgun = nodemailer.createTransport(mg(auth));

		return nodemailerMailgun.sendMail({
			...mailOptions,
			from: config.mailgun.sender,
		});
	} catch (error) {
		throw error;
	}
};

export default sendMail;
