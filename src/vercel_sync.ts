// Vercel function body for GET /api/sync-journal (called daily by Vercel Cron).
// Auth: `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends) or
// `Bearer <MCP_AUTH_TOKEN>` for manual runs. Optional `?days=N` (1-31, default 7).
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildRuntime } from "./runtime.js";
import { PgJournalStore, syncJournal } from "./journal_sync.js";
import { bearerToken, matchesSecret } from "./lib/secret.js";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 31;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = bearerToken(req.headers.authorization);
  if (!(matchesSecret(token, process.env.CRON_SECRET) || matchesSecret(token, process.env.MCP_AUTH_TOKEN))) {
    send(res, 401, { error: "unauthorized" });
    return;
  }
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const requested = Number(url.searchParams.get("days") ?? DEFAULT_DAYS);
    const days = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, MAX_DAYS) : DEFAULT_DAYS;

    const { client, sql, flush } = await buildRuntime();
    if (!sql) {
      send(res, 500, { error: "no database configured (totem_DATABASE_URL / DATABASE_URL)" });
      return;
    }
    const result = await syncJournal(client, new PgJournalStore(sql), days);
    await flush();
    send(res, result.failed.length ? 207 : 200, result);
  } catch (error) {
    console.error("[totem] journal sync failed:", error);
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
