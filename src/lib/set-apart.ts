import { getDb } from "./db";
import { meetings } from "./db/schema";

// One sustaining flattened out of a meeting's `sustained` list for the
// set-apart tracker. `meetingDate` is when they were sustained (the "called
// on" date). `setApartOn` null ⇒ still needs the ordinance.
export type SetApartItem = {
  meetingId: string;
  meetingDate: string;
  entryId: string;
  name: string;
  calling: string;
  setApartOn: string | null;
  setApartBy: string | null;
};

// Gather every sustaining across all meetings. The meetings table is small and
// we pull only three columns, so this stays cheap. Entries without a stable id
// (legacy, pre-backfill) are skipped since they can't be acted on yet.
export async function getSetAparts(): Promise<SetApartItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: meetings.id,
      date: meetings.date,
      sustained: meetings.sustained,
    })
    .from(meetings);

  const out: SetApartItem[] = [];
  for (const m of rows) {
    for (const s of m.sustained ?? []) {
      if (!s || !s.id || !s.name?.trim()) continue;
      out.push({
        meetingId: m.id,
        meetingDate: m.date,
        entryId: s.id,
        name: s.name.trim(),
        calling: (s.calling ?? "").trim(),
        setApartOn: s.setApartOn ?? null,
        setApartBy: s.setApartBy ?? null,
      });
    }
  }
  return out;
}
