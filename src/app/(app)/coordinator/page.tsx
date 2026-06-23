import { FileText, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MeetingProgram } from "@/components/meeting-program";
import { CoordinatorAccessLogger } from "@/components/coordinator-access-logger";
import {
  getUpcomingMeetings,
  getHymnTitles,
  type MeetingTypeValue,
} from "@/lib/meetings";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<MeetingTypeValue, string> = {
  sacrament: "Sacrament meeting",
  fast_and_testimony: "Fast & testimony",
  ward_conference: "Ward conference",
  stake_conference: "Stake conference",
  general_conference: "General conference",
  primary_program: "Primary program",
  easter_program: "Easter program",
  christmas_program: "Christmas program",
  no_meeting: "No meeting",
};

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function CoordinatorPage() {
  const [meetings, hymnTitles] = await Promise.all([
    getUpcomingMeetings(),
    getHymnTitles(),
  ]);

  return (
    <div className="space-y-6">
      <CoordinatorAccessLogger />
      <div>
        <h2 className="text-2xl sm:text-[1.75rem] font-light leading-tight text-foreground">
          Upcoming sacrament meetings
        </h2>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground">
          A read-only view of the planned programs and details for upcoming
          Sundays.
        </p>
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--grey15)] bg-card py-16 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">
            No upcoming meetings planned yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {meetings.map((m) => (
            <div
              key={m.id}
              className="rounded-sm border border-[var(--grey15)] bg-card px-5 py-5 sm:px-6"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
                    {formatDate(m.date)}
                  </h3>
                  <Badge variant="outline" className="mt-1.5">
                    {TYPE_LABELS[m.type]}
                  </Badge>
                </div>
                <a
                  href={`/program/${m.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
                >
                  <FileText className="size-4" />
                  View full program
                </a>
              </div>
              <MeetingProgram meeting={m} hymnTitles={hymnTitles} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
