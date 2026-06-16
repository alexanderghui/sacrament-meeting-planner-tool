// Shared-password gate. A second wall behind Google sign-in: even an allowed,
// signed-in user must enter the ward's shared passphrase before seeing any
// member data. Edge-safe by design — no DB, no Node-only APIs — so the same
// helpers run in middleware (edge) and in the unlock server action (node).
//
// The cookie carries an HMAC token proving the holder knew the password. It is
// bound to BOTH the password and AUTH_SECRET, so rotating either one instantly
// invalidates every outstanding cookie (everyone re-enters the new password).
export const GATE_COOKIE = "smp_gate";

function pw(): string | undefined {
  const p = process.env.ACCESS_PASSWORD;
  return p && p.length > 0 ? p : undefined;
}

// When no password is configured the gate is disabled — keeps local dev (and a
// first deploy before the password is set) usable with just Google sign-in.
export function gateEnabled(): boolean {
  return !!pw();
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

export async function expectedGateToken(): Promise<string> {
  const password = pw();
  if (!password) return "";
  const key = process.env.AUTH_SECRET || password;
  return hmac(key, "smp-gate:v1:" + password);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Used by middleware to validate the cookie on every request.
export async function verifyGateToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await expectedGateToken();
  return expected !== "" && constantTimeEqual(token, expected);
}

// Used by the unlock action to check what the user typed.
export function checkPassword(input: string): boolean {
  const password = pw();
  if (!password) return false;
  return constantTimeEqual(input, password);
}
