/**
 * The instant read of an inbound email, done with no AI call.
 *
 * Opening a customer email should immediately tell staff three things: who sent
 * it, what size they asked for, and what is actually in the attached file. All
 * three are available from the message itself, so none of them should wait on a
 * model round trip. AI analysis still runs afterwards to fill in product,
 * paper, and finishing, but it enriches this read instead of gating it.
 */

import { matchCustomerCandidates, normalizeCustomerEmail, type CustomerMatchCandidate } from "./customer-match";
import { emailHeaderName } from "./email-business-classifier";
import { parseRequestedSize, type ParsedRequestedSize } from "./requested-size";
import type { Customer, EmailIntakeTicket, EmailThread } from "./types";

export interface IntakeReview {
  /** Finished size read straight from the customer's own wording, if stated. */
  requestedSize?: ParsedRequestedSize;
  /** Best customer match for the sender. */
  match?: CustomerMatchCandidate;
  /** Set when the sender resolves to an existing customer record. */
  matchedCustomerId?: string;
  /** True when no record matches and staff should create the customer. */
  needsNewCustomer: boolean;
  /** Ranked alternatives for staff to confirm when the match is not exact. */
  candidates: CustomerMatchCandidate[];
  senderEmail: string;
  senderName: string;
  /** Prefilled values for a one-click "create this customer" action. */
  newCustomerDraft: { name: string; email: string; contact: string };
}

/** Most recent inbound message on the thread — the one the customer just sent. */
export function latestInboundMessage(thread?: EmailThread) {
  if (!thread) return undefined;
  return thread.messages.slice().reverse().find((message) => message.direction === "inbound");
}

/**
 * Text the customer actually wrote, newest first, capped so a long quoted
 * history cannot push the real request out of range.
 */
function requestText(ticket: EmailIntakeTicket, thread?: EmailThread) {
  const inbound = (thread?.messages ?? []).filter((message) => message.direction === "inbound").slice().reverse();
  const bodies = inbound.map((message) => stripQuotedReply(message.bodyText ?? "")).filter(Boolean);
  return {
    subject: ticket.subject || inbound[0]?.subject || "",
    body: bodies.join("\n\n").slice(0, 20_000)
  };
}

/**
 * Drop the quoted history from a reply. A size mentioned in an older quoted
 * message is often stale, and reading it as the current request is worse than
 * reading no size at all.
 */
export function stripQuotedReply(body: string) {
  if (!body) return "";
  const lines = body.split(/\r?\n/);
  const cut = lines.findIndex((line) =>
    /^\s*>/.test(line) ||
    /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line) ||
    /^\s*On .+ wrote:\s*$/i.test(line) ||
    /^\s*From:\s*.+@/i.test(line)
  );
  return (cut >= 0 ? lines.slice(0, cut) : lines).join("\n").trim();
}

/**
 * Read an inbound email into the facts staff needs before touching anything.
 */
export function reviewIntake(
  ticket: EmailIntakeTicket,
  thread: EmailThread | undefined,
  customers: Customer[]
): IntakeReview {
  const inbound = latestInboundMessage(thread);
  const senderHeader = inbound?.from ?? "";
  const senderEmail = normalizeCustomerEmail(senderHeader);
  const senderName = emailHeaderName(senderHeader);

  const { subject, body } = requestText(ticket, thread);
  // Subject first: customers name the product and size there far more reliably
  // than in a long body, and a body may quote an older, different size.
  const requestedSize = parseRequestedSize(subject, body);

  const candidates = matchCustomerCandidates(customers, {
    email: senderHeader,
    company: ticket.productCategory ? undefined : ticket.customerName,
    name: senderName
  });

  // Only an exact address match links a ticket on its own. A domain or
  // name-similarity hit is offered for confirmation instead, so two unrelated
  // people are never merged into one customer record.
  const automatic = candidates.find((item) => item.kind === "exact_email" || item.kind === "contact_email");
  const linked = ticket.customerId
    ? customers.find((customer) => customer.id === ticket.customerId)
    : undefined;
  const matchedCustomerId = linked?.id ?? automatic?.customerId;

  return {
    requestedSize,
    match: automatic ?? candidates[0],
    matchedCustomerId,
    needsNewCustomer: !matchedCustomerId && Boolean(senderEmail),
    candidates,
    senderEmail,
    senderName,
    newCustomerDraft: {
      // A display name is a better company label than a mailbox-derived string.
      name: senderName || senderEmail,
      email: senderEmail,
      contact: senderName || senderEmail
    }
  };
}
