"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, gateCookieFor, GATE_COOKIE } from "./gate";

export type UnlockState = { error?: string };

export async function unlock(
  _prev: UnlockState | undefined,
  formData: FormData
): Promise<UnlockState> {
  const input = String(formData.get("password") ?? "");
  const role = checkPassword(input);
  if (!role) {
    return { error: "That password isn't right. Try again." };
  }

  const jar = await cookies();
  jar.set(GATE_COOKIE, await gateCookieFor(role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  // redirect() throws to interrupt — must be outside any try/catch.
  // Coordinators get a read-only program view; clerks get the full app.
  redirect(role === "coordinator" ? "/coordinator" : "/upcoming");
}
