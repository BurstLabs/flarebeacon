import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { publishFeedToRepo } from "@/lib/feed";

export const dynamic = "force-dynamic";

// GET /api/admin/qualification?q=  -> QualificationState rows, optionally filtered by voter address.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const rows = await prisma.qualificationState.findMany({
    where: q ? { voter: { contains: q } } : undefined,
    orderBy: [{ network: "asc" }, { voter: "asc" }],
    take: 300,
  });
  return NextResponse.json({ rows });
}

// PATCH /api/admin/qualification  { network, voter, qualified }  -> override the latched qualified flag.
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await req.json().catch(() => null);
  const network = typeof b?.network === "string" ? b.network : null;
  const voter = typeof b?.voter === "string" ? b.voter.toLowerCase() : null;
  const qualified = typeof b?.qualified === "boolean" ? b.qualified : null;
  if (!network || !voter || qualified === null) {
    return NextResponse.json({ error: "network, voter, qualified required" }, { status: 400 });
  }
  const row = await prisma.qualificationState.update({
    where: { network_voter: { network, voter } },
    data: { qualified, qualifiedAt: qualified ? new Date() : null },
  });
  await publishFeedToRepo().catch(() => {});
  return NextResponse.json({ ok: true, row });
}
