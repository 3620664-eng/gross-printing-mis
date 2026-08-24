"use client";

import {
  Activity,
  AlertTriangle,
  Clock3,
  DatabaseBackup,
  FileText,
  History,
  Laptop,
  PackageCheck,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  TrendingUp,
  UserCheck
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { formatMoney } from "@/lib/pricing";
import type {
  Customer,
  EmailLog,
  Invoice,
  Job,
  JobStatus,
  JobStatusEvent,
  OperationalActivity,
  Quote
} from "@/lib/types";
import type { CustomerPortalRequest } from "@/lib/customer-portal-types";

interface ManagedUser {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  department?: string;
  isOnline?: boolean;
  lastActivityAt?: string;
  currentView?: string;
}

interface SecurityAuditEntry {
  id: number;
  actor_email?: string;
  actor_role?: string;
  action: string;
  category: string;
  details?: Record<string, unknown>;
  created_at: string;
}

interface SecurityVersionEntry {
  id: number;
  collection: string;
  record_id: string;
  action: string;
  created_at: string;
}

interface SecurityOverview {
  workspace?: { revision?: number; updated_at?: string; migrated_from_legacy_at?: string };
  activeRecordCount?: number;
  softDeletedCount?: number;
  versionCountShown?: number;
  activeCounts?: Record<string, number>;
  audits?: SecurityAuditEntry[];
  versions?: SecurityVersionEntry[];
}

interface OwnerOperationsProps {
  authToken?: string;
  jobs: Job[];
  customers: Customer[];
  quotes: Quote[];
  invoices: Invoice[];
  statusEvents: JobStatusEvent[];
  emailLogs: EmailLog[];
  portalRequests: CustomerPortalRequest[];
  operationalActivities: OperationalActivity[];
  onOpenJob: (jobId: string) => void;
  onOpenCustomer: (customerId: string) => void;
}

type CustomerFilter = "all" | "returning" | "new" | "inactive30" | "inactive60" | "inactive90";
type ActivityFilter = "all" | OperationalActivity["category"];

const shopStages: JobStatus[] = ["Quote", "Approved", "Prepress", "Printing", "Finishing", "Ready", "Delivered"];

function dateTime(value?: string) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function daysBetween(left: string, right: string) {
  return Math.max(0, Math.round((new Date(right).getTime() - new Date(left).getTime()) / 86_400_000));
}

function relativeDays(value?: string) {
  if (!value) return "No orders";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function OwnerOperations({
  authToken,
  jobs,
  customers,
  quotes,
  invoices,
  statusEvents,
  emailLogs,
  portalRequests,
  operationalActivities,
  onOpenJob,
  onOpenCustomer
}: OwnerOperationsProps) {
  const [staff, setStaff] = useState<ManagedUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [message, setMessage] = useState("");
  const [security, setSecurity] = useState<SecurityOverview>();
  const [securityLoading, setSecurityLoading] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<number>();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("all");

  async function loadStaff(quiet = false) {
    if (!authToken) return;
    if (!quiet) setLoadingStaff(true);
    try {
      const response = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load staff activity.");
      setStaff(payload.users ?? []);
      if (!quiet) setMessage("");
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : "Unable to load staff activity.");
    } finally {
      if (!quiet) setLoadingStaff(false);
    }
  }

  async function loadSecurity(quiet = false) {
    if (!authToken) return;
    if (!quiet) setSecurityLoading(true);
    try {
      const response = await fetch("/api/security/overview", {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as SecurityOverview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load server security activity.");
      setSecurity(payload);
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : "Unable to load server security activity.");
    } finally {
      if (!quiet) setSecurityLoading(false);
    }
  }

  async function restoreVersion(versionId: number) {
    if (!authToken || restoringVersionId) return;
    const confirmed = window.confirm("Restore this record to its previous protected version? The action will be recorded.");
    if (!confirmed) return;
    setRestoringVersionId(versionId);
    try {
      const response = await fetch("/api/security/restore", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, restore: "previous" })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to restore this record.");
      setMessage(payload.message ?? "Protected record restored.");
      await loadSecurity(true);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to restore this record.");
    } finally {
      setRestoringVersionId(undefined);
    }
  }

  useEffect(() => {
    void loadStaff();
    void loadSecurity();
    if (!authToken) return;
    const timer = window.setInterval(() => {
      void loadStaff(true);
      void loadSecurity(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [authToken]);

  const activeJobs = jobs.filter(
    (job) => !job.archived && !job.deletedAt && !["Delivered", "Cancelled"].includes(job.status)
  );
  const overdueJobs = activeJobs.filter(
    (job) => new Date(`${job.dueDate}T${job.dueTime || "17:00"}`).getTime() < Date.now()
  );
  const readyWithoutSentInvoice = jobs.filter((job) => {
    if (!["Ready", "Delivered"].includes(job.status)) return false;
    const invoice = invoices.find((item) => item.id === job.invoiceId || item.jobId === job.id);
    return !invoice || !["Sent", "Paid"].includes(invoice.status);
  });
  const onlineStaff = staff.filter((user) => user.isOnline);

  const stageCounts = shopStages.map((stage) => ({
    stage,
    count: jobs.filter((job) => !job.archived && !job.deletedAt && job.status === stage).length
  }));
  const maxStageCount = Math.max(1, ...stageCounts.map((item) => item.count));

  const customerRows = useMemo(() => {
    return customers
      .map((customer) => {
        const customerJobs = jobs
          .filter((job) => job.customerId === customer.id && !job.deletedAt && job.status !== "Cancelled")
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const orderDates = customerJobs.map((job) => job.createdAt);
        const gaps = orderDates.slice(1).map((value, index) => daysBetween(orderDates[index], value));
        const lastOrder = orderDates.at(-1);
        const daysSinceOrder = lastOrder
          ? Math.max(0, Math.floor((Date.now() - new Date(lastOrder).getTime()) / 86_400_000))
          : 99999;
        const customerQuotes = quotes.filter((quote) => quote.customerId === customer.id && !quote.deletedAt);
        const approvedQuotes = customerQuotes.filter((quote) => quote.status === "Approved").length;
        return {
          customer,
          orderCount: customerJobs.length,
          reorderCount: Math.max(0, customerJobs.length - 1),
          lastOrder,
          daysSinceOrder,
          averageGap: gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : undefined,
          lifetimeSales: customerJobs.reduce((sum, job) => sum + job.pricing.total, 0),
          portalCount: portalRequests.filter((request) => request.customerId === customer.id).length,
          conversionRate: customerQuotes.length ? Math.round((approvedQuotes / customerQuotes.length) * 100) : 0
        };
      })
      .filter((row) => {
        if (customerFilter === "returning") return row.orderCount > 1;
        if (customerFilter === "new") return row.orderCount === 1;
        if (customerFilter === "inactive30") return row.daysSinceOrder >= 30;
        if (customerFilter === "inactive60") return row.daysSinceOrder >= 60;
        if (customerFilter === "inactive90") return row.daysSinceOrder >= 90;
        return true;
      })
      .sort((a, b) => b.lifetimeSales - a.lifetimeSales);
  }, [customers, jobs, quotes, portalRequests, customerFilter]);

  const activityFeed = useMemo(() => {
    const movementActivities: OperationalActivity[] = statusEvents.map((event) => {
      const job = jobs.find((item) => item.id === event.jobId);
      return {
        id: `movement-${event.id}`,
        category: "job",
        action: "status_changed",
        description: `${job?.jobNumber ?? "Job"} moved${event.fromStatus ? ` from ${event.fromStatus}` : ""} to ${event.toStatus}.`,
        employeeId: event.employeeId,
        employeeName: event.employeeName,
        createdAt: event.movedAt,
        customerId: job?.customerId,
        customerName: job?.customerName,
        jobId: job?.id,
        jobNumber: job?.jobNumber,
        fromValue: event.fromStatus,
        toValue: event.toStatus,
        details: { minutesInPreviousStatus: event.minutesInPreviousStatus }
      };
    });
    const emailActivities: OperationalActivity[] = emailLogs.slice(0, 200).map((log) => ({
      id: `email-${log.id}`,
      category: "email",
      action: log.status === "Failed" ? "email_failed" : "email_sent",
      description: `${log.subject} → ${log.to}`,
      employeeId: log.sentBy ?? "system",
      employeeName: log.sentBy ?? "System",
      createdAt: log.createdAt,
      customerId: log.customerId,
      jobId: log.jobId,
      quoteId: log.quoteId,
      invoiceId: log.invoiceId,
      toValue: log.status
    }));
    return [
      ...operationalActivities.filter((activity) => activity.action !== "status_changed"),
      ...movementActivities,
      ...emailActivities
    ]
      .filter((activity) => activityFilter === "all" || activity.category === activityFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 250);
  }, [operationalActivities, statusEvents, emailLogs, jobs, activityFilter]);

  const totalRecordedSales = customers.reduce((sum, customer) => {
    return sum + jobs.filter((job) => job.customerId === customer.id && !job.deletedAt).reduce((jobSum, job) => jobSum + job.pricing.total, 0);
  }, 0);
  const returningCustomers = customers.filter(
    (customer) => jobs.filter((job) => job.customerId === customer.id && !job.deletedAt && job.status !== "Cancelled").length > 1
  ).length;

  return (
    <main className="page-view owner-operations-page">
      <div className="section-heading owner-operations-heading">
        <div>
          <p>Owner control room</p>
          <h1>Shop activity, staff work, invoicing, and customer retention</h1>
          <span>See what is happening now and keep a searchable record of important changes.</span>
        </div>
        <button className="secondary-button" type="button" onClick={() => { void loadStaff(); void loadSecurity(); }} disabled={loadingStaff || securityLoading}>
          <RefreshCw className={loadingStaff || securityLoading ? "spin" : ""} size={17} />
          Refresh control room
        </button>
      </div>

      {message ? <div className="owner-operations-message"><AlertTriangle size={16} />{message}</div> : null}

      <section className="owner-kpi-grid">
        <article><PackageCheck size={19} /><span><strong>{activeJobs.length}</strong><small>Active jobs</small></span></article>
        <article className={overdueJobs.length ? "warning" : ""}><Clock3 size={19} /><span><strong>{overdueJobs.length}</strong><small>Overdue jobs</small></span></article>
        <article className={readyWithoutSentInvoice.length ? "warning" : ""}><FileText size={19} /><span><strong>{readyWithoutSentInvoice.length}</strong><small>Ready jobs needing invoice action</small></span></article>
        <article><UserCheck size={19} /><span><strong>{onlineStaff.length}</strong><small>Staff online</small></span></article>
        <article><Repeat2 size={19} /><span><strong>{returningCustomers}</strong><small>Returning customers</small></span></article>
        <article><TrendingUp size={19} /><span><strong>{formatMoney(totalRecordedSales)}</strong><small>Recorded customer sales</small></span></article>
      </section>

      <div className="owner-operations-two-column">
        <section className="panel owner-shop-load">
          <div className="panel-heading-row"><div><h2>Shop load</h2><span>Jobs currently sitting in each stage.</span></div></div>
          <div className="owner-stage-list">
            {stageCounts.map((item) => (
              <div key={item.stage}>
                <span>{item.stage}</span>
                <div><i style={{ width: `${Math.max(3, (item.count / maxStageCount) * 100)}%` }} /></div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel owner-staff-now">
          <div className="panel-heading-row"><div><h2>Staff now</h2><span>Hosted sessions and the last page each employee used.</span></div><Laptop size={18} /></div>
          <div className="owner-staff-list">
            {staff.slice().sort((a, b) => Number(Boolean(b.isOnline)) - Number(Boolean(a.isOnline))).slice(0, 12).map((user) => {
              const names = [user.displayName, user.email].filter(Boolean).map((value) => value.toLowerCase());
              const latest = activityFeed.find((activity) => names.some((name) => activity.employeeName.toLowerCase().includes(name) || name.includes(activity.employeeName.toLowerCase())));
              return (
                <article key={user.userId}>
                  <span className={user.isOnline ? "online" : "offline"} />
                  <div><strong>{user.displayName || user.email}</strong><small>{user.department || user.role} · {latest?.description ?? user.currentView ?? "No recent recorded action"}</small></div>
                  <em>{user.isOnline ? "Online" : relativeDays(user.lastActivityAt)}</em>
                </article>
              );
            })}
            {!staff.length ? <p className="muted">Hosted staff sessions will appear after users sign in.</p> : null}
          </div>
        </section>
      </div>

      <section className="panel owner-security-panel">
        <div className="panel-heading-row">
          <div><h2>Server security and recovery</h2><span>Protected database revision, recoverable history, and server-recorded security events.</span></div>
          <ShieldCheck size={19} />
        </div>
        <div className="owner-security-kpis">
          <article><ShieldCheck size={18} /><span><strong>{security?.workspace?.revision ?? 0}</strong><small>Protected server revision</small></span></article>
          <article><DatabaseBackup size={18} /><span><strong>{security?.activeRecordCount ?? 0}</strong><small>Active protected records</small></span></article>
          <article><History size={18} /><span><strong>{security?.versionCountShown ?? 0}</strong><small>Recent recoverable versions</small></span></article>
          <article className={security?.softDeletedCount ? "warning" : ""}><AlertTriangle size={18} /><span><strong>{security?.softDeletedCount ?? 0}</strong><small>Soft-deleted records</small></span></article>
        </div>
        <div className="owner-security-events">
          {(security?.audits ?? []).slice(0, 12).map((event) => (
            <article key={event.id}>
              <span><ShieldCheck size={15} /></span>
              <div><strong>{event.action}</strong><small>{event.actor_email || "System"} · {event.actor_role || event.category} · {dateTime(event.created_at)}</small></div>
            </article>
          ))}
          {!securityLoading && !(security?.audits?.length) ? <p className="muted">Security events will appear after the protected server gateway is used.</p> : null}
        </div>
        <div className="owner-version-history">
          <div><strong>Recent protected versions</strong><small>Owner-only recovery for accidental changes or deletions.</small></div>
          {(security?.versions ?? []).slice(0, 10).map((version) => (
            <article key={version.id}>
              <span><b>{version.collection}</b><small>{version.record_id} · {version.action} · {dateTime(version.created_at)}</small></span>
              <button className="secondary-button compact" type="button" onClick={() => void restoreVersion(version.id)} disabled={Boolean(restoringVersionId)}>
                {restoringVersionId === version.id ? "Restoring…" : "Restore previous"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel owner-activity-panel">
        <div className="panel-heading-row">
          <div><h2>Detailed activity feed</h2><span>Status moves, invoice actions, emails, and important record changes.</span></div>
          <label>Filter<select value={activityFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setActivityFilter(event.target.value as ActivityFilter)}><option value="all">All activity</option><option value="job">Jobs</option><option value="invoice">Invoices</option><option value="email">Emails</option><option value="customer">Customers</option><option value="file">Files</option><option value="portal">Portal</option><option value="system">System</option></select></label>
        </div>
        <div className="owner-activity-list">
          {activityFeed.map((activity) => (
            <button type="button" key={activity.id} onClick={() => activity.jobId ? onOpenJob(activity.jobId) : activity.customerId ? onOpenCustomer(activity.customerId) : undefined}>
              <span className={`activity-category ${activity.category}`}><Activity size={15} /></span>
              <div><strong>{activity.description}</strong><small>{activity.employeeName} · {dateTime(activity.createdAt)}{activity.customerName ? ` · ${activity.customerName}` : ""}</small></div>
              {activity.jobNumber ? <b>{activity.jobNumber}</b> : activity.invoiceNumber ? <b>{activity.invoiceNumber}</b> : null}
            </button>
          ))}
          {!activityFeed.length ? <div className="owner-empty"><History size={25} /><strong>No recorded activity yet</strong><span>New status moves and invoice actions will appear here.</span></div> : null}
        </div>
      </section>

      <section className="panel owner-retention-panel">
        <div className="panel-heading-row">
          <div><h2>Customer activity and retention</h2><span>Find returning customers and customers who may need follow-up.</span></div>
          <label>Customers<select value={customerFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCustomerFilter(event.target.value as CustomerFilter)}><option value="all">All customers</option><option value="returning">Returning customers</option><option value="new">One-time customers</option><option value="inactive30">Inactive 30+ days</option><option value="inactive60">Inactive 60+ days</option><option value="inactive90">Inactive 90+ days</option></select></label>
        </div>
        <div className="owner-retention-table-wrap">
          <table>
            <thead><tr><th>Customer</th><th>Orders</th><th>Reorders</th><th>Last order</th><th>Average reorder</th><th>Quote conversion</th><th>Portal requests</th><th>Lifetime sales</th></tr></thead>
            <tbody>
              {customerRows.map((row) => (
                <tr key={row.customer.id} onClick={() => onOpenCustomer(row.customer.id)}>
                  <td><strong>{row.customer.name}</strong><span>{row.customer.contact}</span></td>
                  <td>{row.orderCount}</td>
                  <td>{row.reorderCount}</td>
                  <td>{relativeDays(row.lastOrder)}</td>
                  <td>{row.averageGap ? `${row.averageGap} days` : "Not enough history"}</td>
                  <td>{row.conversionRate}%</td>
                  <td>{row.portalCount}</td>
                  <td><strong>{formatMoney(row.lifetimeSales)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
