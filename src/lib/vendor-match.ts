/**
 * Connecting supplier mail to the supplier it came from.
 *
 * The mailbox already sorts vendor quotes, bills and orders into their own
 * views, but until now had nowhere to file them: a bill from Mid-State Paper
 * was recognised as a bill and still connected to nothing. This matches it to a
 * vendor record the way `customer-match` matches customer mail to a customer.
 *
 * The rules are deliberately different from the customer ones in one respect.
 * Customer matching treats a shared domain as weak evidence, because two people
 * at gmail.com are unrelated. Suppliers almost never write from a free mailbox —
 * they write from their own company domain — so a private domain match is
 * strong evidence for a vendor where it is only a hint for a customer.
 */

import { normalizeCustomerEmail, isSharedPublicEmailDomain } from "./customer-match";
import type { Vendor } from "./types";

export type VendorMatchKind = "exact_email" | "contact_email" | "company_domain" | "company_name";

export interface VendorMatchCandidate {
  vendorId: string;
  vendorName: string;
  kind: VendorMatchKind;
  score: number;
  reason: string;
}

function domainOf(email?: string) {
  const value = normalizeCustomerEmail(email);
  const at = value.lastIndexOf("@");
  return at >= 0 ? value.slice(at + 1) : "";
}

function normalize(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

/** Words that say nothing about which company this is. */
const NOISE = new Set(["inc", "llc", "corp", "corporation", "company", "co", "the", "and", "supply", "supplies"]);

function words(value?: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !NOISE.has(word));
}

function nameScore(a?: string, b?: string) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;
  const aWords = words(a);
  const bWords = new Set(words(b));
  if (!aWords.length || !bWords.size) return 0;
  return aWords.filter((word) => bWords.has(word)).length / Math.max(aWords.length, bWords.size);
}

/**
 * Rank vendors that might have sent this message, best first.
 */
export function matchVendorCandidates(
  vendors: Vendor[],
  input: { email?: string; name?: string }
): VendorMatchCandidate[] {
  const targetEmail = normalizeCustomerEmail(input.email);
  const targetDomain = domainOf(input.email);
  const candidates: VendorMatchCandidate[] = [];

  for (const vendor of vendors.filter((item) => !item.archived && !item.deletedAt)) {
    if (targetEmail && normalizeCustomerEmail(vendor.email) === targetEmail) {
      candidates.push({
        vendorId: vendor.id, vendorName: vendor.name, kind: "exact_email", score: 1,
        reason: "Exact vendor email match"
      });
      continue;
    }

    if (targetEmail && (vendor.contacts ?? []).some((contact) => normalizeCustomerEmail(contact.email) === targetEmail)) {
      candidates.push({
        vendorId: vendor.id, vendorName: vendor.name, kind: "contact_email", score: 0.98,
        reason: "Exact match on another contact at this vendor"
      });
      continue;
    }

    // A supplier's own domain is strong evidence. Their sales desk, their
    // accounts department and their order confirmations all write from it, and
    // each uses a different mailbox.
    const vendorDomains = new Set(
      [domainOf(vendor.email), ...(vendor.contacts ?? []).map((contact) => domainOf(contact.email))]
        .filter((value) => value && !isSharedPublicEmailDomain(value))
    );
    if (targetDomain && !isSharedPublicEmailDomain(targetDomain) && vendorDomains.has(targetDomain)) {
      candidates.push({
        vendorId: vendor.id, vendorName: vendor.name, kind: "company_domain", score: 0.94,
        reason: `Sent from ${targetDomain}, this vendor's own domain`
      });
      continue;
    }

    const byName = nameScore(input.name, vendor.name);
    if (byName >= 0.6) {
      candidates.push({
        vendorId: vendor.id, vendorName: vendor.name, kind: "company_name", score: Math.min(0.8, byName),
        reason: "Sender name looks like this vendor; confirm before filing."
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function bestVendorMatch(vendors: Vendor[], input: { email?: string; name?: string }) {
  return matchVendorCandidates(vendors, input)[0];
}

/** Email categories that should be filed against a vendor rather than a customer. */
export const VENDOR_EMAIL_CATEGORIES = ["vendor_quote", "vendor_bill", "vendor_order"] as const;

export function isVendorEmailCategory(category?: string) {
  return VENDOR_EMAIL_CATEGORIES.includes(category as (typeof VENDOR_EMAIL_CATEGORIES)[number]);
}

/** Checks a vendor record before it is saved. Mirrors the customer rules. */
export function validateVendor(
  draft: { name?: string; email?: string },
  vendors: Vendor[],
  existingId?: string
) {
  const issues: Array<{ field?: string; level: "error" | "warning"; message: string; vendorId?: string }> = [];
  const name = (draft.name ?? "").trim();
  const email = (draft.email ?? "").trim();

  if (!name) issues.push({ field: "name", level: "error", message: "A vendor needs a name." });

  const others = vendors.filter((vendor) => vendor.id !== existingId && !vendor.deletedAt);
  if (name && others.some((vendor) => normalize(vendor.name) === normalize(name))) {
    issues.push({ field: "name", level: "error", message: `${name} is already in the vendor list.` });
  }

  if (email) {
    const clash = others.find((vendor) => normalizeCustomerEmail(vendor.email) === normalizeCustomerEmail(email));
    if (clash) {
      issues.push({
        field: "email", level: "error", vendorId: clash.id,
        message: `${clash.name} already uses this email address. Their mail could not be told apart.`
      });
    }
  } else {
    issues.push({
      field: "email", level: "warning",
      message: "No email address, so bills and quotes from this vendor will not match them automatically."
    });
  }

  return { issues, canSave: !issues.some((issue) => issue.level === "error") };
}
