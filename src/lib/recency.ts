// Speaking-recency buckets. Goal: nobody speaks twice in the same year, so
// "green" means available/overdue and "red" means recently spoke (leave alone).

export type Bucket = "red" | "neutral" | "amber" | "green";

export function daysSince(date: string | null, today = new Date()): number | null {
  if (!date) return null;
  const then = new Date(date + "T00:00:00");
  const ms = today.getTime() - then.getTime();
  return Math.floor(ms / 86_400_000);
}

export function bucketFor(days: number | null): Bucket {
  if (days === null) return "green"; // never spoken
  if (days < 90) return "red"; // under ~3 months
  if (days < 182) return "neutral"; // 3–6 months
  if (days < 365) return "amber"; // 6–12 months
  return "green"; // over a year
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  red: "Under 3 months",
  neutral: "3–6 months",
  amber: "6–12 months",
  green: "Over a year / never",
};

export function relativeLabel(days: number | null): string {
  if (days === null) return "Never spoken";
  if (days < 14) return days <= 1 ? "Yesterday" : `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = (days / 365).toFixed(1);
  return `${years} years ago`;
}
