import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, UserPlus, UserMinus, PencilLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRosterVersion } from "@/lib/roster-actions";
import { displayName } from "@/lib/members";
import type { RosterDiff } from "@/lib/roster";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return new Date(d).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function VersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const version = await getRosterVersion(id);
  if (!version) notFound();

  const diff = version.changes as RosterDiff;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/members/import"
          className="inline-flex items-center gap-1 text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
        >
          <ArrowLeft className="size-4" /> Back to imports
        </Link>
        <h2 className="mt-2 text-2xl sm:text-[1.75rem] font-light text-foreground leading-tight">
          Roster update
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {fmt(version.createdAt)}
          {version.importedByEmail ? ` · ${version.importedByEmail}` : ""}
          {version.filename ? ` · ${version.filename}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="green">+{version.addedCount} added</Badge>
          <Badge variant="neutral">~{version.updatedCount} updated</Badge>
          <Badge variant="red">−{version.removedCount} moved out</Badge>
          <Badge variant="outline">{version.unchangedCount} unchanged</Badge>
        </div>
      </div>

      {diff.adds.length > 0 && (
        <Card className="px-6 py-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserPlus className="size-4 text-[var(--status-green)]" /> New members
          </div>
          <ul className="flex flex-wrap gap-2">
            {diff.adds.map((a, i) => (
              <li key={i}>
                <Badge variant="green">{displayName(a.fullName)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {diff.updates.length > 0 && (
        <Card className="px-6 py-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <PencilLine className="size-4 text-[var(--blue30)]" /> Updated details
          </div>
          <ul className="space-y-2">
            {diff.updates.map((u) => (
              <li key={u.memberId} className="text-sm">
                <span className="font-medium text-foreground">
                  {displayName(u.name)}
                </span>
                <ul className="ml-4 mt-0.5">
                  {u.changes.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-1.5 text-muted-foreground"
                    >
                      <span className="text-xs uppercase tracking-wide">
                        {c.label}
                      </span>
                      <span className="line-through">{c.before ?? "—"}</span>
                      <ArrowRight className="size-3" />
                      <span className="text-foreground">{c.after}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {diff.removes.length > 0 && (
        <Card className="px-6 py-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserMinus className="size-4 text-[var(--status-red)]" /> Moved out
          </div>
          <ul className="flex flex-wrap gap-2">
            {diff.removes.map((r) => (
              <li key={r.memberId}>
                <Badge variant="red">{displayName(r.name)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
