import "server-only";

import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { loadMailboxAttachment } from "./gmail-server";
import type { AiLearningRecommendation, AiOrderSplitResult, OrderAttachmentInsight, OrderItemSuggestion } from "./types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASIC_MODEL = process.env.OPENAI_BASIC_MODEL ?? "gpt-5-mini";
const DEMO_MODE = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const INSPECTION_BATCH_SIZE = 4;

export type OrderSplitAttachment = {
  id: string;
  filename: string;
  mimeType?: string;
  size?: number;
  providerMessageId?: string;
  providerAttachmentId?: string;
  mailboxFolder?: "inbox" | "sent";
  uidValidity?: string;
};

export type AiOrderSplitInput = {
  requestText: string;
  customerName?: string;
  attachments: OrderSplitAttachment[];
  categories?: string[];
  products?: Array<{ category?: string; name?: string; width?: number; height?: number }>;
  papers?: Array<{ id: string; name: string; width?: number; height?: number; kind?: string; categories?: string[] }>;
  learningRecommendation?: AiLearningRecommendation;
};

type OpenAiResponsePayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

type PreparedAttachment = {
  attachment: OrderSplitAttachment;
  insight: OrderAttachmentInsight;
  modelContent?: Record<string, unknown>;
};

const itemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "title",
    "attachmentIds",
    "productCategory",
    "productName",
    "quantity",
    "finishedWidth",
    "finishedHeight",
    "sides",
    "colorSpec",
    "paperHint",
    "stockId",
    "stockRecommendationReason",
    "finishing",
    "dueDate",
    "dueTime",
    "notes",
    "missingInformation",
    "warnings",
    "confidence"
  ],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    attachmentIds: { type: "array", items: { type: "string" } },
    productCategory: { type: ["string", "null"] },
    productName: { type: ["string", "null"] },
    quantity: { type: ["number", "null"] },
    finishedWidth: { type: ["number", "null"] },
    finishedHeight: { type: ["number", "null"] },
    sides: { type: ["integer", "null"], enum: [1, 2, null] },
    colorSpec: { type: ["string", "null"] },
    paperHint: { type: ["string", "null"] },
    stockId: { type: ["string", "null"] },
    stockRecommendationReason: { type: ["string", "null"] },
    finishing: { type: "array", items: { type: "string" } },
    dueDate: { type: ["string", "null"] },
    dueTime: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    missingInformation: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
} as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "recommendedMode",
    "items",
    "generalAttachmentIds",
    "missingInformation",
    "warnings",
    "confidence"
  ],
  properties: {
    summary: { type: "string" },
    recommendedMode: {
      type: "string",
      enum: ["single_job", "multiple_jobs", "multipart_job"]
    },
    items: { type: "array", minItems: 1, maxItems: 30, items: itemSchema },
    generalAttachmentIds: { type: "array", items: { type: "string" } },
    missingInformation: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
} as const;

const insightItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "attachmentId",
    "contentKind",
    "detectedTitle",
    "likelyProduct",
    "relationshipHint",
    "summary",
    "warnings",
    "confidence"
  ],
  properties: {
    attachmentId: { type: "string" },
    contentKind: { type: ["string", "null"] },
    detectedTitle: { type: ["string", "null"] },
    likelyProduct: { type: ["string", "null"] },
    relationshipHint: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
} as const;

const insightSchema = {
  type: "object",
  additionalProperties: false,
  required: ["attachments"],
  properties: {
    attachments: { type: "array", minItems: 1, maxItems: INSPECTION_BATCH_SIZE, items: insightItemSchema }
  }
} as const;

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalText).filter((item): item is string => Boolean(item))
    : [];
}

function rounded(value: number, digits = 3) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function normalizedRatio(width: number, height: number) {
  const small = Math.min(width, height);
  const large = Math.max(width, height);
  return small > 0 ? large / small : 0;
}

function aspectMismatchPercent(aWidth: number, aHeight: number, bWidth: number, bHeight: number) {
  const a = normalizedRatio(aWidth, aHeight);
  const b = normalizedRatio(bWidth, bHeight);
  if (!a || !b) return undefined;
  return Math.abs(a - b) / a * 100;
}

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(?:page|pg)\s*\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Print item";
}

function normalizeItem(
  raw: unknown,
  index: number,
  validAttachmentIds: Set<string>,
  validStockIds: Set<string>
): OrderItemSuggestion {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const sides = Number(value.sides);
  const confidence = Number(value.confidence);
  const stockId = optionalText(value.stockId);
  return {
    id: optionalText(value.id) ?? `item-${index + 1}`,
    title: optionalText(value.title) ?? `Print item ${index + 1}`,
    attachmentIds: stringList(value.attachmentIds).filter((id) => validAttachmentIds.has(id)),
    productCategory: optionalText(value.productCategory),
    productName: optionalText(value.productName),
    quantity: positiveNumber(value.quantity),
    finishedWidth: positiveNumber(value.finishedWidth),
    finishedHeight: positiveNumber(value.finishedHeight),
    sides: sides === 1 || sides === 2 ? sides : undefined,
    colorSpec: optionalText(value.colorSpec),
    paperHint: optionalText(value.paperHint),
    stockId: stockId && validStockIds.has(stockId) ? stockId : undefined,
    stockConfirmed: false,
    stockRecommendationReason: optionalText(value.stockRecommendationReason),
    finishing: stringList(value.finishing),
    dueDate: optionalText(value.dueDate),
    dueTime: optionalText(value.dueTime),
    notes: optionalText(value.notes),
    missingInformation: stringList(value.missingInformation),
    warnings: stringList(value.warnings),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5
  };
}

function addArtworkChecks(items: OrderItemSuggestion[], insights: OrderAttachmentInsight[]) {
  const insightById = new Map(insights.map((insight) => [insight.attachmentId, insight]));
  return items.map((item) => {
    if (!item.finishedWidth || !item.finishedHeight) return item;
    const warnings = [...item.warnings];
    const missing = [...item.missingInformation];
    for (const attachmentId of item.attachmentIds) {
      const insight = insightById.get(attachmentId);
      if (!insight?.artworkWidth || !insight.artworkHeight) continue;
      const mismatch = aspectMismatchPercent(item.finishedWidth, item.finishedHeight, insight.artworkWidth, insight.artworkHeight);
      if (mismatch === undefined) continue;
      if (mismatch > 3) {
        const issue = `${insight.filename}: artwork proportion differs from ${item.finishedWidth} × ${item.finishedHeight} by about ${Math.round(mismatch)}%. Confirm crop, fit, rotation, or finished size.`;
        if (!missing.includes(issue)) missing.push(issue);
      } else if (mismatch > 1.25) {
        const warning = `${insight.filename}: artwork proportion is slightly different from the requested finished size; staff should verify it.`;
        if (!warnings.includes(warning)) warnings.push(warning);
      }
    }
    return { ...item, warnings, missingInformation: missing };
  });
}

function normalizeResult(
  raw: unknown,
  input: AiOrderSplitInput,
  attachmentInsights: OrderAttachmentInsight[]
): Omit<AiOrderSplitResult, "id" | "model" | "configured" | "demo" | "createdAt" | "source"> {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const validAttachmentIds = new Set(input.attachments.map((attachment) => attachment.id));
  const validStockIds = new Set((input.papers ?? []).map((paper) => paper.id));
  const rawItems = Array.isArray(value.items)
    ? value.items.map((item, index) => normalizeItem(item, index, validAttachmentIds, validStockIds))
    : [];
  const assignedOnce = new Set<string>();
  const deduped = rawItems.map((item) => ({
    ...item,
    attachmentIds: item.attachmentIds.filter((id) => {
      if (assignedOnce.has(id)) return false;
      assignedOnce.add(id);
      return true;
    })
  }));
  const items = addArtworkChecks(deduped, attachmentInsights);
  const assigned = new Set(items.flatMap((item) => item.attachmentIds));
  const explicitGeneral = stringList(value.generalAttachmentIds).filter((id) => validAttachmentIds.has(id) && !assigned.has(id));
  const unassigned = input.attachments.map((attachment) => attachment.id).filter((id) => !assigned.has(id));
  const mode = value.recommendedMode === "single_job" || value.recommendedMode === "multipart_job"
    ? value.recommendedMode
    : "multiple_jobs";
  const confidence = Number(value.confidence);
  return {
    summary: optionalText(value.summary) ?? "Review the proposed print items and attachment assignments before creating records.",
    recommendedMode: mode,
    items: items.length ? items : [normalizeItem({}, 0, validAttachmentIds, validStockIds)],
    attachmentInsights,
    generalAttachmentIds: Array.from(new Set([...explicitGeneral, ...unassigned])),
    missingInformation: stringList(value.missingInformation),
    warnings: stringList(value.warnings),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5
  };
}

function demoInsights(input: AiOrderSplitInput): OrderAttachmentInsight[] {
  return input.attachments.map((attachment) => ({
    attachmentId: attachment.id,
    filename: attachment.filename,
    inspected: false,
    detectedTitle: titleFromFilename(attachment.filename),
    contentKind: attachment.mimeType,
    summary: "Attachment content was not visually inspected because AI file analysis is not configured.",
    warnings: [],
    confidence: 0.3
  }));
}

function demoSplit(
  input: AiOrderSplitInput,
  attachmentInsights: OrderAttachmentInsight[]
): Omit<AiOrderSplitResult, "id" | "model" | "configured" | "demo" | "createdAt" | "source"> {
  const productionAttachments = input.attachments.filter((attachment) =>
    attachment.mimeType === "application/pdf" || attachment.mimeType?.startsWith("image/")
  );
  const candidates = productionAttachments.length ? productionAttachments : input.attachments;
  const items = candidates.map((attachment, index): OrderItemSuggestion => ({
    id: `item-${index + 1}`,
    title: titleFromFilename(attachment.filename),
    attachmentIds: [attachment.id],
    productCategory: undefined,
    productName: undefined,
    quantity: undefined,
    finishedWidth: undefined,
    finishedHeight: undefined,
    sides: undefined,
    colorSpec: undefined,
    paperHint: undefined,
    stockId: undefined,
    stockConfirmed: false,
    stockRecommendationReason: undefined,
    finishing: [],
    dueDate: undefined,
    dueTime: undefined,
    notes: undefined,
    missingInformation: [
      "Confirm whether this file is a separate finished product or part of another product.",
      "Confirm quantity, finished size, paper, print sides, and finishing."
    ],
    warnings: [],
    confidence: 0.4
  }));
  const assigned = new Set(items.flatMap((item) => item.attachmentIds));
  return {
    summary: "A staff review is required to group the email and attachments into production items.",
    recommendedMode: items.length > 1 ? "multiple_jobs" : "single_job",
    items: items.length ? items : [{
      id: "item-1",
      title: "Print item 1",
      attachmentIds: [],
      finishing: [],
      missingInformation: ["Identify the finished product and specifications."],
      warnings: [],
      confidence: 0.35
    }],
    attachmentInsights,
    generalAttachmentIds: input.attachments.map((attachment) => attachment.id).filter((id) => !assigned.has(id)),
    missingInformation: ["Staff must approve the job setup before any quote or production job is created."],
    warnings: [],
    confidence: 0.4
  };
}

function responseText(payload: OpenAiResponsePayload) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) return content.text.trim();
    }
  }
  return "";
}

function splitRetryDelayMs(response: Response, message?: string) {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(35_000, Math.max(1_000, Math.ceil(seconds * 1000)));
  }
  const match = message?.match(/(?:try again in|retry in)\s*([\d.]+)s/i);
  return match ? Math.min(35_000, Math.max(1_000, Math.ceil(Number(match[1]) * 1000) + 750)) : 12_000;
}

function splitWait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openAiJson<T>(body: Record<string, unknown>, errorLabel: string): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => ({}))) as OpenAiResponsePayload;
    if (!response.ok) {
      const message = payload.error?.message ?? `${errorLabel} (${response.status}).`;
      if (response.status === 429 && attempt < maxAttempts) {
        await splitWait(splitRetryDelayMs(response, message));
        continue;
      }
      throw new Error(message);
    }
    const text = responseText(payload);
    if (!text) throw new Error(`${errorLabel}: OpenAI returned no structured response.`);
    return JSON.parse(text) as T;
  }
  throw new Error(`${errorLabel}: the AI rate limit did not clear in time.`);
}

async function prepareAttachment(attachment: OrderSplitAttachment): Promise<PreparedAttachment> {
  const base: OrderAttachmentInsight = {
    attachmentId: attachment.id,
    filename: attachment.filename,
    inspected: false,
    contentKind: attachment.mimeType,
    detectedTitle: titleFromFilename(attachment.filename),
    warnings: [],
    confidence: 0.35
  };
  const sourceReady = Boolean(
    attachment.providerMessageId && /^\d+$/.test(attachment.providerMessageId) &&
    attachment.providerAttachmentId && /^part-\d+$/.test(attachment.providerAttachmentId) &&
    attachment.uidValidity && /^\d+$/.test(attachment.uidValidity)
  );
  if (!sourceReady) {
    return { attachment, insight: { ...base, warnings: ["Mailbox source identity is incomplete; refresh Email Center before relying on file inspection."] } };
  }
  if ((attachment.size ?? 0) > MAX_ATTACHMENT_BYTES) {
    return { attachment, insight: { ...base, warnings: ["File is larger than the automatic AI inspection limit; staff should inspect it manually."] } };
  }

  try {
    const loaded = await loadMailboxAttachment(
      attachment.providerMessageId!,
      attachment.providerAttachmentId!,
      attachment.mailboxFolder === "sent" ? "sent" : "inbox",
      attachment.uidValidity!
    );
    const mime = (loaded.mimeType || attachment.mimeType || "application/octet-stream").toLowerCase();
    const filename = loaded.filename || attachment.filename;

    if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      const pdf = await PDFDocument.load(loaded.bytes, { ignoreEncryption: true, updateMetadata: false });
      const pages = pdf.getPages();
      const first = pages[0];
      if (!first) throw new Error("PDF does not contain a printable page.");
      const selectedIndexes = pages.length <= 2 ? pages.map((_, index) => index) : [0, pages.length - 1];
      const preview = await PDFDocument.create();
      const copied = await preview.copyPages(pdf, selectedIndexes);
      copied.forEach((page) => preview.addPage(page));
      const previewBytes = await preview.save({ useObjectStreams: true });
      const previewTooLarge = previewBytes.length > 5 * 1024 * 1024;
      const insight: OrderAttachmentInsight = {
        ...base,
        filename,
        inspected: true,
        contentKind: "PDF",
        artworkWidth: rounded(first.getWidth() / 72),
        artworkHeight: rounded(first.getHeight() / 72),
        pageCount: pages.length,
        warnings: [
          ...(pages.length > selectedIndexes.length
            ? [`AI uses ${selectedIndexes.length} representative pages out of ${pages.length}; page count and first-page size were measured from the full PDF.`]
            : []),
          ...(previewTooLarge ? ["Representative PDF preview is too large for automatic visual inspection; measured metadata and filename are still used."] : [])
        ],
        confidence: 0.7
      };
      return {
        attachment,
        insight,
        modelContent: previewTooLarge ? undefined : {
          type: "input_file",
          filename,
          file_data: Buffer.from(previewBytes).toString("base64")
        }
      };
    }

    if (mime.startsWith("image/") || /\.(png|jpe?g|tiff?|webp|gif)$/i.test(filename)) {
      const source = sharp(loaded.bytes, { animated: false });
      const metadata = await source.metadata();
      const widthPixels = metadata.width;
      const heightPixels = metadata.height;
      const density = positiveNumber(metadata.density);
      const resized = await source
        .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "white" })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
      const insight: OrderAttachmentInsight = {
        ...base,
        filename,
        inspected: true,
        contentKind: "Image",
        artworkWidth: density && widthPixels ? rounded(widthPixels / density) : undefined,
        artworkHeight: density && heightPixels ? rounded(heightPixels / density) : undefined,
        warnings: density ? [] : ["Image has no reliable DPI, so physical size must be confirmed from the requested finished size."],
        confidence: 0.7
      };
      return {
        attachment,
        insight,
        modelContent: {
          type: "input_image",
          detail: "low",
          image_url: `data:image/jpeg;base64,${resized.toString("base64")}`
        }
      };
    }

    return {
      attachment,
      insight: {
        ...base,
        filename,
        contentKind: mime,
        warnings: ["This attachment type cannot be visually inspected automatically; filename and email context will still be used."],
        confidence: 0.4
      }
    };
  } catch (error) {
    return {
      attachment,
      insight: {
        ...base,
        warnings: [error instanceof Error ? error.message : "The attachment could not be inspected automatically."],
        confidence: 0.25
      }
    };
  }
}

function normalizeInsightModelResult(
  raw: unknown,
  prepared: PreparedAttachment[]
): OrderAttachmentInsight[] {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const modelItems = Array.isArray(value.attachments) ? value.attachments : [];
  const modelById = new Map<string, Record<string, unknown>>();
  for (const item of modelItems) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = optionalText(record.attachmentId);
    if (id) modelById.set(id, record);
  }
  return prepared.map(({ attachment, insight }) => {
    const model = modelById.get(attachment.id);
    if (!model) return insight;
    const confidence = Number(model.confidence);
    return {
      ...insight,
      contentKind: optionalText(model.contentKind) ?? insight.contentKind,
      detectedTitle: optionalText(model.detectedTitle) ?? insight.detectedTitle,
      likelyProduct: optionalText(model.likelyProduct),
      relationshipHint: optionalText(model.relationshipHint),
      summary: optionalText(model.summary),
      warnings: Array.from(new Set([...insight.warnings, ...stringList(model.warnings)])),
      confidence: Number.isFinite(confidence) ? Math.max(insight.confidence, Math.min(1, Math.max(0, confidence))) : insight.confidence
    };
  });
}

async function inspectAttachmentBatch(prepared: PreparedAttachment[]) {
  const visual = prepared.filter((item) => item.modelContent);
  if (!visual.length) return prepared.map((item) => item.insight);
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: `Inspect each supplied print attachment independently. Use the exact attachment IDs from this manifest and do not invent IDs. Identify what the file appears to be, its visible title/content, likely print product, and whether it looks like a cover, inside pages, front/back, page in a sequence, alternate version, reference/sample, or separate finished product. Do not guess quantity or customer instructions from artwork unless clearly printed as part of the artwork.\n\nManifest:\n${JSON.stringify(prepared.map((item) => ({
      attachmentId: item.attachment.id,
      filename: item.insight.filename,
      mimeType: item.attachment.mimeType,
      measuredWidth: item.insight.artworkWidth,
      measuredHeight: item.insight.artworkHeight,
      pageCount: item.insight.pageCount
    })))} `
  }];
  for (const item of prepared) {
    if (!item.modelContent) continue;
    content.push({ type: "input_text", text: `ATTACHMENT ${item.attachment.id}: ${item.insight.filename}` });
    content.push(item.modelContent);
  }
  const raw = await openAiJson<unknown>({
    model: BASIC_MODEL,
    store: false,
    max_output_tokens: 1000,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "gross_printing_attachment_inspection",
        strict: true,
        schema: insightSchema
      }
    }
  }, "Attachment inspection failed");
  return normalizeInsightModelResult(raw, prepared);
}

async function inspectAttachments(input: AiOrderSplitInput) {
  if (!OPENAI_API_KEY) return demoInsights(input);

  const results: OrderAttachmentInsight[] = [];
  for (let index = 0; index < input.attachments.length; index += INSPECTION_BATCH_SIZE) {
    const sourceBatch = input.attachments.slice(index, index + INSPECTION_BATCH_SIZE);
    const prepared: PreparedAttachment[] = [];
    for (const attachment of sourceBatch) prepared.push(await prepareAttachment(attachment));
    try {
      results.push(...await inspectAttachmentBatch(prepared));
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI attachment inspection failed.";
      results.push(...prepared.map((item) => ({ ...item.insight, warnings: Array.from(new Set([...item.insight.warnings, message])) })));
      if (/quota|rate limit|too many requests/i.test(message)) {
        for (const attachment of input.attachments.slice(index + INSPECTION_BATCH_SIZE)) {
          const fallback = await prepareAttachment(attachment);
          results.push({
            ...fallback.insight,
            warnings: Array.from(new Set([...fallback.insight.warnings, "AI visual inspection paused because the current API rate limit was reached; filename and measured metadata are still included."]))
          });
        }
        break;
      }
    }
    if (index + INSPECTION_BATCH_SIZE < input.attachments.length) await splitWait(6_000);
  }
  return results;
}

function memorySplit(
  input: AiOrderSplitInput,
  attachmentInsights: OrderAttachmentInsight[],
  memory: AiLearningRecommendation
): Omit<AiOrderSplitResult, "id" | "model" | "configured" | "demo" | "createdAt" | "source"> {
  const form = memory.finalForm;
  const stockId = form.stockId && (input.papers ?? []).some((paper) => paper.id === form.stockId) ? form.stockId : undefined;
  const stockName = stockId ? input.papers?.find((paper) => paper.id === stockId)?.name : undefined;
  const missingInformation: string[] = [];
  if (!form.quantity) missingInformation.push("Confirm quantity.");
  if (!form.pieceWidth || !form.pieceHeight) missingInformation.push("Confirm finished size.");
  if (!form.colorSpec) missingInformation.push("Confirm print/color specification.");
  if (!form.sides) missingInformation.push("Confirm one-sided or two-sided printing.");
  if (!stockId) missingInformation.push("Confirm paper stock.");
  else missingInformation.push(`Confirm the learned paper recommendation: ${stockName ?? stockId}.`);
  const item: OrderItemSuggestion = {
    id: "memory-item-1",
    title: form.title || memory.productName || "Print job",
    attachmentIds: input.attachments.map((attachment) => attachment.id),
    productCategory: memory.productCategory,
    productName: memory.productName,
    quantity: form.quantity,
    finishedWidth: form.pieceWidth,
    finishedHeight: form.pieceHeight,
    sides: form.sides,
    colorSpec: form.colorSpec,
    paperHint: stockName,
    stockId,
    stockConfirmed: false,
    stockRecommendationReason: `Learned from ${memory.repeatCount} similar staff-approved Gross Printing setup${memory.repeatCount === 1 ? "" : "s"}.`,
    finishing: form.bindery ?? [],
    dueDate: undefined,
    dueTime: undefined,
    notes: `Memory-first draft. ${memory.explanation}`,
    missingInformation,
    warnings: memory.conflicts.length ? [`Past jobs conflict on: ${memory.conflicts.join(", ")}.`] : [],
    confidence: memory.confidence
  };
  const checked = addArtworkChecks([item], attachmentInsights);
  return {
    summary: `Gross Printing memory prepared this draft from ${memory.repeatCount} similar approved setup${memory.repeatCount === 1 ? "" : "s"}. Staff approval is still required.`,
    recommendedMode: "single_job",
    items: checked,
    attachmentInsights,
    generalAttachmentIds: [],
    missingInformation: ["Staff must approve the learned setup before any quote or production job is created."],
    warnings: [],
    confidence: memory.confidence,
    decisionSource: "shop_memory",
    learning: memory
  };
}

async function deterministicAttachmentInsights(input: AiOrderSplitInput) {
  const results: OrderAttachmentInsight[] = [];
  for (const attachment of input.attachments) {
    const prepared = await prepareAttachment(attachment);
    results.push(prepared.insight);
  }
  return results;
}

async function liveSplit(input: AiOrderSplitInput, attachmentInsights: OrderAttachmentInsight[]) {
  const raw = await openAiJson<unknown>({
    model: BASIC_MODEL,
    store: false,
    max_output_tokens: 2800,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: `You are the Gross Printing automatic job-setup assistant. Convert a customer email plus attachment inspection results into a proposed production structure for staff approval. Every customer request can be different, so reason from the actual request and inspected files rather than using a fixed template.\n\nRules:\n- Determine whether the request is one finished product, one multi-part product, or several separate finished products.\n- NEVER assume one attachment equals one job. Sequential pages, front/back, cover/inside, corrected versions, logos, and reference samples may belong together.\n- Different finished products normally become separate production items under one parent order.\n- For multipart_job, keep separate component items when their size, stock, printing, or finishing differs; do not flatten away important component specifications.\n- Assign every attachment ID to exactly one proposed item or generalAttachmentIds. Never invent IDs.\n- Attachment insights marked inspected=true were derived from the real file content or measured file metadata and are stronger evidence than filenames alone.\n- Use the customer's email as the authority for quantity, requested size, paper, due date, sides, finishing, and special instructions. Artwork may help identify what a file is, but must not override explicit customer instructions.\n- Never use phone numbers, invoice numbers, job numbers, ZIP codes, dates, email addresses, URLs, or dollar amounts as quantities.\n- A phrase like 'one set of each' can mean quantity 1 for each finished item/group, but sequential pages that make one finished piece are not separate quantities.\n- If paper wording is vague (for example 'nice hard paper'), preserve it in paperHint. Recommend a stockId only when the available stock is a reasonable production recommendation, explain why in stockRecommendationReason, and still add a missing-information item when staff/customer confirmation is important.\n- Do not silently invent exact stock, size, quantity, sides, or finishing when the evidence is weak. Use null and add a concise missingInformation question.\n- Use measured artwork size only as a clue. If it conflicts with the requested finished size or proportion, flag it for staff confirmation.\n- Never create records, approve production, or send customer mail. This output is a draft setup for staff review.\n- Return only the strict JSON schema.\nAvailable categories: ${JSON.stringify(input.categories ?? [])}\nAvailable product presets: ${JSON.stringify((input.products ?? []).slice(0, 80))}\nAvailable paper stocks: ${JSON.stringify((input.papers ?? []).slice(0, 120))}
Approved Gross Printing memory (guidance only; explicit customer instructions always win): ${JSON.stringify(input.learningRecommendation ?? null)}`
        }]
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: JSON.stringify({
            customerName: input.customerName ?? null,
            requestText: input.requestText.slice(0, 16_000),
            attachments: input.attachments.map((attachment) => ({
              id: attachment.id,
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              size: attachment.size
            })),
            attachmentInsights
          })
        }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "gross_printing_automatic_job_setup",
        strict: true,
        schema
      }
    }
  }, "Automatic job setup failed");
  return normalizeResult(raw, input, attachmentInsights);
}

export async function analyzeOrderSplit(input: AiOrderSplitInput): Promise<AiOrderSplitResult> {
  const createdAt = new Date().toISOString();
  const memory = input.learningRecommendation;
  const canUseMemoryFirst = Boolean(
    memory?.safeToReuse &&
    memory.confidence >= 0.88 &&
    memory.repeatCount >= 3 &&
    input.attachments.length <= 1
  );
  if (canUseMemoryFirst && memory) {
    const attachmentInsights = await deterministicAttachmentInsights(input);
    const normalized = memorySplit(input, attachmentInsights, memory);
    return {
      id: `split-${crypto.randomUUID().slice(0, 12)}`,
      source: "email",
      model: "Gross Printing Learning Engine",
      configured: true,
      demo: false,
      createdAt,
      ...normalized
    };
  }
  const attachmentInsights = !OPENAI_API_KEY
    ? demoInsights(input)
    : await inspectAttachments(input);
  if (OPENAI_API_KEY && input.attachments.length > INSPECTION_BATCH_SIZE) await splitWait(4_000);
  const normalized = !OPENAI_API_KEY
    ? demoSplit(input, attachmentInsights)
    : await liveSplit(input, attachmentInsights);
  if (!OPENAI_API_KEY && !DEMO_MODE) throw new Error("OpenAI is not configured on the server.");
  return {
    id: `split-${crypto.randomUUID().slice(0, 12)}`,
    source: "email",
    model: OPENAI_API_KEY ? BASIC_MODEL : "demo-job-setup",
    configured: Boolean(OPENAI_API_KEY),
    demo: !OPENAI_API_KEY,
    createdAt,
    decisionSource: memory ? "shop_memory_plus_ai" : OPENAI_API_KEY ? "openai" : "staff",
    learning: memory,
    ...normalized
  };
}
