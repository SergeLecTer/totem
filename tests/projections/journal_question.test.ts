import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { projectJournal } from "../../src/projections/journal.js";
import { JournalOut } from "../../src/schemas/journal.js";

const entry = (tracker: Record<string, unknown>) => ({
  journal: {
    cycle_id: 1,
    journal_entry_id: "e",
    notes: null,
    tracked_behaviors: [
      {
        behavior_tracker: { status: "active", question_type: "YES_NO", ...tracker },
        tracker_input: { behavior_tracker_id: tracker.id, answered_yes: true },
      },
    ],
  },
});

const first = (raw: unknown) => projectJournal(raw, "2026-10-18").behaviors[0]!;

describe("journal question / question_source", () => {
  it("uses the question Whoop sends, even when it differs from the catalog", () => {
    const b = first(entry({ id: 1, title: "Alcohol", internal_name: "alcohol", question_text: "Drank anything last night?" }));
    expect(b.question).toBe("Drank anything last night?");
    expect(b.question_source).toBe("whoop");
  });

  it("falls back to the bundled catalog when Whoop sends no question", () => {
    const b = first(entry({ id: 1, title: "Alcohol", internal_name: "alcohol" }));
    expect(b.question).toBe("Have any alcoholic drinks?");
    expect(b.question_source).toBe("catalog");
  });

  it("is null/null for a behavior neither Whoop nor the catalog knows", () => {
    const b = first(entry({ id: 99999, title: "My own habit", internal_name: "my-own-habit" }));
    expect(b.title).toBe("My own habit");
    expect(b.question).toBeNull();
    expect(b.question_source).toBeNull();
  });

  it("treats an empty question_text as missing", () => {
    const b = first(entry({ id: 2, title: "Caffeine", internal_name: "caffeine", question_text: "" }));
    expect(b.question_source).toBe("catalog");
  });

  it("works on a captured Whoop response and passes the output schema", () => {
    const raw = JSON.parse(readFileSync(new URL("../fixtures/journal_v3_populated.json", import.meta.url), "utf8"));
    const out = projectJournal(raw, "2026-05-23");
    expect(() => JournalOut.parse(out)).not.toThrow();
    const bySource = out.behaviors.map((b) => [b.behavior_tracker_id, b.question_source]);
    expect(bySource).toEqual([[80, "whoop"], [271, "catalog"], [274, "catalog"]]);
  });
});
