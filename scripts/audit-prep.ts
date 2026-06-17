/**
 * Build a consolidated per-meeting dataset joining every speaker source against
 * the app's current data, for the multi-agent recency audit. Output (gitignored):
 *   private/audit-input.json  — one record per meeting date.
 * Run: DATABASE_URL=<neon> npx tsx scripts/audit-prep.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings, assignments, members } from "../src/lib/db/schema";

const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));

async function main() {
  const db = await getDb();

  const sched: any[] = J("private/schedule.json");
  const trello: any[] = J("private/trello.json");
  const conducting: any[] = J("private/conducting.json");

  const sheetBy = new Map<string, string[]>();
  for (const m of sched) sheetBy.set(m.date, (m.speakers || []).map((s: any) => s.name));

  const trelloTitleBy = new Map<string, string>();
  const trelloBodyBy = new Map<string, string[]>();
  for (const c of trello) {
    if (!c.date) continue;
    if (c.cardName) trelloTitleBy.set(c.date, c.cardName);
    if ((c.speakers || []).length) trelloBodyBy.set(c.date, c.speakers);
  }

  const conductingBy = new Map<string, string[]>();
  for (const c of conducting) if (c.speakers?.length) conductingBy.set(c.date, c.speakers);

  // DB: per meeting, speaker names (member fullName or guest:X) + prayers + music
  const mtgs = await db.select().from(meetings);
  const memberName = new Map<string, string>(
    (await db.select({ id: members.id, fullName: members.fullName }).from(members)).map((m) => [m.id, m.fullName])
  );
  const out: any[] = [];
  for (const m of mtgs) {
    const as = await db.select().from(assignments).where(eq(assignments.meetingId, m.id));
    const named = (a: any) => (a.memberId ? memberName.get(a.memberId) ?? "?" : `guest:${a.guestName}`);
    const dbSpeakers = as.filter((a) => a.role === "speaker").sort((a, b) => a.position - b.position).map(named);
    const dbPrayers = as.filter((a) => a.role === "opening_prayer" || a.role === "closing_prayer").map(named);
    out.push({
      date: m.date,
      type: m.type,
      sheet: sheetBy.get(m.date) ?? [],
      trelloTitle: trelloTitleBy.get(m.date) ?? null,
      trelloBody: trelloBodyBy.get(m.date) ?? [],
      conducting: conductingBy.get(m.date) ?? [],
      dbSpeakers,
      dbPrayers,
      dbChorister: m.chorister,
      dbAccompanist: m.accompanist,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  writeFileSync("private/audit-input.json", JSON.stringify(out));
  const yrs = new Map<string, number>();
  for (const r of out) yrs.set(r.date.slice(0, 4), (yrs.get(r.date.slice(0, 4)) ?? 0) + 1);
  console.log(`wrote ${out.length} meetings to private/audit-input.json`);
  console.log("by year:", [...yrs].sort().map(([y, n]) => `${y}:${n}`).join(" "));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
