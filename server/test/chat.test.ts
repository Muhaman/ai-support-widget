import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { KbIndex } from "../src/kb/retrieve.js";
import { ConversationRepo } from "../src/repo/conversations.js";
import { TicketRepo } from "../src/repo/tickets.js";
import { endTurn, FakeEmbedder, FakeLlm, makeDeps, SITE_A, SITE_B, type TurnScript } from "./fakes.js";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("support-test");
});

afterAll(async () => {
  await client.close();
  await mongod.stop();
});

const kbSections = [
  { source: "faq.md", title: "Reset password", body: "Open settings and choose reset password." },
];

async function buildApp(scripts: TurnScript[]) {
  const llm = new FakeLlm(scripts);
  const conversations = new ConversationRepo(db);
  const app = createApp(
    makeDeps({
      llm,
      conversations,
      tickets: new TicketRepo(db),
      kb: await KbIndex.build(kbSections, new FakeEmbedder()),
    }),
  );
  return { app, llm, conversations };
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseSse(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "";
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? "{}";
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

const post = (app: ReturnType<typeof createApp>, payload: object, site = SITE_A) =>
  request(app)
    .post("/v1/chat")
    .set("x-site-key", site.siteKey)
    .set("Origin", site.origins[0]!)
    .send(payload)
    .buffer(true)
    .parse((res, cb) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (data += c));
      res.on("end", () => cb(null, data));
    });

const asEvents = (res: { body: unknown }) => parseSse(res.body as string);

describe("POST /v1/chat", () => {
  it("opens with a meta event carrying the conversation id and ends with done", async () => {
    const { app } = await buildApp([endTurn("Hello!")]);
    const res = await post(app, { message: "reset password" });
    const events = asEvents(res);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(events[0]?.event).toBe("meta");
    expect(typeof events[0]?.data.conversationId).toBe("string");
    expect(events.some((e) => e.event === "text" && e.data.text === "Hello!")).toBe(true);
    expect(events.at(-1)?.event).toBe("done");
  });

  it("persists the exchange so GET returns it for the same site", async () => {
    const { app } = await buildApp([endTurn("Hello!")]);
    const id = asEvents(await post(app, { message: "reset password" }))[0]?.data.conversationId as string;
    const res = await request(app)
      .get(`/v1/conversations/${id}`)
      .set("x-site-key", SITE_A.siteKey)
      .set("Origin", SITE_A.origins[0]!);
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
      ["user", "reset password"],
      ["assistant", "Hello!"],
    ]);
  });

  it("returns 404 for a conversation that belongs to another site", async () => {
    const { app } = await buildApp([endTurn("Hello!"), endTurn("unused")]);
    const id = asEvents(await post(app, { message: "reset password" }))[0]?.data.conversationId as string;
    const get = await request(app)
      .get(`/v1/conversations/${id}`)
      .set("x-site-key", SITE_B.siteKey)
      .set("Origin", SITE_B.origins[0]!);
    expect(get.status).toBe(404);
    const continued = await request(app)
      .post("/v1/chat")
      .set("x-site-key", SITE_B.siteKey)
      .set("Origin", SITE_B.origins[0]!)
      .send({ conversationId: id, message: "hi" });
    expect(continued.status).toBe(404);
    expect(continued.body.error.code).toBe("not_found");
  });

  it("rejects an invalid body with 400", async () => {
    const { app } = await buildApp([]);
    const res = await request(app)
      .post("/v1/chat")
      .set("x-site-key", SITE_A.siteKey)
      .set("Origin", SITE_A.origins[0]!)
      .send({ message: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("sends at most the last 20 stored messages to the model", async () => {
    const { app, llm, conversations } = await buildApp([endTurn("ok")]);
    const id = await conversations.create(SITE_A.siteKey);
    const seeded = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m${i}`,
      createdAt: new Date(),
    }));
    await conversations.append(id, seeded);
    await post(app, { conversationId: id, message: "latest" });
    const sent = llm.calls[0]!.messages;
    expect(sent).toHaveLength(20);
    expect(sent.at(-1)).toEqual({ role: "user", content: "latest" });
  });

  it("emits an error event with code refusal and no done when the model refuses", async () => {
    const refusal: TurnScript = async () => ({
      stopReason: "refusal",
      refusalCategory: "cyber",
      content: [],
      toolUses: [],
    });
    const { app } = await buildApp([refusal]);
    const events = asEvents(await post(app, { message: "reset password" }));
    const error = events.find((e) => e.event === "error");
    expect(error?.data.code).toBe("refusal");
    expect(events.some((e) => e.event === "done")).toBe(false);
  });

  it("emits an error event with code max_tokens when the reply is truncated", async () => {
    const truncated: TurnScript = async () => ({
      stopReason: "max_tokens",
      refusalCategory: null,
      content: [],
      toolUses: [],
    });
    const { app } = await buildApp([truncated]);
    const events = asEvents(await post(app, { message: "reset password" }));
    expect(events.find((e) => e.event === "error")?.data.code).toBe("max_tokens");
  });

  it("creates a ticket and emits escalated when the model calls escalate_to_human", async () => {
    const toolTurn: TurnScript = async (_params, onText) => {
      onText("Let me get a person.");
      const input = { reason: "billing", summary: "Customer was double charged." };
      return {
        stopReason: "tool_use",
        refusalCategory: null,
        content: [
          { type: "text", text: "Let me get a person." },
          { type: "tool_use", id: "toolu_1", name: "escalate_to_human", input },
        ],
        toolUses: [{ id: "toolu_1", name: "escalate_to_human", input }],
      };
    };
    const { app, llm } = await buildApp([toolTurn, endTurn(" A human agent will follow up.")]);
    const events = asEvents(await post(app, { message: "I was charged twice" }));
    const conversationId = events[0]?.data.conversationId as string;

    const escalated = events.find((e) => e.event === "escalated");
    expect(typeof escalated?.data.ticketId).toBe("string");
    expect(events.at(-1)?.event).toBe("done");

    const tickets = await db.collection("tickets").find({ conversationId }).toArray();
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      siteKey: SITE_A.siteKey,
      reason: "billing",
      summary: "Customer was double charged.",
      status: "open",
    });
    expect(tickets[0]?._id.toHexString()).toBe(escalated?.data.ticketId);

    const followUp = llm.calls[1]!.messages;
    expect(followUp.at(-2)?.role).toBe("assistant");
    expect(followUp.at(-1)).toEqual({
      role: "user",
      content: [expect.objectContaining({ type: "tool_result", tool_use_id: "toolu_1" })],
    });
  });

  it("returns an error tool_result and no ticket when the tool input is invalid", async () => {
    const input = { reason: "because", summary: "" };
    const badTool: TurnScript = async () => ({
      stopReason: "tool_use",
      refusalCategory: null,
      content: [{ type: "tool_use", id: "toolu_2", name: "escalate_to_human", input }],
      toolUses: [{ id: "toolu_2", name: "escalate_to_human", input }],
    });
    const { app, llm } = await buildApp([badTool, endTurn("Sorry about that.")]);
    const events = asEvents(await post(app, { message: "bad tool marker" }));
    expect(events.some((e) => e.event === "escalated")).toBe(false);
    const result = llm.calls[1]!.messages.at(-1)!.content as { is_error?: boolean }[];
    expect(result[0]?.is_error).toBe(true);
  });

  it("tells the model no articles matched and to offer a handoff on a KB miss", async () => {
    const { app, llm } = await buildApp([endTurn("Hi! How can I help?")]);
    const events = asEvents(await post(app, { message: "zebra quantum" }));
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.system).toContain("No relevant knowledge base articles");
    expect(llm.calls[0]?.system).toContain("escalate_to_human");
    expect(events.at(-1)?.event).toBe("done");
  });

  it("includes matching articles in the system prompt on a KB hit", async () => {
    const { app, llm } = await buildApp([endTurn("ok")]);
    await post(app, { message: "reset password" });
    expect(llm.calls[0]?.system).toContain("Open settings and choose reset password.");
    expect(llm.calls[0]?.system).not.toContain("No relevant knowledge base articles");
  });

  it("aborts the LLM signal when the client disconnects", async () => {
    let seen: AbortSignal | undefined;
    const hang: TurnScript = async (params, onText) => {
      seen = params.signal;
      onText("partial");
      await new Promise<void>((resolve) => params.signal.addEventListener("abort", () => resolve(), { once: true }));
      throw new Error("aborted");
    };
    const { app } = await buildApp([hang]);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const controller = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-site-key": SITE_A.siteKey,
          origin: SITE_A.origins[0]!,
        },
        body: JSON.stringify({ message: "reset password" }),
        signal: controller.signal,
      });
      await res.body!.getReader().read();
      controller.abort();
      await expect.poll(() => seen?.aborted).toBe(true);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
