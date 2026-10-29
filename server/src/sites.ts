import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "./errors.js";

export const siteSchema = z.object({
  siteKey: z.string().min(1),
  name: z.string().min(1),
  origins: z.array(z.string().min(1)).min(1),
});

export type Site = z.infer<typeof siteSchema>;

/** Requires a known `x-site-key` and an `Origin` that site allows; exposes the site as `res.locals.site`. */
export function requireSite(sites: Site[]): RequestHandler {
  const byKey = new Map(sites.map((site) => [site.siteKey, site]));
  return (req, res, next) => {
    const site = byKey.get(req.header("x-site-key") ?? "");
    if (!site) {
      next(new AppError(403, "forbidden", "Unknown site key."));
      return;
    }
    const origin = req.header("origin");
    if (!origin || !site.origins.includes(origin)) {
      next(new AppError(403, "forbidden", "Origin not allowed for this site key."));
      return;
    }
    res.locals.site = site;
    next();
  };
}
