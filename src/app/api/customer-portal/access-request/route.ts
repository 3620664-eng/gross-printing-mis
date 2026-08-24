import { NextRequest, NextResponse } from "next/server";
import {
  customerPortalError,
  requireCustomerPortalStaff
} from "@/lib/customer-portal-server";
import { privilegedSupabaseHeaders, rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";
import type {
  CustomerPortalAccessRequest,
  CustomerPortalAccessRequestStatus
} from "@/lib/customer-portal-types";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_MODE = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const demoRequests: CustomerPortalAccessRequest[] = [];

type AccessRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  existing_customer?: string;
  note?: string;
  status: CustomerPortalAccessRequestStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
};

function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function serviceHeaders(extra: Record<string, string> = {}) {
  return privilegedSupabaseHeaders(SUPABASE_SECRET_KEY!, extra);
}

function toRequest(row: AccessRow): CustomerPortalAccessRequest {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    existingCustomer: row.existing_customer,
    note: row.note,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  let body: {
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    existingCustomer?: string;
    note?: string;
    website?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerPortalError("Invalid account request.");
  }

  if (clean(body.website)) {
    return NextResponse.json({ message: "Your request was received." }, { status: 201 });
  }

  const companyName = clean(body.companyName, 160);
  const contactName = clean(body.contactName, 160);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 80);
  const existingCustomer = clean(body.existingCustomer, 200);
  const note = clean(body.note, 2000);

  if (!companyName || !contactName || !/^\S+@\S+\.\S+$/.test(email)) {
    return customerPortalError("Enter the business name, contact name, and a valid email address.");
  }

  const now = new Date().toISOString();
  if (DEMO_MODE) {
    const duplicate = demoRequests.find(
      (item) => item.email === email && Date.now() - new Date(item.createdAt).getTime() < 15 * 60_000
    );
    if (!duplicate) {
      demoRequests.unshift({
        id: crypto.randomUUID(),
        companyName,
        contactName,
        email,
        phone: phone || undefined,
        existingCustomer: existingCustomer || undefined,
        note: note || undefined,
        status: "Pending",
        createdAt: now,
        updatedAt: now
      });
    }
    return NextResponse.json({ message: "Your request was received." }, { status: 201 });
  }

  if (!configured()) return customerPortalError("Customer Portal access requests are not configured.", 503);

  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const duplicateResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/customer_portal_access_requests?email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`,
    { headers: serviceHeaders(), cache: "no-store" }
  );
  if (duplicateResponse.ok) {
    const duplicates = (await duplicateResponse.json()) as Array<{ id: string }>;
    if (duplicates.length) {
      return NextResponse.json({ message: "Your request was received." }, { status: 201 });
    }
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/customer_portal_access_requests`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      company_name: companyName,
      contact_name: contactName,
      email,
      phone: phone || null,
      existing_customer: existingCustomer || null,
      note: note || null,
      status: "Pending"
    }),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    return customerPortalError(payload.message || "Unable to save the account request.", 500);
  }
  return NextResponse.json({ message: "Your request was received." }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const auth = await requireCustomerPortalStaff(request);
  if (auth instanceof NextResponse) return auth;
  if (DEMO_MODE) return NextResponse.json({ requests: demoRequests });
  if (!configured()) return customerPortalError("Customer Portal access requests are not configured.", 503);
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/customer_portal_access_requests?select=id,company_name,contact_name,email,phone,existing_customer,note,status,reviewed_by,reviewed_at,created_at,updated_at&order=created_at.desc&limit=200`,
    { headers: serviceHeaders(), cache: "no-store" }
  );
  if (!response.ok) return customerPortalError("Unable to load account requests.", 500);
  const rows = (await response.json()) as AccessRow[];
  return NextResponse.json({ requests: rows.map(toRequest) });
}

export async function PATCH(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  const auth = await requireCustomerPortalStaff(request, true);
  if (auth instanceof NextResponse) return auth;
  let body: { id?: string; status?: CustomerPortalAccessRequestStatus };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerPortalError("Invalid access request update.");
  }
  const id = clean(body.id, 80);
  const status = body.status;
  if (!id || !status || !["Pending", "Reviewed", "Invited", "Declined", "Archived"].includes(status)) {
    return customerPortalError("Choose a valid access request and status.");
  }
  const reviewedAt = new Date().toISOString();
  if (DEMO_MODE) {
    const item = demoRequests.find((requestItem) => requestItem.id === id);
    if (!item) return customerPortalError("Access request not found.", 404);
    item.status = status;
    item.reviewedAt = reviewedAt;
    item.reviewedBy = auth.id;
    item.updatedAt = reviewedAt;
    return NextResponse.json({ request: item });
  }
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/customer_portal_access_requests?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: serviceHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({
        status,
        reviewed_by: auth.id,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt
      }),
      cache: "no-store"
    }
  );
  if (!response.ok) return customerPortalError("Unable to update the access request.", 500);
  const row = ((await response.json()) as AccessRow[])[0];
  return NextResponse.json({ request: row ? toRequest(row) : undefined });
}
