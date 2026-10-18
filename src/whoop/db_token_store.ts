// Persists rotated Cognito tokens in Postgres (table `whoop_tokens`) so a
// serverless cold start picks up the latest refresh token instead of the stale
// one from the environment. `seed_refresh_token` records which env refresh
// token a row was derived from: when the env value changes (fresh `totem auth`),
// the stored row is ignored and replaced.
import type { Sql } from "../db.js";
import type { TokenStore } from "./token_store.js";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export class DbTokenStore implements TokenStore {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private sql: Sql,
    private email: string,
    private seedRefreshToken: string,
  ) {}

  /** Stored tokens for this account, if they descend from the current env seed. */
  async load(): Promise<StoredTokens | null> {
    const rows = (await this.sql`
      SELECT access_token, refresh_token, seed_refresh_token
      FROM whoop_tokens WHERE email = ${this.email}
    `) as Array<{ access_token: string; refresh_token: string; seed_refresh_token: string | null }>;
    const row = rows[0];
    if (!row || row.seed_refresh_token !== this.seedRefreshToken) return null;
    return { accessToken: row.access_token, refreshToken: row.refresh_token };
  }

  save(updates: StoredTokens): void {
    this.pending = this.pending
      .then(
        () => this.sql`
          INSERT INTO whoop_tokens (email, access_token, refresh_token, seed_refresh_token, updated_at)
          VALUES (${this.email}, ${updates.accessToken}, ${updates.refreshToken}, ${this.seedRefreshToken}, now())
          ON CONFLICT (email) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            seed_refresh_token = EXCLUDED.seed_refresh_token,
            updated_at = now()
        `,
      )
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[totem] could not persist Whoop tokens to the database: ${detail}`);
      });
  }

  /** Resolves once every save() issued so far has hit the database. */
  flush(): Promise<unknown> {
    return this.pending;
  }
}
