import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { emailServerConfigured, loadMailboxAttachment } from "@/lib/gmail-server";
import {
  logSecurityEvent,
  noStoreJson,
  privilegedSupabaseHeaders,
  rejectCrossSiteMutation,
  rejectOversizedJson,
  serviceFetch,
  validateStaffRequest
} from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestBodyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const BUCKET = "mis-files";
const EMAIL_CACHE_PREFIX = "email-cache/v1";
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set(["exe", "dll", "msi", "bat", "cmd", "com", "scr", "ps1", "js", "vbs", "jar", "sh", "html", "htm", "xhtml", "svg", "xml", "php", "asp", "aspx", "jsp", "py", "rb", "pl", "cgi", "wasm"]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "psd", "ai", "eps", "ps", "zip", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "indd", "cdr"]);
const ALLOWED_MIMES = new Set([
  "application/pdf", "application/zip", "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "application/postscript", "application/octet-stream", "application/x-indesign", "application/vnd.corel-draw",
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff", "image/vnd.adobe.photoshop",
  "text/plain", "text/csv"
]);

function emailCachePath(folder: "inbox" | "sent", uidValidity: string, messageId: string, attachmentId: string) {
  const digest = createHash("sha256").update(`${folder}:${uidValidity}:${messageId}:${attachmentId}`).digest("hex");
  return `${EMAIL_CACHE_PREFIX}/${digest.slice(0, 2)}/${digest}`;
}

async function readCachedEmailAttachment(path: string) {
  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await serviceFetch(`/storage/v1/object/${BUCKET}/${encodedPath}`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length ? bytes : undefined;
  } catch {
    return undefined;
  }
}

async function writeCachedEmailAttachment(path: string, bytes: Buffer, mimeType: string) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) return;
  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    await serviceFetch(`/storage/v1/object/${BUCKET}/${encodedPath}`, {
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
    // The job copy can still be saved even if the reusable email cache is unavailable.
  }
}

function extension(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

function signatureMatches(bytes: Uint8Array, mime: string, ext: string) {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (mime === "application/pdf" || ext === "pdf") return starts(0x25, 0x50, 0x44, 0x46);
  if (mime === "image/png" || ext === "png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/jpeg" || ext === "jpg" || ext === "jpeg") return starts(0xff, 0xd8, 0xff);
  if (mime === "image/gif" || ext === "gif") return starts(0x47, 0x49, 0x46, 0x38);
  if (mime === "image/tiff" || ext === "tif" || ext === "tiff") return starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a);
  if (mime === "image/webp" || ext === "webp") return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (mime === "image/bmp" || ext === "bmp") return starts(0x42, 0x4d);
  if (mime === "image/vnd.adobe.photoshop" || ext === "psd") return starts(0x38, 0x42, 0x50, 0x53);
  if (["ai", "eps", "ps"].includes(ext) || mime === "application/postscript") return starts(0x25, 0x21) || starts(0x25, 0x50, 0x44, 0x46);
  if (["zip", "docx", "xlsx", "pptx"].includes(ext) || mime.includes("zip") || mime.includes("openxmlformats")) {
    return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
  }
  return true;
}

async function jobExists(jobId: string) {
  const response = await serviceFetch(`/rest/v1/mis_records?workspace_id=eq.gross-printing&collection=eq.jobs&record_id=eq.${encodeURIComponent(jobId)}&deleted_at=is.null&select=record_id&limit=1`);
  if (!response.ok) return false;
  return ((await response.json()) as unknown[]).length > 0;
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  const auth = await validateStaffRequest(request, ["admin", "front_desk", "prepress"]);
  if (auth instanceof NextResponse) return auth;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return noStoreJson({ error: "Secure file storage is not configured." }, { status: 503 });

  let body: {
    messageId?: string;
    attachmentId?: string;
    folder?: "inbox" | "sent";
    uidValidity?: string;
    jobId?: string;
    jobNumber?: string;
    customerId?: string;
    sourceThreadId?: string;
    sourceMessageId?: string;
    filename?: string;
    mimeType?: string;
    mailboxName?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid email artwork request." }, { status: 400 });
  }
  const messageId = body.messageId?.trim() ?? "";
  const attachmentId = body.attachmentId?.trim() ?? "";
  const jobId = body.jobId?.trim() ?? "";
  if (!/^\d+$/.test(messageId) || !/^part-\d+$/.test(attachmentId) || !/^[a-zA-Z0-9_-]{1,160}$/.test(jobId)) {
    return noStoreJson({ error: "Message, attachment, and job identifiers are required." }, { status: 400 });
  }
  if (!body.uidValidity || !/^\d+$/.test(body.uidValidity)) {
    return noStoreJson({ error: "Refresh Email Center before moving this attachment into a job. The mailbox identity must be verified first." }, { status: 409 });
  }
  if (auth.profile.role === "prepress" && !(await jobExists(jobId))) {
    return noStoreJson({ error: "Production staff may preserve email artwork only to an existing job." }, { status: 403 });
  }

  try {
    const folder = body.folder === "sent" ? "sent" : "inbox";
    const cachedBytes = await readCachedEmailAttachment(emailCachePath(folder, body.uidValidity, messageId, attachmentId));
    if (!cachedBytes && !emailServerConfigured()) {
      return noStoreJson({ error: "The mailbox is unavailable and this original attachment has not been cached yet." }, { status: 503 });
    }
    const attachment = cachedBytes
      ? {
          bytes: cachedBytes,
          filename: body.filename?.trim() || "attachment",
          mimeType: body.mimeType?.trim() || "application/octet-stream",
          size: cachedBytes.length,
          inline: false,
          mailboxName: body.mailboxName || (folder === "sent" ? "Sent" : "INBOX"),
          uidValidity: body.uidValidity
        }
      : await loadMailboxAttachment(messageId, attachmentId, folder, body.uidValidity);
    if (!cachedBytes) {
      await writeCachedEmailAttachment(
        emailCachePath(folder, body.uidValidity, messageId, attachmentId),
        Buffer.from(attachment.bytes),
        attachment.mimeType || body.mimeType || "application/octet-stream"
      );
    }
    // Some mail clients mark real customer JPG/PNG artwork as "inline" even when it has a filename.
    // Anonymous generated inline-image-N assets are normally signature/logo parts and are never production artwork.
    if (/^inline-image-\d+(?:\.[a-z0-9]+)?$/i.test(attachment.filename.trim())) {
      return noStoreJson({ error: "Embedded signature images cannot be promoted to production artwork." }, { status: 415 });
    }
    if (attachment.size <= 0 || attachment.size > MAX_FILE_BYTES) return noStoreJson({ error: "The email attachment is empty or exceeds 100 MB." }, { status: 413 });

    const ext = extension(attachment.filename);
    const mime = attachment.mimeType || "application/octet-stream";
    if (BLOCKED_EXTENSIONS.has(ext) || !ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIMES.has(mime)) {
      await logSecurityEvent(auth, "Blocked email artwork file type", "file_security", { filename: attachment.filename, mime, extension: ext });
      return noStoreJson({ error: "This email attachment type is not approved for production artwork." }, { status: 415 });
    }
    if (!signatureMatches(new Uint8Array(attachment.bytes.subarray(0, 32)), mime, ext)) {
      await logSecurityEvent(auth, "Blocked mismatched email artwork signature", "file_security", { filename: attachment.filename, mime });
      return noStoreJson({ error: "The email attachment contents do not match the advertised file type." }, { status: 415 });
    }

    const checksumSha256 = createHash("sha256").update(attachment.bytes).digest("hex");
    const safeExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 12) || "bin";
    const storagePath = `jobs/${jobId}/email/${Date.now()}-${checksumSha256.slice(0, 12)}-${randomBytes(4).toString("hex")}.${safeExt}`;
    const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
    const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`, {
      method: "POST",
      headers: privilegedSupabaseHeaders(SUPABASE_SERVICE_KEY, {
        "Content-Type": mime,
        "x-upsert": "false",
        "Cache-Control": "no-store"
      }),
      body: Uint8Array.from(attachment.bytes),
      cache: "no-store"
    });
    if (!uploadResponse.ok) {
      const payload = (await uploadResponse.json().catch(() => ({}))) as { message?: string; error?: string };
      return noStoreJson({ error: payload.message ?? payload.error ?? "Unable to preserve the email artwork." }, { status: 502 });
    }

    await logSecurityEvent(auth, "Preserved email attachment as production artwork", "email_artwork", {
      jobId,
      jobNumber: body.jobNumber,
      customerId: body.customerId,
      filename: attachment.filename,
      size: attachment.size,
      checksumSha256,
      sourceThreadId: body.sourceThreadId,
      sourceMessageId: body.sourceMessageId,
      mailboxName: attachment.mailboxName,
      uidValidity: attachment.uidValidity,
      mailboxUid: messageId
    });

    return noStoreJson({
      ok: true,
      filename: attachment.filename,
      mimeType: mime,
      size: attachment.size,
      storagePath,
      storageBucket: BUCKET,
      checksumSha256,
      mailboxName: attachment.mailboxName,
      uidValidity: attachment.uidValidity,
      persistedAt: new Date().toISOString()
    });
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : "Unable to preserve the email artwork." }, { status: 502 });
  }
}
