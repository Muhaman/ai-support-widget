import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { ChatDeps } from "./chat/service.js";
import { errorHandler } from "./errors.js";
import { chatRouter } from "./routes/chat.js";
import { conversationsRouter } from "./routes/conversations.js";
import { requireSite, type Site } from "./sites.js";

export interface AppDeps extends ChatDeps {
  sites: Site[];
  /** Requests per minute per client; defaults to 120. */
  rateLimitPerMinute?: number;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    res.setHeader("x-request-id", requestId);
    const startedAt = Date.now();
    res.on("finish", () => {
      deps.logger.info(
        { requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - startedAt },
        "request",
      );
    });
    next();
  });

  app.use(helmet());
  app.use(cors({ origin: [...new Set(deps.sites.flatMap((site) => site.origins))] }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: deps.rateLimitPerMinute ?? 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: { code: "rate_limited", message: "Too many requests." } });
      },
    }),
  );

  app.use("/v1", requireSite(deps.sites));
  app.use("/v1/chat", express.json({ limit: "20kb" }), chatRouter(deps));
  app.use("/v1/conversations", conversationsRouter(deps));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Route not found." } });
  });
  app.use(errorHandler(deps.logger));
  return app;
}
