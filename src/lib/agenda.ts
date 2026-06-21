// Fixed scaffolding + program-ordering logic for the printable conducting
// agenda. The boilerplate strings below are read verbatim from the stand every
// week (they are identical across ~52 of the user's conducting docs), so they
// live here as constants and are injected automatically — never typed by hand.

import { HYMN_TITLES } from "./hymns";
import type { MeetingTypeValue, RosterChange } from "./meetings";

export type { RosterChange };

/* --------------------------- boilerplate -------------------------- */

export const SACRAMENT_PREP =
  "We will now prepare ourselves for the sacrament. As we prepare for the sacrament, we invite everyone to put away your electronic devices so that we can receive the full power of the sacramental ordinance.";

export const AFTER_SACRAMENT_HYMN =
  "After which, the Aaronic Priesthood brethren will bless and pass the sacrament.";

export const REVERENCE_THANKS =
  "Thank you for your reverence during the administration of the sacrament.";

export const MOVE_INS_FOOTER =
  "We would love to welcome these new families into the ward. Please join me in doing so by raising an uplifted hand. Thank you.";

export const RELEASED_HEADER =
  "The following individuals have been released from their ward callings.";
export const RELEASED_FOOTER =
  "We are grateful for their service in the ward and propose they be given a vote of thanks. All those who wish to express their appreciation may show it by the uplifted hand.";

export const SUSTAINED_HEADER =
  "The following individuals have been called to positions in the ward. If these individuals are here today, would you please stand when your name is called.";
export const SUSTAINED_FOOTER =
  "Those in favor of sustaining these individuals may show it by the uplifted hand. Those opposed, if any, may also show it.";

/* ----------------------------- hymns ------------------------------ */

// "#19 – We Thank Thee, O God, for a Prophet" (en-dash, matching the docs).
export function hymnText(
  n: number | null | undefined,
  fallback?: Record<number, string>
): string | null {
  if (n == null) return null;
  const title = HYMN_TITLES[n] ?? fallback?.[n];
  return title ? `#${n} – ${title}` : `#${n}`;
}

/* ------------------------- program ordering ----------------------- */
// The post-sacrament block. On a fast Sunday it collapses to "Bearing of
// Testimonies". Otherwise it's the speakers, with the intermediate hymn and/or
// musical number slotted in just before the final speaker (the dominant pattern
// across the conducting docs: after speaker 2 of 3, or after speaker 1 of 2).

export type ProgramItem =
  | { kind: "speaker"; position: number; name: string; topic: string | null }
  | { kind: "intermediateHymn"; text: string }
  | { kind: "musicalNumber"; text: string }
  | { kind: "testimony" };

export function buildProgram(opts: {
  type: MeetingTypeValue;
  speakers: { position: number; name: string | null; topic: string | null }[];
  intermediateHymn: number | null;
  musicalNumber: string | null;
  hymnFallback?: Record<number, string>;
}): ProgramItem[] {
  if (opts.type === "fast_and_testimony") return [{ kind: "testimony" }];

  const speakers = opts.speakers
    .filter((s) => s.name)
    .sort((a, b) => a.position - b.position)
    // Number by speaking order (index) so it's always dense 1..N even if the
    // stored positions have gaps from edits/reordering.
    .map(
      (s, i): ProgramItem => ({
        kind: "speaker",
        position: i + 1,
        name: s.name as string,
        topic: s.topic,
      })
    );

  const mid: ProgramItem[] = [];
  const hymn = hymnText(opts.intermediateHymn, opts.hymnFallback);
  if (hymn) mid.push({ kind: "intermediateHymn", text: hymn });
  if (opts.musicalNumber?.trim())
    mid.push({ kind: "musicalNumber", text: opts.musicalNumber.trim() });

  if (mid.length === 0) return speakers;
  if (speakers.length === 0) return mid;
  if (speakers.length === 1) return [...speakers, ...mid];
  // ≥2 speakers: intermediate item(s) go just before the last speaker.
  return [...speakers.slice(0, -1), ...mid, speakers[speakers.length - 1]];
}
