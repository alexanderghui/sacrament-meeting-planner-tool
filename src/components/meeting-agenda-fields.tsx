"use client";

import { useState, useTransition } from "react";
import { Plus, X, Megaphone, ClipboardList, ChevronDown } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  updateMeetingAnnouncements,
  updateMeetingMoveIns,
  updateMeetingRoster,
  updateMeetingText,
} from "@/lib/actions";
import type { RosterChange } from "@/lib/meetings";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--status-red-bg)] hover:text-[var(--status-red)] sm:size-8"
    >
      <X className="size-4" />
    </button>
  );
}

/* --------------------- string-list editor ------------------------- */

export function StringListEditor({
  items: initial,
  placeholder,
  addLabel,
  multiline = false,
  numbered = false,
  onCommit,
}: {
  items: string[];
  placeholder: string;
  addLabel: string;
  multiline?: boolean;
  numbered?: boolean;
  onCommit: (items: string[]) => void;
}) {
  const [items, setItems] = useState<string[]>(initial);
  const setAt = (i: number, v: string) =>
    setItems((arr) => arr.map((x, j) => (j === i ? v : x)));
  const removeAt = (i: number) => {
    const next = items.filter((_, j) => j !== i);
    setItems(next);
    onCommit(next);
  };

  return (
    <div className="space-y-2">
      {items.map((val, i) => (
        <div key={i} className="flex items-start gap-2">
          {numbered && (
            <span className="mt-2.5 w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
              {i + 1}.
            </span>
          )}
          {multiline ? (
            <Textarea
              value={val}
              placeholder={placeholder}
              onChange={(e) => setAt(i, e.target.value)}
              onBlur={() => onCommit(items)}
            />
          ) : (
            <Input
              value={val}
              placeholder={placeholder}
              onChange={(e) => setAt(i, e.target.value)}
              onBlur={() => onCommit(items)}
            />
          )}
          <RemoveButton onClick={() => removeAt(i)} />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-[44px] sm:min-h-8"
        onClick={() => setItems((arr) => [...arr, ""])}
      >
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}

/* ---------------------- roster-list editor ------------------------ */

function RosterListEditor({
  items: initial,
  onCommit,
}: {
  items: RosterChange[];
  onCommit: (items: RosterChange[]) => void;
}) {
  const [items, setItems] = useState<RosterChange[]>(initial);
  const setAt = (i: number, patch: Partial<RosterChange>) =>
    setItems((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeAt = (i: number) => {
    const next = items.filter((_, j) => j !== i);
    setItems(next);
    onCommit(next);
  };

  return (
    <div className="space-y-2">
      {items.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <Input
            value={row.name}
            placeholder="Name"
            className="flex-1"
            onChange={(e) => setAt(i, { name: e.target.value })}
            onBlur={() => onCommit(items)}
          />
          <Input
            value={row.calling}
            placeholder="Calling"
            className="flex-1"
            onChange={(e) => setAt(i, { calling: e.target.value })}
            onBlur={() => onCommit(items)}
          />
          <RemoveButton onClick={() => removeAt(i)} />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-[44px] sm:min-h-8"
        onClick={() => setItems((arr) => [...arr, { name: "", calling: "" }])}
      >
        <Plus className="size-4" />
        Add person
      </Button>
    </div>
  );
}

/* ------------------------- main section --------------------------- */

export function MeetingAgendaFields({
  meetingId,
  announcements,
  moveIns,
  released,
  sustained,
  stakeVisitors,
  stakeBusiness,
  wardBusinessNote,
  openingNote,
}: {
  meetingId: string;
  announcements: string[];
  moveIns: string[];
  released: RosterChange[];
  sustained: RosterChange[];
  stakeVisitors: string | null;
  stakeBusiness: string | null;
  wardBusinessNote: string | null;
  openingNote: string | null;
}) {
  const [, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
      } catch {
        /* optimistic; the next load reconciles */
      }
    });

  const hasBusiness =
    !!stakeVisitors ||
    !!stakeBusiness ||
    !!wardBusinessNote ||
    !!openingNote ||
    moveIns.length > 0 ||
    released.length > 0 ||
    sustained.length > 0;
  const [showBusiness, setShowBusiness] = useState(hasBusiness);

  return (
    <>
      {/* Announcements */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Megaphone className="size-4 text-[var(--blue30)]" /> Announcements
        </div>
        <StringListEditor
          items={announcements}
          numbered
          multiline
          placeholder="Announcement to read from the stand…"
          addLabel="Add announcement"
          onCommit={(items) =>
            run(() => updateMeetingAnnouncements(meetingId, items))
          }
        />
      </div>

      {/* Ward business & sustainings (collapsible — occasional) */}
      <div>
        <button
          type="button"
          onClick={() => setShowBusiness((v) => !v)}
          className="-my-2 flex min-h-[44px] items-center gap-2 py-2 text-sm font-semibold text-foreground sm:my-0 sm:min-h-0 sm:py-0"
          aria-expanded={showBusiness}
        >
          <ClipboardList className="size-4 text-[var(--blue30)]" />
          Ward business &amp; sustainings
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              showBusiness && "rotate-180"
            )}
          />
        </button>

        {showBusiness && (
          <div className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Stake visitors</Label>
                <Input
                  defaultValue={stakeVisitors ?? ""}
                  placeholder="Visiting stake leaders"
                  onBlur={(e) =>
                    run(() =>
                      updateMeetingText(meetingId, "stakeVisitors", e.target.value)
                    )
                  }
                />
              </div>
              <div>
                <Label>Stake business</Label>
                <Input
                  defaultValue={stakeBusiness ?? ""}
                  placeholder="e.g. turn the time over to …"
                  onBlur={(e) =>
                    run(() =>
                      updateMeetingText(meetingId, "stakeBusiness", e.target.value)
                    )
                  }
                />
              </div>
            </div>

            <div>
              <Label>After-prayer note</Label>
              <Textarea
                defaultValue={openingNote ?? ""}
                placeholder="Special item right after the opening prayer — e.g. a baby blessing invitation"
                onBlur={(e) =>
                  run(() =>
                    updateMeetingText(meetingId, "openingNote", e.target.value)
                  )
                }
              />
            </div>

            <div>
              <Label>Ward business note</Label>
              <Textarea
                defaultValue={wardBusinessNote ?? ""}
                placeholder="e.g. a baptism/confirmation welcome to read"
                onBlur={(e) =>
                  run(() =>
                    updateMeetingText(
                      meetingId,
                      "wardBusinessNote",
                      e.target.value
                    )
                  )
                }
              />
            </div>

            <div>
              <Label>New-family move-ins</Label>
              <StringListEditor
                items={moveIns}
                placeholder="Family name"
                addLabel="Add move-in"
                onCommit={(items) =>
                  run(() => updateMeetingMoveIns(meetingId, items))
                }
              />
            </div>

            <div>
              <Label>Individuals to be released</Label>
              <RosterListEditor
                items={released}
                onCommit={(items) =>
                  run(() => updateMeetingRoster(meetingId, "released", items))
                }
              />
            </div>

            <div>
              <Label>Individuals to be sustained</Label>
              <RosterListEditor
                items={sustained}
                onCommit={(items) =>
                  run(() => updateMeetingRoster(meetingId, "sustained", items))
                }
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
