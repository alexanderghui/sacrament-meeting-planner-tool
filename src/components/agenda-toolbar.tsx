"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Top bar for the standalone agenda view. Hidden when printing so the saved PDF
// is just the document.
export function AgendaToolbar() {
  return (
    <div className="sticky top-0 z-10 border-b border-[var(--grey10)] bg-background/90 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/upcoming"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
        >
          <ArrowLeft className="size-4" />
          Back to planner
        </Link>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
