"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FileStack, FileText, Info, Mail, PackageCheck, Save, Send, Sparkles, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImpositionStudio, renderArtworkPreview, type ArtworkUpload } from "./ImpositionStudio";
import { AiEstimateAssistant } from "./AiEstimateAssistant";
import { getEmailSourceAttachmentBlob } from "./EmailAttachmentThumbnail";
import { RecordModal } from "./RecordModal";
import {
  calculateEstimatePricing,
  calculateImposition,
  emptyBookletSetup,
  formatMoney,
  getQuickDueDate,
  isRushDue,
  QUANTITY_RATE_CURVE,
  type QuantityRatePoint
} from "@/lib/pricing";
import {
  CATEGORY_FINISHING,
  PRODUCT_CATEGORIES,
  PRODUCT_PRESETS,
  type ProductCategory,
  type ProductPreset
} from "@/lib/product-catalog";
import { calculatePriceListEstimate } from "@/lib/price-list";
import { sanitizeLearningText } from "@/lib/learning-engine";
import type { CustomerPortalRequest, CustomerPortalRequestMetadata } from "@/lib/customer-portal-types";
import type {
  AiAnalysisResult,
  AiJobSpecification,
  AiLearningExample,
  Customer,
  CatalogPrice,
  EstimateFormData,
  EmailIntakeTicket,
  EmailSourceAttachmentRef,
  EstimateIntent,
  ImpositionSettings,
  Job,
  JobPricing,
  PaperStock
} from "@/lib/types";

interface NewEstimateJobProps {
  customers: Customer[];
  paperStocks: PaperStock[];
  catalogPrices?: CatalogPrice[];
  quantityRateCurve?: QuantityRatePoint[];
  productCategories?: string[];
  productPresets?: ProductPreset[];
  onCreate: (data: EstimateFormData, intent: EstimateIntent, pricing: JobPricing, artworkFile?: File) => void | boolean | Promise<void | boolean>;
  onAddCustomer?: (customer: Omit<Customer, "id">) => string;
  editingJob?: Job;
  onUpdateJob?: (jobId: string, data: EstimateFormData, pricing: JobPricing) => void;
  onCancelEdit?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  intakeTicket?: EmailIntakeTicket;
  sourceEmailAttachments?: EmailSourceAttachmentRef[];
  initialArtworkFile?: File;
  portalRequest?: CustomerPortalRequest;
  authToken?: string;
  onSaveAiLearning?: (example: AiLearningExample) => void;
  initialCustomerId?: string;
  plannedJobNumber?: string;
  currentRole?: "admin" | "front_desk" | "prepress" | "press" | "finishing";
}

function closeEnough(a: number, b: number) {
  return Math.abs(a - b) < 0.01;
}

function normalizedSize(width: number, height: number) {
  return [Math.min(width, height), Math.max(width, height)] as const;
}

function sameFinishedSize(width: number, height: number, targetWidth: number, targetHeight: number) {
  const [short, long] = normalizedSize(width, height);
  const [targetShort, targetLong] = normalizedSize(targetWidth, targetHeight);
  return Math.abs(short - targetShort) <= 0.15 && Math.abs(long - targetLong) <= 0.15;
}

function emailAttachmentLooksLikeArtwork(item: EmailSourceAttachmentRef) {
  const name = item.filename.trim().toLowerCase();
  const mime = item.mimeType.trim().toLowerCase();
  return mime === "application/pdf" || mime.startsWith("image/") || /\.(pdf|png|jpe?g)$/i.test(name);
}

function positiveQuantity(...values: Array<number | undefined>) {
  const match = values.find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
  return match ? Math.max(1, Math.round(match)) : 1;
}

function presetMatchesSize(preset: ProductPreset, width: number, height: number) {
  return sameFinishedSize(width, height, preset.width, preset.height);
}

function uniqueCategories(categories: string[]) {
  return categories.filter((category, index) => categories.indexOf(category) === index);
}

function autoCategoryOrder(width: number, height: number, stock: PaperStock, currentCategory: string, categoryOptions: string[]) {
  const stockName = stock.name.toLowerCase();
  const preferred: string[] = [currentCategory];
  if (sameFinishedSize(width, height, 3.5, 2)) preferred.push("Business Cards");
  if (stockName.includes("envelope")) preferred.push("Envelopes");
  if (stockName.includes("label") || stockName.includes("pressure sensitive")) preferred.push("Labels & Stickers");
  preferred.push(
    ...categoryOptions,
    "Flyers & Brochures",
    "Invitations",
    "Copies",
    "Labels & Stickers",
    "Envelopes",
    "Tea Party Cards",
    "Booklets & Books",
    "Business Cards",
    "Signs & Banners",
    "Receipt Books",
    "Stamps",
    "Simcha Bags"
  );
  return uniqueCategories(preferred);
}

function presetForSize(width: number, height: number, stock: PaperStock, currentCategory: string, presets: ProductPreset[], categoryOptions: string[]) {
  const matches = presets.filter((preset) => presetMatchesSize(preset, width, height));
  if (!matches.length) return undefined;
  const categoryOrder = autoCategoryOrder(width, height, stock, currentCategory, categoryOptions);
  return matches.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category))[0];
}

function presetForJob(job?: Job, presets: ProductPreset[] = PRODUCT_PRESETS) {
  if (!job) return PRODUCT_PRESETS[0];
  return (
    presets.find((preset) => preset.name === job.title) ??
    presets.find((preset) => presetMatchesSize(preset, job.pieceWidth, job.pieceHeight)) ??
    PRODUCT_PRESETS[0]
  );
}

const BASE_PRINT_SPECS = [
  { value: "4/4 full color", label: "4/4 full color - 2 sides", sides: 2 },
  { value: "4/1 color", label: "4/1 color front / black back - 2 sides", sides: 2 },
  { value: "4/0 full color", label: "4/0 full color - 1 side", sides: 1 },
  { value: "1/1 black", label: "1/1 black - 2 sides", sides: 2 },
  { value: "1/0 black", label: "1/0 black - 1 side", sides: 1 }
] as const;

const BOOKLET_PRINT_SPECS = [
  { value: "4/4 booklet", label: "4/4 booklet", sides: 2 },
  { value: "Black & white inside, color cover", label: "Black & white inside, color cover", sides: 2 }
] as const;

const WIDE_FORMAT_PRINT_SPECS = [
  { value: "Full color wide format", label: "Full color wide format", sides: 1 },
  { value: "Full color banner", label: "Full color banner", sides: 1 },
  { value: "Large format color", label: "Large format color", sides: 1 }
] as const;

const SIMPLE_ONE_PAGE_SETUP = true;

const ESTIMATE_DRAFT_STORAGE_KEY = "gross-printing-estimate-draft-v2";
const SECURE_PRODUCTION = process.env.NODE_ENV === "production";
const ORDER_SOURCES = ["Front desk", "Phone", "Email", "Customer upload", "Walk-in", "Reorder"] as const;

type EstimateStepId = "intake" | "product" | "price" | "artwork" | "output";

type StoredArtworkDraft = Pick<ArtworkUpload, "name" | "previewDataUrl" | "widthInches" | "heightInches" | "pages" | "selectedPageIndex" | "pageCount">;

interface EstimateDraft {
  version: 1 | 2;
  productCategory: ProductCategory;
  presetId: string;
  activeStep?: EstimateStepId;
  impositionOpen?: boolean;
  orderSource?: string;
  form: EstimateFormData;
  settings: ImpositionSettings;
  artwork: StoredArtworkDraft;
  savedAt: string;
}

function defaultImpositionSettings(): ImpositionSettings {
  return {
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
    customColumns: 5,
    customRows: 5,
    margin: 0,
    gutter: 0,
    bleed: 0,
    cropMarkLength: 0,
    cropMarkOffset: 0,
    showBleedGuide: false,
    showRegistrationMarks: false,
    showFoldMarks: false,
    showCornerMarks: true,
    duplexMirror: false,
    bookletReadingDirection: "ltr"
  };
}

function readEstimateDraft(): EstimateDraft | undefined {
  if (typeof window === "undefined" || SECURE_PRODUCTION) return undefined;
  const rawDraft = window.localStorage.getItem(ESTIMATE_DRAFT_STORAGE_KEY);
  if (!rawDraft) return undefined;
  try {
    const parsed = JSON.parse(rawDraft) as Partial<EstimateDraft>;
    if ((parsed.version !== 1 && parsed.version !== 2) || !parsed.form || !parsed.settings || !parsed.productCategory || !parsed.presetId) return undefined;
    const draft = parsed as EstimateDraft;
    const restoredOrderSource = draft.form.orderSource ?? draft.orderSource ?? ORDER_SOURCES[0];
    return {
      ...draft,
      version: 2,
      orderSource: restoredOrderSource,
      form: {
        ...draft.form,
        customerId: "",
        title: "",
        orderSource: restoredOrderSource,
        customerReference: draft.form.customerReference ?? "",
        sourceEmailThreadId: "",
        sourceEmailMessageId: "",
        intakeTicketId: "",
        portalRequestId: "",
        cuttingMode: draft.form.cuttingMode ?? "auto",
        bindery: draft.form.bindery.filter((item) => item !== "Cut to size")
      }
    };
  } catch {
    return undefined;
  }
}

function writeEstimateDraft(draft: Omit<EstimateDraft, "savedAt">) {
  if (typeof window === "undefined" || SECURE_PRODUCTION) return;
  window.localStorage.setItem(ESTIMATE_DRAFT_STORAGE_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
}

function clearEstimateDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ESTIMATE_DRAFT_STORAGE_KEY);
}

function printSpecOptionsFor(category: string, currentColorSpec: string) {
  const options = [
    ...BASE_PRINT_SPECS,
    ...(category === "Booklets & Books" ? BOOKLET_PRINT_SPECS : []),
    ...(category === "Signs & Banners" ? WIDE_FORMAT_PRINT_SPECS : [])
  ];
  if (currentColorSpec && !options.some((option) => option.value === currentColorSpec)) {
    return [...options, { value: currentColorSpec, label: currentColorSpec, sides: currentColorSpec.includes("/0") ? 1 : 2 }];
  }
  return options;
}

function sidesForPrintSpec(colorSpec: string): 1 | 2 {
  const option = [...BASE_PRINT_SPECS, ...BOOKLET_PRINT_SPECS, ...WIDE_FORMAT_PRINT_SPECS].find((item) => item.value === colorSpec);
  if (option) return option.sides as 1 | 2;
  return colorSpec.includes("/0") || colorSpec.includes("wide format") || colorSpec.includes("banner") ? 1 : 2;
}

function isUsableEmail(email?: string) {
  return Boolean(email?.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
}

function minimumChargeFromCatalog(catalogPrices: CatalogPrice[]) {
  const serviceMinimum = catalogPrices.find((item) => {
    const category = item.category.toLowerCase();
    const name = item.name.toLowerCase();
    return category.includes("service") && name.includes("minimum");
  });
  return serviceMinimum?.price ?? 20;
}

function formatSize(width: number, height: number) {
  return `${Number(width.toFixed(3))} x ${Number(height.toFixed(3))}`;
}

const COMMON_FINISHED_SIZES = [
  { id: "3.5x2", label: "Business card — 3.5 x 2", width: 3.5, height: 2 },
  { id: "4x6", label: "4 x 6", width: 4, height: 6 },
  { id: "5x7", label: "5 x 7", width: 5, height: 7 },
  { id: "5.5x8.5", label: "Half letter — 5.5 x 8.5", width: 5.5, height: 8.5 },
  { id: "8.5x11", label: "Letter — 8.5 x 11", width: 8.5, height: 11 },
  { id: "8.5x14", label: "Legal — 8.5 x 14", width: 8.5, height: 14 },
  { id: "11x17", label: "Tabloid — 11 x 17", width: 11, height: 17 },
  { id: "12x18", label: "12 x 18", width: 12, height: 18 },
  { id: "13x19", label: "13 x 19", width: 13, height: 19 },
  { id: "18x24", label: "18 x 24", width: 18, height: 24 },
  { id: "24x36", label: "24 x 36", width: 24, height: 36 },
  { id: "36x48", label: "36 x 48", width: 36, height: 48 },
  { id: "no10", label: "#10 envelope — 9.5 x 4.125", width: 9.5, height: 4.125 },
  { id: "a9", label: "A9 envelope — 8.75 x 5.75", width: 8.75, height: 5.75 }
] as const;

function finishedSizeChoice(width: number, height: number) {
  const exact = COMMON_FINISHED_SIZES.find((size) => sameFinishedSize(width, height, size.width, size.height));
  return exact?.id ?? "custom";
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function automaticCutDecision(
  category: string,
  presetName: string,
  stock: PaperStock,
  pieceWidth: number,
  pieceHeight: number,
  piecesPerSheet: number,
  cutsPerPile: number
) {
  const description = `${category} ${presetName} ${stock.name}`.toLowerCase();
  if (description.includes("envelope")) {
    return { required: false, reason: "Envelope stock prints at its finished size." };
  }
  if (stock.kind === "wide-format" || description.includes("banner") || description.includes("wide format")) {
    return { required: false, reason: "Wide-format work is handled by its own trimming workflow." };
  }
  if (description.includes("roll label") || description.includes("roll labels")) {
    return { required: false, reason: "Roll labels are finished on the roll, not guillotine cut to size." };
  }
  if (description.includes("kiss cut") || description.includes("die cut")) {
    return { required: false, reason: "Kiss-cut or die-cut finishing replaces normal cut-to-size." };
  }

  const parentMatchesFinished = sameFinishedSize(pieceWidth, pieceHeight, stock.sheetWidth, stock.sheetHeight);
  if (parentMatchesFinished && piecesPerSheet === 1 && cutsPerPile === 0) {
    return { required: false, reason: "Finished size already matches the parent sheet." };
  }

  return {
    required: piecesPerSheet > 1 || cutsPerPile > 0 || !parentMatchesFinished,
    reason: piecesPerSheet > 1
      ? `${piecesPerSheet} pieces are imposed on each parent sheet.`
      : "Finished size is smaller than the selected parent sheet."
  };
}

function buildAutomaticJobName(
  customerName: string | undefined,
  productName: string,
  category: string,
  quantity: number,
  width: number,
  height: number,
  sides: 1 | 2,
  presetSizeChanged: boolean
) {
  const customer = customerName?.trim() || "Customer";
  const product = presetSizeChanged
    ? `${category} ${formatSize(width, height)} - ${sides} Side${sides === 1 ? "" : "s"}`
    : productName;
  return `${customer} — ${formatCount(quantity)} ${product}`;
}

const QUICK_UP_TARGETS = [2, 4, 6, 8, 10] as const;

function quickGridForTargetUp(target: number, stock: PaperStock, pieceWidth: number, pieceHeight: number, gutter = 0, margin = 0) {
  if (!Number.isFinite(target) || target < 1 || pieceWidth <= 0 || pieceHeight <= 0) return undefined;
  const usableWidth = Math.max(0, stock.sheetWidth - Math.max(0, margin) * 2);
  const usableHeight = Math.max(0, stock.sheetHeight - Math.max(0, margin) * 2);
  const candidates: Array<{ columns: number; rows: number; slack: number }> = [];
  for (let columns = 1; columns <= target; columns += 1) {
    if (target % columns !== 0) continue;
    const rows = target / columns;
    const width = columns * pieceWidth + Math.max(0, columns - 1) * gutter;
    const height = rows * pieceHeight + Math.max(0, rows - 1) * gutter;
    if (width <= usableWidth + 0.001 && height <= usableHeight + 0.001) {
      candidates.push({ columns, rows, slack: (usableWidth - width) + (usableHeight - height) });
    }
  }
  return candidates.sort((a, b) => a.slack - b.slack)[0];
}

export function NewEstimateJob({
  customers,
  paperStocks,
  catalogPrices = [],
  quantityRateCurve = QUANTITY_RATE_CURVE,
  productCategories = PRODUCT_CATEGORIES,
  productPresets = PRODUCT_PRESETS,
  onCreate,
  onAddCustomer,
  editingJob,
  onUpdateJob,
  onCancelEdit,
  onDirtyChange,
  intakeTicket,
  sourceEmailAttachments = [],
  initialArtworkFile,
  portalRequest,
  authToken,
  onSaveAiLearning,
  initialCustomerId,
  plannedJobNumber,
  currentRole = "admin"
}: NewEstimateJobProps) {
  const firstStock = paperStocks[0];
  const firstPreset = presetForJob(editingJob, productPresets);
  const resetBaselineNextRender = useRef(true);
  const baselineSnapshotRef = useRef<string | undefined>(undefined);
  const appliedIntakeTicketRef = useRef<string | undefined>(undefined);
  const loadedEmailArtworkRef = useRef<string | undefined>(undefined);
  const appliedPortalRequestRef = useRef<string | undefined>(undefined);
  const [productCategory, setProductCategory] = useState<ProductCategory>(firstPreset.category);
  const [presetId, setPresetId] = useState(firstPreset.id);
  const [settings, setSettings] = useState<ImpositionSettings>(defaultImpositionSettings());
  const [artwork, setArtwork] = useState<ArtworkUpload>({});
  const [emailArtworkLoading, setEmailArtworkLoading] = useState(false);
  const [emailArtworkError, setEmailArtworkError] = useState("");
  const [activeStep, setActiveStep] = useState<EstimateStepId>("intake");
  const [impositionOpen, setImpositionOpen] = useState(false);
  const [adminDetailsOpen, setAdminDetailsOpen] = useState(false);
  const [setupMode, setSetupMode] = useState<"ai" | "manual">(currentRole === "admin" || currentRole === "front_desk" ? "ai" : "manual");
  const [orderSource, setOrderSource] = useState<string>(ORDER_SOURCES[0]);
  const [clientReady, setClientReady] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(Boolean(editingJob));
  const [actionError, setActionError] = useState("");
  const [categoryNotice, setCategoryNotice] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRequestText, setAiRequestText] = useState("");
  const [aiResult, setAiResult] = useState<AiAnalysisResult | undefined>();
  const [aiApplied, setAiApplied] = useState(false);
  const [aiLearningRecorded, setAiLearningRecorded] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "", contact: "", email: "", phone: "", companyType: "Commercial", terms: "Due on receipt",
    address: "", city: "", state: "", zip: ""
  });
  const [form, setForm] = useState<EstimateFormData>({
    customerId: "",
    title: editingJob?.title ?? "",
    quantity: firstPreset.quantity,
    pieceWidth: firstPreset.width,
    pieceHeight: firstPreset.height,
    dueDate: "",
    dueTime: "17:00",
    stockId: firstStock.id,
    colorSpec: firstPreset.colorSpec,
    sides: firstPreset.sides,
    bindery: firstPreset.bindery.filter((item) => item !== "Cut to size"),
    orderSource: ORDER_SOURCES[0],
    customerReference: "",
    sourceEmailThreadId: "",
    sourceEmailMessageId: "",
    intakeTicketId: "",
    portalRequestId: "",
    cuttingMode: "auto",
    artworkName: "",
    artworkPreview: "",
    booklet: emptyBookletSetup(firstStock.id)
  });
  const isAdmin = currentRole === "admin";
  const canUseAi = currentRole === "admin" || currentRole === "front_desk";
  const showAdminDetails = isAdmin && adminDetailsOpen;

  useEffect(() => {
    setClientReady(true);
    if (editingJob) {
      setDraftHydrated(true);
      return;
    }
    const draft = intakeTicket || portalRequest ? undefined : readEstimateDraft();
    if (intakeTicket || portalRequest) clearEstimateDraft();
    if (draft) {
      resetBaselineNextRender.current = true;
      setProductCategory(draft.productCategory);
      setPresetId(draft.presetId);
      setSettings(draft.settings);
      setArtwork(draft.artwork ?? {});
      setActiveStep("intake");
      setImpositionOpen(false);
      setOrderSource(draft.orderSource ?? ORDER_SOURCES[0]);
      setForm(draft.form);
    } else {
      resetBaselineNextRender.current = true;
      setForm((current) => ({ ...current, dueDate: current.dueDate || getQuickDueDate("Tomorrow") }));
    }
    setDraftHydrated(true);
  }, [editingJob, intakeTicket, portalRequest]);

  useEffect(() => {
    if (!draftHydrated || editingJob || intakeTicket || portalRequest || !initialCustomerId) return;
    setForm((current) => current.customerId === initialCustomerId ? current : { ...current, customerId: initialCustomerId });
  }, [draftHydrated, editingJob, intakeTicket, portalRequest, initialCustomerId]);

  useEffect(() => {
    if (!draftHydrated || editingJob || !intakeTicket || appliedIntakeTicketRef.current === intakeTicket.id) return;
    appliedIntakeTicketRef.current = intakeTicket.id;
    resetBaselineNextRender.current = true;
    loadedEmailArtworkRef.current = undefined;
    setArtwork({});
    setEmailArtworkLoading(false);
    setEmailArtworkError("");
    setAiResult(undefined);
    setAiApplied(false);
    setAiLearningRecorded(false);
    setAiRequestText("");

    const ticketSpec = intakeTicket.aiSpecification;
    const desiredCategory = intakeTicket.productCategory ?? ticketSpec?.productCategory;
    const desiredProduct = intakeTicket.productName ?? ticketSpec?.productName ?? intakeTicket.productHint;
    const desiredWidth = intakeTicket.pieceWidth ?? ticketSpec?.finishedWidth;
    const desiredHeight = intakeTicket.pieceHeight ?? ticketSpec?.finishedHeight;
    const desiredPaper = intakeTicket.paperHint ?? ticketSpec?.paperHint;
    const desiredFinishing = intakeTicket.finishing ?? ticketSpec?.finishing ?? [];

    const textMatch = (left?: string, right?: string) =>
      Boolean(left && right && (
        left.trim().toLowerCase() === right.trim().toLowerCase() ||
        left.trim().toLowerCase().includes(right.trim().toLowerCase()) ||
        right.trim().toLowerCase().includes(left.trim().toLowerCase())
      ));

    const matchedCategory = productCategories.find((category) => textMatch(category, desiredCategory));
    const matchedPreset =
      productPresets.find((preset) => textMatch(preset.name, desiredProduct) && (!matchedCategory || preset.category === matchedCategory)) ??
      (desiredWidth && desiredHeight
        ? productPresets.find((preset) =>
            sameFinishedSize(preset.width, preset.height, desiredWidth, desiredHeight) &&
            (!matchedCategory || preset.category === matchedCategory))
        : undefined) ??
      (matchedCategory ? productPresets.find((preset) => preset.category === matchedCategory) : undefined);

    const emailFallbackPreset = !matchedPreset && !matchedCategory && !desiredProduct && !desiredCategory && !desiredWidth && !desiredHeight
      ? productPresets.find((preset) => preset.category === "Flyers & Brochures" && sameFinishedSize(preset.width, preset.height, 8.5, 11))
        ?? productPresets.find((preset) => preset.category === "Flyers & Brochures")
      : undefined;
    const setupPreset = matchedPreset ?? emailFallbackPreset;
    const nextCategory = setupPreset?.category ?? matchedCategory ?? productCategory;
    const matchedStock =
      (desiredPaper ? paperStocks.find((paper) => textMatch(paper.name, desiredPaper)) : undefined) ??
      (setupPreset
        ? paperStocks.find((paper) => paper.productCategories?.includes(setupPreset.category) && paper.kind === setupPreset.stockKind) ??
          paperStocks.find((paper) => paper.kind === setupPreset.stockKind)
        : undefined);

    const finishingOptions = CATEGORY_FINISHING[nextCategory] ?? [];
    const matchedFinishing = desiredFinishing
      .map((suggestion) => finishingOptions.find((option) => textMatch(option, suggestion)))
      .filter((item): item is string => Boolean(item) && item !== "Cut to size");

    if (setupPreset) {
      setProductCategory(setupPreset.category);
      setPresetId(setupPreset.id);
    } else if (matchedCategory) {
      setProductCategory(matchedCategory);
    }

    setOrderSource("Email");
    setActiveStep("intake");
    setSettings((current) => ({ ...current, preset: "auto", fitMode: "contain" }));
    setForm((current) => {
      const colorSpec = intakeTicket.colorSpec ?? ticketSpec?.colorSpec ?? setupPreset?.colorSpec ?? current.colorSpec;
      return {
        ...current,
        customerId: intakeTicket.customerId ?? "",
        quantity: positiveQuantity(
          intakeTicket.quantity,
          ticketSpec?.quantity,
          setupPreset?.quantity,
          current.quantity,
          firstPreset.quantity
        ),
        pieceWidth: desiredWidth ?? setupPreset?.width ?? current.pieceWidth,
        pieceHeight: desiredHeight ?? setupPreset?.height ?? current.pieceHeight,
        stockId: matchedStock?.id ?? current.stockId,
        colorSpec,
        sides: intakeTicket.sides ?? ticketSpec?.sides ?? setupPreset?.sides ?? sidesForPrintSpec(colorSpec),
        bindery: matchedFinishing.length
          ? matchedFinishing
          : (setupPreset?.bindery ?? current.bindery).filter((item) => item !== "Cut to size"),
        dueDate: intakeTicket.dueDate || ticketSpec?.dueDate || current.dueDate || getQuickDueDate("Tomorrow"),
        dueTime: intakeTicket.dueTime || ticketSpec?.dueTime || current.dueTime,
        orderSource: "Email",
        customerReference: intakeTicket.subject,
        sourceEmailThreadId: intakeTicket.threadId,
        sourceEmailMessageId: intakeTicket.messageId,
        intakeTicketId: intakeTicket.id,
        artworkName: sourceEmailAttachments.find(emailAttachmentLooksLikeArtwork)?.filename ?? current.artworkName
      };
    });

    if (ticketSpec && intakeTicket.aiAnalysisId) {
      setAiResult({
        id: intakeTicket.aiAnalysisId,
        source: "email",
        requestedMode: "auto",
        usedMode: intakeTicket.aiUsedMode ?? "basic",
        model: intakeTicket.aiModel ?? "Email AI review",
        configured: true,
        demo: false,
        createdAt: intakeTicket.updatedAt,
        specification: ticketSpec
      });
      setAiApplied(true);
      setAiLearningRecorded(false);
    }
  }, [
    draftHydrated,
    editingJob,
    intakeTicket,
    sourceEmailAttachments,
    paperStocks,
    productCategories,
    productPresets,
    productCategory
  ]);

  useEffect(() => {
    if (!draftHydrated || editingJob || !intakeTicket || !authToken) return;
    if (artwork.file || artwork.previewDataUrl) return;
    const source = sourceEmailAttachments.find((item) =>
      emailAttachmentLooksLikeArtwork(item) &&
      item.providerMessageId && (item.providerAttachmentId || /^part-\d+$/.test(item.id))
    );
    if (!source || loadedEmailArtworkRef.current === `${intakeTicket.id}:${source.id}`) return;
    loadedEmailArtworkRef.current = `${intakeTicket.id}:${source.id}`;
    let cancelled = false;
    void (async () => {
      try {
        setEmailArtworkLoading(true);
        setEmailArtworkError("");
        const sourceName = source.filename.toLowerCase();
        const handedOffFile = initialArtworkFile && initialArtworkFile.name === source.filename ? initialArtworkFile : undefined;
        const blob = handedOffFile ? handedOffFile : await getEmailSourceAttachmentBlob(authToken, source);
        const normalizedSourceMime = sourceName.endsWith(".pdf")
          ? "application/pdf"
          : /\.png$/i.test(sourceName)
            ? "image/png"
            : /\.jpe?g$/i.test(sourceName)
              ? "image/jpeg"
              : source.mimeType || blob.type || "application/octet-stream";
        const file = handedOffFile ?? new File([blob], source.filename, { type: normalizedSourceMime });
        const preview = await renderArtworkPreview(file, { firstPageOnly: true });
        if (cancelled) return;
        const firstPage = preview.pages?.[0];
        const detectedWidth = firstPage?.trimWidthInches && firstPage.trimWidthInches > 0
          ? firstPage.trimWidthInches
          : firstPage?.widthInches ?? preview.widthInches;
        const detectedHeight = firstPage?.trimHeightInches && firstPage.trimHeightInches > 0
          ? firstPage.trimHeightInches
          : firstPage?.heightInches ?? preview.heightInches;
        const explicitTicketWidth = intakeTicket.pieceWidth ?? intakeTicket.aiSpecification?.finishedWidth;
        const explicitTicketHeight = intakeTicket.pieceHeight ?? intakeTicket.aiSpecification?.finishedHeight;
        const hasExplicitTicketSize = Boolean(explicitTicketWidth && explicitTicketHeight);
        const hasExplicitProduct = Boolean(
          intakeTicket.productCategory || intakeTicket.productName || intakeTicket.productHint ||
          intakeTicket.aiSpecification?.productCategory || intakeTicket.aiSpecification?.productName
        );

        setArtwork({ file, name: source.filename, ...preview });
        setEmailArtworkLoading(false);

        const isPdfSource = source.mimeType.toLowerCase() === "application/pdf" || source.filename.toLowerCase().endsWith(".pdf");
        const currentStock = paperStocks.find((paper) => paper.id === form.stockId) ?? firstStock;
        const detectedPreset = !hasExplicitProduct && detectedWidth && detectedHeight && isPdfSource
          ? presetForSize(
              detectedWidth,
              detectedHeight,
              currentStock,
              productCategory,
              productPresets,
              productCategories
            )
          : undefined;
        if (detectedPreset) {
          setProductCategory(detectedPreset.category);
          setPresetId(detectedPreset.id);
        }

        setForm((current) => {
          const onePage = (preview.pageCount ?? preview.pages?.length ?? 1) === 1;
          const inferredSides = intakeTicket.sides ?? intakeTicket.aiSpecification?.sides ?? (onePage ? 1 : current.sides);
          const inferredColorSpec = intakeTicket.colorSpec ?? intakeTicket.aiSpecification?.colorSpec ?? (onePage && current.colorSpec === "4/4 full color" ? "4/0 full color" : current.colorSpec);
          return {
            ...current,
            artworkName: source.filename,
            artworkPreview: preview.previewDataUrl ?? current.artworkPreview,
            quantity: positiveQuantity(intakeTicket.quantity, intakeTicket.aiSpecification?.quantity, current.quantity, firstPreset.quantity),
            stockId: detectedPreset ? preferredStockId(detectedPreset) : current.stockId,
            sides: inferredSides,
            colorSpec: inferredColorSpec,
            ...(!hasExplicitTicketSize && detectedWidth && detectedHeight && isPdfSource
              ? { pieceWidth: Number(detectedWidth.toFixed(3)), pieceHeight: Number(detectedHeight.toFixed(3)) }
              : {})
          };
        });

        if (canUseAi && setupMode === "ai" && !aiResult) setAiOpen(true);
      } catch (error) {
        if (!cancelled) {
          setEmailArtworkLoading(false);
          setEmailArtworkError(error instanceof Error ? error.message : "Unable to load the email artwork.");
          setArtwork((current) => ({ ...current, name: source.filename }));
          setForm((current) => ({ ...current, artworkName: source.filename }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [
    draftHydrated, editingJob, intakeTicket, authToken, sourceEmailAttachments, initialArtworkFile, artwork.name, artwork.previewDataUrl,
    paperStocks, form.stockId, firstStock, firstPreset.quantity, productCategory, productPresets, productCategories, setupMode, canUseAi, aiResult
  ]);

  useEffect(() => {
    const needsAllPages = impositionOpen || settings.mode === "booklet" || settings.mode === "repeat-all-pages" || settings.mode === "join-pages";
    const sourceFile = artwork.file;
    const expectedPages = artwork.pageCount ?? 1;
    const renderedPages = artwork.pages?.length ?? 0;
    if (!needsAllPages || !sourceFile || expectedPages <= 1 || renderedPages >= expectedPages) return;
    let cancelled = false;
    void renderArtworkPreview(sourceFile).then((fullPreview) => {
      if (cancelled) return;
      setArtwork((current) => current.file === sourceFile ? { ...current, ...fullPreview, file: sourceFile, name: current.name ?? sourceFile.name } : current);
    }).catch(() => {
      // The original file remains available for production even if extra page thumbnails cannot be rendered.
    });
    return () => { cancelled = true; };
  }, [impositionOpen, settings.mode, artwork.file, artwork.pageCount, artwork.pages?.length]);

  useEffect(() => {
    if (
      !draftHydrated ||
      editingJob ||
      !portalRequest ||
      appliedPortalRequestRef.current === portalRequest.id
    ) return;

    appliedPortalRequestRef.current = portalRequest.id;
    resetBaselineNextRender.current = true;
    const metadata = (portalRequest.metadata ?? {}) as CustomerPortalRequestMetadata;
    const categoryMap: Record<string, string> = {
      "Business Cards": "Business Cards",
      "Flyers / Brochures": "Flyers & Brochures",
      Booklets: "Booklets & Books",
      Invitations: "Invitations",
      "Labels / Stickers": "Labels & Stickers",
      Envelopes: "Envelopes",
      Posters: "Signs & Banners",
      "Signs / Banners": "Signs & Banners",
      Copies: "Copies",
      "Plans / Blueprints": "Copies"
    };
    const desiredCategory = metadata.productType ? categoryMap[metadata.productType] : undefined;
    const textMatch = (left?: string, right?: string) =>
      Boolean(left && right && (
        left.trim().toLowerCase() === right.trim().toLowerCase() ||
        left.trim().toLowerCase().includes(right.trim().toLowerCase()) ||
        right.trim().toLowerCase().includes(left.trim().toLowerCase())
      ));
    const matchedCategory = productCategories.find((category) => textMatch(category, desiredCategory));
    const matchedPreset =
      productPresets.find((preset) =>
        textMatch(preset.name, metadata.productType) &&
        (!matchedCategory || preset.category === matchedCategory)
      ) ??
      (metadata.finishedWidth && metadata.finishedHeight
        ? productPresets.find((preset) =>
            sameFinishedSize(
              preset.width,
              preset.height,
              metadata.finishedWidth!,
              metadata.finishedHeight!
            ) &&
            (!matchedCategory || preset.category === matchedCategory)
          )
        : undefined) ??
      (matchedCategory ? productPresets.find((preset) => preset.category === matchedCategory) : undefined);

    const nextCategory = matchedPreset?.category ?? matchedCategory ?? productCategory;
    const matchedStock =
      (metadata.paperPreference
        ? paperStocks.find((paper) => textMatch(paper.name, metadata.paperPreference))
        : undefined) ??
      (matchedPreset
        ? paperStocks.find(
            (paper) =>
              paper.productCategories?.includes(matchedPreset.category) &&
              paper.kind === matchedPreset.stockKind
          ) ?? paperStocks.find((paper) => paper.kind === matchedPreset.stockKind)
        : undefined);
    const finishingOptions = CATEGORY_FINISHING[nextCategory] ?? [];
    const matchedFinishing = (metadata.finishing ?? [])
      .map((suggestion) => finishingOptions.find((option) => textMatch(option, suggestion)))
      .filter((item): item is string => Boolean(item) && item !== "Cut to size");

    if (matchedPreset) {
      setProductCategory(matchedPreset.category);
      setPresetId(matchedPreset.id);
    } else if (matchedCategory) {
      setProductCategory(matchedCategory);
    }

    setOrderSource("Customer upload");
    setActiveStep("intake");
    setSettings((current) => ({ ...current, preset: "auto", fitMode: "contain" }));
    setForm((current) => {
      const colorSpec = metadata.colorSpec ?? matchedPreset?.colorSpec ?? current.colorSpec;
      return {
        ...current,
        customerId: portalRequest.customerId,
        quantity: metadata.quantity ?? matchedPreset?.quantity ?? current.quantity,
        pieceWidth: metadata.finishedWidth ?? matchedPreset?.width ?? current.pieceWidth,
        pieceHeight: metadata.finishedHeight ?? matchedPreset?.height ?? current.pieceHeight,
        stockId: matchedStock?.id ?? current.stockId,
        colorSpec,
        sides: metadata.sides ?? matchedPreset?.sides ?? sidesForPrintSpec(colorSpec),
        bindery: matchedFinishing.length
          ? matchedFinishing
          : (matchedPreset?.bindery ?? current.bindery).filter((item) => item !== "Cut to size"),
        dueDate: metadata.dueDate ?? current.dueDate ?? getQuickDueDate("Tomorrow"),
        dueTime: current.dueTime || "17:00",
        orderSource: "Customer Portal",
        customerReference: metadata.customerPo ?? portalRequest.requestNumber ?? portalRequest.title,
        portalRequestId: portalRequest.id
      };
    });

    const aiSummary = typeof metadata.aiSummary === "string" ? metadata.aiSummary : "";
    const missing = Array.isArray(metadata.aiMissingInformation)
      ? metadata.aiMissingInformation.filter((item): item is string => typeof item === "string")
      : [];
    if (aiSummary) {
      setAiRequestText(`${portalRequest.title}\n\n${portalRequest.note}`);
      setAiResult({
        id: `portal-${portalRequest.id}`,
        source: "manual",
        requestedMode: "auto",
        usedMode: "basic",
        model: typeof metadata.aiModel === "string" ? metadata.aiModel : "Portal AI review",
        configured: true,
        demo: false,
        createdAt: portalRequest.updatedAt,
        specification: {
          summary: aiSummary,
          customerName: undefined,
          productCategory: desiredCategory,
          productName: metadata.productType,
          quantity: metadata.quantity,
          finishedWidth: metadata.finishedWidth,
          finishedHeight: metadata.finishedHeight,
          sides: metadata.sides,
          colorSpec: metadata.colorSpec,
          paperHint: metadata.paperPreference ?? metadata.material,
          finishing: metadata.finishing ?? [],
          dueDate: metadata.dueDate,
          customerReference: metadata.customerPo,
          missingInformation: missing,
          warnings: [],
          confidence: typeof metadata.aiConfidence === "number" ? metadata.aiConfidence : 0.7,
          complexity: missing.length ? "moderate" : "simple"
        }
      });
      setAiApplied(true);
      setAiLearningRecorded(false);
    }
  }, [
    draftHydrated,
    editingJob,
    portalRequest,
    paperStocks,
    productCategories,
    productPresets,
    productCategory
  ]);

  useEffect(() => {
    if (!intakeTicket || aiRequestText.trim()) return;
    const sourceText = [intakeTicket.summary, intakeTicket.notes].filter(Boolean).join("\n\n").trim();
    if (sourceText) setAiRequestText(sourceText);
  }, [aiRequestText, intakeTicket]);

  const draftSnapshot = useMemo(
    () =>
      JSON.stringify({
        productCategory,
        presetId,
        activeStep,
        orderSource,
        form,
        settings,
        artwork: {
          name: artwork.name,
          previewDataUrl: artwork.previewDataUrl,
          widthInches: artwork.widthInches,
          heightInches: artwork.heightInches,
          pages: artwork.pages,
          selectedPageIndex: artwork.selectedPageIndex,
          pageCount: artwork.pageCount
        } satisfies StoredArtworkDraft
      }),
    [
      productCategory,
      presetId,
      activeStep,
      orderSource,
      form,
      settings,
      artwork.name,
      artwork.previewDataUrl,
      artwork.widthInches,
      artwork.heightInches,
      artwork.pages,
      artwork.selectedPageIndex,
      artwork.pageCount
    ]
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set([...productCategories, ...productPresets.map((preset) => preset.category)].filter(Boolean))),
    [productCategories, productPresets]
  );
  const presetsForCategory = productPresets.filter((preset) => preset.category === productCategory);
  const activePreset = productPresets.find((preset) => preset.id === presetId) ?? presetsForCategory[0] ?? firstPreset;
  const binderyOptions = CATEGORY_FINISHING[productCategory] ?? ["Cut to size"];
  const categoryTaggedStocks = paperStocks.filter((paper) => paper.productCategories?.includes(productCategory));
  const availableStocks = categoryTaggedStocks.length ? categoryTaggedStocks : paperStocks.filter((paper) => {
    const paperName = paper.name.toLowerCase();
    if (productCategory === "Envelopes") return paperName.includes("envelope");
    if (productCategory === "Signs & Banners") return paper.kind === "wide-format";
    if (productCategory === "Labels & Stickers") return paper.kind === "specialty" && !paperName.includes("envelope");
    return paper.kind !== "wide-format" && !paperName.includes("envelope");
  });
  const stockOptionsBase = availableStocks.length ? availableStocks : paperStocks;
  const stock = paperStocks.find((paper) => paper.id === form.stockId) ?? firstStock;
  const stockOptions = stockOptionsBase.some((paper) => paper.id === stock.id) ? stockOptionsBase : [stock, ...stockOptionsBase];
  const coverStock = paperStocks.find((paper) => paper.id === form.booklet.coverPaperId);
  const isBooklet = productCategory === "Booklets & Books" || settings.mode === "booklet";
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  const customerEmail = selectedCustomer?.email.trim() ?? "";
  const customerEmailReady = isUsableEmail(customerEmail);
  const rush = clientReady ? isRushDue(form.dueDate, form.dueTime) : false;
  const dueDateTimeValue = form.dueDate ? `${form.dueDate}T${form.dueTime}` : "";
  const printSpecOptions = printSpecOptionsFor(productCategory, form.colorSpec);
  const intakeReady = Boolean(form.customerId && form.dueDate && form.dueTime);
  const productSetupReady = form.quantity > 0 && form.pieceWidth > 0 && form.pieceHeight > 0 && Boolean(form.stockId) && Boolean(form.colorSpec);
  const productReady = intakeReady && productSetupReady;
  const imposition = useMemo(
    () => calculateImposition(stock, form.quantity, form.pieceWidth, form.pieceHeight, settings),
    [stock, form.quantity, form.pieceWidth, form.pieceHeight, settings]
  );
  const cutDecision = useMemo(
    () => automaticCutDecision(productCategory, `${activePreset.name} ${activePreset.bindery.join(" ")}`, stock, form.pieceWidth, form.pieceHeight, imposition.piecesPerSheet, imposition.cutsPerPile),
    [activePreset.bindery, activePreset.name, form.pieceHeight, form.pieceWidth, imposition.cutsPerPile, imposition.piecesPerSheet, productCategory, stock]
  );
  const cuttingMode = form.cuttingMode ?? "auto";
  const cutToSizeIncluded = cuttingMode === "include" || (cuttingMode === "auto" && cutDecision.required);
  const effectiveBindery = useMemo(() => {
    const withoutCut = form.bindery.filter((item) => item !== "Cut to size");
    return cutToSizeIncluded ? [...withoutCut, "Cut to size"] : withoutCut;
  }, [cutToSizeIncluded, form.bindery]);
  const effectiveForm = useMemo(
    () => ({
      ...form,
      orderSource,
      bindery: effectiveBindery,
      artworkName: artwork.name,
      artworkPreview: artwork.previewDataUrl,
      booklet: isBooklet ? { ...form.booklet, readingDirection: settings.bookletReadingDirection ?? form.booklet.readingDirection ?? "ltr" } : form.booklet
    }),
    [artwork.name, artwork.previewDataUrl, effectiveBindery, form, isBooklet, orderSource, settings.bookletReadingDirection]
  );
  const pricing = useMemo(
    () => calculateEstimatePricing(effectiveForm, stock, imposition, coverStock, catalogPrices, quantityRateCurve),
    [effectiveForm, stock, imposition, coverStock, catalogPrices, quantityRateCurve]
  );
  const portalApprovedSellingPrice = portalRequest && typeof (portalRequest.metadata as CustomerPortalRequestMetadata | undefined)?.approvedSellingPrice === "number"
    ? Number((portalRequest.metadata as CustomerPortalRequestMetadata).approvedSellingPrice)
    : undefined;
  const outputPricing = useMemo(() => {
    if (!portalApprovedSellingPrice || portalApprovedSellingPrice <= 0 || pricing.total <= 0) return pricing;
    const approvedTotal = Math.round(portalApprovedSellingPrice * 100) / 100;
    const ratio = approvedTotal / pricing.total;
    const scaled = {
      paper: Math.round(pricing.paper * ratio * 100) / 100,
      printing: Math.round(pricing.printing * ratio * 100) / 100,
      finishing: Math.round(pricing.finishing * ratio * 100) / 100,
      cutting: Math.round(pricing.cutting * ratio * 100) / 100,
      bookletCover: Math.round(pricing.bookletCover * ratio * 100) / 100
    };
    const scaledSubtotal = scaled.paper + scaled.printing + scaled.finishing + scaled.cutting + scaled.bookletCover;
    scaled.printing = Math.round((scaled.printing + (approvedTotal - scaledSubtotal)) * 100) / 100;
    return { ...pricing, ...scaled, total: approvedTotal };
  }, [portalApprovedSellingPrice, pricing]);
  const estimatePricingData = effectiveForm;
  const priceListEstimate = useMemo(
    () => calculatePriceListEstimate(estimatePricingData, stock, imposition),
    [estimatePricingData, stock, imposition]
  );
  const minimumCharge = useMemo(() => minimumChargeFromCatalog(catalogPrices), [catalogPrices]);
  const activePresetSizeChanged = !presetMatchesSize(activePreset, form.pieceWidth, form.pieceHeight);
  const automaticJobName = buildAutomaticJobName(
    selectedCustomer?.name,
    activePreset.name,
    productCategory,
    form.quantity,
    form.pieceWidth,
    form.pieceHeight,
    form.sides,
    activePresetSizeChanged
  );
  const finalJobName = form.title.trim() || automaticJobName;
  const currentFinishedSizeChoice = finishedSizeChoice(form.pieceWidth, form.pieceHeight);
  const suggestedPreset = useMemo(
    () => presetForSize(form.pieceWidth, form.pieceHeight, stock, productCategory, productPresets, categoryOptions),
    [form.pieceWidth, form.pieceHeight, stock, productCategory, productPresets, categoryOptions]
  );
  const pricingSource = useMemo(() => {
    if (priceListEstimate) {
      return {
        label: "Product price table used",
        detail: `${priceListEstimate.notes}. This special product table wins before regular paper/click pricing.`
      };
    }
    if (pricing.total <= minimumCharge + 0.01) {
      return {
        label: "Minimum charge applied",
        detail: `The calculated production price is below ${formatMoney(minimumCharge)}, so the shop minimum is used.`
      };
    }
    return {
      label: "Formula price used",
      detail: `Paper + ${form.colorSpec} click rate + finishing + cutting, with the quantity curve applied.`
    };
  }, [form.colorSpec, minimumCharge, priceListEstimate, pricing.total]);
  const hasArtwork = Boolean(artwork.file || artwork.previewDataUrl);
  const linkedEmailArtwork = sourceEmailAttachments.find(emailAttachmentLooksLikeArtwork);
  const hasLinkedEmailArtwork = Boolean(linkedEmailArtwork);
  const intakeHasExplicitProduct = Boolean(intakeTicket && (
    intakeTicket.productCategory || intakeTicket.productName || intakeTicket.productHint ||
    intakeTicket.aiSpecification?.productCategory || intakeTicket.aiSpecification?.productName
  ));
  const intakeHasExplicitSize = Boolean(intakeTicket && (
    (intakeTicket.pieceWidth && intakeTicket.pieceHeight) ||
    (intakeTicket.aiSpecification?.finishedWidth && intakeTicket.aiSpecification?.finishedHeight)
  ));
  const artworkIsImage = Boolean(artwork.file?.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(artwork.name ?? ""));
  const isMultiPageArtwork = (artwork.pageCount ?? 0) > 1;
  const activeArtworkPage = artwork.pages?.[artwork.selectedPageIndex ?? 0];
  const artworkWidth = activeArtworkPage?.widthInches ?? artwork.widthInches;
  const artworkHeight = activeArtworkPage?.heightInches ?? artwork.heightInches;
  const artworkSizeCheck = (() => {
    if (!artworkWidth || !artworkHeight || !form.pieceWidth || !form.pieceHeight) return undefined;
    const [fileShort, fileLong] = normalizedSize(artworkWidth, artworkHeight);
    const [finishShort, finishLong] = normalizedSize(form.pieceWidth, form.pieceHeight);
    const exact = Math.abs(fileShort - finishShort) <= 0.15 && Math.abs(fileLong - finishLong) <= 0.15;
    const fileRatio = fileLong / Math.max(0.001, fileShort);
    const finishRatio = finishLong / Math.max(0.001, finishShort);
    const ratioDifference = Math.abs(fileRatio - finishRatio) / finishRatio;
    if (exact) return { level: "ok" as const, text: `PDF size matches ${formatSize(form.pieceWidth, form.pieceHeight)} finished.` };
    if (ratioDifference <= 0.025) return { level: "scale" as const, text: `PDF is ${formatSize(artworkWidth, artworkHeight)} while the job is ${formatSize(form.pieceWidth, form.pieceHeight)}. The proportion matches, but confirm that scaling is intended.` };
    return { level: "warning" as const, text: `PDF is ${formatSize(artworkWidth, artworkHeight)} but the job is ${formatSize(form.pieceWidth, form.pieceHeight)}. The proportions do not match; confirm the finished size before production.` };
  })();
  const quickUpGrids = useMemo(() => Object.fromEntries(QUICK_UP_TARGETS.map((target) => [target, quickGridForTargetUp(target, stock, form.pieceWidth, form.pieceHeight, settings.gutter, settings.margin)])), [stock, form.pieceWidth, form.pieceHeight, settings.gutter, settings.margin]);
  const quickLayoutLabel = settings.preset === "auto" ? "Auto" : `${settings.customColumns * settings.customRows}-up`;
  function applyQuickUp(target: number) {
    const grid = quickUpGrids[target] as { columns: number; rows: number } | undefined;
    if (!grid) return;
    setSettings((current) => ({ ...current, preset: "custom", customColumns: grid.columns, customRows: grid.rows }));
  }
  const reviewWarnings = [
    !form.customerId ? "Customer is required before saving or sending." : "",
    form.customerId && !customerEmailReady ? `Customer email is missing or invalid: ${customerEmail || "none"}.` : "",
    activePresetSizeChanged && suggestedPreset
      ? `${formatSize(form.pieceWidth, form.pieceHeight)} looks like ${suggestedPreset.category}. Current preset is ${activePreset.name}.`
      : "",
    activePresetSizeChanged && !suggestedPreset ? "Finished size no longer matches the selected preset. Confirm the product category before quoting." : "",
    cuttingMode === "exclude" && cutDecision.required ? "Cut to size was manually excluded even though the layout requires cutting." : "",
    artworkSizeCheck?.level === "warning" ? artworkSizeCheck.text : "",
    !hasArtwork ? "Artwork can be added now or later before production." : ""
  ].filter(Boolean);
  const estimateSteps: Array<{
    id: EstimateStepId;
    number: number;
    title: string;
    ready: boolean;
    locked: boolean;
    lockedReason?: string;
    help: string;
  }> = [
    {
      id: "intake",
      number: 1,
      title: "Customer & order",
      ready: intakeReady,
      locked: false,
      help: selectedCustomer ? `${selectedCustomer.name} selected` : "Customer, source, reference, and due date"
    },
    {
      id: "product",
      number: 2,
      title: "Product setup",
      ready: productReady,
      locked: !intakeReady,
      lockedReason: "Finish customer and order details first.",
      help: productSetupReady ? `${activePreset.name}` : "Product, size, stock, print, and finishing"
    },
    {
      id: "price",
      number: 3,
      title: "Pricing",
      ready: productReady,
      locked: !productReady,
      lockedReason: "Finish customer and product setup first.",
      help: pricingSource.label
    },
    {
      id: "artwork",
      number: 4,
      title: "Artwork",
      ready: hasArtwork,
      locked: !productReady,
      lockedReason: "Finish customer and product setup before artwork/imposition.",
      help: hasArtwork ? artwork.name ?? "Artwork ready" : "Upload when artwork is available"
    },
    {
      id: "output",
      number: 5,
      title: "Review & create",
      ready: productReady,
      locked: !productReady,
      lockedReason: "Finish customer and product setup before final review.",
      help: editingJob ? "Review and update this job" : "Choose quote or production job"
    }
  ];
  const activeStepIndex = Math.max(0, estimateSteps.findIndex((step) => step.id === activeStep));
  const currentStep = estimateSteps[activeStepIndex] ?? estimateSteps[0];
  const previousStep = estimateSteps[activeStepIndex - 1];
  const nextStep = estimateSteps[activeStepIndex + 1];
  const canAdvanceCurrentStep =
    activeStep === "intake" ? intakeReady :
      activeStep === "product" ? productReady :
        true;
  const pdfHandlingOptions: Array<{ mode: ImpositionSettings["mode"]; title: string; detail: string }> = [
    { mode: "step-repeat", title: "Use page 1 only", detail: "Repeat the selected PDF page across the sheet." },
    { mode: "repeat-all-pages", title: "Repeat all pages", detail: "Use each PDF page in order through the layout." },
    { mode: "join-pages", title: "Gang pages together", detail: "Place different PDF pages together on one sheet." },
    { mode: "booklet", title: "Booklet / saddle stitch", detail: "Reorder PDF pages into nested printer spreads for folding and stapling." }
  ];

  function chooseStep(stepId: EstimateStepId) {
    const step = estimateSteps.find((item) => item.id === stepId);
    if (step?.locked) {
      setActionError(step.lockedReason ?? "Finish the current step first.");
      return;
    }
    setActionError("");
    setActiveStep(stepId);
  }

  function update<K extends keyof EstimateFormData>(key: K, value: EstimateFormData[K]) {
    setActionError("");
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDueDateTime(value: string) {
    const [dueDate, dueTime] = value.split("T");
    if (!dueDate) return;
    setForm((current) => ({ ...current, dueDate, dueTime: dueTime || current.dueTime || "17:00" }));
  }

  function updatePrintSpec(colorSpec: string) {
    setActionError("");
    setForm((current) => ({ ...current, colorSpec, sides: sidesForPrintSpec(colorSpec) }));
  }

  useEffect(() => {
    const matchedPreset = presetForSize(form.pieceWidth, form.pieceHeight, stock, productCategory, productPresets, categoryOptions);
    if (!matchedPreset || (matchedPreset.id === presetId && matchedPreset.category === productCategory)) return;

    const nextBinderyOptions = CATEGORY_FINISHING[matchedPreset.category] ?? ["Cut to size"];
    setCategoryNotice(`${formatSize(form.pieceWidth, form.pieceHeight)} matches ${matchedPreset.category}. Switched to ${matchedPreset.name}.`);
    setProductCategory(matchedPreset.category);
    setPresetId(matchedPreset.id);
    setSettings((current) => ({ ...current, preset: "auto", fitMode: "contain" }));
    setForm((current) => {
      const keptBindery = current.bindery.filter((item) => nextBinderyOptions.includes(item));
      return {
        ...current,
        bindery: (keptBindery.length ? keptBindery : matchedPreset.bindery).filter((item) => item !== "Cut to size"),
        booklet:
          matchedPreset.category === "Booklets & Books"
            ? current.booklet
            : emptyBookletSetup(current.booklet.coverPaperId)
      };
    });
  }, [categoryOptions, form.pieceWidth, form.pieceHeight, stock, productCategory, productPresets, presetId]);

  function preferredStockId(preset: ProductPreset) {
    const exactTaggedStock = paperStocks.find((paper) =>
      paper.productCategories?.includes(preset.category) &&
      closeEnough(paper.sheetWidth, preset.width) &&
      closeEnough(paper.sheetHeight, preset.height)
    );
    if (exactTaggedStock) return exactTaggedStock.id;

    if (preset.category === "Envelopes") {
      const envelopeStock = paperStocks.find((paper) =>
        paper.name.toLowerCase().includes("envelope") &&
        closeEnough(paper.sheetWidth, preset.width) &&
        closeEnough(paper.sheetHeight, preset.height)
      );
      if (envelopeStock) return envelopeStock.id;
    }

    const taggedStock = paperStocks.find((paper) =>
      paper.productCategories?.includes(preset.category) && paper.kind === preset.stockKind
    );
    return taggedStock?.id ?? paperStocks.find((paper) => paper.kind === preset.stockKind)?.id ?? firstStock.id;
  }

  function applyPreset(preset: ProductPreset) {
    setActionError("");
    setCategoryNotice("");
    setProductCategory(preset.category);
    setPresetId(preset.id);
    setSettings((current) => ({ ...current, preset: "auto", fitMode: "contain" }));
    setForm((current) => ({
      ...current,
      quantity: preset.quantity,
      pieceWidth: preset.width,
      pieceHeight: preset.height,
      stockId: preferredStockId(preset),
      colorSpec: preset.colorSpec,
      sides: preset.sides,
      bindery: preset.bindery.filter((item) => item !== "Cut to size"),
      booklet:
        preset.category === "Booklets & Books"
          ? {
              ...current.booklet,
              enabled: true,
              insidePages: Math.max(current.booklet.insidePages, 20),
              pageCount: Math.max(current.booklet.pageCount, 24),
              coverCost: Math.max(current.booklet.coverCost, 95)
            }
          : emptyBookletSetup(current.booklet.coverPaperId)
    }));
  }

  function chooseCategory(category: string) {
    const nextPreset = productPresets.find((preset) => preset.category === category) ?? firstPreset;
    applyPreset(nextPreset);
  }

  function toggleBindery(option: string) {
    setForm((current) => ({
      ...current,
      bindery: current.bindery.includes(option)
        ? current.bindery.filter((item) => item !== option)
        : [...current.bindery, option]
    }));
  }

  function applyAiSpecification(specification: AiJobSpecification) {
    setSetupMode("ai");
    setActionError("");
    setCategoryNotice("");

    const textMatch = (left?: string, right?: string) =>
      Boolean(left && right && (left.trim().toLowerCase() === right.trim().toLowerCase() ||
        left.trim().toLowerCase().includes(right.trim().toLowerCase()) ||
        right.trim().toLowerCase().includes(left.trim().toLowerCase())));

    const matchedCustomer = customers.find((customer) => textMatch(customer.name, specification.customerName));
    const matchedCategory = categoryOptions.find((category) => textMatch(category, specification.productCategory));
    const sizeMatchedPreset = specification.finishedWidth && specification.finishedHeight
      ? productPresets.find((preset) =>
          sameFinishedSize(preset.width, preset.height, specification.finishedWidth!, specification.finishedHeight!) &&
          (!matchedCategory || preset.category === matchedCategory))
      : undefined;
    const nameMatchedPreset = productPresets.find((preset) =>
      textMatch(preset.name, specification.productName) &&
      (!matchedCategory || preset.category === matchedCategory));
    const nextPreset = nameMatchedPreset ?? sizeMatchedPreset;
    const nextCategory = nextPreset?.category ?? matchedCategory ?? productCategory;
    const matchedStock = specification.paperHint
      ? paperStocks.find((paper) => textMatch(paper.name, specification.paperHint))
      : undefined;
    const allowedFinishing = CATEGORY_FINISHING[nextCategory] ?? [];
    const normalizedFinishing = specification.finishing
      .map((suggestion) => allowedFinishing.find((option) => textMatch(option, suggestion)))
      .filter((item): item is string => Boolean(item) && item !== "Cut to size");

    if (nextPreset) {
      setProductCategory(nextPreset.category);
      setPresetId(nextPreset.id);
    } else if (matchedCategory) {
      setProductCategory(matchedCategory as ProductCategory);
    }
    const aiBooklet = nextCategory === "Booklets & Books";
    setSettings((current) => ({
      ...current,
      preset: "auto",
      fitMode: "contain",
      ...(aiBooklet ? {
        mode: "booklet" as const,
        bookletPageCount: artwork.pageCount ?? artwork.pages?.length ?? current.bookletPageCount ?? 4,
        showFoldMarks: true,
        cropMarkLength: current.cropMarkLength > 0 ? current.cropMarkLength : 0.125,
        cropMarkOffset: current.cropMarkOffset > 0 ? current.cropMarkOffset : 0.0625
      } : {})
    }));

    setForm((current) => {
      const nextColorSpec = specification.colorSpec || current.colorSpec;
      const nextStockId = matchedStock?.id ?? (nextPreset ? preferredStockId(nextPreset) : current.stockId);
      return {
        ...current,
        customerId: current.customerId || matchedCustomer?.id || "",
        quantity: positiveQuantity(specification.quantity, current.quantity, nextPreset?.quantity, firstPreset.quantity),
        pieceWidth: specification.finishedWidth ?? current.pieceWidth,
        pieceHeight: specification.finishedHeight ?? current.pieceHeight,
        stockId: nextStockId,
        colorSpec: nextColorSpec,
        sides: specification.sides ?? sidesForPrintSpec(nextColorSpec),
        bindery: normalizedFinishing.length ? normalizedFinishing : current.bindery.filter((item) => item !== "Cut to size"),
        dueDate: specification.dueDate ?? current.dueDate,
        dueTime: specification.dueTime ?? current.dueTime,
        customerReference: current.customerReference || specification.customerReference || "",
        booklet: aiBooklet
          ? {
              ...current.booklet,
              enabled: true,
              pageCount: artwork.pageCount ?? artwork.pages?.length ?? current.booklet.pageCount,
              insidePages: Math.max(0, (artwork.pageCount ?? artwork.pages?.length ?? current.booklet.pageCount) - 4),
              binding: "fold-staple"
            }
          : current.booklet
      };
    });

    setAiApplied(true);
    setAiLearningRecorded(false);
    setActiveStep("product");
    setAiOpen(false);
    setActionError(
      specification.missingInformation.length
        ? `AI applied the supported fields. Still confirm: ${specification.missingInformation.join(" ")}`
        : "AI suggestions applied. Gross Printing's production engine calculated the step & repeat, sheets, waste, and price from the selected stock."
    );
  }

  function aiCorrections(specification: AiJobSpecification, finalData: EstimateFormData) {
    const corrections: string[] = [];
    if (specification.quantity && specification.quantity !== finalData.quantity) corrections.push(`Quantity: AI ${specification.quantity} → final ${finalData.quantity}`);
    if (specification.finishedWidth && Math.abs(specification.finishedWidth - finalData.pieceWidth) > 0.01) corrections.push(`Width: AI ${specification.finishedWidth} → final ${finalData.pieceWidth}`);
    if (specification.finishedHeight && Math.abs(specification.finishedHeight - finalData.pieceHeight) > 0.01) corrections.push(`Height: AI ${specification.finishedHeight} → final ${finalData.pieceHeight}`);
    if (specification.sides && specification.sides !== finalData.sides) corrections.push(`Sides: AI ${specification.sides} → final ${finalData.sides}`);
    if (specification.colorSpec && specification.colorSpec.toLowerCase() !== finalData.colorSpec.toLowerCase()) corrections.push(`Print: AI ${specification.colorSpec} → final ${finalData.colorSpec}`);
    const suggestedFinishing = specification.finishing.map((item) => item.toLowerCase()).sort().join("|");
    const finalFinishing = finalData.bindery.filter((item) => item !== "Cut to size").map((item) => item.toLowerCase()).sort().join("|");
    if (suggestedFinishing && suggestedFinishing !== finalFinishing) corrections.push(`Finishing corrected to: ${finalData.bindery.join(", ") || "none"}`);
    return corrections;
  }

  function recordAiLearning(finalData: EstimateFormData) {
    if (!aiResult || !aiApplied || aiLearningRecorded || !onSaveAiLearning) return;
    const corrections = aiCorrections(aiResult.specification, finalData);
    onSaveAiLearning({
      id: `ai-example-${crypto.randomUUID().slice(0, 10)}`,
      analysisId: aiResult.id,
      source: aiResult.source,
      sourceKind: "ai_review",
      model: aiResult.model,
      createdAt: new Date().toISOString(),
      customerId: finalData.customerId,
      customerName: customers.find((customer) => customer.id === finalData.customerId)?.name,
      productCategory,
      productName: productPresets.find((preset) => preset.id === presetId)?.name,
      sourceAttachmentNames: sourceEmailAttachments.map((attachment) => attachment.filename),
      inputSummary: sanitizeLearningText(aiRequestText.trim() || aiResult.specification.summary, 900),
      suggested: aiResult.specification,
      finalForm: {
        customerId: finalData.customerId,
        title: finalData.title,
        quantity: finalData.quantity,
        pieceWidth: finalData.pieceWidth,
        pieceHeight: finalData.pieceHeight,
        dueDate: finalData.dueDate,
        dueTime: finalData.dueTime,
        stockId: finalData.stockId,
        colorSpec: finalData.colorSpec,
        sides: finalData.sides,
        bindery: finalData.bindery,
        cuttingMode: finalData.cuttingMode
      },
      corrections,
      outcome: corrections.length ? "corrected" : "accepted"
    });
    setAiLearningRecorded(true);
  }

  async function submit(intent: EstimateIntent) {
    if (!form.customerId) {
      setActiveStep("intake");
      setActionError("Choose a customer before saving or sending.");
      return;
    }
    if (!form.dueDate || !form.dueTime) {
      setActiveStep("intake");
      setActionError("Choose the due date and time before saving or sending.");
      return;
    }
    if (!productReady) {
      setActiveStep("product");
      setActionError("Finish Product Setup before saving or sending.");
      return;
    }
    if ((intent === "sendQuote" || intent === "createJobEmail") && !customerEmailReady) {
      setActiveStep("intake");
      setActionError(`Choose a customer with a valid email before sending. Current email: ${customerEmail || "none"}.`);
      return;
    }
    const finalData: EstimateFormData = {
      ...effectiveForm,
      title: finalJobName,
      reservedJobNumber: intent === "createJob" || intent === "createJobEmail" ? (editingJob?.jobNumber || plannedJobNumber) : undefined
    };
    recordAiLearning(finalData);
    const created = await onCreate(
      finalData,
      intent,
      outputPricing,
      artwork.file
    );
    if (created === false) {
      setActionError("The record was not created. Review the message above, then try again.");
      return;
    }
    clearEstimateDraft();
    onDirtyChange?.(false);
    setForm((current) => ({
      ...current,
      customerId: "",
      title: "",
      quantity: 1000,
      customerReference: "",
      cuttingMode: "auto",
      bindery: current.bindery.filter((item) => item !== "Cut to size"),
      artworkName: "",
      artworkPreview: "",
      booklet: isBooklet ? current.booklet : emptyBookletSetup(current.booklet.coverPaperId)
    }));
    setOrderSource(ORDER_SOURCES[0]);
    setArtwork({});
    setAiRequestText("");
    setAiResult(undefined);
    setAiApplied(false);
    setAiLearningRecorded(false);
  }

  function updateExistingJob() {
    if (!editingJob || !onUpdateJob) return;
    const finalData: EstimateFormData = {
      ...effectiveForm,
      title: finalJobName
    };
    recordAiLearning(finalData);
    clearEstimateDraft();
    onDirtyChange?.(false);
    onUpdateJob(
      editingJob.id,
      finalData,
      pricing
    );
  }

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (resetBaselineNextRender.current) {
      resetBaselineNextRender.current = false;
      baselineSnapshotRef.current = draftSnapshot;
      onDirtyChange?.(false);
      return;
    }

    const dirty = draftSnapshot !== baselineSnapshotRef.current;
    onDirtyChange?.(dirty);
    if (!editingJob && dirty) {
      writeEstimateDraft({
        version: 2,
        productCategory,
        presetId,
        activeStep,
        orderSource,
        form,
        settings,
        artwork: {
          name: artwork.name,
          previewDataUrl: artwork.previewDataUrl,
          widthInches: artwork.widthInches,
          heightInches: artwork.heightInches,
          pages: artwork.pages,
          selectedPageIndex: artwork.selectedPageIndex,
          pageCount: artwork.pageCount
        }
      });
    }
  }, [
    activeStep,
    artwork.heightInches,
    artwork.name,
    artwork.pageCount,
    artwork.pages,
    artwork.previewDataUrl,
    artwork.selectedPageIndex,
    artwork.widthInches,
    draftHydrated,
    draftSnapshot,
    editingJob,
    form,
    onDirtyChange,
    orderSource,
    presetId,
    productCategory,
    settings
  ]);

  useEffect(() => {
    if (!editingJob) return;
    const nextPreset = presetForJob(editingJob, productPresets);
    resetBaselineNextRender.current = true;
    setProductCategory(nextPreset.category);
    setPresetId(nextPreset.id);
    setActiveStep("intake");
    setImpositionOpen(false);
    setSettings((current) => ({ ...current, preset: "auto", fitMode: "contain", bookletReadingDirection: editingJob.booklet?.readingDirection ?? current.bookletReadingDirection ?? "ltr" }));
    setForm({
      customerId: editingJob.customerId,
      title: editingJob.title,
      quantity: editingJob.quantity,
      pieceWidth: editingJob.pieceWidth,
      pieceHeight: editingJob.pieceHeight,
      dueDate: editingJob.dueDate,
      dueTime: editingJob.dueTime,
      stockId: editingJob.stockId,
      colorSpec: editingJob.colorSpec,
      sides: editingJob.sides,
      bindery: editingJob.bindery.filter((item) => item !== "Cut to size"),
      orderSource: editingJob.orderSource ?? ORDER_SOURCES[0],
      customerReference: editingJob.customerReference ?? "",
      sourceEmailThreadId: editingJob.sourceEmailThreadId ?? "",
      sourceEmailMessageId: editingJob.sourceEmailMessageId ?? "",
      intakeTicketId: editingJob.intakeTicketId ?? "",
      portalRequestId: editingJob.portalRequestId ?? "",
      cuttingMode: editingJob.cuttingMode ?? "auto",
      artworkName: editingJob.artworkName,
      artworkPreview: editingJob.artworkPreview,
      booklet: editingJob.booklet ?? emptyBookletSetup(firstStock.id)
    });
    setOrderSource(editingJob.orderSource ?? ORDER_SOURCES[0]);
    setArtwork({
      name: editingJob.artworkName,
      previewDataUrl: editingJob.artworkPreview,
      widthInches: editingJob.pieceWidth,
      heightInches: editingJob.pieceHeight
    });
  }, [editingJob, firstStock.id, productPresets]);

  const saveQuickCustomer = () => {
    if (!onAddCustomer || !newCustomer.name.trim()) return;
    const id = onAddCustomer({
      ...newCustomer,
      name: newCustomer.name.trim(),
      contact: newCustomer.contact.trim(),
      email: newCustomer.email.trim(),
      phone: newCustomer.phone.trim(),
      lastOrder: "",
      totalSpend: 0
    });
    update("customerId", id);
    setShowAddCustomer(false);
    setNewCustomer({ name: "", contact: "", email: "", phone: "", companyType: "Commercial", terms: "Due on receipt", address: "", city: "", state: "", zip: "" });
  };

  return (
    <main className="page-view job-setup-page">
      {showAddCustomer && onAddCustomer ? (
        <RecordModal title="New customer" subtitle="Save the customer and continue this job immediately" onClose={() => setShowAddCustomer(false)}>
          <div className="field-grid three quick-customer-grid">
            <label>Customer / company name<input autoFocus value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} /></label>
            <label>Contact<input value={newCustomer.contact} onChange={(event) => setNewCustomer({ ...newCustomer, contact: event.target.value })} /></label>
            <label>Email<input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} /></label>
            <label>Phone<input value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} /></label>
            <label>Terms<select value={newCustomer.terms} onChange={(event) => setNewCustomer({ ...newCustomer, terms: event.target.value })}><option>Due on receipt</option><option>Net 15</option><option>Net 30</option><option>COD</option></select></label>
            <label>Type<input value={newCustomer.companyType} onChange={(event) => setNewCustomer({ ...newCustomer, companyType: event.target.value })} /></label>
            <label>Street address<input value={newCustomer.address} onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })} /></label>
            <label>City<input value={newCustomer.city} onChange={(event) => setNewCustomer({ ...newCustomer, city: event.target.value })} /></label>
            <label>State / ZIP<div className="inline-two-inputs"><input value={newCustomer.state} onChange={(event) => setNewCustomer({ ...newCustomer, state: event.target.value })} /><input value={newCustomer.zip} onChange={(event) => setNewCustomer({ ...newCustomer, zip: event.target.value })} /></div></label>
          </div>
          <div className="button-row right">
            <button className="secondary-button" type="button" onClick={() => setShowAddCustomer(false)}>Cancel</button>
            <button className="primary-button" type="button" disabled={!newCustomer.name.trim()} onClick={saveQuickCustomer}><UserPlus size={16} /> Save & use customer</button>
          </div>
        </RecordModal>
      ) : null}
      {impositionOpen && hasArtwork ? (
        <RecordModal
          className="wide production-setup-modal"
          title="Full production setup"
          eyebrow={editingJob?.jobNumber || plannedJobNumber || "Job Setup"}
          subtitle={`${artwork.name ?? "Customer artwork"}${artworkWidth && artworkHeight ? ` · ${formatSize(artworkWidth, artworkHeight)}` : ""} · same file already loaded in this job`}
          onClose={() => setImpositionOpen(false)}
        >
          <fieldset className="imposition-fieldset order-desk-imposition production-modal-fieldset" disabled={!productSetupReady}>
            <ImpositionStudio
              variant="production"
              stock={stock}
              quantity={form.quantity}
              pieceWidth={form.pieceWidth}
              pieceHeight={form.pieceHeight}
              settings={settings}
              onSettingsChange={setSettings}
              artwork={artwork}
              onArtworkChange={setArtwork}
              onUseArtworkSize={(width, height) => {
                setForm((current) => ({ ...current, pieceWidth: Number(width.toFixed(3)), pieceHeight: Number(height.toFixed(3)) }));
              }}
              onUseSheetSize={(width, height) => {
                setForm((current) => ({ ...current, pieceWidth: Number(width.toFixed(3)), pieceHeight: Number(height.toFixed(3)) }));
              }}
              downloadFileBaseName={`${editingJob?.jobNumber || plannedJobNumber || "DRAFT"} - ${finalJobName}`}
            />
          </fieldset>
        </RecordModal>
      ) : null}
      <div className="section-heading">
        <div>
          <p>Job Setup</p>
          <h1>{editingJob ? `Edit ${editingJob.jobNumber}` : "Job Setup"}</h1>
        </div>
        <div className="estimate-heading-actions">
          {isAdmin ? (
            <button className={`secondary-button ${showAdminDetails ? "active" : ""}`} type="button" onClick={() => setAdminDetailsOpen((value) => !value)}>
              {showAdminDetails ? "Hide admin details" : "Admin details"}
            </button>
          ) : null}
          {rush ? <span className="rush-banner">Auto Rush: due within 24 hours</span> : null}
        </div>
      </div>

      {canUseAi ? (
        <section className="job-setup-mode-card">
          <div className="job-setup-mode-tabs" role="tablist" aria-label="Job setup method">
            <button type="button" role="tab" aria-selected={setupMode === "ai"} className={setupMode === "ai" ? "active" : ""} onClick={() => setSetupMode("ai")}><Sparkles size={17} /> AI Setup</button>
            <button type="button" role="tab" aria-selected={setupMode === "manual"} className={setupMode === "manual" ? "active" : ""} onClick={() => setSetupMode("manual")}><FileText size={17} /> Manual Setup</button>
          </div>
          {setupMode === "ai" ? (
            <div className="job-ai-quick-card">
              <div>
                <strong>Let AI read the email and artwork. Let the production engine do the math.</strong>
                <span>AI identifies the job type and requested specs. The normal Gross Printing calculator then determines the best step & repeat, parent sheet, sheets needed, waste, and price.</span>
              </div>
              <div className="job-ai-quick-actions">
                {artwork.widthInches && artwork.heightInches ? <b>Customer file: {formatSize(artwork.widthInches, artwork.heightInches)}{artwork.pageCount ? ` · ${artwork.pageCount} page${artwork.pageCount === 1 ? "" : "s"}` : ""}</b> : <b>{emailArtworkLoading ? `Loading email file: ${linkedEmailArtwork?.filename ?? "artwork"}…` : hasLinkedEmailArtwork ? `Email file linked: ${linkedEmailArtwork?.filename}` : artwork.name ? "Reading customer file size…" : "Attach or load the customer PDF first"}</b>}
                {aiResult ? <b>Auto production: {imposition.piecesPerSheet}-up · {imposition.sheetsNeeded.toLocaleString()} sheets · {imposition.wastePercent.toFixed(1)}% waste</b> : null}
                <button className="primary-button ai-launch-button" type="button" onClick={() => setAiOpen(true)} disabled={!aiRequestText.trim() && !hasArtwork && !hasLinkedEmailArtwork}><Sparkles size={17} /> {aiResult ? "Review / run AI again" : "Analyze email + artwork"}</button>
              </div>
            </div>
          ) : (
            <div className="job-manual-quick-card"><strong>Manual setup</strong><span>Use the normal fields below. File size detection and production calculations still run automatically.</span></div>
          )}
        </section>
      ) : null}

      {portalRequest ? (
        <section className="email-intake-handoff-banner portal">
          <PackageCheck size={18} />
          <div>
            <p>{portalRequest.requestNumber ?? "Portal request"} · {portalRequest.status}</p>
            <strong>{portalRequest.title}</strong>
            <span>
              Customer Portal specifications are loaded into this controlled setup.
              {portalRequest.fileName ? ` ${portalRequest.fileName} will remain linked after conversion.` : ""}
            </span>
          </div>
          <b>{portalRequest.status === "Ready for Job" ? "Job handoff" : "Quote handoff"}</b>
        </section>
      ) : null}

      {intakeTicket ? (
        <section className="email-intake-handoff-banner">
          <Mail size={18} />
          <div>
            <p>{intakeTicket.ticketNumber ?? "Job Ticket"} · {intakeTicket.status}</p>
            <strong>{intakeTicket.subject}</strong>
            <span>
              Reviewed email specifications are loaded into this controlled quote/job setup.
              {intakeTicket.attachmentIds.length
                ? ` ${intakeTicket.attachmentIds.length} source attachment${
                    intakeTicket.attachmentIds.length === 1 ? "" : "s"
                  } will stay linked after conversion.`
                : ""}
            </span>
            {sourceEmailAttachments.length ? (
              <div className="email-intake-source-files">
                {sourceEmailAttachments.map((item) => (
                  <small key={item.id}><FileText size={13} /> {item.filename}</small>
                ))}
              </div>
            ) : null}
          </div>
          <b>{intakeTicket.preferredConversion === "job" ? "Job handoff" : "Quote handoff"}</b>
        </section>
      ) : null}

      <AiEstimateAssistant
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        authToken={authToken}
        requestText={aiRequestText}
        onRequestTextChange={setAiRequestText}
        artworkName={artwork.name}
        artworkMimeType={artwork.previewDataUrl?.match(/^data:([^;,]+)/)?.[1] || artwork.file?.type}
        artworkDataUrl={artwork.previewDataUrl}
        artworkWidthInches={artworkWidth}
        artworkHeightInches={artworkHeight}
        artworkPageCount={artwork.pageCount ?? artwork.pages?.length}
        source={intakeTicket && hasArtwork ? "email_artwork" : intakeTicket ? "email" : hasArtwork ? "artwork" : "manual"}
        current={{
          customerName: selectedCustomer?.name,
          productCategory: intakeTicket && !intakeHasExplicitProduct ? undefined : productCategory,
          productName: intakeTicket && !intakeHasExplicitProduct ? undefined : activePreset.name,
          quantity: intakeTicket ? (intakeTicket.quantity ?? intakeTicket.aiSpecification?.quantity) : form.quantity,
          finishedWidth: intakeTicket && !intakeHasExplicitSize ? undefined : form.pieceWidth,
          finishedHeight: intakeTicket && !intakeHasExplicitSize ? undefined : form.pieceHeight,
          sides: intakeTicket ? (intakeTicket.sides ?? intakeTicket.aiSpecification?.sides) : form.sides,
          colorSpec: intakeTicket ? (intakeTicket.colorSpec ?? intakeTicket.aiSpecification?.colorSpec) : form.colorSpec,
          paperName: intakeTicket ? (intakeTicket.paperHint ?? intakeTicket.aiSpecification?.paperHint) : stock.name,
          dueDate: intakeTicket ? (intakeTicket.dueDate ?? intakeTicket.aiSpecification?.dueDate) : form.dueDate,
          dueTime: intakeTicket ? (intakeTicket.dueTime ?? intakeTicket.aiSpecification?.dueTime) : form.dueTime
        }}
        catalog={{
          categories: categoryOptions,
          products: productPresets.map((preset) => ({
            id: preset.id,
            category: preset.category,
            name: preset.name,
            width: preset.width,
            height: preset.height,
            colorSpec: preset.colorSpec,
            sides: preset.sides
          })),
          papers: paperStocks.map((paper) => ({
            id: paper.id,
            name: paper.name,
            width: paper.sheetWidth,
            height: paper.sheetHeight,
            kind: paper.kind
          })),
          finishing: Array.from(new Set(Object.values(CATEGORY_FINISHING).flat()))
        }}
        result={aiResult}
        onResult={(result) => {
          setAiResult(result);
          setAiApplied(false);
          setAiLearningRecorded(false);
          if (result.specification.confidence >= 0.86 && result.specification.missingInformation.length === 0) {
            queueMicrotask(() => applyAiSpecification(result.specification));
          }
        }}
        onApply={applyAiSpecification}
        autoRunKey={intakeTicket && setupMode === "ai" && hasArtwork ? `${intakeTicket.id}:${artwork.name ?? "artwork"}` : undefined}
      />

      <div className="estimate-process-shell">
        {!SIMPLE_ONE_PAGE_SETUP ? <nav className="panel estimate-process-nav" aria-label="Quote to production steps">
          <div className="process-nav-heading">
            <div>
              <p>Quote to production</p>
              <strong>{editingJob ? "Update the job in a controlled order" : "Complete one clear step at a time"}</strong>
            </div>
            <span>Step {currentStep.number} of {estimateSteps.length}</span>
          </div>
          <div className="process-step-grid">
            {estimateSteps.map((step) => (
              <button
                className={`estimate-process-step ${activeStep === step.id ? "active" : ""} ${step.ready ? "ready" : ""} ${step.locked ? "locked" : ""}`}
                key={step.id}
                type="button"
                onClick={() => chooseStep(step.id)}
                aria-current={activeStep === step.id ? "step" : undefined}
              >
                <span className="step-status-dot">
                  {step.ready ? <CheckCircle2 size={15} /> : step.number}
                </span>
                <span className="process-step-copy">
                  <strong>{step.title}</strong>
                  <small>{step.help}</small>
                </span>
              </button>
            ))}
          </div>
        </nav> : <div className="panel one-page-setup-banner quick-job-banner"><div><p>Quick Job Setup</p><strong>PDF first. Set the job, paper, layout, then create it.</strong></div><span>{isAdmin ? "Advanced pricing and production controls are available only when you open Admin details." : "Only the everyday production choices are shown."}</span></div>}

        <div className="quote-production-workspace">
          <div className="estimate-center-stage">
          <section className="panel estimate-stage-card">
            <div className="estimate-stage-heading">
              <div>
                <p>{SIMPLE_ONE_PAGE_SETUP ? "Quick setup" : `Step ${currentStep.number}`}</p>
                <h2>{SIMPLE_ONE_PAGE_SETUP ? "Set up the job" : currentStep.title}</h2>
              </div>
              <span>{SIMPLE_ONE_PAGE_SETUP ? "Customer, file, size, paper, layout, finishing, done." : currentStep.help}</span>
            </div>

            {actionError ? (
              <div className="estimate-stage-alert" role="alert">
                <AlertTriangle size={17} />
                <span>{actionError}</span>
              </div>
            ) : null}

            <div className="estimate-stage-body">
              {(SIMPLE_ONE_PAGE_SETUP || activeStep === "intake") ? (
                <div className="estimate-step-content">
                  {intakeTicket ? (
                    <div className="estimate-stage-alert intake-email-source">
                      <Mail size={17} />
                      <span><strong>Started from Job Ticket:</strong> {intakeTicket.subject}. Review all extracted details before creating the quote or job.</span>
                    </div>
                  ) : null}
                  <div className="intake-explainer">
                    <div>
                      <strong>Start with the customer.</strong>
                      <span>The job name will be created automatically after the product is completely set up.</span>
                    </div>
                  </div>
                  <div className="field-grid estimate-intake-grid v047-intake-grid">
                    <label className="customer-field">
                      <span className="field-label-row"><span>Customer <em>Required</em></span>{onAddCustomer ? <button className="inline-add-button" type="button" onClick={(event) => { event.preventDefault(); setShowAddCustomer(true); }}><UserPlus size={14} /> New customer</button> : null}</span>
                      <select value={form.customerId} onChange={(event) => update("customerId", event.target.value)}>
                        <option value="">Choose customer...</option>
                        {customers.map((customer) => (
                          <option value={customer.id} key={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                      <small className={`field-help ${customerEmailReady ? "ready" : form.customerId ? "warning" : ""}`}>
                        {form.customerId ? `Quote email: ${customerEmail || "missing"}` : "A customer is required before continuing."}
                      </small>
                    </label>
                    {showAdminDetails ? (<>
                      <label>
                        Order source
                        <select value={orderSource} onChange={(event) => setOrderSource(event.target.value)}>
                          {ORDER_SOURCES.map((source) => (<option value={source} key={source}>{source}</option>))}
                        </select>
                      </label>
                      <label>
                        Customer reference / PO <small>Optional</small>
                        <input value={form.customerReference ?? ""} onChange={(event) => update("customerReference", event.target.value)} placeholder="PO number, campaign name, email subject..." />
                      </label>
                    </>) : null}
                    <label className="due-field">
                      <span><CalendarDays size={15} /> Due date & time</span>
                      <input type="datetime-local" value={dueDateTimeValue} onChange={(event) => updateDueDateTime(event.target.value)} />
                    </label>
                  </div>
                  {!intakeReady || rush ? <div className={`estimate-readiness-card ${intakeReady ? "ready" : "needs-work"}`}>
                    <Info size={18} />
                    <div>
                      <strong>{intakeReady ? "Rush job" : "Choose the customer and due date"}</strong>
                      <span>{rush ? "Due within 24 hours." : "These are the only required intake fields."}</span>
                    </div>
                  </div> : null}
                </div>
              ) : null}

              {(SIMPLE_ONE_PAGE_SETUP || activeStep === "product") ? (
                <div className="estimate-step-content">
                  <div className="field-grid two">
                    <label>
                      Category
                      <select value={productCategory} onChange={(event) => chooseCategory(event.target.value)}>
                        {categoryOptions.map((category) => (
                          <option value={category} key={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Product preset
                      <select
                        value={activePreset.id}
                        onChange={(event) => {
                          const preset = productPresets.find((item) => item.id === event.target.value);
                          if (preset) applyPreset(preset);
                        }}
                      >
                        {presetsForCategory.map((preset) => (
                          <option value={preset.id} key={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="field-grid three compact-size-grid">
                    <label>
                      Quantity
                      <input type="number" min="1" value={form.quantity} onChange={(event) => update("quantity", Number(event.target.value))} />
                    </label>
                    <label>
                      Finished size
                      <select value={currentFinishedSizeChoice} onChange={(event) => {
                        const size = COMMON_FINISHED_SIZES.find((item) => item.id === event.target.value);
                        if (size) setForm((current) => ({ ...current, pieceWidth: size.width, pieceHeight: size.height }));
                      }}>
                        {COMMON_FINISHED_SIZES.map((size) => <option value={size.id} key={size.id}>{size.label}</option>)}
                        <option value="custom">Custom size</option>
                      </select>
                    </label>
                    <label>
                      Exact dimensions
                      <span className="size-dimension-inputs">
                        <input aria-label="Finished width" type="number" min="0.1" step="0.0625" value={form.pieceWidth} onChange={(event) => update("pieceWidth", Number(event.target.value))} />
                        <b>×</b>
                        <input aria-label="Finished height" type="number" min="0.1" step="0.0625" value={form.pieceHeight} onChange={(event) => update("pieceHeight", Number(event.target.value))} />
                      </span>
                      <small className="field-help">PDF upload can set this automatically.</small>
                    </label>
                  </div>
                  <div className="field-grid two">
                    <label>
                      Paper stock
                      <select
                        value={form.stockId}
                        onChange={(event) => {
                          const selected = paperStocks.find((paper) => paper.id === event.target.value) ?? firstStock;
                          setForm((current) => ({
                            ...current,
                            stockId: selected.id
                          }));
                        }}
                      >
                        {stockOptions.map((paper) => (
                          <option value={paper.id} key={paper.id}>
                            {paper.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Print spec
                      <select value={form.colorSpec} onChange={(event) => updatePrintSpec(event.target.value)}>
                        {printSpecOptions.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="preset-note">{activePreset.notes}</p>
                  {categoryNotice || activePresetSizeChanged ? (
                    <div className="guardrail-note">
                      <AlertTriangle size={15} />
                      <span>
                        {categoryNotice ??
                          (suggestedPreset
                            ? `${formatSize(form.pieceWidth, form.pieceHeight)} looks like ${suggestedPreset.category}. Use ${suggestedPreset.name} if this is not a ${activePreset.category} job.`
                            : "This finished size does not match the selected preset. Confirm category and pricing before sending.")}
                      </span>
                      {suggestedPreset ? (
                        <button className="text-link-button" type="button" onClick={() => applyPreset(suggestedPreset)}>
                          Switch to {suggestedPreset.name}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {showAdminDetails ? <section className={`automatic-cut-card ${cutToSizeIncluded ? "included" : "not-needed"} ${cuttingMode === "exclude" && cutDecision.required ? "overridden" : ""}`}>
                    <div className="automatic-cut-copy">
                      <span className="automatic-cut-icon"><PackageCheck size={18} /></span>
                      <div>
                        <strong>{cutToSizeIncluded ? "Cut to size added automatically" : "No cut-to-size charge needed"}</strong>
                        <span>{cutDecision.reason} {cutToSizeIncluded ? `${imposition.cutsPerPile} cut${imposition.cutsPerPile === 1 ? "" : "s"} per pile will be priced.` : ""}</span>
                      </div>
                    </div>
                    <label>
                      Cutting rule
                      <select value={cuttingMode} onChange={(event) => update("cuttingMode", event.target.value as EstimateFormData["cuttingMode"])}>
                        <option value="auto">Automatic</option><option value="include">Always include</option><option value="exclude">Do not include</option>
                      </select>
                    </label>
                  </section> : <div className="quick-auto-note"><CheckCircle2 size={15} /><span>Cutting and sheet math are automatic. {cutToSizeIncluded ? `${imposition.cutsPerPile} cut${imposition.cutsPerPile === 1 ? "" : "s"} per pile.` : "No cut-to-size charge needed."}</span></div>}

                  <div className="finishing-section">
                    <div className="subsection-heading">
                      <strong>Additional finishing</strong>
                      <span>Select only the work needed after printing and cutting.</span>
                    </div>
                    <div className="check-grid">
                      {binderyOptions.filter((option) => option !== "Cut to size").map((option) => (
                        <label className="checkbox-pill" key={option}>
                          <input type="checkbox" checked={form.bindery.includes(option)} onChange={() => toggleBindery(option)} />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>

                  {isBooklet && showAdminDetails ? (
                    <details className="advanced-details" open={form.booklet.enabled}>
                      <summary>Booklet setup</summary>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={form.booklet.enabled}
                          onChange={(event) => update("booklet", { ...form.booklet, enabled: event.target.checked })}
                        />
                        Add booklet pricing
                      </label>
                      <div className="field-grid two">
                        <label>
                          Inside pages
                          <input
                            type="number"
                            min="0"
                            value={form.booklet.insidePages}
                            onChange={(event) => update("booklet", { ...form.booklet, insidePages: Number(event.target.value) })}
                          />
                        </label>
                        <label>
                          Total page count
                          <input
                            type="number"
                            min="0"
                            value={form.booklet.pageCount}
                            onChange={(event) => update("booklet", { ...form.booklet, pageCount: Number(event.target.value) })}
                          />
                        </label>
                        <label>
                          Cover paper
                          <select
                            value={form.booklet.coverPaperId}
                            onChange={(event) => update("booklet", { ...form.booklet, coverPaperId: event.target.value })}
                          >
                            {paperStocks
                              .filter((paper) => paper.kind === "cover")
                              .map((paper) => (
                                <option value={paper.id} key={paper.id}>
                                  {paper.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Binding
                          <select
                            value={form.booklet.binding}
                            onChange={(event) => update("booklet", { ...form.booklet, binding: event.target.value as EstimateFormData["booklet"]["binding"] })}
                          >
                            <option value="fold-staple">Fold/staple</option>
                            <option value="glue">Glue</option>
                            <option value="spiral">Spiral</option>
                            <option value="fold-only">Fold only</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Cover setup cost
                        <input
                          type="number"
                          min="0"
                          value={form.booklet.coverCost}
                          onChange={(event) => update("booklet", { ...form.booklet, coverCost: Number(event.target.value) })}
                        />
                      </label>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {showAdminDetails && (SIMPLE_ONE_PAGE_SETUP || activeStep === "price") ? (
                <div className="estimate-step-content admin-price-details">
                  <div className="pricing-source-card large">
                    <Info size={18} />
                    <div>
                      <strong>{pricingSource.label}</strong>
                      <span>{pricingSource.detail}</span>
                    </div>
                  </div>
                  <div className="estimate-price-grid">
                    <div className={priceListEstimate ? "price-line-card active" : "price-line-card muted"}>
                      <span>Product override</span>
                      <strong>{priceListEstimate ? "Used" : "Not used"}</strong>
                      <small>{priceListEstimate ? "Special product table wins before formula pricing." : "No matching product table override for this setup."}</small>
                    </div>
                    <div className="price-line-card">
                      <span>Paper</span>
                      <strong>{formatMoney(pricing.paper)}</strong>
                      <small>{stock.name}</small>
                    </div>
                    <div className="price-line-card">
                      <span>Print click</span>
                      <strong>{formatMoney(pricing.printing)}</strong>
                      <small>{form.colorSpec}</small>
                    </div>
                    <div className="price-line-card">
                      <span>Finishing</span>
                      <strong>{formatMoney(pricing.finishing)}</strong>
                      <small>{effectiveBindery.length ? effectiveBindery.join(", ") : "No finishing selected"}</small>
                    </div>
                    <div className="price-line-card">
                      <span>Cutting</span>
                      <strong>{formatMoney(pricing.cutting)}</strong>
                      <small>{cutToSizeIncluded ? `${imposition.cutsPerPile} cuts per pile x ${imposition.piles} pile(s)` : "No cut-to-size charge"}</small>
                    </div>
                    <div className="price-line-card total">
                      <span>Total</span>
                      <strong>{formatMoney(pricing.total)}</strong>
                      <small>{pricingSource.label}</small>
                    </div>
                  </div>
                </div>
              ) : null}

              {(SIMPLE_ONE_PAGE_SETUP || activeStep === "artwork") ? (
                <div className="estimate-step-content artwork-step-content v047-artwork-step">
                  <div className="artwork-workbench">
                    <div className="artwork-source-column">
                    {hasLinkedEmailArtwork && !hasArtwork ? (
                      <section className={`email-artwork-loading-card ${emailArtworkError ? "error" : ""}`}>
                        <div>
                          <Mail size={18} />
                          <span>
                            <strong>{emailArtworkLoading ? (initialArtworkFile ? "Opening the original email artwork…" : "Loading artwork from the email…") : emailArtworkError ? "Email artwork is still linked" : "Email artwork linked"}</strong>
                            <small>{linkedEmailArtwork?.filename}</small>
                          </span>
                        </div>
                        {emailArtworkError ? <p>{emailArtworkError}</p> : <p>{initialArtworkFile ? "The exact original file was handed off from Email Center. The on-screen preview may be lighter, but production uses the untouched high-resolution source." : "You do not need to upload this file again. Job Setup will use the attachment from the source email."}</p>}
                        {emailArtworkError ? <button type="button" className="secondary-button" onClick={() => { loadedEmailArtworkRef.current = undefined; setEmailArtworkError(""); setArtwork({}); }}>Retry email file</button> : null}
                      </section>
                    ) : null}
                    {(!hasLinkedEmailArtwork || hasArtwork) ? <ImpositionStudio
                      variant="upload"
                      stock={stock}
                      quantity={form.quantity}
                      pieceWidth={form.pieceWidth}
                      pieceHeight={form.pieceHeight}
                      settings={settings}
                      onSettingsChange={setSettings}
                      artwork={artwork}
                      onArtworkChange={(nextArtwork) => {
                        setArtwork(nextArtwork);
                        if (nextArtwork.name || nextArtwork.previewDataUrl) setImpositionOpen(false);
                      }}
                      onUseArtworkSize={(width, height) => {
                        setForm((current) => ({
                          ...current,
                          pieceWidth: Number(width.toFixed(3)),
                          pieceHeight: Number(height.toFixed(3))
                        }));
                      }}
                      onUseSheetSize={(width, height) => {
                        setForm((current) => ({
                          ...current,
                          pieceWidth: Number(width.toFixed(3)),
                          pieceHeight: Number(height.toFixed(3))
                        }));
                      }}
                      downloadFileBaseName={`${editingJob?.jobNumber || plannedJobNumber || "DRAFT"} - ${finalJobName}`}
                    /> : null}

                    {hasArtwork ? (
                      <section className="customer-artwork-facts">
                        <div><span>Customer file</span><strong>{artwork.name ?? "Artwork"}</strong></div>
                        <div><span>PDF / page size</span><strong>{artworkWidth && artworkHeight ? formatSize(artworkWidth, artworkHeight) : "Reading size…"}</strong></div>
                        <div><span>Pages</span><strong>{artwork.pageCount ?? artwork.pages?.length ?? 1}</strong></div>
                        <div><span>Finished size</span><strong>{formatSize(form.pieceWidth, form.pieceHeight)}</strong></div>
                      </section>
                    ) : null}

                    {artworkSizeCheck ? (
                      <section className={`job-artwork-size-check ${artworkSizeCheck.level}`}>
                        <div>
                          <strong>{artworkSizeCheck.level === "ok" ? "Artwork size checked" : artworkSizeCheck.level === "scale" ? "Artwork will be scaled" : "Artwork size mismatch"}</strong>
                          <span>{artworkSizeCheck.text}</span>
                        </div>
                        {artworkSizeCheck.level !== "ok" && artworkWidth && artworkHeight ? (
                          <button className="text-button small" type="button" onClick={() => setForm((current) => ({ ...current, pieceWidth: Number(artworkWidth.toFixed(3)), pieceHeight: Number(artworkHeight.toFixed(3)) }))}>Use PDF size</button>
                        ) : null}
                      </section>
                    ) : null}

                    </div>
                    <div className="artwork-press-column">
                    <section className="quick-production-panel">
                      <div className="quick-production-heading">
                        <div><p>Press setup</p><strong>Step & repeat</strong><span>Choose the layout and see the sheet immediately.</span></div>
                        <b>{quickLayoutLabel} · {imposition.piecesPerSheet} piece{imposition.piecesPerSheet === 1 ? "" : "s"}/sheet</b>
                      </div>
                      <div className="quick-production-controls">
                        <label>
                          PDF use
                          <select value={settings.mode} onChange={(event) => {
                            const mode = event.target.value as ImpositionSettings["mode"];
                            setSettings((current) => ({ ...current, mode, ...(mode === "booklet" ? { bookletPageCount: artwork.pageCount ?? artwork.pages?.length ?? 4, showFoldMarks: true } : {}) }));
                            if (mode === "booklet") {
                              const pageCount = artwork.pageCount ?? artwork.pages?.length ?? Math.max(4, form.booklet.pageCount);
                              setForm((current) => ({ ...current, booklet: { ...current.booklet, enabled: true, pageCount, insidePages: Math.max(0, pageCount - 4), binding: "fold-staple" } }));
                            }
                          }}>
                            <option value="step-repeat">Use page 1 / step & repeat</option>
                            {isMultiPageArtwork ? <option value="repeat-all-pages">Repeat every PDF page</option> : null}
                            {isMultiPageArtwork ? <option value="join-pages">Gang PDF pages together</option> : null}
                            {isMultiPageArtwork ? <option value="booklet">Booklet / saddle stitch</option> : null}
                          </select>
                        </label>
                        <label>
                          Rotation
                          <select value={settings.rotationMode ?? "0"} onChange={(event) => setSettings((current) => ({ ...current, rotationMode: event.target.value as ImpositionSettings["rotationMode"], rotate: event.target.value === "90" || event.target.value === "270" }))}>
                            <option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option>
                          </select>
                        </label>
                      </div>
                      {settings.mode !== "booklet" ? <div className="quick-up-buttons" aria-label="Step and repeat layout">
                        <button type="button" className={settings.preset === "auto" ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, preset: "auto" }))}>Auto</button>
                        {QUICK_UP_TARGETS.map((target) => { const grid = quickUpGrids[target] as { columns: number; rows: number } | undefined; const active = settings.preset === "custom" && settings.customColumns * settings.customRows === target; return <button type="button" key={target} className={active ? "active" : ""} disabled={!grid} onClick={() => applyQuickUp(target)}>{target}-up</button>; })}
                        <button type="button" className={settings.preset === "custom" && !QUICK_UP_TARGETS.some((target) => target === settings.customColumns * settings.customRows) ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, preset: "custom" }))}>Custom</button>
                      </div> : null}
                      {settings.preset === "custom" && settings.mode !== "booklet" ? <div className="quick-custom-grid"><label>Columns<input type="number" min="1" max="20" value={settings.customColumns} onChange={(event) => setSettings((current) => ({ ...current, customColumns: Math.max(1, Number(event.target.value) || 1) }))} /></label><span>×</span><label>Rows<input type="number" min="1" max="20" value={settings.customRows} onChange={(event) => setSettings((current) => ({ ...current, customRows: Math.max(1, Number(event.target.value) || 1) }))} /></label></div> : null}
                      <div className="quick-sheet-preview-wrap">
                        <div className="quick-sheet-preview" style={{ aspectRatio: `${Math.max(1, imposition.sheetWidth)} / ${Math.max(1, imposition.sheetHeight)}` }}>
                          <div className="quick-sheet-grid" style={{ gridTemplateColumns: `repeat(${Math.min(12, Math.max(1, imposition.columns))}, 1fr)`, gridTemplateRows: `repeat(${Math.min(12, Math.max(1, imposition.rows))}, 1fr)` }}>
                            {Array.from({ length: Math.min(48, Math.max(1, imposition.piecesPerSheet)) }).map((_, index) => <span key={index}>{artwork.previewDataUrl ? <img src={artwork.previewDataUrl} alt="" /> : <em>{index + 1}</em>}</span>)}
                          </div>
                        </div>
                        <div className="quick-sheet-facts"><span><small>Parent sheet</small><b>{formatSize(imposition.sheetWidth, imposition.sheetHeight)}</b></span><span><small>Layout</small><b>{imposition.columns} × {imposition.rows}</b></span><span><small>Sheets needed</small><b>{imposition.sheetsNeeded.toLocaleString()}</b></span><span><small>Waste</small><b>{imposition.wastePercent.toFixed(1)}%</b></span></div>
                      </div>
                    </section>

                    <section className="quick-price-strip"><div><span>Estimated price</span><strong>{formatMoney(outputPricing.total)}</strong></div><div><span>Paper</span><strong>{stock.name}</strong></div><div><span>Production</span><strong>{imposition.piecesPerSheet}-up · {imposition.sheetsNeeded.toLocaleString()} sheets</strong></div></section>

                    <section className="artwork-workbench-actions">
                      {canUseAi ? (
                        <button className={`artwork-ai-placeholder compact active ${aiResult ? "has-result" : ""}`} type="button" onClick={() => { setSetupMode("ai"); setAiOpen(true); }}>
                          <Sparkles size={16} />
                          <div><strong>{aiResult ? "Review AI setup" : "AI setup from email + artwork"}</strong><span>Fill the same job fields automatically</span></div>
                        </button>
                      ) : null}
                      {hasArtwork ? (
                        <button className="advanced-artwork-launch" type="button" onClick={() => setImpositionOpen(true)}>
                          <FileStack size={16} />
                          <div><strong>More press controls</strong><span>Bleed, marks, fitting, and imposed PDF — opens without duplicating the file on this page.</span></div>
                          <ChevronRight size={17} />
                        </button>
                      ) : null}
                    </section>
                    </div>
                  </div>

                  {showAdminDetails && isMultiPageArtwork ? (
                    <div className="pdf-handling-actions compact">
                      {pdfHandlingOptions.map((option) => (
                        <button
                          className={`pdf-handling-button ${settings.mode === option.mode ? "active" : ""}`}
                          type="button"
                          key={option.mode}
                          onClick={() => {
                            setSettings((current) => ({
                              ...current,
                              mode: option.mode,
                              ...(option.mode === "booklet" ? {
                                bookletPageCount: artwork.pageCount ?? artwork.pages?.length ?? current.bookletPageCount ?? 4,
                                showFoldMarks: true,
                                cropMarkLength: current.cropMarkLength > 0 ? current.cropMarkLength : 0.125,
                                cropMarkOffset: current.cropMarkOffset > 0 ? current.cropMarkOffset : 0.0625
                              } : {})
                            }));
                            if (option.mode === "booklet") {
                              const pageCount = artwork.pageCount ?? artwork.pages?.length ?? form.booklet.pageCount;
                              setForm((current) => ({
                                ...current,
                                booklet: {
                                  ...current.booklet,
                                  enabled: true,
                                  pageCount,
                                  insidePages: Math.max(0, pageCount - 4),
                                  binding: "fold-staple"
                                }
                              }));
                            }
                          }}
                        >
                          <strong>{option.title}</strong>
                          <span>{option.detail}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {isMultiPageArtwork && settings.mode === "booklet" ? (
                    <section className="booklet-direction-quick">
                      <div><strong>Booklet reading direction</strong><span>Choose before creating the imposed press PDF.</span></div>
                      <div>
                        <button type="button" className={(settings.bookletReadingDirection ?? "ltr") === "ltr" ? "active" : ""} onClick={() => { setSettings((current) => ({ ...current, bookletReadingDirection: "ltr" })); setForm((current) => ({ ...current, booklet: { ...current.booklet, readingDirection: "ltr" } })); }}>English · Left → Right</button>
                        <button type="button" className={settings.bookletReadingDirection === "rtl" ? "active" : ""} onClick={() => { setSettings((current) => ({ ...current, bookletReadingDirection: "rtl" })); setForm((current) => ({ ...current, booklet: { ...current.booklet, readingDirection: "rtl" } })); }}>Hebrew / Yiddish · Right → Left</button>
                      </div>
                    </section>
                  ) : null}

                </div>
              ) : null}

              {(SIMPLE_ONE_PAGE_SETUP || activeStep === "output") ? (
                <div className="estimate-step-content final-output-step">
                  <section className="job-name-compact-row">
                    <label>
                      Job name
                      <input value={form.title || automaticJobName} onChange={(event) => update("title", event.target.value === automaticJobName ? "" : event.target.value)} />
                    </label>
                    {form.title.trim() ? <button className="text-link-button" type="button" onClick={() => update("title", "")}>Use automatic name</button> : <small>Generated automatically; edit only if needed.</small>}
                  </section>

                  {portalApprovedSellingPrice ? (
                    <section className="email-conversion-recommendation portal approved-price-handoff">
                      <CheckCircle2 size={18} />
                      <div>
                        <strong>Staff-approved selling price: {formatMoney(portalApprovedSellingPrice)}</strong>
                        <span>This approved customer price overrides the preliminary calculator total when the quote/job is created.</span>
                      </div>
                      <b>Approved price</b>
                    </section>
                  ) : null}

                  {portalRequest ? (
                    <section className="email-conversion-recommendation portal">
                      <PackageCheck size={18} />
                      <div>
                        <strong>{portalRequest.requestNumber ?? "Portal request"} prepared for {portalRequest.status === "Ready for Job" ? "a production job" : "a customer quote"}</strong>
                        <span>After creation, the request moves to Converted history and the exact new record opens.</span>
                      </div>
                    </section>
                  ) : null}

                  {intakeTicket?.preferredConversion ? (
                    <section className="email-conversion-recommendation">
                      <Mail size={18} />
                      <div>
                        <strong>{intakeTicket.ticketNumber ?? "Job Ticket"} continued to {intakeTicket.preferredConversion === "job" ? "production setup" : "estimate setup"}</strong>
                        <span>After creation, this setup closes and the exact new record opens. The source ticket moves to Converted history.</span>
                      </div>
                    </section>
                  ) : null}

                  {showAdminDetails && aiResult ? (
                    <section className={`ai-final-review-card ${aiApplied ? "applied" : "not-applied"}`}>
                      <Sparkles size={19} />
                      <div>
                        <strong>{aiApplied ? "AI suggestions were applied and reviewed in the normal form" : "AI analysis is available but was not applied"}</strong>
                        <span>{aiResult.model} · {Math.round(aiResult.specification.confidence * 100)}% confidence · {aiResult.specification.missingInformation.length} unanswered question(s)</span>
                        <small>{aiApplied ? "Your final corrections will be stored as a training example when this quote or job is saved." : "Open the assistant to review or apply supported fields."}</small>
                      </div>
                      <button className="secondary-button" type="button" onClick={() => setAiOpen(true)}>Review AI</button>
                    </section>
                  ) : null}

                  {showAdminDetails ? <div className="output-review-grid v046-output-review-grid">
                    <div className="wide"><span>Job name</span><strong>{finalJobName}</strong></div>
                    <div><span>Customer</span><strong>{selectedCustomer?.name ?? "Choose customer"}</strong></div>
                    <div><span>Order source</span><strong>{orderSource}</strong></div>
                    <div><span>Product</span><strong>{activePreset.name}</strong></div>
                    <div><span>Quantity</span><strong>{formatCount(form.quantity)}</strong></div>
                    <div><span>Due</span><strong>{form.dueDate} {form.dueTime}</strong></div>
                    {form.customerReference ? <div><span>Customer reference</span><strong>{form.customerReference}</strong></div> : null}
                    <div><span>Artwork</span><strong>{hasArtwork ? artwork.name ?? "Attached" : "Add later"}</strong></div>
                    <div><span>{portalApprovedSellingPrice ? "Approved selling price" : "Estimated total"}</span><strong>{formatMoney(outputPricing.total)}</strong></div>
                  </div> : <section className="quick-final-review"><div><span>Customer</span><strong>{selectedCustomer?.name ?? "Choose customer"}</strong></div><div><span>Job</span><strong>{finalJobName}</strong></div><div><span>Price</span><strong>{formatMoney(outputPricing.total)}</strong></div><div><span>Press</span><strong>{imposition.piecesPerSheet}-up · {stock.name}</strong></div></section>}

                  {editingJob ? (
                    <section className="output-choice-card update-choice-card">
                      <div className="output-choice-icon"><Save size={22} /></div>
                      <div className="output-choice-copy">
                        <span>Update existing job</span>
                        <h3>Save the reviewed production setup</h3>
                        <p>This updates the job specifications, pricing, artwork, and due information without changing its workflow stage.</p>
                      </div>
                      <div className="output-choice-actions">
                        <button className="primary-button" type="button" onClick={updateExistingJob} disabled={!productReady}>
                          <Save size={16} />
                          Update {editingJob.jobNumber}
                        </button>
                        <button className="icon-button text-button" type="button" onClick={onCancelEdit}>
                          Cancel edit
                        </button>
                      </div>
                    </section>
                  ) : showAdminDetails ? (
                    <div className="output-decision-grid">
                      <section className="output-choice-card quote-choice-card">
                        <div className="output-choice-icon"><FileText size={22} /></div>
                        <div className="output-choice-copy"><span>Quote first</span><h3>Prepare a customer quote</h3><p>The estimate stays in the Quote column until it is approved. Production does not begin yet.</p></div>
                        <div className="output-choice-actions"><button className="icon-button text-button" type="button" onClick={() => submit("saveQuote")} disabled={!productReady}><Save size={16} />Save draft quote</button><button className="primary-button secondary-primary" type="button" onClick={() => submit("sendQuote")} disabled={!productReady || !customerEmailReady}><Mail size={16} />Send quote</button></div>
                        {!customerEmailReady ? <small>Add a valid customer email to send it. A draft can still be saved.</small> : null}
                      </section>
                      <section className="output-choice-card job-choice-card">
                        <div className="output-choice-icon"><PackageCheck size={22} /></div>
                        <div className="output-choice-copy"><span>Approved order</span><h3>Create the production job</h3><p>The job is created in Prepress. Artwork may be attached now or added before it moves to Printing.</p></div>
                        <div className="output-choice-actions"><button className="primary-button" type="button" onClick={() => submit("createJob")} disabled={!productReady}><PackageCheck size={16} />Create production job</button><button className="icon-button text-button" type="button" onClick={() => submit("createJobEmail")} disabled={!productReady || !customerEmailReady}><Send size={16} />Create + email customer</button></div>
                        {!hasArtwork ? <small>Artwork is optional now, but Printing will remain blocked until a file is attached.</small> : null}
                      </section>
                    </div>
                  ) : (
                    <section className="quick-output-actions">
                      <div><strong>Quote</strong><span>Save it or send it to the customer.</span><div><button className="secondary-button" type="button" onClick={() => submit("saveQuote")} disabled={!productReady}><Save size={15} />Save quote</button><button className="secondary-button" type="button" onClick={() => submit("sendQuote")} disabled={!productReady || !customerEmailReady}><Mail size={15} />Send quote</button></div></div>
                      <div className="primary"><strong>Job ready</strong><span>Create the GP job and move it to Prepress.</span><div><button className="primary-button" type="button" onClick={() => submit("createJob")} disabled={!productReady}><PackageCheck size={15} />Create job</button><button className="secondary-button" type="button" onClick={() => submit("createJobEmail")} disabled={!productReady || !customerEmailReady}><Send size={15} />Create + email</button></div></div>
                    </section>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          {!SIMPLE_ONE_PAGE_SETUP ? <div className="estimate-stage-footer">
            <button className="icon-button text-button" type="button" onClick={() => previousStep && chooseStep(previousStep.id)} disabled={!previousStep}>
              <ChevronLeft size={16} />
              Previous
            </button>
            <div className="estimate-stage-footer-copy">
              {nextStep ? (
                <span>{canAdvanceCurrentStep ? "Continue when this step looks correct." : "Complete the required fields to continue."}</span>
              ) : (
                <span>Choose the correct outcome above.</span>
              )}
            </div>
            {nextStep ? (
              <button className="primary-button" type="button" onClick={() => chooseStep(nextStep.id)} disabled={!canAdvanceCurrentStep}>
                Next: {nextStep.title}
                <ChevronRight size={16} />
              </button>
            ) : (
              <span className="process-finished-chip"><CheckCircle2 size={15} /> Final review</span>
            )}
          </div> : null}
        </div>

          {showAdminDetails ? <aside className="estimate-sidebar order-desk-review">
            <section className="panel estimate-review-card v046-live-summary">
              <div className="panel-heading live-summary-heading">
                <div>
                  <p>Live summary</p>
                  <h2>{activeStep === "output" ? finalJobName : activePreset.name}</h2>
                </div>
                <span className="summary-progress">{SIMPLE_ONE_PAGE_SETUP ? "One page" : `${currentStep.number}/${estimateSteps.length}`}</span>
              </div>

              <div className="review-total">
                <span>{portalApprovedSellingPrice ? "Approved selling price" : "Estimated total"}</span>
                <strong>{formatMoney(outputPricing.total)}</strong>
                <small>{portalApprovedSellingPrice ? "Approved from Portal Request" : pricingSource.label}</small>
              </div>

              <div className="summary-primary-list">
                <div><span>Customer</span><strong>{selectedCustomer?.name ?? "Not selected"}</strong></div>
                <div><span>Product</span><strong>{activePreset.name}</strong></div>
                <div><span>Quantity</span><strong>{formatCount(form.quantity)}</strong></div>
                <div><span>Due</span><strong>{form.dueDate ? `${form.dueDate} / ${form.dueTime}` : "Not set"}</strong></div>
              </div>

              <div className="summary-production-grid">
                <div><span>Stock</span><strong>{stock.name}</strong></div>
                <div><span>Parent sheet</span><strong>{imposition.sheetWidth} x {imposition.sheetHeight}</strong></div>
                <div><span>Pieces / sheet</span><strong>{imposition.piecesPerSheet}</strong></div>
                <div><span>Sheets</span><strong>{imposition.sheetsNeeded}</strong></div>
              </div>

              <div className={`summary-artwork-state ${hasArtwork ? "ready" : "optional"}`}>
                <FileStack size={16} />
                <div>
                  <strong>{hasArtwork ? "Artwork attached" : "Artwork not attached"}</strong>
                  <span>{hasArtwork ? artwork.name : "It can be added later before Printing."}</span>
                </div>
              </div>

              {reviewWarnings.length ? (
                <details className="summary-checks" open={activeStep === "output"}>
                  <summary>{reviewWarnings.length} item{reviewWarnings.length === 1 ? "" : "s"} to review</summary>
                  <ul className="estimate-warning-list">
                    {reviewWarnings.map((warning) => (
                      <li key={warning}>
                        <AlertTriangle size={14} />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <div className="summary-all-clear"><CheckCircle2 size={16} /> Required setup is complete.</div>
              )}

              <details className="review-breakdown">
                <summary>Price breakdown</summary>
                <div className="pricing-breakdown compact">
                  <div><span>Paper</span><strong>{formatMoney(pricing.paper)}</strong></div>
                  <div><span>Printing</span><strong>{formatMoney(pricing.printing)}</strong></div>
                  <div><span>Finishing</span><strong>{formatMoney(pricing.finishing)}</strong></div>
                  <div><span>Cutting</span><strong>{formatMoney(pricing.cutting)}</strong></div>
                  {isBooklet ? <div><span>Booklet cover</span><strong>{formatMoney(pricing.bookletCover)}</strong></div> : null}
                </div>
              </details>
            </section>
          </aside> : null}
        </div>
      </div>
    </main>
  );
}
