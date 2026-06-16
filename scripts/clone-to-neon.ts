/**
 * One-shot: copy the verified local PGlite database into hosted Postgres (Neon).
 *
 * Why clone instead of re-running the import pipeline? The local DB is the
 * audited source of truth — real roster + gender/age overrides + the speaker
 * matcher fixes (Clark Morgan etc.). Re-deriving on Neon risks drift. Cloning
 * copies the exact rows, preserving every UUID so all foreign keys line up.
 *
 * Prereqs:
 *   1. DATABASE_URL (Neon) set in the environment.
 *   2. Schema already pushed to Neon:  DATABASE_URL=... npx drizzle-kit push
 *   3. Dev server STOPPED (PGlite is single-writer — see dev-db-caveat memory).
 *
 * Run:  DATABASE_URL='postgres://...' npx tsx scripts/clone-to-neon.ts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (Neon) is required.");
  process.exit(1);
}
if (url.includes("localhost") || url.includes(".pglite")) {
  console.error("Refusing to run: DATABASE_URL must point at Neon, not local.");
  process.exit(1);
}

// Insert parents before children so foreign keys resolve.
const ORDER = [
  ["users", schema.users],
  ["members", schema.members],
  ["hymns", schema.hymns],
  ["meetings", schema.meetings],
  ["assignments", schema.assignments],
  ["rosterImports", schema.rosterImports],
  ["auditLog", schema.auditLog],
] as const;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const src = drizzlePglite(new PGlite("./.pglite"), { schema });
  const tgt = drizzleNeon(neon(url!), { schema });

  // Idempotent: wipe target children-first (reverse of insert order) so a
  // re-run doesn't collide on primary keys.
  for (const [name, table] of [...ORDER].reverse()) {
    await tgt.delete(table as never);
    console.log(`${name}: cleared`);
  }

  for (const [name, table] of ORDER) {
    const rows = await src.select().from(table as never);
    if (!rows.length) {
      console.log(`${name}: 0 rows (skip)`);
      continue;
    }
    // Clear target table first so re-running is idempotent. Children are
    // cleared before parents by reversing the insert order below.
    let inserted = 0;
    for (const batch of chunk(rows, 200)) {
      await tgt.insert(table as never).values(batch as never);
      inserted += batch.length;
    }
    console.log(`${name}: ${inserted} rows copied`);
  }

  console.log("\nClone complete. Neon now mirrors the local database.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
