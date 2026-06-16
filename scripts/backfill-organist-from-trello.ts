/**
 * Re-parse the organist/pianist from the RAW Trello card descriptions and
 * backfill meetings.accompanist. The original extract only matched the label
 * "Organ:" and missed "Organist:" / "**Organist**:" — so ~170 cards' organist
 * data was dropped. This recovers it.
 *
 * Date resolution: join raw cards (private/trello_archived.json, by `name`) to
 * the already-parsed private/trello.json (which has both `cardName` and `date`).
 *
 * Dry-run by default; APPLY=1 to write. Run on both local and Neon.
 */
import { readFileSync } from "fs";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { meetings } from "../src/lib/db/schema";

type Raw = { name?: string; desc?: string };
type Parsed = { cardName?: string; date?: string };

// The ward has two regular organists; collapse first-name-only / casing variants.
function normalizeOrganist(v: string): string {
  const n = v.toLowerCase();
  if (n === "craig" || n === "craig pew") return "Craig Pew";
  if (n === "nancy" || n === "nancy mcpherson") return "Nancy McPherson";
  return v;
}

function organistOf(desc: string): string | null {
  for (const rawLine of desc.split("\n")) {
    const line = rawLine.replace(/\*/g, "").trim(); // drop markdown bold
    const m = line.match(/^organ(?:ist)?\s*:\s*(.+)$/i);
    if (m) {
      const v = m[1].replace(/\s+/g, " ").trim();
      if (v && v !== "?" && /[a-z]/i.test(v)) return normalizeOrganist(v);
      return null; // "Organist:" present but blank → no data
    }
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const apply = process.env.APPLY === "1";
  const db = await getDb();
  const raw: Raw[] = JSON.parse(readFileSync("private/trello_archived.json", "utf8"));
  const parsed: Parsed[] = JSON.parse(readFileSync("private/trello.json", "utf8"));

  // name → date from the parsed cards (dates already resolved/snapped to Sunday)
  const dateByName = new Map<string, string>();
  for (const c of parsed) if (c.cardName && c.date) dateByName.set(norm(c.cardName), c.date);

  const byDate = new Map<string, string>(); // date → organist
  let unmatched = 0;
  for (const c of raw) {
    if (!c.name || !c.desc) continue;
    const organist = organistOf(c.desc);
    if (!organist) continue;
    const date = dateByName.get(norm(c.name));
    if (!date) { unmatched++; continue; }
    byDate.set(date, organist); // last wins; de-duped cards are rare
  }

  let updated = 0;
  const plan: string[] = [];
  for (const [date, organist] of byDate) {
    const [m] = await db.select({ id: meetings.id, acc: meetings.accompanist })
      .from(meetings).where(eq(meetings.date, date));
    if (!m) continue;
    if (m.acc === organist) continue; // already correct
    plan.push(`  ${date}  ${m.acc ? `"${m.acc}" → ` : ""}"${organist}"`);
    updated++;
    if (apply) {
      await db.update(meetings).set({ accompanist: organist, updatedAt: new Date() })
        .where(eq(meetings.id, m.id));
    }
  }

  console.log(`${apply ? "APPLIED" : "DRY-RUN"} — organist parsed for ${byDate.size} dates; ${updated} meeting(s) to set; ${unmatched} raw cards had no date match.`);
  console.log(plan.sort().join("\n"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
