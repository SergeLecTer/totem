// Vercel function body for GET /api/journal: read-only access to the journal
// days stored by the sync, for third-party apps.
// Auth: `Authorization: Bearer <READ_API_KEY>` (16+ chars; a dedicated key, so it
// can't reach the MCP endpoint or trigger a sync).
// Query: `from`, `to` (YYYY-MM-DD, inclusive; at most 92 days; default: the
// latest 7 synced days).
import type { IncomingMessage, ServerResponse } from "node:http";
import { getSql } from "./db.js";
import { fetchJournalDays, latestSyncedDate, parseRange } from "./journal_api.js";
import { bearerToken, matchesSecret } from "./lib/secret.js";

const MIN_KEY_LENGTH = 16;

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") {
    send(res, 405, { error: "method not allowed" }, { allow: "GET" });
    return;
  }
  const key = process.env.READ_API_KEY;
  if (!key || key.length < MIN_KEY_LENGTH || !matchesSecret(bearerToken(req.headers.authorization), key)) {
    send(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
    return;
  }
  try {
    const sql = getSql();
    if (!sql) {
      send(res, 500, { error: "no database configured" });
      return;
    }
    const query = new URL(req.url ?? "/", "http://localhost").searchParams;
    const to = query.get("to");
    const range = parseRange(query.get("from"), to, to === null ? await latestSyncedDate(sql) : null);
    if ("error" in range) {
      send(res, 400, { error: range.error });
      return;
    }
    send(res, 200, { ...range, days: await fetchJournalDays(sql, range) });
  } catch (error) {
    console.error("[totem] journal read failed:", error);
    send(res, 500, { error: "internal server error" });
  }
}
