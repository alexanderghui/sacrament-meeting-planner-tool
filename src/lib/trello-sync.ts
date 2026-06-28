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
import { getUpcomingMeetings, isoDate, type PlannerMeeting } from "./meetings";
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
  const weeks = Number(process.env.TRELLO_SYNC_WEEKS || "6");
  const h = new Date();
  h.setDate(h.getDate() + weeks * 7);
  const horizon = isoDate(h);
  return meetings.filter((m) => m.date <= horizon && hasContent(m));
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

export async function syncUpcomingToTrello(): Promise<SyncResult> {
  const meetings = await getUpcomingMeetings();
  const list = targets(meetings);

  const cards: TrelloCard[] = await trello(`/lists/${LIST_ID}/cards`, {
    fields: "id,name,desc,closed",
  });
  const byMd = new Map<string, TrelloCard>();
  for (const c of cards) {
    const md = leadingMd(c.name);
    if (md && !byMd.has(md)) byMd.set(md, c);
  }

  const res: SyncResult = { created: 0, updated: 0, unchanged: 0, details: [] };
  for (const m of list) {
    const md = mdOf(m.date);
    const existing = byMd.get(md);
    if (existing) {
      const desc = cardDesc(m, parseCard(existing.desc));
      // Update the title only when we have real speakers or a special meeting
      // type — never downgrade a deliberately-named card to a generic one.
      const name =
        speakerNames(m).length > 0 || isSpecial(m) ? cardName(m) : existing.name;
      if (existing.desc.trimEnd() !== desc || existing.name !== name) {
        await trello(`/cards/${existing.id}`, { name, desc }, "PUT");
        res.updated++;
        res.details.push(`updated ${md}`);
      } else {
        res.unchanged++;
      }
    } else {
      await trello(
        `/cards`,
        { idList: LIST_ID, name: cardName(m), desc: cardDesc(m, null), pos: "bottom" },
        "POST"
      );
      res.created++;
      res.details.push(`created ${md}`);
    }
  }
  return res;
}
