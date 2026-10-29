import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadKb } from "../src/kb/load.js";
import { KbIndex } from "../src/kb/retrieve.js";
import { FakeEmbedder } from "./fakes.js";

describe("loadKb", () => {
  it("splits a file with three ## headings into three titled sections", () => {
    const dir = mkdtempSync(join(tmpdir(), "kb-"));
    writeFileSync(
      join(dir, "faq.md"),
      "# FAQ\n\nPreamble is ignored.\n\n## First\nOne.\n\n## Second\nTwo.\n\n## Third\nThree.\n",
    );
    const sections = loadKb(dir);
    expect(sections.map((s) => s.title)).toEqual(["First", "Second", "Third"]);
    expect(sections[1]?.body).toBe("Two.");
    expect(sections[0]?.source).toBe("faq.md");
  });
});

describe("KbIndex.retrieve", () => {
  const sections = [
    { source: "a.md", title: "Reset password", body: "Open settings and reset password." },
    { source: "a.md", title: "Invoices", body: "Download invoices from billing." },
  ];

  it("returns the best match first and drops results below minScore", async () => {
    const index = await KbIndex.build(sections, new FakeEmbedder());
    const hits = await index.retrieve("reset password");
    expect(hits[0]?.section.title).toBe("Reset password");
    expect(hits.every((h) => h.score >= 0.3)).toBe(true);
    expect(hits.some((h) => h.section.title === "Invoices")).toBe(false);
  });

  it("returns nothing when no section reaches minScore", async () => {
    const index = await KbIndex.build(sections, new FakeEmbedder());
    expect(await index.retrieve("zebra quantum")).toEqual([]);
  });

  it("caps results at k", async () => {
    const index = await KbIndex.build(sections, new FakeEmbedder());
    expect(await index.retrieve("reset password invoices billing settings", 1, 0)).toHaveLength(1);
  });
});
