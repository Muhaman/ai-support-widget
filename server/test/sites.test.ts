import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { makeDeps, SITE_A } from "./fakes.js";

const app = createApp(makeDeps());

describe("site guard", () => {
  it("returns 403 for an unknown site key", async () => {
    const res = await request(app)
      .post("/v1/chat")
      .set("x-site-key", "pk_unknown")
      .set("Origin", "http://site-a.test")
      .send({ message: "hi" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 403 when the site key is missing", async () => {
    const res = await request(app).post("/v1/chat").set("Origin", "http://site-a.test").send({ message: "hi" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for a known site key from a foreign origin", async () => {
    const res = await request(app)
      .post("/v1/chat")
      .set("x-site-key", SITE_A.siteKey)
      .set("Origin", "http://evil.test")
      .send({ message: "hi" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 403 when the Origin header is absent", async () => {
    const res = await request(app).post("/v1/chat").set("x-site-key", SITE_A.siteKey).send({ message: "hi" });
    expect(res.status).toBe(403);
  });

  it("answers CORS preflight for an allowed origin", async () => {
    const res = await request(app)
      .options("/v1/chat")
      .set("Origin", "http://site-a.test")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-site-key");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://site-a.test");
  });
});

describe("rate limiting", () => {
  it("returns a 429 JSON error once the limit is exceeded, never limiting /healthz", async () => {
    const limited = createApp(makeDeps({ rateLimitPerMinute: 1 }));
    expect((await request(limited).get("/healthz")).status).toBe(200);
    expect((await request(limited).get("/healthz")).status).toBe(200);
    await request(limited).get("/v1/conversations/x");
    const res = await request(limited).get("/v1/conversations/x");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: { code: "rate_limited", message: "Too many requests." } });
  });
});
