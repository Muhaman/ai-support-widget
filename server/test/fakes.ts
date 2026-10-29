import { pino } from "pino";
import type { AppDeps } from "../src/app.js";
import type { Embedder } from "../src/embed/embedder.js";
import type { Llm, TurnParams, TurnResult } from "../src/llm.js";
import type { ConversationRepo } from "../src/repo/conversations.js";
import type { TicketRepo } from "../src/repo/tickets.js";
import type { Site } from "../src/sites.js";

export const SITE_A: Site = { siteKey: "pk_a", name: "Acme Cloud", origins: ["http://site-a.test"] };
export const SITE_B: Site = { siteKey: "pk_b", name: "Other Co", origins: ["http://site-b.test"] };

/** Deterministic embedder: one dimension per distinct word, so unrelated texts score 0. */
export class FakeEmbedder implements Embedder {
  readonly dim = 512;
  private readonly vocab = new Map<string, number>();

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(this.dim).fill(0);
      for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
        if (!this.vocab.has(word)) this.vocab.set(word, this.vocab.size);
        vector[this.vocab.get(word)!] = 1;
      }
      return vector;
    });
  }
}

export type TurnScript = (params: TurnParams, onText: (text: string) => void) => Promise<TurnResult>;

export const endTurn =
  (text: string): TurnScript =>
  async (_params, onText) => {
    onText(text);
    return { stopReason: "end_turn", refusalCategory: null, content: [{ type: "text", text }], toolUses: [] };
  };

/** Plays one script per call and records a snapshot of each call's params. */
export class FakeLlm implements Llm {
  readonly calls: TurnParams[] = [];

  constructor(private readonly scripts: TurnScript[]) {}

  turn(params: TurnParams, onText: (text: string) => void): Promise<TurnResult> {
    this.calls.push({ ...params, messages: [...params.messages] });
    const script = this.scripts[this.calls.length - 1];
    if (!script) throw new Error("FakeLlm: no script for this turn");
    return script(params, onText);
  }
}

/** Stub repos are only touched by tests that expect the request to be rejected earlier. */
export function makeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    sites: [SITE_A, SITE_B],
    conversations: {} as ConversationRepo,
    tickets: {} as TicketRepo,
    kb: { retrieve: async () => [] },
    llm: new FakeLlm([]),
    logger: pino({ level: "silent" }),
    ...overrides,
  };
}
