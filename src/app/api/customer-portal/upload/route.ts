import { NextRequest, NextResponse } from "next/server";
import {
  customerPortalError,
  requireCustomerPortalUser,
  uploadCustomerPortalFile
} from "@/lib/customer-portal-server";
import { rejectCrossSiteMutation } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 102 * 1024 * 1024) {
    return customerPortalError("The upload exceeds 100 MB.", 413);
  }
  const user = await requireCustomerPortalUser(request);
  if (user instanceof NextResponse) return user;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return customerPortalError("Unable to read this upload.");
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return customerPortalError("Choose a file to upload.");
  const requestType = formData.get("requestType") === "new_order" ? "new_order" : "file_upload";
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const jobId = String(formData.get("jobId") ?? "").trim() || undefined;
  let metadata: Record<string, unknown> = {};
  const metadataRaw = String(formData.get("metadata") ?? "").trim();
  if (metadataRaw) {
    try {
      const parsed = JSON.parse(metadataRaw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      return customerPortalError("The structured order details could not be read.");
    }
  }
  if (!title) return customerPortalError("Enter an order or upload title.");

  try {
    const portalRequest = await uploadCustomerPortalFile({
      user,
      file,
      title,
      note,
      jobId,
      requestType,
      metadata
    });
    return NextResponse.json({ message: "File uploaded and sent to Gross Printing.", request: portalRequest }, { status: 201 });
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to upload this file.",
      500
    );
  }
}
