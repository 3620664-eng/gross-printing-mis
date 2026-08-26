/**
 * Checks a customer record has to pass before it is created or saved.
 *
 * Three screens create customers — the Customers screen, Job Setup, and the
 * email ticket path — and each grew its own form with `name.trim()` as the only
 * rule. That is why the same shop can end up with two "Camp Ahava" records and
 * with addresses the mail server will later refuse. The rules live here so all
 * three ask the same questions.
 *
 * Duplicate detection reuses `matchCustomerCandidates`, which already does this
 * work for inbound email: it knows that two people at gmail.com are unrelated
 * while two people at one company domain probably are not.
 */

import { matchCustomerCandidates, normalizeCustomerEmail, type CustomerMatchCandidate } from "./customer-match";
import type { Customer } from "./types";

/** Payment terms the pricing and invoicing code understands. */
export const CUSTOMER_TERMS = ["Due on receipt", "COD", "Net 15", "Net 30", "Net 60"] as const;

export type CustomerTerms = (typeof CUSTOMER_TERMS)[number];

export interface CustomerDraft {
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  companyType?: string;
  terms?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export type ValidationLevel = "error" | "warning";

export interface ValidationIssue {
  /** Which field to point at, or undefined for a record-level problem. */
  field?: keyof CustomerDraft;
  level: ValidationLevel;
  message: string;
  /** An existing record this issue refers to, for "open it instead". */
  customerId?: string;
}

export interface CustomerValidation {
  issues: ValidationIssue[];
  /** True when nothing blocks saving. Warnings do not block. */
  canSave: boolean;
  /** The strongest duplicate match found, if any. */
  duplicate?: CustomerMatchCandidate;
}

/**
 * Deliberately permissive: this rejects addresses that cannot be delivered to,
 * not addresses that look unusual. Real customers have apostrophes, plus signs,
 * and long new domains, and a shop should not be arguing with its own software
 * about whether a paying customer's address is fashionable.
 */
export function isDeliverableEmail(value: string) {
  const email = normalizeCustomerEmail(value);
  if (!email || email.length > 254) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || /\s/.test(email)) return false;
  // A domain needs at least one dot and a plausible final label.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain);
}

/**
 * Validate a customer about to be created or saved.
 *
 * `existingId` excludes the record being edited from duplicate checks, so
 * saving a customer does not report it as a duplicate of itself.
 */
export function validateCustomer(
  draft: CustomerDraft,
  customers: Customer[],
  existingId?: string
): CustomerValidation {
  const issues: ValidationIssue[] = [];

  const name = (draft.name ?? "").trim();
  if (!name) {
    issues.push({ field: "name", level: "error", message: "A customer needs a name." });
  } else if (name.length < 2) {
    issues.push({ field: "name", level: "error", message: "That name is too short to find later." });
  }

  const email = (draft.email ?? "").trim();
  if (email && !isDeliverableEmail(email)) {
    issues.push({
      field: "email",
      level: "error",
      message: "That email address will not deliver. Check it before saving."
    });
  }
  if (!email) {
    // Not an error: plenty of walk-in customers have no email on file. But
    // without one, nothing this customer sends can be matched automatically.
    issues.push({
      field: "email",
      level: "warning",
      message: "No email address. Mail from this customer will not match them automatically."
    });
  }

  if (draft.terms && !CUSTOMER_TERMS.includes(draft.terms as CustomerTerms)) {
    issues.push({
      field: "terms",
      level: "error",
      message: `Terms must be one of: ${CUSTOMER_TERMS.join(", ")}.`
    });
  }

  const others = customers.filter((customer) => customer.id !== existingId && !customer.deletedAt);
  const candidates = matchCustomerCandidates(others, { email, company: name, name });
  const duplicate = candidates[0];

  if (duplicate) {
    const exact = duplicate.kind === "exact_email" || duplicate.kind === "contact_email";
    issues.push({
      // An exact address match is the one case worth blocking: two records
      // sharing an address means email can never be routed reliably again.
      level: exact ? "error" : "warning",
      field: exact ? "email" : "name",
      customerId: duplicate.customerId,
      message: exact
        ? `${duplicate.customerName} already uses this email address. Open that customer instead of creating a second one.`
        : `This looks like ${duplicate.customerName}. ${duplicate.reason} Check before creating a second record.`
    });
  }

  return {
    issues,
    canSave: !issues.some((issue) => issue.level === "error"),
    duplicate
  };
}

/** The values a brand-new customer starts with. */
export function emptyCustomerDraft(overrides: Partial<CustomerDraft> = {}): CustomerDraft {
  return {
    name: "",
    contact: "",
    email: "",
    phone: "",
    companyType: "Commercial",
    terms: "Due on receipt",
    address: "",
    city: "",
    state: "",
    zip: "",
    ...overrides
  };
}

/**
 * Turn a validated draft into the record shape the app stores.
 *
 * `totalSpend` starts at zero and is never taken from a form: it is the sum of
 * what a customer has been invoiced, and typing over it would make the figure a
 * claim rather than a fact.
 */
export function draftToCustomer(draft: CustomerDraft): Omit<Customer, "id"> {
  return {
    name: draft.name.trim(),
    contact: (draft.contact ?? "").trim(),
    email: normalizeCustomerEmail(draft.email ?? ""),
    phone: (draft.phone ?? "").trim(),
    companyType: (draft.companyType ?? "Commercial").trim(),
    terms: (draft.terms ?? "Due on receipt").trim(),
    address: (draft.address ?? "").trim() || undefined,
    city: (draft.city ?? "").trim() || undefined,
    state: (draft.state ?? "").trim() || undefined,
    zip: (draft.zip ?? "").trim() || undefined,
    lastOrder: "",
    totalSpend: 0
  };
}
