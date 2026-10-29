import { z } from "zod";
import { siteSchema } from "./sites.js";

const sitesJson = z
  .string()
  .min(1)
  .transform((raw, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: "custom", message: "must be valid JSON" });
      return z.NEVER;
    }
    const result = z.array(siteSchema).min(1).safeParse(parsed);
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      ctx.addIssue({ code: "custom", message: `expected [{siteKey, name, origins[]}] (${detail})` });
      return z.NEVER;
    }
    return result.data;
  });

const schema = z
  .object({
    ANTHROPIC_API_KEY: z.string().min(1),
    ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB: z.string().min(1).default("supportwidget"),
    SITES_JSON: sitesJson,
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    KB_DIR: z.string().min(1).default("kb"),
    MODEL_CACHE_DIR: z.string().min(1).default(".model-cache"),
  })
  .transform(({ SITES_JSON, ...rest }) => ({ ...rest, sites: SITES_JSON }));

export type Env = z.output<typeof schema>;

export function loadEnv(src: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(src);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment: ${problems.join("; ")}`);
  }
  return result.data;
}
