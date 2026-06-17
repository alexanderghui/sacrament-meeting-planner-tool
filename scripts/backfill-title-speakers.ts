/**
 * Backfill speakers that lived only in Trello card TITLES (not the body) during
 * the Nov 2022–May 2023 window when the Google Sheet had a gap. The original
 * Trello extractor parsed speakers from "Speaker:" lines in the description, so
 * these title-only speakers were dropped. Curated by hand from the card titles
 * (visitors resolve to guests). Only adds to meetings that currently have 0
 * speakers. Dry-run by default; APPLY=1 to write.
 */
import { readFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings, assignments, members } from "../src/lib/db/schema";
import { buildResolver } from "./match";

// date → speakers in program order, curated from Trello card titles. Kept in
// gitignored private/ (real member names) — see private/title-speakers.json.
const DATA: Record<string, string[]> = JSON.parse(
  readFileSync("private/title-speakers.json", "utf8")
);

async function main() {
  const apply = process.env.APPLY === "1";
  const db = await getDb();
  const memberRows = await db.select({ id: members.id, fullName: members.fullName, preferredName: members.preferredName }).from(members);
  const resolve = buildResolver(memberRows);
  const nameById = new Map(memberRows.map((m) => [m.id, m.fullName]));

  const plan: string[] = [];
  let added = 0;
  for (const [date, speakers] of Object.entries(DATA)) {
    const [m] = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.date, date));
    if (!m) { plan.push(`  ${date}  (no meeting in DB — skipped)`); continue; }
    const existing = await db.select({ id: assignments.id }).from(assignments)
      .where(and(eq(assignments.meetingId, m.id), eq(assignments.role, "speaker")));
    if (existing.length) { plan.push(`  ${date}  (already has ${existing.length} speakers — skipped)`); continue; }
    let pos = 0;
    const labels: string[] = [];
    for (const name of speakers) {
      pos++;
      const memberId = resolve(name);
      labels.push(memberId ? `${nameById.get(memberId)}` : `guest:${name}`);
      added++;
      if (apply) {
        await db.insert(assignments).values({
          meetingId: m.id, role: "speaker", position: pos,
          memberId, guestName: memberId ? null : name, status: "spoke",
        }).onConflictDoNothing();
      }
    }
    plan.push(`  ${date}  ${labels.join(", ")}`);
  }
  console.log(`${apply ? "APPLIED" : "DRY-RUN"} — ${added} speakers across ${Object.keys(DATA).length} meetings:`);
  console.log(plan.join("\n"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
