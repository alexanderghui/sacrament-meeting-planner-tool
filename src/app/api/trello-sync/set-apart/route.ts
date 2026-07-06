import { NextResponse } from "next/server";
import { buildSetApartPlanFromDb, SETAPART_LIST_ID } from "@/lib/set-apart";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called daily by the claude.ai routine, alongside the sacrament merge. The
// routine reads the "To Be Set Apart" list via its Trello connector, POSTs the
// cards here (include archived ones so we can un-archive on undo and not create
// duplicates), and gets back create / update / archive / unarchive ops. Same
// shared secret as the merge endpoint: header `x-merge-key` or `?key=`.
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

  let body: {
    cards?: { id: string; name: string; desc?: string | null; closed?: boolean }[];
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const cards = (body.cards ?? [])
    .filter((c) => c && typeof c.id === "string" && typeof c.name === "string")
    .map((c) => ({
      id: c.id,
      name: c.name,
      desc: c.desc ?? "",
      closed: !!c.closed,
    }));

  try {
    const ops = await buildSetApartPlanFromDb(cards);
    return NextResponse.json({ ok: true, listId: SETAPART_LIST_ID, ops });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
