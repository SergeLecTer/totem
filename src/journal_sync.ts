// Copies the last N days of Whoop journal entries into Postgres. Rows are stored
// as `whoop_journal` returns them (behaviors + notes), keyed by date, so a re-run
// overwrites a day instead of duplicating it.
import type { WhoopClient } from "./whoop/client.js";
import type { Sql } from "./db.js";
import type { JournalOutT } from "./schemas/journal.js";
import { projectJournal } from "./projections/journal.js";
import { todayIso } from "./lib/dates.js";

export interface JournalStore {
  saveDay(day: JournalOutT): Promise<void>;
}

export interface SyncResult {
  days: number;
  saved: string[];
  failed: Array<{ date: string; error: string }>;
}

/** `n` ISO dates ending at `today`, newest first. */
export function lastNDates(n: number, today: string): string[] {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
}

export async function syncJournal(
  client: WhoopClient,
  store: JournalStore,
  days: number,
  today: string = todayIso(),
): Promise<SyncResult> {
  const result: SyncResult = { days, saved: [], failed: [] };
  for (const date of lastNDates(days, today)) {
    try {
      const raw = await client.get(`/journal-service/v3/journals/drafts/mobile/${date}`);
      await store.saveDay(projectJournal(raw, date));
      result.saved.push(date);
    } catch (error) {
      result.failed.push({ date, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

export class PgJournalStore implements JournalStore {
  constructor(private sql: Sql) {}

  async saveDay(day: JournalOutT): Promise<void> {
    const sql = this.sql;
    const b = day.behaviors;
    await sql.transaction([
      // Drop behaviors that were removed from the entry since the last sync.
      sql`DELETE FROM journal_behaviors
          WHERE date = ${day.date} AND NOT (behavior_tracker_id = ANY(${b.map((x) => x.behavior_tracker_id)}::int[]))`,
      sql`INSERT INTO journal_entries (date, cycle_id, journal_entry_id, notes, synced_at)
          VALUES (${day.date}, ${day.cycle_id}, ${day.journal_entry_id}, ${day.notes}, now())
          ON CONFLICT (date) DO UPDATE SET
            cycle_id = EXCLUDED.cycle_id,
            journal_entry_id = EXCLUDED.journal_entry_id,
            notes = EXCLUDED.notes,
            synced_at = now()`,
      sql`INSERT INTO journal_behaviors
            (date, behavior_tracker_id, title, category, internal_name, answered_yes,
             magnitude_value, magnitude_label, recorded_at, synced_at)
          SELECT ${day.date}::date, t.*, now() FROM unnest(
            ${b.map((x) => x.behavior_tracker_id)}::int[],
            ${b.map((x) => x.title)}::text[],
            ${b.map((x) => x.category)}::text[],
            ${b.map((x) => x.internal_name)}::text[],
            ${b.map((x) => x.answered_yes)}::boolean[],
            ${b.map((x) => x.magnitude_value)}::float8[],
            ${b.map((x) => x.magnitude_label)}::text[],
            ${b.map((x) => x.recorded_at)}::timestamptz[]
          ) AS t(behavior_tracker_id, title, category, internal_name, answered_yes,
                 magnitude_value, magnitude_label, recorded_at)
          ON CONFLICT (date, behavior_tracker_id) DO UPDATE SET
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            internal_name = EXCLUDED.internal_name,
            answered_yes = EXCLUDED.answered_yes,
            magnitude_value = EXCLUDED.magnitude_value,
            magnitude_label = EXCLUDED.magnitude_label,
            recorded_at = EXCLUDED.recorded_at,
            synced_at = now()`,
    ]);
  }
}
