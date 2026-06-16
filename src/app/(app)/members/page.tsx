import Link from "next/link";
import { Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { MembersTable } from "@/components/members-table";
import { getMembersWithSpeaking } from "@/lib/members";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const members = await getMembersWithSpeaking();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-[1.75rem] font-light text-foreground leading-tight">
            Members
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            Speaking history for the ward. Color shows how long since each member
            last spoke.
          </p>
        </div>
        <Link
          href="/members/import"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full sm:w-auto"
          )}
        >
          <Upload className="size-4" />
          Import roster
        </Link>
      </div>

      <MembersTable members={members} />
    </div>
  );
}
