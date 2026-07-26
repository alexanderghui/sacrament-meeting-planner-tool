// Fire the claude.ai routine that syncs the Bishopric Trello board, so a card
// change lands within a minute or two of a planner / set-apart edit instead of
// waiting for the daily run. Fire-and-forget and THROTTLED: a burst of
// autosaves (or a run that's still going) can't storm the routine, and because
// the routine reads the planner ~1-2 min after it's fired, one leading fire
// naturally captures the whole burst. Env-driven so the fire URL/token stay out
// of git; if unset, this is a no-op and the daily schedule still covers all.
//
// The throttle lives in the database (see `syncClaims`). It used to be a module
// variable, which quietly did almost nothing in production: every serverless
// instance had its own copy, so a burst spread across instances fired a run per
// instance. Three runs went out 34s and 40s apart that way, each read the board
// before the others had written to it, and each created the same cards — the
// duplicates on "To Be Set Apart" came from exactly that.
import { claim } from "./sync-claim";

const THROTTLE_SECONDS = 90;

// Per-instance memo of our last successful fire. Purely to skip a pointless
// round trip when the same instance handles several autosaves; the claim below
// is what actually enforces the interval.
let lastFired = 0;

export async function fireTrelloSync(): Promise<void> {
  const url = process.env.TRELLO_ROUTINE_FIRE_URL;
  const token = process.env.TRELLO_ROUTINE_TOKEN;
  if (!url || !token) return;

  const now = Date.now();
  if (now - lastFired < THROTTLE_SECONDS * 1000) return;

  try {
    if (!(await claim("trello-fire", THROTTLE_SECONDS))) return;
  } catch {
    // Can't reach the claim table — skip the nudge rather than risk a stampede.
    // The daily scheduled run is the backstop.
    return;
  }
  lastFired = now;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best effort. The daily scheduled run is the backstop.
  }
}
