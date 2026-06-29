import { NextResponse } from "next/server";
import { getAdminAddress } from "@/lib/admin";

export const dynamic = "force-dynamic";

// GET /api/admin/session -> { admin: boolean, address }. Lets the /admin page decide whether to show
// the dashboard or the connect-as-admin prompt, without leaking anything to non-admins.
export async function GET() {
  const address = await getAdminAddress();
  return NextResponse.json({ admin: !!address, address });
}
