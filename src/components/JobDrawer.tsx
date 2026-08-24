"use client";

import { AlertTriangle, Archive, ArrowRight, CheckCircle2, Copy, Download, FileText, History, Mail, Pencil, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { calculateImposition, formatDateTime, formatMoney, PILE_LIMIT_BY_KIND, TIME_LABELS } from "@/lib/pricing";
import { PRODUCT_PRESETS, type ProductPreset } from "@/lib/product-catalog";
import type { Customer, EmailIntakeTicket, EmailThread, ImpositionSettings, Invoice, Job, JobStatus, JobStatusEvent, PaperStock, PrintOrder, Quote, TimeCategory, UploadedFile } from "@/lib/types";
import type { CustomerPortalRequest, CustomerPortalRequestMetadata } from "@/lib/customer-portal-types";
import { RushBadge, StatusBadge } from "./StatusBadge";

interface JobDrawerProps {
  job: Job;
  customer?: Customer;
  quote?: Quote;
  invoice?: Invoice;
  files: UploadedFile[];
  paperStocks: PaperStock[];
  productPresets?: ProductPreset[];
  statusEvents: JobStatusEvent[];
  emailThreads?: EmailThread[];
  intakeTicket?: EmailIntakeTicket;
  portalRequest?: CustomerPortalRequest;
  parentOrder?: PrintOrder;
  onClose: () => void;
  onEdit: (jobId: string) => void;
  onMoveJob: (jobId: string, status: JobStatus) => void;
  onArchive: (jobId: string) => void;
  onUpdateNote: (jobId: string, notes: string) => void;
  onUpdateCustomerEmailSettings: (jobId: string, changes: Pick<Job, "customerEmailNotificationsEnabled" | "customerNotificationPath">) => void;
  onManualTime: (jobId: string, category: TimeCategory, minutes: number) => void;
  onOpenFile: (fileId: string) => void;
  onDownloadEmailAttachment?: (threadId: string, messageId: string, attachmentId: string) => void;
  canEdit?: boolean;
  canArchive?: boolean;
  canViewPricing?: boolean;
  canManageTime?: boolean;
  canUpdateNotes?: boolean;
}

const categories = Object.keys(TIME_LABELS) as TimeCategory[];
const tabs = ["Overview", "Production", "Files", "Emails", "History"] as const;
type JobTicketTab = (typeof tabs)[number];

const nextStatusByStatus: Partial<Record<JobStatus, JobStatus>> = {
  Quote: "Approved",
  Approved: "Prepress",
  Prepress: "Printing",
  Printing: "Finishing",
  Finishing: "Ready",
  Ready: "Delivered"
};

const nextActionLabel: Partial<Record<JobStatus, string>> = {
  Quote: "Approve quote",
  Approved: "Release to Prepress",
  Prepress: "Start Printing",
  Printing: "Send to Finishing",
  Finishing: "Mark Ready",
  Ready: "Mark Delivered"
};

const workflowStages: JobStatus[] = ["Quote", "Approved", "Prepress", "Printing", "Finishing", "Ready", "Delivered"];

const ticketImpositionSettings: ImpositionSettings = {
  mode: "step-repeat",
  preset: "auto",
  rotate: false,
  rotationMode: "0",
  fitMode: "contain",
  artworkBoxMode: "full-page",
  artworkCrop: 0,
  imageBleedEnabled: false,
  bleedType: "duplication",
  bleedColor: "#ffffff",
  bleedLinked: true,
  trimLinked: true,
  bleedTop: 0,
  bleedRight: 0,
  bleedBottom: 0,
  bleedLeft: 0,
  trimTop: 0,
  trimRight: 0,
  trimBottom: 0,
  trimLeft: 0,
  keepBleedMargins: true,
  customColumns: 1,
  customRows: 1,
  margin: 0,
  gutter: 0,
  bleed: 0,
  cropMarkLength: 0,
  cropMarkOffset: 0,
  showBleedGuide: false,
  showRegistrationMarks: false,
  showFoldMarks: false,
  showCornerMarks: false,
  duplexMirror: false
};

function cleanNumber(value: number | undefined) {
  if (!Number.isFinite(value)) return "-";
  return String(Number((value ?? 0).toFixed(3))).replace(/\.?0+$/, "");
}

function formatSize(width: number | undefined, height: number | undefined) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "-";
  return `${cleanNumber(width)} x ${cleanNumber(height)}`;
}

function sameSize(widthA: number, heightA: number, widthB: number, heightB: number) {
  const tolerance = 0.01;
  return Math.abs(widthA - widthB) <= tolerance && Math.abs(heightA - heightB) <= tolerance;
}

function findProductionPreset(job: Job, productPresets: ProductPreset[]) {
  return (
    productPresets.find((preset) => preset.name === job.title) ??
    productPresets.find((preset) => sameSize(preset.width, preset.height, job.pieceWidth, job.pieceHeight) && preset.colorSpec === job.colorSpec) ??
    productPresets.find((preset) => sameSize(preset.width, preset.height, job.pieceWidth, job.pieceHeight)) ??
    productPresets.find((preset) => sameSize(preset.height, preset.width, job.pieceWidth, job.pieceHeight))
  );
}

function escapeHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadDataUrl(dataUrl: string | undefined, filename: string) {
  if (!dataUrl) return;
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function JobDrawer({
  job,
  customer,
  quote,
  invoice,
  files,
  paperStocks,
  productPresets = PRODUCT_PRESETS,
  statusEvents,
  emailThreads = [],
  intakeTicket,
  portalRequest,
  parentOrder,
  onClose,
  onEdit,
  onMoveJob,
  onArchive,
  onUpdateNote,
  onUpdateCustomerEmailSettings,
  onManualTime,
  onOpenFile,
  onDownloadEmailAttachment,
  canEdit = true,
  canArchive = true,
  canViewPricing = true,
  canManageTime = true,
  canUpdateNotes = true
}: JobDrawerProps) {
  const [activeTab, setActiveTab] = useState<JobTicketTab>("Overview");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [noteDraft, setNoteDraft] = useState(job.notes ?? "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [pickupCopied, setPickupCopied] = useState(false);
  const sortedEvents = [...statusEvents].sort((a, b) => new Date(b.movedAt).getTime() - new Date(a.movedAt).getTime());
  const chronologicalEvents = [...statusEvents].sort((a, b) => new Date(a.movedAt).getTime() - new Date(b.movedAt).getTime());
  const currentStartedAt = sortedEvents[0]?.movedAt ?? job.createdAt;
  const currentStageIndex = workflowStages.indexOf(job.status);
  const currentMinutes = Math.max(0, Math.round((Date.now() - new Date(currentStartedAt).getTime()) / 60000));
  const totalTime = categories.reduce((total, category) => total + (job.time?.[category] ?? 0), 0);
  const linkedPreviewFile = files.find((file) => file.preview);
  const firstDownload = job.artworkPreview
    ? { dataUrl: job.artworkPreview, name: job.artworkName || `${job.jobNumber}-artwork.png` }
      : linkedPreviewFile?.preview
        ? { dataUrl: linkedPreviewFile.preview, name: linkedPreviewFile.name }
        : undefined;
  const productionStock =
    paperStocks.find((stock) => stock.id === job.stockId) ??
    paperStocks.find((stock) => stock.name === job.stockName);
  const productionPreset = findProductionPreset(job, productPresets);
  const productionPlan = productionStock
    ? calculateImposition(productionStock, job.quantity, job.pieceWidth, job.pieceHeight, ticketImpositionSettings)
    : undefined;
  const machineName = productionPreset?.machine ?? (job.booklet?.enabled ? "Folder/stapler/finishing" : "Ricoh Pro C7200");
  const parentSheetLabel = productionPlan
    ? formatSize(productionPlan.sheetWidth, productionPlan.sheetHeight)
    : formatSize(productionStock?.sheetWidth, productionStock?.sheetHeight);
  const normalizedStockName = job.stockName.replace(/\s/g, "").toLowerCase();
  const normalizedSheetSize = parentSheetLabel.replace(/\s/g, "").toLowerCase();
  const stockRunLabel =
    parentSheetLabel !== "-" && !normalizedStockName.includes(normalizedSheetSize)
      ? `${job.stockName} - ${parentSheetLabel}`
      : job.stockName;
  const pileLimit = productionStock ? PILE_LIMIT_BY_KIND[productionStock.kind] : undefined;
  const totalCuts = productionPlan ? productionPlan.cutsPerPile * productionPlan.piles : 0;
  const nextStatus = nextStatusByStatus[job.status];
  const isTerminalStatus = job.status === "Delivered" || job.status === "Cancelled";
  const hasArtwork = Boolean(job.artworkName || job.artworkPreview || files.length);
  const nextStepBlocked = job.status === "Prepress" && !hasArtwork;
  const pickupMessage = `Hi ${customer?.contact || customer?.name || job.customerName}, your ${job.title} (${job.jobNumber}) is ready for pickup at Gross Printing. Thank you.`;
  const linkedEmailThreads = emailThreads.filter((thread) => thread.jobId === job.id || job.emailThreadIds?.includes(thread.id) || thread.id === job.sourceEmailThreadId);

  useEffect(() => {
    setActiveTab("Overview");
    setArchiveConfirm(false);
    setNoteDraft(job.notes ?? "");
    setNoteSaved(false);
    setPickupCopied(false);
  }, [job.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  async function copyPickupMessage() {
    try {
      await navigator.clipboard.writeText(pickupMessage);
      setPickupCopied(true);
    } catch {
      window.prompt("Copy this pickup message:", pickupMessage);
    }
  }

  function printJobTicket() {
    const printWindow = window.open("", "_blank", "width=900,height=720");
    if (!printWindow) return;
    const bindery = job.bindery.length ? job.bindery.join(", ") : "None";
    const productionInstructions = productionPlan?.instructions ?? "Confirm stock and sheet layout before running.";
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(job.jobNumber)} job ticket</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #17242d; }
            header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #a66f10; padding-bottom: 16px; }
            h1 { margin: 0 0 6px; font-size: 28px; }
            h2 { margin: 22px 0 10px; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; }
            td { border: 1px solid #ccd7dc; padding: 9px 10px; vertical-align: top; }
            td:first-child { color: #617582; width: 34%; }
            .total { font-size: 22px; font-weight: 800; color: #8a5a08; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
            @media print { body { margin: 18px; } }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>${escapeHtml(job.jobNumber)} - ${escapeHtml(job.title)}</h1>
              <strong>${escapeHtml(job.customerName)}</strong>
              <p>${escapeHtml(job.status)}${job.rush ? " / Rush" : ""}</p>
            </div>
            <div class="total">${escapeHtml(formatMoney(job.pricing.total))}</div>
          </header>
          <div class="grid">
            <section>
              <h2>Job</h2>
              <table>
                <tr><td>Due</td><td>${escapeHtml(formatDateTime(job.dueDate, job.dueTime))}</td></tr>
                <tr><td>Quantity</td><td>${escapeHtml(job.quantity.toLocaleString())}</td></tr>
                <tr><td>Finished size</td><td>${escapeHtml(`${job.pieceWidth} x ${job.pieceHeight}`)}</td></tr>
                <tr><td>Print spec</td><td>${escapeHtml(job.colorSpec)}</td></tr>
                <tr><td>Finishing</td><td>${escapeHtml(bindery)}</td></tr>
              </table>
            </section>
            <section>
              <h2>Production run</h2>
              <table>
                <tr><td>Machine</td><td>${escapeHtml(machineName)}</td></tr>
                <tr><td>Stock / sheet</td><td>${escapeHtml(stockRunLabel)}</td></tr>
                <tr><td>Pieces per sheet</td><td>${escapeHtml(productionPlan?.piecesPerSheet.toLocaleString() ?? "-")}</td></tr>
                <tr><td>Sheets to print</td><td>${escapeHtml(productionPlan?.sheetsNeeded.toLocaleString() ?? "-")}</td></tr>
                <tr><td>Piles</td><td>${escapeHtml(productionPlan?.piles.toLocaleString() ?? "-")}</td></tr>
                <tr><td>Pile limit</td><td>${escapeHtml(pileLimit ? `${pileLimit.toLocaleString()} sheets` : "-")}</td></tr>
                <tr><td>Cuts per pile</td><td>${escapeHtml(productionPlan?.cutsPerPile.toLocaleString() ?? "-")}</td></tr>
                <tr><td>Total cuts</td><td>${escapeHtml(productionPlan ? totalCuts.toLocaleString() : "-")}</td></tr>
                <tr><td>Estimated production time</td><td>${escapeHtml(productionPlan ? `${productionPlan.estimatedMinutes.toLocaleString()} min` : "-")}</td></tr>
                <tr><td>Run instructions</td><td>${escapeHtml(productionInstructions)}</td></tr>
              </table>
            </section>
            <section>
              <h2>Customer</h2>
              <table>
                <tr><td>Contact</td><td>${escapeHtml(customer?.contact)}</td></tr>
                <tr><td>Email</td><td>${escapeHtml(customer?.email)}</td></tr>
                <tr><td>Phone</td><td>${escapeHtml(customer?.phone)}</td></tr>
                <tr><td>Terms</td><td>${escapeHtml(customer?.terms)}</td></tr>
              </table>
            </section>
          </div>
          <section>
            <h2>Files</h2>
            <table>
              <tr><td>Main artwork</td><td>${escapeHtml(job.artworkName || "No artwork attached")}</td></tr>
              ${files.map((file) => `<tr><td>${escapeHtml(file.folder)}</td><td>${escapeHtml(file.name)} / ${escapeHtml(file.status)}</td></tr>`).join("")}
            </table>
          </section>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <aside className="drawer-backdrop job-ticket-backdrop" onMouseDown={onClose}>
      <section
        className="job-drawer job-ticket-modal v046-job-ticket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-ticket-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="job-ticket-header v046-job-ticket-header">
          <div className="job-ticket-title">
            <div className="badge-row">
              <StatusBadge status={job.status} />
              <RushBadge rush={job.rush} />
              <span className="soft-chip">{job.jobNumber}</span>
            {parentOrder ? <span className="soft-chip order-chip">{parentOrder.orderNumber} · item {Math.max(0, parentOrder.jobIds.indexOf(job.id)) + 1} of {parentOrder.jobIds.length}</span> : null}
            </div>
            <h2 id="job-ticket-title">{job.title}</h2>
            <p>{job.customerName}</p>
          </div>
          <div className="job-ticket-actions">
            {canEdit ? (
              <button className="icon-button text-button" type="button" onClick={() => onEdit(job.id)}>
                <Pencil size={16} />
                Edit
              </button>
            ) : null}
            <button className="icon-button text-button" type="button" onClick={printJobTicket}>
              <Printer size={16} />
              Print ticket
            </button>
            <button
              className="icon-button text-button"
              type="button"
              disabled={!firstDownload}
              onClick={() => downloadDataUrl(firstDownload?.dataUrl, firstDownload?.name || `${job.jobNumber}-artwork`)}
            >
              <Download size={16} />
              Artwork
            </button>
            <button className="icon-only close-button" type="button" onClick={onClose} aria-label="Close job ticket">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="job-ticket-body v046-job-ticket-body">
          <div className="job-ticket-main v046-job-ticket-main">
            <div className={`job-stage-track ${job.status === "Cancelled" ? "cancelled" : ""}`} aria-label="Job workflow progress">
              {workflowStages.map((stage, index) => {
                const state = job.status === "Cancelled" ? "upcoming" : index < currentStageIndex ? "complete" : index === currentStageIndex ? "current" : "upcoming";
                return (
                  <div className={`job-stage-node ${state}`} key={stage}>
                    <span>{state === "complete" ? <CheckCircle2 size={14} /> : index + 1}</span>
                    <strong>{stage}</strong>
                  </div>
                );
              })}
              {job.status === "Cancelled" ? <div className="job-stage-cancelled"><AlertTriangle size={15} /> Cancelled</div> : null}
            </div>

            <div className="job-ticket-tabs" role="tablist" aria-label="Job ticket sections">
              {tabs.map((tab) => (
                <button
                  className={activeTab === tab ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "Overview" ? (
              <div className="job-ticket-tab-panel overview-tab-panel">
                <div className="job-overview-summary">
                  <div><span>Status</span><strong>{job.status}</strong></div>
                  <div><span>Due</span><strong>{formatDateTime(job.dueDate, job.dueTime)}</strong></div>
                  <div><span>Quantity</span><strong>{job.quantity.toLocaleString()}</strong></div>
                  {canViewPricing ? <div><span>Total</span><strong>{formatMoney(job.pricing.total)}</strong></div> : null}
                </div>

                <section className={`drawer-section workflow-next-step ${nextStepBlocked ? "blocked" : ""}`}>
                  <div className="workflow-next-copy">
                    {isTerminalStatus ? <CheckCircle2 size={20} /> : nextStepBlocked ? <AlertTriangle size={20} /> : <ArrowRight size={20} />}
                    <div>
                      <span>Next production action</span>
                      <strong>
                        {isTerminalStatus
                          ? job.status === "Delivered" ? "Job completed" : "Job cancelled"
                          : nextStepBlocked
                            ? "Artwork is required before Printing"
                            : `${job.status} → ${nextStatus}`}
                      </strong>
                      <small>
                        {isTerminalStatus
                          ? job.status === "Delivered"
                            ? "The completed job remains in customer history and can be copied for a reorder."
                            : "Cancelled jobs do not move through production."
                          : nextStepBlocked
                            ? "Attach approved artwork in Edit job or Files, then move the job to Printing."
                            : job.status === "Ready"
                              ? "The invoice is prepared automatically. Mark Delivered after pickup or delivery."
                              : "This records the employee, date, time, and time spent in the current stage."}
                      </small>
                    </div>
                  </div>
                  <div className="workflow-next-actions">
                    {nextStatus ? (
                      <button className="primary-button" type="button" disabled={nextStepBlocked} onClick={() => onMoveJob(job.id, nextStatus)}>
                        {nextActionLabel[job.status]}
                        <ArrowRight size={16} />
                      </button>
                    ) : null}
                    {job.status === "Ready" || job.status === "Delivered" ? (
                      <button className="icon-button text-button" type="button" onClick={() => void copyPickupMessage()}>
                        <Copy size={15} />
                        {pickupCopied ? "Pickup message copied" : "Copy pickup message"}
                      </button>
                    ) : null}
                  </div>
                </section>

                <div className="job-overview-columns">
                  <section className="drawer-section overview-detail-card no-top-border">
                    <div className="compact-section-heading">
                      <h3>Customer & order</h3>
                      <span>{customer?.terms || "Standard terms"}</span>
                    </div>
                    <div className="drawer-grid">
                      <div><span>Customer</span><strong>{job.customerName}</strong></div>
                      <div><span>Contact</span><strong>{customer?.contact || "-"}</strong></div>
                      <div><span>Email</span><strong>{customer?.email || "-"}</strong></div>
                      <div><span>Phone</span><strong>{customer?.phone || "-"}</strong></div>
                      <div><span>Order source</span><strong>{job.orderSource || "-"}</strong></div>
                      <div><span>Customer reference</span><strong>{job.customerReference || "-"}</strong></div>
                      <div><span>Finished size</span><strong>{formatSize(job.pieceWidth, job.pieceHeight)}</strong></div>
                      <div><span>Print spec</span><strong>{job.colorSpec}</strong></div>
                    </div>
                  </section>

                  <section className="drawer-section overview-detail-card no-top-border">
                    <div className="compact-section-heading">
                      <h3>Records</h3>
                      <span>Connected documents</span>
                    </div>
                    <div className="drawer-grid">
                      <div><span>Quote</span><strong>{quote?.quoteNumber ?? "None"}</strong></div>
                      <div><span>Quote status</span><strong>{quote?.status ?? "-"}</strong></div>
                      <div><span>Invoice</span><strong>{invoice?.invoiceNumber ?? "Created at Ready"}</strong></div>
                      <div><span>Files</span><strong>{files.length + (job.artworkName || job.artworkPreview ? 1 : 0)}</strong></div>
                      <div><span>Email threads</span><strong>{linkedEmailThreads.length}</strong></div>
                      <div><span>Created</span><strong>{new Date(job.createdAt).toLocaleString()}</strong></div>
                      <div><span>Updated</span><strong>{new Date(job.updatedAt).toLocaleString()}</strong></div>
                    </div>
                  </section>
                </div>

                <section className="drawer-section customer-email-settings-card">
                  <div className="compact-section-heading">
                    <h3>Customer email notifications</h3>
                    <span>The Customer Portal still shows every status.</span>
                  </div>
                  <div className="customer-email-settings-grid">
                    <label className="customer-email-toggle">
                      <input
                        type="checkbox"
                        checked={job.customerEmailNotificationsEnabled !== false}
                        disabled={!canEdit}
                        onChange={(event) => onUpdateCustomerEmailSettings(job.id, {
                          customerEmailNotificationsEnabled: event.target.checked,
                          customerNotificationPath: job.customerNotificationPath ?? (job.quoteId ? "quote_then_status" : "direct_job")
                        })}
                      />
                      <span><strong>Automatic customer emails</strong><small>Send only the important customer-facing notices, not every internal workflow move.</small></span>
                    </label>
                    <label>
                      <span>Notification path</span>
                      <select
                        value={job.customerNotificationPath ?? (job.quoteId ? "quote_then_status" : "direct_job")}
                        disabled={!canEdit || job.customerEmailNotificationsEnabled === false}
                        onChange={(event) => onUpdateCustomerEmailSettings(job.id, {
                          customerEmailNotificationsEnabled: job.customerEmailNotificationsEnabled !== false,
                          customerNotificationPath: event.target.value as Job["customerNotificationPath"]
                        })}
                      >
                        <option value="quote_then_status">Quote → In production → Ready</option>
                        <option value="direct_job">Direct job → In production → Ready</option>
                        <option value="manual">Manual emails only</option>
                      </select>
                    </label>
                  </div>
                </section>

                {intakeTicket ? (
                  <section className="drawer-section source-ticket-section">
                    <div className="compact-section-heading">
                      <h3>Source email ticket</h3>
                      <span>{intakeTicket.ticketNumber ?? "Email intake"}</span>
                    </div>
                    <div className="source-ticket-summary">
                      <div>
                        <span>Original request</span>
                        <strong>{intakeTicket.subject}</strong>
                        <p>{intakeTicket.summary}</p>
                      </div>
                      <div className="source-ticket-meta">
                        <span className="soft-chip">{intakeTicket.status}</span>
                        <strong>{intakeTicket.convertedRecordNumber ?? job.jobNumber}</strong>
                        <small>{intakeTicket.convertedAt ? new Date(intakeTicket.convertedAt).toLocaleString() : new Date(intakeTicket.updatedAt).toLocaleString()}</small>
                      </div>
                    </div>
                    <div className="source-ticket-history">
                      {(intakeTicket.history ?? []).slice(0, 6).map((event) => (
                        <div key={event.id}>
                          <span />
                          <div>
                            <strong>{event.status}</strong>
                            <p>{event.note}</p>
                            <small>{new Date(event.createdAt).toLocaleString()}{event.employeeName ? ` · ${event.employeeName}` : ""}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {parentOrder ? (
                  <section className="drawer-section source-ticket-section order">
                    <div className="compact-section-heading"><h3>Parent order</h3><span>{parentOrder.status}</span></div>
                    <div className="source-ticket-summary"><div><span>Customer order</span><strong>{parentOrder.orderNumber} — {parentOrder.title}</strong><p>This job is one of {parentOrder.jobIds.length} separately tracked finished products under the same customer request.</p></div><div className="source-ticket-meta"><strong>{Math.max(0, parentOrder.jobIds.indexOf(job.id)) + 1} of {parentOrder.jobIds.length}</strong><small>{parentOrder.source}</small></div></div>
                  </section>
                ) : null}

                {portalRequest ? (
                  <section className="drawer-section source-ticket-section portal">
                    <div className="compact-section-heading">
                      <h3>Source Customer Portal request</h3>
                      <span>{portalRequest.requestNumber ?? "Portal request"}</span>
                    </div>
                    <div className="source-ticket-summary">
                      <div>
                        <span>Customer submission</span>
                        <strong>{portalRequest.title}</strong>
                        <p>{portalRequest.note || "No additional customer instructions."}</p>
                      </div>
                      <div className="source-ticket-meta">
                        <span className="soft-chip">{portalRequest.status}</span>
                        <strong>{portalRequest.convertedRecordNumber ?? job.jobNumber}</strong>
                        <small>
                          {new Date(portalRequest.convertedAt ?? portalRequest.updatedAt).toLocaleString()}
                          {portalRequest.convertedBy ? ` · ${portalRequest.convertedBy}` : ""}
                        </small>
                      </div>
                    </div>
                    <div className="source-ticket-history">
                      {(() => {
                        const metadata = (portalRequest.metadata ?? {}) as CustomerPortalRequestMetadata;
                        const fields = [
                          ["Product", metadata.productType],
                          ["Quantity", metadata.quantity?.toLocaleString()],
                          [
                            "Finished size",
                            metadata.finishedWidth && metadata.finishedHeight
                              ? `${metadata.finishedWidth} × ${metadata.finishedHeight}`
                              : undefined
                          ],
                          ["Print", metadata.colorSpec],
                          ["Paper / material", metadata.paperPreference ?? metadata.material],
                          ["Due", metadata.dueDate]
                        ].filter((item): item is [string, string] => Boolean(item[1]));
                        return fields.map(([label, value]) => (
                          <div key={label}>
                            <span />
                            <div>
                              <strong>{label}</strong>
                              <p>{value}</p>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </section>
                ) : null}

                <section className="drawer-section ticket-note-section">
                  <div className="compact-section-heading">
                    <h3>Internal job note</h3>
                    {noteSaved ? <span>Saved</span> : <span>Visible to staff</span>}
                  </div>
                  <textarea
                    value={noteDraft}
                    readOnly={!canUpdateNotes}
                    onChange={(event) => {
                      setNoteDraft(event.target.value);
                      setNoteSaved(false);
                    }}
                    placeholder="Add production note, customer instruction, or file reminder..."
                  />
                  <div className="note-actions">
                    <span>{noteDraft.trim() ? "Internal note for this job." : "No note saved yet."}</span>
                    {canUpdateNotes ? (
                      <button
                        className="icon-button text-button small"
                        type="button"
                        onClick={() => {
                          onUpdateNote(job.id, noteDraft);
                          setNoteSaved(true);
                        }}
                      >
                        Save note
                      </button>
                    ) : null}
                  </div>
                </section>

                {canArchive ? (
                  <div className="drawer-actions">
                    {archiveConfirm ? (
                      <div className="confirm-action-row">
                        <span>Archive this job?</span>
                        <button className="icon-button text-button small" type="button" onClick={() => onArchive(job.id)}>Yes, archive</button>
                        <button className="text-button small" type="button" onClick={() => setArchiveConfirm(false)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="icon-button text-button" type="button" onClick={() => setArchiveConfirm(true)}>
                        <Archive size={16} />
                        Archive job
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "Production" ? (
              <div className="job-ticket-tab-panel production-tab-panel">
                <section className="production-command-card">
                  <div>
                    <span>Run on</span>
                    <h3>{machineName}</h3>
                    <p>{productionPlan?.instructions ?? "Confirm stock and sheet layout before running."}</p>
                  </div>
                  <div className="production-command-stats">
                    <div><span>Stock / sheet</span><strong>{stockRunLabel}</strong></div>
                    <div><span>Est. time</span><strong>{productionPlan ? `${productionPlan.estimatedMinutes.toLocaleString()} min` : "-"}</strong></div>
                  </div>
                </section>

                <section className="drawer-section no-top-border production-run-section">
                  <div className="compact-section-heading">
                    <h3>Production plan</h3>
                    <span>Calculated from the job setup</span>
                  </div>
                  <div className="drawer-grid production-run-grid">
                    <div><span>Machine</span><strong>{machineName}</strong></div>
                    <div><span>Parent sheet</span><strong>{parentSheetLabel}</strong></div>
                    <div><span>Stock</span><strong>{job.stockName}</strong></div>
                    <div><span>Pieces / sheet</span><strong>{productionPlan?.piecesPerSheet.toLocaleString() ?? "-"}</strong></div>
                    <div><span>Sheets to print</span><strong>{productionPlan?.sheetsNeeded.toLocaleString() ?? "-"}</strong></div>
                    <div><span>Piles</span><strong>{productionPlan?.piles.toLocaleString() ?? "-"}</strong></div>
                    <div><span>Pile limit</span><strong>{pileLimit ? `${pileLimit.toLocaleString()} sheets` : "-"}</strong></div>
                    <div><span>Cuts / pile</span><strong>{productionPlan?.cutsPerPile.toLocaleString() ?? "-"}</strong></div>
                    <div><span>Total cuts</span><strong>{productionPlan ? totalCuts.toLocaleString() : "-"}</strong></div>
                    <div><span>Finished size</span><strong>{formatSize(job.pieceWidth, job.pieceHeight)}</strong></div>
                    <div><span>Print spec</span><strong>{job.colorSpec}</strong></div>
                    <div><span>Sides</span><strong>{job.sides}</strong></div>
                  </div>
                </section>

                <section className="drawer-section">
                  <div className="compact-section-heading">
                    <h3>Finishing</h3>
                    <span>{job.bindery.length} operation{job.bindery.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="chip-row">
                    {job.bindery.length ? job.bindery.map((item) => <span className="soft-chip" key={item}>{item}</span>) : <span className="muted">No finishing selected.</span>}
                  </div>
                </section>

                {job.booklet?.enabled ? (
                  <section className="drawer-section">
                    <h3>Booklet setup</h3>
                    <div className="drawer-grid">
                      <div><span>Total pages</span><strong>{job.booklet.pageCount}</strong></div>
                      <div><span>Inside pages</span><strong>{job.booklet.insidePages}</strong></div>
                      <div><span>Binding</span><strong>{job.booklet.binding}</strong></div>
                      <div><span>Reading</span><strong>{job.booklet.readingDirection === "rtl" ? "Right to left" : "Left to right"}</strong></div>
                      {canViewPricing ? <div><span>Cover setup</span><strong>{formatMoney(job.pricing.bookletCover)}</strong></div> : null}
                    </div>
                  </section>
                ) : null}

                {canManageTime ? (
                  <section className="drawer-section">
                    <div className="compact-section-heading">
                      <h3>Production time</h3>
                      <span>{totalTime} min actual / {productionPlan?.estimatedMinutes.toLocaleString() ?? "-"} min estimated</span>
                    </div>
                    <div className="manual-time-grid">
                      {categories.map((category) => (
                        <label className="manual-time-box" key={category}>
                          <span>{TIME_LABELS[category]}</span>
                          <div className="manual-time-control">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={job.time?.[category] ?? 0}
                              onFocus={(event) => event.currentTarget.select()}
                              onClick={(event) => event.currentTarget.select()}
                              onChange={(event) => {
                                const minutes = event.target.value.replace(/\D/g, "");
                                onManualTime(job.id, category, minutes === "" ? 0 : Number(minutes));
                              }}
                            />
                            <em>min</em>
                          </div>
                        </label>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

            {activeTab === "Files" ? (
              <div className="job-ticket-tab-panel files-tab-panel">
                <section className="drawer-section no-top-border">
                  <div className="compact-section-heading">
                    <h3>Artwork & production files</h3>
                    <span>{hasArtwork ? "Ready for review" : "Missing"}</span>
                  </div>
                  {job.artworkPreview ? <img className="drawer-file-preview" src={job.artworkPreview} alt="Artwork preview" /> : null}
                  <div className="file-ticket-list">
                    {job.artworkName || job.artworkPreview ? (
                      <div className="file-ticket-row primary-artwork-row">
                        <FileText size={17} />
                        <div>
                          <strong>{job.artworkName ?? "Artwork preview attached"}</strong>
                          <span>Main artwork from quote/job setup</span>
                        </div>
                        {job.artworkPreview ? (
                          <button className="icon-button text-button small" type="button" onClick={() => downloadDataUrl(job.artworkPreview, job.artworkName || `${job.jobNumber}-artwork.png`)}>
                            <Download size={14} /> Download
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {files.map((file) => (
                      <div className="file-ticket-row" key={file.id}>
                        <FileText size={16} />
                        <div>
                          <strong>{file.name}</strong>
                          <span>{file.folder} / {file.status}{file.sourceProvider === "gmail" ? " / Linked from customer email" : ""} / {new Date(file.uploadedAt).toLocaleString()}</span>
                        </div>
                        <button className="icon-button text-button small" type="button" onClick={() => onOpenFile(file.id)}>
                          <Download size={14} /> Open
                        </button>
                      </div>
                    ))}
                    {!files.length && !job.artworkName && !job.artworkPreview ? (
                      <div className="empty-files-state">
                        <AlertTriangle size={20} />
                        <div><strong>No artwork attached</strong><span>Add a file before moving this job from Prepress to Printing.</span></div>
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "Emails" ? (
              <div className="job-ticket-tab-panel emails-tab-panel">
                <section className="drawer-section no-top-border">
                  <div className="compact-section-heading">
                    <h3>Customer email threads</h3>
                    <span>{linkedEmailThreads.length} linked thread{linkedEmailThreads.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="job-email-thread-list">
                    {linkedEmailThreads.map((thread) => (
                      <article key={thread.id}>
                        <header>
                          <div><Mail size={17} /><span><strong>{thread.subject}</strong><small>{thread.participantEmails.join(" / ")}</small></span></div>
                          <time>{new Date(thread.lastMessageAt).toLocaleString()}</time>
                        </header>
                        <div className="job-email-message-list">
                          {thread.messages.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()).map((message) => (
                            <div className={message.direction} key={message.id}>
                              <span><strong>{message.direction === "inbound" ? message.from : `Gross Printing → ${message.to.join(", ")}`}</strong><small>{new Date(message.sentAt).toLocaleString()}</small></span>
                              <p>{message.bodyText}</p>
                              {message.attachments.length ? (
                                <div className="job-email-attachments">
                                  {message.attachments.map((attachment) => (
                                    <button type="button" key={attachment.id} onClick={() => onDownloadEmailAttachment?.(thread.id, message.id, attachment.id)}>
                                      <Download size={14} />{attachment.filename}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                    {!linkedEmailThreads.length ? (
                      <div className="empty-files-state">
                        <Mail size={20} />
                        <div><strong>No email thread linked</strong><span>Open Email Center and link the customer order email to this job.</span></div>
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "History" ? (
              <div className="job-ticket-tab-panel history-tab-panel">
                <section className="history-current-stage">
                  <History size={19} />
                  <div>
                    <span>Current stage</span>
                    <h3>{job.status}</h3>
                    <p>{currentMinutes.toLocaleString()} minutes since {new Date(currentStartedAt).toLocaleString()}</p>
                  </div>
                  <strong>{sortedEvents[0]?.employeeName || "Gross Printing MIS"}</strong>
                </section>

                <section className="drawer-section no-top-border">
                  <div className="compact-section-heading">
                    <h3>Status history</h3>
                    <span>{chronologicalEvents.length + 1} recorded event{chronologicalEvents.length ? "s" : ""}</span>
                  </div>
                  <div className="job-history-timeline">
                    <div className="job-history-event created">
                      <span className="timeline-dot"><CheckCircle2 size={13} /></span>
                      <div>
                        <strong>Job created</strong>
                        <span>{new Date(job.createdAt).toLocaleString()}</span>
                        <small>Created in Gross Printing MIS</small>
                      </div>
                    </div>
                    {chronologicalEvents.map((event) => (
                      <div className={`job-history-event ${event.minutesInPreviousStatus > 1440 ? "slow" : ""}`} key={event.id}>
                        <span className="timeline-dot"><ArrowRight size={13} /></span>
                        <div>
                          <strong>{event.fromStatus ?? "Created"} → {event.toStatus}</strong>
                          <span>{new Date(event.movedAt).toLocaleString()} by {event.employeeName}</span>
                          <small>{event.note || `${event.minutesInPreviousStatus.toLocaleString()} min in previous stage`}</small>
                        </div>
                        <b>{event.minutesInPreviousStatus.toLocaleString()} min</b>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </aside>
  );
}
