import Anthropic from "@anthropic-ai/sdk";
import { UpstreamError } from "./errors.js";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

export interface LlmTool {
  name: string;
  description: string;
  strict: true;
  eager_input_streaming: true;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface TurnParams {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  signal: AbortSignal;
}

export interface TurnResult {
  stopReason: string | null;
  refusalCategory: string | null;
  /** The full assistant content, to be appended to the conversation verbatim. */
  content: unknown[];
  toolUses: ToolUse[];
}

export interface Llm {
  /** Runs one streaming model turn, forwarding text deltas to `onText`. */
  turn(params: TurnParams, onText: (text: string) => void): Promise<TurnResult>;
}

type StreamBody = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

const MAX_TOKENS = 16_000;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Only these models support the server-side refusal fallback. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export class ClaudeLlm implements Llm {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {}

  async turn(params: TurnParams, onText: (text: string) => void): Promise<TurnResult> {
    const body = {
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: params.system,
      output_config: { effort: "low" },
      tools: params.tools,
      tool_choice: { type: "auto" },
      messages: params.messages,
      ...(FALLBACK_MODELS.has(this.model) ? { betas: [FALLBACK_BETA], fallbacks: "default" } : {}),
    } as unknown as StreamBody;

    try {
      const stream = this.client.beta.messages.stream(body, { signal: params.signal });
      stream.on("text", onText);
      const final = await stream.finalMessage();

      const toolUses: ToolUse[] = [];
      for (const block of final.content) {
        if (block.type === "tool_use") toolUses.push({ id: block.id, name: block.name, input: block.input });
      }
      return {
        stopReason: final.stop_reason,
        refusalCategory: final.stop_details?.category ?? null,
        content: final.content,
        toolUses,
      };
    } catch (err) {
      if (params.signal.aborted || !(err instanceof Anthropic.AnthropicError)) throw err;
      throw new UpstreamError();
    }
  }
}
