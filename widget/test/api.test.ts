import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatStreamError, streamChat, type StreamArgs } from "../src/api";

function sse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

function args(overrides: Partial<StreamArgs> = {}): StreamArgs {
  return {
    apiUrl: "http://api.test/",
    siteKey: "pk_demo",
    conversationId: null,
    message: "hi",
    signal: new AbortController().signal,
    onMeta: vi.fn(),
    onText: vi.fn(),
    onEscalated: vi.fn(),
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("streamChat", () => {
  it("dispatches events split across chunks and resolves on done", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        'event: meta\ndata: {"conversationId":"c1"}\n\nevent: te',
        'xt\ndata: {"text":"Hi"}\n\nevent: done\ndata: {}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const a = args();
    await streamChat(a);
    expect(a.onMeta).toHaveBeenCalledWith("c1");
    expect(a.onText).toHaveBeenCalledWith("Hi");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/chat");
    expect((init.headers as Record<string, string>)["x-site-key"]).toBe("pk_demo");
  });

  it("rejects when the stream ends without a done event", async () => {
    vi.stubGlobal("fetch", async () => sse(['event: text\ndata: {"text":"Hi"}\n\n']));
    await expect(streamChat(args())).rejects.toBeInstanceOf(ChatStreamError);
  });

  it("rejects with the server message on an error event", async () => {
    vi.stubGlobal("fetch", async () =>
      sse(['event: error\ndata: {"code":"refusal","message":"The model declined to answer."}\n\n']),
    );
    await expect(streamChat(args())).rejects.toThrow("The model declined to answer.");
  });

  it("rejects with the HTTP status on a non-2xx response", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: { code: "not_found", message: "Conversation not found." } }, { status: 404 }),
    );
    await expect(streamChat(args())).rejects.toMatchObject({ status: 404 });
  });
});
