import Link from "next/link";
import { ArrowLeft, History, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RosterImport } from "@/components/roster-import";
import { getRosterVersions } from "@/lib/roster-actions";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ImportPage() {
  const versions = await getRosterVersions();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/members"
          className="inline-flex items-center gap-1 text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
        >
          <ArrowLeft className="size-4" /> Back to members
        </Link>
        <h2 className="mt-2 text-2xl sm:text-[1.75rem] font-light text-foreground leading-tight">
          Import / refresh ward list
        </h2>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground">
          Upload a CSV export from LCR to refresh the roster — typically once a
          month or quarter. Each import is reviewed before it&apos;s applied and
          saved as a version.
        </p>
      </div>

      <RosterImport />

      <div>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="size-4 text-[var(--blue30)]" /> Past updates
        </div>
        {versions.length === 0 ? (
          <Card className="px-6 py-8 text-center text-sm text-muted-foreground">
            No imports yet. Your first upload will appear here as a version.
          </Card>
        ) : (
          <div className="overflow-hidden rounded-sm border border-[var(--grey15)] bg-card">
            {versions.map((v) => (
              <Link
                key={v.id}
                href={`/members/import/${v.id}`}
                className="flex items-center justify-between gap-3 border-b border-[var(--grey10)] px-5 py-3 last:border-b-0 hover:bg-[var(--grey2)]"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground">{fmt(v.createdAt)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {v.filename ?? "roster.csv"}
                    {v.importedByEmail ? ` · ${v.importedByEmail}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="green">+{v.addedCount}</Badge>
                  <Badge variant="neutral">~{v.updatedCount}</Badge>
                  <Badge variant="red">−{v.removedCount}</Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
