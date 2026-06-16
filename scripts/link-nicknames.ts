/**
 * Back-fill: re-link existing unmatched guest speaker assignments to members
 * using the hardened matcher (now nickname/prefix-aware, see match.ts). Only
 * touches speaker rows that are currently guests (memberId null) and that now
 * resolve uniquely. Idempotent — re-running links nothing new.
 *
 * Targets whichever DB the env points at:
 *   local PGlite:  (stop dev first)  npx tsx scripts/link-nicknames.ts
 *   Neon:          DATABASE_URL=<pooled> npx tsx scripts/link-nicknames.ts
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { assignments, members } from "../src/lib/db/schema";
import { buildResolver } from "./match";

async function main() {
  const db = await getDb();
  const memberRows = await db
    .select({ id: members.id, fullName: members.fullName, preferredName: members.preferredName })
    .from(members);
  const resolve = buildResolver(memberRows);
  const nameById = new Map(memberRows.map((m) => [m.id, m.fullName]));

  const guests = await db
    .select({
      id: assignments.id,
      guestName: assignments.guestName,
    })
    .from(assignments)
    .where(
      and(
        eq(assignments.role, "speaker"),
        isNull(assignments.memberId),
        isNotNull(assignments.guestName)
      )
    );

  const summary = new Map<string, number>();
  let linked = 0;
  for (const g of guests) {
    if (!g.guestName) continue;
    const memberId = resolve(g.guestName);
    if (!memberId) continue;
    await db
      .update(assignments)
      .set({ memberId, guestName: null })
      .where(eq(assignments.id, g.id));
    const key = `"${g.guestName}" -> ${nameById.get(memberId)}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
    linked++;
  }

  console.log(`Linked ${linked} assignment(s) across ${summary.size} name(s):`);
  for (const [k, n] of [...summary].sort())
    console.log(`  ${k}${n > 1 ? `  (×${n})` : ""}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
