import { NextRequest, NextResponse } from "next/server";
import {
  createCustomerPortalRequest,
  customerPortalError,
  requireCustomerPortalUser
} from "@/lib/customer-portal-server";
import type { CustomerPortalRequestType } from "@/lib/customer-portal-types";
import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const allowedTypes = new Set<CustomerPortalRequestType>([
  "quote_approval",
  "proof_approval",
  "proof_changes",
  "reorder",
  "new_order",
  "message"
]);

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 128 * 1024);
  if (oversized) return oversized;
  const user = await requireCustomerPortalUser(request);
  if (user instanceof NextResponse) return user;
  let body: {
    type?: CustomerPortalRequestType;
    title?: string;
    note?: string;
    jobId?: string;
    quoteId?: string;
    invoiceId?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerPortalError("Invalid Customer Portal request.");
  }
  if (!body.type || !allowedTypes.has(body.type)) {
    return customerPortalError("Choose a valid Customer Portal action.");
  }
  const title = body.title?.trim() ?? "";
  if (!title) return customerPortalError("A request title is required.");
  if ((body.note?.length ?? 0) > 8000) return customerPortalError("The message is too long.");

  try {
    const portalRequest = await createCustomerPortalRequest({
      user,
      type: body.type,
      title,
      note: body.note,
      jobId: body.jobId,
      quoteId: body.quoteId,
      invoiceId: body.invoiceId,
      metadata: body.metadata
    });
    return NextResponse.json({
      message:
        body.type === "quote_approval"
          ? "Quote approval submitted to Gross Printing."
          : body.type === "proof_approval"
            ? "Proof approval submitted to Gross Printing."
            : body.type === "proof_changes"
              ? "Your proof changes were submitted."
              : body.type === "reorder"
                ? "Your reorder request was submitted."
                : body.type === "new_order"
                  ? "Your new order request was submitted."
                  : "Your message was submitted.",
      request: portalRequest
    }, { status: 201 });
  } catch (error) {
    return customerPortalError(
      error instanceof Error ? error.message : "Unable to save this portal request.",
      500
    );
  }
}
