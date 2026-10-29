import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface KbSection {
  source: string;
  title: string;
  body: string;
}

/** Reads every `*.md` file in `dir` and splits it into sections on `## ` headings; text before the first heading is ignored. */
export function loadKb(dir: string): KbSection[] {
  const sections: KbSection[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const chunk of text.split(/^## /m).slice(1)) {
      const [titleLine = "", ...lines] = chunk.split("\n");
      const body = lines.join("\n").trim();
      if (body) sections.push({ source: file, title: titleLine.trim(), body });
    }
  }
  return sections;
}
