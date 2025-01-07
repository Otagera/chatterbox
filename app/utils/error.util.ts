import { isObject, isString } from "lodash";
import constantsUtil from "./constants.util";

type ErrorPropType = {
	field?: string;
	action?: string;
	value?: string;
	message?: string;
	statusCode?: number;
};

const { HTTP_STATUS_CODES } = constantsUtil;
const getErrorMessageFromParams = (
	props: { message?: string },
	defaultMessage = ""
): string => {
	if (isString(props)) {
		return props;
	} else if (props?.message) {
		return props.message;
	}

	return defaultMessage;
};

class OperationError extends Error {
	field?: string;
	action?: string;
	value?: string;
	message = "An error occurred.";

	constructor(props: ErrorPropType) {
		super();

		if (isObject(props)) {
			this.field = props.field;
			this.action = props.action;

			if (props.value) this.value = JSON.stringify(props.value);
			if (props.message) this.message = props.message as string;
		} else if (props) {
			this.message = props;
		}
	}
}

class HTTPError extends OperationError {
	name = "HTTPError";
	statusCode = HTTP_STATUS_CODES.BAD_REQUEST;

	constructor(props: ErrorPropType) {
		super(props);
	}
}

class InvalidRequestError extends HTTPError {
	name = "InvalidRequestError";

	constructor(props: ErrorPropType) {
		super(props);
		this.message = getErrorMessageFromParams(props, "Request is invalid.");
	}
}

class RateLimitError extends HTTPError {
	name = "RateLimitError";

	constructor(props: ErrorPropType) {
		super(props);
		this.message = getErrorMessageFromParams(
			props,
			"Rate limit in progress, please try again later."
		);
	}
}

class NotFoundError extends HTTPError {
	name = "NotFoundError";

	constructor(props: ErrorPropType) {
		super(props);
		this.message = getErrorMessageFromParams(props, "Resource not found.");
	}
}

class ResourceInUseError extends HTTPError {
	name = "ResourceInUseError";

	constructor(props: ErrorPropType) {
		super(props);
		this.message = getErrorMessageFromParams(props, "Resource is in use.");
	}
}

class AuthError extends HTTPError {
	name = "AuthError";

	constructor(props: ErrorPropType) {
		super(props);
		this.message = getErrorMessageFromParams(props, "Unauthorized request.");
	}
}

class InvalidKeyError extends HTTPError {
	name = "InvalidKey";

	constructor(props: ErrorPropType) {
		super(props);
		this.message = getErrorMessageFromParams(props, "Invalid API key format.");
	}
}

class AppNotFoundError extends HTTPError {
	name = "AppNotFoundError";

	constructor(props: ErrorPropType) {
		super(props);
		this.message = getErrorMessageFromParams(props, "Application not found.");
	}
}

export {
	HTTPError,
	AuthError,
	NotFoundError,
	OperationError,
	RateLimitError,
	InvalidKeyError,
	AppNotFoundError,
	ResourceInUseError,
	InvalidRequestError,
};
