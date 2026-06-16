// Shared speaker→member matcher. Single source of truth so the schedule and
// Trello importers (and the nickname back-fill) can never drift apart.
//
// Rule: a speaker name links to a member only when EXACTLY ONE ward member with
// the same last name has a compatible first name. "Compatible" means any of:
//   1. exact first name
//   2. ≤1-character typo (e.g. Torin↔Torrin)
//   3. nickname/shortening (Alex↔Alexander, Mike↔Michael, Deb↔Debra)
// Uniqueness within the surname is what keeps this safe: if two same-surname
// members both look compatible, we link NEITHER and keep the name as a guest.
// Under-crediting (name stays a guest) is recoverable; mis-crediting is a bug.

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2; // we only care about ≤1
  const d = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return d[a.length][b.length];
}

// Phonetic nicknames that aren't a prefix of the formal name (those are handled
// generically below). Keyed by nickname → possible formal names. Checked both
// directions, so the roster can store either form.
const NICKNAMES: Record<string, string[]> = {
  mike: ["michael"], dave: ["david"], tom: ["thomas"], bob: ["robert"],
  bill: ["william"], jim: ["james"], jimmy: ["james"], jack: ["john"],
  rick: ["richard"], dick: ["richard"], steve: ["steven", "stephen"],
  joe: ["joseph"], tony: ["anthony"], ed: ["edward"], ted: ["edward", "theodore"],
  nate: ["nathan", "nathaniel"], hank: ["henry"], chuck: ["charles"],
  charlie: ["charles"], drew: ["andrew"], andy: ["andrew"], nick: ["nicholas"],
  greg: ["gregory"], jeff: ["jeffrey"], ron: ["ronald"], don: ["donald"],
  ken: ["kenneth"], larry: ["lawrence"], fred: ["frederick"],
  peggy: ["margaret"], sally: ["sarah"], becky: ["rebecca"], betsy: ["elizabeth"],
  liz: ["elizabeth"], beth: ["elizabeth"], kate: ["katherine", "kathryn"],
  katie: ["katherine"], cathy: ["catherine"], patty: ["patricia"],
  trish: ["patricia"], sandy: ["sandra"], connie: ["constance"],
  ginny: ["virginia"], jake: ["jacob"], margie: ["marjorie", "margaret"],
  gabe: ["gabriel"], will: ["william"], ben: ["benjamin"], dan: ["daniel"],
};

function nicknameMatch(a: string, b: string): boolean {
  return (NICKNAMES[a] || []).includes(b) || (NICKNAMES[b] || []).includes(a);
}

// One first name is a prefix of the other (≥3 chars), e.g. Alex→Alexander,
// Deb→Debra, Matt→Matthew, Madi→Madison, Sam→Samuel.
function prefixMatch(a: string, b: string): boolean {
  return (
    (b.length >= 3 && a.startsWith(b)) || (a.length >= 3 && b.startsWith(a))
  );
}

function firstNameCompatible(memberFirst: string, speakerFirst: string): boolean {
  return (
    memberFirst === speakerFirst ||
    lev(memberFirst, speakerFirst) <= 1 ||
    prefixMatch(memberFirst, speakerFirst) ||
    nicknameMatch(memberFirst, speakerFirst)
  );
}

export type MatchMember = {
  id: string;
  fullName: string;
  preferredName?: string | null;
};

/**
 * Build a resolver from the current member list. Returns resolve(name) → member
 * id or null. Names are "First [Middle] Last"; members are "Last, First Middle".
 * A member's recorded preferred name ("Alex" for "Alexander") is treated as an
 * additional accepted first-name form.
 */
export function buildResolver(members: MatchMember[]) {
  const exact = new Map<string, string>();
  const byLast = new Map<string, { id: string; firsts: string[] }[]>();
  for (const m of members) {
    const [last, rest] = m.fullName.split(",");
    const first = (rest || "").trim().split(/\s+/)[0] || "";
    const L = norm(last);
    const F = norm(first);
    if (!L || !F) continue;
    const firsts = [F];
    // Preferred name is freeform ("Alex Hui") — use its first token as a given-name form.
    const pref = norm((m.preferredName || "").trim().split(/\s+/)[0] || "");
    if (pref && pref !== F) firsts.push(pref);
    for (const f of firsts) if (!exact.has(`${L}|${f}`)) exact.set(`${L}|${f}`, m.id);
    byLast.set(L, [...(byLast.get(L) || []), { id: m.id, firsts }]);
  }

  return function resolve(name: string): string | null {
    const toks = name.trim().split(/\s+/).map(norm).filter(Boolean);
    if (toks.length < 2) return null;
    const F = toks[0];
    // Surnames can be multiple words ("Van Wagenen", "De Azevedo"). Members are
    // indexed by their full surname (joined), so try the last k tokens as the
    // surname for k = 1..3, taking the first definitive (unique) hit.
    const maxK = Math.min(3, toks.length - 1);
    for (let k = 1; k <= maxK; k++) {
      const L = toks.slice(toks.length - k).join("");
      const hit = exact.get(`${L}|${F}`);
      if (hit) return hit;
      const cands = (byLast.get(L) || []).filter((c) =>
        c.firsts.some((cf) => firstNameCompatible(cf, F))
      );
      if (cands.length === 1) return cands[0].id;
    }
    return null;
  };
}
