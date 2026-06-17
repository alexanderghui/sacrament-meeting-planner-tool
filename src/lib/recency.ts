// Speaking-recency buckets. Goal: nobody speaks twice in the same year, so the
// long-overdue end ("never", 3+ years) is the priority — broken out finely.

export type Bucket =
  | "red" // under 3 months — recently spoke
  | "neutral" // 3–6 months
  | "amber" // 6–12 months
  | "green" // 1–2 years
  | "over2" // 2–3 years
  | "over3" // over 3 years
  | "never"; // never spoken

export function daysSince(date: string | null, today = new Date()): number | null {
  if (!date) return null;
  const then = new Date(date + "T00:00:00");
  const ms = today.getTime() - then.getTime();
  return Math.floor(ms / 86_400_000);
}

export function bucketFor(days: number | null): Bucket {
  if (days === null) return "never";
  if (days < 90) return "red"; // under ~3 months
  if (days < 182) return "neutral"; // 3–6 months
  if (days < 365) return "amber"; // 6–12 months
  if (days < 730) return "green"; // 1–2 years
  if (days < 1095) return "over2"; // 2–3 years
  return "over3"; // over 3 years
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  red: "Under 3 months",
  neutral: "3–6 months",
  amber: "6–12 months",
  green: "1–2 years",
  over2: "2–3 years",
  over3: "Over 3 years",
  never: "Never spoken",
};

// Foreground (text/dot) + background per bucket, via the status CSS variables.
export const BUCKET_COLOR: Record<Bucket, { fg: string; bg: string }> = {
  red: { fg: "var(--status-red)", bg: "var(--status-red-bg)" },
  neutral: { fg: "var(--status-neutral)", bg: "var(--status-neutral-bg)" },
  amber: { fg: "var(--status-amber)", bg: "var(--status-amber-bg)" },
  green: { fg: "var(--status-green)", bg: "var(--status-green-bg)" },
  over2: { fg: "var(--status-blue)", bg: "var(--status-blue-bg)" },
  over3: { fg: "var(--status-violet)", bg: "var(--status-violet-bg)" },
  never: { fg: "var(--status-never)", bg: "var(--status-never-bg)" },
};

// Most-overdue first — the order the recency filter pills are shown in.
export const BUCKET_ORDER: Bucket[] = [
  "never",
  "over3",
  "over2",
  "green",
  "amber",
  "neutral",
  "red",
];

export function relativeLabel(days: number | null): string {
  if (days === null) return "Never spoken";
  if (days < 14) return days <= 1 ? "Yesterday" : `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = (days / 365).toFixed(1);
  return `${years} years ago`;
}
