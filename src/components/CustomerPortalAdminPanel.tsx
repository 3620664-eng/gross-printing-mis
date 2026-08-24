"use client";

import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX
} from "lucide-react";
import { useEffect, useState } from "react";
import { CustomerPortalReadOnlyPreview } from "./CustomerPortalReadOnlyPreview";
import type { Customer } from "@/lib/types";
import type {
  CustomerPortalAdminAccount,
  CustomerPortalAdminData,
  CustomerPortalData,
  CustomerPortalRequest,
  CustomerPortalRequestStatus
} from "@/lib/customer-portal-types";

interface CustomerPortalAdminPanelProps {
  customer: Customer;
  authToken?: string;
}

function formatDateTime(value?: string) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CustomerPortalAdminPanel({ customer, authToken }: CustomerPortalAdminPanelProps) {
  const [data, setData] = useState<CustomerPortalAdminData>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState(customer.email);
  const [displayName, setDisplayName] = useState(customer.contact || customer.name);
  const [previewData, setPreviewData] = useState<CustomerPortalData>();
  const [previewBusy, setPreviewBusy] = useState(false);

  const account = data?.accounts[0];

  useEffect(() => {
    setInviteEmail(customer.email);
    setDisplayName(customer.contact || customer.name);
    void load();
  }, [customer.id, authToken]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/customer-portal/admin?customerId=${encodeURIComponent(customer.id)}`,
        { headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, cache: "no-store" }
      );
      const payload = (await response.json().catch(() => ({}))) as CustomerPortalAdminData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load portal access.");
      setData(payload);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load portal access.");
    } finally {
      setLoading(false);
    }
  }

  async function sendAccessEmail(portalAccount: CustomerPortalAdminAccount) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer-portal/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ action: "send_access_email", email: portalAccount.email })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to send the access email.");
      setMessage(payload.message || "Portal access email sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the access email.");
    } finally {
      setBusy(false);
    }
  }

  async function openRequestFile(request: CustomerPortalRequest) {
    const pending = window.open("about:blank", "_blank");
    try {
      const response = await fetch(
        `/api/customer-portal/admin/file?id=${encodeURIComponent(request.id)}`,
        { headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, cache: "no-store" }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Unable to open this customer upload.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (pending) {
        pending.opener = null;
        pending.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      pending?.close();
      setMessage(error instanceof Error ? error.message : "Unable to open this customer upload.");
    }
  }

  async function invite() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer-portal/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          action: "invite",
          customerId: customer.id,
          email: inviteEmail,
          displayName
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to invite this customer.");
      setMessage(payload.message || "Customer invitation sent.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite this customer.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(portalAccount: CustomerPortalAdminAccount, isActive: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/customer-portal/admin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ action: "account", userId: portalAccount.userId, isActive })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update portal access.");
      setMessage(payload.message || "Portal access updated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update portal access.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRequest(request: CustomerPortalRequest, status: CustomerPortalRequestStatus) {
    setBusy(true);
    try {
      const response = await fetch("/api/customer-portal/admin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ action: "request", requestId: request.id, status })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update this portal request.");
      setMessage(payload.message || "Portal request updated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this portal request.");
    } finally {
      setBusy(false);
    }
  }

  async function previewCustomerPortal() {
    setPreviewBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/customer-portal/admin/preview?customerId=${encodeURIComponent(customer.id)}`,
        {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
          cache: "no-store"
        }
      );
      const payload = (await response.json().catch(() => ({}))) as CustomerPortalData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to preview this customer portal.");
      setPreviewData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to preview this customer portal.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function copyPortalLink() {
    const url = `${window.location.origin}/portal`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Customer Portal link copied.");
    } catch {
      window.prompt("Copy this Customer Portal link:", url);
    }
  }

  return (
    <section className="history-block customer-portal-admin-block">
      <div className="history-block-heading">
        <div>
          <h3>Customer Portal access</h3>
          <span>Separate customer-only sign-in with orders, quotes, invoices, messages, proofs, and uploads.</span>
        </div>
        <div className="customer-portal-admin-heading-actions">
          <button className="icon-button text-button" type="button" onClick={copyPortalLink}><Copy size={15} />Copy customer sign-in link</button>
          <button className="primary-button" type="button" onClick={() => void previewCustomerPortal()} disabled={previewBusy}>
            {previewBusy ? <LoaderCircle className="spin" size={15} /> : <ExternalLink size={15} />}
            {previewBusy ? "Opening preview..." : "Preview this customer"}
          </button>
          <button className="icon-button text-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={15} />Refresh</button>
        </div>
      </div>

      {message ? <div className="customer-portal-admin-message">{message}</div> : null}
      {!data?.configured ? <div className="customer-portal-admin-warning"><ShieldCheck size={18} /><span>Run the v0.6.0 Customer Portal SQL, v0.6.1 Portal Requests SQL, and final v0.6.7 security SQL before inviting customers.</span></div> : null}
      <div className="customer-portal-preview-note">
        <ShieldCheck size={17} />
        <span><strong>Customer-specific access:</strong> the sign-in link is shared, but each invited login is mapped to one customer. Preview this customer is staff-only and read-only.</span>
      </div>

      {account ? (
        <div className="customer-portal-access-card">
          <div className={account.isActive ? "active" : "disabled"}>{account.isActive ? <UserRoundCheck size={20} /> : <UserRoundX size={20} />}</div>
          <div>
            <strong>{account.displayName}</strong>
            <span>{account.email}</span>
            <small>Invited {formatDateTime(account.invitedAt)} · Last sign-in {formatDateTime(account.lastSignInAt)}</small>
          </div>
          <span className={`soft-chip ${account.isActive ? "active" : "disabled"}`}>{account.isActive ? "Active" : "Disabled"}</span>
          <div className="customer-portal-account-actions">
            <button className="secondary-button" type="button" onClick={() => void sendAccessEmail(account)} disabled={busy}><Send size={15} />Send access email</button>
            <button className="secondary-button" type="button" onClick={() => void updateAccount(account, !account.isActive)} disabled={busy}>{account.isActive ? "Disable access" : "Enable access"}</button>
          </div>
        </div>
      ) : (
        <div className="customer-portal-invite-form">
          <label>Customer email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label>
          <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <button className="primary-button" type="button" onClick={() => void invite()} disabled={busy || !data?.configured}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}{busy ? "Sending..." : "Send portal invitation"}</button>
        </div>
      )}

      <div className="customer-portal-request-heading"><div><h4>Portal request history</h4><span>Use the Daily Work → Portal Requests page for active review and conversion.</span></div><b>{data?.requests.length ?? 0}</b></div>
      <div className="customer-portal-request-list">
        {(data?.requests ?? []).map((request) => (
          <article key={request.id}>
            <div>
              <span className={`soft-chip ${request.status.toLowerCase().replace(/\s+/g, "-")}`}>{request.status}</span>
              <strong>{request.title}</strong>
              <small>{request.type.replace(/_/g, " ")} · {formatDateTime(request.createdAt)}</small>
              {request.note ? <p>{request.note}</p> : null}
              {request.fileName ? <button className="customer-portal-file-link" type="button" onClick={() => void openRequestFile(request)}>File: {request.fileName}</button> : null}
            </div>
            <div>
              <button
                className="primary-button"
                type="button"
                onClick={() => window.open(`/portal-requests?request=${encodeURIComponent(request.id)}`, "_blank")}
              >
                <ExternalLink size={15} />
                Open request
              </button>
            </div>
          </article>
        ))}
        {!data?.requests.length ? <p className="muted">No Customer Portal requests yet.</p> : null}
      </div>

      {previewData ? (
        <CustomerPortalReadOnlyPreview
          data={previewData}
          onClose={() => setPreviewData(undefined)}
        />
      ) : null}
    </section>
  );
}
