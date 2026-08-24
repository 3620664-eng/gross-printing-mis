"use client";

import {
  ArchiveRestore,
  CheckCircle2,
  Database,
  Download,
  FileArchive,
  FileSearch,
  FolderOpen,
  HardDriveDownload,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  Users
} from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import type {
  CatalogPrice,
  Customer,
  EmailLog,
  Invoice,
  Job,
  PrintOrder,
  JobStatusEvent,
  Machine,
  PaperStock,
  Quote,
  UploadedFile
} from "@/lib/types";
import type { ProductPreset } from "@/lib/product-catalog";
import type { QuantityRatePoint } from "@/lib/pricing";
import { ImportExportToolbar } from "./ImportExportToolbar";

export interface BackOfficeState {
  customers: Customer[];
  orders: PrintOrder[];
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  uploadedFiles: UploadedFile[];
  emailLogs: EmailLog[];
  statusEvents: JobStatusEvent[];
  paperStocks: PaperStock[];
  productCategories: string[];
  productPresets: ProductPreset[];
  catalogPrices: CatalogPrice[];
  machines: Machine[];
  quantityRateCurve: QuantityRatePoint[];
  persistence?: {
    schemaVersion: number;
    revision: number;
    savedAt: string;
    clientId: string;
  };
}

interface BackOfficeProps {
  state: BackOfficeState;
  onRestoreBackup: (value: unknown) => boolean;
  onRepairData: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenCustomer: (customerId: string) => void;
  onOpenArchive: () => void;
  onOpenFiles: () => void;
  onImportCustomers: (rows: Record<string, unknown>[]) => void;
  onImportJobs: (rows: Record<string, unknown>[]) => void;
  onImportQuotes: (rows: Record<string, unknown>[]) => void;
  onImportInvoices: (rows: Record<string, unknown>[]) => void;
  onImportPaper: (rows: Record<string, unknown>[]) => void;
  onImportCatalog: (rows: Record<string, unknown>[]) => void;
}

type BackOfficeSection = "overview" | "search" | "transfer" | "backups" | "health";

const sections: Array<{ id: BackOfficeSection; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Backend status and totals" },
  { id: "search", label: "System search", description: "Search active, archived, and deleted records" },
  { id: "transfer", label: "Import / Export", description: "Excel transfer for each data area" },
  { id: "backups", label: "Backups", description: "Download or restore MIS records" },
  { id: "health", label: "Data health", description: "Find broken links and duplicates" }
];

function normalize(value?: string) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function datedBackupName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `gross-printing-mis-backup-${stamp}.json`;
}

export function BackOffice({
  state,
  onRestoreBackup,
  onRepairData,
  onOpenJob,
  onOpenCustomer,
  onOpenArchive,
  onOpenFiles,
  onImportCustomers,
  onImportJobs,
  onImportQuotes,
  onImportInvoices,
  onImportPaper,
  onImportCatalog
}: BackOfficeProps) {
  const [activeSection, setActiveSection] = useState<BackOfficeSection>("overview");
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [restoreMessage, setRestoreMessage] = useState("");
  const backupInputRef = useRef<HTMLInputElement>(null);

  const activeCustomers = state.customers.filter((item) => !item.archived && !item.deletedAt);
  const activeOrders = state.orders.filter((item) => !item.archived && !item.deletedAt);
  const activeJobs = state.jobs.filter((item) => !item.archived && !item.deletedAt);
  const openQuotes = state.quotes.filter((item) => !item.archived && !item.deletedAt && item.status !== "Approved");
  const unpaidInvoices = state.invoices.filter((item) => !item.archived && !item.deletedAt && item.status !== "Paid");
  const activeFiles = state.uploadedFiles.filter((item) => !item.deletedAt && item.status !== "Archived" && item.folder !== "Archive");
  const inactiveCount =
    state.customers.filter((item) => item.archived || item.deletedAt).length +
    state.jobs.filter((item) => item.archived || item.deletedAt).length +
    state.quotes.filter((item) => item.archived || item.deletedAt).length +
    state.invoices.filter((item) => item.archived || item.deletedAt).length +
    state.uploadedFiles.filter((item) => item.deletedAt || item.status === "Archived" || item.folder === "Archive").length;

  const health = useMemo(() => {
    const customerIds = new Set(state.customers.map((item) => item.id));
    const jobIds = new Set(state.jobs.map((item) => item.id));
    const duplicateNames = new Map<string, Customer[]>();
    const duplicateEmails = new Map<string, Customer[]>();

    state.customers.forEach((customer) => {
      const name = normalize(customer.name);
      const email = normalize(customer.email);
      if (name) duplicateNames.set(name, [...(duplicateNames.get(name) ?? []), customer]);
      if (email) duplicateEmails.set(email, [...(duplicateEmails.get(email) ?? []), customer]);
    });

    const duplicateCustomerGroups = [
      ...Array.from(duplicateNames.values()).filter((items) => items.length > 1),
      ...Array.from(duplicateEmails.values()).filter((items) => items.length > 1)
    ];

    const orphanJobs = state.jobs.filter((job) => !customerIds.has(job.customerId));
    const orphanQuotes = state.quotes.filter((quote) => !jobIds.has(quote.jobId) || !customerIds.has(quote.customerId));
    const orphanInvoices = state.invoices.filter((invoice) => !jobIds.has(invoice.jobId) || !customerIds.has(invoice.customerId));
    const orphanFiles = state.uploadedFiles.filter(
      (file) => (file.jobId && !jobIds.has(file.jobId)) || (file.customerId && !customerIds.has(file.customerId))
    );
    const unlinkedFiles = state.uploadedFiles.filter((file) => !file.jobId && !file.customerId && !file.deletedAt);
    const invalidEmails = state.customers.filter(
      (customer) => customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())
    );

    return {
      duplicateCustomerGroups,
      orphanJobs,
      orphanQuotes,
      orphanInvoices,
      orphanFiles,
      unlinkedFiles,
      invalidEmails,
      issueCount:
        duplicateCustomerGroups.length + orphanJobs.length + orphanQuotes.length + orphanInvoices.length + orphanFiles.length + invalidEmails.length
    };
  }, [state.customers, state.invoices, state.jobs, state.quotes, state.uploadedFiles]);

  const searchResults = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    const contains = (...values: Array<string | number | undefined>) => normalize(values.filter(Boolean).join(" ")).includes(needle);
    const results: Array<{
      id: string;
      kind: string;
      title: string;
      detail: string;
      state: string;
      onOpen?: () => void;
    }> = [];

    state.customers.forEach((customer) => {
      if (!includeInactive && (customer.archived || customer.deletedAt)) return;
      if (contains(customer.name, customer.contact, customer.email, customer.phone, customer.address, customer.city, customer.companyType)) {
        results.push({
          id: `customer-${customer.id}`,
          kind: "Customer",
          title: customer.name,
          detail: `${customer.contact || "No contact"} / ${customer.email || "No email"}`,
          state: customer.deletedAt ? "Recycle bin" : customer.archived ? "Archived" : "Active",
          onOpen: () => onOpenCustomer(customer.id)
        });
      }
    });

    state.orders.forEach((order) => {
      if (!includeInactive && (order.archived || order.deletedAt)) return;
      if (!needle || normalize(`${order.orderNumber} ${order.title} ${order.customerName} ${order.status}`).includes(needle)) {
        results.push({
          kind: "Order",
          id: `order-${order.id}`,
          title: `${order.orderNumber} · ${order.title}`,
          detail: `${order.customerName} · ${order.jobIds.length} jobs`,
          state: order.deletedAt ? "Recycle bin" : order.archived ? "Archived" : order.status
        });
      }
    });
    state.jobs.forEach((job) => {
      if (!includeInactive && (job.archived || job.deletedAt)) return;
      if (contains(job.jobNumber, job.title, job.customerName, job.status, job.stockName, job.notes)) {
        results.push({
          id: `job-${job.id}`,
          kind: "Job",
          title: `${job.jobNumber} / ${job.title}`,
          detail: `${job.customerName} / ${job.status}`,
          state: job.deletedAt ? "Recycle bin" : job.archived ? "Archived" : "Active",
          onOpen: () => onOpenJob(job.id)
        });
      }
    });

    state.quotes.forEach((quote) => {
      if (!includeInactive && (quote.archived || quote.deletedAt)) return;
      if (contains(quote.quoteNumber, quote.title, quote.customerName, quote.status)) {
        results.push({
          id: `quote-${quote.id}`,
          kind: "Quote",
          title: `${quote.quoteNumber} / ${quote.title}`,
          detail: `${quote.customerName} / $${quote.amount.toFixed(2)}`,
          state: quote.deletedAt ? "Recycle bin" : quote.archived ? "Archived" : quote.status,
          onOpen: quote.jobId ? () => onOpenJob(quote.jobId) : undefined
        });
      }
    });

    state.invoices.forEach((invoice) => {
      if (!includeInactive && (invoice.archived || invoice.deletedAt)) return;
      if (contains(invoice.invoiceNumber, invoice.title, invoice.customerName, invoice.status)) {
        results.push({
          id: `invoice-${invoice.id}`,
          kind: "Invoice",
          title: `${invoice.invoiceNumber} / ${invoice.title}`,
          detail: `${invoice.customerName} / $${invoice.amount.toFixed(2)}`,
          state: invoice.deletedAt ? "Recycle bin" : invoice.archived ? "Archived" : invoice.status,
          onOpen: invoice.jobId ? () => onOpenJob(invoice.jobId) : undefined
        });
      }
    });

    state.uploadedFiles.forEach((file) => {
      if (!includeInactive && (file.deletedAt || file.status === "Archived" || file.folder === "Archive")) return;
      if (contains(file.name, file.customerName, file.jobNumber, file.folder, file.status, file.type)) {
        results.push({
          id: `file-${file.id}`,
          kind: "File",
          title: file.name,
          detail: `${file.customerName || "Unassigned"}${file.jobNumber ? ` / ${file.jobNumber}` : ""}`,
          state: file.deletedAt ? "Recycle bin" : file.status,
          onOpen: onOpenFiles
        });
      }
    });

    state.paperStocks.forEach((paper) => {
      if (contains(paper.name, paper.kind, paper.supplier, paper.inventoryCategory, paper.invoiceNumber)) {
        results.push({
          id: `paper-${paper.id}`,
          kind: "Paper",
          title: paper.name,
          detail: `${paper.sheetWidth} × ${paper.sheetHeight} / ${paper.inventorySheets.toLocaleString()} sheets`,
          state: "Catalog"
        });
      }
    });

    return results.slice(0, 100);
  }, [includeInactive, onOpenCustomer, onOpenFiles, onOpenJob, query, state]);

  async function restoreBackup(file: File | null) {
    if (!file) return;
    setRestoreMessage("");
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const restored = onRestoreBackup(parsed);
      setRestoreMessage(restored ? "Backup accepted. The restored data is now being saved." : "This file is not a complete Gross Printing MIS-data backup.");
    } catch {
      setRestoreMessage("This file is not a valid Gross Printing JSON backup.");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  const backupEnvelope = {
    product: "Gross Printing MIS",
    version: "0.6.7",
    exportedAt: new Date().toISOString(),
    state
  };

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Back Office</p>
          <h1>Data controls, files, imports, backups, and recovery</h1>
        </div>
        <div className="toolbar-actions">
          <button className="icon-button text-button" type="button" onClick={onOpenFiles}>
            <FolderOpen size={16} />
            Files & paperwork
          </button>
          <button className="icon-button text-button" type="button" onClick={onOpenArchive}>
            <ArchiveRestore size={16} />
            Archive & recycle bin
          </button>
        </div>
      </div>

      <div className="back-office-layout">
        <nav className="settings-section-nav" aria-label="Back Office sections">
          {sections.map((section) => (
            <button className={activeSection === section.id ? "active" : ""} type="button" key={section.id} onClick={() => setActiveSection(section.id)}>
              <Database size={18} />
              <span><strong>{section.label}</strong><small>{section.description}</small></span>
            </button>
          ))}
        </nav>

        <section className="panel back-office-panel">
          {activeSection === "overview" ? (
            <div className="back-office-overview">
              <div className="archive-counts">
                <div><strong>{activeCustomers.length}</strong><span>Active customers</span></div>
                <div><strong>{activeOrders.length}</strong><span>Parent orders</span></div><div><strong>{activeJobs.length}</strong><span>Active jobs</span></div>
                <div><strong>{openQuotes.length}</strong><span>Open quotes</span></div>
                <div><strong>{unpaidInvoices.length}</strong><span>Unpaid invoices</span></div>
                <div><strong>{activeFiles.length}</strong><span>Active files</span></div>
                <div><strong>{inactiveCount}</strong><span>Archived / deleted</span></div>
              </div>
              <div className="backend-action-grid">
                <button type="button" onClick={() => setActiveSection("search")}><FileSearch size={21} /><strong>Search everything</strong><span>Find active, archived, or deleted records.</span></button>
                <button type="button" onClick={onOpenFiles}><FileArchive size={21} /><strong>Customer paperwork</strong><span>Upload and link artwork, proofs, invoices, and customer files.</span></button>
                <button type="button" onClick={() => setActiveSection("transfer")}><Upload size={21} /><strong>Import / Export</strong><span>Move Excel data in or out by record type.</span></button>
                <button type="button" onClick={() => setActiveSection("backups")}><HardDriveDownload size={21} /><strong>MIS data backup</strong><span>Save one JSON snapshot containing all MIS records and file links.</span></button>
                <button type="button" onClick={onOpenArchive}><ArchiveRestore size={21} /><strong>Recovery</strong><span>Restore archived and deleted jobs, customers, quotes, invoices, and files.</span></button>
                <button type="button" onClick={() => setActiveSection("health")}><ShieldCheck size={21} /><strong>Data health</strong><span>Check broken links, duplicates, and unlinked documents.</span></button>
              </div>
              <div className={`settings-callout ${health.issueCount ? "warning" : ""}`}>
                {health.issueCount ? <RefreshCw size={20} /> : <CheckCircle2 size={20} />}
                <div>
                  <strong>{health.issueCount ? `${health.issueCount} data issue groups need review` : "Data links look healthy"}</strong>
                  <span>{health.issueCount ? "Open Data health to review and safely repair links." : "No broken customer, job, quote, invoice, or file links were detected."}</span>
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "search" ? (
            <div className="back-office-search">
              <div className="archive-toolbar">
                <label className="search-inline wide">
                  <Search size={17} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, job numbers, emails, files, paper, notes..." autoFocus />
                </label>
                <label className="checkbox-row compact"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />Include archived and deleted</label>
              </div>
              <div className="back-office-search-results">
                {searchResults.map((result) => (
                  <article key={result.id}>
                    <span className="soft-chip">{result.kind}</span>
                    <div><strong>{result.title}</strong><small>{result.detail}</small></div>
                    <b>{result.state}</b>
                    {result.onOpen ? <button className="icon-button text-button" type="button" onClick={result.onOpen}><FolderOpen size={15} />Open</button> : null}
                  </article>
                ))}
                {query.trim() && !searchResults.length ? <div className="empty-state compact"><FileSearch size={30} /><strong>No matching records</strong><span>Try a customer name, job number, email, invoice number, or filename.</span></div> : null}
                {!query.trim() ? <div className="empty-state compact"><Search size={30} /><strong>Search the full MIS</strong><span>This search includes customers, jobs, quotes, invoices, files, and paper inventory.</span></div> : null}
              </div>
            </div>
          ) : null}

          {activeSection === "transfer" ? (
            <div className="transfer-grid">
              <TransferCard title="Customers" count={state.customers.length}><ImportExportToolbar label="Customers" filename="gross-printing-customers.xlsx" rows={state.customers as unknown as Record<string, unknown>[]} onImport={onImportCustomers} /></TransferCard>
              <TransferCard title="Jobs" count={state.jobs.length}><ImportExportToolbar label="Jobs" filename="gross-printing-jobs.xlsx" rows={state.jobs as unknown as Record<string, unknown>[]} onImport={onImportJobs} /></TransferCard>
              <TransferCard title="Quotes" count={state.quotes.length}><ImportExportToolbar label="Quotes" filename="gross-printing-quotes.xlsx" rows={state.quotes as unknown as Record<string, unknown>[]} onImport={onImportQuotes} /></TransferCard>
              <TransferCard title="Invoices" count={state.invoices.length}><ImportExportToolbar label="Invoices" filename="gross-printing-invoices.xlsx" rows={state.invoices as unknown as Record<string, unknown>[]} onImport={onImportInvoices} /></TransferCard>
              <TransferCard title="Paper inventory" count={state.paperStocks.length}><ImportExportToolbar label="Paper Inventory" filename="gross-printing-paper.xlsx" rows={state.paperStocks as unknown as Record<string, unknown>[]} onImport={onImportPaper} /></TransferCard>
              <TransferCard title="Pricing catalog" count={state.catalogPrices.length}><ImportExportToolbar label="Catalog Pricing" filename="gross-printing-pricing.xlsx" rows={state.catalogPrices as unknown as Record<string, unknown>[]} onImport={onImportCatalog} /></TransferCard>
            </div>
          ) : null}

          {activeSection === "backups" ? (
            <div className="backup-center">
              <section className="settings-card large-card">
                <Download size={23} />
                <strong>Download MIS data backup</strong>
                <span>Includes customers, parent orders, jobs, multi-line quotes and invoices, file records and storage paths, workflow history, paper, pricing, machines, and settings.</span>
                <button className="primary-button" type="button" onClick={() => downloadJson(datedBackupName(), backupEnvelope)}><HardDriveDownload size={16} />Download MIS backup</button>
              </section>
              <section className="settings-card large-card warning-card">
                <Upload size={23} />
                <strong>Restore an MIS data backup</strong>
                <span>Restoring replaces the current MIS records with the records inside the selected Gross Printing backup. Stored file contents remain in the Supabase Storage bucket.</span>
                <button className="icon-button text-button" type="button" onClick={() => backupInputRef.current?.click()}><Upload size={16} />Choose backup file</button>
                <input ref={backupInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void restoreBackup(event.target.files?.[0] ?? null)} />
                {restoreMessage ? <small className="backup-message">{restoreMessage}</small> : null}
              </section>
              <div className="settings-callout">
                <ShieldCheck size={20} />
                <div><strong>Safe backup rule</strong><span>Download a backup before a large Excel import, bulk cleanup, or database migration.</span></div>
              </div>
            </div>
          ) : null}

          {activeSection === "health" ? (
            <div className="data-health">
              <div className="archive-counts">
                <div><strong>{health.duplicateCustomerGroups.length}</strong><span>Duplicate customer groups</span></div>
                <div><strong>{health.orphanJobs.length}</strong><span>Jobs missing customer</span></div>
                <div><strong>{health.orphanQuotes.length}</strong><span>Broken quote links</span></div>
                <div><strong>{health.orphanInvoices.length}</strong><span>Broken invoice links</span></div>
                <div><strong>{health.orphanFiles.length}</strong><span>Broken file links</span></div>
                <div><strong>{health.unlinkedFiles.length}</strong><span>Unlinked files</span></div>
              </div>
              <div className="button-row right">
                <button className="primary-button" type="button" onClick={onRepairData} disabled={!health.issueCount}><RefreshCw size={16} />Repair safe links</button>
              </div>
              <div className="health-list">
                <HealthRow label="Duplicate customers" count={health.duplicateCustomerGroups.length} detail="Same normalized name or email. These are flagged only; they are not merged automatically." />
                <HealthRow label="Orphan jobs" count={health.orphanJobs.length} detail="Jobs whose customer ID no longer exists." />
                <HealthRow label="Broken quote links" count={health.orphanQuotes.length} detail="Quotes missing a linked job or customer." />
                <HealthRow label="Broken invoice links" count={health.orphanInvoices.length} detail="Invoices missing a linked job or customer." />
                <HealthRow label="Broken file links" count={health.orphanFiles.length} detail="Files pointing to a missing customer or job." />
                <HealthRow label="Unlinked files" count={health.unlinkedFiles.length} detail="Files that are valid but are not linked to a customer or job." />
                <HealthRow label="Invalid customer emails" count={health.invalidEmails.length} detail="Customer email text that cannot be used for normal system email delivery." />
              </div>
              <p className="muted">Safe repair updates names and valid cross-links where the correct record can be identified. It never merges customers or deletes records automatically.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function TransferCard({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section className="transfer-card"><div><strong>{title}</strong><span>{count.toLocaleString()} records</span></div>{children}</section>;
}

function HealthRow({ label, count, detail }: { label: string; count: number; detail: string }) {
  return <article className={count ? "issue" : "clear"}><div>{count ? <RefreshCw size={17} /> : <CheckCircle2 size={17} />}<span><strong>{label}</strong><small>{detail}</small></span></div><b>{count}</b></article>;
}
