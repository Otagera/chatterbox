import { Request, Response } from "express";
import Router from "express-promise-router";

import { paginationState } from "../../index";
import { services } from "../db";
import { authMiddleware } from "../middlewares/auth.middleware";

import { AppKey } from "../entities";
import { decryptObj, hashLogintoken, maskKey } from "../utils/security.util";
import {
	OTPService,
	authorizeService,
	generateSaveAndSendOTP,
	loginService,
} from "./services";

import fs from "fs";
import path from "path";
import { ZodError } from "zod";

const svgPath = path.join(__dirname, "../../../views/assets/copy.svg");
const svgContent = fs.readFileSync(svgPath, "utf8");

const router = Router();

/**
 * Determines the CSS class for styling log levels.
 * @param {string} level - The log level string (e.g., "info", "error", "trace").
 * @returns {string} The corresponding CSS class.
 */
const getLevelStyle = (level: string): string => {
	switch (level) {
		case "info":
			return "text-success-emphasis";
		case "error":
			return "text-danger";
		case "trace":
			return "text-warning";
		default:
			return "text-info-emphasis";
	}
};

/**
 * @route GET /
 * @description Renders the main page, displaying logs for the authenticated user's application.
 * Requires authentication.
 * @param {Request} req - Express request object. Expects `req.session` to contain `appName`, `user`, and `email`.
 * @param {Response} res - Express response object.
 * @returns {void} Renders the 'index' view with logs, appName, user, email, and masked API key.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
	try {
		const { appName, user, email } = req.session;
		const logs = await services.logs.findByCursor(
			{ appName },
			{
				first: 100,
				orderBy: { createdAt: "desc" },
			}
		);

		paginationState.setCurrentCursor(logs.endCursor);
		paginationState.setHasNextPage(logs.hasNextPage);

		return res.render("index", {
			logs: logs.items.map((log) => {
				let levelStyle = getLevelStyle(log.level);
				return { ...log, id: log._id, levelStyle };
			}),
			appName,
			user: user,
			email,
			maskKey: maskKey(user as string),
		});
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route GET /login
 * @description Renders the login page.
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {void} Renders the 'login' view.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/login", async (req: Request, res: Response) => {
	try {
		return res.render("login");
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route GET /view/get-more-logs
 * @description Fetches and returns more logs for infinite scrolling (HTMX).
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing table rows of logs.
 * Sends an empty response if no more logs are available or an error message as HTML if an error occurs.
 */
router.get("/view/get-more-logs", async (req: Request, res: Response) => {
	if (!paginationState.getHasNextPage()) return res.send();

	try {
		const logs = await services.logs.findByCursor(
			{},
			{
				first: 100,
				after: paginationState.getCurrentCursor() as string,
				orderBy: { createdAt: "desc" },
			}
		);

		paginationState.setCurrentCursor(logs.endCursor);
		paginationState.setHasNextPage(logs.hasNextPage);

		let logsHTML = ``;

		logs.items.forEach((log) => {
			let levelStyle = getLevelStyle(log.level);

			const logHTML = `
          <tr>
            <td scope="row"> ${log.id}</td>
            <td> ${log.key} </td>

            <td hx-get=/view/get-log-data/${log.id} hx-target="this" role="button">
              <small class="text-muted">${log.createdAt}</small>
            </td>
            <td class=${levelStyle}> ${log.level} </td>
          </tr>
        `;
			logsHTML = logsHTML.concat(logHTML);
		});

		if (!paginationState.getHasNextPage()) {
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1">END!!!</td></tr>`
			);
		}
		return res.send(logsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route GET /view/get-log-data/:id
 * @description Fetches and returns detailed data for a specific log entry (HTMX).
 * Requires authentication.
 * @param {Request} req - Express request object. Expects `req.params.id` for the log ID and `req.appName` from session/middleware.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing a table cell with formatted log data.
 * Sends an error message as HTML if the log is not found or another error occurs.
 */
router.get(
	"/view/get-log-data/:id",
	authMiddleware,
	async (req: Request, res: Response) => {
		const id = req.params.id;
		try {
			const log = await services.logs.findOneOrFail(id);
			if (!log) {
				throw new Error("Something went wrong!!!");
			}
			let logData = {};
			const {
				data: possibleData,
				name,
				context,
				traceId,
				request,
				response,
				timeTaken,
			} = log;
			let data = possibleData;
			if (typeof data === "string") {
				data = decryptObj(data, req.appName || "");
			}

			logData = {
				...data,
				name,
				context,
				traceId,
				request,
				response,
				timeTaken,
			};

			return res.send(
				`
          <td style="max-width: 400px;">
            <small class="text-muted"> ${log?.time}</small>
            <br>
            <pre style="
            font-size:10px;
            display: block;
            padding: 9.5px;
            margin: 0 0 10px;
            font-size: 13px;
            line-height: 1.42857143;
            color: #333;
            word-break: break-all;
            word-wrap: break-word;
            background-color: #f5f5f5;
            border: 1px solid #ccc;
            border-radius: 4px;
            overflow-wrap: break-word;
            overflow-x: auto;
            overflow-y: auto;
            "> ${JSON.stringify(logData, null, 4)} </pre>
          </td>
        `
			);
		} catch (error: any) {
			if (error instanceof ZodError) {
				return res.send(`<p>${error.errors[0].message}</p>`);
			} else if (error && error.message) {
				return res.send(`<p>${error.message}</p>`);
			} else {
				return res.send(`<p>Something went wrong!!!<p>`);
			}
		}
	}
);

/**
 * @route POST /view/search
 * @description Searches logs based on filters provided in the request body (HTMX).
 * @param {Request} req - Express request object. Expects filter criteria in `req.body` (startDate, endDate, level, key).
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing table rows of matching logs.
 * Sends an error message as HTML if an error occurs.
 */
router.post("/view/search", async (req: Request, res: Response) => {
	let filter: {
		level?: string;
		key?: string;
		time?: {
			$gte?: Date;
			$lt?: Date;
		};
	} = { time: {} };
	if ("startDate" in req.body && req.body.startDate.length) {
		if (filter.time) filter.time["$gte"] = new Date(req.body.startDate);
	}
	if ("endDate" in req.body && req.body.endDate.length) {
		if (filter.time) filter.time["$lt"] = new Date(req.body.endDate);
	}
	if ("level" in req.body && req.body.level.length) {
		filter.level = req.body.level;
	}
	if ("key" in req.body && req.body.key.length) {
		filter.key = req.body.key;
	}

	if (!Object.entries(filter.time as string).length) {
		delete filter.time;
	}
	try {
		const logs = await services.logs.findByCursor(filter, {
			first: 100,
			// after: paginationState.getCurrentCursor() as string, // Commented out as search might need to reset pagination
			orderBy: { createdAt: "desc" },
		});

		paginationState.setCurrentCursor(logs.endCursor);
		paginationState.setHasNextPage(logs.hasNextPage);

		let logsHTML = ``;
		logs.items.forEach((log) => {
			let levelStyle = getLevelStyle(log.level);

			const logHTML = `
          <tr>
            <td scope="row"> ${log.id}</td>
            <td> ${log.key} </td>

            <td hx-get=/view/get-log-data/${log.id} hx-target="this" role="button">
              <small class="text-muted">${log.createdAt}</small>
            </td>
            <td class=${levelStyle}> ${log.level} </td>
          </tr>
        `;
			logsHTML = logsHTML.concat(logHTML);
		});
		if (logs.items.length === 0) {
			// Corrected: was logs.length
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1 text-center">Empty</td></tr>`
			);
		} else if (!paginationState.getHasNextPage())
			logsHTML = logsHTML.concat(
				`<tr><td colspan="4" class="fs-1 text-center">END!!!</td></tr>`
			);

		return res.send(logsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * Generates HTML for a list of applications.
 * @param {AppKey[]} apps - An array of AppKey entities.
 * @param {string} loginToken - The user's login token.
 * @param {string} email - The user's email.
 * @returns {string} An HTML string representing the list of applications.
 */
const getApps = (apps: AppKey[], loginToken: string, email: string): string => {
	let appHTML = "";
	apps.forEach((app, index) => {
		appHTML += `
      <li class="d-flex justify-content-between">
      <p>App: <span
        hx-trigger="click"
        hx-target="#appsList"
        hx-swap="outerHTML"
        hx-get="/view/apps?appName=${app.appName}&loginToken=${loginToken}"
        class="text-primary text-decoration-underline"
        style="cursor:pointer">
          ${app.appName}
        </span></p>
        <div id="app-delete-box-${index}">
          <p
            hx-trigger="click"
            hx-target="#app-delete-box-${index}"
            hx-swap="innerHTML"
            hx-get="/view/apps/delete-confirmation?appName=${app.appName}&loginToken=${loginToken}&email=${email}&appIndex=${index}"
            class="text-primary"
            style="cursor:pointer">
            Delete
          </p>
        </div>
      </li>
    `;
	});
	return appHTML;
};

/**
 * @route POST /view/login
 * @description Handles user login. Expects email in `req.body`.
 * On successful login, it generates a list of user's applications or an option to add a new one.
 * Sets `req.session.email`.
 * @param {Request} req - Express request object, expects `req.body` with user credentials (e.g., email).
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing the list of apps or an add new app link.
 * Sends an error message as HTML if login fails or another error occurs.
 */
router.post("/view/login", async (req: Request, res: Response) => {
	try {
		const { email, existingApps, loginToken } = await loginService(req.body);

		const appsHTML = `
      <div id="appsList">
        <ol>
          ${getApps(existingApps, loginToken, email)}
        </ol>
        <p
            hx-trigger="click"
            hx-target="#appsList"
            hx-swap="outerHTML"
            hx-get="/view/apps?newEmail=${email}&loginToken=${loginToken}"
            class="text-primary text-decoration-underline"
            style="cursor:pointer">
              Add new Application
            </p>
      </div>
    `;

		req.session.email = email;
		return res.send(appsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route POST /view/logout
 * @description Handles user logout by destroying the session.
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an empty response with an 'HX-Redirect' header to '/'.
 * Sends an error message as HTML if an error occurs during session destruction.
 */
router.post("/view/logout", async (req: Request, res: Response) => {
	try {
		if (req.session) {
			req.session.destroy((err: any) => {
				if (err) {
					throw err;
				}
			});
		}
		res.setHeader("HX-Redirect", "/");
		res.send();
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * Generates an HTML form for OTP verification for a specific app.
 * @param {string} appName - The name of the application.
 * @param {string} loginToken - The user's login token.
 * @returns {Promise<string>} A promise that resolves to an HTML string for the OTP form.
 * @throws {Error} If the user or app is not found, or if login token is invalid.
 */
const getViewApps = async (
	appName: string,
	loginToken: string
): Promise<string> => {
	const app = await services.appKeys.findOne({
		appName: appName as string,
	});

	if (!app) {
		throw new Error("App not found.");
	}
	const user = await services.users.findOne({
		id: app.user.id,
		loginToken: hashLogintoken(loginToken as string),
	});
	if (user && app) {
		// Ensure user and app are found
		await generateSaveAndSendOTP(user);

		const logHTML = `
    <form hx-post="/view/otp?appName=${appName}" hx-boost="true">
      <h3>${user.email}</h3>
      <input type="email" placeholder="Email" name="email" class="d-none form-control mb-3" value="${user.email}"/>
      <input type="number" placeholder="OTP" name="otp" class="form-control mb-3" />
      <button type="submit" class="btn btn-primary"> Login </button>
    </form>
  `;
		return logHTML;
	}
	throw new Error("Login failed, please try again. User or App not found.");
};

/**
 * @route GET /view/apps
 * @description Handles viewing a specific app (requires OTP) or creating a new app form.
 * Query parameters determine the action:
 * - `appName` and `loginToken`: Shows OTP form for the app.
 * - `newEmail` and `loginToken`: Shows form to create a new app for the user.
 * @param {Request} req - Express request object. Expects query parameters `appName`, `newEmail`, `loginToken`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML content for either OTP form or new app form.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/view/apps", async (req: Request, res: Response) => {
	try {
		const { appName, newEmail, loginToken } = req.query;
		if (appName && loginToken) {
			const appsHTML = await getViewApps(
				appName as string,
				loginToken as string
			);
			return res.send(appsHTML);
		} else if (newEmail && loginToken) {
			const user = await services.users.findOne({
				email: newEmail as string,
				loginToken: hashLogintoken(loginToken as string),
			});

			if (user) {
				const logHTML = `
        <form hx-post="/view/apps?loginToken=${loginToken}" hx-boost="true">
          <h3>Create New App</h3>
          <h3>${user?.email}</h3>
          <input type="email" placeholder="Email" name="email" class="d-none form-control mb-3" value="${user?.email}" />
          <input type="text" placeholder="App Name" name="appName" class="form-control mb-3" />
          <input type="number" placeholder="Expires (In seconds)" name="expires" class="d-none form-control mb-3" value="1" />
          <button type="submit" class="btn btn-primary"> Create App </button>
        </form>
      `;
				return res.send(logHTML);
			}
			throw new Error("User not found for creating a new app.");
		} else {
			throw new Error("Invalid parameters for /view/apps.");
		}
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route POST /view/apps
 * @description Handles creation of a new application.
 * Expects `loginToken` in query and app details (email, appName) in `req.body`.
 * After creating the app, it shows the OTP form for the newly created app.
 * @param {Request} req - Express request object. Query: `loginToken`. Body: `email`, `appName`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML content for the OTP form of the newly created app.
 * Sends an error message as HTML if an error occurs.
 */
router.post("/view/apps", async (req: Request, res: Response) => {
	try {
		const { loginToken } = req.query;
		if (!loginToken) throw new Error("Login token is required.");

		const { appName } = await authorizeService(req.body);

		const appsHTML = await getViewApps(appName as string, loginToken as string);
		return res.send(appsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route GET /view/apps/delete-confirmation
 * @description Provides confirmation buttons (Cancel/Delete) for deleting an application (HTMX).
 * @param {Request} req - Express request object. Expects query parameters: `appName`, `loginToken`, `email`, `appIndex`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML with "Cancel" and "Delete" options.
 * Sends an error message as HTML if an error occurs.
 */
router.get(
	"/view/apps/delete-confirmation",
	async (req: Request, res: Response) => {
		try {
			const { appName, loginToken, email, appIndex } = req.query;
			if (!appName || !loginToken || !email || appIndex === undefined) {
				throw new Error("Missing parameters for delete confirmation.");
			}
			const logHTML = `
        <div class="d-flex justify-content-between">
          <p
            hx-trigger="click"
            hx-target="#app-delete-box-${appIndex}"
            hx-swap="innerHTML"
            hx-get="/view/apps/delete-cancel?appName=${appName}&loginToken=${loginToken}&email=${email}&appIndex=${appIndex}"
            class="text-primary"
            style="cursor:pointer; margin-right: 5px;">
              Cancel
          </p>
          <p
            hx-trigger="click"
            hx-target="#appsList"
            hx-swap="outerHTML"
            hx-delete="/view/apps?appName=${appName}&loginToken=${loginToken}&email=${email}&appIndex=${appIndex}"
            class="text-primary"
            style="cursor:pointer; margin-left: 5px;">
              Delete
          </p>
        </div>
      `;
			return res.send(logHTML);
		} catch (error: any) {
			if (error instanceof ZodError) {
				return res.send(`<p>${error.errors[0].message}</p>`);
			} else if (error && error.message) {
				return res.send(`<p>${error.message}</p>`);
			} else {
				return res.send(`<p>Something went wrong!!!<p>`);
			}
		}
	}
);

/**
 * @route GET /view/apps/delete-cancel
 * @description Reverts the delete confirmation UI to the initial "Delete" link (HTMX).
 * @param {Request} req - Express request object. Expects query parameters: `appName`, `loginToken`, `email`, `appIndex`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML for the "Delete" link.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/view/apps/delete-cancel", async (req: Request, res: Response) => {
	try {
		const { appName, loginToken, email, appIndex } = req.query;
		if (!appName || !loginToken || !email || appIndex === undefined) {
			throw new Error("Missing parameters for delete cancellation.");
		}
		const logHTML = `
      <p
        hx-trigger="click"
        hx-target="#app-delete-box-${appIndex}"
        hx-swap="outerHTML"
        hx-get="/view/apps/delete-confirmation?appName=${appName}&loginToken=${loginToken}&email=${email}&appIndex=${appIndex}"
        class="text-primary"
        style="cursor:pointer">
        Delete
      </p>
      `;
		return res.send(logHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route DELETE /view/apps
 * @description Deletes a specified application.
 * Expects query parameters `appName`, `loginToken`, `email`.
 * After deletion, it re-fetches and sends the updated list of applications.
 * @param {Request} req - Express request object. Query: `appName`, `loginToken`, `email`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an HTML string containing the updated list of applications.
 * Sends an error message as HTML if an error occurs (e.g., invalid user, app not found).
 */
router.delete("/view/apps", async (req: Request, res: Response) => {
	try {
		const { appName, loginToken, email } = req.query;
		if (!appName || !loginToken || !email) {
			throw new Error("Missing parameters for deleting an app.");
		}

		let user = await services.users.findOne({
			email: email as string,
			loginToken: hashLogintoken(loginToken as string),
		});
		if (!user) {
			throw new Error("Invalid User or unauthorized.");
		}

		let appKeyEntry = await services.appKeys.findOne({
			appName: appName as string,
			user: user,
		});

		if (appKeyEntry) {
			await services.em.removeAndFlush(appKeyEntry);
		} else {
			throw new Error("App not found or does not belong to this user.");
		}

		let existingApps = await services.appKeys.find({ user });
		const appsHTML = `
    <div id="appsList">
      <ol>
        ${getApps(existingApps, loginToken as string, email as string)}
      </ol>
      <p
          hx-trigger="click"
          hx-target="#appsList"
          hx-swap="outerHTML"
          hx-get="/view/apps?newEmail=${user.email}&loginToken=${loginToken}"
          class="text-primary text-decoration-underline"
          style="cursor:pointer">
            Add new Application
          </p>
    </div>
  `;

		return res.send(appsHTML);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

/**
 * @route POST /view/otp
 * @description Verifies the OTP provided by the user.
 * If OTP is valid, it authorizes the application for the session.
 * Sets `req.session.user` (apiSecret) and `req.session.appName`.
 * @param {Request} req - Express request object. Expects `req.body` with OTP and `req.query.appName`. `req.session.email` should be set.
 * @param {Response} res - Express response object.
 * @returns {void} Sends an empty response with 'HX-Redirect' header to '/' on success.
 * Sends an HTML form to re-enter email for login if OTP verification fails.
 */
router.post("/view/otp", async (req: Request, res: Response) => {
	try {
		if (!req.session.email) {
			throw new Error("Session email not found. Please login again.");
		}
		await OTPService({ ...req.body, email: req.session.email });

		const { appName, apiSecret } = await authorizeService({
			email: req.session.email,
			appName: req.query.appName as string,
		});

		req.session.user = apiSecret;
		req.session.appName = appName;

		res.setHeader("HX-Redirect", "/");
		res.send();
	} catch (error: any) {
		let errorMessage = "Please login again";
		if (error && error.message) {
			errorMessage = error.message;
		}
		return res.send(`
      <p>${errorMessage}</p>
      <form hx-post="/view/login" hx-swap="outerHTML" class="mb-3">
        <input type="email" placeholder="Email" name="email" class="form-control mb-3" />
        <button type="submit" class="btn btn-primary"> Login </button>
      </form>
    `);
	}
});

/**
 * @route GET /view/authorize
 * @description Retrieves and displays the masked API secret key for the current session's application.
 * This is typically used to show the user their key after successful authentication.
 * @param {Request} req - Express request object. Expects `req.session` to contain `email` and `appName`.
 * @param {Response} res - Express response object.
 * @returns {void} Sends HTML displaying the masked API secret key and a copy icon.
 * Sends an error message as HTML if an error occurs.
 */
router.get("/view/authorize", async (req: Request, res: Response) => {
	try {
		const { email, appName } = req.session;
		if (!email || !appName) {
			throw new Error("User session not found or app not selected.");
		}
		const { apiSecret } = await authorizeService({ email, appName });

		return res.send(`
			<p> Secret Key: </p>
       <span id="apiKey"> ${maskKey(apiSecret)}  </span>
       <div
          style="
            width: 20px;
            height: 20px;
            padding-left: 10px;
            cursor:pointer;
            display: inline-block; /* Added for better layout with span */
            vertical-align: middle; /* Added for better layout with span */
          "
          id="copyIconContainer"
          title="Copy API Key"
          onclick="navigator.clipboard.writeText('${apiSecret}')"> ${svgContent}
      </div>
    `);
	} catch (error: any) {
		if (error instanceof ZodError) {
			return res.send(`<p>${error.errors[0].message}</p>`);
		} else if (error && error.message) {
			return res.send(`<p>${error.message}</p>`);
		} else {
			return res.send(`<p>Something went wrong!!!<p>`);
		}
	}
});

export const ViewController = router;
