"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Top bar for the standalone agenda view. Hidden when printing so the saved PDF
// is just the document.
export function AgendaToolbar() {
  return (
    <div
      className="sticky top-0 z-10 border-b border-[var(--grey10)] bg-background/90 backdrop-blur print:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 py-1.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <Link
          href="/upcoming"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
        >
          <ArrowLeft className="size-4" />
          Back to planner
        </Link>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => window.print()}
        >
          <Printer className="size-4" />
          Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
