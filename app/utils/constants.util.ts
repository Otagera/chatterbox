export default {
	HTTP_METHODS: { POST: "POST", GET: "GET", PUT: "PUT" },
	HTTP_STATUS_CODES: {
		OK: 200,
		CREATED: 201,
		BAD_REQUEST: 400,
		UNAUTHORIZED: 401,
		FORBIDDEN: 403,
		NOTFOUND: 404,
		CONFLICT: 409,
		TOO_MANY_REQUESTS: 429,
		SERVER_ERROR: 500,
		SERVICE_UNAVAILABLE: 503,
	},
	AUTHORIZATION_LEVELS: {
		USER: "user",
		COMPANY: "company",
		ADMIN: "admin",
	},
	BULL_QUEUE_NAMES: {
		DEFAULT: "default",
		EMAIL: "email",
	},
	DEGREES: ["Bsc.", "B.A", "LLB.", "MSc.", "M.A."],
	LEVELS: ["Undergraduate", "Postgraduate"],
	// Still not sure about this property name but it will do for now
	REMOTE: ["remote", "on-site", "hybrid"],
	HOW_TO_APPLY: ["withUs", "externalLink", "mailTo"],
	MINIMUM_REQUIRED_SKILLS: 4,
	MINIMUM_REQUIRED_TOOLS: 4,
	MINIMUM_REQUIRED_KEY_RESPONSIBILITIES: 4,
};
