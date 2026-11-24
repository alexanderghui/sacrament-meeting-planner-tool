// Add-only ward-member backfill. A scheduled job posts the latest LCR Member
// List; we insert people who are missing and reactivate clear matches that were
// soft-removed. Nothing is ever deleted, renamed, or overwritten — anything that
// only looks like an existing member is reported as a near-match for a human.

import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "./db";
import { auditLog, members, rosterImports } from "./db/schema";
import { firstNameCompatible, lev, norm } from "./name-match";
import {
  matchKey,
  nameKey,
  parseBirthdate,
  parseRosterCsv,
  type RosterDiff,
  type RosterRow,
} from "./roster";
import { parseRosterPdf } from "./roster-pdf";

export type BackfillMember = {
  id: string;
  fullName: string;
  preferredName: string | null;
  birthdate: string | null;
  isActive: boolean;
};

export type NearMatch = { incoming: string; existing: string; reason: string };

export type BackfillPlan = {
  parsed: number;
  adds: RosterRow[];
  reactivations: { id: string; fullName: string }[];
  skipped: number;
  nearMatches: NearMatch[];
};

export type BackfillResult = {
  ok: true;
  dryRun: boolean;
  counts: {
    parsed: number;
    added: number;
    reactivated: number;
    skipped: number;
    nearMatches: number;
  };
  added: string[];
  reactivated: string[];
  nearMatches: NearMatch[];
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Surname + first given name, normalised for fuzzy comparison. Accepts the LCR
// "Last, First Middle" form or a plain "First Last".
function nameParts(name: string): { last: string; first: string } {
  if (name.includes(",")) {
    const [last, rest] = name.split(",");
    return {
      last: norm(fold(last)),
      first: norm(fold((rest || "").trim().split(/\s+/)[0] || "")),
    };
  }
  const toks = name.trim().split(/\s+/);
  return {
    last: toks.length > 1 ? norm(fold(toks[toks.length - 1])) : "",
    first: norm(fold(toks[0] || "")),
  };
}

type Indexed = BackfillMember & {
  keys: string[];
  last: string;
  firsts: string[];
};

function index(existing: BackfillMember[]) {
  const byKey = new Map<string, Indexed[]>();
  const all: Indexed[] = existing.map((m) => {
    const { last, first } = nameParts(m.fullName);
    const firsts = first ? [first] : [];
    const pref = norm(fold((m.preferredName || "").trim().split(/\s+/)[0] || ""));
    if (pref && !firsts.includes(pref)) firsts.push(pref);
    const keys = [nameKey(m.fullName)];
    const prefKey = m.preferredName ? nameKey(m.preferredName) : "";
    if (prefKey && prefKey !== keys[0]) keys.push(prefKey);
    return { ...m, keys: keys.filter(Boolean), last, firsts };
  });
  for (const m of all)
    for (const k of m.keys) byKey.set(k, [...(byKey.get(k) || []), m]);
  return { all, byKey };
}

function similarName(
  inc: { last: string; first: string; key: string },
  m: Indexed
): boolean {
  if (!inc.first || !m.firsts.length) return false;
  const compatible = m.firsts.some((f) => firstNameCompatible(f, inc.first));
  if (compatible && inc.last && lev(inc.last, m.last) <= 1) return true;
  if (m.firsts.includes(inc.first)) return true;
  return m.keys.some((k) => lev(k, inc.key) <= 1);
}

export function planBackfill(
  existing: BackfillMember[],
  incoming: RosterRow[]
): BackfillPlan {
  const { all, byKey } = index(existing);
  const adds: RosterRow[] = [];
  const reactivations: { id: string; fullName: string }[] = [];
  const reactivatedIds = new Set<string>();
  const nearMatches: NearMatch[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const row of incoming) {
    const key = nameKey(row.fullName);
    const mk = matchKey(row.fullName, row.birthdate);
    if (!key || seen.has(mk)) {
      skipped++;
      continue;
    }
    seen.add(mk);

    const near = (m: BackfillMember, reason: string) =>
      nearMatches.push({ incoming: row.fullName, existing: m.fullName, reason });

    const candidates = byKey.get(key) || [];
    if (candidates.length) {
      const sameBirth = candidates.filter(
        (m) => row.birthdate && m.birthdate === row.birthdate
      );
      let match: Indexed | null = null;
      if (sameBirth.length === 1) match = sameBirth[0];
      else if (sameBirth.length > 1) {
        for (const m of sameBirth)
          near(m, "Several existing members share this name and birthdate");
        continue;
      } else if (candidates.length === 1) {
        const m = candidates[0];
        if (row.birthdate && m.birthdate) {
          near(m, `Same name, different birthdate (${row.birthdate} vs ${m.birthdate})`);
          continue;
        }
        match = m;
      } else {
        for (const m of candidates)
          near(m, "Several existing members share this name; birthdate can't tell them apart");
        continue;
      }

      if (match.isActive || reactivatedIds.has(match.id)) skipped++;
      else {
        reactivatedIds.add(match.id);
        reactivations.push({ id: match.id, fullName: match.fullName });
      }
      continue;
    }

    const inc = { ...nameParts(row.fullName), key };
    let flagged = false;
    for (const m of all) {
      let reason: string | null = null;
      if (
        inc.last &&
        inc.first &&
        inc.last === m.last &&
        m.firsts.some((f) => firstNameCompatible(f, inc.first))
      )
        reason = "Same last name, similar first name (nickname, prefix, or typo)";
      else if (row.birthdate && row.birthdate === m.birthdate && similarName(inc, m))
        reason = "Same birthdate, similar name";
      if (reason) {
        near(m, reason);
        flagged = true;
      }
    }
    if (!flagged) adds.push(row);
  }

  return { parsed: incoming.length, adds, reactivations, skipped, nearMatches };
}

export async function runBackfill(
  db: DB,
  rows: RosterRow[],
  opts: { dryRun: boolean; filename: string | null }
): Promise<BackfillResult> {
  const existing = await db
    .select({
      id: members.id,
      fullName: members.fullName,
      preferredName: members.preferredName,
      birthdate: members.birthdate,
      isActive: members.isActive,
    })
    .from(members);
  const plan = planBackfill(existing, rows);

  if (!opts.dryRun) {
    if (plan.adds.length) {
      await db.insert(members).values(
        plan.adds.map((r) => ({
          fullName: r.fullName,
          household: r.household,
          gender: r.gender,
          phone: r.phone,
          email: r.email,
          birthdate: r.birthdate,
        }))
      );
    }
    if (plan.reactivations.length) {
      await db
        .update(members)
        .set({ isActive: true, updatedAt: new Date() })
        .where(
          and(
            inArray(
              members.id,
              plan.reactivations.map((r) => r.id)
            ),
            eq(members.isActive, false)
          )
        );
    }

    const changes: RosterDiff & { reactivated: string[]; nearMatches: NearMatch[] } = {
      adds: plan.adds,
      updates: [],
      removes: [],
      unchangedCount: plan.skipped,
      reactivated: plan.reactivations.map((r) => r.fullName),
      nearMatches: plan.nearMatches,
    };
    const [row] = await db
      .insert(rosterImports)
      .values({
        importedByEmail: "members-backfill",
        filename: opts.filename,
        addedCount: plan.adds.length,
        updatedCount: plan.reactivations.length,
        removedCount: 0,
        unchangedCount: plan.skipped,
        snapshot: rows,
        changes,
      })
      .returning({ id: rosterImports.id });

    if (plan.adds.length + plan.reactivations.length > 0) {
      await db.insert(auditLog).values({
        userEmail: "members-backfill",
        action: "updated",
        entityType: "roster",
        entityId: row.id,
        summary: `Add-only member backfill${opts.filename ? ` "${opts.filename}"` : ""}: ${plan.adds.length} added, ${plan.reactivations.length} reactivated (nothing removed or renamed)`,
      });
    }
  }

  return {
    ok: true,
    dryRun: opts.dryRun,
    counts: {
      parsed: plan.parsed,
      added: plan.adds.length,
      reactivated: plan.reactivations.length,
      skipped: plan.skipped,
      nearMatches: plan.nearMatches.length,
    },
    added: plan.adds.map((r) => r.fullName),
    reactivated: plan.reactivations.map((r) => r.fullName),
    nearMatches: plan.nearMatches,
  };
}

const optionalString = (v: unknown): string | null | undefined => {
  if (v == null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : null;
};

export function parseBackfillJson(body: unknown): { rows: RosterRow[]; errors: string[] } {
  const list = (body as { members?: unknown } | null)?.members;
  if (!Array.isArray(list)) {
    return { rows: [], errors: ['Expected a JSON body like { "members": [ { "fullName": "Last, First" } ] }'] };
  }
  const rows: RosterRow[] = [];
  const errors: string[] = [];
  list.forEach((item, i) => {
    const m = (item ?? {}) as Record<string, unknown>;
    if (typeof m.fullName !== "string") {
      errors.push(`members[${i}]: fullName is required`);
      return;
    }
    const fullName = m.fullName.trim();
    if (!fullName) return;
    const fields = {} as Record<"household" | "gender" | "phone" | "email" | "birthdate", string | null>;
    for (const f of ["household", "gender", "phone", "email", "birthdate"] as const) {
      const v = optionalString(m[f]);
      if (v === undefined) {
        errors.push(`members[${i}]: ${f} must be a string`);
        return;
      }
      fields[f] = v;
    }
    const birthdate = fields.birthdate ? parseBirthdate(fields.birthdate) : null;
    if (fields.birthdate && !birthdate) {
      errors.push(`members[${i}]: couldn't read birthdate "${fields.birthdate}"`);
      return;
    }
    const g = fields.gender?.toUpperCase()[0];
    rows.push({
      fullName,
      household: fields.household,
      gender: g === "M" || g === "F" ? g : null,
      phone: fields.phone,
      email: fields.email,
      birthdate,
    });
  });
  if (!errors.length && !rows.length) errors.push("No members with a fullName were provided.");
  return { rows: errors.length ? [] : rows, errors };
}

// Reads either a multipart upload (LCR Member List PDF or CSV) or a JSON
// member list from the request body.
export async function readBackfillRequest(
  req: Request
): Promise<{ rows: RosterRow[]; filename: string | null; errors: string[] }> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { rows: [], filename: null, errors: ["Couldn't read the multipart form body."] };
    }
    const named = form.get("file");
    const files = [...form.values()].filter((v): v is File => v instanceof File);
    const file = named instanceof File ? named : files.length === 1 ? files[0] : null;
    if (!file || file.size === 0) {
      return {
        rows: [],
        filename: null,
        errors: ['Upload one LCR Member List PDF or CSV in the "file" field.'],
      };
    }
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const parsed = isPdf
      ? await parseRosterPdf(new Uint8Array(await file.arrayBuffer()))
      : parseRosterCsv(await file.text());
    return { rows: parsed.rows, filename: file.name || null, errors: parsed.errors };
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      rows: [],
      filename: null,
      errors: ['Send multipart/form-data with a "file" field, or JSON { "members": [...] }.'],
    };
  }
  return { ...parseBackfillJson(body), filename: null };
}
