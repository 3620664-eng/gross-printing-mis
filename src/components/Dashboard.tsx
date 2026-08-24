"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Factory,
  FileText,
  ImageOff,
  ReceiptText,
  Timer,
  UserRoundCheck,
  Zap
} from "lucide-react";
import { formatMoney, WORKFLOW_STATUSES } from "@/lib/pricing";
import type { AppView, Customer, Invoice, Job, JobStatus, Quote } from "@/lib/types";
import type { CustomerPortalRequest } from "@/lib/customer-portal-types";
import { JobCard } from "./JobCard";
import { StatusBadge } from "./StatusBadge";

interface DashboardProps {
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  customers: Customer[];
  onSelectJob: (jobId: string) => void;
  onEditJob: (jobId: string) => void;
  onNavigate: (view: AppView) => void;
  onMoveJob: (jobId: string, status: JobStatus) => void;
  onEnsureInvoice: (jobId: string) => void;
  portalRequests: CustomerPortalRequest[];
  onOpenPortalRequests: () => void;
}

export function Dashboard({
  jobs,
  quotes,
  invoices,
  customers,
  onSelectJob,
  onEditJob,
  onNavigate,
  onMoveJob,
  onEnsureInvoice,
  portalRequests,
  onOpenPortalRequests
}: DashboardProps) {
  const liveJobs = jobs.filter((job) => !job.archived && !job.deletedAt && job.status !== "Cancelled");
  const rushJobs = liveJobs.filter((job) => job.rush && job.status !== "Delivered");
  const invoiceTotal = invoices
    .filter((invoice) => !invoice.archived && !invoice.deletedAt && invoice.status !== "Paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const openQuotes = quotes.filter((quote) => quote.status !== "Archived" && !quote.archived && !quote.deletedAt);

  const quoteQueue = liveJobs.filter((job) => job.status === "Quote");
  const approvedQueue = liveJobs.filter((job) => job.status === "Approved");
  const missingArtwork = liveJobs.filter(
    (job) =>
      (job.status === "Approved" || job.status === "Prepress") &&
      !job.artworkName &&
      !job.artworkPreview
  );
  const readyWithoutInvoice = liveJobs.filter(
    (job) =>
      (job.status === "Ready" || job.status === "Delivered") &&
      !invoices.some((invoice) => invoice.jobId === job.id && !invoice.archived && !invoice.deletedAt)
  );
  const activePortalRequests = portalRequests.filter(
    (request) => !["Converted", "Closed", "Archived", "Completed"].includes(request.status)
  );
  const portalProofChanges = activePortalRequests.filter((request) => request.type === "proof_changes");
  const portalUploads = activePortalRequests.filter((request) => Boolean(request.fileName));
  const portalApprovals = activePortalRequests.filter(
    (request) => request.type === "quote_approval" || request.type === "proof_approval"
  );
  const actionCount =
    quoteQueue.length +
    approvedQueue.length +
    missingArtwork.length +
    readyWithoutInvoice.length +
    activePortalRequests.length;

  return (
    <main className="page-view">
      <div className="dashboard-hero">
        <div>
          <p>Gross Printing MIS</p>
          <h1>One clean flow from quote to production, invoice, delivery, and reorder.</h1>
        </div>
        <button className="primary-button" type="button" onClick={() => onNavigate("New Estimate / Job")}>
          New Quote / Job
          <ArrowRight size={16} />
        </button>
      </div>

      <section className="kpi-grid">
        <div className="kpi-card">
          <Factory />
          <span>Live jobs</span>
          <strong>{liveJobs.filter((job) => job.status !== "Delivered").length}</strong>
        </div>
        <div className="kpi-card">
          <AlertTriangle />
          <span>Rush jobs</span>
          <strong>{rushJobs.length}</strong>
        </div>
        <div className="kpi-card">
          <FileText />
          <span>Open quotes</span>
          <strong>{openQuotes.length}</strong>
        </div>
        <div className="kpi-card">
          <CircleDollarSign />
          <span>Open invoice value</span>
          <strong>{formatMoney(invoiceTotal)}</strong>
        </div>
      </section>

      <section className="panel automation-center">
        <div className="panel-heading">
          <div>
            <span className="automation-kicker"><Zap size={15} /> Automatic shop flow</span>
            <h2>Next actions</h2>
          </div>
          {actionCount ? <strong className="automation-count">{actionCount}</strong> : <CheckCircle2 size={22} />}
        </div>

        {actionCount ? (
          <div className="automation-grid">
            <article className={activePortalRequests.length ? "automation-card attention portal" : "automation-card done"}>
              <UserRoundCheck size={19} />
              <div>
                <strong>{activePortalRequests.length} customer portal request{activePortalRequests.length === 1 ? "" : "s"}</strong>
                <span>
                  {portalProofChanges.length} proof change{portalProofChanges.length === 1 ? "" : "s"} ·{" "}
                  {portalUploads.length} upload{portalUploads.length === 1 ? "" : "s"} ·{" "}
                  {portalApprovals.length} approval{portalApprovals.length === 1 ? "" : "s"}
                </span>
              </div>
              <button className="icon-button text-button small" type="button" onClick={onOpenPortalRequests}>
                Review
              </button>
            </article>

            <article className={quoteQueue.length ? "automation-card attention" : "automation-card done"}>
              <FileText size={19} />
              <div>
                <strong>{quoteQueue.length} quote{quoteQueue.length === 1 ? "" : "s"} waiting</strong>
                <span>Review pricing and customer approval before production.</span>
              </div>
              <button className="icon-button text-button small" type="button" onClick={() => onNavigate("Quotes")}>
                Review
              </button>
            </article>

            <article className={approvedQueue.length ? "automation-card attention" : "automation-card done"}>
              <Factory size={19} />
              <div>
                <strong>{approvedQueue.length} approved job{approvedQueue.length === 1 ? "" : "s"}</strong>
                <span>Release the next approved job into Prepress.</span>
              </div>
              <button
                className="icon-button text-button small"
                type="button"
                disabled={!approvedQueue[0]}
                onClick={() => approvedQueue[0] && onMoveJob(approvedQueue[0].id, "Prepress")}
              >
                Release next
              </button>
            </article>

            <article className={missingArtwork.length ? "automation-card warning" : "automation-card done"}>
              <ImageOff size={19} />
              <div>
                <strong>{missingArtwork.length} job{missingArtwork.length === 1 ? "" : "s"} missing artwork</strong>
                <span>Artwork is required before a job can move from Prepress to Printing.</span>
              </div>
              <button
                className="icon-button text-button small"
                type="button"
                disabled={!missingArtwork[0]}
                onClick={() => missingArtwork[0] && onEditJob(missingArtwork[0].id)}
              >
                Add artwork
              </button>
            </article>

            <article className={readyWithoutInvoice.length ? "automation-card warning" : "automation-card done"}>
              <ReceiptText size={19} />
              <div>
                <strong>{readyWithoutInvoice.length} job{readyWithoutInvoice.length === 1 ? "" : "s"} missing invoice</strong>
                <span>Ready and delivered jobs should always have an invoice record.</span>
              </div>
              <button
                className="icon-button text-button small"
                type="button"
                disabled={!readyWithoutInvoice[0]}
                onClick={() => readyWithoutInvoice[0] && onEnsureInvoice(readyWithoutInvoice[0].id)}
              >
                Create invoice
              </button>
            </article>
          </div>
        ) : (
          <div className="automation-empty">
            <CheckCircle2 size={22} />
            <div>
              <strong>Everything is caught up.</strong>
              <span>No portal requests, approved jobs, missing artwork, or missing invoices need attention.</span>
            </div>
          </div>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Workflow load</h2>
            <button className="ghost-link" type="button" onClick={() => onNavigate("Workflow")}>View board</button>
          </div>
          <div className="status-meter-list">
            {WORKFLOW_STATUSES.map((status) => {
              const count = liveJobs.filter((job) => job.status === status).length;
              return (
                <div className="status-meter" key={status}>
                  <StatusBadge status={status} />
                  <div><span style={{ width: `${Math.max(8, count * 18)}%` }} /></div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Rush queue</h2>
            <Timer size={18} />
          </div>
          <div className="compact-card-list">
            {rushJobs.length
              ? rushJobs.map((job) => <JobCard job={job} key={job.id} onClick={() => onSelectJob(job.id)} />)
              : <p>No rush work due within 24 hours.</p>}
          </div>
        </section>
      </div>

      <section className="panel customer-strip">
        <div className="panel-heading">
          <h2>Customer activity</h2>
          <button className="ghost-link" type="button" onClick={() => onNavigate("Customer Portal")}>Customers</button>
        </div>
        <div className="customer-strip-grid">
          {customers.slice(0, 8).map((customer) => (
            <div className="customer-mini" key={customer.id}>
              <strong>{customer.name}</strong>
              <span>{customer.contact}</span>
              <small>{formatMoney(customer.totalSpend)} lifetime</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
