// Minimal stateless session: an HMAC-signed cookie naming the verified address. After a
// provider proves control of an address, that address becomes the session subject and is the
// only listing they may edit. Not a full identity system; scoped to one verified address.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "fb_session";
// In production a missing SESSION_SECRET would make every session cookie forgeable, so fail
// hard instead of silently using a known fallback. A dev fallback is only used outside prod.
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}
const SECRET = process.env.SESSION_SECRET ?? "dev-insecure-secret";
const MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

// Revocation kill switch (S12): set SESSION_REVOKE_BEFORE to an epoch-ms timestamp to invalidate
// every session issued before then (e.g. after an admin cookie is suspected compromised) without a
// redeploy. The token carries its issued-at (iat), so this is checked statelessly at read time.
function revokeBefore(): number {
  const v = Number(process.env.SESSION_REVOKE_BEFORE ?? "");
  return Number.isFinite(v) ? v : 0;
}

export async function setSession(address: string): Promise<void> {
  const lower = address.toLowerCase();
  const iat = Date.now();
  const exp = iat + MAX_AGE_S * 1000;
  // payload = address.exp.iat ; iat lets a revocation cutoff invalidate older sessions.
  const payload = `${lower}.${exp}.${iat}`;
  const token = `${payload}.${sign(payload)}`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

/** Returns the verified lowercased address from the session, or null if absent/invalid/expired. */
export async function getSessionAddress(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const parts = token.split(".");
  // New tokens are address.exp.iat.mac (4 parts); accept legacy address.exp.mac (3 parts) too.
  let address: string, exp: string, iat: string | null, mac: string;
  if (parts.length === 4) {
    [address, exp, iat, mac] = parts;
  } else if (parts.length === 3) {
    [address, exp, mac] = parts;
    iat = null;
  } else {
    return null;
  }
  const payload = iat != null ? `${address}.${exp}.${iat}` : `${address}.${exp}`;
  const expected = sign(payload);
  if (
    expected.length !== mac.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))
  )
    return null;
  if (Number(exp) < Date.now()) return null;
  // Sessions issued before the revocation cutoff are rejected. Legacy tokens (no iat) are treated as
  // issued at epoch 0, so any cutoff > 0 invalidates them (they re-auth on next sign-in).
  const issuedAt = iat != null ? Number(iat) : 0;
  if (issuedAt < revokeBefore()) return null;
  return address;
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
