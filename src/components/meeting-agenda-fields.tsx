"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  GripVertical,
  Megaphone,
  ClipboardList,
  ChevronDown,
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
import { Input, Textarea } from "@/components/ui/input";
import { AutosaveInput, AutosaveTextarea } from "@/components/autosave-input";
import { useDebouncedCommit } from "@/lib/use-debounced-commit";
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

// dnd-kit needs a stable id per row that survives reordering; announcements are
// stored as a plain string[], so we carry an id alongside each value in state
// and persist only the strings.
type TextItem = { id: string; value: string };
let _textId = 0;
const newTextId = () => `s-${_textId++}`;

export function StringListEditor({
  items: initial,
  placeholder,
  addLabel,
  multiline = false,
  sortable = false,
  onCommit,
}: {
  items: string[];
  placeholder: string;
  addLabel: string;
  multiline?: boolean;
  sortable?: boolean;
  onCommit: (items: string[]) => void;
}) {
  const [items, setItems] = useState<TextItem[]>(() =>
    initial.map((value) => ({ id: newTextId(), value }))
  );
  const { schedule, flush } = useDebouncedCommit<TextItem[]>((next) =>
    onCommit(next.map((x) => x.value))
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const setAt = (id: string, v: string) => {
    const next = items.map((x) => (x.id === id ? { ...x, value: v } : x));
    setItems(next);
    schedule(next); // autosave ~700ms after typing stops
  };
  const removeAt = (id: string) => {
    const next = items.filter((x) => x.id !== id);
    setItems(next);
    schedule(next);
    flush(); // removal is a discrete action — save now (and cancel any pending)
  };
  const add = () => setItems((arr) => [...arr, { id: newTextId(), value: "" }]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((x) => x.id === active.id);
    const to = items.findIndex((x) => x.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to);
    setItems(next);
    schedule(next);
    flush(); // reordering is a discrete action — persist the new order now
  }

  const field = (item: TextItem) =>
    multiline ? (
      <Textarea
        value={item.value}
        placeholder={placeholder}
        onChange={(e) => setAt(item.id, e.target.value)}
        onBlur={() => flush()}
      />
    ) : (
      <Input
        value={item.value}
        placeholder={placeholder}
        onChange={(e) => setAt(item.id, e.target.value)}
        onBlur={() => flush()}
      />
    );

  const addButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-[44px] sm:min-h-8"
      onClick={add}
    >
      <Plus className="size-4" />
      {addLabel}
    </Button>
  );

  // Drag-to-reorder variant — mirrors the Program order rows exactly.
  if (sortable) {
    return (
      <div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((x) => x.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {items.map((item) => (
                <SortableTextRow
                  key={item.id}
                  id={item.id}
                  onRemove={() => removeAt(item.id)}
                >
                  {field(item)}
                </SortableTextRow>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="mt-3 pl-11 sm:pl-10">{addButton}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{field(item)}</div>
          <RemoveButton onClick={() => removeAt(item.id)} />
        </div>
      ))}
      {addButton}
    </div>
  );
}

// Identical chrome to the Program order rows (see program-editor.tsx) so the
// drag handle, spacing, and remove button look and behave the same.
function SortableTextRow({
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

/* ---------------------- roster-list editor ------------------------ */

function RosterListEditor({
  items: initial,
  onCommit,
}: {
  items: RosterChange[];
  onCommit: (items: RosterChange[]) => void;
}) {
  const [items, setItems] = useState<RosterChange[]>(initial);
  const { schedule, flush } = useDebouncedCommit(onCommit);
  const setAt = (i: number, patch: Partial<RosterChange>) => {
    const next = items.map((x, j) => (j === i ? { ...x, ...patch } : x));
    setItems(next);
    schedule(next); // autosave ~700ms after typing stops
  };
  const removeAt = (i: number) => {
    const next = items.filter((_, j) => j !== i);
    setItems(next);
    schedule(next);
    flush(); // removal is a discrete action — save now (and cancel any pending)
  };

  return (
    <div className="space-y-2">
      {items.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <Input
              value={row.name}
              placeholder="Name"
              onChange={(e) => setAt(i, { name: e.target.value })}
              onBlur={() => flush()}
            />
            <Input
              value={row.calling}
              placeholder="Calling"
              onChange={(e) => setAt(i, { calling: e.target.value })}
              onBlur={() => flush()}
            />
          </div>
          <RemoveButton onClick={() => removeAt(i)} />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-[44px] sm:min-h-8"
        onClick={() =>
          setItems((arr) => [
            ...arr,
            { id: crypto.randomUUID(), name: "", calling: "" },
          ])
        }
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
  part = "all",
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
  part?: "all" | "announcements" | "business";
}) {
  const [, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
      } catch {
        // Don't silently drop a failed save (the "I typed it but it didn't
        // save" bug) — reload authoritative state so the value visibly reverts
        // instead of looking saved.
        router.refresh();
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
      {(part === "all" || part === "announcements") && (
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Megaphone className="size-4 text-[var(--blue30)]" /> Announcements
        </div>
        <StringListEditor
          items={announcements}
          sortable
          multiline
          placeholder="Announcement to read from the stand…"
          addLabel="Add announcement"
          onCommit={(items) =>
            run(() => updateMeetingAnnouncements(meetingId, items))
          }
        />
      </div>
      )}

      {/* Ward business & sustainings (collapsible — occasional) */}
      {(part === "all" || part === "business") && (
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
                <AutosaveInput
                  defaultValue={stakeVisitors ?? ""}
                  placeholder="Visiting stake leaders"
                  onCommit={(v) =>
                    run(() => updateMeetingText(meetingId, "stakeVisitors", v))
                  }
                />
              </div>
              <div>
                <Label>Stake business</Label>
                <AutosaveInput
                  defaultValue={stakeBusiness ?? ""}
                  placeholder="e.g. turn the time over to …"
                  onCommit={(v) =>
                    run(() => updateMeetingText(meetingId, "stakeBusiness", v))
                  }
                />
              </div>
            </div>

            <div>
              <Label>After-prayer note</Label>
              <AutosaveTextarea
                defaultValue={openingNote ?? ""}
                placeholder="Special item right after the opening prayer — e.g. a baby blessing invitation"
                onCommit={(v) =>
                  run(() => updateMeetingText(meetingId, "openingNote", v))
                }
              />
            </div>

            <div>
              <Label>Ward business note</Label>
              <AutosaveTextarea
                defaultValue={wardBusinessNote ?? ""}
                placeholder="e.g. a baptism/confirmation welcome to read"
                onCommit={(v) =>
                  run(() => updateMeetingText(meetingId, "wardBusinessNote", v))
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
      )}
    </>
  );
}
