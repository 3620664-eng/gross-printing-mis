import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireActiveAppUser } from "./gmail-server";
import type {
  AiAnalysisMode,
  AiAnalysisResult,
  AiAnalysisSource,
  AiJobSpecification
} from "./types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASIC_MODEL = process.env.OPENAI_BASIC_MODEL ?? "gpt-5-mini";
const ADVANCED_MODEL = process.env.OPENAI_ADVANCED_MODEL ?? "gpt-5.6";
const DEMO_MODE = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export type AiCatalogContext = {
  categories?: string[];
  products?: Array<{ id?: string; category?: string; name?: string; width?: number; height?: number; colorSpec?: string; sides?: number }>;
  papers?: Array<{ id?: string; name?: string; width?: number; height?: number; kind?: string }>;
  finishing?: string[];
};

export type AiAnalyzeInput = {
  mode?: AiAnalysisMode;
  source?: AiAnalysisSource;
  requestText?: string;
  artwork?: {
    name?: string;
    mimeType?: string;
    dataUrl?: string;
    widthInches?: number;
    heightInches?: number;
    pageCount?: number;
  };
  current?: {
    customerName?: string;
    productCategory?: string;
    productName?: string;
    quantity?: number;
    finishedWidth?: number;
    finishedHeight?: number;
    sides?: number;
    colorSpec?: string;
    paperName?: string;
    dueDate?: string;
    dueTime?: string;
  };
  catalog?: AiCatalogContext;
};

type OpenAiResponsePayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "customerName",
    "productCategory",
    "productName",
    "quantity",
    "finishedWidth",
    "finishedHeight",
    "sides",
    "colorSpec",
    "paperHint",
    "finishing",
    "dueDate",
    "dueTime",
    "customerReference",
    "missingInformation",
    "warnings",
    "confidence",
    "complexity"
  ],
  properties: {
    summary: { type: "string" },
    customerName: { type: ["string", "null"] },
    productCategory: { type: ["string", "null"] },
    productName: { type: ["string", "null"] },
    quantity: { type: ["number", "null"] },
    finishedWidth: { type: ["number", "null"] },
    finishedHeight: { type: ["number", "null"] },
    sides: { type: ["integer", "null"], enum: [1, 2, null] },
    colorSpec: { type: ["string", "null"] },
    paperHint: { type: ["string", "null"] },
    finishing: { type: "array", items: { type: "string" } },
    dueDate: { type: ["string", "null"] },
    dueTime: { type: ["string", "null"] },
    customerReference: { type: ["string", "null"] },
    missingInformation: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    complexity: { type: "string", enum: ["simple", "moderate", "complex"] }
  }
} as const;

function cleanOptionalString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function normalizeSpecification(value: unknown): AiJobSpecification {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sidesValue = Number(raw.sides);
  const confidenceValue = Number(raw.confidence);
  const complexity = raw.complexity === "complex" || raw.complexity === "moderate" ? raw.complexity : "simple";
  return {
    summary: cleanOptionalString(raw.summary) ?? "The request was analyzed. Review every suggested field before applying it.",
    customerName: cleanOptionalString(raw.customerName),
    productCategory: cleanOptionalString(raw.productCategory),
    productName: cleanOptionalString(raw.productName),
    quantity: positiveNumber(raw.quantity),
    finishedWidth: positiveNumber(raw.finishedWidth),
    finishedHeight: positiveNumber(raw.finishedHeight),
    sides: sidesValue === 1 || sidesValue === 2 ? sidesValue : undefined,
    colorSpec: cleanOptionalString(raw.colorSpec),
    paperHint: cleanOptionalString(raw.paperHint),
    finishing: Array.isArray(raw.finishing) ? raw.finishing.map(cleanOptionalString).filter((item): item is string => Boolean(item)) : [],
    dueDate: cleanOptionalString(raw.dueDate),
    dueTime: cleanOptionalString(raw.dueTime),
    customerReference: cleanOptionalString(raw.customerReference),
    missingInformation: Array.isArray(raw.missingInformation) ? raw.missingInformation.map(cleanOptionalString).filter((item): item is string => Boolean(item)) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(cleanOptionalString).filter((item): item is string => Boolean(item)) : [],
    confidence: Number.isFinite(confidenceValue) ? Math.min(1, Math.max(0, confidenceValue)) : 0.5,
    complexity
  };
}

function firstMatch(text: string, expressions: RegExp[]) {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match) return match;
  }
  return undefined;
}

function demoSpecification(input: AiAnalyzeInput): AiJobSpecification {
  const text = `${input.requestText ?? ""} ${input.artwork?.name ?? ""}`.trim();
  const lower = text.toLowerCase();
  const quantityMatch = firstMatch(text.replace(/,/g, ""), [
    /(?:qty|quantity|need|print|order)\s*[:\-]?\s*(\d{2,7})/i,
    /\b(\d{2,7})\s*(?:pcs|pieces|copies|cards|flyers|labels|booklets|postcards)\b/i
  ]);
  const sizeMatch = firstMatch(text, [
    /(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")?/i,
    /(\d+)\s*[\- ]?up\s+on\s+(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)/i
  ]);
  const productPairs: Array<[string, string]> = [
    ["business card", "Business Cards"],
    ["postcard", "Postcards"],
    ["flyer", "Flyers & Brochures"],
    ["brochure", "Flyers & Brochures"],
    ["booklet", "Booklets & Books"],
    ["journal", "Booklets & Books"],
    ["label", "Labels & Stickers"],
    ["sticker", "Labels & Stickers"],
    ["envelope", "Envelopes"],
    ["invitation", "Invitations"],
    ["poster", "Signs & Banners"],
    ["banner", "Signs & Banners"],
    ["sign", "Signs & Banners"],
    ["receipt book", "Receipt Books"],
    ["copy", "Copies"]
  ];
  const product = productPairs.find(([needle]) => lower.includes(needle));
  const twoSides = /\b(2|two)[ -]?sided\b|\bdouble[ -]?sided\b|\b4\/4\b|\b1\/1\b|\b4\/1\b/i.test(text);
  const oneSide = /\b(1|one)[ -]?sided\b|\bsingle[ -]?sided\b|\b4\/0\b|\b1\/0\b/i.test(text);
  const colorSpec =
    /\b4\/4\b/.test(lower) ? "4/4 full color" :
    /\b4\/1\b/.test(lower) ? "4/1 color" :
    /\b4\/0\b/.test(lower) ? "4/0 full color" :
    /\b1\/1\b/.test(lower) ? "1/1 black" :
    /\b1\/0\b/.test(lower) ? "1/0 black" :
    lower.includes("black") && twoSides ? "1/1 black" :
    lower.includes("black") ? "1/0 black" :
    twoSides ? "4/4 full color" :
    oneSide ? "4/0 full color" :
    undefined;
  const finishing = [
    lower.includes("fold") ? "Fold" : "",
    lower.includes("score") ? "Score" : "",
    lower.includes("staple") ? "Staple" : "",
    lower.includes("laminat") ? "Laminate" : "",
    lower.includes("pad") ? "Pad" : "",
    lower.includes("die cut") ? "Die cut" : "",
    lower.includes("kiss cut") ? "Kiss cut" : ""
  ].filter(Boolean);
  const missingInformation: string[] = [];
  if (!product) missingInformation.push("What product is being ordered?");
  if (!quantityMatch) missingInformation.push("What quantity is needed?");
  if (!sizeMatch && !lower.includes("business card") && !lower.includes("envelope")) missingInformation.push("What is the finished size?");
  if (!colorSpec) missingInformation.push("Is it color or black-and-white, and one-sided or two-sided?");
  const confidence = Math.max(0.35, Math.min(0.92, 0.45 + (product ? 0.14 : 0) + (quantityMatch ? 0.12 : 0) + (sizeMatch ? 0.12 : 0) + (colorSpec ? 0.09 : 0)));
  return {
    summary: text ? `Demo analysis of: ${text.slice(0, 180)}` : "Add the customer request or artwork before analyzing.",
    customerName: input.current?.customerName,
    productCategory: product?.[1] ?? input.current?.productCategory,
    productName: product?.[0] ? product[0].replace(/\b\w/g, (letter) => letter.toUpperCase()) : input.current?.productName,
    quantity: quantityMatch ? Number(quantityMatch[1]) : input.current?.quantity,
    finishedWidth: sizeMatch ? Number(sizeMatch[1]) : input.current?.finishedWidth,
    finishedHeight: sizeMatch ? Number(sizeMatch[2]) : input.current?.finishedHeight,
    sides: twoSides ? 2 : oneSide ? 1 : input.current?.sides === 1 || input.current?.sides === 2 ? input.current.sides : undefined,
    colorSpec: colorSpec ?? input.current?.colorSpec,
    paperHint: firstMatch(text, [/\b(\d{2,3})#\s+([a-z ]+(?:cover|text|silk|gloss|matte))/i])?.[0] ?? input.current?.paperName,
    finishing,
    dueDate: input.current?.dueDate,
    dueTime: input.current?.dueTime,
    customerReference: undefined,
    missingInformation,
    warnings: input.artwork?.name ? ["Demo mode reads the filename and preview only. Connect the OpenAI API for model-based visual analysis."] : [],
    confidence,
    complexity: missingInformation.length >= 3 ? "moderate" : "simple"
  };
}

function systemPrompt(input: AiAnalyzeInput) {
  const catalog = input.catalog ?? {};
  return `You are the Gross Printing intake assistant. Your first job is to recognize the print job from ALL available evidence before asking staff questions.

Recognition order — follow this order every time:
1. Inspect the actual artwork preview and filename.
2. Use measured artwork evidence (page size and page count) as technical evidence.
3. Read the customer's email/request wording.
4. Use current form context only as a weak fallback. It may contain stale defaults from a previous preset and must never override the email or artwork.
5. Only after recognizing as much as possible, list the few remaining questions that truly block a correct quote or production setup.

Critical rules:
- Never calculate, recommend, or invent a selling price.
- Never decide that production is approved. A staff member must review and apply every suggestion.
- Return only the requested JSON schema.
- Do not ask generic checklist questions when the answer can be inferred from the artwork, page metadata, filename, or request.
- Use null only when the fact truly cannot be supported after inspecting all evidence.
- Never treat a phone number, invoice number, quote number, job number, tracking number, ZIP code, date, time, email address, URL, or dollar amount as the print quantity.
- Set quantity only when the source ties the number to printing language such as qty, quantity, pieces, pcs, copies, cards, flyers, labels, sheets, sets, books, envelopes, signs, posters, or an explicit request to print/order that many.
- For a PDF, measured trim/page dimensions are strong evidence. If the customer did not explicitly state a different finished size, use the measured PDF trim/page size as finishedWidth/finishedHeight instead of asking for size.
- For raster images, physical dimensions may be estimated from pixels, so use the visual content and request wording too. Flag uncertainty only when it matters.
- If the artwork visually and dimensionally identifies a common product, identify it instead of asking "what product/category?" Examples: a single 8.5 x 11 information/advertising sheet is normally a flyer; a 3.5 x 2 card layout is normally a business card; a multi-page cover/interior document is normally a booklet/book.
- If a one-page file is supplied and the customer does not request duplex/back printing, suggest sides=1. If the request explicitly says single-sided or double-sided, follow it.
- If color is plainly visible in the artwork and nothing requests black-only printing, it is acceptable to suggest a color print specification. Put uncertainty in warnings instead of asking a generic color question.
- If the file is 8.5 x 11 and the request separately mentions 11 x 17 without calling 11 x 17 the finished size, treat 11 x 17 as likely parent/flat production sheet context rather than asking which one is the finished size.
- Do not ask score direction, score location, or whether to fold after scoring merely to produce a quote when those details do not change the price. Put them in warnings/production notes for staff confirmation before production if needed.
- missingInformation is ONLY for unanswered facts that block a reliable quote or production setup. Keep it short. Prefer 0-2 questions when the artwork and email already provide the job.
- Put true conflicts, low-resolution concerns, uncertain trim/bleed, or page-handling issues in warnings.
- Keep summary short and operational and describe what the artwork/job appears to be. Do not include private reasoning.

Gross Printing production context:
- Small finished pieces are normally imposed on a larger parent sheet and cut after printing.
- 8.5 x 5.5 imposed four-up on 11 x 17 requires two cuts; the deterministic pricing engine handles the charge.
- Business cards and many color jobs commonly use 13 x 19 parent sheets.
- Glossy stock normally uses a parent sheet of at least 12 x 18.
- Posters are commonly produced on 13 x 19 unless wide-format is needed.
- The deterministic MIS pricing engine, not you, calculates paper, clicks, cutting, finishing, minimums, markup, and step & repeat.

Available categories:
${JSON.stringify(catalog.categories ?? [])}

Available product presets:
${JSON.stringify((catalog.products ?? []).slice(0, 70))}

Available paper names:
${JSON.stringify((catalog.papers ?? []).slice(0, 90))}

Available finishing choices:
${JSON.stringify((catalog.finishing ?? []).slice(0, 70))}`;
}

function sanitizeRequestForAi(value?: string) {
  if (!value) return "";
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email address]")
    .replace(/https?:\/\/\S+/gi, "[web link]")
    .replace(/\b(?:\+?1[\s.()-]*)?(?:\(?\d{3}\)?[\s.-]+)\d{3}[\s.-]+\d{4}\b/g, "[phone number]")
    .replace(/\b(?:tel|telephone|phone|cell|mobile)\s*[:#-]?\s*[+()\d\s.-]{7,}\b/gi, "[phone number]")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, 14_000);
}

function escapedNumber(value: number) {
  const text = Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quantityHasSourceEvidence(requestText: string | undefined, quantity: number | undefined) {
  if (!quantity || !requestText) return false;
  const text = sanitizeRequestForAi(requestText).replace(/,/g, "");
  const number = escapedNumber(quantity);
  const unit = "(?:pcs?|pieces?|copies?|cards?|flyers?|brochures?|labels?|stickers?|booklets?|books?|postcards?|posters?|signs?|banners?|envelopes?|sheets?|sets?|pads?|invitations?|receipts?)";
  const before = new RegExp(`(?:qty|quantity|need|print|order|make|run)\\s*[:#=-]?\\s*${number}\\b`, "i");
  const after = new RegExp(`\\b${number}\\s*${unit}\\b`, "i");
  return before.test(text) || after.test(text);
}

function enforceSupportedNumbers(specification: AiJobSpecification, input: AiAnalyzeInput) {
  if (input.current?.quantity || !specification.quantity) return specification;
  if (quantityHasSourceEvidence(input.requestText, specification.quantity)) return specification;
  const ignored = specification.quantity;
  return {
    ...specification,
    quantity: undefined,
    missingInformation: Array.from(new Set([
      ...specification.missingInformation,
      "Confirm the print quantity. A standalone contact/reference number was not accepted as quantity."
    ])),
    warnings: Array.from(new Set([
      ...specification.warnings,
      `Ignored quantity ${ignored} because the source did not clearly identify it as a print quantity.`
    ])),
    confidence: Math.min(specification.confidence, 0.72)
  };
}

function sameApproximateSize(leftWidth?: number, leftHeight?: number, rightWidth?: number, rightHeight?: number) {
  if (!leftWidth || !leftHeight || !rightWidth || !rightHeight) return false;
  const left = [Math.min(leftWidth, leftHeight), Math.max(leftWidth, leftHeight)];
  const right = [Math.min(rightWidth, rightHeight), Math.max(rightWidth, rightHeight)];
  return Math.abs(left[0] - right[0]) <= 0.16 && Math.abs(left[1] - right[1]) <= 0.16;
}

function reduceAnsweredQuestions(specification: AiJobSpecification, input: AiAnalyzeInput) {
  const artworkWidth = positiveNumber(input.artwork?.widthInches);
  const artworkHeight = positiveNumber(input.artwork?.heightInches);
  const pageCount = positiveNumber(input.artwork?.pageCount);
  const mime = input.artwork?.mimeType?.toLowerCase() ?? "";
  const isPdf = mime.includes("pdf") || input.artwork?.name?.toLowerCase().endsWith(".pdf");
  let next = { ...specification };

  // Apply deterministic file facts before deciding which questions are still unanswered.
  if (isPdf && artworkWidth && artworkHeight && (!next.finishedWidth || !next.finishedHeight)) {
    next = { ...next, finishedWidth: artworkWidth, finishedHeight: artworkHeight };
  }
  if (pageCount === 1 && !next.sides && !/\b(?:2|two)[ -]?sided\b|\bdouble[ -]?sided\b|\b4\/4\b|\b1\/1\b|\b4\/1\b/i.test(input.requestText ?? "")) {
    next = { ...next, sides: 1 };
  }

  // If the model recognized the item in its own description but omitted the structured category,
  // carry that recognition into the structured setup instead of asking staff to name the product again.
  const recognizedText = `${next.summary} ${input.artwork?.name ?? ""}`.toLowerCase();
  if (!next.productCategory && !next.productName) {
    if (/\b(?:flyer|brochure|leaflet)\b/.test(recognizedText)) next = { ...next, productCategory: "Flyers & Brochures", productName: "Flyer" };
    else if (/\bbusiness card\b/.test(recognizedText)) next = { ...next, productCategory: "Business Cards", productName: "Business Card" };
    else if (/\b(?:booklet|book|journal)\b/.test(recognizedText)) next = { ...next, productCategory: "Booklets & Books", productName: "Booklet" };
    else if (/\b(?:poster|sign|banner)\b/.test(recognizedText)) next = { ...next, productCategory: "Signs & Banners", productName: "Poster / Sign" };
    else if (/\b(?:label|sticker)\b/.test(recognizedText)) next = { ...next, productCategory: "Labels & Stickers", productName: "Label / Sticker" };
  }

  // Strong PDF-size fallback for common one-page print pieces when the model still left product blank.
  if (!next.productCategory && !next.productName && isPdf && pageCount === 1 && artworkWidth && artworkHeight) {
    if (sameApproximateSize(artworkWidth, artworkHeight, 3.5, 2)) next = { ...next, productCategory: "Business Cards", productName: "Business Card" };
    else if (
      sameApproximateSize(artworkWidth, artworkHeight, 8.5, 11) ||
      sameApproximateSize(artworkWidth, artworkHeight, 5.5, 8.5) ||
      sameApproximateSize(artworkWidth, artworkHeight, 11, 17)
    ) next = { ...next, productCategory: "Flyers & Brochures", productName: "Flyer" };
    else if (sameApproximateSize(artworkWidth, artworkHeight, 4, 6) || sameApproximateSize(artworkWidth, artworkHeight, 5, 7)) {
      next = { ...next, productCategory: "Postcards", productName: "Postcard" };
    }
  }

  const hasProduct = Boolean(next.productName || next.productCategory);
  const hasSize = Boolean(next.finishedWidth && next.finishedHeight);
  const hasColor = Boolean(next.colorSpec);
  const hasPaper = Boolean(next.paperHint);
  const hasScore = next.finishing.some((item) => /score/i.test(item));
  const removedOperational: string[] = [];

  const missingInformation = next.missingInformation.filter((question) => {
    const lower = question.toLowerCase();
    if (hasProduct && /(product|category|what .*ordered|what .*printing)/i.test(lower)) return false;
    if (next.quantity && /quantit|how many|number of (?:pieces|copies|sheets|sets|books|cards|flyers)/i.test(lower)) return false;
    if (hasSize && /(finished size|finished width|finished height|what size|dimension)/i.test(lower)) {
      if (!/conflict|does .* refer|which .* size/i.test(lower)) return false;
      if (sameApproximateSize(next.finishedWidth, next.finishedHeight, artworkWidth, artworkHeight)) return false;
    }
    if (next.sides && /(one.?sided|two.?sided|single.?sided|double.?sided|how many sides|print sides)/i.test(lower)) return false;
    if (hasColor && /(print color|color or black|black.?and.?white|colour)/i.test(lower)) return false;
    if (hasPaper && /(paper|stock)/i.test(lower)) return false;
    if (hasScore && /(score location|score direction|where .*score|fold .*after .*scor|after scoring)/i.test(lower)) {
      removedOperational.push(question);
      return false;
    }
    return true;
  });

  const warnings = [...next.warnings];
  if (removedOperational.length) {
    warnings.push("Scoring/folding placement details were treated as production notes instead of quote blockers; confirm them before production if the artwork does not make them clear.");
  }

  return {
    ...next,
    missingInformation: Array.from(new Set(missingInformation)).slice(0, 3),
    warnings: Array.from(new Set(warnings))
  };
}

class OpenAiRequestError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = "OpenAiRequestError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryDelayMs(response: Response, message?: string) {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, Math.max(1_000, Math.ceil(seconds * 1000)));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(30_000, Math.max(1_000, date - Date.now()));
  }
  const messageMatch = message?.match(/(?:try again in|retry in)\s*([\d.]+)s/i);
  if (messageMatch) return Math.min(30_000, Math.max(1_000, Math.ceil(Number(messageMatch[1]) * 1000) + 500));
  return 12_000;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function userPrompt(input: AiAnalyzeInput, previous?: AiJobSpecification) {
  const artworkWidth = positiveNumber(input.artwork?.widthInches);
  const artworkHeight = positiveNumber(input.artwork?.heightInches);
  const pageCount = positiveNumber(input.artwork?.pageCount);
  return JSON.stringify({
    task: previous
      ? "Re-check this request with deeper analysis. Recognize the artwork first, correct unsupported assumptions, and ask only questions that still block the job."
      : "Recognize the artwork/job first, then extract the supported job specification and ask only truly blocking questions.",
    source: input.source ?? "manual",
    customer_request: sanitizeRequestForAi(input.requestText) || null,
    artwork_evidence: {
      filename: input.artwork?.name || null,
      mime_type: input.artwork?.mimeType || null,
      page_width_inches: artworkWidth ?? null,
      page_height_inches: artworkHeight ?? null,
      page_count: pageCount ?? null,
      orientation: artworkWidth && artworkHeight ? (artworkWidth >= artworkHeight ? "landscape" : "portrait") : null
    },
    current_form_context: input.current ?? null,
    first_pass: previous ?? null
  });
}

function outputText(payload: OpenAiResponsePayload) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) return content.text.trim();
    }
  }
  return "";
}

async function callOpenAi(model: string, input: AiAnalyzeInput, previous?: AiJobSpecification) {
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: userPrompt(input, previous) }];
  const dataUrl = input.artwork?.dataUrl;
  const mimeType = input.artwork?.mimeType?.toLowerCase() ?? "";
  if (dataUrl && dataUrl.length <= 5_500_000) {
    // Trust the actual data URL payload first. PDF uploads are often represented in the
    // browser by a rendered JPEG preview; sending that JPEG as input_file causes the
    // Responses API to reject it as an unsupported file MIME type.
    const dataUrlMime = dataUrl.match(/^data:([^;,]+)[;,]/i)?.[1]?.toLowerCase() ?? "";
    if (dataUrlMime === "application/pdf" || (!dataUrlMime && mimeType.includes("pdf"))) {
      content.push({
        type: "input_file",
        filename: input.artwork?.name || "artwork.pdf",
        file_data: dataUrl
      });
    } else if (dataUrlMime.startsWith("image/") || (!dataUrlMime && mimeType.startsWith("image/"))) {
      content.push({ type: "input_image", image_url: dataUrl, detail: previous ? "high" : "low" });
    }
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: previous ? 2200 : 1400,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt(input) }] },
          { role: "user", content }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "gross_printing_job_specification",
            strict: true,
            schema
          }
        }
      }),
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => ({}))) as OpenAiResponsePayload;
    if (!response.ok) {
      const message = payload.error?.message ?? `OpenAI request failed (${response.status}).`;
      const delay = response.status === 429 ? retryDelayMs(response, message) : undefined;
      if (response.status === 429 && attempt < maxAttempts) {
        await wait(delay ?? 12_000);
        continue;
      }
      throw new OpenAiRequestError(message, response.status, delay);
    }
    const text = outputText(payload);
    if (!text) throw new OpenAiRequestError("OpenAI returned no structured specification.", 502);
    try {
      return reduceAnsweredQuestions(enforceSupportedNumbers(normalizeSpecification(JSON.parse(text)), input), input);
    } catch (error) {
      if (error instanceof OpenAiRequestError) throw error;
      throw new OpenAiRequestError("OpenAI returned a specification that could not be read.", 502);
    }
  }
  throw new OpenAiRequestError("OpenAI rate limit did not clear in time. Try this ticket again shortly.", 429, 12_000);
}

function needsAdvanced(specification: AiJobSpecification) {
  return specification.complexity === "complex" || specification.confidence < 0.74 || specification.missingInformation.length >= 4;
}

export function aiServerStatus() {
  return {
    configured: Boolean(OPENAI_API_KEY),
    demoMode: DEMO_MODE,
    basicModel: BASIC_MODEL,
    advancedModel: ADVANCED_MODEL
  };
}

export async function requireAiUser(request: NextRequest, roles: Array<"admin" | "front_desk"> = ["admin", "front_desk"]) {
  if (DEMO_MODE) return { id: "demo-user", email: "demo@grossprinting.local", role: "admin" as const };
  return requireActiveAppUser(request, roles);
}

export async function analyzePrintRequest(input: AiAnalyzeInput): Promise<AiAnalysisResult> {
  const requestedMode: AiAnalysisMode = input.mode === "basic" || input.mode === "advanced" ? input.mode : "auto";
  const source: AiAnalysisSource =
    input.source === "email" || input.source === "artwork" || input.source === "email_artwork" ? input.source : "manual";
  const id = `ai-${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = new Date().toISOString();

  if (!OPENAI_API_KEY) {
    if (!DEMO_MODE) throw new Error("OpenAI is not configured on the server.");
    return {
      id,
      source,
      requestedMode,
      usedMode: requestedMode === "advanced" ? "advanced" : "basic",
      model: "demo-rule-analyzer",
      configured: false,
      demo: true,
      createdAt,
      specification: demoSpecification(input)
    };
  }

  if (requestedMode === "advanced") {
    return {
      id,
      source,
      requestedMode,
      usedMode: "advanced",
      model: ADVANCED_MODEL,
      configured: true,
      demo: false,
      createdAt,
      specification: await callOpenAi(ADVANCED_MODEL, input)
    };
  }

  const firstPass = await callOpenAi(BASIC_MODEL, input);
  if (requestedMode === "auto" && needsAdvanced(firstPass)) {
    return {
      id,
      source,
      requestedMode,
      usedMode: "advanced",
      model: ADVANCED_MODEL,
      configured: true,
      demo: false,
      createdAt,
      specification: await callOpenAi(ADVANCED_MODEL, input, firstPass)
    };
  }

  return {
    id,
    source,
    requestedMode,
    usedMode: "basic",
    model: BASIC_MODEL,
    configured: true,
    demo: false,
    createdAt,
    specification: firstPass
  };
}

export function aiErrorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "AI analysis failed.";
  if (error instanceof OpenAiRequestError) {
    return NextResponse.json(
      { error: message, ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}) },
      { status: error.status === 429 ? 429 : status }
    );
  }
  return errorResponse(message, status);
}
