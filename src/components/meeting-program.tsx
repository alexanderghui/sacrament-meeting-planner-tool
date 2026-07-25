import { Badge } from "@/components/ui/badge";
import type { PlannerMeeting, AssignmentStatusValue } from "@/lib/meetings";
import { buildProgram, hymnText } from "@/lib/agenda";

const STATUS_LABEL: Record<AssignmentStatusValue, string> = {
  invited: "Invited",
  confirmed: "Confirmed",
  spoke: "Spoke",
  declined: "Declined",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

type Row = {
  label: string;
  value: React.ReactNode;
  status?: AssignmentStatusValue;
};

/**
 * Read-only program for a meeting, laid out in the order it actually runs:
 * opening hymn → invocation → sacrament hymn → speakers / intermediate hymn /
 * musical numbers → closing hymn → benediction. Speaker order and numbering are
 * resolved through `buildProgram` (i.e. `programBody`, the drag-arranged source
 * of truth) — the same resolver the printable /program agenda uses — so the
 * coordinator and history views match the real program instead of raw
 * assignment order.
 */
export function MeetingProgram({
  meeting,
  hymnTitles,
}: {
  meeting: PlannerMeeting;
  hymnTitles: Record<number, string>;
}) {
  // Who runs the meeting — not part of the running order, shown as a header.
  const roles = (
    [
      ["Presiding", meeting.presiding],
      ["Conducting", meeting.conducting],
      ["Chorister", meeting.chorister],
      ["Accompanist", meeting.accompanist],
    ] as const
  ).filter(([, v]) => !!v) as [string, string][];

  const program = buildProgram({
    type: meeting.type,
    speakers: meeting.speakers,
    intermediateHymn: meeting.intermediateHymn,
    musicalNumbers: meeting.musicalNumbers,
    programBody: meeting.programBody,
    hymnFallback: hymnTitles,
  });
  // buildProgram renumbers speakers but doesn't carry their status; look it up
  // by name for the Invited/Confirmed badge.
  const statusByName = new Map(
    meeting.speakers
      .filter((s) => s.name)
      .map((s) => [s.name as string, s.status])
  );

  // Assemble the run-of-show top to bottom.
  const rows: Row[] = [];
  const openingHymn = hymnText(meeting.openingHymn, hymnTitles);
  if (openingHymn) rows.push({ label: "Opening hymn", value: openingHymn });
  if (meeting.openingPrayer?.name)
    rows.push({ label: "Invocation", value: meeting.openingPrayer.name });
  const sacramentHymn = hymnText(meeting.sacramentHymn, hymnTitles);
  if (sacramentHymn) rows.push({ label: "Sacrament hymn", value: sacramentHymn });

  for (const item of program) {
    if (item.kind === "speaker") {
      rows.push({
        label: `Speaker ${item.position}`,
        value: (
          <>
            <span className="font-medium text-foreground">{item.name}</span>
            {item.topic && (
              <span className="text-muted-foreground"> — {item.topic}</span>
            )}
          </>
        ),
        status: statusByName.get(item.name),
      });
    } else if (item.kind === "intermediateHymn") {
      rows.push({ label: "Intermediate hymn", value: item.text });
    } else if (item.kind === "musicalNumber") {
      rows.push({ label: "Musical number", value: item.text });
    } else if (item.kind === "testimony") {
      rows.push({ label: "Program", value: "Bearing of testimonies" });
    } else if (item.kind === "primaryProgram") {
      rows.push({ label: "Program", value: "Primary program" });
    }
  }

  const closingHymn = hymnText(meeting.closingHymn, hymnTitles);
  if (closingHymn) rows.push({ label: "Closing hymn", value: closingHymn });
  if (meeting.closingPrayer?.name)
    rows.push({ label: "Benediction", value: meeting.closingPrayer.name });

  if (roles.length === 0 && rows.length === 0 && !meeting.notes) {
    return (
      <p className="text-sm text-muted-foreground">
        No program details recorded for this meeting.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      {roles.length > 0 && (
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {roles.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
              <span className="text-foreground">{value}</span>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <Label>Program</Label>
          <ol className="space-y-1">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex flex-wrap items-baseline gap-x-2 leading-snug"
              >
                <span className="w-32 shrink-0 text-muted-foreground">
                  {r.label}
                </span>
                <span className="min-w-0 flex-1">
                  {r.value}
                  {r.status && r.status !== "spoke" && (
                    <Badge
                      variant={r.status === "declined" ? "red" : "neutral"}
                      className="ml-2"
                    >
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {meeting.notes && (
        <div>
          <Label>Notes</Label>
          <p className="text-muted-foreground">{meeting.notes}</p>
        </div>
      )}
    </div>
  );
}
