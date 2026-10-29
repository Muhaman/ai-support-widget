import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { MongoClient } from "mongodb";
import { createApp } from "./app.js";
import { LocalEmbedder } from "./embed/local.js";
import { loadEnv } from "./env.js";
import { loadKb } from "./kb/load.js";
import { KbIndex } from "./kb/retrieve.js";
import { ClaudeLlm } from "./llm.js";
import { createLogger } from "./logger.js";
import { ConversationRepo } from "./repo/conversations.js";
import { TicketRepo } from "./repo/tickets.js";

config({ path: ["../.env", ".env"], quiet: true });

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);

const mongo = await MongoClient.connect(env.MONGODB_URI);
const db = mongo.db(env.MONGODB_DB);

const sections = loadKb(env.KB_DIR);
const kb = await KbIndex.build(sections, new LocalEmbedder(env.MODEL_CACHE_DIR));
logger.info({ sections: sections.length }, "knowledge base indexed");

const app = createApp({
  sites: env.sites,
  conversations: new ConversationRepo(db),
  tickets: new TicketRepo(db),
  kb,
  llm: new ClaudeLlm(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), env.ANTHROPIC_MODEL),
  logger,
});
const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, "server listening"));

function shutdown(): void {
  server.close(() => {
    void mongo.close().finally(() => process.exit(0));
  });
  server.closeAllConnections();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
