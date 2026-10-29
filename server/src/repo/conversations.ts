import { randomUUID } from "node:crypto";
import type { Collection, Db } from "mongodb";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

interface ConversationDoc {
  _id: string;
  siteKey: string;
  messages: StoredMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export class ConversationRepo {
  private readonly col: Collection<ConversationDoc>;

  constructor(db: Db) {
    this.col = db.collection<ConversationDoc>("conversations");
  }

  async create(siteKey: string): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await this.col.insertOne({ _id: id, siteKey, messages: [], createdAt: now, updatedAt: now });
    return id;
  }

  /** All messages of the conversation, or null when it does not exist for this site. */
  async messages(id: string, siteKey: string): Promise<StoredMessage[] | null> {
    const doc = await this.col.findOne({ _id: id, siteKey }, { projection: { messages: 1 } });
    return doc?.messages ?? null;
  }

  async append(id: string, messages: StoredMessage[]): Promise<void> {
    await this.col.updateOne({ _id: id }, { $push: { messages: { $each: messages } }, $set: { updatedAt: new Date() } });
  }

  async recent(id: string, limit: number): Promise<StoredMessage[]> {
    const doc = await this.col.findOne({ _id: id }, { projection: { messages: { $slice: -limit } } });
    return doc?.messages ?? [];
  }
}
