import { Request, Response } from "express";
import Router from "express-promise-router";

import { paginationState } from "../../index";
import { services } from "../db";

const router = Router();

const getLevelStyle = (level: string) => {
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

router.get("/", async (req: Request, res: Response) => {
	try {
		const logs = await services.logs.findByCursor(
			{},
			{
				first: 100,
				orderBy: { time: "desc" },
			}
		);

		paginationState.setCurrentCursor(logs.endCursor);
		paginationState.setHasNextPage(logs.hasNextPage);

		return res.render("index", {
			logs: logs.items.map((log) => {
				let levelStyle = getLevelStyle(log.level);
				return { ...log, id: log._id, levelStyle };
			}),
		});
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

export const LogViewController = router;
