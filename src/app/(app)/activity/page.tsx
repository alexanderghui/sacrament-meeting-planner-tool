import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAuditLog, type AuditEntry } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ACTION_VARIANT: Record<string, "green" | "neutral" | "red"> = {
  created: "green",
  updated: "neutral",
  deleted: "red",
};

function dayKey(d: Date) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function time(d: Date) {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function actor(e: AuditEntry) {
  return e.userName || e.userEmail || "Unknown";
}

export default async function ActivityPage() {
  const entries = await getAuditLog();

  const groups: { day: string; items: AuditEntry[] }[] = [];
  for (const e of entries) {
    const day = dayKey(e.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-[1.75rem] font-light text-foreground leading-tight">
          Activity
        </h2>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground">
          A record of every change, and who made it.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--grey15)] bg-card py-16 text-center">
          <Activity className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No activity yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.day}
              </div>
              <div className="overflow-hidden rounded-sm border border-[var(--grey15)] bg-card">
                {g.items.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-3 border-b border-[var(--grey10)] px-5 py-3 last:border-b-0"
                  >
                    <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">
                      {time(e.createdAt)}
                    </span>
                    <Badge
                      variant={ACTION_VARIANT[e.action] ?? "neutral"}
                      className="mt-0.5 shrink-0 capitalize"
                    >
                      {e.action}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-foreground">
                        {e.summary}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {actor(e)} · {e.entityType}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
