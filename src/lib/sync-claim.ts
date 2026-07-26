import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { syncClaims } from "./db/schema";

// Take `key` unless someone has already held it within the last `ttlSeconds`,
// and say whether we got it.
//
// It's one statement, so two instances racing on the same key can't both win:
// Postgres locks the conflicting row, and the loser's `DO UPDATE ... WHERE` then
// sees the winner's fresh timestamp, fails its predicate, and updates nothing —
// so `RETURNING` gives back no row. Timestamps come from the database rather
// than from the caller, so clock skew between instances can't widen the window.
export async function claim(key: string, ttlSeconds: number): Promise<boolean> {
  const won = await claimMany([key], ttlSeconds);
  return won.has(key);
}

// The same thing for a batch of keys, in one round trip. Returns just the keys
// we won; the rest are held by someone else.
export async function claimMany(
  keys: string[],
  ttlSeconds: number
): Promise<Set<string>> {
  // A repeated key would make Postgres refuse the whole statement ("cannot
  // affect row a second time"), so collapse them first.
  const unique = [...new Set(keys)];
  if (!unique.length) return new Set();

  const db = await getDb();
  const take = async () => {
    const rows = await db
      .insert(syncClaims)
      .values(unique.map((key) => ({ key })))
      .onConflictDoUpdate({
        target: syncClaims.key,
        set: { claimedAt: sql`now()` },
        setWhere: sql`${syncClaims.claimedAt} < now() - make_interval(secs => ${ttlSeconds})`,
      })
      .returning({ key: syncClaims.key });
    return new Set(rows.map((r) => r.key));
  };

  try {
    return await take();
  } catch (e) {
    if (!isUndefinedTable(e)) throw e;
    // The hosted database predates this project's migration journal — its schema
    // was created with `drizzle-kit push`, which records nothing — so
    // `drizzle-kit migrate` can't be run against it until the journal is
    // baselined. Rather than leave the whole mechanism inert until then, create
    // the table on first use. It is additive, idempotent, and owned entirely by
    // this module (coordination only, never user data). Once the journal is
    // baselined and migration 0014 is recorded, this branch stops being reached
    // and can be deleted.
    await ensureTable();
    return await take();
  }
}

// Matches migration 0014. Kept in sync by hand, which is tolerable only because
// the table is two columns and this is a stopgap.
async function ensureTable(): Promise<void> {
  const db = await getDb();
  try {
    await db.execute(sql`
      create table if not exists "sync_claims" (
        "key" text primary key not null,
        "claimed_at" timestamp with time zone default now() not null
      )
    `);
  } catch (e) {
    // Two instances running this at once can collide in the system catalogue
    // even with IF NOT EXISTS. Either way the table exists afterwards, so let
    // the retry decide whether it really worked.
    console.warn("sync-claim: create table raced or failed", e);
  }
}

// Postgres 42P01, "undefined_table". Drizzle wraps the driver error, so look
// down the cause chain rather than at the top-level object.
function isUndefinedTable(e: unknown): boolean {
  for (let cur = e, depth = 0; cur && depth < 5; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (code === "42P01") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return /relation .*sync_claims.* does not exist/i.test(
    e instanceof Error ? e.message : String(e)
  );
}
