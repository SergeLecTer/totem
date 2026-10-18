import { describe, expect, it } from "vitest";
import { MAX_RANGE_DAYS, parseRange } from "../src/journal_api.js";
import { bearerToken, matchesSecret } from "../src/lib/secret.js";

describe("parseRange", () => {
  it("defaults to the 7 days ending at the latest synced day", () => {
    expect(parseRange(null, null, "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("keeps an explicit range and counts days inclusively", () => {
    expect(parseRange("2026-10-01", "2026-10-18", null)).toEqual({ from: "2026-10-01", to: "2026-10-18" });
    expect(parseRange("2026-10-18", "2026-10-18", null)).toEqual({ from: "2026-10-18", to: "2026-10-18" });
  });

  it("derives `from` from an explicit `to`", () => {
    expect(parseRange(null, "2026-03-03", "2026-10-18")).toEqual({ from: "2026-02-25", to: "2026-03-03" });
  });

  it("rejects malformed or impossible dates", () => {
    expect(parseRange("18.10.2026", null, null)).toHaveProperty("error");
    expect(parseRange(null, "2026-02-30", null)).toHaveProperty("error");
    expect(parseRange("2026-13-01", "2026-13-02", null)).toHaveProperty("error");
  });

  it("rejects an inverted range", () => {
    expect(parseRange("2026-10-18", "2026-10-01", null)).toHaveProperty("error");
  });

  it(`allows exactly ${MAX_RANGE_DAYS} days and rejects one more`, () => {
    expect(parseRange("2026-07-18", "2026-10-17", null)).toEqual({ from: "2026-07-18", to: "2026-10-17" });
    expect(parseRange("2026-07-17", "2026-10-17", null)).toHaveProperty("error");
  });
});

describe("matchesSecret", () => {
  it("matches only the exact configured secret", () => {
    expect(matchesSecret("s3cret-value-123456", "s3cret-value-123456")).toBe(true);
    expect(matchesSecret("s3cret-value-123457", "s3cret-value-123456")).toBe(false);
    expect(matchesSecret("short", "s3cret-value-123456")).toBe(false);
  });

  it("never matches an unset, empty or placeholder secret", () => {
    expect(matchesSecret("CHANGE_ME", "CHANGE_ME")).toBe(false);
    expect(matchesSecret("CHANGE_ME_MIN_16_CHARS", "CHANGE_ME_MIN_16_CHARS")).toBe(false);
    expect(matchesSecret("anything", undefined)).toBe(false);
    expect(matchesSecret("", "")).toBe(false);
  });
});

describe("bearerToken", () => {
  it("extracts the token from a Bearer header", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBe("");
    expect(bearerToken(undefined)).toBe("");
  });
});
