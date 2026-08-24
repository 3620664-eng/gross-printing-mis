"use client";

import { Archive, ArrowRight, Boxes, FileText, Receipt, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { Invoice, Job, PrintOrder, Quote } from "@/lib/types";

interface OrdersProps {
  orders: PrintOrder[];
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  onOpenJob: (jobId: string) => void;
  onOpenQuote: (quoteId: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
  onArchiveOrder: (orderId: string) => void;
}

const jobStages = ["Quote", "Approved", "Prepress", "Printing", "Finishing", "Ready", "Delivered"] as const;

function orderProgress(order: PrintOrder, jobs: Job[]) {
  const allChildren = jobs.filter((job) => order.jobIds.includes(job.id));
  const children = allChildren.filter((job) => job.status !== "Cancelled");
  if (!children.length) return { completed: 0, total: allChildren.length, percent: 0 };
  const completed = children.filter((job) => job.status === "Ready" || job.status === "Delivered").length;
  return { completed, total: children.length, percent: Math.round((completed / children.length) * 100) };
}

export function Orders({
  orders,
  jobs,
  quotes,
  invoices,
  onOpenJob,
  onOpenQuote,
  onOpenInvoice,
  onArchiveOrder
}: OrdersProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [listMode, setListMode] = useState<"active" | "recent" | "history">("active");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return orders
      .filter((order) => !order.deletedAt)
      .filter((order) => {
        const done = order.status === "Ready" || order.status === "Delivered" || order.status === "Cancelled" || order.archived;
        const recent = done && Date.now() - new Date(order.updatedAt).getTime() <= sevenDays;
        if (listMode === "active") return !done;
        if (listMode === "recent") return recent;
        return done && !recent;
      })
      .filter((order) => !needle || `${order.orderNumber} ${order.title} ${order.customerName} ${order.status}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orders, query, listMode]);
  const selected = visible.find((order) => order.id === selectedId) ?? visible[0];
  const selectedJobs = selected ? jobs.filter((job) => selected.jobIds.includes(job.id)) : [];
  const quote = selected?.quoteId ? quotes.find((item) => item.id === selected.quoteId) : undefined;
  const invoice = selected?.invoiceId ? invoices.find((item) => item.id === selected.invoiceId) : undefined;
  const total = selectedJobs.reduce((sum, job) => sum + job.pricing.total, 0);

  return (
    <main className="page-view orders-page">
      <div className="section-heading">
        <div>
          <p>Parent orders</p>
          <h1>One customer order, multiple production jobs</h1>
          <span>Track the overall customer request without losing separate artwork, proof, production, and completion status for each finished product.</span>
        </div>
      </div>

      <div className="orders-workspace">
        <section className="panel orders-list-panel">
          <div className="orders-list-mode" role="tablist" aria-label="Order list">
            <button className={listMode === "active" ? "active" : ""} type="button" onClick={() => setListMode("active")}>Active</button>
            <button className={listMode === "recent" ? "active" : ""} type="button" onClick={() => setListMode("recent")}>Recently finished</button>
            <button className={listMode === "history" ? "active" : ""} type="button" onClick={() => setListMode("history")}>History</button>
          </div>
          <label className="orders-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, or title..." /></label>
          <div className="orders-list">
            {visible.map((order) => {
              const progress = orderProgress(order, jobs);
              return (
                <button className={selected?.id === order.id ? "active" : ""} type="button" key={order.id} onClick={() => setSelectedId(order.id)}>
                  <span><strong>{order.orderNumber}</strong><b>{order.title}</b><small>{order.customerName} · {order.status}</small></span>
                  <em>{progress.completed}/{progress.total}</em>
                </button>
              );
            })}
            {!visible.length ? <div className="orders-empty"><Boxes size={28} /><strong>{listMode === "active" ? "No active orders" : listMode === "recent" ? "No recently finished orders" : "No older order history"}</strong><span>Completed work leaves the active list automatically; nothing is deleted.</span></div> : null}
          </div>
        </section>

        <section className="panel order-detail-panel">
          {selected ? (
            <>
              <header>
                <div><p>{selected.orderNumber} · {selected.status}</p><h2>{selected.title}</h2><span>{selected.customerName} · {selected.source}</span></div>
                <button className="text-button" type="button" onClick={() => onArchiveOrder(selected.id)}><Archive size={15} />Archive order</button>
              </header>

              <div className="order-summary-grid">
                <div><span>Production items</span><strong>{selectedJobs.length}</strong></div>
                <div><span>Overall value</span><strong>{formatMoney(quote?.amount ?? invoice?.amount ?? total)}</strong></div>
                <div><span>Due</span><strong>{selected.dueDate || "Different by item"}</strong></div>
                <div><span>Customer reference</span><strong>{selected.customerReference || "—"}</strong></div>
              </div>

              <section className="order-progress-card">
                <div><strong>Overall order progress</strong><span>{orderProgress(selected, jobs).completed} of {orderProgress(selected, jobs).total} jobs Ready or Delivered</span></div>
                <div className="order-progress-bar"><span style={{ width: `${orderProgress(selected, jobs).percent}%` }} /></div>
              </section>

              <section className="order-jobs-section">
                <div className="compact-section-heading"><h3>Production jobs</h3><span>Each finished product moves independently.</span></div>
                <div className="order-job-cards">
                  {selectedJobs.map((job) => {
                    const stageIndex = Math.max(0, jobStages.indexOf(job.status as typeof jobStages[number]));
                    return (
                      <article key={job.id}>
                        <header><div><strong>{job.jobNumber}</strong><h4>{job.title}</h4></div><span>{job.status}</span></header>
                        <p>{job.quantity.toLocaleString()} pcs · {job.pieceWidth} × {job.pieceHeight} · {job.stockName}</p>
                        <div className="order-job-stage"><span style={{ width: `${Math.round(((stageIndex + 1) / jobStages.length) * 100)}%` }} /></div>
                        <footer><small>{job.artworkName || "Artwork not assigned"}</small><button className="text-button small" type="button" onClick={() => onOpenJob(job.id)}>Open job <ArrowRight size={14} /></button></footer>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="order-financial-links">
                <button type="button" disabled={!quote} onClick={() => quote && onOpenQuote(quote.id)}><FileText size={17} /><span><strong>{quote?.quoteNumber ?? "No order quote"}</strong><small>{quote ? `${quote.lineItems?.length ?? selectedJobs.length} lines · ${formatMoney(quote.amount)}` : "Create one quote with multiple job lines"}</small></span></button>
                <button type="button" disabled={!invoice} onClick={() => invoice && onOpenInvoice(invoice.id)}><Receipt size={17} /><span><strong>{invoice?.invoiceNumber ?? "No order invoice"}</strong><small>{invoice ? `${invoice.lineItems?.length ?? selectedJobs.length} lines · ${formatMoney(invoice.amount)}` : "One invoice can cover the whole order"}</small></span></button>
              </section>
            </>
          ) : <div className="orders-empty"><Boxes size={30} /><strong>Select an order</strong></div>}
        </section>
      </div>
    </main>
  );
}
