import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { members, assignments, meetings } from "./db/schema";
import { bucketFor, daysSince, type Bucket } from "./recency";
import { displayName, primaryName, officialSubline } from "./names";

export type AgeCategory = "adult" | "youth" | "primary";

export type MemberRow = {
  id: string;
  fullName: string;
  // Primary (preferred-aware) display; officialName is the muted subline or null.
  displayName: string;
  officialName: string | null;
  preferredName: string | null;
  household: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  birthdate: string | null;
  age: number | null;
  ageCategory: AgeCategory | null;
  hidden: boolean;
  lastSpoke: string | null;
  daysSince: number | null;
  bucket: Bucket;
  talkCount: number;
};

// Re-exported so existing importers (meetings.ts) keep working.
export { displayName };

function ageFrom(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function categoryFor(
  birthdate: string | null,
  override: AgeCategory | null
): AgeCategory | null {
  if (override) return override;
  if (!birthdate) return null;
  // Church programs go by calendar year, not exact birthday:
  // Primary = the year before they turn 12; Youth = the year they turn 12
  // through the year they turn 17 (graduate HS); Adult = the year they turn 18+.
  const ageThisYear =
    new Date().getFullYear() -
    new Date(birthdate + "T00:00:00").getFullYear();
  if (ageThisYear < 12) return "primary";
  if (ageThisYear < 18) return "youth";
  return "adult";
}

export async function getMembersWithSpeaking(): Promise<MemberRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: members.id,
      fullName: members.fullName,
      preferredName: members.preferredName,
      household: members.household,
      gender: members.gender,
      phone: members.phone,
      email: members.email,
      birthdate: members.birthdate,
      ageCategoryOverride: members.ageCategoryOverride,
      hidden: members.hidden,
      lastSpoke: sql<string | null>`max(${meetings.date})`,
      talkCount: sql<number>`count(${assignments.id})`,
    })
    .from(members)
    .leftJoin(
      assignments,
      and(
        eq(assignments.memberId, members.id),
        eq(assignments.status, "spoke")
      )
    )
    .leftJoin(meetings, eq(meetings.id, assignments.meetingId))
    .where(eq(members.isActive, true))
    .groupBy(members.id);

  return rows
    .map((r): MemberRow => {
      const days = daysSince(r.lastSpoke);
      return {
        id: r.id,
        fullName: r.fullName,
        displayName: primaryName(r.fullName, r.preferredName),
        officialName: officialSubline(r.fullName, r.preferredName),
        preferredName: r.preferredName,
        household: r.household,
        gender: r.gender,
        phone: r.phone,
        email: r.email,
        birthdate: r.birthdate,
        age: ageFrom(r.birthdate),
        ageCategory: categoryFor(r.birthdate, r.ageCategoryOverride),
        hidden: r.hidden,
        lastSpoke: r.lastSpoke,
        daysSince: days,
        bucket: bucketFor(days),
        talkCount: Number(r.talkCount),
      };
    })
    .sort((a, b) =>
      displayName(a.fullName).localeCompare(displayName(b.fullName))
    );
}
