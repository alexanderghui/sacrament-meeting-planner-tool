"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { unlock } from "@/lib/gate-actions";
import { signOutAction } from "@/lib/actions";

export default function UnlockPage() {
  const [state, action, pending] = useActionState(unlock, undefined);

  return (
    <div className="min-h-dvh-safe flex flex-col bg-background">
      {/* Church header band — grows to cover the status bar / notch inset */}
      <div
        className="relative shrink-0 bg-[var(--blue25)]"
        style={{ height: "calc(0.5rem + env(safe-area-inset-top))" }}
      />

      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12 short:py-6 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)]"
        style={{ paddingBottom: "calc(3rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-light text-foreground">Enter password</h1>
          <p className="mt-2 text-muted-foreground">
            This tool holds ward member information. Enter the shared bishopric
            password to continue.
          </p>
        </div>

        <div className="rounded-sm border border-[var(--grey15)] bg-card px-6 py-8 shadow-[var(--boxShadowRaised)]">
          <form action={action} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoFocus
                autoComplete="off"
                className="w-full rounded-sm border border-[var(--grey15)] bg-background px-3 py-2 text-foreground outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] min-h-11"
              />
            </div>

            {state?.error && (
              <p className="text-sm text-[var(--destructive)]">{state.error}</p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={pending}>
              {pending ? "Checking…" : "Unlock"}
            </Button>
          </form>
        </div>

        <form action={signOutAction} className="mt-6 text-center">
          <button
            type="submit"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Not you? Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
