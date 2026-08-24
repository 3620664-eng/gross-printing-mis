import type {
  EmailBusinessCategory,
  EmailBusinessPartyType,
  EmailBusinessRule,
  EmailMessage,
  EmailThread
} from "@/lib/types";

export type EmailBusinessClassification = {
  category: EmailBusinessCategory;
  confidence: number;
  reason: string;
  source: "staff" | "rule";
  partyType: EmailBusinessPartyType;
  partyName?: string;
  matchKind?: "staff_override" | "exact_email" | "company_domain" | "known_vendor" | "conversation" | "content" | "none";
};

const KNOWN_VENDOR_DOMAINS = new Map<string, string>([
  ["4over.com", "4over"],
  ["printdatasource.com", "Print Data Source"],
  ["notification.intuit.com", "QuickBooks / Intuit"],
  ["intuit.com", "QuickBooks / Intuit"],
  ["quickbooks.com", "QuickBooks"]
]);

const INTERNAL_EMAIL_DOMAINS = new Set(["grossprinting.com"]);

// A staff choice for one Gmail/Yahoo/etc. address must NEVER teach the MIS that
// every user of that public provider is the same customer/vendor.
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net", "mail.com", "zoho.com"
]);

export function emailHeaderAddress(value = "") {
  const bracket = value.match(/<([^>]+)>/);
  return (bracket?.[1] ?? value).trim().toLowerCase();
}

export function emailHeaderName(value = "") {
  const bracket = value.match(/^\s*([^<]+?)\s*<[^>]+>\s*$/);
  const name = bracket?.[1]?.replace(/^["']|["']$/g, "").trim();
  if (name) return name;
  const address = emailHeaderAddress(value);
  return address.includes("@") ? address.split("@")[0] : value.trim();
}

export function emailDomain(value = "") {
  const address = emailHeaderAddress(value);
  return address.includes("@") ? address.split("@").at(-1) ?? "" : "";
}

export function isInternalEmailDomain(domain = "") {
  return INTERNAL_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

export function isInternalGrossPrintingEmail(value = "") {
  return isInternalEmailDomain(emailDomain(value));
}

export function isPublicEmailDomain(domain = "") {
  return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

export function safeBusinessRules(rules: EmailBusinessRule[]) {
  return rules.filter((rule) => !(rule.matchType === "domain" && (isPublicEmailDomain(rule.matchValue) || isInternalEmailDomain(rule.matchValue))));
}

function matchingBusinessRule(message: EmailMessage, rules: EmailBusinessRule[]) {
  const address = emailHeaderAddress(message.from);
  const domain = emailDomain(message.from);
  return safeBusinessRules(rules)
    .filter((rule) => {
      const match = rule.matchValue.trim().toLowerCase();
      return rule.matchType === "email" ? match === address : match === domain;
    })
    .sort((a, b) => (a.matchType === "email" ? -1 : 1) - (b.matchType === "email" ? -1 : 1))[0];
}

function categoryFromVendorContent(subject: string, body: string): Pick<EmailBusinessClassification, "category" | "confidence" | "reason"> | undefined {
  const text = `${subject}\n${body}`.toLowerCase();
  if (/(fyi\s+preview|proof\s+(?:available|ready|approval)|approve\s+(?:the\s+)?proof|proofing|soft proof|digital proof)/i.test(text)) {
    return { category: "proof", confidence: 0.97, reason: "The message is a vendor proof/preview or proof-approval notice." };
  }
  if (/(shipment|shipped|tracking|track(?:ing)?\s+(?:number|#)|out for delivery|delivery update|ups\b|fedex\b|usps\b)/i.test(text)) {
    return { category: "shipping", confidence: 0.95, reason: "The message contains shipment or tracking language." };
  }
  if (/(order confirmation|order\s+#|order number|your order has been received|production order|purchase order|po\s*#)/i.test(text)) {
    return { category: "vendor_order", confidence: 0.95, reason: "The message is a vendor order or purchase confirmation." };
  }
  if (/(invoice|bill\b|payment reminder|amount due|balance due|statement|past due|payment is due|payment due|remittance|accounts payable)/i.test(text)) {
    return { category: "vendor_bill", confidence: 0.95, reason: "The message is a vendor invoice, bill, statement, or payment reminder." };
  }
  if (/(wholesale price|trade price|our price|price to you|vendor quote|estimate for|quote for|quoted price)/i.test(text)) {
    return { category: "vendor_quote", confidence: 0.91, reason: "The message appears to be pricing or a quote from a vendor." };
  }
  return undefined;
}

function hasPrintIntent(text: string) {
  return /(please\s+print|can\s+you\s+print|need\s+(?:to\s+)?print|need\s+\d[\d,]*\s+(?:pcs|pieces|cards|copies|books|booklets|flyers|brochures|envelopes|labels|posters|signs)|quote\s+(?:me|for)|price\s+(?:for|on)|how\s+much\s+(?:for|to\s+print)|printing\s+quote|reorder|same\s+(?:job|order)|print\s+\d[\d,]*)/i.test(text);
}

function hasProductionEvidence(text: string, message: EmailMessage) {
  return message.attachments.some((attachment) => !attachment.inline) ||
    /\b\d[\d,]*\s*(?:pcs|pieces|copies|cards|books|booklets|flyers|brochures|envelopes|labels|posters|signs|sets)\b/i.test(text) ||
    /\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\b/i.test(text) ||
    /\b(?:4\/4|4\/0|4\/1|1\/1|1\/0|one[- ]sided|two[- ]sided|double[- ]sided|single[- ]sided|full color|black\s*&?\s*white)\b/i.test(text);
}

function knownVendorForDomain(domain: string) {
  if (KNOWN_VENDOR_DOMAINS.has(domain)) return KNOWN_VENDOR_DOMAINS.get(domain);
  for (const [knownDomain, name] of KNOWN_VENDOR_DOMAINS) {
    if (domain.endsWith(`.${knownDomain}`)) return name;
  }
  return undefined;
}

function looksLikeNewsletter(text: string) {
  return /(unsubscribe|manage\s+(?:email|subscription|marketing)\s+preferences|view\s+(?:this\s+)?email\s+in\s+(?:your\s+)?browser|newsletter|weekly\s+(?:digest|update)|monthly\s+(?:digest|update)|special\s+offer|promotional\s+email|curated\s+for\s+you)/i.test(text);
}

function looksLikeJunk(subject: string, body: string) {
  const text = `${subject}\n${body}`;
  return /^\s*\[spam\]/i.test(subject) || /\b(?:identified|marked|classified)\s+as\s+(?:junk|spam)\b/i.test(text);
}

function looksLikeExistingJobFollowUp(text: string) {
  return /(where\s+can\s+i\s+pick|pick\s*(?:it|them|this)?\s*up|pickup|pick-up|can\s+you\s+deliver|delivery\s+address|get\s+it\s+delivered|is\s+(?:it|this|the\s+job|my\s+order)\s+ready|when\s+will\s+(?:it|this|the\s+job)|what(?:'s|\s+is)\s+the\s+(?:status|total)|send\s+(?:me\s+)?(?:the\s+)?invoice|resend\s+(?:the\s+)?invoice|did\s+you\s+(?:receive|get)\s+(?:the\s+)?(?:file|artwork)|any\s+update|status\s+update|change\s+(?:the|my)\s+(?:job|order)|ready\s+for\s+pickup)/i.test(text);
}

function threadHasBusinessHistory(thread?: EmailThread) {
  if (!thread) return false;
  const inboundCount = thread.messages.filter((message) => message.direction === "inbound").length;
  return Boolean(thread.jobId || thread.quoteId || thread.invoiceId || thread.customerId || thread.messages.some((message) => message.direction === "outbound") || inboundCount > 1);
}

export function classifyBusinessEmail(
  message: EmailMessage,
  options: { thread?: EmailThread; rules?: EmailBusinessRule[] } = {}
): EmailBusinessClassification {
  if (message.businessCategory && message.businessCategorySource === "staff") {
    return {
      category: message.businessCategory,
      confidence: message.businessCategoryConfidence ?? 1,
      reason: message.businessCategoryReason ?? "Staff chose this routing category.",
      source: "staff",
      partyType: message.businessCategory.startsWith("vendor_") || ["proof", "shipping"].includes(message.businessCategory)
        ? "vendor"
        : ["customer_job", "customer_existing_job"].includes(message.businessCategory) ? "customer" : "other",
      partyName: message.businessPartyName,
      matchKind: "staff_override"
    };
  }

  const subject = message.subject || "";
  const body = message.bodyText || "";
  const text = `${subject}\n${body}`;
  const sender = emailHeaderAddress(message.from);
  const domain = emailDomain(message.from);
  const senderName = emailHeaderName(message.from);
  const thread = options.thread;
  const rule = matchingBusinessRule(message, options.rules ?? []);
  const knownVendor = rule?.partyType === "vendor" ? (rule.partyName || senderName) : knownVendorForDomain(domain);

  // Mail sent by Gross Printing staff is internal history, not a new customer
  // request. This also protects against an accidentally-created Gross Printing
  // customer record causing our own sent mail to become an intake ticket.
  if (message.direction === "outbound" || isInternalEmailDomain(domain)) {
    return {
      category: "general",
      confidence: 1,
      reason: "This is Gross Printing internal/sent mail, not a new customer print request.",
      source: "rule",
      partyType: "other",
      matchKind: "content"
    };
  }

  if ((sender.includes("mailer-daemon") || sender.startsWith("postmaster@")) ||
      /(undeliver(?:ed|able)|delivery status notification|mail returned|returned to sender|delivery failure|failure notice)/i.test(subject)) {
    return { category: "delivery_failure", confidence: 0.99, reason: "The sender/subject identifies a mail-delivery failure.", source: "rule", partyType: "other", matchKind: "content" };
  }

  if (looksLikeJunk(subject, body)) {
    return { category: "junk", confidence: 0.99, reason: "The message is explicitly marked as junk/spam.", source: "rule", partyType: "other", matchKind: "content" };
  }

  if (rule?.defaultCategory) {
    return {
      category: rule.defaultCategory,
      confidence: 1,
      reason: `Staff routing rule matched the ${rule.matchType === "email" ? "exact sender email" : "confirmed company domain"}.`,
      source: "staff",
      partyType: rule.partyType,
      partyName: rule.partyName,
      matchKind: rule.matchType === "email" ? "exact_email" : "company_domain"
    };
  }

  if (knownVendor || rule?.partyType === "vendor") {
    const vendorContent = categoryFromVendorContent(subject, body);
    if (vendorContent) {
      return {
        ...vendorContent,
        source: "rule",
        partyType: "vendor",
        partyName: knownVendor || rule?.partyName || senderName,
        matchKind: rule?.matchType === "email" ? "exact_email" : rule?.matchType === "domain" ? "company_domain" : "known_vendor"
      };
    }
    if (looksLikeNewsletter(text)) {
      return {
        category: "newsletter",
        confidence: 0.93,
        reason: "A known vendor sent a promotional/newsletter message rather than an order, proof, bill, or shipment.",
        source: "rule",
        partyType: "vendor",
        partyName: knownVendor || rule?.partyName || senderName,
        matchKind: rule?.matchType === "email" ? "exact_email" : rule?.matchType === "domain" ? "company_domain" : "known_vendor"
      };
    }
    return {
      category: "needs_review",
      confidence: 0.65,
      reason: "The sender is known as a vendor, but this message does not clearly match a vendor workflow yet.",
      source: "rule",
      partyType: "vendor",
      partyName: knownVendor || rule?.partyName || senderName,
      matchKind: rule?.matchType === "email" ? "exact_email" : rule?.matchType === "domain" ? "company_domain" : "known_vendor"
    };
  }

  if (thread?.jobId || /\bGP-\d{3,}\b/i.test(text)) {
    return {
      category: "customer_existing_job",
      confidence: thread?.jobId ? 0.98 : 0.9,
      reason: thread?.jobId ? "This conversation is already linked to a Gross Printing job." : "The email references a Gross Printing job number.",
      source: "rule",
      partyType: "customer",
      matchKind: "conversation"
    };
  }

  if (looksLikeExistingJobFollowUp(text) && threadHasBusinessHistory(thread) && !hasPrintIntent(text)) {
    return {
      category: "customer_existing_job",
      confidence: thread?.customerId || thread?.messages.some((entry) => entry.direction === "outbound") ? 0.93 : 0.82,
      reason: "This reads like a follow-up about an existing order, pickup/delivery, status, invoice, or artwork rather than a new print request.",
      source: "rule",
      partyType: "customer",
      matchKind: "conversation"
    };
  }

  if (thread?.customerId && hasPrintIntent(text)) {
    return { category: "customer_job", confidence: 0.95, reason: "A known customer is asking for printing, pricing, or a reorder.", source: "rule", partyType: "customer", matchKind: "conversation" };
  }

  if (hasPrintIntent(text) && hasProductionEvidence(text, message)) {
    return { category: "customer_job", confidence: 0.86, reason: "The message contains a print/quote request plus production details or artwork.", source: "rule", partyType: "customer", matchKind: "content" };
  }

  if (looksLikeNewsletter(text)) {
    return { category: "newsletter", confidence: 0.94, reason: "The message contains newsletter/promotional subscription signals and does not look like production work.", source: "rule", partyType: "other", matchKind: "content" };
  }

  if (/(security alert|password changed|verify your email|account notification|receipt for your payment|subscription receipt)/i.test(text)) {
    return { category: "general", confidence: 0.9, reason: "The message looks administrative/account-related rather than a print job.", source: "rule", partyType: "other", matchKind: "content" };
  }

  if (message.attachments.some((attachment) => !attachment.inline) || /\b(print|quote|price|job|order|artwork|file|attached)\b/i.test(text)) {
    return { category: "needs_review", confidence: 0.5, reason: "This may require business action, but the system should not guess the workflow.", source: "rule", partyType: rule?.partyType ?? "other", partyName: rule?.partyName, matchKind: "content" };
  }

  return { category: "general", confidence: 0.72, reason: "No clear print-job, vendor, proof, bill, shipping, newsletter, or follow-up intent was found.", source: "rule", partyType: rule?.partyType ?? "other", partyName: rule?.partyName, matchKind: "none" };
}

export function emailBusinessCategoryLabel(category: EmailBusinessCategory) {
  const labels: Record<EmailBusinessCategory, string> = {
    customer_job: "Job / quote request",
    customer_existing_job: "Existing job follow-up",
    vendor_quote: "Vendor quote",
    vendor_bill: "Bill / vendor invoice",
    vendor_order: "Vendor order",
    proof: "Proof",
    shipping: "Shipping / tracking",
    delivery_failure: "Email problem",
    newsletter: "Newsletter / promotional",
    junk: "Junk / spam",
    general: "General mail",
    needs_review: "Needs review"
  };
  return labels[category];
}

export function shouldAutoCreateIntake(_classification: EmailBusinessClassification) {
  // v0.7.0.15: email stays email first. Classification is advisory; staff deliberately opens job review.
  return false;
}
