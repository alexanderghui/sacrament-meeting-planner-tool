"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  Pencil,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MeetingCard } from "@/components/meeting-card";
import { MeetingProgram } from "@/components/meeting-program";
import { cn } from "@/lib/utils";
import type {
  PlannerMeeting,
  PickerMember,
  MeetingTypeValue,
} from "@/lib/meetings";

const TYPE_LABELS: Record<MeetingTypeValue, string> = {
  sacrament: "Sacrament",
  fast_and_testimony: "Fast & testimony",
  ward_conference: "Ward conference",
  stake_conference: "Stake conference",
  general_conference: "General conference",
  primary_program: "Primary program",
  no_meeting: "No meeting",
};

function fmtDate(iso: string, withYear: boolean) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function monthLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function HistoryBrowser({
  meetings,
  members,
  hymnTitles,
}: {
  meetings: PlannerMeeting[];
  members: PickerMember[];
  hymnTitles: Record<number, string>;
}) {
  const years = useMemo(
    () => [...new Set(meetings.map((m) => m.date.slice(0, 4)))].sort().reverse(),
    [meetings]
  );
  const [year, setYear] = useState(years[0] ?? "");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const visible = useMemo(() => {
    if (searching) {
      return meetings.filter(
        (m) =>
          m.speakers.some((s) => s.name?.toLowerCase().includes(q)) ||
          m.speakers.some((s) => s.topic?.toLowerCase().includes(q)) ||
          (m.conducting ?? "").toLowerCase().includes(q) ||
          fmtDate(m.date, true).toLowerCase().includes(q)
      );
    }
    return meetings.filter((m) => m.date.slice(0, 4) === year);
  }, [meetings, searching, q, year]);

  // group into [{label, items}] — by month when browsing, single group when searching
  const groups = useMemo(() => {
    if (searching) return [{ label: "", items: visible }];
    const out: { label: string; items: PlannerMeeting[] }[] = [];
    for (const m of visible) {
      const label = monthLabel(m.date);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    }
    return out;
  }, [visible, searching]);

  function toggle(id: string) {
    setEditId(null);
    setOpenId((cur) => (cur === id ? null : id));
  }

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpenId(null);
          }}
          placeholder="Search by speaker, topic, or date"
          className="pl-9 pr-9 max-sm:text-base"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Year tabs (hidden while searching) */}
      {!searching && (
        <div className="flex flex-wrap gap-1.5">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setYear(y);
                setOpenId(null);
              }}
              className={cn(
                "rounded-sm px-3.5 py-2 text-sm transition-colors sm:px-3 sm:py-1.5",
                y === year
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {searching
          ? `${visible.length} ${visible.length === 1 ? "meeting" : "meetings"} matching “${query.trim()}”`
          : `${visible.length} ${visible.length === 1 ? "meeting" : "meetings"} in ${year}`}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--grey15)] bg-card py-12 text-center text-sm text-muted-foreground">
          No meetings found.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label || "results"}>
              {g.label && (
                <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </div>
              )}
              <div className="overflow-hidden rounded-sm border border-[var(--grey15)] bg-card">
                {g.items.map((m) => {
                  const open = openId === m.id;
                  const editing = editId === m.id;
                  const names = m.speakers.filter((s) => s.name).map((s) => s.name);
                  return (
                    <div
                      key={m.id}
                      className="border-b border-[var(--grey10)] last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(m.id)}
                        aria-expanded={open}
                        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-[var(--grey2)] min-h-[44px] sm:flex sm:items-center"
                      >
                        <span className="text-sm font-medium text-foreground sm:w-36 sm:shrink-0">
                          {fmtDate(m.date, searching)}
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 justify-self-end text-muted-foreground transition-transform sm:order-last",
                            open && "rotate-180"
                          )}
                        />
                        <div className="col-span-2 flex min-w-0 items-center gap-2 sm:contents">
                          <Badge variant="outline" className="shrink-0">
                            {TYPE_LABELS[m.type]}
                          </Badge>
                          <span className="flex-1 truncate text-sm text-muted-foreground sm:order-none">
                            {names.length > 0 ? names.join(", ") : "—"}
                          </span>
                        </div>
                      </button>

                      {open && (
                        <div className="border-t border-[var(--grey10)] bg-[var(--grey2)] px-4 py-4">
                          {editing ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3 rounded-sm border border-[var(--status-amber)] bg-[var(--status-amber-bg)] px-3 py-2 text-sm text-[var(--status-amber)]">
                                <span className="flex items-center gap-2">
                                  <AlertTriangle className="size-4 shrink-0" />
                                  Editing a past meeting — only change this to fix a mistake.
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setEditId(null)}
                                  className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-white/70 px-2.5 py-1 font-medium hover:bg-white max-sm:min-h-[40px] max-sm:px-3"
                                >
                                  <Check className="size-4" /> Done
                                </button>
                              </div>
                              <MeetingCard
                                meeting={m}
                                members={members}
                                defaultExpanded
                              />
                            </div>
                          ) : (
                            <>
                              <div className="mb-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => setEditId(m.id)}
                                  className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm text-[var(--link)] hover:text-[var(--link-hover)] max-sm:min-h-[44px] max-sm:px-3"
                                >
                                  <Pencil className="size-3.5" /> Correct
                                </button>
                              </div>
                              <MeetingProgram meeting={m} hymnTitles={hymnTitles} />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
