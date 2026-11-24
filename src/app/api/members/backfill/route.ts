import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { constantTimeEqual } from "@/lib/gate";
import { readBackfillRequest, runBackfill } from "@/lib/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called monthly by a job after it exports the LCR Member List. Add-only: new
// people are inserted and soft-removed clear matches reactivated; nothing is
// ever removed, renamed, or overwritten. Lookalikes come back as near-matches.
//
// Auth: shared secret in the `x-backfill-key` header (never the query string).
// `?dryRun=false` applies the writes; anything else only reports.
export async function POST(req: Request) {
  const secret = process.env.MEMBERS_BACKFILL_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "MEMBERS_BACKFILL_SECRET is not configured" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-backfill-key");
  if (!provided || !constantTimeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") !== "false";

  try {
    const input = await readBackfillRequest(req);
    if (input.errors.length || !input.rows.length) {
      return NextResponse.json(
        {
          ok: false,
          error: input.errors.join(" ") || "No members found in the request.",
          errors: input.errors,
        },
        { status: 400 }
      );
    }

    const result = await runBackfill(await getDb(), input.rows, {
      dryRun,
      filename: input.filename,
    });
    if (!dryRun) {
      revalidatePath("/members");
      revalidatePath("/members/import");
      revalidatePath("/activity");
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
