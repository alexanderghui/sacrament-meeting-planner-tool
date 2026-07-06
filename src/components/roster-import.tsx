"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  UserPlus,
  UserMinus,
  PencilLine,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  previewRoster,
  applyRoster,
  type PreviewResult,
  type ApplyResult,
} from "@/lib/roster-actions";
import { displayName } from "@/lib/members";

function nameOf(s: string) {
  return displayName(s);
}

export function RosterImport() {
  const router = useRouter();
  const [preview, previewAction, previewing] = useActionState<
    PreviewResult | null,
    FormData
  >(async (_prev, fd) => previewRoster(fd), null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [applying, startApply] = useTransition();

  function apply() {
    if (!preview?.ok) return;
    startApply(async () => {
      const res = await applyRoster(preview.rows, preview.filename);
      setApplyResult(res);
      router.refresh();
    });
  }

  if (applyResult?.ok) {
    return (
      <Card className="px-6 py-8">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 text-[var(--status-green)]" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Ward list updated
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {applyResult.added} added · {applyResult.updated} updated ·{" "}
              {applyResult.removed} moved out. Saved as a new version.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => router.push("/members")}>
                View members
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setApplyResult(null);
                  router.refresh();
                }}
              >
                Import another
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const diff = preview?.ok ? preview.diff : null;
  const total = diff
    ? diff.adds.length + diff.updates.length + diff.removes.length
    : 0;

  return (
    <div className="space-y-5">
      {/* Upload */}
      <Card className="px-6 py-6">
        <form action={previewAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">
              Roster file (PDF or CSV)
            </label>
            <p className="mb-3 text-sm text-muted-foreground">
              Upload the ward directory straight from LCR — the Member List PDF
              works as-is, or a CSV if you have one. We&apos;ll compare it to the
              current list and show what changed before anything is saved.
            </p>
            <input
              type="file"
              name="file"
              accept=".pdf,application/pdf,.csv,text/csv"
              className="block w-full text-sm text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:text-foreground hover:file:bg-accent"
            />
          </div>
          <Button type="submit" disabled={previewing}>
            <Upload className="size-4" />
            {previewing ? "Reading file…" : "Preview changes"}
          </Button>
        </form>
      </Card>

      {/* Errors */}
      {preview && !preview.ok && preview.errors.length > 0 && (
        <Card className="border-[var(--status-red)] px-6 py-5">
          <div className="flex items-start gap-2 text-sm text-[var(--status-red)]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              {preview.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Diff preview */}
      {diff && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--grey10)] bg-[var(--grey2)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Review changes
              </h3>
              <p className="text-sm text-muted-foreground">
                {preview!.filename} · {preview!.rowCount} rows ·{" "}
                {diff.unchangedCount} unchanged
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="green">
                <UserPlus className="size-3" /> {diff.adds.length} add
              </Badge>
              <Badge variant="neutral">
                <PencilLine className="size-3" /> {diff.updates.length} update
              </Badge>
              <Badge variant="red">
                <UserMinus className="size-3" /> {diff.removes.length} move out
              </Badge>
            </div>
          </div>

          <div className="space-y-5 px-6 py-5">
            {total === 0 && (
              <p className="text-sm text-muted-foreground">
                No changes detected — your ward list already matches this file.
              </p>
            )}

            {diff.adds.length > 0 && (
              <Section
                title="New members"
                icon={<UserPlus className="size-4 text-[var(--status-green)]" />}
              >
                <ul className="flex flex-wrap gap-2">
                  {diff.adds.map((a, i) => (
                    <li key={i}>
                      <Badge variant="green">{nameOf(a.fullName)}</Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {diff.updates.length > 0 && (
              <Section
                title="Updated details"
                icon={<PencilLine className="size-4 text-[var(--blue30)]" />}
              >
                <ul className="space-y-2">
                  {diff.updates.map((u) => (
                    <li key={u.memberId} className="text-sm">
                      <span className="font-medium text-foreground">
                        {nameOf(u.name)}
                      </span>
                      <ul className="ml-4 mt-0.5">
                        {u.changes.map((c, i) => (
                          <li
                            key={i}
                            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground"
                          >
                            <span className="text-xs uppercase tracking-wide">
                              {c.label}
                            </span>
                            <span className="break-words line-through">
                              {c.before ?? "—"}
                            </span>
                            <ArrowRight className="size-3 shrink-0" />
                            <span className="break-words text-foreground">{c.after}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {diff.removes.length > 0 && (
              <Section
                title="Moved out (will be marked inactive — history kept)"
                icon={<UserMinus className="size-4 text-[var(--status-red)]" />}
              >
                <ul className="flex flex-wrap gap-2">
                  {diff.removes.map((r) => (
                    <li key={r.memberId}>
                      <Badge variant="red">{nameOf(r.name)}</Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          {total > 0 && (
            <div className="flex items-center justify-end gap-2 border-t border-[var(--grey10)] bg-[var(--grey2)] px-6 py-4">
              <Button onClick={apply} disabled={applying}>
                {applying ? "Applying…" : `Apply ${total} changes`}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
