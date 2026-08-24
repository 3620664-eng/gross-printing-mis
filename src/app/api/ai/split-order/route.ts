import { NextRequest, NextResponse } from "next/server";
import { analyzeOrderSplit, type AiOrderSplitInput } from "@/lib/ai-order-split-server";
import { aiErrorResponse, requireAiUser } from "@/lib/ai-pricing-server";

import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 12 * 1024 * 1024);
  if (oversized) return oversized;
  const auth = await requireAiUser(request);
  if (auth instanceof NextResponse) return auth;

  let input: AiOrderSplitInput;
  try {
    input = (await request.json()) as AiOrderSplitInput;
  } catch {
    return aiErrorResponse(new Error("Invalid multi-item analysis request."), 400);
  }

  if (!input.requestText?.trim() && !input.attachments?.length) {
    return aiErrorResponse(new Error("Add the customer email or attachments before reviewing the order split."), 400);
  }
  if ((input.requestText?.length ?? 0) > 40000) {
    return aiErrorResponse(new Error("The email text is too long. Keep it under 40,000 characters."), 413);
  }
  if (!Array.isArray(input.attachments) || input.attachments.length > 30) {
    return aiErrorResponse(new Error("Review no more than 30 attachments in one email ticket."), 413);
  }

  try {
    return NextResponse.json({ ok: true, result: await analyzeOrderSplit(input) });
  } catch (error) {
    return aiErrorResponse(error, 502);
  }
}
