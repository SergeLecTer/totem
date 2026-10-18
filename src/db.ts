// Neon Postgres access for the Vercel deployment. The Vercel↔Neon integration
// injects the connection string as `<prefix>_DATABASE_URL` (this project's
// prefix is `totem_`), so accept that as well as a plain DATABASE_URL.
import { neon } from "@neondatabase/serverless";

export type Sql = ReturnType<typeof neon>;

export function databaseUrl(): string | null {
  return process.env.totem_DATABASE_URL || process.env.DATABASE_URL || null;
}

/** Neon HTTP client, or null when no database is configured. */
export function getSql(): Sql | null {
  const url = databaseUrl();
  return url ? neon(url) : null;
}
