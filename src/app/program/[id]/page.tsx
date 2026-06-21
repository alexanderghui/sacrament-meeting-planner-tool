import { notFound } from "next/navigation";
import { AgendaDocument } from "@/components/agenda-document";
import { AgendaToolbar } from "@/components/agenda-toolbar";
import { getMeetingById, getHymnTitles } from "@/lib/meetings";

export const dynamic = "force-dynamic";

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [meeting, hymnTitles] = await Promise.all([
    getMeetingById(id),
    getHymnTitles(),
  ]);

  if (!meeting) notFound();

  return (
    <div className="min-h-screen bg-background pb-16">
      <AgendaToolbar />
      <div className="px-4 py-8 sm:py-10">
        <AgendaDocument meeting={meeting} hymnTitles={hymnTitles} />
      </div>
    </div>
  );
}
