import { getDb } from "./db";
import { meetings } from "./db/schema";

// One sustaining flattened out of a meeting's `sustained` list for the
// set-apart tracker. `meetingDate` is when they were sustained (the "called
// on" date). `setApartOn` null ⇒ still needs the ordinance.
export type SetApartItem = {
  meetingId: string;
  meetingDate: string;
  entryId: string;
  name: string;
  calling: string;
  setApartOn: string | null;
  setApartBy: string | null;
};

// "Today" in the ward's timezone (America/Denver), as YYYY-MM-DD. Computed here
// rather than with the UTC-based todayIso() so a sustaining doesn't flip to
// "should be set apart" a few hours early near midnight.
function wardToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
  }).format(new Date());
}

// Gather every sustaining across all meetings. The meetings table is small and
// we pull only three columns, so this stays cheap. Entries without a stable id
// (legacy, pre-backfill) are skipped since they can't be acted on yet.
//
// A person is only pending set-apart once they've actually been sustained, so
// we skip meetings whose date is still in the future — someone put on a coming
// Sunday's program shouldn't appear here (or on the Trello board) until that
// Sunday has arrived.
export async function getSetAparts(): Promise<SetApartItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: meetings.id,
      date: meetings.date,
      sustained: meetings.sustained,
    })
    .from(meetings);

  const today = wardToday();
  const out: SetApartItem[] = [];
  for (const m of rows) {
    if (m.date > today) continue; // sustaining hasn't happened yet
    for (const s of m.sustained ?? []) {
      if (!s || !s.id || !s.name?.trim()) continue;
      out.push({
        meetingId: m.id,
        meetingDate: m.date,
        entryId: s.id,
        name: s.name.trim(),
        calling: (s.calling ?? "").trim(),
        setApartOn: s.setApartOn ?? null,
        setApartBy: s.setApartBy ?? null,
      });
    }
  }
  return out;
}

/* ----------------------- Trello card reconcile ------------------------ */

// The "To Be Set Apart" list on the Bishopric board (overridable by env).
export const SETAPART_LIST_ID =
  process.env.TRELLO_SETAPART_LIST_ID || "6a4b3dd618b474cb17956b6a";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : iso;
}

function cardTitle(it: SetApartItem): string {
  return it.calling ? `${it.name} - ${it.calling}` : it.name;
}

// The entry id lives in the card body as a "Ref:" line so cards can be matched
// back to people even if a name or calling is edited.
function cardDesc(it: SetApartItem): string {
  const lines = [`Sustained ${prettyDate(it.meetingDate)}`];
  if (it.setApartOn) lines.push(`Set apart ${prettyDate(it.setApartOn)}`);
  lines.push("", `Ref: ${it.entryId}`);
  return lines.join("\n");
}

function parseRef(desc: string | null | undefined): string | null {
  const m = (desc || "").match(/Ref:\s*([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

type ExistingCard = {
  id: string;
  name: string;
  desc?: string | null;
  closed?: boolean;
};

// One decision per card. The daily routine applies these via its connector:
// create → add card; update → set name/desc; archive → set closed=true (after
// stamping the set-apart date); unarchive → set closed=false (an undo).
export type SetApartCardOp =
  | { action: "create"; ref: string; title: string; desc: string }
  | { action: "update"; cardId: string; title: string; desc: string }
  | { action: "archive"; cardId: string; desc: string }
  | { action: "unarchive"; cardId: string; title: string; desc: string };

export function planSetApartCards(
  items: SetApartItem[],
  cards: ExistingCard[]
): SetApartCardOp[] {
  const byRef = new Map<string, ExistingCard>();
  for (const c of cards) {
    const ref = parseRef(c.desc);
    if (ref && !byRef.has(ref)) byRef.set(ref, c);
  }
  const itemRefs = new Set(items.map((i) => i.entryId));
  const ops: SetApartCardOp[] = [];

  for (const it of items) {
    const title = cardTitle(it);
    const desc = cardDesc(it);
    const card = byRef.get(it.entryId);
    const wantOpen = !it.setApartOn; // pending → open card; done → archived

    if (!card) {
      if (wantOpen) ops.push({ action: "create", ref: it.entryId, title, desc });
      continue; // done + never carded → nothing to do
    }
    if (wantOpen) {
      if (card.closed) ops.push({ action: "unarchive", cardId: card.id, title, desc });
      else if (card.name !== title || (card.desc ?? "").trim() !== desc)
        ops.push({ action: "update", cardId: card.id, title, desc });
    } else if (!card.closed) {
      ops.push({ action: "archive", cardId: card.id, desc });
    }
  }

  // A card whose person no longer exists (sustaining deleted) → archive it.
  for (const c of cards) {
    const ref = parseRef(c.desc);
    if (ref && !itemRefs.has(ref) && !c.closed)
      ops.push({ action: "archive", cardId: c.id, desc: c.desc ?? "" });
  }
  return ops;
}

export async function buildSetApartPlanFromDb(
  cards: ExistingCard[]
): Promise<SetApartCardOp[]> {
  const items = await getSetAparts();
  return planSetApartCards(items, cards);
}
