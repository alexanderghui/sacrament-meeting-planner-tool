// Shared-password gate. A second wall behind Google sign-in: even an allowed,
// signed-in user must enter a ward passphrase before seeing anything.
//
// Two roles, two passwords:
//   ACCESS_PASSWORD       → "clerk"       (full bishopric access)
//   COORDINATOR_PASSWORD  → "coordinator" (read-only program view)
//
// Edge-safe by design — no DB, no Node-only APIs — so the same helpers run in
// the proxy (edge) and in the unlock server action (node). The cookie carries
// `role.HMAC` where the HMAC is bound to the role, that role's password, and
// AUTH_SECRET — so it can't be forged and rotating any of them invalidates it.
export const GATE_COOKIE = "smp_gate";

export type Role = "clerk" | "coordinator";

function clerkPw(): string | undefined {
  const p = process.env.ACCESS_PASSWORD;
  return p && p.length > 0 ? p : undefined;
}
function coordinatorPw(): string | undefined {
  const p = process.env.COORDINATOR_PASSWORD;
  return p && p.length > 0 ? p : undefined;
}
function pwForRole(role: Role): string | undefined {
  return role === "clerk" ? clerkPw() : coordinatorPw();
}

// When no clerk password is configured the gate is disabled — keeps local dev
// (and a first deploy before the password is set) usable with just Google.
export function gateEnabled(): boolean {
  return !!clerkPw();
}

const encoder = new TextEncoder();

function toB64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(msg));
  return toB64Url(sig);
}

async function tokenFor(role: Role): Promise<string> {
  const password = pwForRole(role);
  if (!password) return "";
  const key = process.env.AUTH_SECRET || password;
  return hmac(key, `smp-gate:v1:${role}:${password}`);
}

// The cookie value to set for a role: `role.HMAC`.
export async function gateCookieFor(role: Role): Promise<string> {
  return `${role}.${await tokenFor(role)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Validate the cookie and return the role it proves, or null. Used on every
// request by the proxy and by server components.
export async function verifyGateRole(
  cookieValue: string | undefined
): Promise<Role | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot < 0) return null;
  const role = cookieValue.slice(0, dot);
  const token = cookieValue.slice(dot + 1);
  if (role !== "clerk" && role !== "coordinator") return null;
  const expected = await tokenFor(role);
  return expected !== "" && constantTimeEqual(token, expected) ? role : null;
}

// Check what the user typed at /unlock; returns the role it unlocks, or null.
export function checkPassword(input: string): Role | null {
  const c = clerkPw();
  if (c && constantTimeEqual(input, c)) return "clerk";
  const co = coordinatorPw();
  if (co && constantTimeEqual(input, co)) return "coordinator";
  return null;
}
