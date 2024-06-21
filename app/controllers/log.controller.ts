import { Request, Response } from "express";
import Router from "express-promise-router";

import { DI } from "../../index";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
	const logs = await DI.logs.findAll({
    orderBy: { time: -1 }
  });

	return res.render("index", {
		logs: logs.map((log) => {
			let levelStyle;
			switch (log.level) {
				case "info":
					levelStyle = "text-success-emphasis";
					break;
				case "error":
					levelStyle = "text-danger";
					break;
				case "trace":
					levelStyle = "text-warning";
					break;
				default:
					levelStyle = "text-info-emphasis";
					break;
			}
			return { ...log, id: log._id, levelStyle };
		}),
	});
});

router.get("/get-log-data/:id", async (req: Request, res: Response) => {
	const id = req.params.id;
	try {
		const log = await DI.logs.findOneOrFail(id);
		if (!log) {
			throw new Error("Something went wrong!!!");
		}
    let data = {};
    if(log?.data){
      data = {
        ...log.data,
        name: log.name,
      }
    }else if(log?.response){
      data = {
        name: log.name,
        traceId: log.traceId,
        request: log?.request,
        response: log.response,
        timeTaken: log?.timeTaken,
      }
    }else{
      data = {
        name: log.name,
        traceId: log.traceId,
        request: log?.request
      }
    }
		return res.send(
      `
      <td>
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
        border-radius: 4px;"> ${JSON.stringify(data, null, 4)} </pre>
      </td>
      `
    );
	} catch (error: any) {
		return res.send(`<p>${error ? error : "Something went wrong!!!"}`);
	}
});

export const LogController = router;
/* 
todo
1. pagination
2. search
deployment


*/