"use server";

import { and, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { signIn, signOut, ensureUser } from "./auth";
import { meetings, assignments, auditLog, members } from "./db/schema";
import { primaryName } from "./names";
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
  entityType: "meeting" | "assignment" | "member";
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
  revalidatePath("/activity");
}

/* ----------------------- audit label helpers --------------------- */

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
async function meetingLabel(db: DB, meetingId: string): Promise<string> {
  const [m] = await db.select({ date: meetings.date }).from(meetings).where(eq(meetings.id, meetingId));
  return m ? fmtDate(m.date) : "meeting";
}
async function memberLabel(db: DB, memberId: string): Promise<string> {
  const [m] = await db
    .select({ fullName: members.fullName, preferredName: members.preferredName })
    .from(members)
    .where(eq(members.id, memberId));
  return m ? primaryName(m.fullName, m.preferredName) : "member";
}
async function selLabel(db: DB, sel: SpeakerInput): Promise<string> {
  if (!sel) return "(none)";
  if (sel.memberId) return memberLabel(db, sel.memberId);
  return sel.guestName?.trim() || "guest";
}
const ROLE_LABEL: Record<string, string> = {
  opening_prayer: "opening prayer",
  closing_prayer: "closing prayer",
};
const FIELD_LABEL: Record<string, string> = {
  conducting: "conducting",
  presiding: "presiding",
  chorister: "chorister",
  accompanist: "pianist/organist",
  musicalNumber: "musical number",
  theme: "theme",
  notes: "notes",
  openingHymn: "opening hymn",
  sacramentHymn: "sacrament hymn",
  intermediateHymn: "intermediate hymn",
  closingHymn: "closing hymn",
};

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
  await recordAudit(db, {
    action: "updated",
    entityType: "member",
    entityId: memberId,
    summary: `Set gender to ${gender ?? "—"} for ${await memberLabel(db, memberId)}`,
  });
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
  const who = await memberLabel(db, memberId);
  await recordAudit(db, {
    action: "updated",
    entityType: "member",
    entityId: memberId,
    summary: clean ? `Set preferred name "${clean}" for ${who}` : `Cleared preferred name for ${who}`,
  });
  revalidatePath("/members");
}

export async function setMemberHidden(memberId: string, hidden: boolean) {
  const db = await getDb();
  await db
    .update(members)
    .set({ hidden, updatedAt: new Date() })
    .where(eq(members.id, memberId));
  const who = await memberLabel(db, memberId);
  await recordAudit(db, {
    action: "updated",
    entityType: "member",
    entityId: memberId,
    summary: hidden ? `Hid ${who} from the members list` : `Unhid ${who}`,
  });
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
  revalidatePath("/activity");
}

const MEETING_TEXT_FIELDS = ["conducting", "presiding", "chorister", "accompanist", "musicalNumber", "theme", "notes"] as const;
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
    summary: `Added Sunday ${fmtDate(date)}`,
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
      summary: `Removed Sunday ${fmtDate(row.date)}`,
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
    summary: `Set meeting type to ${type.replace(/_/g, " ")} — ${await meetingLabel(db, meetingId)}`,
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
  const clean = value.trim() || null;
  await db
    .update(meetings)
    .set({ [field]: clean, updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));
  const date = await meetingLabel(db, meetingId);
  await recordAudit(db, {
    action: "updated",
    entityType: "meeting",
    entityId: meetingId,
    summary: clean
      ? `Set ${FIELD_LABEL[field]} to "${clean}" — ${date}`
      : `Cleared ${FIELD_LABEL[field]} — ${date}`,
  });
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
  const date = await meetingLabel(db, meetingId);
  await recordAudit(db, {
    action: "updated",
    entityType: "meeting",
    entityId: meetingId,
    summary: value != null
      ? `Set ${FIELD_LABEL[field]} to #${value} — ${date}`
      : `Cleared ${FIELD_LABEL[field]} — ${date}`,
  });
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
  const date = await meetingLabel(db, meetingId);

  if (!memberId && !guestName) {
    // Removal — capture who was there first, so the trail names them.
    const [existing] = await db
      .select({ memberId: assignments.memberId, guestName: assignments.guestName })
      .from(assignments)
      .where(and(eq(assignments.meetingId, meetingId), eq(assignments.role, "speaker"), eq(assignments.position, position)));
    await db
      .delete(assignments)
      .where(
        and(
          eq(assignments.meetingId, meetingId),
          eq(assignments.role, "speaker"),
          eq(assignments.position, position)
        )
      );
    if (existing) {
      const who = existing.memberId ? await memberLabel(db, existing.memberId) : existing.guestName;
      await recordAudit(db, {
        action: "deleted",
        entityType: "assignment",
        entityId: meetingId,
        summary: `Removed ${who} as speaker ${position} — ${date}`,
      });
    }
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
  await recordAudit(db, {
    action: "updated",
    entityType: "assignment",
    entityId: row.id,
    summary: `Set speaker ${position} to ${await selLabel(db, sel)} — ${date}`,
  });
  revalidatePlanner();
  return { id: row.id, status: row.status as AssignmentStatusValue };
}

export async function setSpeakerTopic(assignmentId: string, topic: string) {
  const db = await getDb();
  const clean = topic.trim() || null;
  await db
    .update(assignments)
    .set({ topic: clean, updatedAt: new Date() })
    .where(eq(assignments.id, assignmentId));
  const [a] = await db
    .select({ meetingId: assignments.meetingId, memberId: assignments.memberId, guestName: assignments.guestName })
    .from(assignments)
    .where(eq(assignments.id, assignmentId));
  if (a) {
    const who = a.memberId ? await memberLabel(db, a.memberId) : a.guestName ?? "speaker";
    const date = await meetingLabel(db, a.meetingId);
    await recordAudit(db, {
      action: "updated",
      entityType: "assignment",
      entityId: assignmentId,
      summary: clean ? `Set ${who}'s topic to "${clean}" — ${date}` : `Cleared ${who}'s topic — ${date}`,
    });
  }
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
  const [a] = await db
    .select({ meetingId: assignments.meetingId, memberId: assignments.memberId, guestName: assignments.guestName })
    .from(assignments)
    .where(eq(assignments.id, assignmentId));
  const who = a ? (a.memberId ? await memberLabel(db, a.memberId) : a.guestName ?? "speaker") : "speaker";
  const date = a ? await meetingLabel(db, a.meetingId) : "";
  await recordAudit(db, {
    action: "updated",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Marked ${who} ${status} — ${date}`,
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
  const date = await meetingLabel(db, meetingId);

  if (!memberId && !guestName) {
    const [existing] = await db
      .select({ memberId: assignments.memberId, guestName: assignments.guestName })
      .from(assignments)
      .where(and(eq(assignments.meetingId, meetingId), eq(assignments.role, role), eq(assignments.position, 1)));
    await db
      .delete(assignments)
      .where(
        and(
          eq(assignments.meetingId, meetingId),
          eq(assignments.role, role),
          eq(assignments.position, 1)
        )
      );
    if (existing) {
      const who = existing.memberId ? await memberLabel(db, existing.memberId) : existing.guestName;
      await recordAudit(db, {
        action: "deleted",
        entityType: "assignment",
        entityId: meetingId,
        summary: `Removed ${who} as ${ROLE_LABEL[role]} — ${date}`,
      });
    }
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
    await recordAudit(db, {
      action: "updated",
      entityType: "assignment",
      entityId: meetingId,
      summary: `Set ${ROLE_LABEL[role]} to ${await selLabel(db, sel)} — ${date}`,
    });
  }
  revalidatePlanner();
}
