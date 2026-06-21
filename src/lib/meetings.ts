import { asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "./db";
import { meetings, assignments, members, hymns } from "./db/schema";
import { displayName } from "./members";
import { primaryName } from "./names";
import type { DB } from "./db";

export type MeetingTypeValue =
  | "sacrament"
  | "fast_and_testimony"
  | "ward_conference"
  | "stake_conference"
  | "general_conference"
  | "primary_program"
  | "no_meeting";

export type AssignmentStatusValue =
  | "invited"
  | "confirmed"
  | "spoke"
  | "declined";

export type SpeakerSlot = {
  id: string;
  memberId: string | null;
  guestName: string | null;
  name: string | null;
  position: number;
  topic: string | null;
  status: AssignmentStatusValue;
};

export type PrayerSlot = {
  id: string;
  memberId: string | null;
  name: string | null;
};

// A person sustained or released in ward business: name + the calling involved.
export type RosterChange = { name: string; calling: string };

export type PlannerMeeting = {
  id: string;
  date: string;
  type: MeetingTypeValue;
  conducting: string | null;
  presiding: string | null;
  chorister: string | null;
  accompanist: string | null;
  musicalNumber: string | null;
  theme: string | null;
  openingHymn: number | null;
  sacramentHymn: number | null;
  intermediateHymn: number | null;
  closingHymn: number | null;
  stakeVisitors: string | null;
  stakeBusiness: string | null;
  wardBusinessNote: string | null;
  openingNote: string | null;
  announcements: string[];
  moveIns: string[];
  released: RosterChange[];
  sustained: RosterChange[];
  notes: string | null;
  speakers: SpeakerSlot[];
  openingPrayer: PrayerSlot | null;
  closingPrayer: PrayerSlot | null;
};

export type PickerMember = { id: string; name: string; alias?: string };

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return isoDate(t);
}

// First Sunday on or after `from`.
export function firstSundayOnOrAfter(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return d;
}

export async function getActiveMembersForPicker(): Promise<PickerMember[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: members.id,
      fullName: members.fullName,
      preferredName: members.preferredName,
    })
    .from(members)
    .where(eq(members.isActive, true));
  return rows
    .map((r) => {
      const official = displayName(r.fullName);
      const name = primaryName(r.fullName, r.preferredName);
      // Keep the official name searchable even when a preferred name is shown.
      return name === official ? { id: r.id, name } : { id: r.id, name, alias: official };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

type MeetingRow = typeof meetings.$inferSelect;

async function loadAssignmentRows(db: DB, ids: string[]) {
  return db
    .select({
      id: assignments.id,
      meetingId: assignments.meetingId,
      memberId: assignments.memberId,
      guestName: assignments.guestName,
      role: assignments.role,
      position: assignments.position,
      topic: assignments.topic,
      status: assignments.status,
      memberName: members.fullName,
    })
    .from(assignments)
    .leftJoin(members, eq(members.id, assignments.memberId))
    .where(inArray(assignments.meetingId, ids));
}

function assemble(
  ms: MeetingRow[],
  as: Awaited<ReturnType<typeof loadAssignmentRows>>
): PlannerMeeting[] {
  const byMeeting = new Map<string, typeof as>();
  for (const a of as) {
    const list = byMeeting.get(a.meetingId) ?? [];
    list.push(a);
    byMeeting.set(a.meetingId, list);
  }

  return ms.map((m): PlannerMeeting => {
    const rows = byMeeting.get(m.id) ?? [];
    const speakers = rows
      .filter((r) => r.role === "speaker")
      .sort((a, b) => a.position - b.position)
      .map(
        (r): SpeakerSlot => ({
          id: r.id,
          memberId: r.memberId,
          guestName: r.guestName,
          name: r.memberName ? displayName(r.memberName) : r.guestName,
          position: r.position,
          topic: r.topic,
          status: r.status as AssignmentStatusValue,
        })
      );

    const prayer = (role: "opening_prayer" | "closing_prayer") => {
      const r = rows.find((x) => x.role === role);
      if (!r) return null;
      return {
        id: r.id,
        memberId: r.memberId,
        name: r.memberName ? displayName(r.memberName) : r.guestName,
      };
    };

    return {
      id: m.id,
      date: m.date,
      type: m.type as MeetingTypeValue,
      conducting: m.conducting,
      presiding: m.presiding,
      chorister: m.chorister,
      accompanist: m.accompanist,
      musicalNumber: m.musicalNumber,
      theme: m.theme,
      openingHymn: m.openingHymn,
      sacramentHymn: m.sacramentHymn,
      intermediateHymn: m.intermediateHymn,
      closingHymn: m.closingHymn,
      stakeVisitors: m.stakeVisitors,
      stakeBusiness: m.stakeBusiness,
      wardBusinessNote: m.wardBusinessNote,
      openingNote: m.openingNote,
      announcements: m.announcements ?? [],
      moveIns: m.moveIns ?? [],
      released: m.released ?? [],
      sustained: m.sustained ?? [],
      notes: m.notes,
      speakers,
      openingPrayer: prayer("opening_prayer"),
      closingPrayer: prayer("closing_prayer"),
    };
  });
}

export async function getUpcomingMeetings(
  fromIso = todayIso()
): Promise<PlannerMeeting[]> {
  const db = await getDb();
  const ms = await db
    .select()
    .from(meetings)
    .where(gte(meetings.date, fromIso))
    .orderBy(asc(meetings.date));
  if (ms.length === 0) return [];
  const as = await loadAssignmentRows(db, ms.map((m) => m.id));
  return assemble(ms, as);
}

export async function getMeetingById(
  id: string
): Promise<PlannerMeeting | null> {
  const db = await getDb();
  const ms = await db.select().from(meetings).where(eq(meetings.id, id));
  if (ms.length === 0) return null;
  const as = await loadAssignmentRows(db, [id]);
  return assemble(ms, as)[0] ?? null;
}

export async function getPastMeetings(
  beforeIso = todayIso()
): Promise<PlannerMeeting[]> {
  const db = await getDb();
  const ms = await db
    .select()
    .from(meetings)
    .where(lt(meetings.date, beforeIso))
    .orderBy(desc(meetings.date));
  if (ms.length === 0) return [];
  const as = await loadAssignmentRows(db, ms.map((m) => m.id));
  return assemble(ms, as);
}

export async function getHymnTitles(): Promise<Record<number, string>> {
  const db = await getDb();
  const rows = await db
    .select({ number: hymns.number, title: hymns.title })
    .from(hymns);
  const out: Record<number, string> = {};
  for (const r of rows) if (r.number != null) out[r.number] = r.title;
  return out;
}
