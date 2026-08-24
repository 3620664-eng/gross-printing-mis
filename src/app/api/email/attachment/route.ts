import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { emailServerConfigured, errorResponse, loadMailboxAttachment, requireActiveAppUser } from "@/lib/gmail-server";
import { rejectCrossSiteMutation, rejectOversizedJson, serviceFetch } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestBodyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const CACHE_BUCKET = "mis-files";
const CACHE_PREFIX = "email-cache/v1";
const MAX_CACHE_BYTES = 100 * 1024 * 1024;

function contentDisposition(kind: "inline" | "attachment", filename: string) {
  const cleaned = filename.replace(/[\r\n]/g, "").trim().slice(0, 180) || "attachment";
  const fallback = cleaned.replace(/["\\;=]/g, "_").replace(/[^\x20-\x7E]/g, "_") || "attachment";
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function normalizedMime(mime: string, filename: string) {
  const lowerName = filename.toLowerCase();
  if (mime === "application/pdf" || lowerName.endsWith(".pdf")) return "application/pdf";
  if (/^image\/(png|jpeg|gif|webp)$/i.test(mime)) return mime;
  if (lowerName.endsWith(".png")) return "image/png";
  if (/\.(jpe?g)$/i.test(lowerName)) return "image/jpeg";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".webp")) return "image/webp";
  return mime || "application/octet-stream";
}

function safeInlineMime(mime: string) {
  return mime === "application/pdf" || /^image\/(png|jpeg|gif|webp)$/i.test(mime);
}

function cachePath(folder: "inbox" | "sent", uidValidity: string, messageId: string, attachmentId: string) {
  const digest = createHash("sha256")
    .update(`${folder}:${uidValidity}:${messageId}:${attachmentId}`)
    .digest("hex");
  return `${CACHE_PREFIX}/${digest.slice(0, 2)}/${digest}`;
}

function encodedStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function readCachedAttachment(path: string) {
  try {
    const response = await serviceFetch(`/storage/v1/object/${CACHE_BUCKET}/${encodedStoragePath(path)}`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length ? bytes : undefined;
  } catch {
    return undefined;
  }
}

async function writeCachedAttachment(path: string, bytes: Uint8Array, mimeType: string) {
  if (!bytes.length || bytes.length > MAX_CACHE_BYTES) return;
  try {
    await serviceFetch(`/storage/v1/object/${CACHE_BUCKET}/${encodedStoragePath(path)}`, {
      method: "POST",
      headers: {
        "Content-Type": mimeType || "application/octet-stream",
        "x-upsert": "true",
        "Cache-Control": "private, max-age=31536000, immutable"
      },
      body: requestBodyBytes(bytes),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    // Mailbox access must still work if persistent cache storage is temporarily unavailable.
  }
}

function attachmentResponse(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  requestedDisposition: "inline" | "attachment",
  source: "cache" | "mailbox"
) {
  const responseMime = normalizedMime(mimeType, filename);
  const disposition = requestedDisposition === "inline" && safeInlineMime(responseMime) ? "inline" : "attachment";
  return new NextResponse(requestBodyBytes(bytes), {
    headers: {
      "Content-Type": responseMime,
      "Content-Disposition": contentDisposition(disposition, filename),
      // This endpoint is authenticated. The original file is cached privately in Supabase,
      // while browsers keep only their in-memory Blob cache for the active workspace session.
      "Cache-Control": "private, no-store, max-age=0",
      "X-GP-Attachment-Source": source,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; sandbox"
    }
  });
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 32 * 1024);
  if (oversized) return oversized;
  const auth = await requireActiveAppUser(request, ["admin", "front_desk", "prepress"]);
  if (auth instanceof NextResponse) return auth;

  let body: {
    messageId?: string;
    attachmentId?: string;
    filename?: string;
    mimeType?: string;
    disposition?: "inline" | "attachment";
    folder?: "inbox" | "sent";
    uidValidity?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid attachment request.");
  }
  if (!body.messageId || !/^\d+$/.test(body.messageId) || !body.attachmentId || !/^part-\d+$/.test(body.attachmentId)) {
    return errorResponse("Message and attachment identifiers are required.");
  }
  if (!body.uidValidity || !/^\d+$/.test(body.uidValidity)) {
    return errorResponse("Refresh Email Center before opening this attachment so the mailbox identity can be verified.", 409);
  }

  const folder = body.folder === "sent" ? "sent" : "inbox";
  const path = cachePath(folder, body.uidValidity, body.messageId, body.attachmentId);
  const requestedFilename = body.filename?.replace(/[\r\n]/g, "").trim().slice(0, 240) || "attachment";
  const requestedMime = normalizedMime(body.mimeType ?? "", requestedFilename);
  const disposition = body.disposition === "inline" ? "inline" : "attachment";

  const cached = await readCachedAttachment(path);
  if (cached) {
    return attachmentResponse(cached, requestedFilename, requestedMime, disposition, "cache");
  }
  if (!emailServerConfigured()) return errorResponse("The Gross Printing mailbox is not configured on the server and this attachment is not cached yet.", 503);

  try {
    const attachment = await loadMailboxAttachment(
      body.messageId,
      body.attachmentId,
      folder,
      body.uidValidity
    );
    const filename = body.filename?.trim() || attachment.filename || requestedFilename;
    const mimeType = normalizedMime(body.mimeType || attachment.mimeType, filename);
    const bytes = Uint8Array.from(attachment.bytes);

    // Return the original high-resolution bytes immediately. Persist the exact same bytes
    // after the response so future preview / Job Setup / AI / download calls avoid IMAP.
    after(async () => {
      await writeCachedAttachment(path, bytes, mimeType);
    });

    return attachmentResponse(bytes, filename, mimeType, disposition, "mailbox");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download attachment.";
    const status = /timed out/i.test(message) ? 504 : 502;
    return errorResponse(message, status);
  }
}
