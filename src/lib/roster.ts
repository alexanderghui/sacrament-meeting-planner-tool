// CSV roster parsing + change detection for ward-list refreshes.

export type RosterRow = {
  fullName: string;
  household: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  birthdate: string | null;
};

export type FieldChange = {
  field: keyof RosterRow;
  label: string;
  before: string | null;
  after: string | null;
};

export type RosterUpdate = {
  memberId: string;
  name: string;
  changes: FieldChange[];
};

export type RosterRemoval = { memberId: string; name: string };

export type RosterDiff = {
  adds: RosterRow[];
  updates: RosterUpdate[];
  removes: RosterRemoval[];
  unchangedCount: number;
};

export type ParseResult = {
  rows: RosterRow[];
  errors: string[];
  columns: Record<keyof RosterRow, boolean>;
};

export type ExistingMember = {
  id: string;
  fullName: string;
  household: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  birthdate: string | null;
};

const HEADER_ALIASES: Record<keyof RosterRow, string[]> = {
  fullName: ["name", "full name", "preferred name", "member name", "individual name"],
  household: ["household", "family", "household name", "family name"],
  gender: ["gender", "sex"],
  phone: ["phone", "phone number", "individual phone", "mobile phone", "household phone"],
  email: ["email", "email address", "individual email", "e-mail"],
  birthdate: ["birth date", "birthdate", "birthday", "date of birth", "dob"],
};

const FIELD_LABELS: Record<keyof RosterRow, string> = {
  fullName: "Name",
  household: "Household",
  gender: "Gender",
  phone: "Phone",
  email: "Email",
  birthdate: "Birthdate",
};

function pad(n: string | number) {
  return String(n).padStart(2, "0");
}

function isoFromDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseBirthdate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) return `${slash[3]}-${pad(slash[1])}-${pad(slash[2])}`;
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return isoFromDate(dt);
  return null;
}

// Minimal RFC-4180-ish CSV reader: handles quoted fields, escaped quotes, CRLF.
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

export function parseRosterCsv(text: string): ParseResult {
  const errors: string[] = [];
  const grid = readCsv(text).filter((r) => r.some((c) => c.trim().length));
  if (grid.length < 2) {
    return {
      rows: [],
      errors: ["The file appears to be empty or has no data rows."],
      columns: { fullName: false, household: false, gender: false, phone: false, email: false, birthdate: false },
    };
  }

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const colIndex = {} as Record<keyof RosterRow, number>;
  (Object.keys(HEADER_ALIASES) as (keyof RosterRow)[]).forEach((field) => {
    colIndex[field] = header.findIndex((h) =>
      HEADER_ALIASES[field].includes(h)
    );
  });

  const columns = {
    fullName: colIndex.fullName >= 0,
    household: colIndex.household >= 0,
    gender: colIndex.gender >= 0,
    phone: colIndex.phone >= 0,
    email: colIndex.email >= 0,
    birthdate: colIndex.birthdate >= 0,
  };

  if (!columns.fullName) {
    errors.push(
      `Couldn't find a "Name" column. Found headers: ${grid[0].join(", ")}`
    );
    return { rows: [], errors, columns };
  }

  const rows: RosterRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const fullName = clean(r[colIndex.fullName]);
    if (!fullName) continue;
    const birthRaw = columns.birthdate ? clean(r[colIndex.birthdate]) : null;
    const genderRaw = columns.gender ? clean(r[colIndex.gender]) : null;
    const gender = genderRaw ? genderRaw.toUpperCase()[0] : null;
    rows.push({
      fullName,
      household: columns.household ? clean(r[colIndex.household]) : null,
      gender: gender === "M" || gender === "F" ? gender : null,
      phone: columns.phone ? clean(r[colIndex.phone]) : null,
      email: columns.email ? clean(r[colIndex.email]) : null,
      birthdate: birthRaw ? parseBirthdate(birthRaw) : null,
    });
  }

  return { rows, errors, columns };
}

// Order-insensitive name key so "Smith, John" matches "John Smith".
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

// Match key combines name with birthdate: birthdate is the stable identifier
// that distinguishes two members who share a name (e.g. a father and son).
export function matchKey(name: string, birthdate: string | null): string {
  return `${nameKey(name)}|${birthdate ?? ""}`;
}

const COMPARED: (keyof RosterRow)[] = ["household", "gender", "phone", "email", "birthdate"];

export function diffRoster(
  existing: ExistingMember[],
  incoming: RosterRow[]
): RosterDiff {
  const existingByKey = new Map<string, ExistingMember>();
  for (const m of existing)
    existingByKey.set(matchKey(m.fullName, m.birthdate), m);

  const adds: RosterRow[] = [];
  const updates: RosterUpdate[] = [];
  const seen = new Set<string>();
  let unchangedCount = 0;

  for (const row of incoming) {
    const key = matchKey(row.fullName, row.birthdate);
    if (seen.has(key)) continue; // exact duplicate within the file
    seen.add(key);

    const match = existingByKey.get(key);
    if (!match) {
      adds.push(row);
      continue;
    }

    // Only count a value as changed when the import actually provides one —
    // a blank in the export never clears existing data.
    const changes: FieldChange[] = [];
    for (const field of COMPARED) {
      const after = row[field];
      const before = match[field];
      if (after != null && after !== (before ?? null)) {
        changes.push({ field, label: FIELD_LABELS[field], before, after });
      }
    }
    if (changes.length) updates.push({ memberId: match.id, name: match.fullName, changes });
    else unchangedCount++;
  }

  const removes: RosterRemoval[] = [];
  for (const m of existing) {
    if (!seen.has(matchKey(m.fullName, m.birthdate))) {
      removes.push({ memberId: m.id, name: m.fullName });
    }
  }

  return { adds, updates, removes, unchangedCount };
}
