// Vercel entry point. Builds the same Express app as the HTTP transport
// (server-http.ts) but never binds a port: Vercel invokes the exported app as a
// serverless function. Wired up by api/index.js + vercel.json.
//
// Env (set in the Vercel project settings):
//   WHOOP_EMAIL, WHOOP_IOS_BEARER_TOKEN, WHOOP_COGNITO_REFRESH_TOKEN, MCP_AUTH_TOKEN
//   PUBLIC_URL (optional; defaults to https://$VERCEL_PROJECT_PRODUCTION_URL)
//   AUTH_PASSWORD (optional; enables the OAuth path for claude.ai web connectors)
//
// Serverless instances are ephemeral, so MCP runs stateless (one server +
// transport per request, no mcp-session-id).
import { startTimezoneAutoDetect } from "./whoop/init_timezone.js";
import { createHttpApp } from "./server-http.js";
import { buildRuntime, requireEnv } from "./runtime.js";

if (!process.env.PUBLIC_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  process.env.PUBLIC_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
}

const { client } = await buildRuntime();
startTimezoneAutoDetect(client);

const app = createHttpApp(client, { authToken: requireEnv("MCP_AUTH_TOKEN"), stateless: true });

export default app;
