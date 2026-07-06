"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { ensureUser } from "./auth";
import { members, rosterImports, auditLog } from "./db/schema";
import {
  parseRosterCsv,
  diffRoster,
  type RosterRow,
  type RosterDiff,
  type ExistingMember,
  type ParseResult,
} from "./roster";
import { parseRosterPdf } from "./roster-pdf";

async function activeMembers(): Promise<ExistingMember[]> {
  const db = await getDb();
  return db
    .select({
      id: members.id,
      fullName: members.fullName,
      household: members.household,
      gender: members.gender,
      phone: members.phone,
      email: members.email,
      birthdate: members.birthdate,
    })
    .from(members)
    .where(eq(members.isActive, true));
}

export type PreviewResult = {
  ok: boolean;
  errors: string[];
  filename: string;
  rowCount: number;
  columns: ParseResult["columns"];
  rows: RosterRow[];
  diff: RosterDiff;
};

export async function previewRoster(
  formData: FormData
): Promise<PreviewResult> {
  const file = formData.get("file") as File | null;
  const empty: PreviewResult = {
    ok: false,
    errors: [],
    filename: "",
    rowCount: 0,
    columns: { fullName: false, household: false, gender: false, phone: false, email: false, birthdate: false },
    rows: [],
    diff: { adds: [], updates: [], removes: [], unchangedCount: 0 },
  };

  if (!file || file.size === 0) {
    return { ...empty, errors: ["Please choose a PDF or CSV file to upload."] };
  }

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const parsed = isPdf
    ? await parseRosterPdf(new Uint8Array(await file.arrayBuffer()))
    : parseRosterCsv(await file.text());
  if (parsed.errors.length) {
    return { ...empty, filename: file.name, errors: parsed.errors, columns: parsed.columns };
  }

  const existing = await activeMembers();
  const diff = diffRoster(existing, parsed.rows);

  return {
    ok: true,
    errors: [],
    filename: file.name,
    rowCount: parsed.rows.length,
    columns: parsed.columns,
    rows: parsed.rows,
    diff,
  };
}

export type ApplyResult = {
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  importId?: string;
};

export async function applyRoster(
  rows: RosterRow[],
  filename: string
): Promise<ApplyResult> {
  const db = await getDb();
  // Recompute the diff server-side so we never trust a client-supplied diff.
  const existing = await activeMembers();
  const diff = diffRoster(existing, rows);

  // Adds
  if (diff.adds.length) {
    await db.insert(members).values(
      diff.adds.map((r) => ({
        fullName: r.fullName,
        household: r.household,
        gender: r.gender,
        phone: r.phone,
        email: r.email,
        birthdate: r.birthdate,
      }))
    );
  }

  // Updates (only the changed fields per member)
  for (const u of diff.updates) {
    const patch: Record<string, string | null> = { };
    for (const c of u.changes) patch[c.field] = c.after;
    await db
      .update(members)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(members.id, u.memberId));
  }

  // Move-outs: soft-remove so speaking history is preserved.
  if (diff.removes.length) {
    await db
      .update(members)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        inArray(
          members.id,
          diff.removes.map((r) => r.memberId)
        )
      );
  }

  const user = await ensureUser();
  const [row] = await db
    .insert(rosterImports)
    .values({
      importedByUserId: user?.id ?? null,
      importedByEmail: user?.email ?? null,
      filename,
      addedCount: diff.adds.length,
      updatedCount: diff.updates.length,
      removedCount: diff.removes.length,
      unchangedCount: diff.unchangedCount,
      snapshot: rows,
      changes: diff,
    })
    .returning({ id: rosterImports.id });

  // Surface the import in the activity feed too (detailed diff lives in the
  // roster version history; this is the one-line trail entry).
  if (diff.adds.length + diff.updates.length + diff.removes.length > 0) {
    await db.insert(auditLog).values({
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      action: "updated",
      entityType: "roster",
      entityId: row.id,
      summary: `Imported roster${filename ? ` "${filename}"` : ""}: ${diff.adds.length} added, ${diff.updates.length} updated, ${diff.removes.length} removed`,
    });
  }

  revalidatePath("/members");
  revalidatePath("/members/import");
  revalidatePath("/activity");

  return {
    ok: true,
    added: diff.adds.length,
    updated: diff.updates.length,
    removed: diff.removes.length,
    importId: row.id,
  };
}

export type RosterVersion = {
  id: string;
  createdAt: Date;
  importedByEmail: string | null;
  filename: string | null;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  unchangedCount: number;
};

export async function getRosterVersions(): Promise<RosterVersion[]> {
  const db = await getDb();
  return db
    .select({
      id: rosterImports.id,
      createdAt: rosterImports.createdAt,
      importedByEmail: rosterImports.importedByEmail,
      filename: rosterImports.filename,
      addedCount: rosterImports.addedCount,
      updatedCount: rosterImports.updatedCount,
      removedCount: rosterImports.removedCount,
      unchangedCount: rosterImports.unchangedCount,
    })
    .from(rosterImports)
    .orderBy(desc(rosterImports.createdAt));
}

export async function getRosterVersion(id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(rosterImports)
    .where(eq(rosterImports.id, id));
  return row ?? null;
}
