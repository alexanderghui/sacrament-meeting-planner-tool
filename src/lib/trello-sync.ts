// Sync upcoming sacrament-meeting plans into the Bishopric Trello board's
// "Sacrament Meetings" list. Idempotent: for each upcoming Sunday it finds the
// card by its M/D date prefix and updates it, or creates one if missing. Driven
// by a Vercel cron (see /api/trello-sync) so it runs on its own.
import { getUpcomingMeetings, isoDate, type PlannerMeeting } from "./meetings";
import { buildProgram } from "./agenda";
import { HYMN_TITLES } from "./hymns";

const API = "https://api.trello.com/1";
// The "Sacrament Meetings" list on the Bishopric board (overridable by env).
const LIST_ID =
  process.env.TRELLO_SACRAMENT_LIST_ID || "615de047a3a05651c92b9d70";

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

// "2026-06-28" → "6/28"
function mdOf(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

// Leading "M/D" of a card title, normalized (no leading zeros), or null.
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

// "6/28 - Member One, Member Two, Member Three", or the meeting-type
// label when there are no speakers (fast Sunday, primary program, etc.).
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

// The card body, matching the board's historical sacrament-meeting cards.
function cardDesc(m: PlannerMeeting): string {
  const ann = m.announcements;
  return [
    `Presiding: ${m.presiding ?? ""}`,
    `Conducting: ${m.conducting ?? ""}`,
    `Organ: ${m.accompanist ?? ""}`,
    `Chorister: ${m.chorister ?? ""}`,
    ``,
    `Announcements:`,
    ...(ann.length ? ann.map((a, i) => `${i + 1}. ${a}`) : []),
    ``,
    `Opening Hymn: ${hymnLine(m.openingHymn)}`,
    `Opening Prayer: ${m.openingPrayer?.name ?? ""}`,
    ``,
    `Ward Business:${m.wardBusinessNote ? " " + m.wardBusinessNote : ""}`,
    `Stake Business:${m.stakeBusiness ? " " + m.stakeBusiness : ""}`,
    ``,
    `Sacrament Hymn: ${hymnLine(m.sacramentHymn)}`,
    ``,
    `Sacrament`,
    ``,
    ...programLines(m),
    ``,
    `Closing Hymn: ${hymnLine(m.closingHymn)}`,
    ``,
    `Closing Prayer: ${m.closingPrayer?.name ?? ""}`,
  ].join("\n");
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

// Render what each upcoming card would become — no Trello calls. For previews.
export async function previewUpcomingCards(): Promise<
  { date: string; name: string; desc: string }[]
> {
  const meetings = await getUpcomingMeetings();
  return targets(meetings).map((m) => ({
    date: m.date,
    name: cardName(m),
    desc: cardDesc(m),
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
    const desc = cardDesc(m);
    const existing = byMd.get(md);
    if (existing) {
      // Update the title only when we have real speakers or a special meeting
      // type — never downgrade a deliberately-named card to a generic one.
      const name =
        speakerNames(m).length > 0 || isSpecial(m) ? cardName(m) : existing.name;
      if (existing.desc !== desc || existing.name !== name) {
        await trello(`/cards/${existing.id}`, { name, desc }, "PUT");
        res.updated++;
        res.details.push(`updated ${md}`);
      } else {
        res.unchanged++;
      }
    } else {
      await trello(
        `/cards`,
        { idList: LIST_ID, name: cardName(m), desc, pos: "bottom" },
        "POST"
      );
      res.created++;
      res.details.push(`created ${md}`);
    }
  }
  return res;
}
