import { NextRequest, NextResponse } from "next/server";
import {
  buildCustomerPortalPreviewData,
  customerPortalError,
  requireCustomerPortalStaff
} from "@/lib/customer-portal-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const staff = await requireCustomerPortalStaff(request, true);
  if (staff instanceof NextResponse) return staff;

  const customerId = request.nextUrl.searchParams.get("customerId")?.trim();
  if (!customerId) return customerPortalError("Choose a customer to preview.");

  try {
    return NextResponse.json(
      await buildCustomerPortalPreviewData({
        customerId,
        displayName: staff.email
      })
    );
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to preview this customer portal.",
      500
    );
  }
}
