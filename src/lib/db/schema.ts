import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  date,
  timestamp,
  boolean,
  unique,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ----------------------------- enums ----------------------------- */

export const ageCategory = pgEnum("age_category", ["adult", "youth", "primary"]);

export const meetingType = pgEnum("meeting_type", [
  "sacrament",
  "fast_and_testimony",
  "ward_conference",
  "stake_conference",
  "general_conference",
  "primary_program",
  "no_meeting",
]);

export const assignmentRole = pgEnum("assignment_role", [
  "speaker",
  "opening_prayer",
  "closing_prayer",
  "musical_number",
]);

export const assignmentStatus = pgEnum("assignment_status", [
  "invited",
  "confirmed",
  "spoke",
  "declined",
]);

/* ----------------------------- users ----------------------------- */
// Bishopric members who sign in (Google) and edit the plan.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ---------------------------- members ---------------------------- */
// One row per ward member. Sourced from an LCR export upload.

export const members = pgTable("members", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  // The given name they go by ("Alex" for "Alexander"), editable by bishopric.
  preferredName: text("preferred_name"),
  household: text("household"),
  gender: text("gender"), // "M" | "F" | null — editable
  phone: text("phone"),
  email: text("email"),
  birthdate: date("birthdate"),
  // Manual override for when birthdate is blank; otherwise derived at query time.
  ageCategoryOverride: ageCategory("age_category_override"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [index("idx_members_active").on(t.isActive)]);

/* ----------------------------- hymns ----------------------------- */

export const hymns = pgTable("hymns", {
  id: uuid("id").defaultRandom().primaryKey(),
  number: integer("number"),
  title: text("title").notNull(),
});

/* ---------------------------- meetings --------------------------- */
// One row per Sunday.

export const meetings = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  type: meetingType("type").notNull().default("sacrament"),
  conducting: text("conducting"),
  presiding: text("presiding"),
  chorister: text("chorister"),
  accompanist: text("accompanist"), // pianist / organist
  musicalNumber: text("musical_number"), // special number: choir/solo/primary, free-form
  theme: text("theme"),
  openingHymn: integer("opening_hymn"),
  sacramentHymn: integer("sacrament_hymn"),
  intermediateHymn: integer("intermediate_hymn"),
  closingHymn: integer("closing_hymn"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* -------------------------- assignments -------------------------- */
// The hub: links a member to a meeting in a role, with topic + status.

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    // Fallback for a non-member guest speaker (e.g. visiting authority).
    guestName: text("guest_name"),
    role: assignmentRole("role").notNull().default("speaker"),
    position: integer("position").notNull().default(1),
    topic: text("topic"),
    status: assignmentStatus("status").notNull().default("invited"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_assignment_slot").on(t.meetingId, t.role, t.position),
    // Powers the "last spoke" rollup on the members page.
    index("idx_assignments_member_status").on(t.memberId, t.status),
    index("idx_assignments_meeting").on(t.meetingId),
  ]
);

/* --------------------------- audit log --------------------------- */

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  userEmail: text("user_email"),
  action: text("action").notNull(), // created | updated | deleted
  entityType: text("entity_type").notNull(), // member | meeting | assignment
  entityId: uuid("entity_id"),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [index("idx_audit_created").on(t.createdAt)]);

/* ------------------------ roster imports ------------------------- */
// One row per APPLIED ward-list refresh: a snapshot of the imported list plus
// exactly what changed. This is the historical version log of the ward roster.

export const rosterImports = pgTable(
  "roster_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importedByUserId: uuid("imported_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    importedByEmail: text("imported_by_email"),
    filename: text("filename"),
    addedCount: integer("added_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    removedCount: integer("removed_count").notNull().default(0),
    unchangedCount: integer("unchanged_count").notNull().default(0),
    // Full parsed roster from this import + the computed diff detail.
    snapshot: jsonb("snapshot").notNull(),
    changes: jsonb("changes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_roster_created").on(t.createdAt)]
);

export type RosterImport = typeof rosterImports.$inferSelect;

/* --------------------------- relations --------------------------- */

export const membersRelations = relations(members, ({ many }) => ({
  assignments: many(assignments),
}));

export const meetingsRelations = relations(meetings, ({ many }) => ({
  assignments: many(assignments),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  meeting: one(meetings, {
    fields: [assignments.meetingId],
    references: [meetings.id],
  }),
  member: one(members, {
    fields: [assignments.memberId],
    references: [members.id],
  }),
}));

export type Member = typeof members.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type User = typeof users.$inferSelect;
