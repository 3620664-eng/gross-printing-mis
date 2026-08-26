import { NextRequest, NextResponse } from "next/server";
import {
  StaffContext,
  StaffRole,
  logSecurityEvent,
  noStoreJson,
  rejectCrossSiteMutation,
  rejectOversizedJson,
  serviceFetch,
  validateStaffRequest
} from "@/lib/server-auth";
import { emailServerConfigured, sendGmailMessage } from "@/lib/gmail-server";

export const dynamic = "force-dynamic";

const WORKSPACE_ID = "gross-printing";
const COLLECTIONS = [
  "customers",
  "vendors",
  "orders",
  "jobs",
  "quotes",
  "invoices",
  "uploadedFiles",
  "emailLogs",
  "emailTemplates",
  "emailThreads",
  "emailIntakeTickets",
  "emailBusinessRules",
  "emailSafetySettings",
  "aiLearningExamples",
  "statusEvents",
  "operationalActivities",
  "paperStocks",
  "productCategories",
  "productPresets",
  "catalogPrices",
  "machines",
  "quantityRateCurve"
] as const;

type CollectionName = (typeof COLLECTIONS)[number];
type JsonRecord = Record<string, unknown>;
type SecureState = Record<CollectionName, unknown[]> & {
  persistence?: {
    schemaVersion: 1;
    revision: number;
    savedAt: string;
    clientId: string;
  };
};

type WorkspaceRow = {
  id: string;
  revision: number;
  updated_at?: string;
  migrated_from_legacy_at?: string;
};

type MisRecordRow = {
  collection: string;
  record_id: string;
  record: unknown;
  sort_order?: number;
  deleted_at?: string;
};

function emptyState(): SecureState {
  return Object.fromEntries(COLLECTIONS.map((collection) => [collection, []])) as unknown as SecureState;
}

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function recordId(collection: CollectionName, value: unknown, index: number) {
  if (isObject(value)) {
    const id = asString(value.id) || asString(value.quantity) || asString(value.jobId) || asString(value.user_id);
    if (id) return id.slice(0, 240);
  }
  if (typeof value === "string") return `value-${value.slice(0, 160).replace(/[^a-zA-Z0-9_-]+/g, "-") || index}`;
  return `row-${String(index).padStart(8, "0")}`;
}

async function loadWorkspace(): Promise<{ workspace: WorkspaceRow } | { error: string }> {
  const response = await serviceFetch(
    `/rest/v1/mis_workspaces?id=eq.${encodeURIComponent(WORKSPACE_ID)}&select=id,revision,updated_at,migrated_from_legacy_at&limit=1`
  );
  if (!response.ok) {
    return { error: "Run supabase/GROSS_PRINTING_MIS_V067_SERVER_SECURITY.sql before using this release." } as const;
  }
  const workspace = ((await response.json()) as WorkspaceRow[])[0];
  if (!workspace) {
    return { error: "The secure MIS workspace is missing. Run the v0.6.7 Supabase migration." } as const;
  }
  return { workspace } as const;
}

async function loadState(): Promise<
  { state: SecureState; workspace: WorkspaceRow; rows: MisRecordRow[] } | { error: string }
> {
  const workspaceResult = await loadWorkspace();
  if ("error" in workspaceResult) return workspaceResult;
  const recordsResponse = await serviceFetch(
    `/rest/v1/mis_records?workspace_id=eq.${encodeURIComponent(WORKSPACE_ID)}&deleted_at=is.null&select=collection,record_id,record,sort_order,deleted_at&order=collection.asc,sort_order.asc`
  );
  if (!recordsResponse.ok) return { error: "Unable to read the protected MIS records." } as const;
  const rows = (await recordsResponse.json()) as MisRecordRow[];
  const state = emptyState();
  for (const row of rows) {
    if (!COLLECTIONS.includes(row.collection as CollectionName)) continue;
    state[row.collection as CollectionName].push(row.record);
  }
  state.persistence = {
    schemaVersion: 1,
    revision: Number(workspaceResult.workspace.revision ?? 0),
    savedAt: workspaceResult.workspace.updated_at ?? new Date().toISOString(),
    clientId: "server-v067"
  };
  return { state, workspace: workspaceResult.workspace, rows } as const;
}

function sanitizeJobForProduction(value: unknown) {
  if (!isObject(value)) return value;
  const copy: JsonRecord = { ...value };
  // Production departments receive the job ticket, not the customer directory or financial identity.
  copy.customerId = "";
  copy.customerName = "Restricted customer";
  delete copy.customerReference;
  copy.pricing = { paper: 0, printing: 0, finishing: 0, cutting: 0, bookletCover: 0, total: 0 };
  delete copy.quoteId;
  delete copy.invoiceId;
  delete copy.invoiceCreatedAt;
  delete copy.invoiceReviewedAt;
  delete copy.invoiceReviewedBy;
  delete copy.invoiceSentAt;
  delete copy.sourceEmailThreadId;
  delete copy.sourceEmailMessageId;
  delete copy.emailThreadIds;
  delete copy.portalRequestId;
  return copy;
}

function sanitizePaperForProduction(value: unknown) {
  if (!isObject(value)) return value;
  const copy: JsonRecord = { ...value, costPerSheet: 0, sellPerSheet: 0 };
  delete copy.supplier;
  delete copy.invoiceNumber;
  delete copy.lastOrderedQty;
  delete copy.lastOrderedDate;
  return copy;
}

function sanitizeMachineForProduction(value: unknown) {
  if (!isObject(value)) return value;
  return { ...value, hourlyRate: 0 };
}

function sanitizeFileForProduction(value: unknown) {
  if (!isObject(value)) return value;
  const copy: JsonRecord = { ...value };
  delete copy.customerId;
  delete copy.customerName;
  delete copy.sourceEmailThreadId;
  delete copy.sourceEmailMessageId;
  delete copy.sourceEmailAttachmentId;
  delete copy.sourcePortalRequestId;
  delete copy.portalVisible;
  return copy;
}

function sanitizeActivityForProduction(value: unknown) {
  if (!isObject(value)) return value;
  const copy: JsonRecord = { ...value };
  delete copy.customerId;
  delete copy.customerName;
  delete copy.quoteId;
  delete copy.quoteNumber;
  delete copy.invoiceId;
  delete copy.invoiceNumber;
  delete copy.details;
  return copy;
}

function frontDeskState(state: SecureState): SecureState {
  // Office/Estimator needs customer, quote, invoice, intake, and production records.
  // The owner-wide activity feed stays server-side and is available only through the owner security/operations routes.
  return { ...state, operationalActivities: [] };
}

function frontDeskAllowedState(
  current: SecureState,
  incoming: SecureState,
  context: StaffContext
): Partial<Record<CollectionName, unknown[]>> {
  const writable: CollectionName[] = [
    "customers", "vendors", "orders", "jobs", "quotes", "invoices", "uploadedFiles", "emailLogs",
    "emailTemplates", "emailThreads", "emailIntakeTickets", "emailBusinessRules", "aiLearningExamples"
  ];
  const result: Partial<Record<CollectionName, unknown[]>> = {};
  for (const name of writable) result[name] = Array.isArray(incoming[name]) ? incoming[name] : current[name];

  // Status history and the owner activity feed are append-only for Office. Existing history cannot be rewritten in DevTools.
  const existingStatusIds = new Set(current.statusEvents.filter(isObject).map((event) => asString(event.id)));
  const appendedStatusEvents = incoming.statusEvents
    .filter((event) => isObject(event) && !existingStatusIds.has(asString(event.id)))
    .map((event) => normalizeAppendedActivity(event, context))
    .filter(Boolean);
  result.statusEvents = [...current.statusEvents, ...appendedStatusEvents];

  const existingActivityIds = new Set(current.operationalActivities.filter(isObject).map((activity) => asString(activity.id)));
  const appendedActivities = incoming.operationalActivities
    .filter((activity) => isObject(activity) && !existingActivityIds.has(asString(activity.id)))
    .map((activity) => normalizeAppendedActivity(activity, context))
    .filter(Boolean);
  result.operationalActivities = [...current.operationalActivities, ...appendedActivities];

  // Pricing references, paper definitions, machines, and quantity curves are readable for quoting but are omitted from Office writes.
  return result;
}

function stateForRole(state: SecureState, context: StaffContext): SecureState {
  const role = context.profile.role;
  if (role === "admin") return state;
  if (role === "front_desk") return frontDeskState(state);
  const visibleJobs = state.jobs.filter((job) => isObject(job) && !job.deletedAt).map(sanitizeJobForProduction);
  const visibleJobIds = new Set(visibleJobs.map((job) => (isObject(job) ? asString(job.id) : "")).filter(Boolean));
  const result = emptyState();
  result.jobs = visibleJobs;
  result.uploadedFiles = state.uploadedFiles
    .filter((file) => isObject(file) && visibleJobIds.has(asString(file.jobId)) && !file.deletedAt)
    .map(sanitizeFileForProduction);
  result.statusEvents = state.statusEvents.filter((event) => isObject(event) && visibleJobIds.has(asString(event.jobId)));
  result.operationalActivities = state.operationalActivities
    .filter(
      (activity) => isObject(activity) &&
        Boolean(activity.jobId) &&
        visibleJobIds.has(asString(activity.jobId)) &&
        ["job", "file", "system"].includes(asString(activity.category))
    )
    .map(sanitizeActivityForProduction);
  result.paperStocks = state.paperStocks.map(sanitizePaperForProduction);
  result.productCategories = state.productCategories;
  result.productPresets = state.productPresets;
  result.machines = state.machines.map(sanitizeMachineForProduction);
  result.quantityRateCurve = [];
  // Routed email-derived tasks are the only intake records exposed to production
  // roles. A worker sees work specifically assigned to them, or to their role.
  // Raw inbox threads/customer financial records remain hidden.
  result.emailIntakeTickets = state.emailIntakeTickets.filter((ticket) => {
    if (!isObject(ticket) || !ticket.routedAt || ticket.routeCompletedAt) return false;
    const assignedUserId = asString(ticket.assignedToUserId);
    const assignedRole = asString(ticket.assignedRole);
    return (assignedUserId && assignedUserId === context.user.id) || (!assignedUserId && assignedRole === role);
  }).map((ticket) => {
    if (!isObject(ticket)) return ticket;
    const copy: JsonRecord = { ...ticket };
    delete copy.customerId;
    copy.customerName = "Restricted customer";
    delete copy.customerMatchReason;
    delete copy.suggestedCustomerIds;
    delete copy.customerReplyDraft;
    // Do not expose the raw customer email body to production roles. Give them
    // the routed production specification and internal routing note instead.
    const safeSummary = [
      asString(ticket.productName) || asString(ticket.productHint) || asString(ticket.productCategory),
      ticket.quantity ? `${String(ticket.quantity)} pcs` : "",
      ticket.pieceWidth && ticket.pieceHeight ? `${String(ticket.pieceWidth)} x ${String(ticket.pieceHeight)}` : "",
      asString(ticket.colorSpec),
      asString(ticket.paperHint),
      Array.isArray(ticket.finishing) ? ticket.finishing.map(asString).filter(Boolean).join(", ") : ""
    ].filter(Boolean).join(" · ");
    copy.subject = `${asString(ticket.ticketNumber) || "Job Ticket"} routed work`;
    copy.summary = safeSummary || "Routed production work task.";
    copy.notes = asString(ticket.routingNote);
    return copy;
  });
  result.persistence = state.persistence;
  return result;
}

const PRODUCTION_JOB_FIELDS: Record<Exclude<StaffRole, "admin" | "front_desk">, Set<string>> = {
  prepress: new Set([
    "status", "workflowOrder", "quantity", "pieceWidth", "pieceHeight", "dueDate", "dueTime", "rush",
    "stockId", "stockName", "colorSpec", "sides", "bindery", "notes", "artworkName", "artworkPreview",
    "cuttingMode", "booklet", "time", "updatedAt"
  ]),
  press: new Set(["status", "workflowOrder", "notes", "time", "updatedAt"]),
  finishing: new Set(["status", "workflowOrder", "notes", "time", "updatedAt"])
};

function mergeProductionJob(current: unknown, incoming: unknown, role: Exclude<StaffRole, "admin" | "front_desk">) {
  if (!isObject(current) || !isObject(incoming)) return current;
  const result: JsonRecord = { ...current };
  for (const field of PRODUCTION_JOB_FIELDS[role]) {
    if (Object.prototype.hasOwnProperty.call(incoming, field)) result[field] = incoming[field];
  }
  result.updatedAt = new Date().toISOString();
  return result;
}

function mergeProductionTicket(current: unknown, incoming: unknown, context: StaffContext) {
  if (!isObject(current) || !isObject(incoming)) return current;
  const assignedUserId = asString(current.assignedToUserId);
  const assignedRole = asString(current.assignedRole);
  const isAssigned = assignedUserId
    ? assignedUserId === context.user.id
    : assignedRole === context.profile.role;
  if (!isAssigned || !current.routedAt) return current;
  const result: JsonRecord = { ...current };
  if (!current.routeCompletedAt && incoming.routeCompletedAt) {
    const completedAt = new Date().toISOString();
    const employeeName = context.profile.display_name ?? context.profile.email ?? context.user.email ?? "Staff";
    result.routeCompletedAt = completedAt;
    result.routeCompletedBy = employeeName;
    result.updatedAt = result.routeCompletedAt;
    result.history = [
      {
        id: `ticket-event-${crypto.randomUUID()}`,
        status: asString(current.status) || "AI Reviewed",
        createdAt: completedAt,
        employeeName,
        note: `Assigned work completed by ${employeeName}.`
      },
      ...(Array.isArray(current.history) ? current.history : [])
    ];
  }
  return result;
}

function normalizeAppendedActivity(value: unknown, context: StaffContext) {
  if (!isObject(value)) return undefined;
  return {
    ...value,
    employeeId: context.user.id,
    employeeName: context.profile.display_name ?? context.profile.email ?? context.user.email ?? "Staff",
    createdAt: asString(value.createdAt) || new Date().toISOString()
  };
}

function allowedStateForWrite(
  current: SecureState,
  incoming: SecureState,
  context: StaffContext
): Partial<Record<CollectionName, unknown[]>> {
  const role = context.profile.role;
  if (role === "admin") {
    const result = Object.fromEntries(COLLECTIONS.map((name) => [name, Array.isArray(incoming[name]) ? incoming[name] : current[name]]));
    // Customer-email safety is a production kill switch. Keep it server-authoritative:
    // non-Owner admins may operate the MIS, but cannot change Shadow/Test/Live mode,
    // test recipients, or redirect targets by crafting a protected-state request.
    if (context.profile.is_owner !== true) result.emailSafetySettings = current.emailSafetySettings;
    return result;
  }
  if (role === "front_desk") return frontDeskAllowedState(current, incoming, context);

  const currentJobs = new Map(
    current.jobs.filter(isObject).map((job) => [asString(job.id), job] as const).filter(([id]) => Boolean(id))
  );
  const mergedJobs = current.jobs.map((job) => {
    if (!isObject(job)) return job;
    const incomingJob = incoming.jobs.find((candidate) => isObject(candidate) && asString(candidate.id) === asString(job.id));
    return incomingJob ? mergeProductionJob(job, incomingJob, role) : job;
  });

  const existingStatusIds = new Set(current.statusEvents.filter(isObject).map((event) => asString(event.id)));
  const appendedStatusEvents = incoming.statusEvents
    .filter((event) => isObject(event) && !existingStatusIds.has(asString(event.id)) && currentJobs.has(asString(event.jobId)))
    .map((event) => normalizeAppendedActivity(event, context))
    .filter(Boolean);

  const existingActivityIds = new Set(current.operationalActivities.filter(isObject).map((activity) => asString(activity.id)));
  const appendedActivities = incoming.operationalActivities
    .filter((activity) => isObject(activity) && !existingActivityIds.has(asString(activity.id)))
    .filter((activity) => currentJobs.has(asString((activity as JsonRecord).jobId)))
    .filter((activity) => ["job", "file", "system"].includes(asString((activity as JsonRecord).category)))
    .map((activity) => normalizeAppendedActivity(sanitizeActivityForProduction(activity), context))
    .filter(Boolean);

  const existingFileIds = new Set(current.uploadedFiles.filter(isObject).map((file) => asString(file.id)));
  const appendedFiles = incoming.uploadedFiles.filter(
    (file) => isObject(file) && !existingFileIds.has(asString(file.id)) && currentJobs.has(asString(file.jobId))
  );

  const mergedEmailTickets = current.emailIntakeTickets.map((ticket) => {
    if (!isObject(ticket)) return ticket;
    const incomingTicket = incoming.emailIntakeTickets.find(
      (candidate) => isObject(candidate) && asString(candidate.id) === asString(ticket.id)
    );
    return incomingTicket ? mergeProductionTicket(ticket, incomingTicket, context) : ticket;
  });

  return {
    jobs: mergedJobs,
    statusEvents: [...current.statusEvents, ...appendedStatusEvents],
    operationalActivities: [...current.operationalActivities, ...appendedActivities],
    uploadedFiles: [...current.uploadedFiles, ...appendedFiles],
    emailIntakeTickets: mergedEmailTickets
  };
}

function nextInvoiceNumber(invoices: unknown[]) {
  const highest = invoices.reduce<number>((max, value) => {
    if (!isObject(value)) return max;
    const match = asString(value.invoiceNumber).match(/^INV-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 3008);
  return `INV-${highest + 1}`;
}

function parentOrderStatus(order: JsonRecord, jobs: JsonRecord[]) {
  const ids = Array.isArray(order.jobIds) ? order.jobIds.map(asString) : [];
  const children = jobs.filter((job) => ids.includes(asString(job.id)) && !job.deletedAt && job.status !== "Cancelled");
  if (!children.length) return asString(order.status);
  if (children.every((job) => job.status === "Delivered")) return "Delivered";
  if (children.every((job) => job.status === "Ready" || job.status === "Delivered")) return "Ready";
  if (children.some((job) => ["Prepress", "Printing", "Finishing", "Ready", "Delivered"].includes(asString(job.status)))) return "In production";
  if (children.some((job) => job.status === "Approved")) return "Approved";
  return asString(order.status);
}

function invoiceLine(job: JsonRecord) {
  const pricing = isObject(job.pricing) ? job.pricing : {};
  return {
    id: `invoice-line-${asString(job.id)}`,
    jobId: asString(job.id),
    title: asString(job.title),
    quantity: Number(job.quantity ?? 0),
    amount: Number(pricing.total ?? 0),
    description: `${Number(job.pieceWidth ?? 0)} × ${Number(job.pieceHeight ?? 0)} · ${asString(job.colorSpec)} · ${asString(job.stockName)}`
  };
}

function secureActivity(context: StaffContext, input: JsonRecord) {
  return {
    id: `security-${crypto.randomUUID()}`,
    employeeId: context.user.id,
    employeeName: context.profile.display_name ?? context.profile.email ?? context.user.email ?? "Staff",
    createdAt: new Date().toISOString(),
    ...input
  };
}

async function applyServerAutomations(
  current: SecureState,
  allowed: Partial<Record<CollectionName, unknown[]>>,
  context: StaffContext,
  origin: string
) {
  if (context.profile.role === "admin") return allowed;
  let nextJobs = (allowed.jobs ?? current.jobs).filter(isObject).map((job) => ({ ...job }));
  let nextOrders = (allowed.orders ?? current.orders).filter(isObject).map((order) => ({ ...order }));
  let nextInvoices = (allowed.invoices ?? current.invoices).filter(isObject).map((invoice) => ({ ...invoice }));
  let nextActivities = (allowed.operationalActivities ?? current.operationalActivities).filter(isObject).map((item) => ({ ...item }));
  let nextEmailLogs = (allowed.emailLogs ?? current.emailLogs).filter(isObject).map((item) => ({ ...item }));
  const currentJobs = new Map(current.jobs.filter(isObject).map((job) => [asString(job.id), job] as const));
  const currentOrders = new Map(current.orders.filter(isObject).map((order) => [asString(order.id), order] as const));
  const customers = new Map(current.customers.filter(isObject).map((customer) => [asString(customer.id), customer] as const));
  const processedInvoices = new Set<string>();
  const processedNotifications = new Set<string>();
  const now = new Date().toISOString();

  for (const nextJob of nextJobs) {
    const jobId = asString(nextJob.id);
    const previousJob = currentJobs.get(jobId);
    if (!previousJob || previousJob.status === nextJob.status) continue;
    const status = asString(nextJob.status);
    const orderId = asString(nextJob.orderId);
    const order = orderId ? nextOrders.find((item) => asString(item.id) === orderId) : undefined;
    const originalOrder = orderId ? currentOrders.get(orderId) : undefined;
    const statusScope = order ?? nextJob;
    const publicNumber = order ? asString(order.orderNumber) : asString(nextJob.jobNumber);
    const publicTitle = order ? asString(order.title) : asString(nextJob.title);
    const customer = customers.get(asString(nextJob.customerId));

    const overallStatus = order ? parentOrderStatus(order, nextJobs) : status;
    if (order) order.status = overallStatus;

    const invoiceReady = order
      ? overallStatus === "Ready" || overallStatus === "Delivered"
      : status === "Ready" || status === "Delivered";
    const invoiceScope = order ? `order:${orderId}` : `job:${jobId}`;
    if (invoiceReady && !processedInvoices.has(invoiceScope)) {
      processedInvoices.add(invoiceScope);
      const childJobs = order
        ? nextJobs.filter((candidate) => Array.isArray(order.jobIds) && order.jobIds.map(asString).includes(asString(candidate.id)) && candidate.status !== "Cancelled")
        : [nextJob];
      const existing = nextInvoices.find((invoice) => order
        ? asString(invoice.orderId) === orderId || asString(invoice.id) === asString(order.invoiceId)
        : asString(invoice.jobId) === jobId || asString(invoice.id) === asString(nextJob.invoiceId));
      const invoiceId = asString(existing?.id) || asString(order?.invoiceId) || asString(nextJob.invoiceId) || `inv-${orderId || jobId}`;
      const lines = childJobs.map(invoiceLine);
      const amount = lines.reduce((sum, line) => sum + line.amount, 0);
      const invoice: JsonRecord = {
        ...(existing ?? {}),
        id: invoiceId,
        invoiceNumber: asString(existing?.invoiceNumber) || nextInvoiceNumber(nextInvoices),
        jobId: asString(childJobs[0]?.id) || jobId,
        ...(order ? { orderId, jobIds: childJobs.map((child) => asString(child.id)), lineItems: lines } : {}),
        customerId: asString(nextJob.customerId),
        customerName: asString(nextJob.customerName),
        title: order ? `${asString(order.orderNumber)} — ${asString(order.title)}` : asString(nextJob.title),
        amount,
        status: ["Ready", "Sent", "Paid"].includes(asString(existing?.status)) ? existing?.status : "Draft",
        createdAt: asString(existing?.createdAt) || now,
        updatedAt: now
      };
      nextInvoices = existing
        ? nextInvoices.map((item) => asString(item.id) === asString(existing.id) ? invoice : item)
        : [invoice, ...nextInvoices];
      nextJobs = nextJobs.map((item) => childJobs.some((child) => asString(child.id) === asString(item.id))
        ? { ...item, invoiceId, invoiceCreatedAt: asString(item.invoiceCreatedAt) || now, updatedAt: now }
        : item);
      if (order) {
        nextOrders = nextOrders.map((item) => asString(item.id) === orderId ? { ...item, invoiceId, updatedAt: now } : item);
      }
      nextActivities = [secureActivity(context, {
        category: "invoice",
        action: existing ? "invoice_refreshed_server" : "invoice_created_server",
        description: `${asString(invoice.invoiceNumber)} prepared securely for ${publicNumber}.`,
        customerId: asString(nextJob.customerId),
        customerName: asString(nextJob.customerName),
        jobId,
        jobNumber: asString(nextJob.jobNumber),
        invoiceId,
        invoiceNumber: asString(invoice.invoiceNumber),
        toValue: "Draft"
      }), ...nextActivities];
    }

    if (context.profile.role === "front_desk") continue;
    if (statusScope.customerEmailNotificationsEnabled === false || asString(statusScope.customerNotificationPath) === "manual") continue;
    let notificationField = "";
    let templateId = "";
    let label = "";
    if (["Prepress", "Printing", "Finishing"].includes(status) && !statusScope.customerProductionNotifiedAt) {
      notificationField = "customerProductionNotifiedAt";
      templateId = "job_in_production";
      label = "in production";
    } else if ((order ? overallStatus === "Ready" : status === "Ready") && !statusScope.customerReadyNotifiedAt) {
      notificationField = "customerReadyNotifiedAt";
      templateId = "ready_pickup";
      label = "ready for pickup";
    } else if ((order ? overallStatus === "Delivered" : status === "Delivered") && !statusScope.customerCompletedNotifiedAt) {
      notificationField = "customerCompletedNotifiedAt";
      templateId = "job_completed";
      label = "completed";
    }
    const notificationKey = `${orderId || jobId}:${notificationField}`;
    if (!notificationField || processedNotifications.has(notificationKey)) continue;
    processedNotifications.add(notificationKey);
    let sent = false;
    let sendError = "";
    let deliveryStatus: "Sent" | "Test Sent" | "Blocked" | "Redirected" | "Failed" = "Failed";
    let safetyMode = "";
    let safetyReason = "";
    let originalTo = "";
    const email = asString(customer?.email);
    const greeting = asString(customer?.contact) || asString(customer?.name) || "Customer";
    const subject = label === "in production"
      ? `Your order ${publicNumber} is in production`
      : label === "ready for pickup"
        ? `Your order ${publicNumber} is ready for pickup`
        : `Your order ${publicNumber} is completed`;
    const linkedInvoice = nextInvoices.find((invoice) => order
      ? asString(invoice.orderId) === orderId || asString(invoice.id) === asString(order.invoiceId)
      : asString(invoice.jobId) === jobId || asString(invoice.id) === asString(nextJob.invoiceId));
    const portalQuery = label === "ready for pickup" && linkedInvoice?.id
      ? `invoice=${encodeURIComponent(asString(linkedInvoice.id))}`
      : `job=${encodeURIComponent(jobId)}`;
    const portalTarget = `${origin.replace(/\/$/, "")}/portal?${portalQuery}`;
    const body = `Hello ${greeting},\n\nYour order ${publicNumber} — ${publicTitle} is ${label}.\n\nView the current details in your Gross Printing Customer Portal:\n${portalTarget}\n\nThank you,\nGross Printing`;
    if (email && emailServerConfigured()) {
      try {
        const delivery = await sendGmailMessage({ to: email, subject, body, threadId: asString(order?.sourceEmailThreadId) || asString(nextJob.sourceEmailThreadId) || undefined });
        safetyMode = delivery.safetyMode;
        safetyReason = delivery.safetyReason;
        originalTo = delivery.originalTo;
        if (delivery.blocked) {
          deliveryStatus = "Blocked";
          sendError = delivery.safetyReason;
        } else if (delivery.redirected) {
          deliveryStatus = "Redirected";
          sendError = delivery.safetyReason;
        } else {
          sent = true;
          deliveryStatus = delivery.testDelivery ? "Test Sent" : "Sent";
        }
      } catch (error) {
        sendError = error instanceof Error ? error.message : "Email delivery failed.";
      }
    }
    // Only a message that actually reached the intended recipient counts as a customer notification.
    // Shadow/redirected messages deliberately leave the real notification flag untouched so testing never pretends the customer was contacted.
    if (sent) {
      if (order) {
        nextOrders = nextOrders.map((item) => asString(item.id) === orderId ? { ...item, [notificationField]: now, updatedAt: now } : item);
        nextJobs = nextJobs.map((item) => Array.isArray(order.jobIds) && order.jobIds.map(asString).includes(asString(item.id))
          ? { ...item, [notificationField]: now, updatedAt: now }
          : item);
      } else {
        nextJobs = nextJobs.map((item) => asString(item.id) === jobId ? { ...item, [notificationField]: now, updatedAt: now } : item);
      }
    }
    nextEmailLogs = [{
      id: `email-security-${crypto.randomUUID()}`,
      entityId: orderId || jobId,
      entityType: "job",
      to: email,
      subject,
      body,
      createdAt: now,
      status: deliveryStatus,
      templateId,
      customerId: asString(nextJob.customerId),
      jobId,
      threadId: asString(order?.sourceEmailThreadId) || asString(nextJob.sourceEmailThreadId) || undefined,
      sentBy: context.profile.display_name ?? context.profile.email ?? context.user.email ?? "Staff",
      error: sent ? undefined : sendError || (email ? "Gmail is not configured." : "Customer email is missing."),
      safetyMode: safetyMode || undefined,
      safetyReason: safetyReason || undefined,
      originalTo: originalTo || email || undefined
    }, ...nextEmailLogs];
    nextActivities = [secureActivity(context, {
      category: "email",
      action: sent ? "customer_status_notification_sent_server" : deliveryStatus === "Blocked" || deliveryStatus === "Redirected" ? "customer_status_notification_blocked_test_mode" : "customer_status_notification_recorded_server",
      description: sent
        ? `${publicNumber} customer ${label} notification ${deliveryStatus === "Test Sent" ? "sent to approved test recipient" : "sent"}.`
        : deliveryStatus === "Blocked"
          ? `${publicNumber} customer ${label} notification blocked by email safety mode.`
          : deliveryStatus === "Redirected"
            ? `${publicNumber} customer ${label} notification redirected to the test inbox; the customer was not contacted.`
            : `${publicNumber} customer status updated; email was not sent.`,
      customerId: asString(nextJob.customerId),
      customerName: asString(nextJob.customerName),
      jobId,
      jobNumber: asString(nextJob.jobNumber),
      toValue: label,
      details: { emailSent: sent, deliveryStatus, safetyMode: safetyMode || undefined, error: sendError || undefined }
    }), ...nextActivities];
  }

  allowed.jobs = nextJobs;
  allowed.orders = nextOrders;
  allowed.invoices = nextInvoices;
  allowed.operationalActivities = nextActivities;
  allowed.emailLogs = nextEmailLogs;
  return allowed;
}

function destructiveChangeDetected(current: SecureState, incoming: SecureState, role: StaffRole) {
  const protectedCollections: CollectionName[] = role === "admin"
    ? ["customers", "orders", "jobs", "quotes", "invoices", "uploadedFiles"]
    : role === "front_desk"
      ? ["customers", "orders", "jobs", "quotes", "invoices"]
      : ["jobs"];
  for (const collection of protectedCollections) {
    const oldCount = current[collection].length;
    const newCount = incoming[collection]?.length ?? 0;
    if (oldCount >= 10 && newCount < Math.floor(oldCount * 0.6)) return collection;
  }
  return undefined;
}

async function saveCollectionsAtomically(
  collections: Partial<Record<CollectionName, unknown[]>>,
  expectedRevision: number,
  context: StaffContext
) {
  const rows: Array<{ collection: CollectionName; record_id: string; record_value: unknown; sort_order: number }> = [];
  const includedCollections: CollectionName[] = [];
  for (const collection of COLLECTIONS) {
    const values = collections[collection];
    if (!values) continue;
    includedCollections.push(collection);
    values.forEach((value, index) => {
      rows.push({
        collection,
        record_id: recordId(collection, value, index),
        record_value: value,
        sort_order: index
      });
    });
  }

  const response = await serviceFetch("/rest/v1/rpc/save_mis_records", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_id: WORKSPACE_ID,
      p_expected_revision: expectedRevision,
      p_actor_user_id: context.user.id,
      p_rows: rows,
      p_collections: includedCollections,
      p_soft_delete_missing: context.profile.role === "admin"
    })
  });
  if (!response.ok) throw new Error("Unable to save the protected MIS transaction.");
  const claimed = await response.json().catch(() => null) as number | null;
  return Number.isSafeInteger(claimed) ? Number(claimed) : undefined;
}

export async function GET(request: NextRequest) {
  const context = await validateStaffRequest(request);
  if (context instanceof NextResponse) return context;
  const loaded = await loadState();
  if ("error" in loaded) return noStoreJson({ error: loaded.error }, { status: 503 });
  return noStoreJson({
    ok: true,
    role: context.profile.role,
    state: stateForRole(loaded.state, context),
    serverRevision: loaded.workspace.revision
  });
}

export async function PUT(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request);
  if (oversized) return oversized;
  const context = await validateStaffRequest(request);
  if (context instanceof NextResponse) return context;
  let body: { state?: SecureState; baseRevision?: number; confirmBulkChange?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid protected-data update." }, { status: 400 });
  }
  if (!body.state || !isObject(body.state)) return noStoreJson({ error: "A valid MIS state is required." }, { status: 400 });

  const loaded = await loadState();
  if ("error" in loaded) return noStoreJson({ error: loaded.error }, { status: 503 });
  const currentRevision = Number(loaded.workspace.revision ?? 0);
  if (Number(body.baseRevision ?? -1) !== currentRevision) {
    return noStoreJson(
      { error: "The server has newer changes. Refresh before saving again.", code: "REVISION_CONFLICT", serverRevision: currentRevision },
      { status: 409 }
    );
  }

  const incoming = body.state as SecureState;
  if (context.profile.role === "admin" || context.profile.role === "front_desk") {
    const destructiveCollection = destructiveChangeDetected(loaded.state, incoming, context.profile.role);
    if (destructiveCollection && !(context.profile.role === "admin" && body.confirmBulkChange)) {
      await logSecurityEvent(context, "Blocked bulk record removal", "data_protection", { collection: destructiveCollection });
      return noStoreJson(
        { error: `A large ${destructiveCollection} removal was blocked. Restore or use the protected bulk-change confirmation.` },
        { status: 409 }
      );
    }
  }

  let allowed = allowedStateForWrite(loaded.state, incoming, context);
  allowed = await applyServerAutomations(loaded.state, allowed, context, new URL(request.url).origin);
  let nextRevision: number | undefined;
  try {
    nextRevision = await saveCollectionsAtomically(allowed, currentRevision, context);
    if (nextRevision === undefined) {
      const latest = await loadWorkspace();
      const serverRevision = "workspace" in latest ? Number(latest.workspace.revision ?? currentRevision) : currentRevision;
      return noStoreJson(
        { error: "Another staff member saved newer changes. Refresh before saving again.", code: "REVISION_CONFLICT", serverRevision },
        { status: 409 }
      );
    }
    const savedAt = new Date().toISOString();
    await logSecurityEvent(context, "Saved protected MIS transaction", "data_mutation", {
      revision: nextRevision,
      collections: Object.keys(allowed)
    });
    return noStoreJson({ ok: true, serverRevision: nextRevision, savedAt });
  } catch (error) {
    await logSecurityEvent(context, "Protected MIS transaction failed", "data_mutation_failed", {
      revision: nextRevision,
      error: error instanceof Error ? error.message : "Unknown protected save error"
    }).catch(() => undefined);
    return noStoreJson({ error: error instanceof Error ? error.message : "Protected save failed." }, { status: 502 });
  }
}
