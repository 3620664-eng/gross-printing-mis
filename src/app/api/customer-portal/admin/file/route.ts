import { NextRequest, NextResponse } from "next/server";
import {
  customerPortalError,
  loadCustomerPortalRequestFileForStaff,
  requireCustomerPortalStaff
} from "@/lib/customer-portal-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCustomerPortalStaff(request);
  if (auth instanceof NextResponse) return auth;
  const requestId = request.nextUrl.searchParams.get("id")?.trim();
  if (!requestId) return customerPortalError("A portal request ID is required.");
  try {
    const file = await loadCustomerPortalRequestFileForStaff(requestId);
    const responseBytes = Uint8Array.from(file.bytes);
    return new NextResponse(responseBytes, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="${file.filename.replace(/["\r\n]/g, "")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to open this portal upload.",
      404
    );
  }
}
