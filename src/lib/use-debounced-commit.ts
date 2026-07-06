import { useCallback, useEffect, useRef } from "react";

// Debounced autosave. Call `schedule(value)` on every change: the commit fires
// ~`delay`ms after the LAST change, i.e. as soon as typing pauses. Call
// `flush()` to save immediately (e.g. on blur). Only the latest value is ever
// saved. Pairing onChange→schedule with onBlur→flush means a typed value is
// persisted without the field ever needing to lose focus.
//
// Note: on unmount we cancel any pending timer but do NOT commit — the field's
// onBlur (fired by SaveOnHide on app-hide, or by focus moving on collapse/nav)
// already flushes those cases, and committing during unmount risks a
// state-update-on-unmounted warning.
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
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { schedule, flush };
}
