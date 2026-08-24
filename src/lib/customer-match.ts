import type { Customer } from "./types";

export type CustomerMatchKind = "exact_email" | "contact_email" | "company_domain" | "company_name" | "unmatched";

export interface CustomerMatchCandidate {
  customerId: string;
  customerName: string;
  kind: CustomerMatchKind;
  score: number;
  reason: string;
  matchedContact?: string;
}

const INTERNAL_EMAIL_DOMAINS = new Set([
  "grossprinting.com"
]);

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
]);

function normalize(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeCustomerEmail(value?: string) {
  const raw = (value ?? "").trim();
  const bracket = raw.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  if (bracket?.[1]) return bracket[1].trim().toLowerCase();
  const direct = raw.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  return (direct ?? raw).trim().replace(/^mailto:/i, "").toLowerCase();
}

function domain(email?: string) {
  const value = normalizeCustomerEmail(email);
  const at = value.lastIndexOf("@");
  return at >= 0 ? value.slice(at + 1) : "";
}

export function isInternalGrossPrintingEmail(value?: string) {
  const emailDomain = domain(value);
  return Boolean(emailDomain && INTERNAL_EMAIL_DOMAINS.has(emailDomain));
}

export function isSharedPublicEmailDomain(value?: string) {
  const emailDomain = value?.includes("@") ? domain(value) : normalize(value);
  return Boolean(emailDomain && PUBLIC_EMAIL_DOMAINS.has(emailDomain));
}

function words(value?: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((item) => item.length > 2 && !["inc", "llc", "corp", "company", "co", "the"].includes(item));
}

function companyScore(a?: string, b?: string) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.88;
  const aWords = words(a);
  const bWords = new Set(words(b));
  if (!aWords.length || !bWords.size) return 0;
  const overlap = aWords.filter((item) => bWords.has(item)).length;
  return overlap / Math.max(aWords.length, bWords.size);
}

export function matchCustomerCandidates(customers: Customer[], input: { email?: string; company?: string; name?: string }) {
  const targetEmail = normalizeCustomerEmail(input.email);
  const targetDomain = domain(input.email);
  const candidates: CustomerMatchCandidate[] = [];

  // Gross Printing's own mailbox is an internal participant, never a customer.
  // This prevents jobs@grossprinting.com or another staff mailbox from being
  // selected merely because it appears in To/Cc/participants on a thread.
  if (isInternalGrossPrintingEmail(targetEmail)) return candidates;

  for (const customer of customers.filter((item) => !item.archived && !item.deletedAt)) {
    // Never treat an accidentally-imported Gross Printing record as a customer
    // candidate for mailbox intake.
    if (isInternalGrossPrintingEmail(customer.email) ||
        (customer.contacts ?? []).some((contact) => isInternalGrossPrintingEmail(contact.email))) {
      continue;
    }

    if (targetEmail && normalizeCustomerEmail(customer.email) === targetEmail) {
      candidates.push({ customerId: customer.id, customerName: customer.name, kind: "exact_email", score: 1, reason: "Exact customer email match", matchedContact: customer.contact });
      continue;
    }
    const contact = customer.contacts?.find((item) => targetEmail && normalizeCustomerEmail(item.email) === targetEmail);
    if (contact) {
      candidates.push({ customerId: customer.id, customerName: customer.name, kind: "contact_email", score: 0.99, reason: "Exact email matches another contact at this customer", matchedContact: contact.name });
      continue;
    }

    // Shared providers (Gmail/Yahoo/Outlook/etc.) are used by unrelated people.
    // A domain match is only meaningful for a private company/organization domain.
    const customerDomains = new Set(
      [domain(customer.email), ...(customer.contacts ?? []).map((item) => domain(item.email))]
        .filter((item) => item && !INTERNAL_EMAIL_DOMAINS.has(item) && !PUBLIC_EMAIL_DOMAINS.has(item))
    );
    if (targetDomain && !PUBLIC_EMAIL_DOMAINS.has(targetDomain) && !INTERNAL_EMAIL_DOMAINS.has(targetDomain) && customerDomains.has(targetDomain)) {
      candidates.push({ customerId: customer.id, customerName: customer.name, kind: "company_domain", score: 0.9, reason: `Private company email domain matches ${targetDomain}; this may be another employee of the same business.` });
      continue;
    }
    const companyMatch = Math.max(companyScore(input.company, customer.name), companyScore(input.name, customer.name));
    if (companyMatch >= 0.6) {
      candidates.push({ customerId: customer.id, customerName: customer.name, kind: "company_name", score: Math.min(0.85, companyMatch), reason: "Business/customer name looks similar; staff confirmation is required." });
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function bestCustomerMatch(customers: Customer[], input: { email?: string; company?: string; name?: string }) {
  return matchCustomerCandidates(customers, input)[0];
}
