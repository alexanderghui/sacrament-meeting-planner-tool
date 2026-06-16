import { readFileSync } from "fs";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings, assignments, members, hymns } from "../src/lib/db/schema";
import { buildResolver } from "./match";

type Hymn = { number: number; title: string | null };
type Card = {
  date: string;
  type: string;
  cardName: string;
  conducting?: string;
  presiding?: string;
  openingHymn?: Hymn;
  sacramentHymn?: Hymn;
  intermediateHymn?: Hymn;
  closingHymn?: Hymn;
  openingPrayer?: string | null;
  closingPrayer?: string | null;
  speakers: string[];
  notes: string[];
};

async function main() {
  const db = await getDb();
  const cards: Card[] = JSON.parse(readFileSync("private/trello.json", "utf8"));

  // Shared matcher: exact / typo / nickname, unique within surname. See match.ts.
  const all = await db.select({ id: members.id, fullName: members.fullName, preferredName: members.preferredName }).from(members);
  const resolve = buildResolver(all);

  // 1) populate hymn reference titles
  const hymnMap = new Map<number, string>();
  for (const c of cards)
    for (const h of [c.openingHymn, c.sacramentHymn, c.intermediateHymn, c.closingHymn])
      if (h?.number && h.title) hymnMap.set(h.number, h.title);
  await db.delete(hymns);
  if (hymnMap.size)
    await db.insert(hymns).values([...hymnMap].map(([number, title]) => ({ number, title })));

  let enriched = 0, created = 0, prayers = 0;

  async function setPrayer(meetingId: string, role: "opening_prayer" | "closing_prayer", name: string | null) {
    if (!name) return;
    const memberId = resolve(name);
    await db.insert(assignments).values({
      meetingId, role, position: 1, memberId,
      guestName: memberId ? null : name, status: "confirmed",
    }).onConflictDoUpdate({
      target: [assignments.meetingId, assignments.role, assignments.position],
      set: { memberId, guestName: memberId ? null : name },
    });
    prayers++;
  }

  for (const c of cards) {
    const hymnVals = {
      openingHymn: c.openingHymn?.number ?? null,
      sacramentHymn: c.sacramentHymn?.number ?? null,
      intermediateHymn: c.intermediateHymn?.number ?? null,
      closingHymn: c.closingHymn?.number ?? null,
    };

    const [existing] = await db.select({ id: meetings.id, notes: meetings.notes })
      .from(meetings).where(eq(meetings.date, c.date));

    let meetingId: string;
    if (existing) {
      // Merge notes idempotently (per item) so re-running to pick up newly
      // archived cards never duplicates note text.
      const parts = existing.notes ? existing.notes.split("; ") : [];
      for (const n of c.notes) if (n && !parts.includes(n)) parts.push(n);
      const merged = parts.join("; ") || null;
      await db.update(meetings).set({
        conducting: c.conducting ?? undefined,
        presiding: c.presiding ?? undefined,
        notes: merged,
        ...Object.fromEntries(Object.entries(hymnVals).filter(([, v]) => v != null)),
        updatedAt: new Date(),
      }).where(eq(meetings.id, existing.id));
      meetingId = existing.id;
      enriched++;
    } else {
      const [row] = await db.insert(meetings).values({
        date: c.date, type: c.type as never,
        conducting: c.conducting ?? null, presiding: c.presiding ?? null,
        notes: c.notes.length ? c.notes.join("; ") : null, ...hymnVals,
      }).returning({ id: meetings.id });
      meetingId = row.id;
      created++;
      // new meeting → add its speakers from the card
      let pos = 0;
      for (const s of c.speakers) {
        pos++;
        const memberId = resolve(s);
        await db.insert(assignments).values({
          meetingId, role: "speaker", position: pos,
          memberId, guestName: memberId ? null : s, status: "spoke",
        }).onConflictDoNothing();
      }
    }

    await setPrayer(meetingId, "opening_prayer", c.openingPrayer ?? null);
    await setPrayer(meetingId, "closing_prayer", c.closingPrayer ?? null);
  }

  console.log(`Trello layer applied:`);
  console.log(`  meetings enriched (existing):  ${enriched}`);
  console.log(`  meetings created (Trello-only): ${created}`);
  console.log(`  prayer assignments:            ${prayers}`);
  console.log(`  hymn titles populated:         ${hymnMap.size}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
