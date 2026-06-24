import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/session";

// GET /api/auth/session -> { address } of the current signed-in session, or { address: null }.
// Lets a client (e.g. the submit page) skip the connect/sign step when already authenticated.
export async function GET() {
  const address = await getSessionAddress();
  return NextResponse.json({ address });
}
