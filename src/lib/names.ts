// Pure name helpers — no DB imports, so both server code and client components
// can share them. Members are stored "Last, First Middle" (from LCR).

export function displayName(fullName: string): string {
  // "Hui, Alexander Gabriel" → "Alexander Gabriel Hui"
  const parts = fullName.split(", ");
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : fullName;
}

export function surnameOf(fullName: string): string {
  return fullName.split(",")[0].trim();
}

// The name to show first: the full preferred name exactly as entered when set,
// otherwise the official name. The user types the whole thing (incl. surname) —
// nothing is auto-appended.
export function primaryName(
  fullName: string,
  preferred: string | null | undefined
): string {
  const p = preferred?.trim();
  return p ? p : displayName(fullName);
}

// The official full name to show as a muted second line — only when it actually
// differs from the primary (so a member with no preferred name stays one line).
export function officialSubline(
  fullName: string,
  preferred: string | null | undefined
): string | null {
  if (!preferred?.trim()) return null;
  const official = displayName(fullName);
  return official.toLowerCase() === primaryName(fullName, preferred).toLowerCase()
    ? null
    : official;
}
