// Sync upcoming sacrament-meeting plans into the Bishopric Trello board's
// "Sacrament Meetings" list. Idempotent and "never-erase": for each upcoming
// Sunday it finds the card by its M/D date prefix and merges the planner's
// details in WITHOUT deleting anything a human added. Driven by a Vercel cron
// (see /api/trello-sync) so it runs on its own.
//
// Merge rules (so the bishop's edits are never lost):
//  - Structured fields: write the planner's value when it has one; if the
//    planner is blank for a field, KEEP whatever is already on the card.
//  - Free-form notes (anything not part of the template) are preserved in a
//    "Notes (kept)" section at the bottom and never touched.
//  - The only case a human value is replaced: the bishop edits a field the
//    planner ALSO has a value for — the planner (source of truth) wins there.
import { getUpcomingMeetings, type PlannerMeeting } from "./meetings";
import { buildProgram } from "./agenda";
import { HYMN_TITLES } from "./hymns";

const API = "https://api.trello.com/1";
// The "Sacrament Meetings" list on the Bishopric board (overridable by env).
const LIST_ID =
  process.env.TRELLO_SACRAMENT_LIST_ID || "615de047a3a05651c92b9d70";

const NOTES_MARKER = "──────── Notes (kept) ────────";

type TrelloCard = { id: string; name: string; desc: string; closed: boolean };

function creds() {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token)
    throw new Error("TRELLO_API_KEY / TRELLO_TOKEN are not configured");
  return { key, token };
}

async function trello(
  path: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" | "PUT" = "GET"
) {
  const { key, token } = creds();
  const url = new URL(`${API}${path}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Trello ${method} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/* ------------------------------ rendering ------------------------------ */

const TYPE_LABEL: Record<string, string> = {
  sacrament: "Sacrament Meeting",
  fast_and_testimony: "Fast & Testimony",
  ward_conference: "Ward Conference",
  stake_conference: "Stake Conference",
  general_conference: "General Conference",
  primary_program: "Primary Program",
  easter_program: "Easter Program",
  christmas_program: "Christmas Program",
  no_meeting: "No Meeting",
};

function mdOf(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

function leadingMd(name: string): string | null {
  const m = name.match(/^\s*(\d{1,2})\/(\d{1,2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : null;
}

function program(m: PlannerMeeting) {
  return buildProgram({
    type: m.type,
    speakers: m.speakers,
    intermediateHymn: m.intermediateHymn,
    musicalNumbers: m.musicalNumbers,
    programBody: m.programBody,
    hymnFallback: HYMN_TITLES,
  });
}

function speakerNames(m: PlannerMeeting): string[] {
  const names: string[] = [];
  for (const it of program(m)) if (it.kind === "speaker") names.push(it.name);
  return names;
}

const isSpecial = (m: PlannerMeeting) => m.type !== "sacrament";

function cardName(m: PlannerMeeting): string {
  const md = mdOf(m.date);
  const names = speakerNames(m);
  if (names.length) return `${md} - ${names.join(", ")}`;
  return `${md} - ${TYPE_LABEL[m.type] ?? "Sacrament Meeting"}`;
}

function hymnLine(n: number | null): string {
  if (n == null) return "";
  const t = HYMN_TITLES[n];
  return t ? `#${n} - ${t}` : `#${n}`;
}

function programLines(m: PlannerMeeting): string[] {
  const lines: string[] = [];
  for (const it of program(m)) {
    if (it.kind === "speaker") lines.push(`Speaker ${it.position}: ${it.name}`);
    else if (it.kind === "musicalNumber") lines.push(`Musical Number: ${it.text}`);
    else if (it.kind === "intermediateHymn")
      lines.push(`Intermediate Hymn: ${it.text.replace(" – ", " - ")}`);
    else if (it.kind === "testimony") lines.push("Bearing of Testimonies");
    else if (it.kind === "primaryProgram") lines.push("Primary Program");
  }
  return lines;
}

/* --------------------------- parse + merge ----------------------------- */

const SINGLE_FIELDS = [
  "Presiding",
  "Conducting",
  "Organ",
  "Chorister",
  "Opening Hymn",
  "Opening Prayer",
  "Ward Business",
  "Stake Business",
  "Sacrament Hymn",
  "Closing Hymn",
  "Closing Prayer",
];

type Parsed = {
  fields: Record<string, string>;
  announcements: string[];
  program: string[];
  notes: string[];
};

// Read an existing card body back into its parts so we can merge without
// destroying anything a human added.
function parseCard(desc: string): Parsed {
  const fields: Record<string, string> = {};
  const announcements: string[] = [];
  const programLs: string[] = [];
  const notes: string[] = [];
  let section: "top" | "announcements" | "program" = "top";
  let inNotes = false;
  for (const raw of (desc || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (inNotes) {
      if (line.trim()) notes.push(line);
      continue;
    }
    if (/^[─-]{3,}.*Notes/i.test(line)) {
      inNotes = true;
      continue;
    }
    if (!line.trim()) continue;
    const fm = line.match(/^([A-Za-z][A-Za-z ]*?):\s?(.*)$/);
    if (fm && SINGLE_FIELDS.includes(fm[1])) {
      fields[fm[1]] = fm[2].trim();
      section = "top";
      continue;
    }
    if (/^Announcements:/i.test(line)) {
      section = "announcements";
      const v = line.replace(/^Announcements:\s?/i, "").trim();
      if (v) announcements.push(v);
      continue;
    }
    if (/^Sacrament$/i.test(line)) {
      section = "program";
      continue;
    }
    if (section === "announcements") {
      announcements.push(line.replace(/^\d+\.\s*/, ""));
      continue;
    }
    if (section === "program") {
      if (
        /^(Speaker \d+:|.*Musical Number|Intermediate Hymn:|Bearing of Testimonies|Primary Program)/i.test(
          line
        )
      )
        programLs.push(line);
      else notes.push(line); // free note that landed in the program area
      continue;
    }
    notes.push(line); // unrecognized top-level line → free note
  }
  return { fields, announcements, program: programLs, notes };
}

// Build the card body, merging planner data over an existing card (or null when
// creating). Planner value wins when present; otherwise the card's existing
// value is kept; free notes are always preserved.
function cardDesc(m: PlannerMeeting, existing: Parsed | null): string {
  const keep = (label: string, plannerVal: string | null | undefined) =>
    (plannerVal ?? "").trim() || existing?.fields[label] || "";

  const ann = m.announcements.length ? m.announcements : existing?.announcements ?? [];
  const planned = programLines(m);
  const prog = planned.length ? planned : existing?.program ?? [];
  const notes = existing?.notes ?? [];

  const out = [
    `Presiding: ${keep("Presiding", m.presiding)}`,
    `Conducting: ${keep("Conducting", m.conducting)}`,
    `Organ: ${keep("Organ", m.accompanist)}`,
    `Chorister: ${keep("Chorister", m.chorister)}`,
    ``,
    `Announcements:`,
    ...ann.map((a, i) => `${i + 1}. ${a}`),
    ``,
    `Opening Hymn: ${keep("Opening Hymn", hymnLine(m.openingHymn))}`,
    `Opening Prayer: ${keep("Opening Prayer", m.openingPrayer?.name)}`,
    ``,
    `Ward Business: ${keep("Ward Business", m.wardBusinessNote)}`,
    `Stake Business: ${keep("Stake Business", m.stakeBusiness)}`,
    ``,
    `Sacrament Hymn: ${keep("Sacrament Hymn", hymnLine(m.sacramentHymn))}`,
    ``,
    `Sacrament`,
    ``,
    ...prog,
    ``,
    `Closing Hymn: ${keep("Closing Hymn", hymnLine(m.closingHymn))}`,
    ``,
    `Closing Prayer: ${keep("Closing Prayer", m.closingPrayer?.name)}`,
  ];
  if (notes.length) out.push(``, NOTES_MARKER, ...notes);
  return out
    .join("\n")
    .replace(/[ \t]+$/gm, "") // tidy trailing spaces
    .trimEnd();
}

// Skip meetings nobody has touched yet — don't create empty placeholder cards.
function hasContent(m: PlannerMeeting): boolean {
  return !!(
    isSpecial(m) ||
    m.presiding ||
    m.conducting ||
    m.chorister ||
    m.accompanist ||
    m.openingHymn ||
    m.sacramentHymn ||
    m.closingHymn ||
    m.intermediateHymn ||
    m.openingPrayer ||
    m.closingPrayer ||
    m.speakers.some((s) => s.name) ||
    m.musicalNumbers.length ||
    m.announcements.length
  );
}

/* ------------------------------- sync ---------------------------------- */

function targets(meetings: PlannerMeeting[]): PlannerMeeting[] {
  // Every upcoming Sunday the tool knows about — no date horizon — as long as
  // it has real content or is a special meeting. Bare, untouched future
  // Sundays are skipped so the board doesn't fill with empty placeholder cards.
  return meetings.filter((m) => hasContent(m));
}

// Render what each upcoming card would become for a fresh card — no Trello
// calls, no merge. For previews.
export async function previewUpcomingCards(): Promise<
  { date: string; name: string; desc: string }[]
> {
  const meetings = await getUpcomingMeetings();
  return targets(meetings).map((m) => ({
    date: m.date,
    name: cardName(m),
    desc: cardDesc(m, null),
  }));
}

export type SyncResult = {
  created: number;
  updated: number;
  unchanged: number;
  details: string[];
};

// One decision per upcoming meeting. The merge math lives entirely here so it
// can run with NO Trello access: the caller (the API route the cloud routine
// hits) passes in the cards it already read, and gets back the exact card body
// to write. That keeps the never-erase guarantee in tested code, not in a
// routine's prose.
export type SyncOp =
  | { action: "create"; md: string; name: string; desc: string }
  | { action: "update"; md: string; id: string; name: string; desc: string }
  | { action: "none"; md: string };

type ExistingCard = { id: string; name: string; desc?: string | null };

// Pure planner: given the upcoming meetings and the cards currently in the
// list, decide what to create / update / leave alone. No network calls.
export function planSync(
  meetings: PlannerMeeting[],
  existingCards: ExistingCard[]
): SyncOp[] {
  const byMd = new Map<string, ExistingCard>();
  for (const c of existingCards) {
    const md = leadingMd(c.name);
    if (md && !byMd.has(md)) byMd.set(md, c);
  }

  const ops: SyncOp[] = [];
  for (const m of targets(meetings)) {
    const md = mdOf(m.date);
    const existing = byMd.get(md);
    if (existing) {
      const prev = existing.desc ?? "";
      const desc = cardDesc(m, parseCard(prev));
      // Update the title only when we have real speakers or a special meeting
      // type — never downgrade a deliberately-named card to a generic one.
      const name =
        speakerNames(m).length > 0 || isSpecial(m) ? cardName(m) : existing.name;
      if (prev.trimEnd() !== desc || existing.name !== name) {
        ops.push({ action: "update", md, id: existing.id, name, desc });
      } else {
        ops.push({ action: "none", md });
      }
    } else {
      ops.push({
        action: "create",
        md,
        name: cardName(m),
        desc: cardDesc(m, null),
      });
    }
  }
  return ops;
}

/* --------------------- smart (judgment) planning ----------------------- */

// The planner's known values for one meeting, blanks omitted. "Omitted" is the
// signal the routine relies on: if a field isn't here, the planner has nothing
// to say about it, so the card's existing value must be left alone.
function plannerFields(m: PlannerMeeting): Record<string, string> {
  const f: Record<string, string> = {};
  const set = (k: string, v: string | null | undefined) => {
    const t = (v ?? "").trim();
    if (t) f[k] = t;
  };
  set("Presiding", m.presiding);
  set("Conducting", m.conducting);
  set("Organ", m.accompanist);
  set("Chorister", m.chorister);
  set("Opening Hymn", hymnLine(m.openingHymn));
  set("Opening Prayer", m.openingPrayer?.name);
  set("Ward Business", m.wardBusinessNote);
  set("Stake Business", m.stakeBusiness);
  set("Sacrament Hymn", hymnLine(m.sacramentHymn));
  set("Closing Hymn", hymnLine(m.closingHymn));
  set("Closing Prayer", m.closingPrayer?.name);
  return f;
}

// One upcoming meeting handed to the daily routine: the planner's ground truth,
// the card it matched (so the routine can see what a human already wrote), and
// a safe baseline (suggestedTitle/Body = the deterministic never-erase merge)
// the routine can apply as-is or adapt with judgment.
export type SmartItem = {
  md: string;
  date: string;
  type: string;
  matchedCardId: string | null;
  currentTitle: string | null;
  currentBody: string | null;
  suggestedTitle: string;
  suggestedBody: string;
  planner: {
    fields: Record<string, string>;
    announcements: string[];
    program: string[];
  };
};

export async function buildSmartPlanFromDb(
  existingCards: ExistingCard[]
): Promise<SmartItem[]> {
  const meetings = await getUpcomingMeetings();
  const byMd = new Map<string, ExistingCard>();
  for (const c of existingCards) {
    const md = leadingMd(c.name);
    if (md && !byMd.has(md)) byMd.set(md, c);
  }

  const items: SmartItem[] = [];
  for (const m of targets(meetings)) {
    const md = mdOf(m.date);
    const existing = byMd.get(md) ?? null;
    const prev = existing?.desc ?? "";
    const named = speakerNames(m).length > 0 || isSpecial(m);
    items.push({
      md,
      date: m.date,
      type: m.type,
      matchedCardId: existing?.id ?? null,
      currentTitle: existing?.name ?? null,
      currentBody: existing ? prev : null,
      suggestedTitle: named ? cardName(m) : existing?.name ?? cardName(m),
      suggestedBody: cardDesc(m, parseCard(prev)),
      planner: {
        fields: plannerFields(m),
        announcements: m.announcements ?? [],
        program: programLines(m),
      },
    });
  }
  return items;
}

// Direct sync path (used when a Trello API key/token IS configured, e.g. the
// Vercel cron). Reads + writes the board itself via the REST API.
export async function syncUpcomingToTrello(): Promise<SyncResult> {
  const meetings = await getUpcomingMeetings();
  const cards: TrelloCard[] = await trello(`/lists/${LIST_ID}/cards`, {
    fields: "id,name,desc,closed",
  });
  const ops = planSync(meetings, cards);

  const res: SyncResult = { created: 0, updated: 0, unchanged: 0, details: [] };
  for (const op of ops) {
    if (op.action === "create") {
      await trello(
        `/cards`,
        { idList: LIST_ID, name: op.name, desc: op.desc, pos: "bottom" },
        "POST"
      );
      res.created++;
      res.details.push(`created ${op.md}`);
    } else if (op.action === "update") {
      await trello(`/cards/${op.id}`, { name: op.name, desc: op.desc }, "PUT");
      res.updated++;
      res.details.push(`updated ${op.md}`);
    } else {
      res.unchanged++;
    }
  }
  return res;
}

export const SACRAMENT_LIST_ID = LIST_ID;
