import NextAuth from "next-auth";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { getDb } from "./db";
import { users } from "./db/schema";

function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const allow = allowedEmails();
      // Empty allowlist = allow anyone (dev / first run); otherwise restrict.
      if (allow.length > 0 && !allow.includes(email)) return false;
      return true;
    },
    async jwt({ token, user }) {
      // Only touches the DB at sign-in (when `user` is present), never on the
      // per-request token decode — keeps middleware free of database access.
      if (user?.email) {
        const db = await getDb();
        const email = user.email.toLowerCase();
        const [row] = await db
          .insert(users)
          .values({ email, name: user.name, image: user.image })
          .onConflictDoUpdate({
            target: users.email,
            set: { name: user.name, image: user.image },
          })
          .returning({ id: users.id });
        token.uid = row.id;
        token.email = email;
        token.name = user.name ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      if (token.email) session.user.email = token.email as string;
      return session;
    },
  },
});

export async function currentUser() {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

// For write paths that store a users.id foreign key: guarantees the row exists
// (upsert by email) and returns its canonical id, rather than trusting the
// session token — which can outlive the row (e.g. a DB reset in dev).
export async function ensureUser() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!session?.user || !email) return null;
  const db = await getDb();
  const [row] = await db
    .insert(users)
    .values({ email, name: session.user.name ?? null, image: session.user.image ?? null })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: session.user.name ?? null },
    })
    .returning({ id: users.id, email: users.email, name: users.name });
  return row;
}
