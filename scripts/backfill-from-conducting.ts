/**
 * Backfill meetings from the user's own conducting-template docs
 * (private/conducting.json, extracted from Google Drive). These are the most
 * authoritative record of what actually happened each Sunday he conducted.
 *
 * Rules:
 *   - organist → meetings.accompanist  (OVERWRITE — authoritative)
 *   - chorister → meetings.chorister   (OVERWRITE)
 *   - presiding / conducting / 4 hymns → FILL only where the app is empty
 *   - opening/closing prayer → add only if that role has no assignment yet
 *   - speakers → add only if the meeting currently has zero speakers
 * Names for prayers/speakers run through the shared matcher (member or guest).
 *
 * Dry-run by default; APPLY=1 to write. Run on both local and Neon.
 */
import { readFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings, assignments, members } from "../src/lib/db/schema";
import { buildResolver } from "./match";

type Rec = {
  date: string; presiding: string | null; conducting: string | null;
  organist: string | null; chorister: string | null;
  openingHymn: number | null; sacramentHymn: number | null;
  intermediateHymn: number | null; closingHymn: number | null;
  openingPrayer: string | null; closingPrayer: string | null;
  speakers: string[];
};

const apply = process.env.APPLY === "1";
const clean = (s: string | null) => (s ? s.replace(/^(Brother|Bro\.?)\s+/i, "").trim() : s);
function normOrganist(v: string): string {
  const n = v.toLowerCase();
  if (n === "craig" || n === "craig pew") return "Craig Pew";
  if (n === "nancy" || n === "nancy mcpherson") return "Nancy McPherson";
  return v;
}

async function main() {
  const db = await getDb();
  const recs: Rec[] = JSON.parse(readFileSync("private/conducting.json", "utf8"));
  const memberRows = await db.select({ id: members.id, fullName: members.fullName, preferredName: members.preferredName }).from(members);
  const resolve = buildResolver(memberRows);

  const c = { acc: 0, cho: 0, pres: 0, cond: 0, hymn: 0, pray: 0, spk: 0, created: 0, noMeeting: 0 };
  const HYMN_KEYS = ["openingHymn", "sacramentHymn", "intermediateHymn", "closingHymn"] as const;

  for (const r of recs) {
    let [m] = await db.select().from(meetings).where(eq(meetings.date, r.date));
    if (!m) {
      c.noMeeting++;
      if (!apply) continue;
      [m] = await db.insert(meetings).values({ date: r.date, type: "sacrament" as never }).returning();
      c.created++;
    }

    const set: Record<string, unknown> = {};
    if (r.organist) { set.accompanist = normOrganist(r.organist); c.acc++; }
    if (r.chorister) { set.chorister = r.chorister; c.cho++; }
    if (!m.presiding && r.presiding) { set.presiding = clean(r.presiding); c.pres++; }
    if (!m.conducting && r.conducting) { set.conducting = clean(r.conducting); c.cond++; }
    for (const k of HYMN_KEYS) {
      if (!m[k] && r[k]) { set[k] = r[k]; c.hymn++; }
    }
    if (Object.keys(set).length && apply) {
      await db.update(meetings).set({ ...set, updatedAt: new Date() }).where(eq(meetings.id, m.id));
    }

    // prayers — only if that role has no assignment yet
    for (const [role, name] of [["opening_prayer", r.openingPrayer], ["closing_prayer", r.closingPrayer]] as const) {
      if (!name) continue;
      const exists = await db.select({ id: assignments.id }).from(assignments)
        .where(and(eq(assignments.meetingId, m.id), eq(assignments.role, role)));
      if (exists.length) continue;
      const memberId = resolve(name);
      c.pray++;
      if (apply) await db.insert(assignments).values({ meetingId: m.id, role, position: 1, memberId, guestName: memberId ? null : name, status: "spoke" }).onConflictDoNothing();
    }

    // speakers — only if the meeting currently has none
    if (r.speakers.length) {
      const existing = await db.select({ id: assignments.id }).from(assignments)
        .where(and(eq(assignments.meetingId, m.id), eq(assignments.role, "speaker")));
      if (existing.length === 0) {
        let pos = 0;
        for (const name of r.speakers) {
          pos++;
          const memberId = resolve(name);
          c.spk++;
          if (apply) await db.insert(assignments).values({ meetingId: m.id, role: "speaker", position: pos, memberId, guestName: memberId ? null : name, status: "spoke" }).onConflictDoNothing();
        }
      }
    }
  }

  console.log(`${apply ? "APPLIED" : "DRY-RUN"} over ${recs.length} conducting docs:`);
  console.log(`  accompanist set:   ${c.acc}`);
  console.log(`  chorister set:     ${c.cho}`);
  console.log(`  presiding filled:  ${c.pres}`);
  console.log(`  conducting filled: ${c.cond}`);
  console.log(`  hymns filled:      ${c.hymn}`);
  console.log(`  prayers added:     ${c.pray}`);
  console.log(`  speakers added:    ${c.spk}`);
  console.log(`  meetings missing in DB: ${c.noMeeting}${apply ? ` (created ${c.created})` : ""}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
