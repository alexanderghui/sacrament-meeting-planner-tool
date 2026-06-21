import { Button } from "@/components/ui/button";
import { signInGoogle, signInDev } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const hasGoogle = !!(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  );
  const showDev = !hasGoogle && process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen bg-background">
      {/* Church header band */}
      <div className="relative h-2 bg-[var(--blue25)]" />

      <div
        className="mx-auto flex min-h-[calc(100vh-0.5rem)] max-w-md flex-col justify-center py-12 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)]"
        style={{ paddingBottom: "calc(3rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-light text-foreground">
            Sacrament Planner
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to plan meetings and track speaking history for your ward.
          </p>
        </div>

        <div className="rounded-sm border border-[var(--grey15)] bg-card px-6 py-8 shadow-[var(--boxShadowRaised)]">
          {hasGoogle && (
            <form action={signInGoogle}>
              <Button type="submit" className="w-full" size="lg">
                Sign in with Google
              </Button>
            </form>
          )}

          {showDev && (
            <form action={signInDev}>
              <Button type="submit" variant="outline" className="w-full" size="lg">
                Sign in (dev)
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Google sign-in isn&apos;t configured yet — this dev button stands
                in until OAuth credentials are added.
              </p>
            </form>
          )}

          {!hasGoogle && !showDev && (
            <p className="text-center text-sm text-muted-foreground">
              Sign-in is not configured. Add Google OAuth credentials to enable
              access.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Access is limited to invited bishopric members.
        </p>
      </div>
    </div>
  );
}
