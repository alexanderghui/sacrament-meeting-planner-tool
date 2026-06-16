"use client";

import { MeetingCard } from "@/components/meeting-card";
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
  const firstId = meetings[0]?.id;

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </div>
          <div className="space-y-3">
            {g.items.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                members={members}
                defaultExpanded={m.id === firstId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
