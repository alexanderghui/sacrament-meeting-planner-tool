import { getDb } from "../src/lib/db";
import { members, meetings, assignments, hymns } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

type SeedMember = {
  fullName: string;
  household: string;
  phone?: string;
  email?: string;
  birthdate?: string;
  lastSpoke?: string; // ISO date of most recent talk
  topic?: string;
};

// Sample ward. Spoke dates are chosen relative to 2026-06-15 to show every
// color bucket: red (<3mo), neutral (3-6mo), amber (6-12mo), green (>12mo/never).
const SEED: SeedMember[] = [
  { fullName: "Smith, John", household: "Smith", phone: "801-555-0118", email: "john.smith@example.com", birthdate: "1984-03-11", lastSpoke: "2026-05-31", topic: "Faith in Jesus Christ" },
  { fullName: "Smith, Mary", household: "Smith", birthdate: "1986-07-22", email: "mary.smith@example.com" },
  { fullName: "Johnson, David", household: "Johnson", phone: "801-555-0143", birthdate: "1979-01-05", lastSpoke: "2025-11-09", topic: "Temple worship" },
  { fullName: "Johnson, Sarah", household: "Johnson", birthdate: "1981-09-30" },
  { fullName: "Williams, Michael", household: "Williams", birthdate: "1972-12-02", lastSpoke: "2026-01-12", topic: "Service" },
  { fullName: "Williams, Emily", household: "Williams", birthdate: "1975-04-18", lastSpoke: "2025-06-29", topic: "The Atonement" },
  { fullName: "Brown, Robert", household: "Brown", phone: "801-555-0190", birthdate: "1990-08-14" },
  { fullName: "Brown, Jennifer", household: "Brown", birthdate: "1991-02-27", lastSpoke: "2024-09-15", topic: "Gratitude" },
  { fullName: "Davis, James", household: "Davis", birthdate: "1968-06-09", lastSpoke: "2026-06-07", topic: "Missionary work" },
  { fullName: "Davis, Patricia", household: "Davis", birthdate: "1970-10-21", lastSpoke: "2025-09-28", topic: "Charity" },
  { fullName: "Miller, Ethan", household: "Miller", birthdate: "2009-05-03", lastSpoke: "2026-03-01", topic: "Scripture study" },
  { fullName: "Miller, Olivia", household: "Miller", birthdate: "2011-11-19" },
  { fullName: "Garcia, William", household: "Garcia", phone: "801-555-0177", birthdate: "1995-03-25" },
  { fullName: "Garcia, Linda", household: "Garcia", birthdate: "1994-12-12", lastSpoke: "2025-12-21", topic: "Repentance" },
];

const HYMNS = [
  { number: 2, title: "The Spirit of God" },
  { number: 19, title: "We Thank Thee, O God, for a Prophet" },
  { number: 85, title: "How Firm a Foundation" },
  { number: 152, title: "God Be with You Till We Meet Again" },
  { number: 193, title: "I Stand All Amazed" },
  { number: 301, title: "I Am a Child of God" },
];

async function main() {
  const db = await getDb();

  console.log("Clearing existing data...");
  await db.delete(assignments);
  await db.delete(meetings);
  await db.delete(members);
  await db.delete(hymns);

  console.log("Inserting hymns...");
  await db.insert(hymns).values(HYMNS);

  console.log("Inserting members...");
  const meetingByDate = new Map<string, string>();
  const speakerCountByMeeting = new Map<string, number>();

  for (const m of SEED) {
    const [row] = await db
      .insert(members)
      .values({
        fullName: m.fullName,
        household: m.household,
        phone: m.phone,
        email: m.email,
        birthdate: m.birthdate,
      })
      .returning({ id: members.id });

    if (m.lastSpoke) {
      let meetingId = meetingByDate.get(m.lastSpoke);
      if (!meetingId) {
        const [meeting] = await db
          .insert(meetings)
          .values({ date: m.lastSpoke, type: "sacrament" })
          .returning({ id: meetings.id });
        meetingId = meeting.id;
        meetingByDate.set(m.lastSpoke, meetingId);
      }
      const position = (speakerCountByMeeting.get(meetingId) ?? 0) + 1;
      speakerCountByMeeting.set(meetingId, position);
      await db.insert(assignments).values({
        meetingId,
        memberId: row.id,
        role: "speaker",
        position,
        topic: m.topic,
        status: "spoke",
      });
    }
  }

  const count = await db.select({ n: sql<number>`count(*)` }).from(members);
  console.log(`Done. ${count[0].n} members seeded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
