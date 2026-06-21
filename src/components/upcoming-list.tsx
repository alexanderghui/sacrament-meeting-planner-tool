"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MeetingCard } from "@/components/meeting-card";
import { cn } from "@/lib/utils";
import type { PlannerMeeting, PickerMember } from "@/lib/meetings";

function monthLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function UpcomingList({
  meetings,
  members,
}: {
  meetings: PlannerMeeting[];
  members: PickerMember[];
}) {
  const groups: { label: string; items: PlannerMeeting[] }[] = [];
  for (const m of meetings) {
    const label = monthLabel(m.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  // Collapse every month except the nearest one by default, so a long stretch
  // of Sundays doesn't make the page huge. Toggle per-month; remembered while
  // the page is open.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(groups.slice(1).map((g) => g.label))
  );
  const toggle = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.label);
        return (
          <div key={g.label}>
            <button
              type="button"
              onClick={() => toggle(g.label)}
              aria-expanded={!isCollapsed}
              className="mb-3 flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 transition-transform",
                  isCollapsed && "-rotate-90"
                )}
              />
              <span>{g.label}</span>
              <span className="font-normal normal-case tracking-normal text-[var(--grey30)]">
                · {g.items.length} {g.items.length === 1 ? "Sunday" : "Sundays"}
              </span>
            </button>
            {!isCollapsed && (
              <div className="space-y-3">
                {g.items.map((m) => (
                  <MeetingCard key={m.id} meeting={m} members={members} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
