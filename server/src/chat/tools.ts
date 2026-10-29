import { z } from "zod";
import type { LlmTool, ToolUse } from "../llm.js";
import { ESCALATION_REASONS, type TicketRepo } from "../repo/tickets.js";

export const ESCALATE_TOOL_NAME = "escalate_to_human";

export const escalateTool: LlmTool = {
  name: ESCALATE_TOOL_NAME,
  description:
    "Hand the conversation to a human support agent by opening a ticket. Use when the customer asks for a person, " +
    "the knowledge base cannot resolve the issue, or the issue concerns billing or a suspected bug.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", enum: [...ESCALATION_REASONS], description: "Why the handoff is needed." },
      summary: { type: "string", description: "One or two sentences a human agent can read before replying." },
    },
    required: ["reason", "summary"],
    additionalProperties: false,
  },
};

// eager_input_streaming means the API no longer validates tool input, so check it here.
const escalateInput = z.object({ reason: z.enum(ESCALATION_REASONS), summary: z.string().min(1).max(1000) });

export interface ToolContext {
  siteKey: string;
  conversationId: string;
  tickets: TicketRepo;
  onEscalated(ticketId: string): void;
  /** Set once a ticket has been opened during this request. */
  ticketId?: string;
}

export interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: true;
}

export async function runTool(use: ToolUse, ctx: ToolContext): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ type: "tool_result", tool_use_id: use.id, content, is_error: true });
  if (use.name !== ESCALATE_TOOL_NAME) return fail(`Unknown tool: ${use.name}`);

  const parsed = escalateInput.safeParse(use.input);
  if (!parsed.success) return fail(`Invalid input: ${JSON.stringify(use.input)}`);

  if (ctx.ticketId) {
    return { type: "tool_result", tool_use_id: use.id, content: `Ticket ${ctx.ticketId} is already open.` };
  }
  ctx.ticketId = await ctx.tickets.create({
    conversationId: ctx.conversationId,
    siteKey: ctx.siteKey,
    ...parsed.data,
  });
  ctx.onEscalated(ctx.ticketId);
  return {
    type: "tool_result",
    tool_use_id: use.id,
    content: `Ticket ${ctx.ticketId} opened. Tell the customer briefly that a human agent will follow up.`,
  };
}
