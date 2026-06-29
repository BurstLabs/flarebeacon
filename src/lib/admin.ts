// Admin authorization. An admin is simply a signed-in session whose verified address is listed in
// the ADMIN_ADDRESSES env (comma-separated, lowercased). This reuses the existing SIWE sign-in +
// HMAC session cookie: there is no separate admin password. requireAdmin() gates the admin API.

import { NextResponse } from "next/server";
import { getSessionAddress } from "./session";

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

/** Gate an admin API route: returns a 403 NextResponse if the caller is not an admin, else null. */
export async function requireAdmin(): Promise<NextResponse | null> {
  const addr = await getAdminAddress();
  if (!addr) {
    return NextResponse.json({ error: "admin access required", code: "NOT_ADMIN" }, { status: 403 });
  }
  return null;
}
