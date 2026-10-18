// Builds the Whoop client for the Vercel functions (MCP endpoint + journal sync).
// Tokens come from the environment and, when a database is configured, from the
// `whoop_tokens` table so rotated refresh tokens survive cold starts.
import { WhoopClient } from "./whoop/client.js";
import { TokenManager } from "./whoop/token_manager.js";
import { MemoryTokenStore, type TokenStore } from "./whoop/token_store.js";
import { DbTokenStore } from "./whoop/db_token_store.js";
import { resolveInstallationId } from "./whoop/installation.js";
import { getSql, type Sql } from "./db.js";

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key}. Set it in the Vercel project's Environment Variables.`);
  return v;
}

export interface Runtime {
  client: WhoopClient;
  sql: Sql | null;
  /** Wait for pending token writes (call before a serverless function returns). */
  flush: () => Promise<unknown>;
}

export async function buildRuntime(): Promise<Runtime> {
  // Read-only filesystem: the id falls back to one derived from WHOOP_EMAIL.
  resolveInstallationId("/nonexistent/.env");

  const email = requireEnv("WHOOP_EMAIL");
  let accessToken = requireEnv("WHOOP_IOS_BEARER_TOKEN");
  let refreshToken = requireEnv("WHOOP_COGNITO_REFRESH_TOKEN");

  const sql = getSql();
  let store: TokenStore = new MemoryTokenStore();
  let flush: () => Promise<unknown> = () => Promise.resolve();
  if (sql) {
    const dbStore = new DbTokenStore(sql, email, refreshToken);
    try {
      const stored = await dbStore.load();
      if (stored) ({ accessToken, refreshToken } = stored);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[totem] could not load Whoop tokens from the database, using env: ${detail}`);
    }
    store = dbStore;
    flush = () => dbStore.flush();
  }

  const tokenManager = new TokenManager({ email, accessToken, refreshToken, store });
  const client = new WhoopClient({ getToken: () => tokenManager.getToken() });
  return { client, sql, flush };
}
