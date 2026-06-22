import { cookies } from "next/headers";
import { GATE_COOKIE, verifyGateRole, type Role } from "./gate";

// The gate role proven by the current request's cookie (server components +
// actions). null when the gate is disabled or unsolved.
export async function currentRole(): Promise<Role | null> {
  const jar = await cookies();
  return verifyGateRole(jar.get(GATE_COOKIE)?.value);
}
