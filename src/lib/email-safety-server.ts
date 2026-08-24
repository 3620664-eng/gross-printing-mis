import "server-only";

import { serviceFetch } from "@/lib/server-auth";
import type { EmailSafetyMode, EmailSafetySettings } from "@/lib/types";

const WORKSPACE_ID = "gross-printing";
const INTERNAL_DOMAIN = "grossprinting.com";

export const DEFAULT_EMAIL_SAFETY_SETTINGS: EmailSafetySettings = {
  id: "primary",
  mode: "shadow",
  testRecipients: [],
  redirectBlockedEnabled: false,
  redirectBlockedTo: "",
  updatedAt: "2026-08-17T00:00:00.000Z"
};

function normalizeEmail(value: string) {
  const bracket = value.match(/<([^>]+)>/);
  return (bracket?.[1] ?? value).trim().toLowerCase();
}

export function normalizeEmailSafetySettings(value: unknown): EmailSafetySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_EMAIL_SAFETY_SETTINGS };
  const input = value as Partial<EmailSafetySettings>;
  const mode: EmailSafetyMode = input.mode === "test" || input.mode === "live" ? input.mode : "shadow";
  const testRecipients = Array.isArray(input.testRecipients)
    ? [...new Set(input.testRecipients.map((item) => normalizeEmail(String(item))).filter(Boolean))].slice(0, 50)
    : [];
  const redirectBlockedTo = normalizeEmail(String(input.redirectBlockedTo ?? ""));
  return {
    id: "primary",
    mode,
    testRecipients,
    redirectBlockedEnabled: Boolean(input.redirectBlockedEnabled && redirectBlockedTo),
    redirectBlockedTo,
    updatedAt: String(input.updatedAt || DEFAULT_EMAIL_SAFETY_SETTINGS.updatedAt),
    updatedBy: input.updatedBy ? String(input.updatedBy).slice(0, 160) : undefined
  };
}

export async function loadEmailSafetySettings() {
  try {
    const response = await serviceFetch(
      `/rest/v1/mis_records?workspace_id=eq.${encodeURIComponent(WORKSPACE_ID)}&deleted_at=is.null&collection=eq.emailSafetySettings&select=record,sort_order&order=sort_order.asc&limit=1`
    );
    if (!response.ok) return { ...DEFAULT_EMAIL_SAFETY_SETTINGS };
    const rows = (await response.json()) as Array<{ record?: unknown }>;
    return normalizeEmailSafetySettings(rows[0]?.record);
  } catch {
    // Fail closed. If the safety setting cannot be read, external mail must not escape during testing.
    return { ...DEFAULT_EMAIL_SAFETY_SETTINGS };
  }
}

export function isInternalGrossPrintingRecipient(value: string) {
  const address = normalizeEmail(value);
  return address.endsWith(`@${INTERNAL_DOMAIN}`);
}

export type EmailSafetyDecision = {
  mode: EmailSafetyMode;
  action: "send" | "block" | "redirect";
  reason: string;
  originalRecipients: string[];
  effectiveTo?: string;
};

export function evaluateEmailSafety(
  settings: EmailSafetySettings,
  recipients: Array<string | undefined | null>
): EmailSafetyDecision {
  const normalized = [...new Set(recipients.map((item) => normalizeEmail(String(item ?? ""))).filter(Boolean))];
  const external = normalized.filter((address) => !isInternalGrossPrintingRecipient(address));
  if (!external.length) {
    return { mode: settings.mode, action: "send", reason: "Gross Printing internal recipient.", originalRecipients: normalized };
  }
  if (settings.mode === "live") {
    return { mode: settings.mode, action: "send", reason: "Live mode is enabled.", originalRecipients: normalized };
  }
  if (settings.mode === "test") {
    const allowed = new Set(settings.testRecipients.map(normalizeEmail));
    if (external.every((address) => allowed.has(address))) {
      return { mode: settings.mode, action: "send", reason: "Recipient is on the approved test list.", originalRecipients: normalized };
    }
  }
  const redirect = normalizeEmail(settings.redirectBlockedTo ?? "");
  if (settings.redirectBlockedEnabled && redirect && (isInternalGrossPrintingRecipient(redirect) || settings.testRecipients.map(normalizeEmail).includes(redirect))) {
    return {
      mode: settings.mode,
      action: "redirect",
      reason: settings.mode === "shadow" ? "Shadow Mode redirected a blocked customer email to the test inbox." : "Test Mode redirected a non-test customer email to the test inbox.",
      originalRecipients: normalized,
      effectiveTo: redirect
    };
  }
  return {
    mode: settings.mode,
    action: "block",
    reason: settings.mode === "shadow" ? "Shadow Mode blocks all external customer email." : "Test Mode allows only approved test recipients.",
    originalRecipients: normalized
  };
}
