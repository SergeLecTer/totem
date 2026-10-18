// Read side of the journal sync: validates the requested date range and loads
// the stored Whoop journal days (entry + behaviors) from Postgres.
import type { Sql } from "./db.js";
import { lastNDates } from "./journal_sync.js";
import { todayIso } from "./lib/dates.js";

export const DEFAULT_DAYS = 7;
export const MAX_RANGE_DAYS = 92;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!ISO_DAY.test(s)) return false;
  const time = Date.parse(`${s}T00:00:00Z`);
  // Date.parse rolls 2026-02-30 over to March; round-trip to catch that.
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === s;
}

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Resolve `from`/`to` (inclusive). `to` defaults to `latest` (the newest synced
 * day, or today when nothing is stored), `from` to DEFAULT_DAYS - 1 days before it.
 */
export function parseRange(
  from: string | null,
  to: string | null,
  latest: string | null,
): DateRange | { error: string } {
  if (from !== null && !isRealDate(from)) return { error: "`from` must be a date like 2026-10-18" };
  if (to !== null && !isRealDate(to)) return { error: "`to` must be a date like 2026-10-18" };
  const end = to ?? latest ?? todayIso();
  const start = from ?? lastNDates(DEFAULT_DAYS, end).at(-1)!;
  if (start > end) return { error: "`from` must not be after `to`" };
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) return { error: `range is limited to ${MAX_RANGE_DAYS} days` };
  return { from: start, to: end };
}

export interface JournalBehaviorRow {
  behavior_tracker_id: number;
  title: string;
  category: string;
  internal_name: string;
  answered_yes: boolean | null;
  magnitude_value: number | null;
  magnitude_label: string | null;
  recorded_at: string | null;
}

export interface JournalDayRow {
  date: string;
  cycle_id: number | null;
  journal_entry_id: string | null;
  notes: string | null;
  synced_at: string;
  behaviors: JournalBehaviorRow[];
}

/** Newest synced journal date (YYYY-MM-DD), or null when the table is empty. */
export async function latestSyncedDate(sql: Sql): Promise<string | null> {
  const rows = (await sql`SELECT max(date)::text AS latest FROM whoop_journal_entries`) as Array<{ latest: string | null }>;
  return rows[0]?.latest ?? null;
}

export async function fetchJournalDays(sql: Sql, range: DateRange): Promise<JournalDayRow[]> {
  const rows = (await sql`
    SELECT
      e.date::text AS date,
      e.cycle_id::float8 AS cycle_id,
      e.journal_entry_id,
      e.notes,
      e.synced_at,
      COALESCE(
        json_agg(
          json_build_object(
            'behavior_tracker_id', b.behavior_tracker_id,
            'title', b.title,
            'category', b.category,
            'internal_name', b.internal_name,
            'answered_yes', b.answered_yes,
            'magnitude_value', b.magnitude_value,
            'magnitude_label', b.magnitude_label,
            'recorded_at', b.recorded_at
          ) ORDER BY b.behavior_tracker_id
        ) FILTER (WHERE b.id IS NOT NULL),
        '[]'::json
      ) AS behaviors
    FROM whoop_journal_entries e
    LEFT JOIN whoop_journal_behaviours b ON b.date = e.date
    WHERE e.date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY e.id
    ORDER BY e.date DESC
  `) as Array<Omit<JournalDayRow, "synced_at"> & { synced_at: Date | string }>;
  return rows.map((r) => ({ ...r, synced_at: new Date(r.synced_at).toISOString() }));
}
