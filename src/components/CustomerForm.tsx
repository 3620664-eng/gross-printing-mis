"use client";

/**
 * The one form for creating a customer.
 *
 * Three screens used to create customers, each with its own fields and its own
 * single rule that the name was not empty. A customer added from an email got a
 * different record shape from one added on the Customers screen, and nothing
 * anywhere checked whether the shop already had them. One form means one set of
 * questions, asked the same way wherever staff happens to be standing.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Info, UserPlus } from "lucide-react";
import {
  CUSTOMER_TERMS,
  draftToCustomer,
  emptyCustomerDraft,
  validateCustomer,
  type CustomerDraft
} from "@/lib/customer-validation";
import type { Customer } from "@/lib/types";

interface CustomerFormProps {
  customers: Customer[];
  /** Prefilled values, e.g. the sender details from an email. */
  initial?: Partial<CustomerDraft>;
  onCreate: (customer: Omit<Customer, "id">) => string;
  onCreated?: (customerId: string) => void;
  onCancel?: () => void;
  /** Jump to the record a duplicate warning points at. */
  onOpenExisting?: (customerId: string) => void;
  submitLabel?: string;
  compact?: boolean;
}

export function CustomerForm({
  customers,
  initial,
  onCreate,
  onCreated,
  onCancel,
  onOpenExisting,
  submitLabel = "Add customer",
  compact = false
}: CustomerFormProps) {
  const [draft, setDraft] = useState<CustomerDraft>(() => emptyCustomerDraft(initial));
  const [touched, setTouched] = useState(false);

  const validation = useMemo(() => validateCustomer(draft, customers), [draft, customers]);

  // Nothing is flagged until staff has tried to save or typed a name. A form
  // that turns red before anything has been entered reads as broken.
  const showIssues = touched || Boolean(draft.name?.trim());
  const errors = validation.issues.filter((issue) => issue.level === "error");
  const warnings = validation.issues.filter((issue) => issue.level === "warning");

  function set(field: keyof CustomerDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    setTouched(true);
    if (!validation.canSave) return;
    const id = onCreate(draftToCustomer(draft));
    setDraft(emptyCustomerDraft());
    setTouched(false);
    onCreated?.(id);
  }

  const fieldError = (field: keyof CustomerDraft) =>
    showIssues && errors.some((issue) => issue.field === field);

  return (
    <div className={`customer-form ${compact ? "compact" : ""}`}>
      <div className="customer-form-grid">
        <label className={fieldError("name") ? "invalid" : ""}>
          <span>Customer name</span>
          <input
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Business or person"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Contact</span>
          <input value={draft.contact ?? ""} onChange={(event) => set("contact", event.target.value)} placeholder="Who to ask for" autoComplete="off" />
        </label>
        <label className={fieldError("email") ? "invalid" : ""}>
          <span>Email</span>
          <input type="email" value={draft.email ?? ""} onChange={(event) => set("email", event.target.value)} onBlur={() => setTouched(true)} autoComplete="off" />
        </label>
        <label>
          <span>Phone</span>
          <input value={draft.phone ?? ""} onChange={(event) => set("phone", event.target.value)} autoComplete="off" />
        </label>
        <label>
          <span>Type</span>
          <input value={draft.companyType ?? ""} onChange={(event) => set("companyType", event.target.value)} placeholder="Commercial, School, Nonprofit…" autoComplete="off" />
        </label>
        <label className={fieldError("terms") ? "invalid" : ""}>
          <span>Terms</span>
          <select value={draft.terms ?? ""} onChange={(event) => set("terms", event.target.value)}>
            {CUSTOMER_TERMS.map((term) => <option value={term} key={term}>{term}</option>)}
          </select>
        </label>
        {!compact ? (
          <>
            <label className="customer-form-wide">
              <span>Street address</span>
              <input value={draft.address ?? ""} onChange={(event) => set("address", event.target.value)} autoComplete="off" />
            </label>
            <label>
              <span>City</span>
              <input value={draft.city ?? ""} onChange={(event) => set("city", event.target.value)} autoComplete="off" />
            </label>
            <label>
              <span>State</span>
              <input value={draft.state ?? ""} onChange={(event) => set("state", event.target.value)} autoComplete="off" />
            </label>
            <label>
              <span>Zip</span>
              <input value={draft.zip ?? ""} onChange={(event) => set("zip", event.target.value)} autoComplete="off" />
            </label>
          </>
        ) : null}
      </div>

      {showIssues && (errors.length || warnings.length) ? (
        <ul className="customer-form-issues">
          {errors.map((issue) => (
            <li className="customer-form-issue error" key={`e-${issue.field}-${issue.message}`}>
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{issue.message}</span>
              {issue.customerId && onOpenExisting ? (
                <button type="button" onClick={() => onOpenExisting(issue.customerId!)}>Open it</button>
              ) : null}
            </li>
          ))}
          {warnings.map((issue) => (
            <li className="customer-form-issue warning" key={`w-${issue.field}-${issue.message}`}>
              <Info size={15} aria-hidden="true" />
              <span>{issue.message}</span>
              {issue.customerId && onOpenExisting ? (
                <button type="button" onClick={() => onOpenExisting(issue.customerId!)}>Open it</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="customer-form-actions">
        <button className="primary-button" type="button" onClick={submit} disabled={showIssues && !validation.canSave}>
          <UserPlus size={15} /> {submitLabel}
        </button>
        {onCancel ? <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button> : null}
      </div>
    </div>
  );
}
