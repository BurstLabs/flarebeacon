// Admin authorization. An admin is simply a signed-in session whose verified address is listed in
// the ADMIN_ADDRESSES env (comma-separated, lowercased). This reuses the existing SIWE sign-in +
// HMAC session cookie: there is no separate admin password. requireAdmin() gates the admin API.

import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "./session";
import { rateLimit } from "./rate-limit";

// CSRF guard: for a cookie-authenticated state-changing request, reject when the browser-sent Origin
// (or, fallback, Referer) is present and does not match this site's own origin. A cross-site page
// cannot forge Origin, so this blocks a logged-in admin from being driven to destructive actions by
// a malicious page. Same-origin requests, and non-browser callers that send no Origin, are allowed.
export function isCrossOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin) {
    // No Origin header (e.g. same-origin GET, or a non-browser client). Fall back to Referer host.
    const ref = req.headers.get("referer");
    if (!ref) return false;
    try {
      return new URL(ref).host !== host;
    } catch {
      return true;
    }
  }
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

function adminSet(): Set<string> {
  return new Set(
    (process.env.ADMIN_ADDRESSES ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** True if the given address is an allowlisted admin. */
export function isAdminAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return adminSet().has(address.toLowerCase());
}

/** The current session's address if it is an admin, else null. */
export async function getAdminAddress(): Promise<string | null> {
  const addr = await getSessionAddress();
  return addr && isAdminAddress(addr) ? addr : null;
}

/**
 * Gate an admin API route: returns a 403 NextResponse if the caller is not an admin, else null.
 * Pass the request on state-changing (non-GET) routes so the CSRF Origin check also runs; GET reads
 * can call it with no argument.
 */
export async function requireAdmin(req?: NextRequest): Promise<NextResponse | null> {
  if (req) {
    // CSRF: a cross-origin request must never be allowed to act on the admin's cookie session.
    if (isCrossOrigin(req)) {
      return NextResponse.json({ error: "cross-origin request blocked", code: "CSRF" }, { status: 403 });
    }
    // Modest rate limit so the admin surface can't be probed unboundedly (S9).
    const limited = rateLimit(req, "admin", 60, 60_000);
    if (limited) return limited;
  }
  const addr = await getAdminAddress();
  if (!addr) {
    return NextResponse.json({ error: "admin access required", code: "NOT_ADMIN" }, { status: 403 });
  }
  return null;
}
