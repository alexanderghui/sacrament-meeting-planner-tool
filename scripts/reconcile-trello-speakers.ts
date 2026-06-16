/**
 * Reconcile speakers from Trello onto meetings that already exist (from the
 * sheet import). The original importer only added speakers to meetings it
 * *created*, so a speaker the sheet missed but Trello recorded was dropped.
 * This adds any Trello speaker not already present on the meeting.
 *
 * Dry-run by default (no writes). Pass APPLY=1 to write.
 *   preview:  DATABASE_URL=… npx tsx scripts/reconcile-trello-speakers.ts
 *   apply:    APPLY=1 DATABASE_URL=… npx tsx scripts/reconcile-trello-speakers.ts
 */
import { readFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings, assignments, members } from "../src/lib/db/schema";
import { buildResolver, norm } from "./match";

type Card = { date: string; speakers?: string[] };

// Strip Trello formatting junk: "#1:"/"s:" markers, leading honorifics
// (incl. "High Counselor- Name"), and trailing descriptors after a dash/paren/comma.
function clean(raw: string): string {
  let x = raw.replace(/[“”"]/g, " ").trim();
  x = x.replace(/^\s*(#\d+|s)\s*:\s*/i, "");
  x = x.replace(
    /^\s*(president|bishop|brother|bro|sister|sis|elder|high\s*coun\w*)[\s.-]+/i,
    ""
  );
  x = x.split(/\s*[-—/(]\s*|,/)[0];
  return x.trim();
}

async function main() {
  const apply = process.env.APPLY === "1";
  const db = await getDb();
  const cards: Card[] = JSON.parse(readFileSync("private/trello.json", "utf8"));
  const memberRows = await db
    .select({ id: members.id, fullName: members.fullName, preferredName: members.preferredName })
    .from(members);
  const resolve = buildResolver(memberRows);
  const nameById = new Map(memberRows.map((m) => [m.id, m.fullName]));

  const planned: string[] = [];
  let added = 0;

  for (const c of cards) {
    if (!c.date || !(c.speakers || []).length) continue;
    const [mtg] = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(eq(meetings.date, c.date));
    if (!mtg) continue;

    const existing = await db
      .select({ position: assignments.position, memberId: assignments.memberId, guest: assignments.guestName })
      .from(assignments)
      .where(and(eq(assignments.meetingId, mtg.id), eq(assignments.role, "speaker")));

    const haveMembers = new Set(existing.map((e) => e.memberId).filter(Boolean) as string[]);
    const haveGuests = new Set(existing.map((e) => norm(e.guest || "")).filter(Boolean));
    let nextPos = existing.reduce((mx, e) => Math.max(mx, e.position), 0);

    for (const raw of c.speakers || []) {
      const name = clean(raw);
      if (!name || name.split(/\s+/).length < 2) continue; // need first+last
      const memberId = resolve(name);
      // already present?
      if (memberId && haveMembers.has(memberId)) continue;
      if (!memberId && haveGuests.has(norm(name))) continue;
      // also skip if the cleaned name matches an existing matched member by name
      if (!memberId) {
        const n = norm(name);
        if ([...haveMembers].some((id) => norm(nameById.get(id) || "").includes(n))) continue;
      }

      nextPos++;
      const target = memberId ? nameById.get(memberId)! : `guest: ${name}`;
      planned.push(`  ${c.date}  + ${target}   (from "${raw.slice(0, 45)}")`);
      added++;
      if (apply) {
        await db.insert(assignments).values({
          meetingId: mtg.id,
          role: "speaker",
          position: nextPos,
          memberId,
          guestName: memberId ? null : name,
          status: "spoke",
        }).onConflictDoNothing();
      }
      haveMembers.add(memberId || "x"); haveGuests.add(norm(name));
    }
  }

  console.log(`${apply ? "APPLIED" : "DRY-RUN"} — ${added} speaker(s) to add:`);
  console.log(planned.sort().join("\n"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
