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
}
