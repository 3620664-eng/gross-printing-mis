import { NextRequest, NextResponse } from "next/server";
import {
  customerPortalError,
  loadCustomerPortalFile,
  requireCustomerPortalUser
} from "@/lib/customer-portal-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireCustomerPortalUser(request);
  if (user instanceof NextResponse) return user;
  const fileId = request.nextUrl.searchParams.get("id")?.trim();
  if (!fileId) return customerPortalError("A file ID is required.");
  try {
    const file = await loadCustomerPortalFile({ user, fileId });
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    const responseBytes = Uint8Array.from(file.bytes);
    return new NextResponse(responseBytes, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${disposition}; filename="${file.filename.replace(/["\r\n]/g, "")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to open this file.",
      404
    );
  }
}
