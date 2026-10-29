import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

const base = {
  ANTHROPIC_API_KEY: "k",
  MONGODB_URI: "mongodb://localhost",
  SITES_JSON: JSON.stringify([{ siteKey: "pk_a", name: "A", origins: ["http://a.test"] }]),
};

describe("loadEnv", () => {
  it("throws naming ANTHROPIC_API_KEY when it is missing", () => {
    expect(() => loadEnv({ ...base, ANTHROPIC_API_KEY: undefined })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws naming MONGODB_URI when it is missing", () => {
    expect(() => loadEnv({ ...base, MONGODB_URI: undefined })).toThrow(/MONGODB_URI/);
  });

  it("throws naming SITES_JSON when it is missing", () => {
    expect(() => loadEnv({ ...base, SITES_JSON: undefined })).toThrow(/SITES_JSON/);
  });

  it("throws naming SITES_JSON when it is not valid JSON", () => {
    expect(() => loadEnv({ ...base, SITES_JSON: "not json" })).toThrow(/SITES_JSON/);
  });

  it("throws naming SITES_JSON when entries have the wrong shape", () => {
    expect(() => loadEnv({ ...base, SITES_JSON: '[{"siteKey":"x"}]' })).toThrow(/SITES_JSON/);
  });

  it("parses sites and applies defaults", () => {
    const env = loadEnv(base);
    expect(env.sites).toEqual([{ siteKey: "pk_a", name: "A", origins: ["http://a.test"] }]);
    expect(env.PORT).toBe(3000);
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5-5");
  });
});
