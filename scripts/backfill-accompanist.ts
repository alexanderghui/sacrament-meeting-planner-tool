/**
 * Backfill: pull a pianist/organist out of meeting notes into the new
 * `accompanist` field. Notes are unstructured, so we match two shapes:
 *   "Pianist: Jane Doe" / "Organist - Jane" / "piano: Jane"
 *   "Jane Doe-piano" / "Jane Doe - organ"   (name precedes the instrument)
 * Only the matched fragment is lifted out; the rest of the note is preserved.
 * Only touches meetings whose accompanist is still empty.
 *
 * Dry-run by default; APPLY=1 to write. Run on both local and Neon.
 */
import { and, eq, isNull, or, ilike } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings } from "../src/lib/db/schema";
import { HYMN_TITLES } from "../src/lib/hymns";

const KW = "pianist|organist|accompanist|piano|organ";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// Skip captures that are really a hymn/musical number (e.g. "The First Noel - organ").
const HYMN_TITLE_SET = new Set(Object.values(HYMN_TITLES).map(norm));

function parse(notes: string): { accompanist: string; rest: string | null } | null {
  const parts = notes.split(/;\s*/);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    let name: string | null = null;
    let m = p.match(new RegExp(`^(?:${KW})\\s*[:\\-–]\\s*(.+)$`, "i"));
    if (m) name = m[1].trim();
    if (!name) {
      m = p.match(new RegExp(`^(.+?)\\s*[-–]\\s*(?:${KW})\\b.*$`, "i"));
      if (m) name = m[1].trim();
    }
    if (name && name.length > 1 && /[a-z]/i.test(name) && !HYMN_TITLE_SET.has(norm(name))) {
      const rest = parts.filter((_, j) => j !== i).join("; ").trim();
      return { accompanist: name, rest: rest || null };
    }
  }
  return null;
}

async function main() {
  const apply = process.env.APPLY === "1";
  const db = await getDb();
  const rows = await db
    .select({ id: meetings.id, date: meetings.date, notes: meetings.notes })
    .from(meetings)
    .where(
      and(
        isNull(meetings.accompanist),
        or(ilike(meetings.notes, "%piano%"), ilike(meetings.notes, "%organ%"))
      )
    );

  const plan: string[] = [];
  let n = 0;
  for (const r of rows) {
    if (!r.notes) continue;
    const parsed = parse(r.notes);
    if (!parsed) continue;
    plan.push(`  ${r.date}  accompanist="${parsed.accompanist}"  notes→${parsed.rest ? `"${parsed.rest}"` : "(cleared)"}`);
    n++;
    if (apply) {
      await db
        .update(meetings)
        .set({ accompanist: parsed.accompanist, notes: parsed.rest, updatedAt: new Date() })
        .where(eq(meetings.id, r.id));
    }
  }

  console.log(`${apply ? "APPLIED" : "DRY-RUN"} — ${n} meeting(s):`);
  console.log(plan.sort().join("\n"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
