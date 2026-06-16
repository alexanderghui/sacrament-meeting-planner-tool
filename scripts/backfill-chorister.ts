/**
 * Backfill: lift "Chorister: <Name>" out of meeting notes into the new
 * `chorister` field, and strip that segment from notes. Only touches meetings
 * whose chorister field is still empty (never overwrites a set value).
 *
 * Dry-run by default; APPLY=1 to write. DB-agnostic (env-driven) — run on both
 * local PGlite and Neon so they stay identical.
 *   preview:  DATABASE_URL=… npx tsx scripts/backfill-chorister.ts
 *   apply:    APPLY=1 DATABASE_URL=… npx tsx scripts/backfill-chorister.ts
 */
import { and, eq, ilike, isNull } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings } from "../src/lib/db/schema";

function parse(notes: string): { chorister: string; rest: string | null } | null {
  const parts = notes.split(/;\s*/);
  const idx = parts.findIndex((p) => /^chorister\s*:/i.test(p.trim()));
  if (idx === -1) return null;
  const chorister = parts[idx].replace(/^chorister\s*:\s*/i, "").trim();
  if (!chorister) return null;
  const rest = parts.filter((_, i) => i !== idx).join("; ").trim();
  return { chorister, rest: rest || null };
}

async function main() {
  const apply = process.env.APPLY === "1";
  const db = await getDb();
  const rows = await db
    .select({ id: meetings.id, date: meetings.date, notes: meetings.notes })
    .from(meetings)
    .where(and(ilike(meetings.notes, "%chorister%"), isNull(meetings.chorister)));

  const plan: string[] = [];
  let n = 0;
  for (const r of rows) {
    if (!r.notes) continue;
    const parsed = parse(r.notes);
    if (!parsed) continue;
    plan.push(`  ${r.date}  chorister="${parsed.chorister}"  notes→${parsed.rest ? `"${parsed.rest}"` : "(cleared)"}`);
    n++;
    if (apply) {
      await db
        .update(meetings)
        .set({ chorister: parsed.chorister, notes: parsed.rest, updatedAt: new Date() })
        .where(eq(meetings.id, r.id));
    }
  }

  console.log(`${apply ? "APPLIED" : "DRY-RUN"} — ${n} meeting(s):`);
  console.log(plan.sort().join("\n"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
