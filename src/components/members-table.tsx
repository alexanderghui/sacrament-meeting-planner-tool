"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUpDown, ChevronDown, Check, Pencil, Eye, EyeOff } from "lucide-react";
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
import { BUCKET_LABEL, relativeLabel, type Bucket } from "@/lib/recency";
import { setMemberGender, setMemberPreferredName, setMemberHidden } from "@/lib/actions";
import { displayName, primaryName, officialSubline } from "@/lib/names";
import { cn } from "@/lib/utils";
import type { MemberRow } from "@/lib/members";

const BUCKET_BADGE: Record<Bucket, "red" | "neutral" | "amber" | "green"> = {
  red: "red",
  neutral: "neutral",
  amber: "amber",
  green: "green",
};

const BUCKET_DOT: Record<Bucket, string> = {
  red: "var(--status-red)",
  neutral: "var(--status-neutral)",
  amber: "var(--status-amber)",
  green: "var(--status-green)",
};

// Color-coded recency filter pills — the page's primary dimension. Multi-select.
const RECENCY_PILLS: {
  value: Bucket;
  label: string;
  dot: string;
  active: string;
}[] = [
  { value: "green", label: "Over a year / never", dot: "var(--status-green)", active: "bg-[var(--status-green-bg)] text-[var(--status-green)]" },
  { value: "amber", label: "6–12 mo", dot: "var(--status-amber)", active: "bg-[var(--status-amber-bg)] text-[var(--status-amber)]" },
  { value: "neutral", label: "3–6 mo", dot: "var(--status-neutral)", active: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)]" },
  { value: "red", label: "Under 3 mo", dot: "var(--status-red)", active: "bg-[var(--status-red-bg)] text-[var(--status-red)]" },
];

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

type Sort = "recency" | "name";

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
  const [sort, setSort] = useState<Sort>("recency");
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
      if (sort === "name")
        return displayName(a.fullName).localeCompare(displayName(b.fullName));
      const av = a.daysSince ?? Number.POSITIVE_INFINITY;
      const bv = b.daysSince ?? Number.POSITIVE_INFINITY;
      return bv - av;
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
            <button
              type="button"
              onClick={() => setSort(sort === "recency" ? "name" : "recency")}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-sm border border-input bg-background px-3 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <ArrowUpDown className="size-4" />
              Sort: {sort === "recency" ? "Most overdue" : "Name"}
            </button>
          </div>
        </div>

        {/* Recency filter — color-coded, the page's primary dimension. Multi-select. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {RECENCY_PILLS.map((p) => {
            const on = bucketSet.has(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => toggle(setBucketSet, p.value)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
                  on
                    ? p.active
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: p.dot }}
                />
                {p.label}
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

      <div className="rounded-sm border border-[var(--grey15)] bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Household</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead className="hidden md:table-cell">Age</TableHead>
              <TableHead>Last spoke</TableHead>
              <TableHead>Recency</TableHead>
              <TableHead className="hidden lg:table-cell text-right">
                Total talks
              </TableHead>
              <TableHead className="w-10" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const isHidden = effHidden(m);
              return (
              <TableRow key={m.id} className={cn("group", isHidden && "opacity-55")}>
                <TableCell className="font-normal text-foreground">
                  {editingId === m.id ? (
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
                  ) : (
                    <div className="group/name flex items-start gap-1.5">
                      <div className="flex flex-col">
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
                        className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/name:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {m.household ?? "—"}
                </TableCell>
                <TableCell>
                  <select
                    value={
                      (m.id in genderEdits ? genderEdits[m.id] : m.gender) ?? ""
                    }
                    onChange={(e) =>
                      changeGender(
                        m.id,
                        e.target.value === ""
                          ? null
                          : (e.target.value as "M" | "F")
                      )
                    }
                    aria-label={`Gender for ${m.displayName}`}
                    className="rounded-sm border border-input bg-[var(--input-background)] px-1.5 py-1 text-sm outline-none focus-visible:border-[var(--blue30)] focus-visible:ring-2 focus-visible:ring-[var(--blue30)]/30"
                  >
                    <option value="">—</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                </TableCell>
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
                <TableCell>
                  <Badge variant={BUCKET_BADGE[m.bucket]}>
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: BUCKET_DOT[m.bucket] }}
                    />
                    {BUCKET_LABEL[m.bucket]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-right text-muted-foreground">
                  {m.talkCount}
                </TableCell>
                <TableCell className="w-10 pr-3 text-right">
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
                      isHidden ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                  >
                    {isHidden ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4" />
                    )}
                  </button>
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
    </div>
  );
}
