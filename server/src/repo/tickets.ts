import type { Collection, Db } from "mongodb";

export const ESCALATION_REASONS = ["user_request", "unresolved", "billing", "bug"] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export interface NewTicket {
  conversationId: string;
  siteKey: string;
  reason: EscalationReason;
  summary: string;
}

interface TicketDoc extends NewTicket {
  status: "open";
  createdAt: Date;
}

export class TicketRepo {
  private readonly col: Collection<TicketDoc>;

  constructor(db: Db) {
    this.col = db.collection<TicketDoc>("tickets");
  }

  /** Persists an open ticket and returns its id. */
  async create(ticket: NewTicket): Promise<string> {
    const { insertedId } = await this.col.insertOne({ ...ticket, status: "open", createdAt: new Date() } as TicketDoc);
    return insertedId.toHexString();
  }
}
