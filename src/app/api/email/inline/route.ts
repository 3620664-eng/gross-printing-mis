import { NextRequest, NextResponse } from "next/server";
import { emailServerConfigured, errorResponse, loadMailboxAttachment, requireActiveAppUser } from "@/lib/gmail-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disposition(filename: string) {
  const clean = filename.replace(/[\r\n]/g, "").trim().slice(0, 180) || "inline-image";
  const fallback = clean.replace(/["\\;=]/g, "_").replace(/[^\x20-\x7E]/g, "_") || "inline-image";
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireActiveAppUser(request, ["admin", "front_desk", "prepress"]);
  if (auth instanceof NextResponse) return auth;
  if (!emailServerConfigured()) return errorResponse("The Gross Printing mailbox is not configured on the server.", 503);

  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId")?.trim();
  const attachmentId = url.searchParams.get("attachmentId")?.trim();
  const folder = url.searchParams.get("folder") === "sent" ? "sent" : "inbox";
  const uidValidity = url.searchParams.get("uidValidity")?.trim() || undefined;

  if (!messageId || !/^\d+$/.test(messageId) || !attachmentId || !/^part-\d+$/.test(attachmentId)) {
    return errorResponse("Invalid inline image request.");
  }
  if (!uidValidity || !/^\d+$/.test(uidValidity)) {
    return errorResponse("Refresh Email Center before displaying this inline image.", 409);
  }

  try {
    const attachment = await loadMailboxAttachment(messageId, attachmentId, folder, uidValidity);
    if (!attachment.inline || !/^image\/(png|jpeg|gif|webp)$/i.test(attachment.mimeType)) {
      return errorResponse("Only verified inline image parts can be displayed.", 415);
    }
    return new NextResponse(Uint8Array.from(attachment.bytes), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": disposition(attachment.filename),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox"
      }
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to display the inline image.", 502);
  }
}
