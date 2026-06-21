"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUpDown, ChevronDown, ChevronUp, Check, Pencil, Eye, EyeOff } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BUCKET_LABEL,
  BUCKET_COLOR,
  BUCKET_ORDER,
  relativeLabel,
  type Bucket,
} from "@/lib/recency";
import { setMemberGender, setMemberPreferredName, setMemberHidden } from "@/lib/actions";
import { displayName, primaryName, officialSubline } from "@/lib/names";
import { cn } from "@/lib/utils";
import type { MemberRow } from "@/lib/members";

type AgeCat = "adult" | "youth" | "primary";
const AGE_OPTIONS: { value: AgeCat; label: string }[] = [
  { value: "adult", label: "Adults" },
  { value: "youth", label: "Youth" },
  { value: "primary", label: "Primary" },
];
const ALL_AGES: AgeCat[] = AGE_OPTIONS.map((o) => o.value);

const GENDER_OPTIONS: { value: "M" | "F"; label: string }[] = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
];
const ALL_GENDERS: ("M" | "F")[] = GENDER_OPTIONS.map((o) => o.value);

type SortCol = "name" | "household" | "gender" | "age" | "lastSpoke" | "recency" | "talks";
type SortState = { col: SortCol; dir: "asc" | "desc" };
// The direction a column sorts on its FIRST click (second click reverses).
const DEFAULT_DIR: Record<SortCol, "asc" | "desc"> = {
  name: "asc", // A→Z
  household: "asc", // A→Z
  gender: "asc",
  age: "asc", // primary → youth → adult
  lastSpoke: "desc", // most recent talk first
  recency: "desc", // longest since speaking first (most overdue)
  talks: "desc", // most talks first
};
const AGE_RANK: Record<string, number> = { primary: 0, youth: 1, adult: 2 };

/** Dropdown of checkboxes — all checked = show all; uncheck to filter out. */
function MultiSelect<T extends string>({
  allLabel,
  options,
  selected,
  onToggle,
  ariaLabel,
}: {
  allLabel: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const all = selected.size === options.length;
  const summary = all
    ? allLabel
    : options
        .filter((o) => selected.has(o.value))
        .map((o) => o.label)
        .join(", ") || "None";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        className="flex h-10 items-center justify-between gap-2 rounded-sm border border-input bg-[var(--input-background)] px-3 text-sm text-foreground transition-colors hover:bg-accent"
      >
        <span className="max-w-[12rem] truncate">{summary}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-full whitespace-nowrap rounded-sm border border-[var(--grey15)] bg-[var(--popover)] py-1 shadow-[var(--boxShadowOverlaid)]">
          {options.map((o) => {
            const on = selected.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onToggle(o.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input"
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MembersTable({ members }: { members: MemberRow[] }) {
  const [query, setQuery] = useState("");
  const [ageSet, setAgeSet] = useState<Set<AgeCat>>(new Set(ALL_AGES));
  const [genderSet, setGenderSet] = useState<Set<"M" | "F">>(new Set(ALL_GENDERS));
  const [bucketSet, setBucketSet] = useState<Set<Bucket>>(new Set());
  const [sort, setSort] = useState<SortState>({ col: "recency", dir: "desc" });
  function onSort(col: SortCol) {
    setSort((s) =>
      s.col === col
        ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
        : { col, dir: DEFAULT_DIR[col] }
    );
  }
  const sortHead = (col: SortCol, label: string, className?: string) => {
    const active = sort.col === col;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => onSort(col)}
          aria-label={`Sort by ${label}`}
          className="group inline-flex items-center gap-1 rounded-sm hover:text-foreground"
        >
          {label}
          {active ? (
            sort.dir === "asc" ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )
          ) : (
            <ArrowUpDown className="size-3 opacity-0 transition-opacity group-hover:opacity-40" />
          )}
        </button>
      </TableHead>
    );
  };
  const [genderEdits, setGenderEdits] = useState<Record<string, "M" | "F" | null>>({});
  const [prefEdits, setPrefEdits] = useState<Record<string, string | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const cancelEdit = useRef(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function changeGender(id: string, g: "M" | "F" | null) {
    setGenderEdits((p) => ({ ...p, [id]: g }));
    startTransition(async () => {
      try {
        await setMemberGender(id, g);
      } catch {
        router.refresh();
      }
    });
  }

  const effGender = (m: MemberRow) =>
    m.id in genderEdits ? genderEdits[m.id] : m.gender;

  const effPreferred = (m: MemberRow) =>
    m.id in prefEdits ? prefEdits[m.id] : m.preferredName;

  function savePreferred(id: string, value: string) {
    const clean = value.trim() || null;
    setPrefEdits((p) => ({ ...p, [id]: clean }));
    setEditingId(null);
    startTransition(async () => {
      try {
        await setMemberPreferredName(id, clean);
      } catch {
        router.refresh();
      }
    });
  }

  const [hiddenEdits, setHiddenEdits] = useState<Record<string, boolean>>({});
  const [showHidden, setShowHidden] = useState(false);
  const effHidden = (m: MemberRow) =>
    m.id in hiddenEdits ? hiddenEdits[m.id] : m.hidden;

  function changeHidden(id: string, hidden: boolean) {
    setHiddenEdits((p) => ({ ...p, [id]: hidden }));
    startTransition(async () => {
      try {
        await setMemberHidden(id, hidden);
      } catch {
        router.refresh();
      }
    });
  }

  const anyFilter =
    ageSet.size < ALL_AGES.length ||
    genderSet.size < ALL_GENDERS.length ||
    bucketSet.size > 0;
  function clearFilters() {
    setAgeSet(new Set(ALL_AGES));
    setGenderSet(new Set(ALL_GENDERS));
    setBucketSet(new Set());
  }

  const hiddenCount = useMemo(
    () => members.filter((m) => effHidden(m)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, hiddenEdits]
  );

  const rows = useMemo(() => {
    // Hidden members are excluded from the recency view unless explicitly shown.
    let r = showHidden ? members : members.filter((m) => !effHidden(m));
    const q = query.trim().toLowerCase();
    if (q)
      r = r.filter((m) => {
        const pref = effPreferred(m);
        const hay = `${primaryName(m.fullName, pref)} ${displayName(
          m.fullName
        )} ${pref ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    // Age/gender: all checked = show all; otherwise keep only checked categories.
    if (ageSet.size < ALL_AGES.length)
      r = r.filter((m) => m.ageCategory && ageSet.has(m.ageCategory as AgeCat));
    if (genderSet.size < ALL_GENDERS.length)
      r = r.filter((m) => {
        const g = effGender(m);
        return g === "M" || g === "F" ? genderSet.has(g) : false;
      });
    // Recency pills: empty = all; otherwise keep selected buckets.
    if (bucketSet.size) r = r.filter((m) => bucketSet.has(m.bucket));

    return [...r].sort((a, b) => {
      let c = 0;
      switch (sort.col) {
        case "name": c = a.displayName.localeCompare(b.displayName); break;
        case "household": c = (a.household ?? "").localeCompare(b.household ?? ""); break;
        case "gender": c = (effGender(a) ?? "~").localeCompare(effGender(b) ?? "~"); break;
        case "age": c = (AGE_RANK[a.ageCategory ?? ""] ?? 9) - (AGE_RANK[b.ageCategory ?? ""] ?? 9); break;
        case "lastSpoke": c = (a.lastSpoke ?? "").localeCompare(b.lastSpoke ?? ""); break;
        case "recency": c = (a.daysSince ?? Number.POSITIVE_INFINITY) - (b.daysSince ?? Number.POSITIVE_INFINITY); break;
        case "talks": c = a.talkCount - b.talkCount; break;
      }
      if (sort.dir === "desc") c = -c;
      // Stable tiebreak by official name so equal rows keep a consistent order.
      return c !== 0 ? c : displayName(a.fullName).localeCompare(displayName(b.fullName));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, query, ageSet, genderSet, bucketSet, genderEdits, prefEdits, hiddenEdits, showHidden, sort]);

  function toggle<T>(
    setFn: React.Dispatch<React.SetStateAction<Set<T>>>,
    v: T
  ) {
    setFn((prev) => {
      const n = new Set(prev);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  }

  // ---- Per-row pieces shared between the desktop <Table> and mobile <Card>.
  // Both renderers consume these so the inline business logic lives in one place.

  // Name block: inline preferred-name editor, primary/official name, Hidden badge,
  // and the pencil edit trigger. `editClassName` lets the mobile card always show
  // the pencil (no hover) for touch.
  const nameBlock = (m: MemberRow, editClassName: string) => {
    const isHidden = effHidden(m);
    if (editingId === m.id) {
      return (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`pref-${m.id}`}
            className="text-[11px] font-medium text-muted-foreground"
          >
            Preferred name
          </label>
          <input
            id={`pref-${m.id}`}
            autoFocus
            defaultValue={effPreferred(m) ?? ""}
            placeholder="Name they go by"
            aria-label={`Preferred name for ${displayName(m.fullName)}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                cancelEdit.current = true;
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              if (cancelEdit.current) {
                cancelEdit.current = false;
                setEditingId(null);
                return;
              }
              savePreferred(m.id, e.target.value);
            }}
            className="w-44 rounded-sm border border-input bg-[var(--input-background)] px-2 py-1 text-sm outline-none focus-visible:border-[var(--blue30)] focus-visible:ring-2 focus-visible:ring-[var(--blue30)]/30"
          />
          <span className="text-xs text-muted-foreground">
            Official: {displayName(m.fullName)}
          </span>
        </div>
      );
    }
    return (
      <div className="group/name flex items-start gap-1.5">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            {primaryName(m.fullName, effPreferred(m))}
            {isHidden && (
              <Badge variant="neutral" className="font-normal">
                Hidden
              </Badge>
            )}
          </span>
          {officialSubline(m.fullName, effPreferred(m)) && (
            <span className="text-xs text-muted-foreground">
              {officialSubline(m.fullName, effPreferred(m))}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditingId(m.id)}
          aria-label={`Edit preferred name for ${displayName(m.fullName)}`}
          className={cn(
            "shrink-0 text-muted-foreground transition-opacity hover:text-foreground focus:opacity-100",
            editClassName
          )}
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    );
  };

  // Inline gender <select>.
  const genderControl = (m: MemberRow, className?: string) => (
    <select
      value={(m.id in genderEdits ? genderEdits[m.id] : m.gender) ?? ""}
      onChange={(e) =>
        changeGender(
          m.id,
          e.target.value === "" ? null : (e.target.value as "M" | "F")
        )
      }
      aria-label={`Gender for ${m.displayName}`}
      className={cn(
        "rounded-sm border border-input bg-[var(--input-background)] px-1.5 py-1 text-sm outline-none focus-visible:border-[var(--blue30)] focus-visible:ring-2 focus-visible:ring-[var(--blue30)]/30",
        className
      )}
    >
      <option value="">—</option>
      <option value="M">M</option>
      <option value="F">F</option>
    </select>
  );

  // Recency badge (BUCKET_COLOR/BUCKET_LABEL).
  const recencyBadge = (m: MemberRow) => (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: BUCKET_COLOR[m.bucket].bg,
        color: BUCKET_COLOR[m.bucket].fg,
      }}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: BUCKET_COLOR[m.bucket].fg }}
      />
      {BUCKET_LABEL[m.bucket]}
    </span>
  );

  // Hide / unhide toggle. `forceVisible` keeps it always tappable on mobile.
  const hideButton = (m: MemberRow, forceVisible: boolean) => {
    const isHidden = effHidden(m);
    return (
      <button
        type="button"
        onClick={() => changeHidden(m.id, !isHidden)}
        aria-label={
          isHidden
            ? `Unhide ${displayName(m.fullName)}`
            : `Hide ${displayName(m.fullName)}`
        }
        title={isHidden ? "Show in list" : "Hide from list"}
        className={cn(
          "rounded-sm p-1 text-muted-foreground transition-opacity hover:text-foreground focus:opacity-100",
          forceVisible || isHidden
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        )}
      >
        {isHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelect
              allLabel="All ages"
              ariaLabel="Filter by age"
              options={AGE_OPTIONS}
              selected={ageSet}
              onToggle={(v) => toggle(setAgeSet, v)}
            />
            <MultiSelect
              allLabel="All genders"
              ariaLabel="Filter by gender"
              options={GENDER_OPTIONS}
              selected={genderSet}
              onToggle={(v) => toggle(setGenderSet, v)}
            />
          </div>
        </div>

        {/* Recency filter — color-coded, the page's primary dimension. Multi-select. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {BUCKET_ORDER.map((b) => {
            const on = bucketSet.has(b);
            const color = BUCKET_COLOR[b];
            return (
              <button
                key={b}
                type="button"
                onClick={() => toggle(setBucketSet, b)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
                  !on && "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                style={on ? { backgroundColor: color.bg, color: color.fg } : undefined}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: color.fg }}
                />
                {BUCKET_LABEL[b]}
              </button>
            );
          })}
          {anyFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {rows.length} of {members.length - hiddenCount} members
        </span>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowHidden((s) => !s)}
            aria-pressed={showHidden}
            className="inline-flex items-center gap-1.5 rounded-sm text-[var(--link)] hover:text-[var(--link-hover)]"
          >
            {showHidden ? (
              <Eye className="size-3.5" />
            ) : (
              <EyeOff className="size-3.5" />
            )}
            {showHidden ? "Hide hidden" : `Show ${hiddenCount} hidden`}
          </button>
        )}
      </div>

      {/* Desktop / tablet: the original sortable table, unchanged at sm+. */}
      <div className="hidden rounded-sm border border-[var(--grey15)] bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {sortHead("name", "Name")}
              {sortHead("household", "Household", "hidden sm:table-cell")}
              {sortHead("gender", "Gender")}
              {sortHead("age", "Age", "hidden md:table-cell")}
              {sortHead("lastSpoke", "Last spoke")}
              {sortHead("recency", "Recency")}
              {sortHead("talks", "Total talks", "hidden lg:table-cell text-right")}
              <TableHead className="w-10" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const isHidden = effHidden(m);
              return (
              <TableRow key={m.id} className={cn("group", isHidden && "opacity-55")}>
                <TableCell className="font-normal text-foreground">
                  {nameBlock(
                    m,
                    "mt-0.5 opacity-0 group-hover/name:opacity-100"
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {m.household ?? "—"}
                </TableCell>
                <TableCell>{genderControl(m)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {m.ageCategory ? (
                    <Badge variant="outline" className="capitalize">
                      {m.ageCategory}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-foreground">
                      {fmtDate(m.lastSpoke)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {relativeLabel(m.daysSince)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{recencyBadge(m)}</TableCell>
                <TableCell className="hidden lg:table-cell text-right text-muted-foreground">
                  {m.talkCount}
                </TableCell>
                <TableCell className="w-10 pr-3 text-right">
                  {hideButton(m, false)}
                </TableCell>
              </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="py-12 text-center text-muted-foreground"
                >
                  No members match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Phone: stacked card list — same `rows`, same handlers, no horizontal scroll. */}
      <div className="space-y-2.5 sm:hidden">
        {rows.map((m) => {
          const isHidden = effHidden(m);
          return (
            <div
              key={m.id}
              className={cn(
                "rounded-sm border border-[var(--grey15)] bg-card p-3.5",
                isHidden && "opacity-55"
              )}
            >
              {/* Title row: name block (left) + prominent recency badge (right). */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {nameBlock(m, "mt-0.5 -mr-1 p-1")}
                </div>
                <div className="shrink-0">{recencyBadge(m)}</div>
              </div>

              {/* Secondary line: last spoke + relative label + total talks. */}
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className="text-foreground">{fmtDate(m.lastSpoke)}</span>
                <span className="text-xs text-muted-foreground">
                  {relativeLabel(m.daysSince)}
                </span>
                <span aria-hidden className="text-muted-foreground">
                  ·
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.talkCount} {m.talkCount === 1 ? "talk" : "talks"}
                </span>
              </div>

              {/* Actions: gender select + hide toggle, all >=44px tap targets. */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Gender
                  {genderControl(m, "min-h-11 px-2 py-2")}
                </label>
                <span className="[&>button]:min-h-11 [&>button]:min-w-11 [&>button]:flex [&>button]:items-center [&>button]:justify-center">
                  {hideButton(m, true)}
                </span>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-sm border border-[var(--grey15)] bg-card py-12 text-center text-muted-foreground">
            No members match these filters.
          </div>
        )}
      </div>
    </div>
  );
}
