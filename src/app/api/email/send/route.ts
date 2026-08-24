import { NextRequest, NextResponse } from "next/server";
import { emailMailbox, emailServerConfigured, errorResponse, loadMailboxAttachment, requireActiveAppUser, sendGmailMessage } from "@/lib/gmail-server";
import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OutgoingAttachment = { filename?: string; mimeType?: string; base64?: string };
type SourceAttachment = {
  messageId?: string;
  attachmentId?: string;
  folder?: "inbox" | "sent";
  filename?: string;
  mimeType?: string;
  uidValidity?: string;
};

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 4 * 1024 * 1024);
  if (oversized) return oversized;
  const auth = await requireActiveAppUser(request, ["admin", "front_desk"]);
  if (auth instanceof NextResponse) return auth;
  if (!emailServerConfigured()) return errorResponse("The Gross Printing mailbox is not configured on the server.", 503);

  let body: {
    to?: string;
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: OutgoingAttachment[];
    sourceAttachments?: SourceAttachment[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid email request.");
  }

  if (!body.to?.trim()) return errorResponse("A recipient email is required.");
  if (!body.subject?.trim()) return errorResponse("Email subject is required.");
  if (!body.body?.trim()) return errorResponse("Email message is required.");

  const attachments = (body.attachments ?? [])
    .filter((item) => item.filename && item.base64)
    .slice(0, 10)
    .map((item) => ({
      filename: String(item.filename).slice(0, 180),
      mimeType: String(item.mimeType || "application/octet-stream").slice(0, 120),
      base64: String(item.base64)
    }));

  try {
    const sourceAttachments = (body.sourceAttachments ?? [])
      .filter((item) => item.messageId && item.attachmentId)
      .slice(0, 10);
    if (sourceAttachments.some((item) => !item.uidValidity || !/^\d+$/.test(item.uidValidity))) {
      throw new Error("Refresh Email Center before forwarding mailbox attachments so their mailbox identity can be verified.");
    }
    for (const item of sourceAttachments) {
      const source = await loadMailboxAttachment(
        String(item.messageId),
        String(item.attachmentId),
        item.folder === "sent" ? "sent" : "inbox",
        item.uidValidity
      );
      attachments.push({
        filename: source.filename.slice(0, 180),
        mimeType: source.mimeType.slice(0, 120),
        base64: source.bytes.toString("base64")
      });
    }

    const sent = await sendGmailMessage({
      to: body.to.trim(),
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject.trim(),
      body: body.body,
      threadId: body.threadId,
      inReplyTo: body.inReplyTo,
      references: body.references,
      attachments
    });
    const delivery = sent.blocked ? "blocked" : sent.redirected ? "redirected" : sent.testDelivery ? "test_sent" : "sent";
    return NextResponse.json({
      ok: true,
      mailbox: emailMailbox(),
      messageId: sent.id,
      threadId: sent.threadId,
      delivery,
      safetyMode: sent.safetyMode,
      safetyReason: sent.safetyReason,
      originalTo: sent.originalTo
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to send email.", 502);
  }
}
