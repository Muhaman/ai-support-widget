import { Router, type Response } from "express";
import { z } from "zod";
import { runChat, type ChatDeps } from "../chat/service.js";
import { AppError, toErrorBody } from "../errors.js";
import type { Site } from "../sites.js";

const body = z.object({
  conversationId: z.string().min(1).max(100).optional(),
  message: z.string().min(1).max(2000),
});

function send(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function chatRouter(deps: ChatDeps): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const site = res.locals.site as Site;
    const { conversationId: requested, message } = body.parse(req.body);

    let conversationId = requested;
    if (conversationId) {
      if (!(await deps.conversations.messages(conversationId, site.siteKey))) {
        throw new AppError(404, "not_found", "Conversation not found.");
      }
    } else {
      conversationId = await deps.conversations.create(site.siteKey);
    }

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    send(res, "meta", { conversationId });

    try {
      await runChat(deps, { site, conversationId, message }, (event, data) => send(res, event, data), controller.signal);
      if (!controller.signal.aborted) send(res, "done", {});
    } catch (err) {
      if (!controller.signal.aborted) {
        const { status, body: errorBody } = toErrorBody(err);
        if (status >= 500 && status !== 502) deps.logger.error({ err }, "chat stream failed");
        send(res, "error", errorBody.error);
      }
    } finally {
      res.end();
    }
  });

  return router;
}
