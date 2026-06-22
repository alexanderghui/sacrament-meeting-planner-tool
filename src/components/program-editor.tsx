"use client";

import { useEffect, useState, useTransition } from "react";
import { GripVertical, X, Plus, Mic, Music, Music2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HymnCombobox } from "@/components/hymn-combobox";
import {
  MemberCombobox,
  type SpeakerSelection,
} from "@/components/member-combobox";
import { cn } from "@/lib/utils";
import {
  setSpeaker,
  setSpeakerTopic,
  setSpeakerStatus,
  setProgramBody,
  updateMeetingHymn,
} from "@/lib/actions";
import type {
  PickerMember,
  SpeakerSlot,
  ProgramBodyItem,
  AssignmentStatusValue,
} from "@/lib/meetings";

const STATUS_OPTIONS: { value: AssignmentStatusValue; label: string }[] = [
  { value: "invited", label: "Invited" },
  { value: "confirmed", label: "Confirmed" },
];

let _rid = 0;
const newId = () => `row-${_rid++}`;

// One editable program row. Speakers reference their assignment by `pos`; music
// carries text inline; "hymn" is the (single) intermediate-hymn marker.
type Row =
  | { id: string; kind: "speaker"; pos: number }
  | { id: string; kind: "music"; text: string }
  | { id: string; kind: "hymn" };

function selFields(members: PickerMember[], sel: SpeakerSelection | null) {
  const memberId = sel && "memberId" in sel ? sel.memberId : null;
  const guestName = sel && "guestName" in sel ? sel.guestName : null;
  const name = memberId
    ? members.find((m) => m.id === memberId)?.name ?? null
    : guestName;
  return { memberId, guestName, name };
}

// Default placement used to seed the editor for meetings that have never been
// arranged (matches the agenda's legacy ordering: music/hymn before the last
// speaker).
function materialize(
  speakers: SpeakerSlot[],
  intermediateHymn: number | null,
  musicalNumbers: string[]
): Row[] {
  const sp = speakers
    .filter((s) => s.name)
    .sort((a, b) => a.position - b.position)
    .map((s): Row => ({ id: newId(), kind: "speaker", pos: s.position }));
  const mid: Row[] = [];
  if (intermediateHymn != null) mid.push({ id: newId(), kind: "hymn" });
  for (const t of musicalNumbers)
    if (t.trim()) mid.push({ id: newId(), kind: "music", text: t.trim() });
  if (mid.length === 0) return sp;
  if (sp.length <= 1) return [...sp, ...mid];
  return [...sp.slice(0, -1), ...mid, sp[sp.length - 1]];
}

function bodyToRows(body: ProgramBodyItem[]): Row[] {
  return body.map((i) =>
    i.kind === "speaker"
      ? { id: newId(), kind: "speaker", pos: i.pos }
      : i.kind === "music"
      ? { id: newId(), kind: "music", text: i.text }
      : { id: newId(), kind: "hymn" }
  );
}

const rowsToBody = (rows: Row[]): ProgramBodyItem[] =>
  rows.map((r) =>
    r.kind === "speaker"
      ? { kind: "speaker", pos: r.pos }
      : r.kind === "music"
      ? { kind: "music", text: r.text }
      : { kind: "hymn" }
  );

export function ProgramEditor({
  meetingId,
  members,
  allowSpeakers = true,
  initialSpeakers,
  initialIntermediateHymn,
  initialMusicalNumbers,
  initialProgramBody,
  onSpeakersChange,
}: {
  meetingId: string;
  members: PickerMember[];
  allowSpeakers?: boolean;
  initialSpeakers: SpeakerSlot[];
  initialIntermediateHymn: number | null;
  initialMusicalNumbers: string[];
  initialProgramBody: ProgramBodyItem[];
  onSpeakersChange?: (
    speakers: { name: string | null; status: AssignmentStatusValue }[]
  ) => void;
}) {
  const [, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
      } catch {
        /* optimistic; reconciled on next load */
      }
    });

  const [rows, setRows] = useState<Row[]>(() =>
    initialProgramBody.length
      ? bodyToRows(initialProgramBody)
      : materialize(initialSpeakers, initialIntermediateHymn, initialMusicalNumbers)
  );
  // Speaker data keyed by position (the stable reference used in the body).
  const [slots, setSlots] = useState<Map<number, SpeakerSlot>>(
    () => new Map(initialSpeakers.filter((s) => s.name).map((s) => [s.position, s]))
  );
  const [hymn, setHymn] = useState<number | null>(initialIntermediateHymn);
  const [addTopic, setAddTopic] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Keep the collapsed-card preview in sync (speaker names + confirmed count) in
  // program order.
  useEffect(() => {
    onSpeakersChange?.(
      rows
        .filter((r): r is Extract<Row, { kind: "speaker" }> => r.kind === "speaker")
        .map((r) => slots.get(r.pos))
        .filter((s): s is SpeakerSlot => !!s && !!s.name)
        .map((s) => ({ name: s.name, status: s.status }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, slots]);

  const persist = (next: Row[]) => run(() => setProgramBody(meetingId, rowsToBody(next)));
  const setRowsAndPersist = (next: Row[]) => {
    setRows(next);
    persist(next);
  };

  const nextPos = () => {
    const positions = [...slots.keys()];
    return positions.length ? Math.max(...positions) + 1 : 1;
  };
  const patchSlot = (pos: number, patch: Partial<SpeakerSlot>) =>
    setSlots((m) => {
      const next = new Map(m);
      const cur =
        next.get(pos) ?? {
          id: `tmp-${pos}`,
          memberId: null,
          guestName: null,
          name: null,
          position: pos,
          topic: null,
          status: "invited" as AssignmentStatusValue,
        };
      next.set(pos, { ...cur, ...patch });
      return next;
    });

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.id === active.id);
    const to = rows.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;
    setRowsAndPersist(arrayMove(rows, from, to));
  }

  // ---- speaker rows ----
  function pickExistingSpeaker(pos: number, sel: SpeakerSelection | null) {
    if (!sel) {
      // Remove this speaker.
      setSlots((m) => {
        const next = new Map(m);
        next.delete(pos);
        return next;
      });
      setRowsAndPersist(rows.filter((r) => !(r.kind === "speaker" && r.pos === pos)));
      run(() => setSpeaker(meetingId, pos, null));
      return;
    }
    const { memberId, guestName, name } = selFields(members, sel);
    patchSlot(pos, { memberId, guestName, name });
    run(async () => {
      const res = await setSpeaker(meetingId, pos, sel);
      if (res) patchSlot(pos, { id: res.id, status: res.status });
    });
  }

  function addSpeaker(sel: SpeakerSelection | null) {
    if (!sel) return;
    const pos = nextPos();
    const topic = addTopic.trim();
    const { memberId, guestName, name } = selFields(members, sel);
    patchSlot(pos, { memberId, guestName, name, topic: topic || null });
    setAddTopic("");
    setRowsAndPersist([...rows, { id: newId(), kind: "speaker", pos }]);
    run(async () => {
      const res = await setSpeaker(meetingId, pos, sel);
      if (!res) return;
      patchSlot(pos, { id: res.id, status: res.status });
      if (topic) {
        await setSpeakerTopic(res.id, topic);
        patchSlot(pos, { topic });
      }
    });
  }

  // ---- music rows ----
  const addMusic = () =>
    setRowsAndPersist([...rows, { id: newId(), kind: "music", text: "" }]);
  const setMusic = (id: string, text: string) =>
    setRows((rs) => rs.map((r) => (r.id === id && r.kind === "music" ? { ...r, text } : r)));
  const commitMusic = () => persist(rows);

  // ---- hymn row (at most one) ----
  const hasHymn = rows.some((r) => r.kind === "hymn");
  const addHymn = () => {
    if (hasHymn) return;
    setRowsAndPersist([...rows, { id: newId(), kind: "hymn" }]);
  };
  const setHymnValue = (n: number | null) => {
    setHymn(n);
    run(() => updateMeetingHymn(meetingId, "intermediateHymn", n));
  };

  const removeRow = (id: string) => {
    const row = rows.find((r) => r.id === id);
    const next = rows.filter((r) => r.id !== id);
    if (row?.kind === "hymn") setHymnValue(null);
    setRowsAndPersist(next);
  };

  let speakerNo = 0;
  const visibleRows = allowSpeakers
    ? rows
    : rows.filter((r) => r.kind !== "speaker");

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Mic className="size-4 text-[var(--blue30)]" /> Program order
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Drag the handles to set the order speakers, musical numbers, and the
        intermediate hymn appear in the meeting.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {visibleRows.map((row) => {
              if (row.kind === "speaker") {
                speakerNo += 1;
                const slot = slots.get(row.pos);
                const ready = !!slot?.id && !slot.id.startsWith("tmp-");
                return (
                  <SortableRow key={row.id} id={row.id}>
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                      <MemberCombobox
                        members={members}
                        value={slot?.memberId ?? null}
                        guestName={slot?.memberId ? null : slot?.name ?? null}
                        onChange={(sel) => pickExistingSpeaker(row.pos, sel)}
                        placeholder={`Speaker ${speakerNo}`}
                        ariaLabel={`Speaker ${speakerNo}`}
                      />
                      <Input
                        key={`topic-${slot?.id ?? row.pos}`}
                        defaultValue={slot?.topic ?? ""}
                        placeholder="Topic"
                        disabled={!ready}
                        onBlur={(e) => {
                          if (ready) run(() => setSpeakerTopic(slot!.id, e.target.value));
                        }}
                      />
                      <StatusControl
                        disabled={!ready}
                        value={slot?.status ?? "invited"}
                        onChange={(status) => {
                          patchSlot(row.pos, { status });
                          if (ready) run(() => setSpeakerStatus(slot!.id, status));
                        }}
                      />
                    </div>
                  </SortableRow>
                );
              }
              if (row.kind === "music") {
                return (
                  <SortableRow key={row.id} id={row.id} onRemove={() => removeRow(row.id)}>
                    <div className="flex items-center gap-2">
                      <Music2 className="size-4 shrink-0 text-[var(--blue30)]" />
                      <Input
                        value={row.text}
                        placeholder="Musical number — e.g. Ward choir: “O Holy Jesus”"
                        onChange={(e) => setMusic(row.id, e.target.value)}
                        onBlur={commitMusic}
                      />
                    </div>
                  </SortableRow>
                );
              }
              return (
                <SortableRow key={row.id} id={row.id} onRemove={() => removeRow(row.id)}>
                  <div className="flex items-center gap-2">
                    <Music className="size-4 shrink-0 text-[var(--blue30)]" />
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Intermediate hymn
                    </span>
                    <div className="min-w-0 flex-1">
                      <HymnCombobox
                        value={hymn}
                        ariaLabel="Intermediate hymn"
                        onChange={setHymnValue}
                      />
                    </div>
                  </div>
                </SortableRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add a speaker (topic can be filled before the name) */}
      {allowSpeakers && (
      <div className="mt-3 flex items-start gap-2">
        <span
          className="mt-1 flex size-9 shrink-0 items-center justify-center text-[var(--grey15)] sm:size-8"
          aria-hidden
        >
          <GripVertical className="size-4" />
        </span>
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <MemberCombobox
            key={`add-${rows.length}`}
            members={members}
            value={null}
            guestName={null}
            onChange={addSpeaker}
            placeholder="Add speaker"
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

      <div className="mt-3 flex flex-wrap gap-2 pl-11 sm:pl-10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px] sm:min-h-8"
          onClick={addMusic}
        >
          <Plus className="size-4" />
          Add musical number
        </Button>
        {!hasHymn && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px] sm:min-h-8"
            onClick={addHymn}
          >
            <Plus className="size-4" />
            Add intermediate hymn
          </Button>
        )}
      </div>
    </div>
  );
}

function SortableRow({
  id,
  children,
  onRemove,
}: {
  id: string;
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-start gap-2", isDragging && "relative z-10 opacity-80")}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="mt-1 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--grey2)] hover:text-foreground active:cursor-grabbing sm:size-8"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--status-red-bg)] hover:text-[var(--status-red)] sm:size-8"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
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
