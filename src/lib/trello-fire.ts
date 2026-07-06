// Fire the claude.ai routine that syncs the Bishopric Trello board, so a card
// change lands within a minute or two of a planner / set-apart edit instead of
// waiting for the daily run. Fire-and-forget and THROTTLED: a burst of
// autosaves (or a run that's still going) can't storm the routine, and because
// the routine reads the planner ~1-2 min after it's fired, one leading fire
// naturally captures the whole burst. Env-driven so the fire URL/token stay out
// of git; if unset, this is a no-op and the daily schedule still covers all.

let lastFired = 0;
const THROTTLE_MS = 90_000;

export async function fireTrelloSync(): Promise<void> {
  const url = process.env.TRELLO_ROUTINE_FIRE_URL;
  const token = process.env.TRELLO_ROUTINE_TOKEN;
  if (!url || !token) return;

  const now = Date.now();
  if (now - lastFired < THROTTLE_MS) return;
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
