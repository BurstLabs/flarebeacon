import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/internal-auth";
import { ingestValidators } from "@/lib/validators";

export const dynamic = "force-dynamic";

// POST /api/internal/ingest-validators
// Cron: refresh per-validator stats (fee/uptime/connected) from the P-chain. Internal-auth gated.
export async function POST(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;
  const counts = await ingestValidators();
  return NextResponse.json({ ok: true, ...counts });
}
