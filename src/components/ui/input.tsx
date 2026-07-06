"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// useLayoutEffect on the client, useEffect during SSR (avoids the hydration
// warning while still sizing before paint in the browser).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-sm border border-input bg-[var(--input-background)] px-3 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--blue30)] focus-visible:ring-2 focus-visible:ring-[var(--blue30)]/30 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-10 w-full rounded-sm border border-input bg-[var(--input-background)] px-3 py-1 text-base outline-none transition-colors focus-visible:border-[var(--blue30)] focus-visible:ring-2 focus-visible:ring-[var(--blue30)]/30 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

// Auto-growing textarea: the height follows the content so multi-sentence
// entries are never clipped (a real problem on mobile), and it shrinks back
// when short. No inner scrollbar, no drag handle.
function Textarea({
  className,
  onInput,
  ...props
}: React.ComponentProps<"textarea">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Fit initial content on mount, and re-fit when a controlled value changes.
  useIsoLayoutEffect(() => {
    resize();
  }, [resize, props.value, props.defaultValue]);

  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={cn(
        "flex min-h-[4.5rem] w-full resize-none overflow-hidden rounded-sm border border-input bg-[var(--input-background)] px-3 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--blue30)] focus-visible:ring-2 focus-visible:ring-[var(--blue30)]/30 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input, Select, Textarea };
