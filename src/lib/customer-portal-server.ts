import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  customers as demoCustomers,
  emailLogs as demoEmailLogs,
  emailThreads as demoEmailThreads,
  invoices as demoInvoices,
  jobs as demoJobs,
  quotes as demoQuotes,
  statusEvents as demoStatusEvents,
  uploadedFiles as demoUploadedFiles
} from "./demo-data";
import { loadGmailAttachment, requireActiveAppUser } from "./gmail-server";
import { evaluateEmailSafety, loadEmailSafetySettings } from "./email-safety-server";
import { privilegedSupabaseHeaders } from "./server-auth";
import type {
  Customer,
  EmailIntakeTicket,
  EmailLog,
  EmailThread,
  Invoice,
  Job,
  JobStatusEvent,
  PrintOrder,
  Quote,
  UploadedFile
} from "./types";
import type {
  CustomerPortalAdminAccount,
  CustomerPortalData,
  CustomerPortalFile,
  CustomerPortalMessageThread,
  CustomerPortalOrderStatus,
  CustomerPortalRequest,
  CustomerPortalRequestStatus,
  CustomerPortalRequestType
} from "./customer-portal-types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const DEMO_MODE = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const PORTAL_BUCKET = "customer-portal-files";
export const CUSTOMER_PORTAL_ACCESS_COOKIE = "gp_portal_access";
export const CUSTOMER_PORTAL_REFRESH_COOKIE = "gp_portal_refresh";

export type VerifiedCustomerPortalUser = {
  id: string;
  email: string;
  customerId: string;
  displayName: string;
};

type PortalAccountRow = {
  user_id: string;
  customer_id: string;
  email?: string;
  display_name?: string;
  is_active?: boolean;
  invited_at?: string;
  last_sign_in_at?: string;
};

type PortalRequestRow = {
  id: string;
  request_number?: string;
  customer_id: string;
  user_id?: string;
  request_type: CustomerPortalRequestType;
  status: CustomerPortalRequestStatus;
  job_id?: string;
  quote_id?: string;
  invoice_id?: string;
  title: string;
  note?: string;
  file_name?: string;
  storage_path?: string;
  metadata?: Record<string, unknown>;
  notification_read_at?: string;
  notification_read_by?: string;
  converted_at?: string;
  converted_by?: string;
  converted_record_number?: string;
  conversion_kind?: "quote" | "job" | "existing_job";
  created_at: string;
  updated_at: string;
};

const demoPortalRequests: CustomerPortalRequest[] = [
  {
    id: "demo-portal-request-1",
    requestNumber: "PR-1001",
    customerId: "cust-camp",
    userId: "demo-customer-user",
    type: "new_order",
    status: "New",
    title: "5,000 summer postcards",
    note: "Please quote 5,000 double-sided postcards for our summer program. Artwork attached.",
    fileName: "camp-postcard-final.pdf",
    storagePath: "demo/camp-postcard-final.pdf",
    metadata: {
      requestPurpose: "quote",
      productType: "Posters",
      quantity: 5000,
      finishedWidth: 6,
      finishedHeight: 4,
      sides: 2,
      colorSpec: "4/4 full color",
      paperPreference: "Gloss cover",
      dueDate: "2026-08-12",
      mimeType: "application/pdf",
      size: 1843200,
      demo: true
    },
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString()
  },
  {
    id: "demo-portal-request-2",
    requestNumber: "PR-1002",
    customerId: "cust-camp",
    userId: "demo-customer-user",
    type: "proof_changes",
    status: "Missing Information",
    jobId: "job-1048",
    title: "Changes requested for postcard proof",
    note: "Please move the date slightly lower and replace the phone number.",
    metadata: {
      requestPurpose: "change",
      productType: "Other",
      aiMissingInformation: ["Please confirm the replacement phone number."]
    },
    createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString()
  }
];

type MisState = {
  customers?: Customer[];
  orders?: PrintOrder[];
  jobs?: Job[];
  quotes?: Quote[];
  invoices?: Invoice[];
  uploadedFiles?: UploadedFile[];
  emailThreads?: EmailThread[];
  emailIntakeTickets?: EmailIntakeTicket[];
  emailLogs?: EmailLog[];
  statusEvents?: JobStatusEvent[];
};

export function customerPortalConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SERVICE_KEY);
}

export function customerPortalError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function serviceHeaders(extra?: Record<string, string>) {
  return privilegedSupabaseHeaders(SUPABASE_SERVICE_KEY!, extra ?? {});
}

async function serviceFetch(path: string, init?: RequestInit) {
  const headers = new Headers(serviceHeaders());
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as {
      message?: string;
      msg?: string;
      error?: string;
      error_description?: string;
    };
    return payload.message ?? payload.msg ?? payload.error_description ?? payload.error ?? fallback;
  } catch {
    return fallback;
  }
}


function sameEmail(left?: string, right?: string) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function customerHasVerifiedEmail(customer: Customer, email: string) {
  if (sameEmail(customer.email, email)) return true;
  return (customer.contacts ?? []).some((contact) => sameEmail(contact.email, email));
}

async function appendSelfRegisteredCustomer(customer: Customer, actorUserId: string, sortOrder: number) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const workspaceResponse = await serviceFetch(
      "/rest/v1/mis_workspaces?id=eq.gross-printing&select=revision&limit=1"
    );
    if (!workspaceResponse.ok) throw new Error("Unable to open the Gross Printing customer workspace.");
    const workspace = ((await workspaceResponse.json()) as Array<{ revision?: number }>)[0];
    const revision = Number(workspace?.revision ?? -1);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("The Gross Printing customer workspace is not ready.");

    const response = await serviceFetch("/rest/v1/rpc/save_mis_records", {
      method: "POST",
      body: JSON.stringify({
        p_workspace_id: "gross-printing",
        p_expected_revision: revision,
        p_actor_user_id: actorUserId,
        p_rows: [{
          collection: "customers",
          record_id: customer.id,
          record_value: customer,
          sort_order: sortOrder
        }],
        p_collections: ["customers"],
        p_soft_delete_missing: false
      })
    });
    if (!response.ok) throw new Error("Unable to create the customer record securely.");
    const claimed = await response.json().catch(() => null) as number | null;
    if (Number.isSafeInteger(claimed)) return;
  }
  throw new Error("Another update happened at the same time. Please try opening the account again.");
}

async function provisionSelfRegisteredPortalAccount(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<PortalAccountRow | undefined> {
  const metadata = user.user_metadata ?? {};
  if (String(metadata.customer_portal_self_signup ?? "").toLowerCase() !== "true") return undefined;

  const email = String(user.email ?? "").trim().toLowerCase();
  const companyName = String(metadata.company_name ?? "").trim().slice(0, 160);
  const contactName = String(metadata.contact_name ?? metadata.display_name ?? "").trim().slice(0, 160);
  const phone = String(metadata.phone ?? "").trim().slice(0, 80);
  const requestedCustomerId = String(metadata.customer_id ?? "").trim();
  if (!email || !companyName || !contactName) return undefined;

  const emailAccountResponse = await serviceFetch(
    `/rest/v1/customer_portal_accounts?email=ilike.${encodeURIComponent(email)}&select=user_id,customer_id,email,display_name,is_active,invited_at,last_sign_in_at&limit=1`
  );
  if (emailAccountResponse.ok) {
    const emailAccount = ((await emailAccountResponse.json()) as PortalAccountRow[])[0];
    if (emailAccount?.user_id && emailAccount.user_id !== user.id) {
      throw new Error("This verified email is already connected to another Customer Portal login.");
    }
    if (emailAccount?.user_id === user.id && emailAccount.customer_id) return emailAccount;
  }

  const customersResponse = await serviceFetch(
    "/rest/v1/mis_records?workspace_id=eq.gross-printing&deleted_at=is.null&collection=eq.customers&select=record,sort_order&order=sort_order.asc"
  );
  if (!customersResponse.ok) throw new Error("Unable to check the Gross Printing customer directory.");
  const customerRows = (await customersResponse.json()) as Array<{ record?: Customer; sort_order?: number }>;
  const customers = customerRows.map((row) => row.record).filter((customer): customer is Customer => Boolean(customer?.id));

  // A confirmed email may safely attach to an existing customer only on an exact saved email match.
  // Company-name/domain similarity alone is never enough to claim an existing account.
  let customer = customers.find((candidate) => customerHasVerifiedEmail(candidate, email));
  if (!customer) {
    const id = /^cust-[A-Za-z0-9-]{8,}$/.test(requestedCustomerId)
      ? requestedCustomerId
      : `cust-${crypto.randomUUID()}`;
    customer = {
      id,
      name: companyName,
      contact: contactName,
      email,
      phone,
      companyType: "Customer",
      terms: "Due on receipt",
      lastOrder: "",
      totalSpend: 0,
      openBalance: 0,
      importedFrom: "Customer Portal self-registration",
      contacts: [{
        id: `contact-${crypto.randomUUID()}`,
        name: contactName,
        email,
        phone: phone || undefined,
        isPrimary: true
      }],
      portalPricingEnabled: false,
      pricingTier: "standard",
      pricingAdjustmentPercent: 0,
      portalInstantOrderEnabled: false,
      portalQuoteApprovalRequired: true
    };
    await appendSelfRegisteredCustomer(customer, user.id, customers.length);
  }

  const now = new Date().toISOString();
  const accountResponse = await serviceFetch("/rest/v1/customer_portal_accounts?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: user.id,
      customer_id: customer.id,
      email,
      display_name: contactName,
      is_active: true,
      invited_by: null,
      invited_at: now,
      updated_at: now
    })
  });
  if (!accountResponse.ok) throw new Error("Unable to activate the new Customer Portal account.");
  return ((await accountResponse.json()) as PortalAccountRow[])[0];
}

export async function requireCustomerPortalUser(
  request: NextRequest
): Promise<VerifiedCustomerPortalUser | NextResponse> {
  if (DEMO_MODE) {
    return {
      id: "demo-customer-user",
      email: "yossi@campahava.example",
      customerId: "cust-camp",
      displayName: "Yossi Adler"
    };
  }
  if (!customerPortalConfigured()) {
    return customerPortalError("Customer Portal is not configured on the server.", 503);
  }
  const authorization = request.headers.get("authorization");
  const cookieToken = request.cookies.get(CUSTOMER_PORTAL_ACCESS_COOKIE)?.value;
  const bearer = authorization?.startsWith("Bearer ") ? authorization : cookieToken ? `Bearer ${cookieToken}` : undefined;
  if (!bearer) {
    return customerPortalError("Sign in to open the Customer Portal.", 401);
  }

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY!,
      Authorization: bearer
    },
    cache: "no-store"
  });
  if (!userResponse.ok) {
    return customerPortalError("Your Customer Portal session is no longer valid.", 401);
  }
  const user = (await userResponse.json()) as {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown> & { display_name?: string; full_name?: string; name?: string };
  };
  if (!user.id) return customerPortalError("Unable to verify this portal account.", 401);

  const accountResponse = await serviceFetch(
    `/rest/v1/customer_portal_accounts?user_id=eq.${encodeURIComponent(
      user.id
    )}&select=user_id,customer_id,email,display_name,is_active,invited_at,last_sign_in_at&limit=1`
  );
  if (!accountResponse.ok) {
    return customerPortalError("Unable to verify Customer Portal access.", 500);
  }
  let account: PortalAccountRow | undefined = ((await accountResponse.json()) as PortalAccountRow[])[0];
  if ((!account?.is_active || !account.customer_id) && user.id) {
    try {
      account = await provisionSelfRegisteredPortalAccount({ id: user.id, email: user.email, user_metadata: user.user_metadata });
    } catch (error) {
      return customerPortalError(error instanceof Error ? error.message : "Unable to activate this Customer Portal account.", 500);
    }
  }
  if (!account?.is_active || !account.customer_id) {
    return customerPortalError("This Customer Portal account is not active.", 403);
  }

  const now = new Date().toISOString();
  await serviceFetch(
    `/rest/v1/customer_portal_accounts?user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_sign_in_at: now })
    }
  ).catch(() => undefined);

  return {
    id: user.id,
    email: account.email ?? user.email ?? "",
    customerId: account.customer_id,
    displayName:
      account.display_name ??
      user.user_metadata?.display_name ??
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")[0] ??
      "Customer"
  };
}

export async function requireCustomerPortalStaff(request: NextRequest, adminOnly = false) {
  if (DEMO_MODE) {
    return { id: "demo-owner", email: "jobs@grossprinting.com", role: "admin" as const };
  }
  return requireActiveAppUser(request, adminOnly ? ["admin"] : ["admin", "front_desk"]);
}

async function loadMisState(): Promise<MisState> {
  if (DEMO_MODE) {
    return {
      customers: demoCustomers,
      jobs: demoJobs,
      quotes: demoQuotes,
      invoices: demoInvoices,
      uploadedFiles: demoUploadedFiles,
      emailThreads: demoEmailThreads,
      emailIntakeTickets: [],
      emailLogs: demoEmailLogs,
      statusEvents: demoStatusEvents
    };
  }
  const response = await serviceFetch(
    "/rest/v1/mis_records?workspace_id=eq.gross-printing&deleted_at=is.null&collection=in.(customers,jobs,quotes,invoices,uploadedFiles,emailThreads,emailIntakeTickets,emailLogs,statusEvents,orders)&select=collection,record,sort_order&order=collection.asc,sort_order.asc"
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to read protected MIS data. Run the v0.6.7 security migration."));
  const rows = (await response.json()) as Array<{ collection?: keyof MisState; record?: unknown }>;
  const state: MisState = {};
  for (const row of rows) {
    const collection = row.collection;
    if (!collection) continue;
    const current = (state[collection] ?? []) as unknown[];
    current.push(row.record);
    (state as Record<string, unknown[]>)[collection] = current;
  }
  return state;
}

function portalStatus(job: Job, quote?: Quote, intakeTicket?: EmailIntakeTicket): CustomerPortalOrderStatus {
  if (intakeTicket?.status === "Waiting for Customer") return "Waiting for information";
  if (job.status === "Cancelled") return "Cancelled";
  if (job.status === "Delivered") return "Completed";
  if (job.status === "Ready") return "Ready for pickup";
  if (job.status === "Prepress" || job.status === "Printing" || job.status === "Finishing") return "In production";
  if (job.status === "Approved") return "Request received";
  if (job.status === "Quote") {
    if (quote?.status === "Sent") return "Awaiting approval";
    if (quote?.status === "Approved") return "Request received";
    return "Quote ready";
  }
  return "Request received";
}

function inferPortalProductType(title: string): import("./customer-portal-types").CustomerPortalProductType {
  const value = title.toLowerCase();
  if (value.includes("business card")) return "Business Cards";
  if (value.includes("flyer") || value.includes("brochure")) return "Flyers / Brochures";
  if (value.includes("booklet") || value.includes("book") || value.includes("journal")) return "Booklets";
  if (value.includes("invitation")) return "Invitations";
  if (value.includes("label") || value.includes("sticker")) return "Labels / Stickers";
  if (value.includes("envelope")) return "Envelopes";
  if (value.includes("poster")) return "Posters";
  if (value.includes("banner") || value.includes("sign") || value.includes("vinyl")) return "Signs / Banners";
  if (value.includes("blueprint") || value.includes("plan")) return "Plans / Blueprints";
  if (value.includes("tea party")) return "Tea Party Cards";
  if (value.includes("receipt book")) return "Receipt Books";
  if (value.includes("stamp")) return "Stamps";
  if (value.includes("simcha bag")) return "Simcha Bags";
  if (value.includes("copy") || value.includes("copies")) return "Copies";
  return "Other";
}

function statusDetail(status: CustomerPortalOrderStatus) {
  const details: Record<CustomerPortalOrderStatus, string> = {
    "Request received": "Gross Printing received the order and is preparing the next production step.",
    "Waiting for information": "Gross Printing needs information before the order can continue.",
    "Quote ready": "A quote is being prepared or is ready for review.",
    "Awaiting approval": "Please review and approve the quote before production begins.",
    "Artwork review": "Artwork and production setup are being checked.",
    "In production": "The order is active in production. Gross Printing will notify you when it is ready.",
    "Ready for pickup": "The order is complete and ready for pickup.",
    Completed: "The order has been completed.",
    Cancelled: "This order was cancelled."
  };
  return details[status];
}

function requestRowToPortal(row: PortalRequestRow): CustomerPortalRequest {
  return {
    id: row.id,
    requestNumber: row.request_number,
    customerId: row.customer_id,
    userId: row.user_id,
    type: row.request_type,
    status: row.status,
    jobId: row.job_id,
    quoteId: row.quote_id,
    invoiceId: row.invoice_id,
    title: row.title,
    note: row.note ?? "",
    fileName: row.file_name,
    storagePath: row.storage_path,
    metadata: row.metadata,
    notificationReadAt: row.notification_read_at,
    notificationReadBy: row.notification_read_by,
    convertedAt: row.converted_at,
    convertedBy: row.converted_by,
    convertedRecordNumber: row.converted_record_number,
    conversionKind: row.conversion_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadPortalRequests(customerId: string): Promise<CustomerPortalRequest[]> {
  if (DEMO_MODE) {
    return demoPortalRequests
      .filter((request) => request.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  const response = await serviceFetch(
    `/rest/v1/customer_portal_requests?customer_id=eq.${encodeURIComponent(
      customerId
    )}&select=id,request_number,customer_id,user_id,request_type,status,job_id,quote_id,invoice_id,title,note,file_name,storage_path,metadata,notification_read_at,notification_read_by,converted_at,converted_by,converted_record_number,conversion_kind,created_at,updated_at&order=created_at.desc&limit=200`
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to read portal requests."));
  return ((await response.json()) as PortalRequestRow[]).map(requestRowToPortal);
}

function visiblePortalFiles(
  files: UploadedFile[],
  customerId: string,
  requests: CustomerPortalRequest[]
): CustomerPortalFile[] {
  const fromMis = files
    .filter(
      (file) =>
        file.customerId === customerId &&
        !file.deletedAt &&
        file.status !== "Archived" &&
        (file.portalVisible === true || file.folder === "Proofs" || file.folder === "Invoices")
    )
    .map<CustomerPortalFile>((file) => ({
      id: file.id,
      name: file.name,
      folder: file.folder,
      jobId: file.jobId,
      jobNumber: file.jobNumber,
      size: file.size,
      type: file.type,
      uploadedAt: file.uploadedAt,
      status: file.status,
      canApproveProof: file.folder === "Proofs",
      preview: DEMO_MODE ? file.preview : undefined
    }));

  const fromPortal = requests
    .filter((request) => request.storagePath && request.fileName)
    .map<CustomerPortalFile>((request) => ({
      id: `portal-request:${request.id}`,
      name: request.fileName!,
      folder: request.type === "new_order" ? "New order upload" : "Customer upload",
      jobId: request.jobId,
      size: Number(request.metadata?.size ?? 0),
      type: String(request.metadata?.mimeType ?? "application/octet-stream"),
      uploadedAt: request.createdAt,
      status: request.status,
      canApproveProof: false
    }));

  return [...fromMis, ...fromPortal].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

function customerFacingThreads(
  threads: EmailThread[],
  customer: Customer,
  customerJobIds: Set<string>
): CustomerPortalMessageThread[] {
  const customerEmail = customer.email.trim().toLowerCase();
  return threads
    .filter((thread) => {
      if (thread.customerId === customer.id) return true;
      if (thread.jobId && customerJobIds.has(thread.jobId)) return true;
      return Boolean(customerEmail) && thread.participantEmails.some((value) => value.toLowerCase().includes(customerEmail));
    })
    .map((thread) => {
      const messages = thread.messages
        .filter((message) => {
          const from = message.from.toLowerCase();
          const recipients = [...message.to, ...(message.cc ?? [])].join(" ").toLowerCase();
          return Boolean(customerEmail) && (from.includes(customerEmail) || recipients.includes(customerEmail));
        })
        .map((message) => ({
          id: message.id,
          direction: message.direction === "inbound" ? ("customer" as const) : ("gross_printing" as const),
          subject: message.subject,
          body: message.bodyText,
          sentAt: message.sentAt,
          attachmentNames: message.attachments.map((attachment) => attachment.filename)
        }));
      return {
        id: thread.id,
        subject: thread.subject,
        jobId: thread.jobId,
        lastMessageAt: thread.lastMessageAt,
        messages
      };
    })
    .filter((thread) => thread.messages.length)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
}

function customerPortalNotifications(input: {
  customerJobs: Job[];
  statusEvents: JobStatusEvent[];
  emailLogs: EmailLog[];
}) {
  const jobMap = new Map(input.customerJobs.map((job) => [job.id, job]));
  const significantEvents: JobStatusEvent[] = [];
  for (const job of input.customerJobs) {
    const events = input.statusEvents
      .filter((event) => event.jobId === job.id)
      .sort((a, b) => new Date(a.movedAt).getTime() - new Date(b.movedAt).getTime());
    const approved = events.find((event) => event.toStatus === "Approved");
    const production = events.find((event) => ["Prepress", "Printing", "Finishing"].includes(event.toStatus));
    const ready = events.find((event) => event.toStatus === "Ready");
    const delivered = events.find((event) => event.toStatus === "Delivered");
    for (const event of [approved, production, ready, delivered]) {
      if (event) significantEvents.push(event);
    }
  }

  const portalUpdates = significantEvents.map((event) => {
    const job = jobMap.get(event.jobId)!;
    const status: CustomerPortalOrderStatus =
      event.toStatus === "Ready"
        ? "Ready for pickup"
        : event.toStatus === "Delivered"
          ? "Completed"
          : event.toStatus === "Approved"
            ? "Request received"
            : "In production";
    const message =
      status === "Ready for pickup"
        ? `${job.jobNumber} is ready for pickup.`
        : status === "Completed"
          ? `${job.jobNumber} has been completed.`
          : status === "In production"
            ? `${job.jobNumber} is now in production.`
            : `${job.jobNumber} has been confirmed.`;
    return {
      id: `status-${event.id}`,
      jobId: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      message,
      status,
      createdAt: event.movedAt,
      channel: "portal" as const
    };
  });

  const emailUpdates = input.emailLogs
    .filter((log) => Boolean(log.jobId && jobMap.has(log.jobId)))
    .filter((log) => ["job_received", "job_in_production", "ready_pickup", "job_completed", "invoice"].includes(log.templateId ?? ""))
    .map((log) => {
      const job = log.jobId ? jobMap.get(log.jobId) : undefined;
      return {
        id: `email-${log.id}`,
        jobId: job?.id,
        jobNumber: job?.jobNumber,
        title: log.subject,
        message: log.status === "Failed" ? "Gross Printing attempted to send this update by email." : "This update was also sent by email.",
        createdAt: log.createdAt,
        channel: "email" as const
      };
    });

  return [...portalUpdates, ...emailUpdates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function buildCustomerPortalData(
  user: VerifiedCustomerPortalUser
): Promise<CustomerPortalData> {
  const [state, requests] = await Promise.all([loadMisState(), loadPortalRequests(user.customerId)]);
  const customers = state.customers ?? [];
  const ordersState = state.orders ?? [];
  const jobs = state.jobs ?? [];
  const quotes = state.quotes ?? [];
  const invoices = state.invoices ?? [];
  const files = state.uploadedFiles ?? [];
  const threads = state.emailThreads ?? [];
  const intakeTickets = state.emailIntakeTickets ?? [];
  const statusEvents = state.statusEvents ?? [];
  const emailLogs = state.emailLogs ?? [];
  const customer = customers.find((item) => item.id === user.customerId);
  if (!customer) throw new Error("The linked customer record was not found in the MIS.");

  const customerJobs = jobs
    .filter((job) => job.customerId === customer.id && !job.deletedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const customerQuotes = quotes.filter((quote) => quote.customerId === customer.id && !quote.deletedAt);
  const customerInvoices = invoices.filter((invoice) => invoice.customerId === customer.id && !invoice.deletedAt);
  const quoteMap = new Map(customerQuotes.map((quote) => [quote.id, quote]));
  const invoiceMap = new Map(customerInvoices.map((invoice) => [invoice.id, invoice]));
  const parentOrderMap = new Map(ordersState.filter((order) => order.customerId === customer.id).map((order) => [order.id, order]));

  const orders = customerJobs.map((job) => {
    const quote = job.quoteId ? quoteMap.get(job.quoteId) : undefined;
    const linkedInvoice = job.invoiceId ? invoiceMap.get(job.invoiceId) : undefined;
    const invoice = linkedInvoice?.status === "Draft" ? undefined : linkedInvoice;
    const intakeTicket = job.intakeTicketId ? intakeTickets.find((ticket) => ticket.id === job.intakeTicketId) : undefined;
    const status = portalStatus(job, quote, intakeTicket);
    return {
      id: job.id,
      jobNumber: job.jobNumber,
      parentOrderId: job.orderId,
      parentOrderNumber: job.orderId ? parentOrderMap.get(job.orderId)?.orderNumber : undefined,
      parentOrderTitle: job.orderId ? parentOrderMap.get(job.orderId)?.title : undefined,
      parentOrderStatus: job.orderId ? parentOrderMap.get(job.orderId)?.status : undefined,
      orderItemPosition: job.orderId ? Math.max(0, parentOrderMap.get(job.orderId)?.jobIds.indexOf(job.id) ?? -1) + 1 : undefined,
      orderItemCount: job.orderId ? parentOrderMap.get(job.orderId)?.jobIds.length : undefined,
      title: job.title,
      status,
      statusDetail: statusDetail(status),
      quantity: job.quantity,
      finishedSize: `${job.pieceWidth} × ${job.pieceHeight}`,
      colorSpec: job.colorSpec,
      sides: job.sides,
      finishing: job.bindery,
      stockName: job.stockName,
      artworkName: job.artworkName,
      productType: inferPortalProductType(job.title),
      dueDate: job.dueDate,
      dueTime: job.dueTime,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      quoteId: quote?.id,
      quoteNumber: quote?.quoteNumber,
      quoteAmount: quote?.amount,
      quoteStatus: quote?.status,
      invoiceId: invoice?.id,
      invoiceNumber: invoice?.invoiceNumber,
      invoiceAmount: invoice?.amount,
      invoiceStatus: invoice?.status,
      canReorder: job.status === "Delivered" || job.status === "Ready"
    };
  });

  const portalQuotes = customerQuotes
    .filter((quote) => !quote.archived)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((quote) => ({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      jobId: quote.jobId,
      title: quote.title,
      amount: quote.amount,
      status: quote.status,
      createdAt: quote.createdAt,
      sentAt: quote.sentAt,
      lineItems: quote.lineItems,
      canApprove: quote.status === "Sent"
    }));

  const portalInvoices = customerInvoices
    .filter((invoice) => !invoice.archived && invoice.status !== "Draft")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      jobId: invoice.jobId,
      title: invoice.title,
      amount: invoice.amount,
      status: invoice.status,
      lineItems: invoice.lineItems,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt
    }));

  const portalFiles = visiblePortalFiles(files, customer.id, requests);
  const messages = customerFacingThreads(
    threads,
    customer,
    new Set(customerJobs.map((job) => job.id))
  );
  const openBalance = customer.openBalance ?? portalInvoices
    .filter((invoice) => invoice.status !== "Paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  return {
    demo: DEMO_MODE,
    profile: {
      customerId: customer.id,
      customerName: customer.name,
      contactName: customer.contact,
      email: customer.email,
      phone: customer.phone,
      terms: customer.terms,
      openBalance,
      displayName: user.displayName
    },
    orders,
    quotes: portalQuotes,
    invoices: portalInvoices,
    files: portalFiles,
    messages,
    notifications: customerPortalNotifications({
      customerJobs,
      statusEvents,
      emailLogs
    }),
    requests,
    summary: {
      activeOrders: orders.filter((order) => !["Completed", "Cancelled"].includes(order.status)).length,
      readyForPickup: orders.filter((order) => order.status === "Ready for pickup").length,
      openQuotes: portalQuotes.filter((quote) => quote.status === "Sent" || quote.status === "Draft").length,
      openInvoices: portalInvoices.filter((invoice) => invoice.status !== "Paid").length,
      openBalance
    }
  };
}

export async function buildCustomerPortalPreviewData(input: {
  customerId: string;
  displayName?: string;
}) {
  const state = await loadMisState();
  const customer = (state.customers ?? []).find((item) => item.id === input.customerId);
  if (!customer) throw new Error("The selected customer record was not found.");
  return buildCustomerPortalData({
    id: `staff-preview-${input.customerId}`,
    email: customer.email,
    customerId: customer.id,
    displayName: input.displayName ?? customer.contact ?? customer.name
  });
}

export async function createCustomerPortalRequest(input: {
  user: VerifiedCustomerPortalUser;
  type: CustomerPortalRequestType;
  title: string;
  note?: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  fileName?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
}) {
  const state = await loadMisState();
  if (input.jobId && !(state.jobs ?? []).some((job) => job.id === input.jobId && job.customerId === input.user.customerId)) {
    throw new Error("This order does not belong to your portal account.");
  }
  if (input.quoteId && !(state.quotes ?? []).some((quote) => quote.id === input.quoteId && quote.customerId === input.user.customerId)) {
    throw new Error("This quote does not belong to your portal account.");
  }
  if (input.invoiceId && !(state.invoices ?? []).some((invoice) => invoice.id === input.invoiceId && invoice.customerId === input.user.customerId)) {
    throw new Error("This invoice does not belong to your portal account.");
  }

  const now = new Date().toISOString();
  const request: CustomerPortalRequest = {
    id: crypto.randomUUID(),
    requestNumber: DEMO_MODE
      ? `PR-${String(
          Math.max(
            1000,
            ...demoPortalRequests.map((item) =>
              Number(item.requestNumber?.replace(/\D/g, "")) || 1000
            )
          ) + 1
        ).padStart(4, "0")}`
      : undefined,
    customerId: input.user.customerId,
    userId: input.user.id,
    type: input.type,
    status: "New",
    jobId: input.jobId,
    quoteId: input.quoteId,
    invoiceId: input.invoiceId,
    title: input.title.trim().slice(0, 240),
    note: input.note?.trim().slice(0, 8000) ?? "",
    fileName: input.fileName,
    storagePath: input.storagePath,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now
  };
  if (DEMO_MODE) {
    demoPortalRequests.unshift(request);
    return request;
  }

  const response = await serviceFetch("/rest/v1/customer_portal_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: request.id,
      request_number: request.requestNumber,
      customer_id: request.customerId,
      user_id: request.userId,
      request_type: request.type,
      status: request.status,
      job_id: request.jobId,
      quote_id: request.quoteId,
      invoice_id: request.invoiceId,
      title: request.title,
      note: request.note,
      file_name: request.fileName,
      storage_path: request.storagePath,
      metadata: request.metadata ?? {}
    })
  });
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to save the portal request."));
  const row = ((await response.json()) as PortalRequestRow[])[0];
  return row ? requestRowToPortal(row) : request;
}

function safeObjectName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 140) || "upload.bin";
}

function customerUploadSignatureMatches(bytes: Uint8Array, mime: string) {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (mime === "application/pdf") return starts(0x25, 0x50, 0x44, 0x46);
  if (mime === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mime === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/webp") {
    return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (mime === "application/zip" || mime === "application/x-zip-compressed") {
    return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
  }
  return false;
}

export async function uploadCustomerPortalFile(input: {
  user: VerifiedCustomerPortalUser;
  file: File;
  title: string;
  note?: string;
  jobId?: string;
  requestType: "new_order" | "file_upload";
  metadata?: Record<string, unknown>;
}) {
  if (input.file.size <= 0) throw new Error("Choose a file to upload.");
  if (input.file.size > 100 * 1024 * 1024) throw new Error("Files are limited to 100 MB.");
  const allowed = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/zip",
    "application/x-zip-compressed"
  ]);
  if (!allowed.has(input.file.type)) {
    throw new Error("Upload a PDF, JPG, PNG, WEBP, or ZIP file.");
  }
  const signature = new Uint8Array(await input.file.slice(0, 32).arrayBuffer());
  if (!customerUploadSignatureMatches(signature, input.file.type)) {
    throw new Error("The uploaded file contents do not match the selected file type.");
  }

  if (DEMO_MODE) {
    return createCustomerPortalRequest({
      user: input.user,
      type: input.requestType,
      title: input.title,
      note: input.note,
      jobId: input.jobId,
      fileName: input.file.name,
      storagePath: `demo/${safeObjectName(input.file.name)}`,
      metadata: { ...(input.metadata ?? {}), size: input.file.size, mimeType: input.file.type, demo: true }
    });
  }
  if (!customerPortalConfigured()) throw new Error("Customer Portal storage is not configured.");

  const objectPath = `${input.user.customerId}/${input.user.id}/${Date.now()}-${safeObjectName(
    input.file.name
  )}`;
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const uploadResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${PORTAL_BUCKET}/${objectPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: privilegedSupabaseHeaders(SUPABASE_SERVICE_KEY!, {
        "Content-Type": input.file.type,
        "x-upsert": "false"
      }),
      body: buffer,
      cache: "no-store"
    }
  );
  if (!uploadResponse.ok) {
    throw new Error(await responseMessage(uploadResponse, "Unable to upload this customer file."));
  }

  try {
    return await createCustomerPortalRequest({
      user: input.user,
      type: input.requestType,
      title: input.title,
      note: input.note,
      jobId: input.jobId,
      fileName: input.file.name,
      storagePath: objectPath,
      metadata: { ...(input.metadata ?? {}), size: input.file.size, mimeType: input.file.type, bucket: PORTAL_BUCKET }
    });
  } catch (error) {
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/${PORTAL_BUCKET}/${objectPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      {
        method: "DELETE",
        headers: serviceHeaders(),
        cache: "no-store"
      }
    ).catch(() => undefined);
    throw error;
  }
}

export async function loadCustomerPortalFile(input: {
  user: VerifiedCustomerPortalUser;
  fileId: string;
}) {
  const state = await loadMisState();
  if (input.fileId.startsWith("portal-request:")) {
    const requestId = input.fileId.slice("portal-request:".length);
    const requests = await loadPortalRequests(input.user.customerId);
    const request = requests.find((item) => item.id === requestId && item.storagePath);
    if (!request?.storagePath) throw new Error("The uploaded file was not found.");
    if (DEMO_MODE) {
      return {
        bytes: Buffer.from("Demo Customer Portal upload"),
        contentType: String(request.metadata?.mimeType ?? "text/plain"),
        filename: request.fileName ?? "customer-upload.txt"
      };
    }
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/authenticated/${PORTAL_BUCKET}/${request.storagePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      { headers: serviceHeaders(), cache: "no-store" }
    );
    if (!response.ok) throw new Error(await responseMessage(response, "Unable to open this upload."));
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? String(request.metadata?.mimeType ?? "application/octet-stream"),
      filename: request.fileName ?? "customer-upload.bin"
    };
  }

  const file = (state.uploadedFiles ?? []).find(
    (item) =>
      item.id === input.fileId &&
      item.customerId === input.user.customerId &&
      !item.deletedAt &&
      (item.portalVisible === true || item.folder === "Proofs" || item.folder === "Invoices")
  );
  if (!file) throw new Error("This file is not available in your portal.");

  if (file.sourceProvider === "gmail" && file.sourceEmailMessageId && file.sourceEmailAttachmentId) {
    const thread = (state.emailThreads ?? []).find(
      (item) => item.id === file.sourceEmailThreadId
    );
    const message = thread?.messages.find((item) => item.id === file.sourceEmailMessageId);
    const attachment = message?.attachments.find((item) => item.id === file.sourceEmailAttachmentId);
    if (!message?.providerMessageId || !attachment?.providerAttachmentId) {
      throw new Error("The linked email attachment is unavailable.");
    }
    return {
      bytes: await loadGmailAttachment(message.providerMessageId, attachment.providerAttachmentId),
      contentType: attachment.mimeType,
      filename: attachment.filename
    };
  }

  if (file.storagePath) {
    const bucket = file.storageBucket ?? "mis-files";
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${file.storagePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      { headers: serviceHeaders(), cache: "no-store" }
    );
    if (!response.ok) throw new Error(await responseMessage(response, "Unable to open this file."));
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? file.type,
      filename: file.name
    };
  }

  if (DEMO_MODE && file.preview?.startsWith("data:")) {
    const match = file.preview.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(?:;base64)?,([\\s\\S]*)$/);
    if (!match) throw new Error("The demo preview could not be read.");
    const encoded = match[2] ?? "";
    const bytes = file.preview.includes(";base64,")
      ? Buffer.from(encoded, "base64")
      : Buffer.from(decodeURIComponent(encoded), "utf8");
    return { bytes, contentType: match[1] ?? file.type, filename: file.name };
  }

  throw new Error("This file record does not include downloadable data.");
}

export async function loadCustomerPortalRequestFileForStaff(requestId: string) {
  if (DEMO_MODE) {
    return {
      bytes: Buffer.from("Demo Customer Portal upload"),
      contentType: "text/plain",
      filename: "demo-customer-upload.txt"
    };
  }
  const response = await serviceFetch(
    `/rest/v1/customer_portal_requests?id=eq.${encodeURIComponent(
      requestId
    )}&select=id,file_name,storage_path,metadata&limit=1`
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to read this portal upload."));
  const row = ((await response.json()) as Array<{
    file_name?: string;
    storage_path?: string;
    metadata?: Record<string, unknown>;
  }>)[0];
  if (!row?.storage_path) throw new Error("This portal request does not include an uploaded file.");
  const fileResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/authenticated/${PORTAL_BUCKET}/${row.storage_path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    { headers: serviceHeaders(), cache: "no-store" }
  );
  if (!fileResponse.ok) throw new Error(await responseMessage(fileResponse, "Unable to open this portal upload."));
  return {
    bytes: Buffer.from(await fileResponse.arrayBuffer()),
    contentType: fileResponse.headers.get("content-type") ?? String(row.metadata?.mimeType ?? "application/octet-stream"),
    filename: row.file_name ?? "customer-upload.bin"
  };
}

export async function sendCustomerPortalAccessEmail(input: { email: string; origin: string }) {
  if (DEMO_MODE) return { message: `Demo access email prepared for ${input.email}.` };
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Customer Portal authentication is not configured.");
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid customer email address.");
  const safety = evaluateEmailSafety(await loadEmailSafetySettings(), [email]);
  if (safety.action !== "send") {
    return {
      message: `${safety.mode === "shadow" ? "Shadow Mode" : "Test Mode"} blocked the Customer Portal access email to ${email}. The customer was not contacted.`,
      blocked: true as const,
      safetyMode: safety.mode,
      safetyReason: safety.reason
    };
  }
  const redirectTo = `${input.origin.replace(/\/$/, "")}/portal/reset-password`;
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store"
    }
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to send the portal access email."));
  return { message: `A secure Customer Portal setup/reset email was sent to ${email}.` };
}

export async function loadCustomerPortalAdminData(customerId?: string) {
  if (DEMO_MODE) {
    const accounts: CustomerPortalAdminAccount[] = [
      {
        userId: "demo-customer-user",
        customerId: "cust-camp",
        email: "yossi@campahava.example",
        displayName: "Yossi Adler",
        isActive: true,
        invitedAt: "2026-08-04T14:00:00-04:00",
        lastSignInAt: new Date().toISOString()
      }
    ];
    return {
      configured: true,
      demo: true,
      accounts: customerId ? accounts.filter((item) => item.customerId === customerId) : accounts,
      requests: demoPortalRequests
        .filter((request) => !customerId || request.customerId === customerId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    };
  }
  if (!customerPortalConfigured()) {
    return { configured: false, demo: false, accounts: [], requests: [] as CustomerPortalRequest[] };
  }
  const accountFilter = customerId ? `&customer_id=eq.${encodeURIComponent(customerId)}` : "";
  const requestFilter = customerId ? `&customer_id=eq.${encodeURIComponent(customerId)}` : "";
  const [accountsResponse, requestsResponse] = await Promise.all([
    serviceFetch(
      `/rest/v1/customer_portal_accounts?select=user_id,customer_id,email,display_name,is_active,invited_at,last_sign_in_at${accountFilter}&order=invited_at.desc`
    ),
    serviceFetch(
      `/rest/v1/customer_portal_requests?select=id,request_number,customer_id,user_id,request_type,status,job_id,quote_id,invoice_id,title,note,file_name,storage_path,metadata,notification_read_at,notification_read_by,converted_at,converted_by,converted_record_number,conversion_kind,created_at,updated_at${requestFilter}&order=created_at.desc&limit=300`
    )
  ]);
  if (!accountsResponse.ok) throw new Error(await responseMessage(accountsResponse, "Unable to read portal accounts."));
  if (!requestsResponse.ok) throw new Error(await responseMessage(requestsResponse, "Unable to read portal requests."));
  const accounts = ((await accountsResponse.json()) as PortalAccountRow[]).map<CustomerPortalAdminAccount>((row) => ({
    userId: row.user_id,
    customerId: row.customer_id,
    email: row.email ?? "",
    displayName: row.display_name ?? row.email?.split("@")[0] ?? "Customer",
    isActive: row.is_active === true,
    invitedAt: row.invited_at,
    lastSignInAt: row.last_sign_in_at
  }));
  const requests = ((await requestsResponse.json()) as PortalRequestRow[]).map(requestRowToPortal);
  return { configured: true, demo: false, accounts, requests };
}

export async function inviteCustomerPortalUser(input: {
  customerId: string;
  email: string;
  displayName: string;
  invitedBy: string;
  origin: string;
}) {
  if (DEMO_MODE) {
    return { message: `Demo invitation prepared for ${input.email}.`, userId: "demo-customer-user" };
  }
  if (!customerPortalConfigured()) throw new Error("Customer Portal is not configured.");
  const state = await loadMisState();
  const customer = (state.customers ?? []).find((item) => item.id === input.customerId);
  if (!customer) throw new Error("The customer record was not found.");
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid customer email address.");
  const safety = evaluateEmailSafety(await loadEmailSafetySettings(), [email]);
  if (safety.action !== "send") {
    return {
      message: `${safety.mode === "shadow" ? "Shadow Mode" : "Test Mode"} blocked the Customer Portal invitation to ${email}. No customer invitation was sent.`,
      blocked: true as const,
      safetyMode: safety.mode,
      safetyReason: safety.reason
    };
  }
  const redirectTo = `${input.origin.replace(/\/$/, "")}/portal/set-password`;
  const inviteResponse = await serviceFetch(
    `/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      method: "POST",
      body: JSON.stringify({
        email,
        data: {
          display_name: input.displayName || customer.contact || customer.name,
          full_name: input.displayName || customer.contact || customer.name,
          customer_portal: true,
          customer_id: customer.id
        }
      })
    }
  );
  if (!inviteResponse.ok) {
    throw new Error(await responseMessage(inviteResponse, "Unable to send the customer invitation."));
  }
  const invitedUser = (await inviteResponse.json()) as { id?: string };
  if (!invitedUser.id) throw new Error("Supabase did not return the invited customer user.");
  const accountResponse = await serviceFetch("/rest/v1/customer_portal_accounts?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: invitedUser.id,
      customer_id: customer.id,
      email,
      display_name: input.displayName || customer.contact || customer.name,
      is_active: true,
      invited_by: input.invitedBy,
      invited_at: new Date().toISOString()
    })
  });
  if (!accountResponse.ok) {
    throw new Error(await responseMessage(accountResponse, "Invitation sent, but portal access could not be saved."));
  }
  return { message: `Customer Portal invitation sent to ${email}.`, userId: invitedUser.id };
}

export async function updateCustomerPortalAccount(input: {
  userId: string;
  isActive: boolean;
}) {
  if (DEMO_MODE) return { message: input.isActive ? "Demo portal access enabled." : "Demo portal access disabled." };
  const response = await serviceFetch(
    `/rest/v1/customer_portal_accounts?user_id=eq.${encodeURIComponent(input.userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ is_active: input.isActive })
    }
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to update portal access."));
  return { message: input.isActive ? "Customer Portal access enabled." : "Customer Portal access disabled." };
}

export async function updateCustomerPortalRequest(input: {
  requestId: string;
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
}) {
  const updatedAt = new Date().toISOString();
  if (DEMO_MODE) {
    const request = demoPortalRequests.find((item) => item.id === input.requestId);
    if (!request) throw new Error("Portal request not found.");
    if (input.status) request.status = input.status;
    if (input.metadata) request.metadata = { ...(request.metadata ?? {}), ...input.metadata };
    if (input.notificationReadAt !== undefined) request.notificationReadAt = input.notificationReadAt ?? undefined;
    if (input.notificationReadBy !== undefined) request.notificationReadBy = input.notificationReadBy ?? undefined;
    if (input.jobId !== undefined) request.jobId = input.jobId;
    if (input.quoteId !== undefined) request.quoteId = input.quoteId;
    if (input.convertedAt !== undefined) request.convertedAt = input.convertedAt;
    if (input.convertedBy !== undefined) request.convertedBy = input.convertedBy;
    if (input.convertedRecordNumber !== undefined) request.convertedRecordNumber = input.convertedRecordNumber;
    if (input.conversionKind !== undefined) request.conversionKind = input.conversionKind;
    request.updatedAt = updatedAt;
    return { message: `Demo portal request ${request.requestNumber ?? request.id} updated.`, request };
  }

  const body: Record<string, unknown> = { updated_at: updatedAt };
  if (input.status) body.status = input.status;
  if (input.metadata) body.metadata = input.metadata;
  if (input.notificationReadAt !== undefined) body.notification_read_at = input.notificationReadAt;
  if (input.notificationReadBy !== undefined) body.notification_read_by = input.notificationReadBy;
  if (input.jobId !== undefined) body.job_id = input.jobId;
  if (input.quoteId !== undefined) body.quote_id = input.quoteId;
  if (input.convertedAt !== undefined) body.converted_at = input.convertedAt;
  if (input.convertedBy !== undefined) body.converted_by = input.convertedBy;
  if (input.convertedRecordNumber !== undefined) body.converted_record_number = input.convertedRecordNumber;
  if (input.conversionKind !== undefined) body.conversion_kind = input.conversionKind;

  const response = await serviceFetch(
    `/rest/v1/customer_portal_requests?id=eq.${encodeURIComponent(input.requestId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body)
    }
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to update the portal request."));
  const row = ((await response.json()) as PortalRequestRow[])[0];
  return {
    message: input.status ? `Portal request marked ${input.status}.` : "Portal request updated.",
    request: row ? requestRowToPortal(row) : undefined
  };
}
