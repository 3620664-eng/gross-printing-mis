import { NextRequest, NextResponse } from "next/server";
import { aiErrorResponse, analyzePrintRequest, requireAiUser, type AiAnalyzeInput } from "@/lib/ai-pricing-server";

import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 7 * 1024 * 1024);
  if (oversized) return oversized;
  const auth = await requireAiUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: AiAnalyzeInput;
  try {
    body = (await request.json()) as AiAnalyzeInput;
  } catch {
    return aiErrorResponse(new Error("Invalid AI analysis request."), 400);
  }

  const hasText = Boolean(body.requestText?.trim());
  const hasArtwork = Boolean(body.artwork?.dataUrl || body.artwork?.name);
  if (!hasText && !hasArtwork) {
    return aiErrorResponse(new Error("Add the customer request or artwork before analyzing."), 400);
  }
  if ((body.requestText?.length ?? 0) > 40_000) {
    return aiErrorResponse(new Error("The request text is too long. Keep it under 40,000 characters."), 413);
  }
  if ((body.artwork?.dataUrl?.length ?? 0) > 5_500_000) {
    return aiErrorResponse(new Error("The artwork preview is too large for one analysis request."), 413);
  }

  try {
    const result = await analyzePrintRequest(body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analysis could not be completed.";
    if (/no structured specification|specification that could not be read/i.test(message)) {
      return NextResponse.json(
        {
          ok: false,
          code: "NEEDS_HUMAN_REVIEW",
          error: "AI could not determine a reliable print-job specification from this email. Keep it in Needs Review; do not open a blank production setup."
        },
        { status: 422 }
      );
    }
    return aiErrorResponse(error, 502);
  }
}
