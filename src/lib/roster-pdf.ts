// Parse an LCR "Member List" PDF straight into roster rows, so the bishopric
// can upload the export they already have instead of converting it to CSV first.
//
// The LCR PDF is a fixed six-column table (Name, Gender, Age, Birth Date, Phone
// Number, Email). pdf.js hands us one positioned text item per cell, so we:
//   1. read the header row to learn each column's x-position,
//   2. take every Gender (M/F) and Birth Date cell as a row "anchor" — every
//      member has both, exactly once,
//   3. attach every other cell to its nearest anchor (by vertical distance) and
//      to its column (by x), joining wrapped lines back together.
//
// This mirrors private/extract_roster.py and was validated to reproduce its
// output exactly (334/334 members) on the real ward export.

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

type Item = { str: string; x: number; y: number };

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

export async function parseRosterPdf(
  bytes: Uint8Array
): Promise<ParseResult> {
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

  const rows: RosterRow[] = [];
  let sawRosterPage = false;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = content.items
      .filter(
        (it): it is Extract<typeof it, { transform: number[] }> =>
          "str" in it && "transform" in it && it.str.trim().length > 0
      )
      .map((it) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] }));

    // Column x-positions from this page's header row.
    const cols: { key: string; x: number }[] = [];
    for (const label of HEADERS) {
      const h = items.find((it) => it.str === label);
      if (h) cols.push({ key: label, x: h.x });
    }
    if (!cols.some((c) => c.key === "Gender")) continue; // title / non-roster page
    sawRosterPage = true;

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
    if (!anchorY.length) continue;

    const buckets: Record<string, Item[]>[] = anchorY.map(() => ({}));
    for (const it of items) {
      const col = columnFor(it.x, cols);
      if (col === "Age" || (HEADERS as readonly string[]).includes(it.str)) continue;
      let bi = 0;
      let best = Infinity;
      for (let i = 0; i < anchorY.length; i++) {
        const d = Math.abs(anchorY[i] - it.y);
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      if (best > ROW_TOLERANCE) continue;
      (buckets[bi][col] ||= []).push(it);
    }

    for (const bucket of buckets) {
      // Read top-to-bottom, left-to-right; emails wrap with no separator so
      // their fragments join tightly, everything else joins with a space.
      const join = (key: string, tight = false) =>
        (bucket[key] || [])
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .map((w) => w.str)
          .join(tight ? "" : " ")
          .trim();

      const fullName = join("Name");
      const genderRaw = join("Gender");
      const birthRaw = join("Birth Date");
      const gender = genderRaw === "M" || genderRaw === "F" ? genderRaw : null;
      // A real member row always has a gender or a birth date; skip stray text.
      if (!fullName || (!gender && !birthRaw)) continue;

      rows.push({
        fullName,
        household: fullName.includes(",") ? fullName.split(",")[0].trim() : null,
        gender,
        phone: join("Phone Number") || null,
        email: join("Email", true) || null,
        birthdate: birthRaw ? parseBirthdate(birthRaw) : null,
      });
    }
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
  if (!rows.length) {
    return {
      rows: [],
      errors: ["No members were found in that PDF."],
      columns: emptyColumns(),
    };
  }

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
