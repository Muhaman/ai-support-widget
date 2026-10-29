import { Router } from "express";
import { AppError } from "../errors.js";
import type { ConversationRepo } from "../repo/conversations.js";
import type { Site } from "../sites.js";

export function conversationsRouter(deps: { conversations: ConversationRepo }): Router {
  const router = Router();

  router.get("/:id", async (req, res) => {
    const site = res.locals.site as Site;
    const messages = await deps.conversations.messages(req.params.id, site.siteKey);
    if (!messages) throw new AppError(404, "not_found", "Conversation not found.");
    res.json({ messages });
  });

  return router;
}
