"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { unlock } from "@/lib/gate-actions";
import { signOutAction } from "@/lib/actions";

export default function UnlockPage() {
  const [state, action, pending] = useActionState(unlock, undefined);

  return (
    <div className="min-h-screen bg-background">
      {/* Church header band */}
      <div className="relative h-2 bg-[var(--blue25)]" />

      <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] max-w-md flex-col justify-center px-6 py-12">
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
                className="w-full rounded-sm border border-[var(--grey15)] bg-background px-3 py-2 text-foreground outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
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
