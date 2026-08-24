import { NextRequest, NextResponse } from "next/server";
import {
  logSecurityEvent,
  noStoreJson,
  privilegedSupabaseHeaders,
  serviceFetch,
  validateStaffRequest
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const BUCKET = "mis-files";

function safePath(path: string) {
  return path.length <= 900 && !path.startsWith("/") && !path.includes("..") && /^[a-zA-Z0-9._/-]+$/.test(path);
}

async function jobExists(jobId: string) {
  const response = await serviceFetch(
    `/rest/v1/mis_records?workspace_id=eq.gross-printing&collection=eq.jobs&record_id=eq.${encodeURIComponent(jobId)}&deleted_at=is.null&select=record_id&limit=1`
  );
  if (!response.ok) return false;
  return ((await response.json()) as unknown[]).length > 0;
}

export async function GET(request: NextRequest) {
  const context = await validateStaffRequest(request);
  if (context instanceof NextResponse) return context;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return noStoreJson({ error: "Secure file storage is not configured." }, { status: 503 });
  const storagePath = request.nextUrl.searchParams.get("path") ?? "";
  if (!safePath(storagePath)) return noStoreJson({ error: "The secure file path is invalid." }, { status: 400 });

  const parts = storagePath.split("/");
  const jobId = parts[1];
  if (context.profile.role !== "admin" && context.profile.role !== "front_desk") {
    if (!jobId || jobId === "customer-files" || !(await jobExists(jobId))) {
      return noStoreJson({ error: "You do not have permission to open this file." }, { status: 403 });
    }
  }

  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const signResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: privilegedSupabaseHeaders(SUPABASE_SERVICE_KEY),
    body: JSON.stringify({ expiresIn: 120 }),
    cache: "no-store"
  });
  const payload = (await signResponse.json().catch(() => ({}))) as { signedURL?: string; signedUrl?: string; message?: string };
  if (!signResponse.ok) return noStoreJson({ error: payload.message ?? "Unable to create a secure download link." }, { status: 502 });
  const signedPath = payload.signedURL ?? payload.signedUrl;
  if (!signedPath) return noStoreJson({ error: "Secure file link was not returned." }, { status: 502 });
  const url = signedPath.startsWith("http") ? signedPath : `${SUPABASE_URL}/storage/v1${signedPath}`;
  await logSecurityEvent(context, "Opened protected MIS file", "file_access", { storagePath });
  return noStoreJson({ ok: true, url, expiresIn: 120 });
}
