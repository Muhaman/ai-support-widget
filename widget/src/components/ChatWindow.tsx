import { useCallback, useEffect, useRef, useState } from "react";
import { ChatStreamError, type ChatApi } from "../api";
import { clearConversationId, loadConversationId, saveConversationId } from "../session";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";

interface Props {
  siteKey: string;
  apiUrl: string;
  title: string;
  api: ChatApi;
  onClose(): void;
  id?: string;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

type Status = "idle" | "streaming" | "error";

export function ChatWindow({ siteKey, apiUrl, title, api, onClose, id }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [escalated, setEscalated] = useState(false);
  const conversationId = useRef<string | null>(null);
  const lastMessage = useRef("");
  const nextId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadConversationId(siteKey);
    if (!stored) return;
    let cancelled = false;
    api
      .loadConversation(apiUrl, siteKey, stored)
      .then((history) => {
        if (cancelled) return;
        if (!history) {
          clearConversationId(siteKey);
          return;
        }
        conversationId.current = stored;
        setMessages(history.map((m) => ({ id: nextId.current++, role: m.role, text: m.content })));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, apiUrl, siteKey]);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);

  const send = useCallback(
    async (text: string, retry = false): Promise<void> => {
      lastMessage.current = text;
      const assistantId = nextId.current++;
      const userId = retry ? null : nextId.current++;
      setStatus("streaming");
      setMessages((prev) => {
        const kept = retry && prev.at(-1)?.role === "assistant" ? prev.slice(0, -1) : prev;
        const user: ChatMessage[] = userId === null ? [] : [{ id: userId, role: "user", text }];
        return [...kept, ...user, { id: assistantId, role: "assistant", text: "" }];
      });

      const current = new AbortController();
      controller.current = current;
      try {
        await api.streamChat({
          apiUrl,
          siteKey,
          conversationId: conversationId.current,
          message: text,
          signal: current.signal,
          onMeta: (newId) => {
            conversationId.current = newId;
            saveConversationId(siteKey, newId);
          },
          onText: (chunk) =>
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m))),
          onEscalated: () => setEscalated(true),
        });
        setStatus("idle");
      } catch (err) {
        if (current.signal.aborted) return;
        if (err instanceof ChatStreamError && err.status === 404) {
          conversationId.current = null;
          clearConversationId(siteKey);
        }
        setStatus("error");
      }
    },
    [api, apiUrl, siteKey],
  );

  return (
    <section id={id} className="sw-window" role="dialog" aria-label={title}>
      <header className="sw-header">
        <span className="sw-title">{title}</span>
        <button type="button" className="sw-close" aria-label="Close chat" onClick={onClose}>
          {"×"}
        </button>
      </header>
      <div className="sw-messages" role="log" aria-live="polite" ref={list}>
        {messages.length === 0 && <p className="sw-empty">Hi! Ask us anything about your account or deployments.</p>}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} text={m.text} />
        ))}
        {escalated && <p className="sw-notice">A human agent has been notified and will follow up.</p>}
        {status === "error" && (
          <div className="sw-error" role="alert">
            <span>Something went wrong.</span>
            <button type="button" onClick={() => void send(lastMessage.current, true)}>
              Retry
            </button>
          </div>
        )}
      </div>
      <Composer disabled={status === "streaming"} onSend={(text) => void send(text)} />
    </section>
  );
}
