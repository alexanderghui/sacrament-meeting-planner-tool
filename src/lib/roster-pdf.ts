// Parse an LCR "Member List" PDF straight into roster rows, so the bishopric
// can upload the export they already have instead of converting it to CSV first.
//
// The LCR PDF is a fixed six-column table (Name, Gender, Age, Birth Date, Phone
// Number, Email). pdf.js hands us one positioned text item per cell, so we:
//   1. read the header row to learn each column's x-position,
//   2. take every Gender (M/F) and Birth Date cell as a row "anchor" — every
//      member has both, exactly once,
//   3. attach every other cell to its nearest anchor (by vertical distance) and
//      to its column (by x), joining wrapped name and email lines back together.
//
// One wrinkle LCR's paginator introduces: a member whose row lands on a page
// boundary can have its data on the bottom of one page and its (wrapped) name
// on the top of the next. Neither fragment is a complete member on its own, so
// we collect the leftovers — data-with-no-name and name-with-no-data — and
// stitch the pair back together across the seam.
//
// Mirrors private/extract_roster.py; validated to reproduce its output exactly
// (334/334 members) on the real ward export.

import { getDocumentProxy } from "unpdf";
import { parseBirthdate, type ParseResult, type RosterRow } from "./roster";

const HEADERS = [
  "Name",
  "Gender",
  "Age",
  "Birth Date",
  "Phone Number",
  "Email",
] as const;

// Vertical px a wrapped line can sit from its row's anchor. Rows are ~19px
// apart and wrapped fragments land ~6px off their anchor, so 12 captures wraps
// without ever reaching a neighbouring row.
const ROW_TOLERANCE = 12;
// Merge anchor signals this close into a single row (a member's Gender and
// Birth Date share a baseline; a wrapped name centres its data between lines).
const ANCHOR_CLUSTER = 8;
// Orphan name lines this close vertically belong to the same wrapped name.
const NAME_LINE_GAP = 15;

type Item = { str: string; x: number; y: number };

type Raw = {
  fullName: string;
  gender: "M" | "F" | null;
  phone: string | null;
  email: string | null;
  birthRaw: string;
};

// A row fragment in document order: a full member, data missing its name, or a
// name missing its data. The latter two only occur where a row splits a page.
type Fragment =
  | { kind: "complete" | "data"; page: number; y: number; raw: Raw }
  | { kind: "name"; page: number; y: number; name: string };

function columnFor(x: number, cols: { key: string; x: number }[]): string {
  let key = cols[0].key;
  for (const c of cols) if (x >= c.x - 3) key = c.key;
  return key;
}

const emptyColumns = (): ParseResult["columns"] => ({
  fullName: false,
  household: false,
  gender: false,
  phone: false,
  email: false,
  birthdate: false,
});

export async function parseRosterPdf(bytes: Uint8Array): Promise<ParseResult> {
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    return {
      rows: [],
      errors: ["That file couldn't be read as a PDF. Please re-export it from LCR."],
      columns: emptyColumns(),
    };
  }

  const fragments: Fragment[] = [];
  let sawRosterPage = false;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const all: Item[] = content.items
      .filter(
        (it): it is Extract<typeof it, { transform: number[] }> =>
          "str" in it && "transform" in it && it.str.trim().length > 0
      )
      .map((it) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] }));

    // Column x-positions from this page's header row.
    const cols: { key: string; x: number }[] = [];
    for (const label of HEADERS) {
      const h = all.find((it) => it.str === label);
      if (h) cols.push({ key: label, x: h.x });
    }
    if (!cols.some((c) => c.key === "Gender")) continue; // title / non-roster page
    sawRosterPage = true;
    const nameX = cols.find((c) => c.key === "Name")!.x;

    // Drop the header labels, the page footer, and the trailing "Count:" line so
    // none of them can masquerade as a member or an orphan name.
    const footerY = Math.max(
      ...all
        .filter((it) => /For Church Use Only|Intellectual Reserve/.test(it.str))
        .map((it) => it.y),
      -Infinity
    );
    const items = all.filter(
      (it) =>
        it.y > footerY + 3 &&
        !(HEADERS as readonly string[]).includes(it.str) &&
        !it.str.startsWith("Count:")
    );

    // Row anchors from Gender (M/F) and Birth Date cells in their columns.
    const anchorSignals: number[] = [];
    for (const it of items) {
      const col = columnFor(it.x, cols);
      if (col === "Gender" && (it.str === "M" || it.str === "F")) anchorSignals.push(it.y);
      else if (col === "Birth Date" && /\b\d{4}\b/.test(it.str)) anchorSignals.push(it.y);
    }
    anchorSignals.sort((a, b) => b - a);
    const clusters: { sum: number; n: number }[] = [];
    for (const y of anchorSignals) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last.sum / last.n - y) <= ANCHOR_CLUSTER) {
        last.sum += y;
        last.n++;
      } else clusters.push({ sum: y, n: 1 });
    }
    const anchorY = clusters.map((c) => c.sum / c.n);

    const buckets: Record<string, Item[]>[] = anchorY.map(() => ({}));
    const orphanNameItems: Item[] = [];
    for (const it of items) {
      const col = columnFor(it.x, cols);
      if (col === "Age") continue;
      let bi = 0;
      let best = Infinity;
      for (let i = 0; i < anchorY.length; i++) {
        const d = Math.abs(anchorY[i] - it.y);
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      if (best > ROW_TOLERANCE) {
        // A name cell too far from any anchor is the top/bottom half of a row
        // split across a page break; hold it for stitching.
        if (col === "Name" && it.x >= nameX - 3) orphanNameItems.push(it);
        continue;
      }
      (buckets[bi][col] ||= []).push(it);
    }

    // Turn each anchor's cells into a member, or a nameless data fragment.
    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      // Read top-to-bottom, left-to-right; emails wrap with no separator so
      // their fragments join tightly, everything else joins with a space.
      const join = (key: string, tight = false) =>
        (bucket[key] || [])
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .map((w) => w.str)
          .join(tight ? "" : " ")
          .trim();

      const genderRaw = join("Gender");
      const raw: Raw = {
        fullName: join("Name"),
        gender: genderRaw === "M" || genderRaw === "F" ? genderRaw : null,
        phone: join("Phone Number") || null,
        email: join("Email", true) || null,
        birthRaw: join("Birth Date"),
      };
      if (!raw.gender && !raw.birthRaw) continue; // stray, not a real row
      fragments.push({
        kind: raw.fullName ? "complete" : "data",
        page: p,
        y: anchorY[i],
        raw,
      });
    }

    // Group orphan name lines into wrapped names (one per split member).
    orphanNameItems.sort((a, b) => b.y - a.y || a.x - b.x);
    let group: Item[] = [];
    const flush = () => {
      if (!group.length) return;
      fragments.push({
        kind: "name",
        page: p,
        y: group[0].y,
        name: group.map((w) => w.str).join(" ").trim(),
      });
      group = [];
    };
    for (const it of orphanNameItems) {
      if (group.length && Math.abs(group[group.length - 1].y - it.y) > NAME_LINE_GAP) flush();
      group.push(it);
    }
    flush();
  }

  // Stitch the fragments in reading order: an orphan data row and an adjacent
  // orphan name are the two halves of one member split across a page seam.
  fragments.sort((a, b) => a.page - b.page || b.y - a.y);
  const raws: Raw[] = [];
  for (let i = 0; i < fragments.length; i++) {
    const f = fragments[i];
    const next = fragments[i + 1];
    if (f.kind === "complete") {
      raws.push(f.raw);
    } else if (f.kind === "data" && next?.kind === "name") {
      raws.push({ ...f.raw, fullName: next.name });
      i++;
    } else if (f.kind === "name" && next?.kind === "data") {
      raws.push({ ...next.raw, fullName: f.name });
      i++;
    }
    // A lone data/name fragment with no partner can't be resolved into a
    // member; dropping it is no worse than the old page-isolated behaviour.
  }

  if (!sawRosterPage) {
    return {
      rows: [],
      errors: [
        "This PDF doesn't look like an LCR Member List. Export the ward directory as a Member List PDF and try again.",
      ],
      columns: emptyColumns(),
    };
  }
  if (!raws.length) {
    return { rows: [], errors: ["No members were found in that PDF."], columns: emptyColumns() };
  }

  const rows: RosterRow[] = raws.map((r) => ({
    fullName: r.fullName,
    household: r.fullName.includes(",") ? r.fullName.split(",")[0].trim() : null,
    gender: r.gender,
    phone: r.phone,
    email: r.email,
    birthdate: r.birthRaw ? parseBirthdate(r.birthRaw) : null,
  }));

  return {
    rows,
    errors: [],
    columns: {
      fullName: true,
      household: true,
      gender: true,
      phone: true,
      email: true,
      birthdate: true,
    },
  };
}
