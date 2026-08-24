"use client";

import { Archive, BriefcaseBusiness, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { Job, Quote } from "@/lib/types";
import { ImportExportToolbar } from "./ImportExportToolbar";
import { RecordModal } from "./RecordModal";

interface QuotesProps {
  quotes: Quote[];
  jobs: Job[];
  onSendQuote: (quoteId: string) => void;
  onConvertQuote: (quoteId: string) => void;
  onArchiveQuote: (quoteId: string) => void;
  onImportQuotes: (rows: Record<string, unknown>[]) => void;
  focusedQuoteId?: string;
}

export function Quotes({ quotes, jobs, onSendQuote, onConvertQuote, onArchiveQuote, onImportQuotes, focusedQuoteId }: QuotesProps) {
  const availableQuotes = quotes.filter((quote) => !quote.deletedAt);
  const activeQuotes = availableQuotes.filter((quote) => !quote.archived && quote.status !== "Approved" && quote.status !== "Archived");
  const recentlyConverted = availableQuotes
    .filter((quote) => !quote.archived && quote.status === "Approved")
    .filter((quote) => {
      const linkedIds = quote.jobIds?.length ? quote.jobIds : [quote.jobId];
      const linked = jobs.filter((job) => linkedIds.includes(job.id));
      const latest = linked.map((job) => new Date(job.updatedAt).getTime()).filter(Number.isFinite).sort((a, b) => b - a)[0];
      return latest ? Date.now() - latest <= 7 * 24 * 60 * 60 * 1000 : false;
    });
  const [selectedId, setSelectedId] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const selected = availableQuotes.find((quote) => quote.id === selectedId);
  const job = selected ? jobs.find((item) => item.id === selected.jobId) : undefined;

  useEffect(() => {
    setArchiveConfirm(false);
  }, [selectedId]);

  useEffect(() => {
    if (focusedQuoteId && availableQuotes.some((quote) => quote.id === focusedQuoteId)) {
      setSelectedId(focusedQuoteId);
    }
  }, [focusedQuoteId, availableQuotes.length]);

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Quotes</p>
          <h1>Quote list and conversion queue</h1>
        </div>
        <ImportExportToolbar
          label="Quotes"
          filename="gross-printing-quotes.xlsx"
          rows={activeQuotes as unknown as Record<string, unknown>[]}
          onImport={onImportQuotes}
        />
      </div>

      <div>
        <section className="panel table-panel primary-data-table">
          <table>
            <thead>
              <tr>
                <th>Quote</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {activeQuotes.map((quote) => (
                <tr className={quote.id === selected?.id ? "selected-row" : ""} key={quote.id} onClick={() => setSelectedId(quote.id)}>
                  <td>
                    <strong>{quote.quoteNumber}</strong>
                    <span>{quote.title}</span>
                  </td>
                  <td>{quote.customerName}</td>
                  <td>{quote.status}</td>
                  <td>{formatMoney(quote.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!activeQuotes.length ? <div className="clean-empty-state"><strong>No active quotes</strong><span>Approved quotes automatically leave this list and stay in history.</span></div> : null}
        </section>

        {recentlyConverted.length ? (
          <details className="recent-history-panel">
            <summary>Recently converted <span>{recentlyConverted.length}</span></summary>
            <div className="recent-history-list">
              {recentlyConverted.map((quote) => (
                <button type="button" key={quote.id} onClick={() => setSelectedId(quote.id)}>
                  <span><strong>{quote.quoteNumber}</strong><small>{quote.customerName} · {quote.title}</small></span>
                  <b>{formatMoney(quote.amount)}</b>
                </button>
              ))}
            </div>
          </details>
        ) : null}

      </div>

      {selected ? (
        <RecordModal title={selected.quoteNumber} eyebrow={selected.status} subtitle={`${selected.title} / ${selected.customerName}`} onClose={() => setSelectedId("")}>
          <div className="pricing-breakdown">
            <div><span>Quote amount</span><strong>{formatMoney(selected.amount)}</strong></div>
            <div><span>{selected.orderId ? "Order items" : "Job status"}</span><strong>{selected.orderId ? `${selected.lineItems?.length ?? selected.jobIds?.length ?? 1} jobs` : job?.status ?? "Missing job"}</strong></div>
            <div><span>Created</span><strong>{new Date(selected.createdAt).toLocaleDateString()}</strong></div>
          </div>
          {selected.lineItems?.length ? (
            <section className="record-line-items">
              <h3>Quote line items</h3>
              {selected.lineItems.map((line) => (
                <div key={line.id}><span><strong>{line.title}</strong><small>{line.quantity.toLocaleString()} pcs{line.description ? ` · ${line.description}` : ""}</small></span><b>{formatMoney(line.amount)}</b></div>
              ))}
            </section>
          ) : null}
          <div className="button-column">
            <button className="primary-button full" type="button" onClick={() => onConvertQuote(selected.id)} disabled={selected.status === "Approved"}>
              <BriefcaseBusiness size={16} />
              {selected.status === "Approved" ? "Already in production" : selected.orderId ? "Approve all order jobs" : "Convert to Job"}
            </button>
            <button className="icon-button text-button full" type="button" onClick={() => onSendQuote(selected.id)}>
              <Mail size={16} />
              Send Quote Email
            </button>
            {archiveConfirm ? (
              <div className="archive-confirm">
                <span>Archive this quote?</span>
                <button className="icon-button text-button small" type="button" onClick={() => setArchiveConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="icon-button text-button small"
                  type="button"
                  onClick={() => {
                    onArchiveQuote(selected.id);
                    setArchiveConfirm(false);
                    setSelectedId("");
                  }}
                >
                  <Archive size={16} />
                  Archive
                </button>
              </div>
            ) : (
              <button className="icon-button text-button full" type="button" onClick={() => setArchiveConfirm(true)}>
                <Archive size={16} />
                Archive
              </button>
            )}
          </div>
        </RecordModal>
      ) : null}
    </main>
  );
}
