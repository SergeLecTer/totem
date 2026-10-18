// Vercel entry point. Builds the same Express app as the HTTP transport
// (server-http.ts) but never binds a port: Vercel invokes the exported app as a
// serverless function. Wired up by api/index.js + vercel.json.
//
// Env (set in the Vercel project settings):
//   WHOOP_EMAIL, WHOOP_IOS_BEARER_TOKEN, WHOOP_COGNITO_REFRESH_TOKEN, MCP_AUTH_TOKEN
//   PUBLIC_URL (optional; defaults to https://$VERCEL_PROJECT_PRODUCTION_URL)
//   AUTH_PASSWORD (optional; enables the OAuth path for claude.ai web connectors)
//
// Serverless instances are ephemeral, so tokens live in memory and MCP runs
// stateless (one server + transport per request, no mcp-session-id).
import { WhoopClient } from "./whoop/client.js";
import { TokenManager } from "./whoop/token_manager.js";
import { MemoryTokenStore } from "./whoop/token_store.js";
import { startTimezoneAutoDetect } from "./whoop/init_timezone.js";
import { resolveInstallationId } from "./whoop/installation.js";
import { createHttpApp } from "./server-http.js";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key}. Set it in the Vercel project's Environment Variables.`);
  return v;
}

if (!process.env.PUBLIC_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  process.env.PUBLIC_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
}

// Read-only filesystem: the id falls back to one derived from WHOOP_EMAIL.
resolveInstallationId("/nonexistent/.env");

const tokenManager = new TokenManager({
  email: requireEnv("WHOOP_EMAIL"),
  accessToken: requireEnv("WHOOP_IOS_BEARER_TOKEN"),
  refreshToken: requireEnv("WHOOP_COGNITO_REFRESH_TOKEN"),
  store: new MemoryTokenStore(),
});
const client = new WhoopClient({ getToken: () => tokenManager.getToken() });
startTimezoneAutoDetect(client);

const app = createHttpApp(client, { authToken: requireEnv("MCP_AUTH_TOKEN"), stateless: true });

export default app;
