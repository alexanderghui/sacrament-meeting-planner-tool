"use client";

import { useEffect } from "react";

// The planner's free-text fields (announcements, business notes, topics, etc.)
// commit their value on `blur`. On a phone, backgrounding the app — locking the
// screen, switching apps, or closing the PWA — does NOT blur a focused input,
// so an in-progress edit would be silently lost. When the page is about to be
// hidden, force the focused field to blur first so its save fires while the app
// is still alive. Best-effort, but it closes the most common "I typed it and it
// didn't save" gap on mobile.
export function SaveOnHide() {
  useEffect(() => {
    const flush = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
        el.blur();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  return null;
}
