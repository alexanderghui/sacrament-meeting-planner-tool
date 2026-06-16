"use client";

import { useMemo, useRef, useState } from "react";
import { X, ChevronDown, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { HYMNS, HYMN_TITLES } from "@/lib/hymns";

export function HymnCombobox({
  value,
  onChange,
  placeholder = "Number or title",
  ariaLabel,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const selectedLabel =
    value != null
      ? HYMN_TITLES[value]
        ? `${value} — ${HYMN_TITLES[value]}`
        : `${value}`
      : "";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HYMNS.slice(0, 8);
    if (/^\d+$/.test(q)) {
      return HYMNS.filter((h) => String(h.number).startsWith(q)).slice(0, 8);
    }
    return HYMNS.filter((h) => h.title.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  // Let users enter a number that isn't in the bundled list (e.g. a brand-new hymn).
  const numericQuery = /^\d+$/.test(query.trim()) ? parseInt(query.trim(), 10) : null;
  const showRaw =
    numericQuery != null &&
    !HYMN_TITLES[numericQuery] &&
    !matches.some((h) => h.number === numericQuery);
  const optionCount = matches.length + (showRaw ? 1 : 0);

  function openList() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
    setQuery("");
    setActive(0);
  }
  function pick(n: number) {
    onChange(n);
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
      if (active < matches.length) pick(matches[active].number);
      else if (showRaw && numericQuery != null) pick(numericQuery);
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
        value={open ? query : selectedLabel}
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

      {value != null && !open ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          aria-label="Clear hymn"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-sm border border-[var(--grey15)] bg-[var(--popover)] shadow-[var(--boxShadowOverlaid)]">
          {optionCount === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No hymns found
            </div>
          ) : (
            <ul role="listbox" className="max-h-60 overflow-auto py-1">
              {matches.map((h, i) => (
                <li
                  key={h.number}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(h.number)}
                  className={cn(
                    "flex cursor-pointer gap-2 px-3 py-2 text-sm",
                    i === active ? "bg-accent text-foreground" : "text-foreground"
                  )}
                >
                  <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                    {h.number}
                  </span>
                  <span className="truncate">{h.title}</span>
                </li>
              ))}
              {showRaw && numericQuery != null && (
                <li
                  role="option"
                  aria-selected={active === matches.length}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(matches.length)}
                  onClick={() => pick(numericQuery)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 border-t border-[var(--grey10)] px-3 py-2 text-sm",
                    active === matches.length
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <Music className="size-4 shrink-0 text-[var(--blue30)]" />
                  Use #{numericQuery} (not in hymnbook list)
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
