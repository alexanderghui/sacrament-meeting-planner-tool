"use client";

import { useMemo, useRef, useState } from "react";
import { X, ChevronDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PickerMember } from "@/lib/meetings";

export type SpeakerSelection = { memberId: string } | { guestName: string };

export function MemberCombobox({
  members,
  value,
  guestName,
  onChange,
  placeholder = "Search or type a name",
  ariaLabel,
  allowGuest = true,
}: {
  members: PickerMember[];
  value: string | null;
  guestName?: string | null;
  onChange: (sel: SpeakerSelection | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  allowGuest?: boolean;
}) {
  const selectedName = value
    ? members.find((m) => m.id === value)?.name ?? ""
    : guestName ?? "";
  const isGuest = !value && !!guestName;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            !!m.alias?.toLowerCase().includes(q)
        )
      : members;
    return list.slice(0, 8);
  }, [members, query]);

  const trimmed = query.trim();
  const showGuest =
    allowGuest &&
    trimmed.length > 1 &&
    !members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
  const optionCount = matches.length + (showGuest ? 1 : 0);

  function openList() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
    setQuery("");
    setActive(0);
  }
  function pickMember(m: PickerMember) {
    onChange({ memberId: m.id });
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }
  function pickGuest() {
    if (!trimmed) return;
    onChange({ guestName: trimmed });
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }
  function clear() {
    onChange(null);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return openList();
      setActive((a) => Math.min(a + 1, optionCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (active < matches.length) pickMember(matches[active]);
      else if (showGuest) pickGuest();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        className="flex h-10 w-full rounded-sm border border-input bg-[var(--input-background)] px-3 py-1 pr-8 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--blue30)] focus-visible:ring-2 focus-visible:ring-[var(--blue30)]/30"
        placeholder={placeholder}
        value={open ? query : selectedName}
        onFocus={openList}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />

      {(value || isGuest) && !open ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          aria-label="Clear selection"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-sm border border-[var(--grey15)] bg-[var(--popover)] shadow-[var(--boxShadowOverlaid)]">
          {matches.length === 0 && !showGuest ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No members found
            </div>
          ) : (
            <ul role="listbox" className="max-h-60 overflow-auto py-1">
              {matches.map((m, i) => (
                <li
                  key={m.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pickMember(m)}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm",
                    i === active
                      ? "bg-accent text-foreground"
                      : "text-foreground"
                  )}
                >
                  {m.name}
                </li>
              ))}
              {showGuest && (
                <li
                  role="option"
                  aria-selected={active === matches.length}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(matches.length)}
                  onClick={pickGuest}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 border-t border-[var(--grey10)] px-3 py-2 text-sm",
                    active === matches.length
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <UserPlus className="size-4 shrink-0 text-[var(--blue30)]" />
                  Use “{trimmed}” — guest / visitor
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
