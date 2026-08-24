"use client";

import { Archive, CheckCircle2, FileDown, Mail, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { Invoice, Job } from "@/lib/types";
import { ImportExportToolbar } from "./ImportExportToolbar";
import { RecordModal } from "./RecordModal";

interface InvoicesProps {
  invoices: Invoice[];
  jobs: Job[];
  onEmailInvoice: (invoiceId: string) => void;
  onArchiveInvoice: (invoiceId: string) => void;
  onMarkInvoiceReady: (invoiceId: string) => void;
  onImportInvoices: (rows: Record<string, unknown>[]) => void;
  focusedInvoiceId?: string;
}

export function Invoices({ invoices, jobs, onEmailInvoice, onArchiveInvoice, onMarkInvoiceReady, onImportInvoices, focusedInvoiceId }: InvoicesProps) {
  const visibleInvoices = invoices.filter((invoice) => !invoice.archived && !invoice.deletedAt);
  const [selectedId, setSelectedId] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const selected = visibleInvoices.find((invoice) => invoice.id === selectedId);
  const job = selected ? jobs.find((item) => item.id === selected.jobId) : undefined;
  const lineItems = selected?.lineItems?.length
    ? selected.lineItems.map((line) => ({ label: line.title, detail: `${line.quantity.toLocaleString()} pcs${line.description ? ` / ${line.description}` : ""}`, amount: line.amount }))
    : job
      ? [
          { label: "Paper", detail: job.stockName, amount: job.pricing.paper },
          { label: "Printing", detail: `${job.quantity.toLocaleString()} pcs / ${job.colorSpec}`, amount: job.pricing.printing },
          { label: "Finishing", detail: job.bindery.join(", ") || "Standard production", amount: job.pricing.finishing },
          { label: "Cutting", detail: "$2 per actual cut, based on piles", amount: job.pricing.cutting },
          ...(job.pricing.bookletCover ? [{ label: "Booklet cover", detail: "Cover setup and booklet rules", amount: job.pricing.bookletCover }] : [])
        ].filter((item) => item.amount > 0)
      : [{ label: "Production job", detail: selected?.title ?? "", amount: selected?.amount ?? 0 }];

  useEffect(() => {
    setArchiveConfirm(false);
  }, [selectedId]);

  useEffect(() => {
    if (focusedInvoiceId && visibleInvoices.some((invoice) => invoice.id === focusedInvoiceId)) {
      setSelectedId(focusedInvoiceId);
    }
  }, [focusedInvoiceId, visibleInvoices.length]);

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Invoices</p>
          <h1>Draft invoices created when jobs become Ready</h1>
        </div>
        <ImportExportToolbar
          label="Invoices"
          filename="gross-printing-invoices.xlsx"
          rows={visibleInvoices as unknown as Record<string, unknown>[]}
          onImport={onImportInvoices}
        />
      </div>
      <div>
        <section className="panel table-panel primary-data-table">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((invoice) => (
                <tr className={invoice.id === selected?.id ? "selected-row" : ""} key={invoice.id} onClick={() => setSelectedId(invoice.id)}>
                  <td>
                    <strong>{invoice.invoiceNumber}</strong>
                    <span>{invoice.title}</span>
                  </td>
                  <td>{invoice.customerName}</td>
                  <td>{invoice.status}</td>
                  <td>{formatMoney(invoice.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

      </div>

      {selected ? (
        <RecordModal title={selected.invoiceNumber} eyebrow={selected.status} subtitle={`${selected.customerName} / ${selected.title}`} onClose={() => setSelectedId("")} className="wide">
          <aside className="invoice-detail">
            <div className="invoice-paper">
              <div className="invoice-logo-card">
                <img src="/brand/gross-printing-card.png" alt="Printed by Gross Printing" />
              </div>
              <div className="invoice-top">
                <div>
                  <p>Invoice</p>
                  <h2>{selected.invoiceNumber}</h2>
                </div>
                <div className="invoice-meta">
                  <strong>{selected.status}</strong>
                  <span>{new Date(selected.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="invoice-parties">
                <div className="invoice-to">
                  <span>Bill to</span>
                  <h3>{selected.customerName}</h3>
                  <p>{selected.title}</p>
                </div>
                <div className="invoice-to right-align">
                  <span>{selected.orderId ? "Order" : "Job"}</span>
                  <h3>{selected.orderId ? selected.title.split(" — ")[0] : job?.jobNumber ?? selected.jobId}</h3>
                  <p>{selected.orderId ? `${selected.lineItems?.length ?? selected.jobIds?.length ?? 1} production items` : job ? `${job.quantity.toLocaleString()} pcs / due ${job.dueDate} ${job.dueTime}` : "Production invoice"}</p>
                </div>
              </div>
              <div className="invoice-lines">
                {lineItems.map((item) => (
                  <div className="invoice-line" key={item.label}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <strong>{formatMoney(item.amount)}</strong>
                  </div>
                ))}
              </div>
              <div className="invoice-total">
                <span>Total</span>
                <strong>{formatMoney(selected.amount)}</strong>
              </div>
              <p className="invoice-note">Thank you for printing with Gross Printing. Payment is due according to customer terms on file.</p>
            </div>
            <div className="button-row">
              <button className="icon-button text-button" type="button" onClick={() => window.print()}>
                <Printer size={16} />
                Print
              </button>
              <button className="icon-button text-button" type="button" onClick={() => window.print()}>
                <FileDown size={16} />
                PDF
              </button>
              {selected.status === "Draft" ? (
                <button className="icon-button text-button" type="button" onClick={() => onMarkInvoiceReady(selected.id)}>
                  <CheckCircle2 size={16} />
                  Mark ready
                </button>
              ) : null}
              <button className="primary-button" type="button" onClick={() => onEmailInvoice(selected.id)}>
                <Mail size={16} />
                {selected.status === "Sent" ? "Send again" : "Email invoice"}
              </button>
              {archiveConfirm ? (
                <>
                  <button className="icon-button text-button" type="button" onClick={() => setArchiveConfirm(false)}>
                    Cancel
                  </button>
                  <button
                    className="icon-button text-button danger"
                    type="button"
                    onClick={() => {
                      onArchiveInvoice(selected.id);
                      setSelectedId("");
                      setArchiveConfirm(false);
                    }}
                  >
                    <Archive size={16} />
                    Archive
                  </button>
                </>
              ) : (
                <button className="icon-button text-button" type="button" onClick={() => setArchiveConfirm(true)}>
                  <Archive size={16} />
                  Archive
                </button>
              )}
            </div>
          </aside>
        </RecordModal>
      ) : null}
    </main>
  );
}
