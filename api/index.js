// Vercel serverless function. All routes are rewritten here (see vercel.json);
// the compiled Express app comes from `tsc` (buildCommand), so dist/ exists at
// deploy time.
import app from "../dist/vercel.js";

export default app;
