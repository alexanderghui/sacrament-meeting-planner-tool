import { Badge } from "@/components/ui/badge";
import type { PlannerMeeting, AssignmentStatusValue } from "@/lib/meetings";
import { HYMN_TITLES } from "@/lib/hymns";

const STATUS_LABEL: Record<AssignmentStatusValue, string> = {
  invited: "Invited",
  confirmed: "Confirmed",
  spoke: "Spoke",
  declined: "Declined",
};

function hymnLabel(n: number | null, titles: Record<number, string>) {
  if (n == null) return null;
  // Prefer the complete bundled hymnbook; fall back to the DB-derived titles.
  const title = HYMN_TITLES[n] ?? titles[n];
  return title ? `#${n} — ${title}` : `#${n}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/** Read-only program for a past meeting: presiding/conducting, speakers, prayers, hymns. */
export function MeetingProgram({
  meeting,
  hymnTitles,
}: {
  meeting: PlannerMeeting;
  hymnTitles: Record<number, string>;
}) {
  const speakers = meeting.speakers.filter((s) => s.name);
  const hymns = (
    [
      ["Opening", meeting.openingHymn],
      ["Sacrament", meeting.sacramentHymn],
      ["Intermediate", meeting.intermediateHymn],
      ["Closing", meeting.closingHymn],
    ] as const
  ).filter(([, n]) => n != null);

  const empty =
    speakers.length === 0 &&
    hymns.length === 0 &&
    !meeting.openingPrayer &&
    !meeting.closingPrayer &&
    !meeting.presiding &&
    !meeting.conducting &&
    !meeting.chorister &&
    !meeting.accompanist &&
    meeting.musicalNumbers.length === 0;

  if (empty) {
    return (
      <p className="text-sm text-muted-foreground">
        No program details recorded for this meeting.
      </p>
    );
  }

  return (
    <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
      {(meeting.presiding ||
        meeting.conducting ||
        meeting.chorister ||
        meeting.accompanist) && (
        <div className="space-y-1 text-sm">
          {meeting.presiding && (
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">Presiding</span>
              <span className="text-foreground">{meeting.presiding}</span>
            </div>
          )}
          {meeting.conducting && (
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">Conducting</span>
              <span className="text-foreground">{meeting.conducting}</span>
            </div>
          )}
          {meeting.chorister && (
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">Chorister</span>
              <span className="text-foreground">{meeting.chorister}</span>
            </div>
          )}
          {meeting.accompanist && (
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">Accompanist</span>
              <span className="text-foreground">{meeting.accompanist}</span>
            </div>
          )}
        </div>
      )}

      {speakers.length > 0 && (
        <div>
          <Label>Speakers</Label>
          <ul className="space-y-1.5 text-sm">
            {speakers.map((s) => (
              <li key={s.id} className="leading-snug">
                <span className="font-medium text-foreground">{s.name}</span>
                {s.topic && (
                  <span className="text-muted-foreground"> — {s.topic}</span>
                )}
                {s.status !== "spoke" && (
                  <Badge
                    variant={s.status === "declined" ? "red" : "neutral"}
                    className="ml-2"
                  >
                    {STATUS_LABEL[s.status]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(meeting.openingPrayer?.name || meeting.closingPrayer?.name) && (
        <div className="space-y-1 text-sm">
          <Label>Prayers</Label>
          {meeting.openingPrayer?.name && (
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">Opening</span>
              <span className="text-foreground">{meeting.openingPrayer.name}</span>
            </div>
          )}
          {meeting.closingPrayer?.name && (
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">Closing</span>
              <span className="text-foreground">{meeting.closingPrayer.name}</span>
            </div>
          )}
        </div>
      )}

      {(hymns.length > 0 || meeting.musicalNumbers.length > 0) && (
        <div>
          <Label>Hymns</Label>
          <ul className="space-y-0.5 text-sm text-foreground">
            {hymns.map(([label, n]) => (
              <li key={label}>
                <span className="text-muted-foreground">{label}:</span>{" "}
                {hymnLabel(n, hymnTitles)}
              </li>
            ))}
          </ul>
          {meeting.musicalNumbers.map((mn, i) => (
            <p key={i} className="mt-1.5 text-sm text-foreground">
              <span className="text-muted-foreground">Musical number:</span> {mn}
            </p>
          ))}
        </div>
      )}

      {meeting.notes && (
        <div className="sm:col-span-2 text-sm">
          <Label>Notes</Label>
          <p className="text-muted-foreground">{meeting.notes}</p>
        </div>
      )}
    </div>
  );
}
