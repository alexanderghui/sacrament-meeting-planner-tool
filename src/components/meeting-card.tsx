"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Music,
  Mic,
  HandHelping,
  ChevronDown,
  FileText,
  GripVertical,
  Archive,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  MemberCombobox,
  type SpeakerSelection,
} from "@/components/member-combobox";
import { HymnCombobox } from "@/components/hymn-combobox";
import {
  MeetingAgendaFields,
  StringListEditor,
} from "@/components/meeting-agenda-fields";
import { cn } from "@/lib/utils";
import {
  setSpeaker,
  setSpeakerTopic,
  setSpeakerStatus,
  setPrayer,
  reorderSpeakers,
  updateMeetingType,
  updateMeetingText,
  updateMeetingHymn,
  updateMeetingMusicalNumbers,
  removeMeeting,
  archiveMeeting,
} from "@/lib/actions";
import type {
  PlannerMeeting,
  PickerMember,
  SpeakerSlot,
  AssignmentStatusValue,
  MeetingTypeValue,
} from "@/lib/meetings";

const TYPE_LABELS: Record<MeetingTypeValue, string> = {
  sacrament: "Sacrament meeting",
  fast_and_testimony: "Fast & testimony",
  ward_conference: "Ward conference",
  stake_conference: "Stake conference",
  general_conference: "General conference",
  primary_program: "Primary program",
  easter_program: "Easter program",
  christmas_program: "Christmas program",
  no_meeting: "No meeting",
};

// Planner only needs the invite → confirm flow. ("spoke" still exists in the DB
// for imported historical speakers; we just don't offer it as a choice here.)
const STATUS_OPTIONS: { value: AssignmentStatusValue; label: string }[] = [
  { value: "invited", label: "Invited" },
  { value: "confirmed", label: "Confirmed" },
];

const MAX_SPEAKERS = 3;
const HYMN_FIELDS = [
  { key: "openingHymn", label: "Opening" },
  { key: "sacramentHymn", label: "Sacrament" },
  { key: "intermediateHymn", label: "Intermediate" },
  { key: "closingHymn", label: "Closing" },
] as const;

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

// A speaker row that can be dragged by its grip handle to reorder. The handle
// carries the drag listeners (and touch-action: none) so the comboboxes/inputs
// stay fully interactive and the page still scrolls everywhere else.
function SortableSpeakerRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-start gap-2",
        isDragging && "relative z-10 opacity-80"
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder speaker"
        className="mt-1 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--grey2)] hover:text-foreground active:cursor-grabbing sm:size-8"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function MeetingCard({
  meeting: initial,
  members,
  defaultExpanded = false,
}: {
  meeting: PlannerMeeting;
  members: PickerMember[];
  defaultExpanded?: boolean;
}) {
  const [meeting, setMeeting] = useState(initial);
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Topic typed in the "add speaker" row before a name is chosen; applied once
  // the speaker is created so you can fill the topic first.
  const [addTopic, setAddTopic] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
      } catch {
        router.refresh();
      }
    });

  // Drag a speaker by its handle to reorder. PointerSensor covers mouse + touch;
  // the small distance constraint lets taps/scrolls through until you clearly drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const hasProgram = [
    "sacrament",
    "fast_and_testimony",
    "ward_conference",
    "primary_program",
    "easter_program",
    "christmas_program",
  ].includes(meeting.type);
  // Primary program has no bishopric-tracked speakers; everything else with a
  // program does (Easter/Christmas behave like a normal sacrament meeting).
  const hasSpeakers = [
    "sacrament",
    "ward_conference",
    "easter_program",
    "christmas_program",
  ].includes(meeting.type);

  function patchSpeaker(pos: number, patch: Partial<SpeakerSlot>) {
    setMeeting((m) => {
      const existing = m.speakers.find((s) => s.position === pos);
      let speakers: SpeakerSlot[];
      if (existing) {
        speakers = m.speakers.map((s) =>
          s.position === pos ? { ...s, ...patch } : s
        );
      } else {
        speakers = [
          ...m.speakers,
          {
            id: `tmp-${pos}`,
            memberId: null,
            guestName: null,
            name: null,
            position: pos,
            topic: null,
            status: "invited",
            ...patch,
          },
        ];
      }
      return { ...m, speakers: speakers.filter((s) => s.memberId || s.name) };
    });
  }

  function selFields(sel: SpeakerSelection | null) {
    const memberId = sel && "memberId" in sel ? sel.memberId : null;
    const guestName = sel && "guestName" in sel ? sel.guestName : null;
    const name = memberId
      ? members.find((mm) => mm.id === memberId)?.name ?? null
      : guestName;
    return { memberId, guestName, name };
  }

  function onPickSpeaker(pos: number, sel: SpeakerSelection | null) {
    const { memberId, guestName, name } = selFields(sel);
    if (!sel) {
      setMeeting((m) => ({
        ...m,
        speakers: m.speakers.filter((s) => s.position !== pos),
      }));
    } else {
      patchSpeaker(pos, { memberId, guestName, name });
    }
    run(async () => {
      const res = await setSpeaker(meeting.id, pos, sel);
      if (res) patchSpeaker(pos, { id: res.id, status: res.status });
    });
  }

  // Add a speaker from the bottom "add" row, applying any topic typed first.
  function addSpeaker(sel: SpeakerSelection | null) {
    if (!sel) return;
    const f = meeting.speakers.filter((s) => s.name);
    const pos = f.length ? Math.max(...f.map((s) => s.position)) + 1 : 1;
    const topic = addTopic.trim();
    const { memberId, guestName, name } = selFields(sel);
    patchSpeaker(pos, { memberId, guestName, name });
    setAddTopic("");
    run(async () => {
      const res = await setSpeaker(meeting.id, pos, sel);
      if (!res) return;
      patchSpeaker(pos, { id: res.id, status: res.status });
      if (topic) {
        await setSpeakerTopic(res.id, topic);
        patchSpeaker(pos, { topic });
      }
    });
  }

  function handleSpeakerDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ordered = meeting.speakers
      .filter((s) => s.name)
      .sort((a, b) => a.position - b.position);
    const from = ordered.findIndex((s) => s.id === active.id);
    const to = ordered.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(ordered, from, to).map((s, i) => ({
      ...s,
      position: i + 1,
    }));
    setMeeting((m) => ({
      ...m,
      speakers: m.speakers.map((s) => {
        const r = moved.find((x) => x.id === s.id);
        return r ? { ...s, position: r.position } : s;
      }),
    }));
    const ids = moved.map((s) => s.id);
    // Only persist once every row has a real id (freshly-added rows resolve fast).
    if (!ids.some((id) => id.startsWith("tmp-")))
      run(() => reorderSpeakers(meeting.id, ids));
  }

  function pickPrayer(
    role: "opening_prayer" | "closing_prayer",
    sel: SpeakerSelection | null
  ) {
    const { memberId, name } = selFields(sel);
    const key = role === "opening_prayer" ? "openingPrayer" : "closingPrayer";
    setMeeting((m) => ({
      ...m,
      [key]: sel ? { id: "tmp", memberId, name } : null,
    }));
    run(() => setPrayer(meeting.id, role, sel));
  }

  const filled = meeting.speakers
    .filter((s) => s.name)
    .sort((a, b) => a.position - b.position);
  const confirmedCount = filled.filter(
    (s) => s.status === "confirmed" || s.status === "spoke"
  ).length;
  const speakerPreview = filled.map((s) => s.name).join(", ");

  return (
    <Card className="overflow-hidden">
      {/* Collapsed header: toggle + quick "open program" link */}
      <div className="flex w-full items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--grey2)] sm:px-6"
          aria-expanded={expanded}
        >
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
              {formatDate(meeting.date)}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{TYPE_LABELS[meeting.type]}</Badge>
              {hasSpeakers && (
                <Badge
                  variant={
                    filled.length > 0 && confirmedCount === filled.length
                      ? "green"
                      : "neutral"
                  }
                >
                  {confirmedCount}/{filled.length} confirmed
                </Badge>
              )}
              {hasSpeakers && speakerPreview && (
                <span className="truncate text-xs text-muted-foreground">
                  {speakerPreview}
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "size-5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
        <a
          href={`/program/${meeting.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open program in a new tab"
          aria-label="Open program in a new tab"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center border-l border-[var(--grey10)] px-4 text-muted-foreground transition-colors hover:bg-[var(--grey2)] hover:text-[var(--blue30)]"
        >
          <FileText className="size-5" />
        </a>
      </div>

      {expanded && (
        <div className="space-y-6 border-t border-[var(--grey10)] px-6 py-5">
          {/* Meeting type + open formatted program */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:max-w-xs">
              <Label>Meeting type</Label>
              <Select
                value={meeting.type}
                onChange={(e) => {
                  const type = e.target.value as MeetingTypeValue;
                  setMeeting((m) => ({ ...m, type }));
                  run(() => updateMeetingType(meeting.id, type));
                }}
                aria-label="Meeting type"
              >
                {Object.entries(TYPE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <a
              href={`/program/${meeting.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ size: "default" }),
                "min-h-[44px] w-full sm:w-auto"
              )}
            >
              <FileText className="size-4" />
              View program
            </a>
          </div>

          {!hasProgram ? (
            <p className="text-sm text-muted-foreground">
              No ward program to plan for this Sunday.
            </p>
          ) : (
            <>
              {/* Presiding / conducting */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Presiding</Label>
                  <Input
                    defaultValue={meeting.presiding ?? ""}
                    placeholder="Bishop / counselor"
                    onBlur={(e) =>
                      run(() =>
                        updateMeetingText(meeting.id, "presiding", e.target.value)
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Conducting</Label>
                  <Input
                    defaultValue={meeting.conducting ?? ""}
                    placeholder="Counselor conducting"
                    onBlur={(e) =>
                      run(() =>
                        updateMeetingText(meeting.id, "conducting", e.target.value)
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Chorister</Label>
                  <Input
                    defaultValue={meeting.chorister ?? ""}
                    placeholder="Music leader"
                    onBlur={(e) =>
                      run(() =>
                        updateMeetingText(meeting.id, "chorister", e.target.value)
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Pianist / organist</Label>
                  <Input
                    defaultValue={meeting.accompanist ?? ""}
                    placeholder="Accompanist"
                    onBlur={(e) =>
                      run(() =>
                        updateMeetingText(meeting.id, "accompanist", e.target.value)
                      )
                    }
                  />
                </div>
              </div>

              {/* Speakers — drag the grip handle to reorder */}
              {hasSpeakers && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Mic className="size-4 text-[var(--blue30)]" /> Speakers
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleSpeakerDragEnd}
                  >
                    <SortableContext
                      items={filled.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {filled.map((slot) => (
                          <SortableSpeakerRow key={slot.id} id={slot.id}>
                            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                              <MemberCombobox
                                members={members}
                                value={slot.memberId}
                                guestName={slot.memberId ? null : slot.name}
                                onChange={(sel) =>
                                  onPickSpeaker(slot.position, sel)
                                }
                                placeholder="Speaker"
                                ariaLabel={`Speaker ${slot.position}`}
                              />
                              <Input
                                key={`topic-${slot.id}`}
                                defaultValue={slot.topic ?? ""}
                                placeholder="Topic"
                                onBlur={(e) =>
                                  run(() =>
                                    setSpeakerTopic(slot.id, e.target.value)
                                  )
                                }
                              />
                              <StatusControl
                                value={slot.status}
                                onChange={(status) => {
                                  patchSpeaker(slot.position, { status });
                                  run(() => setSpeakerStatus(slot.id, status));
                                }}
                              />
                            </div>
                          </SortableSpeakerRow>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  {filled.length < MAX_SPEAKERS && (
                    <div className="mt-3 flex items-start gap-2">
                      {/* spacer aligns the add row with the dragged rows */}
                      <span className="size-9 shrink-0 sm:size-8" aria-hidden />
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                        <MemberCombobox
                          key={`add-${filled.length}`}
                          members={members}
                          value={null}
                          guestName={null}
                          onChange={addSpeaker}
                          placeholder={`Add speaker ${filled.length + 1}`}
                          ariaLabel="Add speaker"
                        />
                        <Input
                          value={addTopic}
                          onChange={(e) => setAddTopic(e.target.value)}
                          placeholder="Topic"
                        />
                        <StatusControl value="invited" disabled onChange={() => {}} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prayers */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <HandHelping className="size-4 text-[var(--blue30)]" /> Prayers
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Opening</Label>
                    <MemberCombobox
                      members={members}
                      value={meeting.openingPrayer?.memberId ?? null}
                      guestName={
                        meeting.openingPrayer && !meeting.openingPrayer.memberId
                          ? meeting.openingPrayer.name
                          : null
                      }
                      onChange={(sel) => pickPrayer("opening_prayer", sel)}
                      ariaLabel="Opening prayer"
                    />
                  </div>
                  <div>
                    <Label>Closing</Label>
                    <MemberCombobox
                      members={members}
                      value={meeting.closingPrayer?.memberId ?? null}
                      guestName={
                        meeting.closingPrayer && !meeting.closingPrayer.memberId
                          ? meeting.closingPrayer.name
                          : null
                      }
                      onChange={(sel) => pickPrayer("closing_prayer", sel)}
                      ariaLabel="Closing prayer"
                    />
                  </div>
                </div>
              </div>

              {/* Hymns */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Music className="size-4 text-[var(--blue30)]" /> Hymns
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {HYMN_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <Label>{label}</Label>
                      <HymnCombobox
                        value={meeting[key]}
                        ariaLabel={`${label} hymn`}
                        onChange={(n) => {
                          setMeeting((m) => ({ ...m, [key]: n }));
                          run(() => updateMeetingHymn(meeting.id, key, n));
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Label>Musical numbers</Label>
                  <StringListEditor
                    items={meeting.musicalNumbers}
                    placeholder="Choir, solo, or special number — e.g. Ward choir: “O Holy Jesus”"
                    addLabel="Add musical number"
                    onCommit={(items) =>
                      run(() => updateMeetingMusicalNumbers(meeting.id, items))
                    }
                  />
                </div>
              </div>

              {/* Announcements + ward business (feed the printable program) */}
              <MeetingAgendaFields
                meetingId={meeting.id}
                announcements={meeting.announcements}
                moveIns={meeting.moveIns}
                released={meeting.released}
                sustained={meeting.sustained}
                stakeVisitors={meeting.stakeVisitors}
                stakeBusiness={meeting.stakeBusiness}
                wardBusinessNote={meeting.wardBusinessNote}
                openingNote={meeting.openingNote}
              />
            </>
          )}

          {/* Archive (move to History early) / Remove */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--grey10)] pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] text-muted-foreground hover:bg-[var(--grey3)] hover:text-foreground sm:min-h-8"
              title="Move this Sunday to History now, before its date passes"
              onClick={() => run(() => archiveMeeting(meeting.id))}
            >
              <Archive className="size-4" />
              Archive to history
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] text-muted-foreground hover:bg-[var(--status-red-bg)] hover:text-[var(--status-red)] sm:min-h-8"
              onClick={() => {
                if (confirm(`Remove ${formatDate(meeting.date)}?`))
                  run(() => removeMeeting(meeting.id));
              }}
            >
              <Trash2 className="size-4" />
              Remove meeting
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusControl({
  value,
  onChange,
  disabled,
}: {
  value: AssignmentStatusValue;
  onChange: (s: AssignmentStatusValue) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full overflow-hidden rounded-sm border border-input sm:w-auto",
        disabled && "opacity-40"
      )}
    >
      {STATUS_OPTIONS.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 px-2.5 py-2.5 text-xs transition-colors sm:flex-none sm:py-1.5",
              i > 0 && "border-l border-input",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
