import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ClaudeLlm, type TurnParams } from "../src/llm.js";

function stubClient(final: Record<string, unknown>) {
  const stream = vi.fn((_body: Record<string, unknown>, _options: { signal: AbortSignal }) => {
    const handlers: ((text: string) => void)[] = [];
    return {
      on: (_event: "text", handler: (text: string) => void) => handlers.push(handler),
      finalMessage: async () => {
        handlers.forEach((h) => h("Hello"));
        return final;
      },
    };
  });
  return { stream, client: { beta: { messages: { stream } } } as unknown as Anthropic };
}

const params = (): TurnParams => ({
  system: "sys",
  messages: [{ role: "user", content: "hi" }],
  tools: [],
  signal: new AbortController().signal,
});

const finalMessage = {
  stop_reason: "tool_use",
  stop_details: null,
  content: [
    { type: "text", text: "Hello" },
    { type: "tool_use", id: "toolu_1", name: "escalate_to_human", input: { reason: "bug" } },
  ],
};

describe("ClaudeLlm.turn", () => {
  it("streams text, returns full content and extracts tool uses", async () => {
    const { client } = stubClient(finalMessage);
    const onText = vi.fn();
    const result = await new ClaudeLlm(client, "claude-opus-5-5").turn(params(), onText);
    expect(onText).toHaveBeenCalledWith("Hello");
    expect(result.stopReason).toBe("tool_use");
    expect(result.content).toEqual(finalMessage.content);
    expect(result.toolUses).toEqual([{ id: "toolu_1", name: "escalate_to_human", input: { reason: "bug" } }]);
  });

  it("reports the refusal category", async () => {
    const { client } = stubClient({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] });
    const result = await new ClaudeLlm(client, "claude-opus-5-5").turn(params(), vi.fn());
    expect(result.stopReason).toBe("refusal");
    expect(result.refusalCategory).toBe("cyber");
  });

  it.each(["claude-opus-5-5", "claude-sonnet-5-5"])("sends the server-side fallback for %s", async (model) => {
    const { client, stream } = stubClient(finalMessage);
    await new ClaudeLlm(client, model).turn(params(), vi.fn());
    const body = stream.mock.calls[0]?.[0];
    expect(body?.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body?.fallbacks).toBe("default");
    expect(body?.output_config).toEqual({ effort: "low" });
    expect(body?.tool_choice).toEqual({ type: "auto" });
  });

  it("omits fallback parameters for models without server-side fallback", async () => {
    const { client, stream } = stubClient(finalMessage);
    await new ClaudeLlm(client, "claude-haiku-5-5").turn(params(), vi.fn());
    const body = stream.mock.calls[0]?.[0];
    expect(body).not.toHaveProperty("betas");
    expect(body).not.toHaveProperty("fallbacks");
  });

  it("maps SDK failures to a 502 upstream_error", async () => {
    const client = {
      beta: {
        messages: {
          stream: () => ({
            on: () => undefined,
            finalMessage: async () => {
              throw new Anthropic.AnthropicError("boom");
            },
          }),
        },
      },
    } as unknown as Anthropic;
    await expect(new ClaudeLlm(client, "claude-opus-5-5").turn(params(), vi.fn())).rejects.toMatchObject({
      status: 502,
      code: "upstream_error",
    });
  });
});
