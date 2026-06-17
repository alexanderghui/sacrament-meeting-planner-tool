/**
 * Apply the verified findings from the multi-agent recency audit. Dry-run by
 * default; APPLY=1 to write. Run on both local and Neon.
 *
 * Op kinds: relink (guest→member), relinkMember (member→member), removeGuest,
 * removeMember, renameGuest, addSpeaker, setType. The op list (which contains
 * real member names) lives in gitignored private/audit-fixes.json — this repo
 * is public.
 */
import { readFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings, assignments, members } from "../src/lib/db/schema";
import { buildResolver } from "./match";

type Op =
  | { kind: "relink"; date: string; guest: string; member: string }
  | { kind: "relinkMember"; date: string; from: string; to: string }
  | { kind: "removeGuest"; date: string; guest: string }
  | { kind: "removeMember"; date: string; member: string }
  | { kind: "renameGuest"; date: string; from: string; to: string }
  | { kind: "addSpeaker"; date: string; name: string }
  | { kind: "setType"; date: string; type: string };

const OPS: Op[] = JSON.parse(readFileSync("private/audit-fixes.json", "utf8"));

async function main() {
  const apply = process.env.APPLY === "1";
  const db = await getDb();
  const memberRows = await db
    .select({ id: members.id, fullName: members.fullName, preferredName: members.preferredName })
    .from(members);
  const idByFull = new Map(memberRows.map((m) => [m.fullName, m.id]));
  const fullById = new Map(memberRows.map((m) => [m.id, m.fullName]));
  const resolve = buildResolver(memberRows);
  const log: string[] = [];
  const problems: string[] = [];

  const mtg = async (date: string) => {
    const [m] = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.date, date));
    return m?.id ?? null;
  };
  const speakers = (mid: string) =>
    db.select().from(assignments).where(and(eq(assignments.meetingId, mid), eq(assignments.role, "speaker")));

  for (const op of OPS) {
    const mid = await mtg(op.date);
    if (!mid) { problems.push(`${op.date}: NO MEETING`); continue; }

    if (op.kind === "relink") {
      const memId = idByFull.get(op.member);
      if (!memId) { problems.push(`${op.date}: member not found "${op.member}"`); continue; }
      const hit = (await speakers(mid)).find((r) => r.guestName === op.guest);
      if (!hit) { problems.push(`${op.date}: guest not found "${op.guest}"`); continue; }
      log.push(`${op.date}  relink guest:${op.guest} → ${op.member}`);
      if (apply) await db.update(assignments).set({ memberId: memId, guestName: null, updatedAt: new Date() }).where(eq(assignments.id, hit.id));
    } else if (op.kind === "relinkMember") {
      const fromId = idByFull.get(op.from), toId = idByFull.get(op.to);
      if (!fromId || !toId) { problems.push(`${op.date}: member not found ${op.from}/${op.to}`); continue; }
      const hit = (await speakers(mid)).find((r) => r.memberId === fromId);
      if (!hit) { problems.push(`${op.date}: from-member not on meeting "${op.from}"`); continue; }
      log.push(`${op.date}  relink ${op.from} → ${op.to}`);
      if (apply) await db.update(assignments).set({ memberId: toId, updatedAt: new Date() }).where(eq(assignments.id, hit.id));
    } else if (op.kind === "removeGuest") {
      const hit = (await speakers(mid)).find((r) => r.guestName === op.guest);
      if (!hit) { problems.push(`${op.date}: guest not found to remove "${op.guest}"`); continue; }
      log.push(`${op.date}  remove guest:${op.guest}`);
      if (apply) await db.delete(assignments).where(eq(assignments.id, hit.id));
    } else if (op.kind === "removeMember") {
      const memId = idByFull.get(op.member);
      if (!memId) { problems.push(`${op.date}: member not found "${op.member}"`); continue; }
      const hit = (await speakers(mid)).find((r) => r.memberId === memId);
      if (!hit) { problems.push(`${op.date}: member not on meeting "${op.member}"`); continue; }
      log.push(`${op.date}  remove member ${op.member}`);
      if (apply) await db.delete(assignments).where(eq(assignments.id, hit.id));
    } else if (op.kind === "renameGuest") {
      const hit = (await speakers(mid)).find((r) => r.guestName === op.from);
      if (!hit) { problems.push(`${op.date}: guest not found to rename "${op.from}"`); continue; }
      log.push(`${op.date}  rename guest:"${op.from}" → "${op.to}"`);
      if (apply) await db.update(assignments).set({ guestName: op.to, updatedAt: new Date() }).where(eq(assignments.id, hit.id));
    } else if (op.kind === "addSpeaker") {
      const rows = await speakers(mid);
      const memId = resolve(op.name);
      const pos = rows.reduce((mx, r) => Math.max(mx, r.position), 0) + 1;
      log.push(`${op.date}  add speaker ${memId ? fullById.get(memId) : `guest:${op.name}`} (pos ${pos})`);
      if (apply) await db.insert(assignments).values({ meetingId: mid, role: "speaker", position: pos, memberId: memId, guestName: memId ? null : op.name, status: "spoke" }).onConflictDoNothing();
    } else if (op.kind === "setType") {
      log.push(`${op.date}  setType ${op.type}`);
      if (apply) await db.update(meetings).set({ type: op.type as never, updatedAt: new Date() }).where(eq(meetings.id, mid));
    }
  }

  console.log(`${apply ? "APPLIED" : "DRY-RUN"} — ${log.length} ops ok, ${problems.length} problems`);
  console.log(log.join("\n"));
  if (problems.length) { console.log("\nPROBLEMS:"); console.log(problems.join("\n")); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
