import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { GATE_COOKIE, gateEnabled, verifyGateRole } from "./gate";

const hasGoogle = !!(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

// Google in every environment that has credentials; a dev-only button when it
// doesn't, so the app is fully usable locally before OAuth is provisioned.
const providers: NextAuthConfig["providers"] = [];
if (hasGoogle) providers.push(Google);
if (!hasGoogle && process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev sign-in",
      credentials: {},
      authorize: async () => ({
        id: "dev-user",
        email: "counselor@dev.local",
        name: "Dev Counselor",
      }),
    })
  );
}

// Edge-safe config: no database imports, so it can run in middleware.
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async authorized({ auth, request }) {
      const { nextUrl } = request;
      const path = nextUrl.pathname;
      const loggedIn = !!auth?.user;
      const onLogin = path.startsWith("/login");
      const onUnlock = path.startsWith("/unlock");

      // 1) Must be signed in (Google + email allowlist). /login is the only
      //    page reachable while signed out; everything else bounces there.
      if (!loggedIn) return onLogin ? true : false;
      if (onLogin) return Response.redirect(new URL("/upcoming", nextUrl));

      // 2) Shared-password wall. Signed-in users still can't see anything until
      //    they've entered a ward passphrase (proven by a valid cookie). The
      //    role the cookie proves decides what they can reach.
      if (gateEnabled()) {
        const role = await verifyGateRole(
          request.cookies.get(GATE_COOKIE)?.value
        );
        if (!role) {
          return onUnlock ? true : Response.redirect(new URL("/unlock", nextUrl));
        }
        const home = role === "coordinator" ? "/coordinator" : "/upcoming";
        if (onUnlock) return Response.redirect(new URL(home, nextUrl));

        // Coordinators are read-only: only the program list + the printable
        // program pages. Everything else (the editing app + its server actions)
        // bounces back to their read-only home.
        if (role === "coordinator") {
          const allowed =
            path === "/coordinator" ||
            path.startsWith("/coordinator/") ||
            path.startsWith("/program/");
          if (!allowed) return Response.redirect(new URL(home, nextUrl));
        }
      } else if (onUnlock) {
        // No password configured → nothing to unlock; don't strand them here.
        return Response.redirect(new URL("/upcoming", nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
