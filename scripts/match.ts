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
//
// The first-name rules live in src/lib/name-match.ts so the app's roster
// backfill uses exactly the same logic.

import { firstNameCompatible, norm } from "../src/lib/name-match";

export { lev, norm } from "../src/lib/name-match";

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
