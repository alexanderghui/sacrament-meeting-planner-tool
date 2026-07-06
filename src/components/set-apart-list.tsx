"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Hand } from "lucide-react";
import { setSetApart } from "@/lib/actions";
import type { SetApartItem } from "@/lib/set-apart";

const OVERDUE_DAYS = 21;

const pad = (n: number) => String(n).padStart(2, "0");
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseLocal(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function fmtShort(s: string) {
  return parseLocal(s).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function daysSince(s: string) {
  return Math.floor(
    (parseLocal(todayIso()).getTime() - parseLocal(s).getTime()) / 86_400_000
  );
}
function relative(s: string) {
  const d = daysSince(s);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  const w = Math.floor(d / 7);
  return w === 1 ? "1 week ago" : `${w} weeks ago`;
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    {children}
  </p>
);

export function SetApartList({ items: initial }: { items: SetApartItem[] }) {
  const [items, setItems] = useState(initial);
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

  const patch = (entryId: string, changes: Partial<SetApartItem>) =>
    setItems((prev) =>
      prev.map((it) => (it.entryId === entryId ? { ...it, ...changes } : it))
    );

  const markDone = (it: SetApartItem) => {
    const on = todayIso();
    patch(it.entryId, { setApartOn: on, setApartBy: "you" });
    run(() => setSetApart(it.meetingId, it.entryId, on));
  };
  const changeDate = (it: SetApartItem, on: string) => {
    if (!on) return;
    patch(it.entryId, { setApartOn: on });
    run(() => setSetApart(it.meetingId, it.entryId, on));
  };
  const undo = (it: SetApartItem) => {
    patch(it.entryId, { setApartOn: null, setApartBy: null });
    run(() => setSetApart(it.meetingId, it.entryId, null));
  };

  const pending = items
    .filter((i) => !i.setApartOn)
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  const done = items
    .filter((i) => i.setApartOn)
    .sort((a, b) => (b.setApartOn ?? "").localeCompare(a.setApartOn ?? ""));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xl font-light leading-tight text-foreground sm:text-[1.75rem]">
            Set apart
          </h2>
          {pending.length > 0 && (
            <span className="shrink-0 text-sm text-muted-foreground">
              {pending.length} waiting
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Members sustained and still needing the ordinance.
        </p>
      </div>

      <section>
        <SectionLabel>Needs setting apart</SectionLabel>
        {pending.length === 0 ? (
          <div className="rounded-sm border border-[var(--grey15)] bg-card px-4 py-10 text-center">
            <Hand className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">
              All caught up — no one is waiting to be set apart.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {pending.map((it) => {
              const overdue = daysSince(it.meetingDate) >= OVERDUE_DAYS;
              return (
                <li
                  key={it.entryId}
                  className="flex items-center gap-3 rounded-sm border border-[var(--grey15)] bg-card px-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => markDone(it)}
                    aria-label={`Mark ${it.name} set apart`}
                    className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--grey30)] text-transparent transition-colors hover:border-[var(--status-green)] hover:text-[var(--status-green)]"
                  >
                    <Check className="size-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {it.name}
                      </span>
                      {overdue && (
                        <span className="rounded-sm bg-[var(--status-amber-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-amber)]">
                          Overdue
                        </span>
                      )}
                    </div>
                    {it.calling && (
                      <div className="text-sm text-muted-foreground">
                        {it.calling}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>Sustained {fmtShort(it.meetingDate)}</div>
                    <div>{relative(it.meetingDate)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <SectionLabel>Recently set apart</SectionLabel>
          <ul className="space-y-1">
            {done.map((it) => (
              <li
                key={it.entryId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => undo(it)}
                  aria-label={`Mark ${it.name} not set apart`}
                  title="Undo — mark not set apart"
                  className="group flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--status-green)] text-white transition-colors hover:bg-[var(--status-red)]"
                >
                  <Check className="size-4 group-hover:hidden" />
                  <X className="hidden size-4 group-hover:block" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-muted-foreground line-through">
                    {it.name}
                  </div>
                  {it.calling && (
                    <div className="text-sm text-muted-foreground line-through">
                      {it.calling}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span>Set apart</span>
                  <input
                    type="date"
                    value={it.setApartOn ?? ""}
                    onChange={(e) => changeDate(it, e.target.value)}
                    aria-label={`Set-apart date for ${it.name}`}
                    className="rounded-sm border border-[var(--grey15)] bg-[var(--input-background)] px-2 py-1 text-xs text-foreground outline-none focus-visible:border-[var(--blue30)]"
                  />
                  {it.setApartBy && <span>by {it.setApartBy}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
