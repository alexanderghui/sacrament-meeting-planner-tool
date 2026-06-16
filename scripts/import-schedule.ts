import { readFileSync } from "fs";
import { getDb } from "../src/lib/db";
import { meetings, assignments, members } from "../src/lib/db/schema";
import { buildResolver } from "./match";

type Speaker = { name: string; position: number; topic: string | null };
type Meeting = {
  date: string;
  type: string;
  conducting: string | null;
  note: string | null;
  speakers: Speaker[];
};

async function main() {
  const db = await getDb();
  const data: Meeting[] = JSON.parse(
    readFileSync("private/schedule.json", "utf8")
  );

  // Shared matcher: exact / typo / nickname, unique within surname. See match.ts.
  const all = await db
    .select({ id: members.id, fullName: members.fullName, preferredName: members.preferredName })
    .from(members);
  const resolve = buildResolver(all);

  console.log("Clearing existing meetings/assignments...");
  await db.delete(assignments);
  await db.delete(meetings);

  let nMeetings = 0,
    nAssign = 0,
    nMatched = 0,
    nGuest = 0;

  for (const m of data) {
    const [meeting] = await db
      .insert(meetings)
      .values({
        date: m.date,
        type: m.type as never,
        conducting: m.conducting,
        notes: m.note,
      })
      .returning({ id: meetings.id });
    nMeetings++;

    for (const s of m.speakers) {
      const memberId = resolve(s.name);
      if (memberId) nMatched++;
      else nGuest++;
      await db.insert(assignments).values({
        meetingId: meeting.id,
        memberId,
        guestName: memberId ? null : s.name,
        role: "speaker",
        position: s.position,
        topic: s.topic,
        status: "spoke",
      });
      nAssign++;
    }
  }

  console.log(`\nImported ${nMeetings} meetings, ${nAssign} speaker assignments`);
  console.log(`  linked to current members: ${nMatched}`);
  console.log(`  kept as named guests:      ${nGuest}`);

  // How many current members now have a speaking record?
  const withTalks = new Set(
    (
      await db
        .select({ id: assignments.memberId })
        .from(assignments)
    )
      .map((r) => r.id)
      .filter(Boolean)
  );
  console.log(`  current members with >=1 talk: ${withTalks.size} / ${all.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
