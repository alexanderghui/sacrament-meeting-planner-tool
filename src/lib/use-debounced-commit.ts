import { useCallback, useEffect, useRef } from "react";

// Debounced autosave. Call `schedule(value)` on every change: the commit fires
// ~`delay`ms after the LAST change, i.e. as soon as typing pauses. Call
// `flush()` to save immediately (e.g. on blur). Only the latest value is ever
// saved. Pairing onChange→schedule with onBlur→flush means a typed value is
// persisted without the field ever needing to lose focus.
//
// On unmount we also flush any pending value rather than dropping it. Collapsing
// a meeting card or tabbing between pages unmounts these fields, and on iOS a
// focused input is NOT reliably blurred first — so relying on blur alone lost
// edits ("it didn't save"; a sustaining change never reaching the Set apart
// tab). Invoking the commit dispatches its server action synchronously, so the
// write lands even as the field unmounts.
export function useDebouncedCommit<T>(
  commit: (value: T) => void,
  delay = 700
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current) {
      const { value } = pending.current;
      pending.current = null;
      commitRef.current(value);
    }
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay]
  );

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (pending.current) {
        const { value } = pending.current;
        pending.current = null;
        commitRef.current(value);
      }
    },
    []
  );

  return { schedule, flush };
}
