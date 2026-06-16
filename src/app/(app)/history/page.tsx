import { History } from "lucide-react";
import { HistoryBrowser } from "@/components/history-browser";
import {
  getPastMeetings,
  getActiveMembersForPicker,
  getHymnTitles,
} from "@/lib/meetings";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [meetings, members, hymnTitles] = await Promise.all([
    getPastMeetings(),
    getActiveMembersForPicker(),
    getHymnTitles(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-[1.75rem] font-light text-foreground leading-tight">
          Meeting history
        </h2>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground">
          Past sacrament meetings — speakers, topics, prayers, and hymns. These
          are kept as a record; correct one only if something was entered wrong.
        </p>
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--grey15)] bg-card py-16 text-center">
          <History className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No past meetings yet.</p>
        </div>
      ) : (
        <HistoryBrowser
          meetings={meetings}
          members={members}
          hymnTitles={hymnTitles}
        />
      )}
    </div>
  );
}
