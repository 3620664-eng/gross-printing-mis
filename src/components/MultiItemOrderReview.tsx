"use client";

import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Eye,
  FilePlus2,
  FolderTree,
  LoaderCircle,
  Plus,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProductPreset } from "@/lib/product-catalog";
import type {
  AiLearningExample,
  AiOrderSplitResult,
  EmailIntakeTicket,
  EmailThread,
  Job,
  OrderItemSuggestion,
  PaperStock
} from "@/lib/types";
import { buildLearningRecommendation } from "@/lib/learning-engine";

interface MultiItemOrderReviewProps {
  ticket: EmailIntakeTicket;
  thread?: EmailThread;
  authToken?: string;
  productCategories: string[];
  productPresets: ProductPreset[];
  paperStocks: PaperStock[];
  learningExamples: AiLearningExample[];
  jobs: Job[];
  onClose: () => void;
  onSaveAnalysis: (analysis: AiOrderSplitResult) => void;
  onCreateOrder: (analysis: AiOrderSplitResult, mode: "quote" | "job") => void;
}

function makeItem(index: number): OrderItemSuggestion {
  return {
    id: `item-${crypto.randomUUID().slice(0, 8)}`,
    title: `Print item ${index + 1}`,
    attachmentIds: [],
    finishing: [],
    missingInformation: ["Confirm quantity, finished size, stock, print sides, and finishing."],
    warnings: [],
    confidence: 0.35
  };
}

function textList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function modeLabel(mode: AiOrderSplitResult["recommendedMode"]) {
  if (mode === "single_job") return "one production job";
  if (mode === "multipart_job") return "one order with multiple production components";
  return "separate finished products under one order";
}

export function MultiItemOrderReview({
  ticket,
  thread,
  authToken,
  productCategories,
  productPresets,
  paperStocks,
  learningExamples,
  jobs,
  onClose,
  onSaveAnalysis,
  onCreateOrder
}: MultiItemOrderReviewProps) {
  const attachments = useMemo(() => {
    const allowed = new Set(ticket.attachmentIds);
    return (thread?.messages ?? []).flatMap((message) =>
      message.attachments
        .filter((attachment) => allowed.has(attachment.id))
        .map((attachment) => ({
          ...attachment,
          sourceMessageId: message.id,
          providerMessageId: message.providerMessageId,
          providerAttachmentId: attachment.providerAttachmentId,
          mailboxFolder: message.mailboxFolder,
          uidValidity: message.uidValidity ?? attachment.uidValidity
        }))
    );
  }, [thread, ticket.attachmentIds]);
  const requestText = useMemo(
    () => [
      ticket.subject,
      ticket.summary,
      ticket.notes,
      ...(thread?.messages.filter((message) => message.direction === "inbound").map((message) => message.bodyText) ?? [])
    ].filter(Boolean).join("\n\n").slice(0, 40000),
    [thread, ticket.notes, ticket.subject, ticket.summary]
  );
  const learningRecommendation = useMemo(
    () => buildLearningRecommendation({
      requestText,
      customerId: ticket.customerId,
      customerName: ticket.customerName,
      attachmentNames: attachments.map((attachment) => attachment.filename),
      examples: learningExamples,
      jobs,
      productPresets
    }),
    [attachments, jobs, learningExamples, productPresets, requestText, ticket.customerId, ticket.customerName]
  );
  const [analysis, setAnalysis] = useState<AiOrderSplitResult | undefined>(ticket.splitAnalysis);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const autoStarted = useRef(false);
  const insightById = useMemo(
    () => new Map((analysis?.attachmentInsights ?? []).map((insight) => [insight.attachmentId, insight])),
    [analysis?.attachmentInsights]
  );

  async function analyze() {
    if (busy) return;
    setBusy(true);
    setMessage(attachments.length
      ? `Inspecting ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} and preparing the job setup…`
      : "Reading the customer request and preparing the job setup…");
    try {
      const response = await fetch("/api/ai/split-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          requestText,
          customerName: ticket.customerName,
          attachments: attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            providerMessageId: attachment.providerMessageId,
            providerAttachmentId: attachment.providerAttachmentId,
            mailboxFolder: attachment.mailboxFolder,
            uidValidity: attachment.uidValidity
          })),
          categories: productCategories,
          products: productPresets.map((preset) => ({
            category: preset.category,
            name: preset.name,
            width: preset.width,
            height: preset.height
          })),
          papers: paperStocks.map((paper) => ({
            id: paper.id,
            name: paper.name,
            width: paper.sheetWidth,
            height: paper.sheetHeight,
            kind: paper.kind,
            categories: paper.productCategories
          })),
          learningRecommendation
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        result?: AiOrderSplitResult;
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error || "The automatic job setup could not be completed.");
      setAnalysis(payload.result);
      onSaveAnalysis(payload.result);
      const inspected = payload.result.attachmentInsights?.filter((item) => item.inspected).length ?? 0;
      const memoryLabel = payload.result.decisionSource === "shop_memory"
        ? " · prepared from Gross Printing memory without an OpenAI setup call"
        : payload.result.decisionSource === "shop_memory_plus_ai"
          ? " · Gross Printing memory + AI"
          : "";
      setMessage(
        `Draft setup prepared: ${payload.result.items.length} production item${payload.result.items.length === 1 ? "" : "s"}` +
        `${attachments.length ? ` · ${inspected}/${attachments.length} files inspected` : ""}${memoryLabel}. Nothing was created yet.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The automatic job setup could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoStarted.current || ticket.splitAnalysis) return;
    autoStarted.current = true;
    void analyze();
    // The dialog intentionally starts one analysis when first opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  function save(updated: AiOrderSplitResult) {
    setAnalysis(updated);
    onSaveAnalysis(updated);
  }

  function updateItem(itemId: string, changes: Partial<OrderItemSuggestion>) {
    if (!analysis) return;
    save({
      ...analysis,
      items: analysis.items.map((item) => item.id === itemId ? { ...item, ...changes } : item)
    });
  }

  function resolveMissing(itemId: string, issue: string) {
    if (!analysis) return;
    updateItem(itemId, {
      missingInformation: analysis.items.find((item) => item.id === itemId)?.missingInformation.filter((entry) => entry !== issue) ?? []
    });
  }

  function removeItem(itemId: string) {
    if (!analysis || analysis.items.length <= 1) return;
    const removed = analysis.items.find((item) => item.id === itemId);
    save({
      ...analysis,
      items: analysis.items.filter((item) => item.id !== itemId),
      generalAttachmentIds: Array.from(new Set([
        ...analysis.generalAttachmentIds,
        ...(removed?.attachmentIds ?? [])
      ]))
    });
  }

  function addItem() {
    const base: AiOrderSplitResult = analysis ?? {
      id: `split-${crypto.randomUUID().slice(0, 8)}`,
      source: "email",
      model: "staff review",
      configured: false,
      demo: true,
      createdAt: new Date().toISOString(),
      summary: "Staff-created automatic job setup.",
      recommendedMode: "multiple_jobs",
      items: [],
      generalAttachmentIds: attachments.map((attachment) => attachment.id),
      missingInformation: [],
      warnings: [],
      confidence: 1
    };
    save({ ...base, recommendedMode: "multiple_jobs", items: [...base.items, makeItem(base.items.length)] });
  }

  function assignAttachment(itemId: string, attachmentId: string) {
    if (!analysis) return;
    const currentlyAssigned = analysis.items.find((item) => item.attachmentIds.includes(attachmentId))?.id;
    save({
      ...analysis,
      generalAttachmentIds: analysis.generalAttachmentIds.filter((id) => id !== attachmentId),
      items: analysis.items.map((item) => ({
        ...item,
        attachmentIds:
          item.id === itemId
            ? Array.from(new Set([...item.attachmentIds, attachmentId]))
            : item.id === currentlyAssigned
              ? item.attachmentIds.filter((id) => id !== attachmentId)
              : item.attachmentIds
      }))
    });
  }

  function moveToGeneral(attachmentId: string) {
    if (!analysis) return;
    save({
      ...analysis,
      generalAttachmentIds: Array.from(new Set([...analysis.generalAttachmentIds, attachmentId])),
      items: analysis.items.map((item) => ({ ...item, attachmentIds: item.attachmentIds.filter((id) => id !== attachmentId) }))
    });
  }

  const readyForQuote = Boolean(
    analysis?.items.length &&
    ticket.customerId &&
    analysis.items.every((item) =>
      item.title.trim() &&
      item.productCategory?.trim() &&
      item.quantity &&
      item.finishedWidth &&
      item.finishedHeight &&
      item.sides &&
      item.colorSpec?.trim() &&
      item.stockId &&
      item.stockConfirmed &&
      item.missingInformation.length === 0
    )
  );
  const readyForJob = Boolean(
    readyForQuote && analysis?.items.every((item) => item.dueDate?.trim())
  );

  return (
    <div className="multi-order-overlay" role="dialog" aria-modal="true" aria-label="Automatic job setup review">
      <section className="multi-order-modal">
        <header>
          <div>
            <p>{ticket.ticketNumber ?? "Email ticket"} · Automatic job setup</p>
            <h2>Turn this email into the correct production structure</h2>
            <span>AI reads the request, inspects supported artwork, groups related files, and proposes the setup. You approve every important decision before anything is created.</span>
          </div>
          <button className="icon-only" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>

        {learningRecommendation ? (
          <section className={`learning-engine-card ${learningRecommendation.safeToReuse ? "strong" : "reference"}`}>
            <div>
              <BrainCircuit size={20} />
              <span>
                <strong>Gross Printing memory · {Math.round(learningRecommendation.confidence * 100)}% match</strong>
                <small>{learningRecommendation.explanation}</small>
              </span>
            </div>
            <div className="learning-engine-stats">
              <span>{learningRecommendation.repeatCount} similar approved setup{learningRecommendation.repeatCount === 1 ? "" : "s"}</span>
              {learningRecommendation.customerSpecificCount ? <span>{learningRecommendation.customerSpecificCount} for this customer</span> : null}
              {learningRecommendation.sourceJobNumbers.length ? <span>Examples: {learningRecommendation.sourceJobNumbers.join(", ")}</span> : null}
              {learningRecommendation.safeToReuse ? <b>Strong enough for memory-first setup</b> : <b>Reference only — AI/staff review stays active</b>}
            </div>
          </section>
        ) : null}

        <div className="multi-order-toolbar">
          <button className="primary-button" type="button" onClick={analyze} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <BrainCircuit size={17} />}
            {busy ? "Preparing job setup..." : analysis ? "Analyze again" : "Prepare job setup"}
          </button>
          <button className="secondary-button" type="button" onClick={addItem} disabled={busy}><Plus size={16} />Add product / component</button>
          <span>{attachments.length} attachment{attachments.length === 1 ? "" : "s"}</span>
        </div>
        {message ? <div className="multi-order-message">{message}</div> : null}

        {analysis ? (
          <>
            <section className="multi-order-summary">
              <FolderTree size={22} />
              <div>
                <strong>{analysis.summary}</strong>
                <span>Recommended: {modeLabel(analysis.recommendedMode)} · {Math.round(analysis.confidence * 100)}% confidence</span>
              </div>
              <select
                value={analysis.recommendedMode}
                onChange={(event) => save({ ...analysis, recommendedMode: event.target.value as AiOrderSplitResult["recommendedMode"] })}
              >
                <option value="multiple_jobs">Separate finished products under one order</option>
                <option value="multipart_job">One order with multiple production components</option>
                <option value="single_job">One production job</option>
              </select>
            </section>

            {analysis.attachmentInsights?.length ? (
              <section className="multi-order-general-files">
                <strong><Eye size={15} /> File inspection</strong>
                <div>
                  {analysis.attachmentInsights.map((insight) => (
                    <span className={insight.inspected ? "soft-chip success" : "soft-chip"} key={insight.attachmentId} title={insight.summary || insight.warnings.join(" ")}>
                      {insight.filename} · {insight.inspected ? "inspected" : "metadata only"}
                      {insight.pageCount ? ` · ${insight.pageCount} pg` : ""}
                      {insight.artworkWidth && insight.artworkHeight ? ` · ${insight.artworkWidth} × ${insight.artworkHeight}` : ""}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {analysis.missingInformation.length || analysis.warnings.length ? (
              <section className="multi-order-general-files">
                <strong>Order-level review notes</strong>
                {analysis.missingInformation.map((issue) => <p key={issue}><AlertTriangle size={14} /> {issue}</p>)}
                {analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </section>
            ) : null}

            <div className="multi-order-items">
              {analysis.items.map((item, index) => (
                <article key={item.id}>
                  <div className="multi-order-item-heading">
                    <span>{index + 1}</span>
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
                    <button className="icon-only danger" type="button" onClick={() => removeItem(item.id)} disabled={analysis.items.length <= 1} aria-label="Remove item"><Trash2 size={16} /></button>
                  </div>
                  <div className="multi-order-spec-grid">
                    <label>Product<select value={item.productCategory ?? ""} onChange={(event) => updateItem(item.id, { productCategory: event.target.value || undefined })}><option value="">Choose category...</option>{productCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
                    <label>Quantity<input type="number" min="1" value={item.quantity ?? ""} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) || undefined })} /></label>
                    <label>Finished width<input type="number" min="0.1" step="0.125" value={item.finishedWidth ?? ""} onChange={(event) => updateItem(item.id, { finishedWidth: Number(event.target.value) || undefined })} /></label>
                    <label>Finished height<input type="number" min="0.1" step="0.125" value={item.finishedHeight ?? ""} onChange={(event) => updateItem(item.id, { finishedHeight: Number(event.target.value) || undefined })} /></label>
                    <label>Sides<select value={item.sides ?? ""} onChange={(event) => updateItem(item.id, { sides: event.target.value === "1" ? 1 : event.target.value === "2" ? 2 : undefined })}><option value="">Choose...</option><option value="1">1 side</option><option value="2">2 sides</option></select></label>
                    <label>Print<input value={item.colorSpec ?? ""} onChange={(event) => updateItem(item.id, { colorSpec: event.target.value })} placeholder="4/4 full color" /></label>
                    <label>Paper / stock<select value={item.stockId ?? ""} onChange={(event) => updateItem(item.id, { stockId: event.target.value || undefined, stockConfirmed: Boolean(event.target.value) })}><option value="">Choose / confirm stock...</option>{paperStocks.map((paper) => <option key={paper.id} value={paper.id}>{paper.name} · {paper.sheetWidth} × {paper.sheetHeight}</option>)}</select></label>
                    <label>Finishing<input value={item.finishing.join(", ")} onChange={(event) => updateItem(item.id, { finishing: textList(event.target.value) })} /></label>
                    <label>Due date<input type="date" value={item.dueDate ?? ""} onChange={(event) => updateItem(item.id, { dueDate: event.target.value || undefined })} /></label>
                    <label>Due time<input type="time" value={item.dueTime ?? ""} onChange={(event) => updateItem(item.id, { dueTime: event.target.value || undefined })} /></label>
                  </div>
                  {item.paperHint || item.stockRecommendationReason || (item.stockId && !item.stockConfirmed) ? (
                    <div className="multi-order-message">
                      {item.paperHint ? <span><strong>Customer / AI paper wording:</strong> {item.paperHint}</span> : null}
                      {item.stockRecommendationReason ? <span> · <strong>Stock recommendation:</strong> {item.stockRecommendationReason}</span> : null}
                      {item.stockId && !item.stockConfirmed ? (
                        <button className="text-button small" type="button" onClick={() => updateItem(item.id, { stockConfirmed: true })}>Confirm this stock</button>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="multi-order-notes">Item notes<textarea value={item.notes ?? ""} onChange={(event) => updateItem(item.id, { notes: event.target.value })} /></label>
                  <div className="multi-order-attachments">
                    <strong>Files assigned to this product / component</strong>
                    <div>
                      {attachments.map((attachment) => {
                        const insight = insightById.get(attachment.id);
                        return (
                          <button
                            className={item.attachmentIds.includes(attachment.id) ? "active" : ""}
                            type="button"
                            key={attachment.id}
                            onClick={() => assignAttachment(item.id, attachment.id)}
                            title={[insight?.summary, insight?.relationshipHint, ...(insight?.warnings ?? [])].filter(Boolean).join(" ")}
                          >
                            <FilePlus2 size={14} />{attachment.filename}
                            {insight?.likelyProduct ? <small>{insight.likelyProduct}</small> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {item.missingInformation.length ? (
                    <div className="multi-order-warning">
                      <AlertTriangle size={16} />
                      <div>
                        <strong>Needs confirmation</strong>
                        {item.missingInformation.map((issue) => (
                          <div key={issue}>
                            <span>{issue}</span>
                            <button className="text-button small" type="button" onClick={() => resolveMissing(item.id, issue)}>Mark resolved</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <div className="multi-order-ready"><CheckCircle2 size={16} />Core item details are confirmed.</div>}
                  {item.warnings.length ? <div className="multi-order-message"><strong>Warnings:</strong> {item.warnings.join(" ")}</div> : null}
                </article>
              ))}
            </div>

            <section className="multi-order-general-files">
              <strong>General order / reference files</strong>
              <div>
                {attachments.map((attachment) => (
                  <button
                    className={analysis.generalAttachmentIds.includes(attachment.id) ? "active" : ""}
                    type="button"
                    key={attachment.id}
                    onClick={() => moveToGeneral(attachment.id)}
                  >{attachment.filename}</button>
                ))}
              </div>
            </section>

            <footer>
              <div>
                <strong>{readyForJob ? "Ready for quote or production" : readyForQuote ? "Ready for quote; due date required for production" : "Staff confirmation is still required"}</strong>
                <span>{readyForQuote ? "Creating the order makes one OR number and preserves every approved production item/component and source file." : "Confirm customer, product, quantity, size, sides, print, stock, file grouping, and all Needs confirmation items."}</span>
              </div>
              <button className="secondary-button" type="button" onClick={() => onCreateOrder(analysis, "quote")} disabled={!readyForQuote}>Create order + quote</button>
              <button className="primary-button" type="button" onClick={() => onCreateOrder(analysis, "job")} disabled={!readyForJob}>Create order + production jobs</button>
            </footer>
          </>
        ) : (
          <div className="multi-order-empty">
            <LoaderCircle className={busy ? "spin" : ""} size={38} />
            <strong>{busy ? "Preparing the job setup" : "No job setup yet"}</strong>
            <span>{busy ? "The system is reading the request and inspecting supported attachments." : "Run the setup, then approve the proposed products, components, files, and specifications before creating anything."}</span>
          </div>
        )}
      </section>
    </div>
  );
}
