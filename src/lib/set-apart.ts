import { getDb } from "./db";
import { meetings } from "./db/schema";
import { claimMany } from "./sync-claim";

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
  // Keyed by entry id so one sustaining can never yield two items: a roster row
  // copied between meetings keeps its id, and two items sharing an id would make
  // the Trello plan below emit two creates for the same person.
  const byEntry = new Map<string, SetApartItem>();
  for (const m of rows) {
    if (m.date > today) continue; // sustaining hasn't happened yet
    for (const s of m.sustained ?? []) {
      if (!s || !s.id || !s.name?.trim()) continue;
      const item: SetApartItem = {
        meetingId: m.id,
        meetingDate: m.date,
        entryId: s.id,
        name: s.name.trim(),
        calling: (s.calling ?? "").trim(),
        setApartOn: s.setApartOn ?? null,
        setApartBy: s.setApartBy ?? null,
      };
      const prev = byEntry.get(s.id);
      byEntry.set(s.id, prev ? preferredEntry(prev, item) : item);
    }
  }
  return [...byEntry.values()];
}

// Two occurrences of one entry id is a data anomaly. Prefer the one that records
// the ordinance, then the earliest sustaining — so a stray copy can't reopen a
// set-apart that already happened.
function preferredEntry(a: SetApartItem, b: SetApartItem): SetApartItem {
  if (!!a.setApartOn !== !!b.setApartOn) return a.setApartOn ? a : b;
  return a.meetingDate <= b.meetingDate ? a : b;
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
  // Every card carrying the same Ref is the same person. Duplicates get minted
  // when two sync runs each plan a create from a snapshot taken before the
  // other's card landed, so keep one canonical card per ref and archive the
  // extras. Silently matching just the first one (what this used to do) left the
  // rest invisible to every later run, so they piled up on the board for good.
  const groups = new Map<string, ExistingCard[]>();
  for (const c of cards) {
    const ref = parseRef(c.desc);
    if (!ref) continue;
    const group = groups.get(ref);
    if (group) group.push(c);
    else groups.set(ref, [c]);
  }

  const byRef = new Map<string, ExistingCard>();
  const redundant: ExistingCard[] = [];
  for (const [ref, group] of groups) {
    // A Trello id opens with its creation timestamp, so id order is age order.
    // Keep the oldest card that's still open — picking a closed twin would
    // unarchive it while archiving the one already on the board.
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const keep = sorted.find((c) => !c.closed) ?? sorted[0];
    byRef.set(ref, keep);
    for (const c of sorted) if (c !== keep && !c.closed) redundant.push(c);
  }

  const itemRefs = new Set(items.map((i) => i.entryId));
  const ops: SetApartCardOp[] = [];

  // getSetAparts already collapses repeated entry ids, but hold the invariant
  // here too: this is the function that mints cards, and one entry must never
  // get two of them.
  const planned = new Set<string>();
  for (const it of items) {
    if (planned.has(it.entryId)) continue;
    planned.add(it.entryId);
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
  for (const [ref, card] of byRef) {
    if (!itemRefs.has(ref) && !card.closed)
      ops.push({ action: "archive", cardId: card.id, desc: card.desc ?? "" });
  }
  // Extra copies of a person who already has a canonical card. Keeping their
  // existing body means archiving a duplicate never rewrites anything.
  for (const c of redundant)
    ops.push({ action: "archive", cardId: c.id, desc: c.desc ?? "" });
  return ops;
}

// How long a planned create counts as in flight. A run applies its ops within
// seconds of asking for them, so this only has to cover the window in which a
// second, overlapping run could ask for the same card again. If a run dies after
// claiming but before creating, the claim lapses and the next run makes the card.
const CREATE_CLAIM_SECONDS = 600;

export async function buildSetApartPlanFromDb(
  cards: ExistingCard[]
): Promise<SetApartCardOp[]> {
  const items = await getSetAparts();
  const ops = planSetApartCards(items, cards);

  // Two runs that both read the board before either wrote to it will both plan
  // the same create. Whichever claims the entry first is the only one told to
  // make the card; the other is handed a plan without it. Throttling the fire
  // makes overlap unlikely, but it can't rule it out — the daily scheduled run
  // can always land on top of a fired one — so the guarantee belongs here.
  const creates = ops.filter((o) => o.action === "create");
  if (!creates.length) return ops;
  const key = (ref: string) => `setapart-card:${ref}`;
  let won: Set<string>;
  try {
    won = await claimMany(
      creates.map((o) => key(o.ref)),
      CREATE_CLAIM_SECONDS
    );
  } catch (e) {
    // Deploys land before migrations run, so the claim table may not exist yet.
    // Serve the plan ungated rather than failing the sync outright: the worst
    // case is the duplicate this used to produce, which planSetApartCards now
    // archives on the next run.
    console.warn("set-apart: create claims unavailable, planning ungated", e);
    return ops;
  }
  return ops.filter((o) => o.action !== "create" || won.has(key(o.ref)));
}
