"use client";

import { Archive, ArrowRight, BriefcaseBusiness, FileText, FolderOpen, Grid2X2, List, ReceiptText, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { Customer, Invoice, Job, Quote, UploadedFile } from "@/lib/types";
import { ImportExportToolbar } from "./ImportExportToolbar";
import { CustomerForm } from "./CustomerForm";
import { RecordModal } from "./RecordModal";
import { StatusBadge } from "./StatusBadge";
import { CustomerPortalAdminPanel } from "./CustomerPortalAdminPanel";

interface CustomerPortalProps {
  customers: Customer[];
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  files: UploadedFile[];
  onAddCustomer: (customer: Omit<Customer, "id">) => string;
  onUpdateCustomer: (customerId: string, updates: Partial<Omit<Customer, "id">>) => void;
  onArchiveCustomer: (customerId: string) => void;
  /** Move everything from the first customer onto the second, then archive the first. */
  onMergeCustomers?: (loserId: string, survivorId: string) => void;
  onImportCustomers: (rows: Record<string, unknown>[]) => void;
  onOpenFiles: (customerId: string) => void;
  onOpenFile?: (fileId: string) => void;
  onOpenJob?: (jobId: string) => void;
  onStartEstimate?: (customerId: string, mode: "quote" | "job") => void;
  focusedCustomerId?: string;
  authToken?: string;
  canManagePortal?: boolean;
  canBulkManage?: boolean;
}

export function CustomerPortal({
  customers,
  jobs,
  quotes,
  invoices,
  files,
  onAddCustomer,
  onUpdateCustomer,
  onArchiveCustomer,
  onMergeCustomers,
  onImportCustomers,
  onOpenFiles,
  onOpenFile,
  onOpenJob,
  onStartEstimate,
  focusedCustomerId,
  authToken,
  canManagePortal = false,
  canBulkManage = false
}: CustomerPortalProps) {
  const visibleCustomers = customers.filter((customer) => !customer.archived && !customer.deletedAt);
  const [view, setView] = useState<"table" | "cards">("table");
  const [selectedId, setSelectedId] = useState("");
  const [customerSection, setCustomerSection] = useState<"overview" | "jobs" | "files" | "account">("overview");
  const [showAdd, setShowAdd] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [newContact, setNewContact] = useState({ name: "", email: "", phone: "", department: "" });
  const selected = customers.find((customer) => customer.id === selectedId);
  const history = useMemo(() => {
    if (!selected) return { jobs: [], quotes: [], invoices: [], files: [], pdfFiles: [] };
    const customerFiles = files.filter((file) => file.customerId === selected.id && !file.deletedAt);
    return {
      jobs: jobs.filter((job) => job.customerId === selected.id),
      quotes: quotes.filter((quote) => quote.customerId === selected.id),
      invoices: invoices.filter((invoice) => invoice.customerId === selected.id),
      files: customerFiles,
      pdfFiles: customerFiles.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
    };
  }, [selected, jobs, quotes, invoices, files]);
  const recentActivity = useMemo(() => {
    if (!selected) return [] as Array<{ id: string; label: string; detail: string; at: string; kind: string }>;
    return [
      ...history.jobs.map((job) => ({ id: `job-${job.id}`, label: `${job.jobNumber} · ${job.title}`, detail: `Job · ${job.status}`, at: job.updatedAt || job.createdAt, kind: "Job" })),
      ...history.quotes.map((quote) => ({ id: `quote-${quote.id}`, label: `${quote.quoteNumber} · ${quote.title}`, detail: `Quote · ${quote.status}`, at: quote.sentAt || quote.createdAt, kind: "Quote" })),
      ...history.invoices.map((invoice) => ({ id: `invoice-${invoice.id}`, label: `${invoice.invoiceNumber} · ${invoice.title}`, detail: `Invoice · ${invoice.status}`, at: invoice.updatedAt || invoice.createdAt, kind: "Invoice" })),
      ...history.files.map((file) => ({ id: `file-${file.id}`, label: file.name, detail: `${file.jobNumber ? `${file.jobNumber} · ` : ""}${file.folder}`, at: file.uploadedAt, kind: "File" }))
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5);
  }, [selected, history]);

  useEffect(() => {
    if (focusedCustomerId) {
      setSelectedId(focusedCustomerId);
    }
  }, [focusedCustomerId]);

  useEffect(() => {
    setArchiveConfirm(false);
    setMergeTargetId("");
    setCustomerSection("overview");
    setNewContact({ name: "", email: "", phone: "", department: "" });
  }, [selectedId]);

  return (
    <main className="page-view customer-page">
      <div className="section-heading">
        <div>
          <p>Customers</p>
          <h1>Customers</h1>
        </div>
        <div className="toolbar-actions">
          <button className="primary-button" type="button" onClick={() => setShowAdd((current) => !current)}>
            <UserPlus size={16} />
            Add Customer
          </button>
          {canBulkManage ? (
            <ImportExportToolbar
              label="Customers"
              filename="gross-printing-customers.xlsx"
              rows={visibleCustomers as unknown as Record<string, unknown>[]}
              onImport={onImportCustomers}
            />
          ) : null}
          <div className="segmented compact-toggle">
            <button className={view === "table" ? "active" : ""} type="button" onClick={() => setView("table")} title="Table view">
              <List size={16} />
            </button>
            <button className={view === "cards" ? "active" : ""} type="button" onClick={() => setView("cards")} title="Card view">
              <Grid2X2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {showAdd ? (
        <RecordModal title="New customer" subtitle="Available immediately in estimates and jobs" onClose={() => setShowAdd(false)}>
          {/*
            The same form Job Setup and the email ticket path use, so a customer
            created here gets the same fields and the same duplicate check as one
            created anywhere else.
          */}
          <CustomerForm
            customers={customers}
            onCreate={onAddCustomer}
            onCreated={(id) => { setSelectedId(id); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)}
            onOpenExisting={(id) => { setSelectedId(id); setShowAdd(false); }}
            submitLabel="Save customer"
          />
        </RecordModal>
      ) : null}

      <div>
        <section className={view === "table" ? "panel table-panel primary-data-table customer-data-table" : "customer-card-grid"}>
          {view === "table" ? (
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Terms</th>
                  <th>Open balance</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map((customer) => (
                  <tr className={customer.id === selected?.id ? "selected-row" : ""} key={customer.id} onClick={() => setSelectedId(customer.id)}>
                    <td>
                      <strong>{customer.name}</strong>
                      <span>{customer.companyType}</span>
                    </td>
                    <td>{customer.contact}</td>
                    <td>{customer.terms}</td>
                    <td>{formatMoney(customer.openBalance ?? customer.totalSpend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            visibleCustomers.map((customer) => (
              <button className={`customer-card ${customer.id === selected?.id ? "active" : ""}`} type="button" key={customer.id} onClick={() => setSelectedId(customer.id)}>
                <strong>{customer.name}</strong>
                <span>{customer.contact}</span>
                <small>{customer.email}</small>
                <b>{formatMoney(customer.totalSpend)}</b>
                {customer.openBalance ? <small>Open {formatMoney(customer.openBalance)}</small> : null}
              </button>
            ))
          )}
        </section>

      </div>

      {selected ? (
        <RecordModal title={selected.name} eyebrow="Customer record" subtitle={`${selected.contact} / ${selected.email}`} onClose={() => setSelectedId("")} className="wide customer-command-modal">
          <div className="customer-command-header">
            <div className="customer-totals customer-totals-four">
              <div><span>Open balance</span><strong>{formatMoney(selected.openBalance ?? selected.totalSpend)}</strong></div>
              <div><span>Jobs</span><strong>{history.jobs.length}</strong></div>
              <div><span>Quotes</span><strong>{history.quotes.length}</strong></div>
              <div><span>PDFs</span><strong>{history.pdfFiles.length}</strong></div>
            </div>
            <div className="customer-command-actions">
              {onStartEstimate ? <button className="primary-button" type="button" onClick={() => onStartEstimate(selected.id, "job")}><BriefcaseBusiness size={16} />New job</button> : null}
              {onStartEstimate ? <button className="secondary-button" type="button" onClick={() => onStartEstimate(selected.id, "quote")}><ReceiptText size={16} />New quote</button> : null}
            </div>
          </div>

          <nav className="customer-record-tabs" aria-label="Customer record sections">
            <button type="button" className={customerSection === "overview" ? "active" : ""} onClick={() => setCustomerSection("overview")}>Overview</button>
            <button type="button" className={customerSection === "jobs" ? "active" : ""} onClick={() => setCustomerSection("jobs")}>Jobs & quotes <b>{history.jobs.length + history.quotes.length}</b></button>
            <button type="button" className={customerSection === "files" ? "active" : ""} onClick={() => setCustomerSection("files")}>PDFs & files <b>{history.files.length}</b></button>
            <button type="button" className={customerSection === "account" ? "active" : ""} onClick={() => setCustomerSection("account")}>Account & contacts</button>
          </nav>

          {customerSection === "overview" ? (
            <div className="customer-section-stack">
              <section className="customer-overview-hero">
                <div>
                  <p>Customer overview</p>
                  <h3>{selected.name}</h3>
                  <span>{[selected.email, selected.phone].filter(Boolean).join(" · ") || "No contact information saved"}</span>
                </div>
                <button className="icon-button text-button" type="button" onClick={() => onOpenFiles(selected.id)}><FolderOpen size={16} />Open all customer files</button>
              </section>
              <div className="customer-overview-grid">
                <section className="history-block customer-history-card">
                  <div className="history-block-heading"><div><h3>Recent jobs</h3><small>Past work for this customer stays connected to the account.</small></div><button className="text-button small" type="button" onClick={() => setCustomerSection("jobs")}>View all</button></div>
                  {history.jobs.slice(0, 3).map((job) => (
                    <button className="customer-history-open-row" type="button" key={job.id} onClick={() => onOpenJob?.(job.id)}>
                      <span><strong>{job.jobNumber} · {job.title}</strong><small>{job.quantity.toLocaleString()} qty · {job.stockName} · {job.status}</small></span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                  {!history.jobs.length ? <p className="muted">No old jobs yet.</p> : null}
                </section>
                <section className="history-block customer-history-card">
                  <div className="history-block-heading"><div><h3>Customer PDFs</h3><small>Artwork and paperwork linked from email, portal, and jobs.</small></div><button className="text-button small" type="button" onClick={() => setCustomerSection("files")}>View all</button></div>
                  {history.pdfFiles.slice(0, 3).map((file) => (
                    <button className="customer-history-open-row" type="button" key={file.id} onClick={() => onOpenFile?.(file.id)}>
                      <span><strong>{file.name}</strong><small>{file.jobNumber ? `${file.jobNumber} · ` : ""}{file.folder} · {new Date(file.uploadedAt).toLocaleDateString()}</small></span>
                      <FileText size={15} />
                    </button>
                  ))}
                  {!history.pdfFiles.length ? <p className="muted">No PDFs have been linked to this customer yet.</p> : null}
                </section>
              </div>
              <section className="history-block customer-history-card customer-last-activity">
                <div className="history-block-heading"><div><h3>Last activity</h3><small>A short snapshot only. Full jobs, quotes, files, and account history stay in their tabs.</small></div></div>
                {recentActivity.map((item) => <div className="history-row compact" key={item.id}><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{new Date(item.at).toLocaleDateString()}</b></div>)}
                {!recentActivity.length ? <p className="muted">No customer activity yet.</p> : null}
              </section>
            </div>
          ) : null}

          {customerSection === "jobs" ? (
            <div className="customer-section-stack">
              <section className="history-block customer-history-card">
                <div className="history-block-heading"><div><h3>All jobs</h3><small>Click any job to open the full job, production setup, pricing, and attached files.</small></div></div>
                {history.jobs.map((job) => (
                  <button className="customer-history-open-row expanded" type="button" key={job.id} onClick={() => onOpenJob?.(job.id)}>
                    <span><strong>{job.jobNumber} · {job.title}</strong><small>{job.quantity.toLocaleString()} qty · {job.pieceWidth} × {job.pieceHeight} in · {job.stockName}</small></span>
                    <span className="customer-history-row-meta"><StatusBadge status={job.status} /><b>{formatMoney(job.pricing.total)}</b><ArrowRight size={15} /></span>
                  </button>
                ))}
                {!history.jobs.length ? <p className="muted">No jobs yet.</p> : null}
              </section>
              <section className="history-block customer-history-card">
                <div className="history-block-heading"><div><h3>Quotes</h3><small>All saved quotes for this customer.</small></div></div>
                {history.quotes.map((quote) => <div className="history-row" key={quote.id}><span>{quote.quoteNumber} / {quote.title}</span><strong>{formatMoney(quote.amount)}</strong></div>)}
                {!history.quotes.length ? <p className="muted">No quotes yet.</p> : null}
              </section>
            </div>
          ) : null}

          {customerSection === "files" ? (
            <div className="customer-section-stack">
              <section className="customer-files-toolbar">
                <div><strong>All customer PDFs and files</strong><span>Files stay linked to the customer even after an old job is finished.</span></div>
                <button className="secondary-button" type="button" onClick={() => onOpenFiles(selected.id)}><FolderOpen size={16} />Open file workspace</button>
              </section>
              <section className="customer-file-list">
                {history.files.map((file) => (
                  <article key={file.id} className={file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "pdf" : ""}>
                    <div className="customer-file-icon"><FileText size={20} /></div>
                    <div><strong>{file.name}</strong><span>{file.jobNumber ? `${file.jobNumber} · ` : ""}{file.folder} · {file.status}</span><small>{new Date(file.uploadedAt).toLocaleDateString()} · {Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB</small></div>
                    {onOpenFile ? <button className="text-button small" type="button" onClick={() => onOpenFile(file.id)}>Open</button> : null}
                  </article>
                ))}
                {!history.files.length ? <div className="empty-state compact"><FileText size={26} /><strong>No customer files yet</strong><span>Email artwork and saved job PDFs will appear here after they are linked.</span></div> : null}
              </section>
            </div>
          ) : null}

          {customerSection === "account" ? (
            <div className="customer-section-stack">
              <section className="history-block customer-history-card">
                <h3>Customer information</h3>
                <div className="customer-edit-form">
                  <label>Customer name<input value={selected.name} onChange={(event) => onUpdateCustomer(selected.id, { name: event.target.value })} /></label>
                  <label>Contact<input value={selected.contact} onChange={(event) => onUpdateCustomer(selected.id, { contact: event.target.value })} /></label>
                  <label>Email<input type="email" value={selected.email} onChange={(event) => onUpdateCustomer(selected.id, { email: event.target.value })} /></label>
                  <label>Phone<input value={selected.phone} onChange={(event) => onUpdateCustomer(selected.id, { phone: event.target.value })} /></label>
                  <label>Type<input value={selected.companyType} onChange={(event) => onUpdateCustomer(selected.id, { companyType: event.target.value })} /></label>
                  <label>Terms<select value={selected.terms} onChange={(event) => onUpdateCustomer(selected.id, { terms: event.target.value })}><option>Due on receipt</option><option>Net 15</option><option>Net 30</option><option>COD</option></select></label>
                  <label>Street address<input value={selected.address ?? ""} onChange={(event) => onUpdateCustomer(selected.id, { address: event.target.value })} /></label>
                  <label>City<input value={selected.city ?? ""} onChange={(event) => onUpdateCustomer(selected.id, { city: event.target.value })} /></label>
                  <label>State<input value={selected.state ?? ""} onChange={(event) => onUpdateCustomer(selected.id, { state: event.target.value })} /></label>
                  <label>Zip<input value={selected.zip ?? ""} onChange={(event) => onUpdateCustomer(selected.id, { zip: event.target.value })} /></label>
                  {/*
                    Open balance and lifetime spend are different numbers and are
                    kept apart. This field used to write both, so clearing a
                    balance silently rewrote a customer's whole history to zero.
                  */}
                  <label>Open balance<input type="number" min="0" step="0.01" value={selected.openBalance ?? 0} onChange={(event) => onUpdateCustomer(selected.id, { openBalance: Number(event.target.value) || 0 })} /></label>
                  <label>Lifetime spend<input type="text" value={formatMoney(selected.totalSpend)} readOnly disabled /><small>Totalled from invoices. Not editable here.</small></label>
                </div>
              </section>

              <section className="customer-pricing-control">
                <div className="customer-pricing-control-heading">
                  <div><p>Pricing & portal</p><h3>B2B account pricing</h3><span>Only enabled customers can see automatic prices in the private portal. Public website visitors never see these prices.</span></div>
                  <label className="customer-pricing-switch"><input type="checkbox" checked={selected.portalPricingEnabled === true} onChange={(event) => onUpdateCustomer(selected.id, { portalPricingEnabled: event.target.checked })} /><span>{selected.portalPricingEnabled ? "Automatic pricing ON" : "Automatic pricing OFF"}</span></label>
                </div>
                <div className="customer-pricing-grid">
                  <label>Pricing tier<select value={selected.pricingTier ?? "standard"} onChange={(event) => onUpdateCustomer(selected.id, { pricingTier: event.target.value as "standard" | "wholesale" | "reseller" | "custom" })}><option value="standard">Standard</option><option value="wholesale">Wholesale</option><option value="reseller">Reseller</option><option value="custom">Custom</option></select></label>
                  <label>Global adjustment %<input type="number" min="-50" max="100" step="0.5" value={selected.pricingAdjustmentPercent ?? 0} onChange={(event) => onUpdateCustomer(selected.id, { pricingAdjustmentPercent: Number(event.target.value) || 0 })} /><small>Use a negative number for a discount, for example -10.</small></label>
                  <label className="customer-pricing-check"><input type="checkbox" checked={selected.portalInstantOrderEnabled === true} onChange={(event) => onUpdateCustomer(selected.id, { portalInstantOrderEnabled: event.target.checked })} />Allow instant portal order when a secure price is available</label>
                  <label className="customer-pricing-check"><input type="checkbox" checked={selected.portalQuoteApprovalRequired !== false} onChange={(event) => onUpdateCustomer(selected.id, { portalQuoteApprovalRequired: event.target.checked })} />Require Gross Printing approval before customer quote is final</label>
                </div>
                <div className="customer-product-adjustments">
                  <strong>Product-specific adjustment</strong><span>Leave blank to use the global adjustment. Product-specific values override the global percentage.</span>
                  <div>{["Business Cards", "Flyers / Brochures", "Booklets", "Labels / Stickers", "Envelopes", "Signs / Banners"].map((product) => <label key={product}>{product}<input type="number" min="-50" max="100" step="0.5" placeholder="Global" value={typeof selected.productPricingAdjustments?.[product] === "number" ? selected.productPricingAdjustments[product] : ""} onChange={(event) => { const next = { ...(selected.productPricingAdjustments ?? {}) }; if (event.target.value === "") delete next[product]; else next[product] = Number(event.target.value) || 0; onUpdateCustomer(selected.id, { productPricingAdjustments: next }); }} /></label>)}</div>
                </div>
              </section>

              {canManagePortal ? <CustomerPortalAdminPanel customer={selected} authToken={authToken} /> : null}
              <section className="history-block customer-business-contacts customer-history-card">
                <div className="history-block-heading"><div><h3>Business contacts</h3><small>Saved employee/contact emails help Email Center recognize the correct company.</small></div></div>
                {(selected.contacts ?? []).map((contact) => <div className="history-row" key={contact.id}><span><strong>{contact.name}</strong><small>{contact.email}{contact.department ? ` · ${contact.department}` : ""}{contact.phone ? ` · ${contact.phone}` : ""}</small></span><button className="text-button small danger" type="button" onClick={() => onUpdateCustomer(selected.id, { contacts: (selected.contacts ?? []).filter((item) => item.id !== contact.id) })}>Remove</button></div>)}
                <div className="customer-contact-add-grid">
                  <input placeholder="Contact name" value={newContact.name} onChange={(event) => setNewContact({ ...newContact, name: event.target.value })} />
                  <input type="email" placeholder="Email" value={newContact.email} onChange={(event) => setNewContact({ ...newContact, email: event.target.value })} />
                  <input placeholder="Department" value={newContact.department} onChange={(event) => setNewContact({ ...newContact, department: event.target.value })} />
                  <input placeholder="Phone" value={newContact.phone} onChange={(event) => setNewContact({ ...newContact, phone: event.target.value })} />
                  <button className="secondary-button" type="button" disabled={!newContact.name.trim() || !newContact.email.trim()} onClick={() => { const contact = { id: `contact-${crypto.randomUUID().slice(0, 10)}`, name: newContact.name.trim(), email: newContact.email.trim().toLowerCase(), phone: newContact.phone.trim() || undefined, department: newContact.department.trim() || undefined }; onUpdateCustomer(selected.id, { contacts: [...(selected.contacts ?? []), contact] }); setNewContact({ name: "", email: "", phone: "", department: "" }); }}><UserPlus size={15} />Add contact</button>
                </div>
              </section>
            </div>
          ) : null}

          {canBulkManage ? (
            <div className="button-row customer-archive-row">
              {/*
                Merging is hard to reverse, so nothing happens until staff has
                named the record that survives and read what will move. The
                duplicate is archived, never deleted.
              */}
              {onMergeCustomers && visibleCustomers.length > 1 ? (
                <div className="customer-merge">
                  <label>
                    <span>Merge this customer into</span>
                    <select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>
                      <option value="">Choose the customer to keep…</option>
                      {visibleCustomers
                        .filter((customer) => customer.id !== selected.id)
                        .map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
                    </select>
                  </label>
                  {mergeTargetId ? (
                    <div className="customer-merge-confirm">
                      <p>
                        <strong>{history.jobs.length + history.quotes.length + history.invoices.length + history.files.length}</strong>
                        {" "}record(s) move from <strong>{selected.name}</strong> to{" "}
                        <strong>{visibleCustomers.find((customer) => customer.id === mergeTargetId)?.name}</strong>,
                        along with its email and contacts. <strong>{selected.name}</strong> is then archived — not deleted,
                        so this can be undone.
                      </p>
                      <div>
                        <button className="secondary-button" type="button" onClick={() => setMergeTargetId("")}>Cancel</button>
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => {
                            onMergeCustomers(selected.id, mergeTargetId);
                            setSelectedId(mergeTargetId);
                            setMergeTargetId("");
                          }}
                        >
                          Merge into {visibleCustomers.find((customer) => customer.id === mergeTargetId)?.name}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {archiveConfirm ? <><span className="muted">Archive this customer?</span><button className="icon-button text-button" type="button" onClick={() => setArchiveConfirm(false)}>Cancel</button><button className="icon-button text-button danger" type="button" onClick={() => { onArchiveCustomer(selected.id); setSelectedId(""); setArchiveConfirm(false); }}><Archive size={16} />Yes, archive</button></> : <button className="icon-button text-button" type="button" onClick={() => setArchiveConfirm(true)}><Archive size={16} />Archive customer</button>}
            </div>
          ) : null}
        </RecordModal>
      ) : null}
    </main>
  );
}
