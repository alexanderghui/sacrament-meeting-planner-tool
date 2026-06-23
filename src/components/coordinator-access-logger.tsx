"use client";

import { useEffect, useRef } from "react";
import { logCoordinatorAccess } from "@/lib/actions";

// Fires once when a coordinator opens the read-only page; the server action is
// throttled (30 min/user) so reloads don't spam the activity log.
export function CoordinatorAccessLogger() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void logCoordinatorAccess();
  }, []);
  return null;
}
