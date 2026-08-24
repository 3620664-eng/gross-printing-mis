import { NextRequest, NextResponse } from "next/server";
import {
  emailServerConfigured,
  errorResponse,
  requireActiveAppUser,
  setMailboxReadState,
  type MailboxReadStateChange
} from "@/lib/gmail-server";
import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  const auth = await requireActiveAppUser(request, ["admin", "front_desk"]);
  if (auth instanceof NextResponse) return auth;
  if (!emailServerConfigured()) return errorResponse("The Gross Printing mailbox is not configured on the server.", 503);

  let body: { changes?: MailboxReadStateChange[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid mailbox read-state request.");
  }
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (!changes.length) return errorResponse("At least one mailbox message is required.");
  if (changes.length > 100) return errorResponse("Too many mailbox messages in one read-state request.");
  if (changes.some((change) => !change || typeof change.messageId !== "string" || typeof change.unread !== "boolean" || !change.uidValidity || !/^\d+$/.test(change.uidValidity))) {
    return errorResponse("Invalid mailbox read-state change.");
  }
  try {
    const result = await setMailboxReadState(changes);
    return NextResponse.json({ ok: true, updated: result.updated });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to update mailbox read status.", 502);
  }
}
