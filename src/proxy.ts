import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Next 16 renamed Middleware → Proxy (same functionality). Uses the edge-safe
// config (no DB) to gate every page on a valid session + the shared password.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on all routes except Next internals, the auth API, the public app
  // icons / manifest (so the home-screen icon loads without a session), and
  // static assets.
  matcher: [
    "/((?!api/auth|icon|apple-icon|manifest.webmanifest|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
