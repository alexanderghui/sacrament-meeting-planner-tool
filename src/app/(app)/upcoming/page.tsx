import { Plus, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UpcomingList } from "@/components/upcoming-list";
import { getUpcomingMeetings, getActiveMembersForPicker } from "@/lib/meetings";
import { addUpcomingSunday } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function UpcomingPage() {
  const [meetings, members] = await Promise.all([
    getUpcomingMeetings(),
    getActiveMembersForPicker(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-[1.75rem] font-light text-foreground leading-tight">
            Upcoming meetings
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            Assign speakers, topics, prayers, and hymns for upcoming Sundays.
          </p>
        </div>
        <form action={addUpcomingSunday}>
          <Button type="submit" className="w-full sm:w-auto">
            <Plus className="size-4" />
            Add Sunday
          </Button>
        </form>
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--grey15)] bg-card py-16 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">
            No upcoming Sundays yet. Add one to start planning.
          </p>
        </div>
      ) : (
        <UpcomingList meetings={meetings} members={members} />
      )}
    </div>
  );
}
