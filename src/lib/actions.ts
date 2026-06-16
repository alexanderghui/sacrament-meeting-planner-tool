"use server";

import { and, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { signIn, signOut, ensureUser } from "./auth";
import { meetings, assignments, auditLog, members } from "./db/schema";
import {
  firstSundayOnOrAfter,
  isoDate,
  todayIso,
  type AssignmentStatusValue,
  type MeetingTypeValue,
} from "./meetings";
import type { DB } from "./db";

type AuditEntry = {
  action: "created" | "updated" | "deleted";
  entityType: "meeting" | "assignment";
  entityId: string;
  summary: string;
};

async function recordAudit(db: DB, e: AuditEntry) {
  const user = await ensureUser();
  await db.insert(auditLog).values({
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    summary: e.summary,
  });
}

/* ---------------------------- members ---------------------------- */

export async function setMemberGender(
  memberId: string,
  gender: "M" | "F" | null
) {
  const db = await getDb();
  await db
    .update(members)
    .set({ gender, updatedAt: new Date() })
    .where(eq(members.id, memberId));
  revalidatePath("/members");
}

export async function setMemberPreferredName(
  memberId: string,
  preferredName: string | null
) {
  const clean = preferredName?.trim() || null;
  const db = await getDb();
  await db
    .update(members)
    .set({ preferredName: clean, updatedAt: new Date() })
    .where(eq(members.id, memberId));
  revalidatePath("/members");
}

/* ----------------------------- auth ------------------------------ */

export async function signInGoogle() {
  await signIn("google", { redirectTo: "/members" });
}

export async function signInDev() {
  await signIn("dev", { redirectTo: "/members" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

function revalidatePlanner() {
  revalidatePath("/upcoming");
  revalidatePath("/members");
  revalidatePath("/history");
}

const MEETING_TEXT_FIELDS = ["conducting", "presiding", "chorister", "theme", "notes"] as const;
const MEETING_HYMN_FIELDS = [
  "openingHymn",
  "sacramentHymn",
  "intermediateHymn",
  "closingHymn",
] as const;

/* --------------------------- meetings ---------------------------- */

export async function addUpcomingSunday() {
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await db
    .select({ date: meetings.date })
    .from(meetings)
    .where(gte(meetings.date, todayIso()));
  const taken = new Set(existing.map((e) => e.date));

  const d = firstSundayOnOrAfter(today);
  while (taken.has(isoDate(d))) d.setDate(d.getDate() + 7);
  const date = isoDate(d);

  // First Sunday of the month is fast & testimony meeting (no speakers).
  const type: MeetingTypeValue =
    d.getDate() <= 7 ? "fast_and_testimony" : "sacrament";

  const [row] = await db
    .insert(meetings)
    .values({ date, type })
    .returning({ id: meetings.id });

  await recordAudit(db, {
    action: "created",
    entityType: "meeting",
    entityId: row.id,
    summary: `Added Sunday ${date}`,
  });
  revalidatePlanner();
}

export async function removeMeeting(meetingId: string) {
  const db = await getDb();
  const [row] = await db
    .delete(meetings)
    .where(eq(meetings.id, meetingId))
    .returning({ date: meetings.date });
  if (row) {
    await recordAudit(db, {
      action: "deleted",
      entityType: "meeting",
      entityId: meetingId,
      summary: `Removed Sunday ${row.date}`,
    });
  }
  revalidatePlanner();
}

export async function updateMeetingType(
  meetingId: string,
  type: MeetingTypeValue
) {
  const db = await getDb();
  await db
    .update(meetings)
    .set({ type, updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));
  await recordAudit(db, {
    action: "updated",
    entityType: "meeting",
    entityId: meetingId,
    summary: `Set meeting type to ${type}`,
  });
  revalidatePlanner();
}

export async function updateMeetingText(
  meetingId: string,
  field: (typeof MEETING_TEXT_FIELDS)[number],
  value: string
) {
  if (!MEETING_TEXT_FIELDS.includes(field)) return;
  const db = await getDb();
  await db
    .update(meetings)
    .set({ [field]: value || null, updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));
  revalidatePlanner();
}

export async function updateMeetingHymn(
  meetingId: string,
  field: (typeof MEETING_HYMN_FIELDS)[number],
  value: number | null
) {
  if (!MEETING_HYMN_FIELDS.includes(field)) return;
  const db = await getDb();
  await db
    .update(meetings)
    .set({ [field]: value, updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));
  revalidatePlanner();
}

/* -------------------------- assignments -------------------------- */

export type SpeakerInput =
  | { memberId: string; guestName?: undefined }
  | { guestName: string; memberId?: undefined }
  | null;

export async function setSpeaker(
  meetingId: string,
  position: number,
  sel: SpeakerInput
): Promise<{ id: string; status: AssignmentStatusValue } | null> {
  const db = await getDb();
  const memberId = sel?.memberId ?? null;
  const guestName = !memberId ? sel?.guestName?.trim() || null : null;

  if (!memberId && !guestName) {
    await db
      .delete(assignments)
      .where(
        and(
          eq(assignments.meetingId, meetingId),
          eq(assignments.role, "speaker"),
          eq(assignments.position, position)
        )
      );
    revalidatePlanner();
    return null;
  }
  const [row] = await db
    .insert(assignments)
    .values({ meetingId, role: "speaker", position, memberId, guestName })
    .onConflictDoUpdate({
      target: [assignments.meetingId, assignments.role, assignments.position],
      set: { memberId, guestName, updatedAt: new Date() },
    })
    .returning({ id: assignments.id, status: assignments.status });
  revalidatePlanner();
  return { id: row.id, status: row.status as AssignmentStatusValue };
}

export async function setSpeakerTopic(assignmentId: string, topic: string) {
  const db = await getDb();
  await db
    .update(assignments)
    .set({ topic: topic || null, updatedAt: new Date() })
    .where(eq(assignments.id, assignmentId));
  revalidatePlanner();
}

export async function setSpeakerStatus(
  assignmentId: string,
  status: AssignmentStatusValue
) {
  const db = await getDb();
  await db
    .update(assignments)
    .set({ status, updatedAt: new Date() })
    .where(eq(assignments.id, assignmentId));
  await recordAudit(db, {
    action: "updated",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Marked speaker ${status}`,
  });
  revalidatePlanner();
}

export async function setPrayer(
  meetingId: string,
  role: "opening_prayer" | "closing_prayer",
  sel: SpeakerInput
) {
  const db = await getDb();
  const memberId = sel?.memberId ?? null;
  const guestName = !memberId ? sel?.guestName?.trim() || null : null;

  if (!memberId && !guestName) {
    await db
      .delete(assignments)
      .where(
        and(
          eq(assignments.meetingId, meetingId),
          eq(assignments.role, role),
          eq(assignments.position, 1)
        )
      );
  } else {
    await db
      .insert(assignments)
      .values({ meetingId, role, position: 1, memberId, guestName, status: "confirmed" })
      .onConflictDoUpdate({
        target: [
          assignments.meetingId,
          assignments.role,
          assignments.position,
        ],
        set: { memberId, guestName, updatedAt: new Date() },
      });
  }
  revalidatePlanner();
}
