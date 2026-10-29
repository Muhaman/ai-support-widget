import { LlmRefusalError, LlmTruncatedError } from "../errors.js";
import type { KbSearch, ScoredSection } from "../kb/retrieve.js";
import type { Llm, LlmMessage } from "../llm.js";
import type { Logger } from "../logger.js";
import type { ConversationRepo } from "../repo/conversations.js";
import type { TicketRepo } from "../repo/tickets.js";
import type { Site } from "../sites.js";
import { escalateTool, runTool, type ToolContext, type ToolResult } from "./tools.js";

export const HISTORY_LIMIT = 20;
const MAX_MODEL_TURNS = 4;

export interface ChatDeps {
  conversations: ConversationRepo;
  tickets: TicketRepo;
  kb: KbSearch;
  llm: Llm;
  logger: Logger;
}

export type ChatEmit = (event: "text" | "escalated", data: Record<string, string>) => void;

export function buildSystemPrompt(siteName: string, hits: ScoredSection[]): string {
  const base =
    `You are the support assistant for ${siteName}. Be concise, friendly and accurate. ` +
    "Answer only from the knowledge base articles below; never invent policies, prices or features. " +
    "Greetings and small talk are fine. " +
    "Call escalate_to_human when the customer asks for a person, when you cannot resolve the issue, " +
    "or for billing disputes and suspected bugs. After the tool returns, write a short handoff message.";
  if (hits.length === 0) {
    return (
      `${base}\n\nNo relevant knowledge base articles were found for this message. ` +
      "Do not guess an answer. Help with greetings and general courtesy, ask a clarifying question if it would help, " +
      "and offer to hand the customer to a human agent (escalate_to_human) if they need more."
    );
  }
  const articles = hits.map((h) => `### ${h.section.title}\n${h.section.body}`).join("\n\n");
  return `${base}\n\nKnowledge base articles:\n\n${articles}`;
}

/** Runs one user turn: persist, retrieve, stream the model, handle escalation, persist the reply. */
export async function runChat(
  deps: ChatDeps,
  input: { site: Site; conversationId: string; message: string },
  emit: ChatEmit,
  signal: AbortSignal,
): Promise<void> {
  const { site, conversationId, message } = input;
  await deps.conversations.append(conversationId, [{ role: "user", content: message, createdAt: new Date() }]);

  const hits = await deps.kb.retrieve(message);
  const system = buildSystemPrompt(site.name, hits);

  const stored = await deps.conversations.recent(conversationId, HISTORY_LIMIT);
  const firstUser = stored.findIndex((m) => m.role === "user");
  const messages: LlmMessage[] = stored.slice(Math.max(firstUser, 0)).map((m) => ({ role: m.role, content: m.content }));

  const toolContext: ToolContext = {
    siteKey: site.siteKey,
    conversationId,
    tickets: deps.tickets,
    onEscalated: (ticketId) => emit("escalated", { ticketId }),
  };

  let reply = "";
  const onText = (text: string): void => {
    reply += text;
    emit("text", { text });
  };

  for (let turn = 0; turn < MAX_MODEL_TURNS; turn++) {
    const result = await deps.llm.turn({ system, messages, tools: [escalateTool], signal }, onText);
    if (result.stopReason === "refusal") throw new LlmRefusalError(result.refusalCategory);
    if (result.stopReason === "max_tokens") throw new LlmTruncatedError();
    if (result.toolUses.length === 0) break;

    messages.push({ role: "assistant", content: result.content });
    const results: ToolResult[] = [];
    for (const use of result.toolUses) results.push(await runTool(use, toolContext));
    messages.push({ role: "user", content: results });
  }

  if (reply && !signal.aborted) {
    await deps.conversations.append(conversationId, [{ role: "assistant", content: reply, createdAt: new Date() }]);
  }
  deps.logger.info({ conversationId, siteKey: site.siteKey, hits: hits.length, escalated: Boolean(toolContext.ticketId) }, "chat turn");
}
