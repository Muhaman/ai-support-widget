import type { Embedder } from "../embed/embedder.js";
import type { KbSection } from "./load.js";

export interface ScoredSection {
  section: KbSection;
  score: number;
}

export interface KbSearch {
  retrieve(query: string, k?: number, minScore?: number): Promise<ScoredSection[]>;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/** In-memory cosine index over KB sections, embedded once at boot. */
export class KbIndex implements KbSearch {
  private constructor(
    private readonly sections: KbSection[],
    private readonly vectors: number[][],
    private readonly embedder: Embedder,
  ) {}

  static async build(sections: KbSection[], embedder: Embedder): Promise<KbIndex> {
    const vectors = sections.length
      ? await embedder.embed(sections.map((s) => `${s.title}\n${s.body}`))
      : [];
    return new KbIndex(sections, vectors, embedder);
  }

  async retrieve(query: string, k = 3, minScore = 0.3): Promise<ScoredSection[]> {
    const [queryVector] = await this.embedder.embed([query]);
    if (!queryVector) return [];
    return this.sections
      .map((section, i) => ({ section, score: cosine(queryVector, this.vectors[i] ?? []) }))
      .filter((hit) => hit.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
