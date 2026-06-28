import { NextResponse } from "next/server";
import { buildSmartPlanFromDb, SACRAMENT_LIST_ID } from "@/lib/trello-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called daily by the claude.ai routine. The routine reads the "Sacrament
// Meetings" list through its Trello connector (OAuth — no API key needed) and
// POSTs the cards here. We return, per upcoming meeting: the planner's known
// values (ground truth), the card it matched (so the routine can see what a
// human already wrote), and a safe baseline title/body (the deterministic
// never-erase merge). The routine then uses judgment to make the final call
// per card, bound by one hard rule: never drop what a human added.
//
// Auth: shared secret in the `x-merge-key` header (preferred) or `?key=`.
// We avoid requiring the secret in the URL so it isn't logged in plain sight.
export async function POST(req: Request) {
  const secret = process.env.TRELLO_MERGE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "TRELLO_MERGE_SECRET is not configured" },
      { status: 503 }
    );
  }
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-merge-key") ?? url.searchParams.get("key");
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { cards?: { id: string; name: string; desc?: string | null }[] };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const cards = (body.cards ?? [])
    .filter((c) => c && typeof c.id === "string" && typeof c.name === "string")
    .map((c) => ({ id: c.id, name: c.name, desc: c.desc ?? "" }));

  try {
    const items = await buildSmartPlanFromDb(cards);
    return NextResponse.json({ ok: true, listId: SACRAMENT_LIST_ID, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
