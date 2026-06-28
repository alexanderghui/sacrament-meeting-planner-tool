import { NextResponse } from "next/server";
import { syncUpcomingToTrello } from "@/lib/trello-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Triggered by the Vercel cron (see vercel.json). Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` automatically when CRON_SECRET is set;
// we reject anything else so the endpoint can't be poked by outsiders.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await syncUpcomingToTrello();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
