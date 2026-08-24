import { NextRequest } from "next/server";
import { allowPublicQuoteSubmission } from "@/lib/public-intake-security";
import { matchCustomerCandidates } from "@/lib/customer-match";
import { customers as demoCustomers } from "@/lib/demo-data";
import type { Customer } from "@/lib/types";
import { calculatePublicEstimate, formatMoney, parsePublicQuoteSpec } from "@/lib/public-pricing-server";
import { noStoreJson, rejectCrossSiteMutation, rejectOversizedJson, serviceFetch, validateStaffRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type QuoteBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  company?: unknown;
  product?: unknown;
  quantity?: unknown;
  size?: unknown;
  sides?: unknown;
  colorSpec?: unknown;
  paper?: unknown;
  paperWeight?: unknown;
  coating?: unknown;
  bleed?: unknown;
  deliveryMethod?: unknown;
  finishing?: unknown;
  turnaround?: unknown;
  notes?: unknown;
  website?: unknown;
};

type StoredQuote = { id: string; request_number: number };
const DEMO_MODE = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";

async function loadCustomerRecords(): Promise<Customer[]> {
  if (DEMO_MODE) return demoCustomers;
  const response = await serviceFetch("/rest/v1/mis_records?workspace_id=eq.gross-printing&deleted_at=is.null&collection=eq.customers&select=record,sort_order&order=sort_order.asc");
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<{ record?: Customer }>;
  return rows.map((row) => row.record).filter((item): item is Customer => Boolean(item?.id));
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function line(label: string, value: string | undefined | null) {
  return value ? `${label.padEnd(16)} ${value}` : null;
}

async function saveQuoteRequest(record: Record<string, unknown>) {
  const response = await serviceFetch("/rest/v1/public_quote_requests?select=id,request_number", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(record)
  });
  if (!response.ok) return undefined;
  const rows = (await response.json()) as StoredQuote[];
  return rows[0];
}

async function updateQuoteRequest(id: string, patch: Record<string, unknown>) {
  await serviceFetch(`/rest/v1/public_quote_requests?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 50_000);
  if (oversized) return oversized;

  try {
    const body = (await request.json()) as QuoteBody;

    // Honeypot: real users never see/fill this field. Quietly discard obvious bot submissions.
    if (clean(body.website, 200)) {
      return noStoreJson({ ok: true, message: "Quote request received." });
    }

    const name = clean(body.name, 120);
    const email = clean(body.email, 180).toLowerCase();
    const phone = clean(body.phone, 40);
    const company = clean(body.company, 120);
    const notes = clean(body.notes, 2000);

    if (!name || name.length < 2) return noStoreJson({ error: "Please enter your name." }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return noStoreJson({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const parsed = parsePublicQuoteSpec(body);
    if (!parsed.spec) return noStoreJson({ error: parsed.error ?? "Please check the project details." }, { status: 400 });

    const rate = await allowPublicQuoteSubmission(request);
    if (rate.setupError) {
      return noStoreJson(
        { error: "Website quote intake is not configured yet. Run the v0.6.7.1 public quote Supabase migration before accepting public quotes." },
        { status: 503 }
      );
    }
    if (!rate.ok) {
      return noStoreJson({ error: "Too many quote requests were submitted from this device. Please wait and try again." }, { status: 429 });
    }

    const customerRecords = await loadCustomerRecords();
    const customerMatches = matchCustomerCandidates(customerRecords, { email, company, name });
    const automaticCustomer = customerMatches.find((candidate) => candidate.kind === "exact_email" || candidate.kind === "contact_email");

    // IMPORTANT: calculate on the server. Browser-supplied totals are ignored completely.
    const estimate = calculatePublicEstimate(parsed.spec);
    const stored = await saveQuoteRequest({
      status: "new",
      source: "public-website",
      name,
      email,
      phone: phone || null,
      company: company || null,
      product: parsed.spec.product,
      quantity: parsed.spec.quantity,
      size: parsed.spec.size || null,
      sides: parsed.spec.sides,
      color_spec: parsed.spec.colorSpec || null,
      paper: parsed.spec.paper,
      paper_weight: parsed.spec.paperWeight || null,
      coating: parsed.spec.coating || null,
      bleed: parsed.spec.bleed,
      delivery_method: parsed.spec.deliveryMethod || null,
      finishing: parsed.spec.finishing || null,
      customer_match: customerMatches,
      linked_customer_id: automaticCustomer?.customerId || null,
      turnaround: parsed.spec.turnaround,
      notes: notes || null,
      estimated_total: estimate.total,
      estimated_per_unit: estimate.perUnit,
      estimate_confidence: estimate.confidence,
      estimate_breakdown: estimate.breakdown,
      estimate_note: estimate.note
    });

    if (!stored) {
      return noStoreJson(
        { error: "We could not safely save your request. Please email jobs@grossprinting.com instead." },
        { status: 503 }
      );
    }

    const requestLabel = `QR-${String(stored.request_number).padStart(5, "0")}`;
    const submittedAt = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "full",
      timeStyle: "short"
    });
    const sidesLabel = parsed.spec.sides === 1 ? "1-sided" : "2-sided";

    const staffBody = [
      "════════════════════════════════════════",
      `  WEBSITE QUOTE REQUEST  ${requestLabel}`,
      "════════════════════════════════════════",
      "",
      "▶ CUSTOMER",
      "────────────────────────────────────────",
      line("Name", name),
      line("Email", email),
      phone ? line("Phone", phone) : null,
      company ? line("Company", company) : null,
      "",
      "▶ CUSTOMER MATCH",
      "────────────────────────────────────────",
      automaticCustomer
        ? `  LINKED: ${automaticCustomer.customerName}${automaticCustomer.matchedContact ? ` / ${automaticCustomer.matchedContact}` : ""} — ${automaticCustomer.reason}`
        : customerMatches.length
          ? ["  POSSIBLE MATCH — STAFF CONFIRMATION REQUIRED", ...customerMatches.slice(0, 3).map((candidate) => `    • ${candidate.customerName} (${Math.round(candidate.score * 100)}%) — ${candidate.reason}`)].join("\n")
          : "  No existing customer match found.",
      "",
      "▶ PROJECT",
      "────────────────────────────────────────",
      line("Product", parsed.spec.product),
      line("Quantity", String(parsed.spec.quantity)),
      parsed.spec.size ? line("Size", parsed.spec.size) : null,
      line("Sides", sidesLabel),
      line("Printing", parsed.spec.colorSpec),
      line("Paper", parsed.spec.paper),
      parsed.spec.paperWeight ? line("Paper weight", parsed.spec.paperWeight) : null,
      parsed.spec.coating ? line("Coating", parsed.spec.coating) : null,
      line("Bleed", parsed.spec.bleed ? "Yes" : "No / not specified"),
      line("Delivery", parsed.spec.deliveryMethod),
      parsed.spec.finishing ? line("Finishing", parsed.spec.finishing) : null,
      line("Needed by", parsed.spec.turnaround),
      "",
      "▶ INTERNAL PRICING REVIEW",
      "────────────────────────────────────────",
      estimate.confidence === "request"
        ? "  STAFF REVIEW REQUIRED — no automatic customer price was generated."
        : `  INTERNAL AID:     ${formatMoney(estimate.total)} (${estimate.confidence.toUpperCase()})`,
      estimate.confidence !== "request" ? `  INTERNAL / PIECE: ${formatMoney(estimate.perUnit)}` : null,
      estimate.breakdown.length ? ["", "  Internal notes:", ...estimate.breakdown.map((item) => `    • ${item}`)].join("\n") : null,
      estimate.note ? `\n  Pricing note: ${estimate.note}` : null,
      notes ? ["", "▶ CUSTOMER NOTES", "────────────────────────────────────────", notes].join("\n") : null,
      "",
      "▶ NEXT STEPS",
      "────────────────────────────────────────",
      `  1. Open MIS → Portal Requests → Public website quotes (${requestLabel})`,
      "  2. Confirm customer match (or create/link customer)",
      "  3. Review internal estimate and set approved selling price",
      `  4. Reply to customer: ${email}`,
      "  5. Ask for print-ready files if not already received",
      "  6. Convert to quote/job when approved",
      "  Tip: Gmail order emails are handled in Email Center (Sync → ticket → convert).",
      "",
      "────────────────────────────────────────",
      `Submitted:  ${submittedAt}`,
      `Saved as:   ${requestLabel}`,
      "Source:     Public website /quote",
      "════════════════════════════════════════"
    ].filter((value) => value != null).join("\n");

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
    const customerBody = [
      `Hi ${name.split(" ")[0] || name},`,
      "",
      "Thank you for requesting a quote from Gross Printing.",
      `We received your request (${requestLabel}) and will confirm pricing and timing by email.`,
      "",
      "Here is a copy of what you submitted:",
      "",
      "────────────────────────────────────────",
      `Product:     ${parsed.spec.product}`,
      `Quantity:    ${parsed.spec.quantity}`,
      parsed.spec.size ? `Size:        ${parsed.spec.size}` : null,
      `Sides:       ${sidesLabel}`,
      `Printing:    ${parsed.spec.colorSpec}`,
      `Paper:       ${parsed.spec.paper}`,
      parsed.spec.paperWeight ? `Weight:      ${parsed.spec.paperWeight}` : null,
      parsed.spec.coating ? `Coating:     ${parsed.spec.coating}` : null,
      `Bleed:       ${parsed.spec.bleed ? "Yes" : "No / not specified"}`,
      `Delivery:    ${parsed.spec.deliveryMethod}`,
      parsed.spec.finishing ? `Finishing:   ${parsed.spec.finishing}` : null,
      `Needed by:   ${parsed.spec.turnaround}`,
      "────────────────────────────────────────",
      notes ? `\nYour notes:\n${notes}\n` : null,
      "",
      "Gross Printing will review the project and confirm exact pricing, timing, stock availability, and file requirements.",
      "",
      "Questions? Reply to this email or write to jobs@grossprinting.com.",
      "",
      "— Gross Printing",
      siteUrl || null
    ].filter((value) => value != null).join("\n");

    let staffEmailSentAt: string | null = null;
    let customerEmailSentAt: string | null = null;
    let emailError: string | null = null;

    try {
      const { emailServerConfigured, sendGmailMessage } = await import("@/lib/gmail-server");
      if (emailServerConfigured()) {
        const mailbox = process.env.GROSS_PRINTING_MAILBOX || "jobs@grossprinting.com";
        await sendGmailMessage({
          to: mailbox,
          subject: `${requestLabel} — Website Quote — ${parsed.spec.product} × ${parsed.spec.quantity} — ${name}${estimate.confidence === "request" ? " — STAFF REVIEW" : ` — internal ${formatMoney(estimate.total)}`}`,
          body: staffBody
        });
        staffEmailSentAt = new Date().toISOString();
        try {
          const customerDelivery = await sendGmailMessage({
            to: email,
            subject: `${requestLabel} — We received your Gross Printing quote request`,
            body: customerBody
          });
          if (customerDelivery.blocked) {
            emailError = `Customer confirmation blocked by ${customerDelivery.safetyMode} email safety mode.`;
          } else if (customerDelivery.redirected) {
            emailError = "Customer confirmation redirected to the configured test inbox; the customer was not contacted.";
          } else {
            customerEmailSentAt = new Date().toISOString();
          }
        } catch {
          emailError = "Customer confirmation email failed.";
        }
      } else {
        emailError = "Email server is not configured.";
      }
    } catch {
      emailError = "Quote request was saved, but email delivery failed.";
    }

    await updateQuoteRequest(stored.id, {
      staff_email_sent_at: staffEmailSentAt,
      customer_email_sent_at: customerEmailSentAt,
      email_error: emailError,
      status: staffEmailSentAt ? "emailed" : "new"
    });

    // Deliberately avoid logging customer names, email addresses, phone numbers, notes, or prices.
    console.info("[public-quote]", {
      requestId: stored.id,
      requestNumber: stored.request_number,
      staffEmailSent: Boolean(staffEmailSentAt),
      customerEmailSent: Boolean(customerEmailSentAt),
      at: new Date().toISOString()
    });

    return noStoreJson({
      ok: true,
      requestNumber: requestLabel,
      message: `Quote request ${requestLabel} was saved successfully. Gross Printing will confirm it by email.`,
      staffEmailSent: Boolean(staffEmailSentAt),
      customerConfirmationSent: Boolean(customerEmailSentAt)
    });
  } catch {
    return noStoreJson({ error: "Unable to process the quote request right now." }, { status: 500 });
  }
}


export async function GET(request: NextRequest) {
  const staff = await validateStaffRequest(request, ["admin", "front_desk"]);
  if (staff instanceof Response) return staff;
  const response = await serviceFetch("/rest/v1/public_quote_requests?select=id,request_number,status,submitted_at,name,email,phone,company,product,quantity,size,sides,color_spec,paper,paper_weight,coating,bleed,delivery_method,finishing,turnaround,notes,estimated_total,estimated_per_unit,estimate_confidence,estimate_breakdown,estimate_note,customer_match,linked_customer_id,approved_selling_price,staff_reviewed_at,staff_reviewed_by&order=submitted_at.desc&limit=100");
  if (!response.ok) return noStoreJson({ error: "Unable to load public website quote requests. Run the v0.6.7.4 migration." }, { status: 503 });
  return noStoreJson({ requests: await response.json() });
}

export async function PATCH(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 20_000);
  if (oversized) return oversized;
  const staff = await validateStaffRequest(request, ["admin", "front_desk"]);
  if (staff instanceof Response) return staff;
  const body = (await request.json().catch(() => ({}))) as { id?: string; action?: "update" | "handoff"; status?: string; linkedCustomerId?: string | null; approvedSellingPrice?: number | null };
  if (!body.id) return noStoreJson({ error: "Quote request id is required." }, { status: 400 });

  if (body.action === "handoff") {
    const sourceResponse = await serviceFetch(`/rest/v1/public_quote_requests?id=eq.${encodeURIComponent(body.id)}&select=*&limit=1`);
    if (!sourceResponse.ok) return noStoreJson({ error: "Unable to read this website quote request." }, { status: 500 });
    const sourceRows = (await sourceResponse.json()) as Array<Record<string, unknown>>;
    const source = sourceRows[0];
    if (!source) return noStoreJson({ error: "Website quote request not found." }, { status: 404 });
    const customerId = typeof body.linkedCustomerId === "string" && body.linkedCustomerId ? body.linkedCustomerId : typeof source.linked_customer_id === "string" ? source.linked_customer_id : "";
    if (!customerId) return noStoreJson({ error: "Choose the correct customer before sending this request to Portal Requests." }, { status: 400 });
    const productMap: Record<string, string> = { "Business Cards": "Business Cards", "Flyers / Brochures": "Flyers / Brochures", "Booklets / Books": "Booklets", "Signs / Banners": "Signs / Banners", "Labels / Stickers": "Labels / Stickers", Envelopes: "Envelopes", Invitations: "Invitations", Copies: "Copies", "Tea Party Cards": "Tea Party Cards", "Receipt Books": "Receipt Books", Stamps: "Stamps", "Simcha Bags": "Simcha Bags", Posters: "Posters", "Plans / Blueprints": "Plans / Blueprints", Other: "Other" };
    const sizeText = typeof source.size === "string" ? source.size : "";
    const sizeMatch = sizeText.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    const metadata = {
      requestPurpose: "quote",
      productType: productMap[String(source.product ?? "")] ?? "Other",
      quantity: Number(source.quantity) || undefined,
      finishedWidth: sizeMatch ? Number(sizeMatch[1]) : undefined,
      finishedHeight: sizeMatch ? Number(sizeMatch[2]) : undefined,
      sides: Number(source.sides) === 1 ? 1 : 2,
      colorSpec: source.color_spec || undefined,
      paperPreference: source.paper || undefined,
      paperWeight: source.paper_weight || undefined,
      coating: source.coating || undefined,
      bleed: source.bleed === true,
      deliveryMethod: source.delivery_method || undefined,
      finishing: typeof source.finishing === "string" ? source.finishing.split(",").map((item) => item.trim()).filter(Boolean) : [],
      approvedSellingPrice: typeof source.approved_selling_price === "number" ? source.approved_selling_price : undefined,
      customerMatchNote: `Public website request QR-${String(source.request_number ?? "")}`,
      sourcePublicQuoteId: body.id,
      sourceContactName: source.name,
      sourceContactEmail: source.email,
      sourceCompany: source.company
    };
    const insertResponse = await serviceFetch("/rest/v1/customer_portal_requests?select=id,request_number,status,customer_id,title,metadata,created_at,updated_at", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ customer_id: customerId, user_id: null, request_type: "new_order", status: "AI Reviewed", title: `${source.quantity ?? ""} ${source.product ?? "Print request"}`.trim(), note: source.notes || "Public website quote request", metadata })
    });
    if (!insertResponse.ok) return noStoreJson({ error: "Unable to move this website request into Portal Requests." }, { status: 500 });
    const portalRows = await insertResponse.json();
    await serviceFetch(`/rest/v1/public_quote_requests?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "quoted", linked_customer_id: customerId, staff_reviewed_at: new Date().toISOString(), staff_reviewed_by: staff.profile.display_name || staff.profile.email || staff.user.email, updated_at: new Date().toISOString() }) });
    return noStoreJson({ portalRequest: Array.isArray(portalRows) ? portalRows[0] : portalRows });
  }

  const allowedStatuses = new Set(["new", "emailed", "reviewing", "quoted", "closed", "spam"]);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), staff_reviewed_at: new Date().toISOString(), staff_reviewed_by: staff.profile.display_name || staff.profile.email || staff.user.email };
  if (body.status && allowedStatuses.has(body.status)) patch.status = body.status;
  if (body.linkedCustomerId !== undefined) patch.linked_customer_id = body.linkedCustomerId || null;
  if (body.approvedSellingPrice !== undefined) {
    const price = Number(body.approvedSellingPrice);
    patch.approved_selling_price = Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null;
  }
  const response = await serviceFetch(`/rest/v1/public_quote_requests?id=eq.${encodeURIComponent(body.id)}&select=id,request_number,status,linked_customer_id,approved_selling_price,staff_reviewed_at,staff_reviewed_by`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
  if (!response.ok) return noStoreJson({ error: "Unable to update website quote request." }, { status: 500 });
  const rows = await response.json();
  return noStoreJson({ request: Array.isArray(rows) ? rows[0] : rows });
}
