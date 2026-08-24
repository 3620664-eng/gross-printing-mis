import { NextRequest, NextResponse } from "next/server";
import {
  customerPortalError,
  inviteCustomerPortalUser,
  loadCustomerPortalAdminData,
  requireCustomerPortalStaff,
  sendCustomerPortalAccessEmail,
  updateCustomerPortalAccount,
  updateCustomerPortalRequest
} from "@/lib/customer-portal-server";
import type { CustomerPortalRequestStatus } from "@/lib/customer-portal-types";
import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCustomerPortalStaff(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const customerId = request.nextUrl.searchParams.get("customerId")?.trim() || undefined;
    return NextResponse.json(await loadCustomerPortalAdminData(customerId));
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to load Customer Portal administration.",
      500
    );
  }
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 512 * 1024);
  if (oversized) return oversized;
  const auth = await requireCustomerPortalStaff(request, true);
  if (auth instanceof NextResponse) return auth;
  let body: { action?: "invite" | "send_access_email"; customerId?: string; email?: string; displayName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerPortalError("Invalid Customer Portal administration request.");
  }
  if (body.action !== "invite" && body.action !== "send_access_email") {
    return customerPortalError("Choose a valid administration action.");
  }
  try {
    if (body.action === "send_access_email") {
      return NextResponse.json(
        await sendCustomerPortalAccessEmail({
          email: body.email?.trim() ?? "",
          origin: request.nextUrl.origin
        })
      );
    }
    if (!body.customerId?.trim()) return customerPortalError("A customer is required.");
    const result = await inviteCustomerPortalUser({
      customerId: body.customerId.trim(),
      email: body.email?.trim() ?? "",
      displayName: body.displayName?.trim() ?? "",
      invitedBy: auth.id,
      origin: request.nextUrl.origin
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to invite this customer.",
      500
    );
  }
}

export async function PATCH(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 512 * 1024);
  if (oversized) return oversized;
  const auth = await requireCustomerPortalStaff(request);
  if (auth instanceof NextResponse) return auth;
  let body: {
    action?: "account" | "request" | "notification" | "conversion";
    userId?: string;
    isActive?: boolean;
    requestId?: string;
    status?: CustomerPortalRequestStatus;
    metadata?: Record<string, unknown>;
    notificationReadAt?: string | null;
    notificationReadBy?: string | null;
    jobId?: string;
    quoteId?: string;
    convertedAt?: string;
    convertedBy?: string;
    convertedRecordNumber?: string;
    conversionKind?: "quote" | "job" | "existing_job";
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerPortalError("Invalid Customer Portal update.");
  }
  try {
    if (body.action === "account") {
      if (auth.role !== "admin") return customerPortalError("Administrator access is required.", 403);
      if (!body.userId || typeof body.isActive !== "boolean") return customerPortalError("Portal account details are incomplete.");
      return NextResponse.json(await updateCustomerPortalAccount({ userId: body.userId, isActive: body.isActive }));
    }
    if (body.action === "request") {
      if (!body.requestId) return customerPortalError("Portal request details are incomplete.");
      return NextResponse.json(await updateCustomerPortalRequest({
        requestId: body.requestId,
        status: body.status,
        metadata: body.metadata
      }));
    }
    if (body.action === "notification") {
      if (!body.requestId) return customerPortalError("Portal notification details are incomplete.");
      return NextResponse.json(await updateCustomerPortalRequest({
        requestId: body.requestId,
        notificationReadAt: body.notificationReadAt,
        notificationReadBy: body.notificationReadAt ? auth.id : null
      }));
    }
    if (body.action === "conversion") {
      if (!body.requestId || !body.status || !body.convertedRecordNumber || !body.conversionKind) {
        return customerPortalError("Portal conversion details are incomplete.");
      }
      return NextResponse.json(await updateCustomerPortalRequest({
        requestId: body.requestId,
        status: body.status,
        jobId: body.jobId,
        quoteId: body.quoteId,
        convertedAt: new Date().toISOString(),
        convertedBy: auth.id,
        convertedRecordNumber: body.convertedRecordNumber,
        conversionKind: body.conversionKind,
        notificationReadAt: body.notificationReadAt,
        notificationReadBy: body.notificationReadAt ? auth.id : null
      }));
    }
    return customerPortalError("Choose a valid Customer Portal update.");
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to update Customer Portal data.",
      500
    );
  }
}
