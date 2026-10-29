export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export class ChatStreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ChatStreamError";
  }
}

export interface StreamArgs {
  apiUrl: string;
  siteKey: string;
  conversationId: string | null;
  message: string;
  signal: AbortSignal;
  onMeta(conversationId: string): void;
  onText(text: string): void;
  onEscalated(ticketId: string): void;
}

export interface ChatApi {
  streamChat(args: StreamArgs): Promise<void>;
  loadConversation(apiUrl: string, siteKey: string, id: string): Promise<StoredMessage[] | null>;
}

const base = (apiUrl: string): string => apiUrl.replace(/\/+$/, "");

async function failure(res: Response): Promise<ChatStreamError> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return new ChatStreamError(body.error?.message ?? `Request failed (${res.status})`, res.status);
  } catch {
    return new ChatStreamError(`Request failed (${res.status})`, res.status);
  }
}

/** Dispatches one SSE event; returns true when it was the terminal `done`. */
function dispatch(event: string, data: string, args: StreamArgs): boolean {
  const payload = JSON.parse(data) as Record<string, string>;
  if (event === "meta") args.onMeta(payload.conversationId ?? "");
  else if (event === "text") args.onText(payload.text ?? "");
  else if (event === "escalated") args.onEscalated(payload.ticketId ?? "");
  else if (event === "error") throw new ChatStreamError(payload.message ?? "The assistant ran into a problem.");
  return event === "done";
}

/**
 * POSTs the message and reads the SSE reply. Resolves only after a `done` event;
 * an `error` event, a failed request, or a stream that ends early rejects.
 */
export async function streamChat(args: StreamArgs): Promise<void> {
  const res = await fetch(`${base(args.apiUrl)}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-site-key": args.siteKey },
    body: JSON.stringify({
      message: args.message,
      ...(args.conversationId ? { conversationId: args.conversationId } : {}),
    }),
    signal: args.signal,
  });
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data.push(line.slice(6));
      }
      if (data.length > 0 && dispatch(event, data.join("\n"), args)) return;
      boundary = buffer.indexOf("\n\n");
    }
  }
  throw new ChatStreamError("The connection closed before the reply finished.");
}

export async function loadConversation(apiUrl: string, siteKey: string, id: string): Promise<StoredMessage[] | null> {
  const res = await fetch(`${base(apiUrl)}/v1/conversations/${encodeURIComponent(id)}`, {
    headers: { "x-site-key": siteKey },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { messages: StoredMessage[] }).messages;
}

export const api: ChatApi = { streamChat, loadConversation };
