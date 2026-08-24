"use client";

import {
  ArrowRight,
  Bell,
  CheckCircle2,
  FileCheck2,
  FileText,
  FolderOpen,
  Inbox,
  Mail,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  X
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { CustomerPortalData } from "@/lib/customer-portal-types";

type PreviewSection = "overview" | "orders" | "updates" | "quotes" | "invoices" | "messages" | "files";

interface CustomerPortalReadOnlyPreviewProps {
  data: CustomerPortalData;
  onClose: () => void;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusClass(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function CustomerPortalReadOnlyPreview({ data, onClose }: CustomerPortalReadOnlyPreviewProps) {
  const [section, setSection] = useState<PreviewSection>("overview");
  const [selectedOrderId, setSelectedOrderId] = useState(data.orders[0]?.id);
  const selectedOrder = useMemo(
    () => data.orders.find((order) => order.id === selectedOrderId) ?? data.orders[0],
    [data.orders, selectedOrderId]
  );

  const navItems: Array<{ id: PreviewSection; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders", count: data.orders.length },
    { id: "updates", label: "Order updates", count: data.notifications?.length ?? 0 },
    { id: "quotes", label: "Quotes", count: data.quotes.length },
    { id: "invoices", label: "Invoices", count: data.invoices.length },
    { id: "messages", label: "Messages", count: data.messages.length },
    { id: "files", label: "Files & uploads", count: data.files.length }
  ];

  return (
    <div className="customer-preview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="customer-preview-shell" role="dialog" aria-modal="true" aria-label={`Preview ${data.profile.customerName} portal`}>
        <div className="customer-preview-banner">
          <ShieldCheck size={18} />
          <div>
            <strong>Staff-only read-only preview</strong>
            <span>You are viewing exactly this customer’s records. No customer action can be submitted from preview.</span>
          </div>
          <button className="icon-only" type="button" onClick={onClose} aria-label="Close customer preview"><X size={18} /></button>
        </div>

        <div className="customer-preview-portal">
          <aside className="customer-portal-sidebar preview-sidebar">
            <div className="customer-portal-brand">
              <img src="/brand/gross-printing-mark.png" alt="Gross Printing" />
              <div><strong>Gross Printing</strong><span>Customer Portal</span></div>
            </div>
            <nav>
              {navItems.map((item) => (
                <button className={section === item.id ? "active" : ""} type="button" key={item.id} onClick={() => setSection(item.id)}>
                  <span>{item.label}</span>
                  {typeof item.count === "number" ? <b>{item.count}</b> : null}
                </button>
              ))}
            </nav>
            <div className="customer-portal-account">
              <span><strong>{data.profile.displayName}</strong><small>{data.profile.customerName}</small></span>
            </div>
          </aside>

          <main className="customer-portal-main preview-main">
            <header className="customer-portal-topbar">
              <div><p>Welcome back</p><h1>{data.profile.customerName}</h1></div>
              <div className="customer-portal-top-actions"><span className="portal-demo-chip">Read-only preview</span></div>
            </header>

            {section === "overview" ? (
              <div className="portal-page">
                <div className="portal-page-heading"><div><p>Account overview</p><h2>Your printing activity</h2><span>Only customer-facing records are shown.</span></div></div>
                <div className="portal-summary-grid">
                  <button type="button" onClick={() => setSection("orders")}><PackageCheck size={20} /><span><strong>{data.summary.activeOrders}</strong><small>Active orders</small></span></button>
                  <button type="button" onClick={() => setSection("orders")}><Inbox size={20} /><span><strong>{data.summary.readyForPickup}</strong><small>Ready for pickup</small></span></button>
                  <button type="button" onClick={() => setSection("quotes")}><FileCheck2 size={20} /><span><strong>{data.summary.openQuotes}</strong><small>Open quotes</small></span></button>
                  <button type="button" onClick={() => setSection("invoices")}><ReceiptText size={20} /><span><strong>{formatMoney(data.summary.openBalance)}</strong><small>Open balance</small></span></button>
                </div>
                <section className="portal-panel">
                  <div className="portal-panel-heading"><div><h3>Recent orders</h3><span>Customer-friendly progress without internal workflow details.</span></div></div>
                  <div className="portal-order-list compact">
                    {data.orders.slice(0, 5).map((order) => (
                      <button type="button" key={order.id} onClick={() => { setSelectedOrderId(order.id); setSection("orders"); }}>
                        <span className={`portal-order-status ${statusClass(order.status)}`}><i />{order.status}</span>
                        <span className="portal-order-copy"><strong>{order.jobNumber} · {order.title}</strong><small>{order.quantity.toLocaleString()} pieces · Due {formatDate(order.dueDate)}</small></span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                    {!data.orders.length ? <div className="portal-empty"><PackageCheck size={28} /><strong>No orders yet</strong><span>This customer has no visible orders.</span></div> : null}
                  </div>
                </section>
              </div>
            ) : null}

            {section === "orders" ? (
              <div className="portal-page">
                <div className="portal-page-heading"><div><p>Orders</p><h2>Current and previous work</h2><span>Internal notes, costs, and workflow controls are hidden.</span></div></div>
                <div className="portal-orders-layout">
                  <section className="portal-panel portal-order-list">
                    {data.orders.map((order) => (
                      <button className={selectedOrder?.id === order.id ? "active" : ""} type="button" key={order.id} onClick={() => setSelectedOrderId(order.id)}>
                        <span className={`portal-order-status ${statusClass(order.status)}`}><i />{order.status}</span>
                        <span className="portal-order-copy"><strong>{order.jobNumber} · {order.title}</strong><small>{order.quantity.toLocaleString()} pieces · {order.finishedSize}</small></span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </section>
                  <section className="portal-panel portal-order-detail">
                    {selectedOrder ? (
                      <div className="portal-order-detail-content">
                        <header><div><p>{selectedOrder.jobNumber}</p><h2>{selectedOrder.title}</h2><span className={`portal-order-status large ${statusClass(selectedOrder.status)}`}><i />{selectedOrder.status}</span></div></header>
                        <section className="portal-order-tracker">
                          {["Order received", "Confirmed", "In production", "Ready for pickup", "Completed"].map((stage, index) => {
                            const current = selectedOrder.status === "Completed" ? 4 : selectedOrder.status === "Ready for pickup" ? 3 : ["In production", "Artwork review"].includes(selectedOrder.status) ? 2 : 1;
                            return <div className={index < current ? "complete" : index === current ? "current" : "upcoming"} key={stage}><span>{index < current ? <CheckCircle2 size={14} /> : index + 1}</span><strong>{stage}</strong></div>;
                          })}
                        </section>
                        <p className="portal-status-detail">{selectedOrder.statusDetail}</p>
                        <div className="portal-order-spec-grid">
                          <div><span>Quantity</span><strong>{selectedOrder.quantity.toLocaleString()}</strong></div>
                          <div><span>Finished size</span><strong>{selectedOrder.finishedSize}</strong></div>
                          <div><span>Paper</span><strong>{selectedOrder.stockName ?? "Not shown"}</strong></div>
                          <div><span>Print</span><strong>{selectedOrder.colorSpec}</strong></div>
                          <div><span>Sides</span><strong>{selectedOrder.sides}</strong></div>
                          <div><span>Finishing</span><strong>{selectedOrder.finishing.join(", ") || "None listed"}</strong></div>
                        </div>
                      </div>
                    ) : <div className="portal-empty"><PackageCheck size={30} /><strong>Select an order</strong></div>}
                  </section>
                </div>
              </div>
            ) : null}

            {section === "updates" ? (
              <div className="portal-page"><div className="portal-page-heading"><div><p>Order updates</p><h2>Production and pickup notifications</h2></div></div><section className="portal-panel portal-update-list full">{(data.notifications ?? []).map((notification) => <button type="button" key={notification.id} onClick={() => { if (notification.jobId) setSelectedOrderId(notification.jobId); setSection("orders"); }}><span><Bell size={17} /></span><div><strong>{notification.title}</strong><p>{notification.message}</p><small>{formatDate(notification.createdAt)} · {notification.channel === "email" ? "Email" : "Customer Portal"}</small></div>{notification.jobNumber ? <b>{notification.jobNumber}</b> : null}</button>)}{!(data.notifications ?? []).length ? <div className="portal-empty"><Bell size={28} /><strong>No order updates yet</strong></div> : null}</section></div>
            ) : null}

            {section === "quotes" ? (
              <div className="portal-page"><div className="portal-page-heading"><div><p>Quotes</p><h2>Customer quotes</h2></div></div><section className="portal-panel portal-record-table"><table><thead><tr><th>Quote</th><th>Job</th><th>Status</th><th>Amount</th></tr></thead><tbody>{data.quotes.map((quote) => <tr key={quote.id}><td><strong>{quote.quoteNumber}</strong></td><td>{quote.title}</td><td>{quote.status}</td><td><strong>{formatMoney(quote.amount)}</strong></td></tr>)}</tbody></table>{!data.quotes.length ? <div className="portal-empty"><FileCheck2 size={28} /><strong>No quotes available</strong></div> : null}</section></div>
            ) : null}

            {section === "invoices" ? (
              <div className="portal-page"><div className="portal-page-heading"><div><p>Invoices</p><h2>Invoices and payment status</h2></div></div><section className="portal-panel portal-record-table"><table><thead><tr><th>Invoice</th><th>Job</th><th>Status</th><th>Amount</th></tr></thead><tbody>{data.invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoiceNumber}</strong></td><td>{invoice.title}</td><td>{invoice.status}</td><td><strong>{formatMoney(invoice.amount)}</strong></td></tr>)}</tbody></table>{!data.invoices.length ? <div className="portal-empty"><ReceiptText size={28} /><strong>No invoices available</strong></div> : null}</section></div>
            ) : null}

            {section === "messages" ? (
              <div className="portal-page"><div className="portal-page-heading"><div><p>Messages</p><h2>Customer-facing email history</h2></div></div><section className="portal-panel"><div className="portal-mini-list">{data.messages.map((thread) => <div className="preview-message-row" key={thread.id}><Mail size={17} /><span><strong>{thread.subject}</strong><small>{thread.messages.length} messages · {formatDate(thread.lastMessageAt)}</small></span></div>)}{!data.messages.length ? <div className="portal-empty"><Mail size={28} /><strong>No messages available</strong></div> : null}</div></section></div>
            ) : null}

            {section === "files" ? (
              <div className="portal-page"><div className="portal-page-heading"><div><p>Files</p><h2>Files shared with this customer</h2></div></div><section className="portal-panel"><div className="portal-file-grid">{data.files.map((file) => <article key={file.id}><div className="portal-file-icon"><FileText size={22} /></div><div><span>{file.folder}</span><strong>{file.name}</strong><small>{formatDate(file.uploadedAt)}</small></div></article>)}{!data.files.length ? <div className="portal-empty"><FolderOpen size={28} /><strong>No shared files</strong></div> : null}</div></section></div>
            ) : null}
          </main>
        </div>
      </section>
    </div>
  );
}
