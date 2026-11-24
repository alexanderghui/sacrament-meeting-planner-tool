// Tests for the add-only member backfill: the pure matcher, the route's auth /
// validation paths, and an end-to-end apply against a throwaway PGlite database
// in a temp directory (./.pglite is never opened).
//
//   npx tsx scripts/test-backfill.ts
//
// Exits non-zero on any failure.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { count, eq } from "drizzle-orm";
import {
  parseBackfillJson,
  planBackfill,
  runBackfill,
  type BackfillMember,
} from "../src/lib/backfill";
import { parseRosterCsv, type RosterRow } from "../src/lib/roster";
import { auditLog, members, rosterImports } from "../src/lib/db/schema";
import type { DB } from "../src/lib/db";
import { buildResolver } from "./match";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}

const row = (fullName: string, birthdate: string | null = null): RosterRow => ({
  fullName,
  household: fullName.includes(",") ? fullName.split(",")[0].trim() : null,
  gender: null,
  phone: null,
  email: null,
  birthdate,
});

let nextId = 0;
const member = (
  fullName: string,
  birthdate: string | null,
  extra: Partial<BackfillMember> = {}
): BackfillMember => ({
  id: `m${++nextId}`,
  fullName,
  preferredName: null,
  birthdate,
  isActive: true,
  ...extra,
});

function plan(existing: BackfillMember[], incoming: RosterRow[]) {
  return planBackfill(existing, incoming);
}

function unitTests() {
  console.log("Matcher (pure)");
  const smith = member("Smith, John", "1984-03-11");

  let p = plan([smith], [row("Smith, John", "1984-03-11")]);
  check("exact name + birthdate is skip", p.skipped === 1 && !p.adds.length && !p.nearMatches.length, p);

  p = plan([smith], [row("John Smith", "1984-03-11")]);
  check('"Last, First" vs "First Last" is skip', p.skipped === 1 && !p.adds.length, p);

  p = plan([smith], [row("Smith, John")]);
  check("unique name, incoming birthdate missing is skip", p.skipped === 1 && !p.adds.length, p);
  p = plan([member("Smith, John", null)], [row("Smith, John", "1984-03-11")]);
  check("unique name, existing birthdate missing is skip", p.skipped === 1 && !p.adds.length, p);

  p = plan([smith], [row("Smith, John", "2010-01-01")]);
  check(
    "same name, different birthdates is near-match",
    !p.adds.length && p.nearMatches.length === 1 && p.nearMatches[0].existing === "Smith, John",
    p
  );

  for (const [incoming, kind] of [
    ["Smith, Johnny", "prefix"],
    ["Smith, Jon", "typo"],
    ["Smith, Jack", "nickname"],
  ] as const) {
    p = plan([smith], [row(incoming, "1999-09-09")]);
    check(`${kind} first name + same last is near-match`, !p.adds.length && p.nearMatches.length === 1, p);
  }

  p = plan([member("Hui, Alexander", "1990-01-01", { preferredName: "Alex Hui" })], [row("Hui, Alex", "1990-01-01")]);
  check("preferredName match is skip", p.skipped === 1 && !p.adds.length && !p.nearMatches.length, p);

  const inactive = member("Brown, Robert", "1990-08-14", { isActive: false });
  p = plan([inactive], [row("Brown, Robert", "1990-08-14")]);
  check(
    "inactive clear match is reactivate",
    p.reactivations.length === 1 && p.reactivations[0].id === inactive.id && !p.adds.length,
    p
  );
  p = plan([inactive], [row("Brown, Robert", "1990-08-14"), row("Robert Brown")]);
  check("same inactive member is reactivated once", p.reactivations.length === 1 && p.skipped === 1, p);

  p = plan([member("Garcia, José", "1995-03-25")], [row("Garcia, Jose", "1995-03-25")]);
  check("diacritics (José vs Jose) is skip", p.skipped === 1 && !p.adds.length, p);
  p = plan([member("Garcia, Jose", "1995-03-25")], [row("García, José")]);
  check("diacritics without birthdate is skip", p.skipped === 1 && !p.adds.length, p);

  p = plan([smith], [row("Nguyen, Linh", "2001-02-03")]);
  check("truly new person is add", p.adds.length === 1 && p.adds[0].fullName === "Nguyen, Linh", p);

  const twins = [member("Smith, Ann", "1980-01-01"), member("Smith, Ann", "2005-05-05")];
  p = plan(twins, [row("Smith, Ann")]);
  check(
    "ambiguous same-name people without birthdate is near-match, not add",
    !p.adds.length && !p.reactivations.length && p.nearMatches.length === 2,
    p
  );
  p = plan([member("Smith, Ann", null), member("Smith, Ann", null, { isActive: false })], [row("Smith, Ann", "1980-01-01")]);
  check("ambiguous same-name rows are never reactivated", !p.reactivations.length && !p.adds.length && p.nearMatches.length === 2, p);

  p = plan([member("Jones, Mary", "1986-07-22")], [row("Smith, Mary", "1986-07-22")]);
  check("same birthdate + same first name (new surname) is near-match", !p.adds.length && p.nearMatches.length === 1, p);
  p = plan([member("Jones, Mary", "1986-07-22")], [row("Jonas, Mary", "1970-01-01")]);
  check("similar surname with different birthdate is add", p.adds.length === 1, p);

  p = plan([], [row("Doe, Jane", "2000-01-01"), row("Jane Doe", "2000-01-01")]);
  check("in-file duplicates are skipped", p.adds.length === 1 && p.skipped === 1, p);

  const json = parseBackfillJson({
    members: [
      { fullName: "Doe, Jane", birthdate: "1/2/2000", gender: "female", household: "Doe" },
      { fullName: "   " },
    ],
  });
  check(
    "JSON parser reads members and ignores empty names",
    !json.errors.length && json.rows.length === 1 && json.rows[0].birthdate === "2000-01-02" && json.rows[0].gender === "F",
    json
  );
  check("JSON parser requires fullName", parseBackfillJson({ members: [{ household: "x" }] }).errors.length === 1);
  check("JSON parser rejects a missing members list", parseBackfillJson({}).errors.length === 1);

  const resolve = buildResolver([
    { id: "a", fullName: "Hui, Alexander Gabriel", preferredName: null },
    { id: "b", fullName: "Smith, Michael" },
    { id: "c", fullName: "Smith, Michelle" },
  ]);
  check(
    "speaker resolver unchanged after extraction",
    resolve("Alex Hui") === "a" && resolve("Mike Smith") === "b" && resolve("Mich Smith") === null
  );
}

async function routeTests() {
  console.log("Route auth / validation");
  const saved = process.env.MEMBERS_BACKFILL_SECRET;
  const { POST } = await import("../src/app/api/members/backfill/route");
  const post = (headers: Record<string, string>, body: string) =>
    POST(new Request("http://localhost/api/members/backfill", { method: "POST", headers, body }));

  delete process.env.MEMBERS_BACKFILL_SECRET;
  check("503 when secret unset", (await post({}, "{}")).status === 503);
  process.env.MEMBERS_BACKFILL_SECRET = "";
  check("503 when secret empty", (await post({}, "{}")).status === 503);

  const testKey = `test-${Math.random().toString(36).slice(2)}`;
  process.env.MEMBERS_BACKFILL_SECRET = testKey;
  check("401 when header missing", (await post({}, "{}")).status === 401);
  check("401 when header wrong", (await post({ "x-backfill-key": `${testKey}x` }, "{}")).status === 401);
  const bad = await post({ "x-backfill-key": testKey, "content-type": "application/json" }, "not json");
  check("400 on invalid body", bad.status === 400 && (await bad.json()).ok === false);
  const noName = await post(
    { "x-backfill-key": testKey, "content-type": "application/json" },
    JSON.stringify({ members: [{ email: "x@example.com" }] })
  );
  check("400 when fullName missing", noName.status === 400);

  if (saved === undefined) delete process.env.MEMBERS_BACKFILL_SECRET;
  else process.env.MEMBERS_BACKFILL_SECRET = saved;
}

async function integrationTests() {
  console.log("Integration (temp PGlite)");
  const dir = mkdtempSync(join(tmpdir(), "backfill-test-"));
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dir);
  try {
    const db = drizzle(client) as unknown as DB;
    await migrate(db, { migrationsFolder: "./drizzle" });

    const memberCount = async () => (await db.select({ n: count() }).from(members))[0].n;
    const csv = parseRosterCsv(readFileSync("sample-roster.csv", "utf8"));
    check("sample-roster.csv parses", !csv.errors.length && csv.rows.length > 0, csv.errors);
    const n = csv.rows.length;

    let r = await runBackfill(db, csv.rows, { dryRun: true, filename: "sample-roster.csv" });
    check("dry run on empty DB would add every row", r.dryRun && r.counts.added === n && r.added.length === n, r.counts);
    check("dry run writes nothing", (await memberCount()) === 0);
    check("dry run writes no import row", (await db.select().from(rosterImports)).length === 0);

    r = await runBackfill(db, csv.rows, { dryRun: false, filename: "sample-roster.csv" });
    check("apply adds every row", !r.dryRun && r.counts.added === n, r.counts);
    check("apply inserted the rows", (await memberCount()) === n);
    const john = (await db.select().from(members).where(eq(members.fullName, "Smith, John")))[0];
    check(
      "inserted fields come from the roster, preferredName null",
      john?.household === "Smith" && john.birthdate === "1984-03-11" && john.preferredName === null && john.isActive,
      john
    );
    const imports = await db.select().from(rosterImports);
    check(
      "roster_imports row written",
      imports.length === 1 && imports[0].addedCount === n && imports[0].removedCount === 0 && imports[0].importedByEmail === "members-backfill",
      imports.map((i) => ({ ...i, snapshot: undefined, changes: undefined }))
    );
    const audits = await db.select().from(auditLog);
    check(
      "audit entry written",
      audits.length === 1 && audits[0].entityType === "roster" && audits[0].action === "updated" && /add-only/i.test(audits[0].summary),
      audits
    );

    // Local edits must survive a re-run: rename via preferredName, changed phone.
    await db.update(members).set({ preferredName: "Johnny Smith", phone: "000" }).where(eq(members.id, john.id));

    r = await runBackfill(db, csv.rows, { dryRun: false, filename: "sample-roster.csv" });
    check("re-run adds nothing and skips all", r.counts.added === 0 && r.counts.skipped === n && r.counts.nearMatches === 0, r);
    check("re-run inserts no extra rows", (await memberCount()) === n);
    const john2 = (await db.select().from(members).where(eq(members.id, john.id)))[0];
    check(
      "existing fields untouched",
      john2.fullName === "Smith, John" && john2.preferredName === "Johnny Smith" && john2.phone === "000",
      john2
    );

    const withNew = [...csv.rows, { ...row("Nguyen, Linh", "2001-02-03"), gender: "F" }];
    r = await runBackfill(db, withNew, { dryRun: true, filename: null });
    check("dry run reports the one new member", r.counts.added === 1 && r.added[0] === "Nguyen, Linh", r);
    check("dry run still writes nothing", (await memberCount()) === n);
    r = await runBackfill(db, withNew, { dryRun: false, filename: null });
    check("new member added once", r.counts.added === 1 && (await memberCount()) === n + 1, r.counts);
    r = await runBackfill(db, withNew, { dryRun: false, filename: null });
    check("new member then skipped", r.counts.added === 0 && r.counts.skipped === n + 1 && (await memberCount()) === n + 1, r.counts);

    const brown = (await db.select().from(members).where(eq(members.fullName, "Brown, Robert")))[0];
    await db.update(members).set({ isActive: false, phone: "111" }).where(eq(members.id, brown.id));
    r = await runBackfill(db, csv.rows, { dryRun: true, filename: null });
    check("dry run reports reactivation", r.counts.reactivated === 1 && r.reactivated[0] === "Brown, Robert", r.counts);
    check("dry run leaves member inactive", !(await db.select().from(members).where(eq(members.id, brown.id)))[0].isActive);
    r = await runBackfill(db, csv.rows, { dryRun: false, filename: null });
    const brown2 = (await db.select().from(members).where(eq(members.id, brown.id)))[0];
    check(
      "apply reactivates only isActive",
      r.counts.reactivated === 1 && brown2.isActive && brown2.phone === "111" && (await memberCount()) === n + 1,
      brown2
    );
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  unitTests();
  await routeTests();
  await integrationTests();
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll backfill checks passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
