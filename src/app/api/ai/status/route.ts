import { NextRequest, NextResponse } from "next/server";
import { aiServerStatus, requireAiUser } from "@/lib/ai-pricing-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAiUser(request, ["admin", "front_desk"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({
    ...aiServerStatus(),
    pricingAuthority: "Gross Printing deterministic pricing engine",
    storesResponses: false
  });
}
