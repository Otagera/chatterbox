import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import { APIController } from "../../controllers/api.controller";
import { services } from "../../config/db";
import { IAppKey } from "../../interfaces";

jest.mock("../../middlewares/auth.middleware", () => ({
	apiAuthMiddleware: (req: Request, _res: Response, next: NextFunction) => {
		req.appName = "test-app";
		req.appKey = { appName: "test-app" } as IAppKey;
		next();
	},
}));

jest.mock("../../config/db", () => ({
	services: {
		logs: {
			create: jest.fn(),
		},
		em: {
			flush: jest.fn().mockResolvedValue(true),
		},
	},
}));

const app = express();
app.use(express.json());
app.use("/api", APIController);

describe("API Controller", () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("POST /api/logs", () => {
		it("should return 200 OK and success message for a valid log", async () => {
			const validLog = {
				log: {
					level: "info",
					name: "Test Log",
					time: Date.now(),
					key: "TEST_KEY",
					appName: "test-app",
				},
			};

			const response = await request(app).post("/api/logs").send(validLog);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				message: "Logged successfully",
			});
			expect(services.logs.create).toHaveBeenCalledTimes(1);
			expect(services.em.flush).toHaveBeenCalledTimes(1);
		});

		it("should return 400 Bad Request for an invalid log (missing required fields)", async () => {
			const invalidLog = {
				log: {
					level: "info",
					// Missing 'name', 'time', 'key', 'appName'
				},
			};

			const response = await request(app).post("/api/logs").send(invalidLog);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBeDefined();
			expect(services.logs.create).not.toHaveBeenCalled();
		});
	});

	describe("POST /api/logs/bulk", () => {
		it("should return 200 OK and success message for a valid bulk log request", async () => {
			const validBulkLog = {
				logs: [
					{
						level: "info",
						name: "Bulk Log 1",
						time: Date.now(),
						key: "BULK_KEY_1",
						appName: "test-app",
					},
					{
						level: "error",
						name: "Bulk Log 2",
						time: Date.now(),
						key: "BULK_KEY_2",
						appName: "test-app",
					},
				],
			};

			const response = await request(app)
				.post("/api/logs/bulk")
				.send(validBulkLog);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				message: "Bulk Logs successfully",
			});
			expect(services.logs.create).toHaveBeenCalledTimes(2);
			expect(services.em.flush).toHaveBeenCalledTimes(1);
		});
	});
});
