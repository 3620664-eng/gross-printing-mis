import { NextRequest, NextResponse } from "next/server";
import { emailServerConfigured, errorResponse, loadMailboxMessageDetails, requireActiveAppUser } from "@/lib/gmail-server";
import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 16 * 1024);
  if (oversized) return oversized;
  const auth = await requireActiveAppUser(request, ["admin", "front_desk", "prepress"]);
  if (auth instanceof NextResponse) return auth;
  if (!emailServerConfigured()) return errorResponse("The Gross Printing mailbox is not configured on the server.", 503);

  let body: { messageId?: string; folder?: "inbox" | "sent"; uidValidity?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid message request.");
  }
  if (!body.messageId || !/^\d+$/.test(body.messageId)) return errorResponse("A valid mailbox message identifier is required.");
  if (!body.uidValidity || !/^\d+$/.test(body.uidValidity)) {
    return errorResponse("Refresh Email Center before opening the complete message so the mailbox identity can be verified.", 409);
  }

  try {
    const message = await loadMailboxMessageDetails(body.folder === "sent" ? "sent" : "inbox", body.messageId, body.uidValidity);
    return NextResponse.json({ message }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to load the complete email.", 502);
  }
}
