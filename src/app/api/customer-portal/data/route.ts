import { NextRequest, NextResponse } from "next/server";
import {
  buildCustomerPortalData,
  customerPortalError,
  requireCustomerPortalUser
} from "@/lib/customer-portal-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireCustomerPortalUser(request);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(await buildCustomerPortalData(user));
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to load the Customer Portal.",
      500
    );
  }
}
