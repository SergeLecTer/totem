import { describe, expect, it } from "vitest";
import { lastNDates, syncJournal, type JournalStore } from "../src/journal_sync.js";
import type { WhoopClient } from "../src/whoop/client.js";
import type { JournalOutT } from "../src/schemas/journal.js";

const entry = (id: number) => ({
  journal: {
    cycle_id: 7,
    journal_entry_id: "entry-1",
    notes: "slept badly",
    tracked_behaviors: [
      { tracker_input: { behavior_tracker_id: id, answered_yes: true, recorded_at: "2026-10-17T20:00:00.000Z" } },
    ],
  },
});

describe("lastNDates", () => {
  it("counts back across month and year boundaries, newest first", () => {
    expect(lastNDates(3, "2026-01-01")).toEqual(["2026-01-01", "2025-12-31", "2025-12-30"]);
    expect(lastNDates(2, "2026-03-01")).toEqual(["2026-03-01", "2026-02-28"]);
  });
});

describe("syncJournal", () => {
  it("fetches each day once and stores notes with the behaviors", async () => {
    const asked: string[] = [];
    const client = { get: async (path: string) => (asked.push(path), entry(1)) } as unknown as WhoopClient;
    const saved: JournalOutT[] = [];
    const store: JournalStore = { saveDay: async (d) => void saved.push(d) };

    const result = await syncJournal(client, store, 3, "2026-10-18");

    expect(asked.map((p) => p.split("/").pop())).toEqual(["2026-10-18", "2026-10-17", "2026-10-16"]);
    expect(result.saved).toHaveLength(3);
    expect(result.failed).toEqual([]);
    expect(saved[0]).toMatchObject({ date: "2026-10-18", cycle_id: 7, notes: "slept badly" });
    expect(saved[0]!.behaviors[0]).toMatchObject({ behavior_tracker_id: 1, answered_yes: true });
  });

  it("keeps going when one day fails and reports it", async () => {
    const client = {
      get: async (path: string) => {
        if (path.endsWith("2026-10-17")) throw new Error("boom");
        return entry(1);
      },
    } as unknown as WhoopClient;
    const store: JournalStore = { saveDay: async () => undefined };

    const result = await syncJournal(client, store, 3, "2026-10-18");

    expect(result.saved).toEqual(["2026-10-18", "2026-10-16"]);
    expect(result.failed).toEqual([{ date: "2026-10-17", error: "boom" }]);
  });
});
