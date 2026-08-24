import { NextRequest, NextResponse } from "next/server";
import {
  logSecurityEvent,
  noStoreJson,
  privilegedSupabaseHeaders,
  rejectCrossSiteMutation,
  serviceFetch,
  validateStaffRequest
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const BUCKET = "mis-files";
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "msi", "bat", "cmd", "com", "scr", "ps1", "js", "vbs", "jar", "sh",
  "html", "htm", "xhtml", "svg", "xml", "php", "asp", "aspx", "jsp", "py", "rb", "pl", "cgi", "wasm"
]);
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "psd", "ai", "eps", "ps",
  "zip", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "indd", "cdr"
]);
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/postscript",
  "application/octet-stream",
  "application/x-indesign",
  "application/vnd.corel-draw",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/vnd.adobe.photoshop",
  "text/plain",
  "text/csv"
]);

function safePath(path: string) {
  return path.length <= 900 && !path.startsWith("/") && !path.includes("..") && /^[a-zA-Z0-9._/-]+$/.test(path);
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
  if (mime === "image/tiff" || ext === "tif" || ext === "tiff") {
    return starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a);
  }
  if (mime === "image/webp" || ext === "webp") {
    return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (mime === "image/bmp" || ext === "bmp") return starts(0x42, 0x4d);
  if (mime === "image/vnd.adobe.photoshop" || ext === "psd") return starts(0x38, 0x42, 0x50, 0x53);
  if (["ai", "eps", "ps"].includes(ext) || mime === "application/postscript") {
    return starts(0x25, 0x21) || starts(0x25, 0x50, 0x44, 0x46);
  }
  if (["zip", "docx", "xlsx", "pptx"].includes(ext) || mime.includes("zip") || mime.includes("openxmlformats")) {
    return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
  }
  return true;
}

async function jobExists(jobId: string) {
  const response = await serviceFetch(
    `/rest/v1/mis_records?workspace_id=eq.gross-printing&collection=eq.jobs&record_id=eq.${encodeURIComponent(jobId)}&deleted_at=is.null&select=record_id&limit=1`
  );
  if (!response.ok) return false;
  return ((await response.json()) as unknown[]).length > 0;
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES + 2 * 1024 * 1024) {
    return noStoreJson({ error: "The upload exceeds 100 MB." }, { status: 413 });
  }
  const context = await validateStaffRequest(request);
  if (context instanceof NextResponse) return context;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return noStoreJson({ error: "Secure file storage is not configured." }, { status: 503 });

  const form = await request.formData().catch(() => undefined);
  const file = form?.get("file");
  const storagePath = String(form?.get("storagePath") ?? "");
  if (!(file instanceof File)) return noStoreJson({ error: "Choose a valid file." }, { status: 400 });
  if (!safePath(storagePath)) return noStoreJson({ error: "The secure file path is invalid." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) return noStoreJson({ error: "The file is empty or exceeds 100 MB." }, { status: 413 });

  const ext = extension(file.name);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    await logSecurityEvent(context, "Blocked executable upload", "file_security", { filename: file.name, extension: ext });
    return noStoreJson({ error: "Executable, script, and active web files are not allowed." }, { status: 415 });
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return noStoreJson({ error: "This file extension is not approved for the MIS." }, { status: 415 });
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIMES.has(mime)) {
    return noStoreJson({ error: "This file type is not approved for the MIS." }, { status: 415 });
  }
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!signatureMatches(head, mime, ext)) {
    await logSecurityEvent(context, "Blocked mismatched file signature", "file_security", { filename: file.name, mime });
    return noStoreJson({ error: "The file contents do not match the file type." }, { status: 415 });
  }

  const parts = storagePath.split("/");
  const jobId = parts[1];
  if (context.profile.role !== "admin" && context.profile.role !== "front_desk") {
    if (!jobId || jobId === "customer-files" || !(await jobExists(jobId))) {
      return noStoreJson({ error: "Production staff may upload only to an existing job." }, { status: 403 });
    }
  }

  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: privilegedSupabaseHeaders(SUPABASE_SERVICE_KEY, {
      "Content-Type": mime,
      "x-upsert": "false",
      "Cache-Control": "no-store"
    }),
    body: file,
    cache: "no-store"
  });
  if (!uploadResponse.ok) {
    const payload = (await uploadResponse.json().catch(() => ({}))) as { message?: string; error?: string };
    return noStoreJson({ error: payload.message ?? payload.error ?? "Secure upload failed." }, { status: 502 });
  }

  await logSecurityEvent(context, "Uploaded protected MIS file", "file_upload", {
    filename: file.name,
    storagePath,
    size: file.size,
    mime
  });
  return noStoreJson({ ok: true, storagePath, bucket: BUCKET });
}
