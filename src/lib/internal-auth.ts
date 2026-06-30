// Shared gate for the internal cron endpoints (evaluate-qualification, republish-feed, purge-stale,
// sync-management-group, tally-flags). Uses a DEDICATED INTERNAL_API_SECRET and a constant-time
// comparison, since some of these endpoints delete/mutate data. The secret is NOT shared with the
// session-signing secret (S4): a session-cookie compromise must not grant internal-API access, and
// the two must rotate independently. In production a missing INTERNAL_API_SECRET fails hard.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

if (process.env.NODE_ENV === "production" && !process.env.INTERNAL_API_SECRET) {
  throw new Error("INTERNAL_API_SECRET must be set in production");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Returns a 401 response if the request is not authorized, otherwise null. */
export function requireInternalAuth(req: NextRequest): NextResponse | null {
  // Dev fallback only; production requires the dedicated secret (enforced at module load above).
  const secret =
    process.env.INTERNAL_API_SECRET ??
    (process.env.NODE_ENV !== "production" ? process.env.SESSION_SECRET : undefined);
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
