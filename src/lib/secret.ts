import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of a presented secret against the configured one.
 * An unset secret, or one still set to the "CHANGE_ME…" placeholder from the
 * project setup, never matches.
 */
export function matchesSecret(given: string, expected: string | undefined): boolean {
  if (!given || !expected || expected.startsWith("CHANGE_ME")) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Token from an `Authorization: Bearer <token>` header, or "" when absent. */
export function bearerToken(header: string | undefined): string {
  return header?.startsWith("Bearer ") ? header.slice(7) : "";
}
