"use client";

import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  Clock3,
  Download,
  FileInput,
  FileText,
  Globe2,
  History,
  Inbox,
  Link2,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Search,
  UserRoundCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  calculateEstimatePricing,
  calculateImposition,
  emptyBookletSetup,
  formatMoney,
  QUANTITY_RATE_CURVE,
  type QuantityRatePoint
} from "@/lib/pricing";
import type { ProductPreset } from "@/lib/product-catalog";
import type {
  CustomerPortalAccessRequest,
  CustomerPortalAccessRequestStatus,
  CustomerPortalRequest,
  CustomerPortalRequestMetadata,
  CustomerPortalRequestStatus
} from "@/lib/customer-portal-types";
import type {
  CatalogPrice,
  Customer,
  EstimateFormData,
  ImpositionSettings,
  Job,
  PaperStock
} from "@/lib/types";

type RequestQueue = "attention" | "ready" | "waiting" | "converted" | "archive";

type PublicWebsiteQuoteRequest = {
  id: string;
  request_number: number;
  status: string;
  submitted_at: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  product: string;
  quantity: number;
  size?: string;
  sides: number;
  color_spec?: string;
  paper?: string;
  paper_weight?: string;
  coating?: string;
  bleed?: boolean;
  delivery_method?: string;
  finishing?: string;
  turnaround?: string;
  notes?: string;
  estimated_total?: number;
  estimate_confidence?: string;
  customer_match?: Array<{ customerId: string; customerName: string; kind: string; score: number; reason: string; matchedContact?: string }>;
  linked_customer_id?: string;
  approved_selling_price?: number;
};

interface PortalRequestsProps {
  requests: CustomerPortalRequest[];
  customers: Customer[];
  jobs: Job[];
  paperStocks: PaperStock[];
  productPresets: ProductPreset[];
  catalogPrices: CatalogPrice[];
  quantityRateCurve?: QuantityRatePoint[];
  authToken?: string;
  loading?: boolean;
  onRefresh: () => void;
  onRequestsChange: (requests: CustomerPortalRequest[]) => void;
  onStartConversion: (request: CustomerPortalRequest, mode: "quote" | "job") => void;
  onLinkExistingJob: (request: CustomerPortalRequest, jobId: string) => void;
  onOpenJob: (jobId: string) => void;
  onOpenCustomers: () => void;
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function requestMetadata(request: CustomerPortalRequest) {
  return (request.metadata ?? {}) as CustomerPortalRequestMetadata;
}

function queueFor(status: CustomerPortalRequestStatus): RequestQueue {
  if (status === "Ready for Quote" || status === "Ready for Job") return "ready";
  if (status === "Waiting for Customer") return "waiting";
  if (status === "Converted") return "converted";
  if (status === "Closed" || status === "Archived" || status === "Completed") return "archive";
  return "attention";
}

function productCategory(product?: string) {
  const map: Record<string, string> = {
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
  return product ? map[product] : undefined;
}

function sameSize(aWidth: number, aHeight: number, bWidth: number, bHeight: number) {
  const a = [Math.min(aWidth, aHeight), Math.max(aWidth, aHeight)];
  const b = [Math.min(bWidth, bHeight), Math.max(bWidth, bHeight)];
  return Math.abs(a[0] - b[0]) <= 0.15 && Math.abs(a[1] - b[1]) <= 0.15;
}

function impositionSettings(): ImpositionSettings {
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
    showCornerMarks: true,
    duplexMirror: false
  };
}

function pricingPreview(
  request: CustomerPortalRequest,
  paperStocks: PaperStock[],
  productPresets: ProductPreset[],
  catalogPrices: CatalogPrice[],
  quantityRateCurve: QuantityRatePoint[]
) {
  const meta = requestMetadata(request);
  const category = productCategory(meta.productType);
  const width = Number(meta.finishedWidth);
  const height = Number(meta.finishedHeight);
  const quantity = Number(meta.quantity);
  if (!category || !width || !height || !quantity || meta.productType === "Booklets") return undefined;

  const preset =
    productPresets.find((item) => item.category === category && sameSize(item.width, item.height, width, height)) ??
    productPresets.find((item) => item.category === category);
  const stock =
    paperStocks.find((paper) =>
      meta.paperPreference &&
      paper.name.toLowerCase().includes(meta.paperPreference.toLowerCase())
    ) ??
    (preset
      ? paperStocks.find((paper) => paper.kind === preset.stockKind && paper.productCategories?.includes(category)) ??
        paperStocks.find((paper) => paper.kind === preset.stockKind)
      : undefined);
  if (!stock) return undefined;

  const colorSpec = meta.colorSpec || preset?.colorSpec || "4/4 full color";
  const sides = meta.sides ?? preset?.sides ?? (colorSpec.includes("/0") ? 1 : 2);
  const layout = calculateImposition(stock, quantity, width, height, impositionSettings());
  const finishing = meta.finishing ?? [];
  const parentMatches = sameSize(width, height, stock.sheetWidth, stock.sheetHeight);
  const noNormalCut =
    meta.productType === "Envelopes" ||
    meta.productType === "Signs / Banners" ||
    meta.labelFormat === "Roll labels";
  const bindery =
    !noNormalCut && (!parentMatches || layout.piecesPerSheet > 1 || layout.cutsPerPile > 0)
      ? Array.from(new Set([...finishing, "Cut to size"]))
      : finishing;
  const coverStock = paperStocks.find((paper) => paper.kind === "cover") ?? stock;
  const form: EstimateFormData = {
    customerId: request.customerId,
    title: request.title,
    quantity,
    pieceWidth: width,
    pieceHeight: height,
    dueDate: meta.dueDate ?? "",
    dueTime: "17:00",
    stockId: stock.id,
    colorSpec,
    sides,
    bindery,
    orderSource: "Customer Portal",
    customerReference: meta.customerPo ?? request.requestNumber ?? request.title,
    portalRequestId: request.id,
    cuttingMode: "auto",
    booklet: emptyBookletSetup(coverStock.id)
  };
  const pricing = calculateEstimatePricing(
    form,
    stock,
    layout,
    coverStock,
    catalogPrices,
    quantityRateCurve
  );
  return { pricing, stock, layout, bindery };
}

function customerPriceAdjustment(customer: Customer | undefined, product?: CustomerPortalRequestMetadata["productType"]) {
  if (!customer?.portalPricingEnabled) return 0;
  const specific = product ? customer.productPricingAdjustments?.[product] : undefined;
  if (typeof specific === "number" && Number.isFinite(specific)) return Math.max(-50, Math.min(100, specific));
  if (typeof customer.pricingAdjustmentPercent === "number" && Number.isFinite(customer.pricingAdjustmentPercent)) return Math.max(-50, Math.min(100, customer.pricingAdjustmentPercent));
  if (customer.pricingTier === "wholesale") return -5;
  if (customer.pricingTier === "reseller") return -10;
  return 0;
}

function similarJobScore(job: Job, metadata: CustomerPortalRequestMetadata) {
  let score = 0;
  const productWords = String(metadata.productType ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const title = job.title.toLowerCase();
  if (productWords.some((word) => title.includes(word))) score += 4;
  if (metadata.finishedWidth && metadata.finishedHeight && sameSize(job.pieceWidth, job.pieceHeight, metadata.finishedWidth, metadata.finishedHeight)) score += 4;
  if (metadata.colorSpec && job.colorSpec.toLowerCase() === metadata.colorSpec.toLowerCase()) score += 2;
  if (metadata.sides && job.sides === metadata.sides) score += 1;
  return score;
}

export function PortalRequests({
  requests,
  customers,
  jobs,
  paperStocks,
  productPresets,
  catalogPrices,
  quantityRateCurve = QUANTITY_RATE_CURVE,
  authToken,
  loading = false,
  onRefresh,
  onRequestsChange,
  onStartConversion,
  onLinkExistingJob,
  onOpenJob,
  onOpenCustomers
}: PortalRequestsProps) {
  const [queue, setQueue] = useState<RequestQueue>("attention");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [customerReplyDraft, setCustomerReplyDraft] = useState("");
  const [draftMetadata, setDraftMetadata] = useState<CustomerPortalRequestMetadata>({});
  const [accessRequests, setAccessRequests] = useState<CustomerPortalAccessRequest[]>([]);
  const [accessRequestsLoading, setAccessRequestsLoading] = useState(false);
  const [publicQuoteRequests, setPublicQuoteRequests] = useState<PublicWebsiteQuoteRequest[]>([]);
  const [publicQuoteLoading, setPublicQuoteLoading] = useState(false);
  const [publicQuoteBusy, setPublicQuoteBusy] = useState("");
  const handedOffPublicQuoteIds = useMemo(() => new Set(
    requests
      .map((request) => requestMetadata(request).sourcePublicQuoteId)
      .filter((value): value is string => typeof value === "string" && Boolean(value))
  ), [requests]);
  const activePublicQuoteRequests = useMemo(() => publicQuoteRequests.filter((request) =>
    !["quoted", "closed", "spam"].includes(request.status) && !handedOffPublicQuoteIds.has(request.id)
  ), [publicQuoteRequests, handedOffPublicQuoteIds]);

  async function loadPublicQuoteRequests() {
    setPublicQuoteLoading(true);
    try {
      const response = await fetch("/api/public/quote-request", { headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { requests?: PublicWebsiteQuoteRequest[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load website quote requests.");
      setPublicQuoteRequests(payload.requests ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load website quote requests.");
    } finally {
      setPublicQuoteLoading(false);
    }
  }

  async function updatePublicQuote(request: PublicWebsiteQuoteRequest, changes: { linkedCustomerId?: string | null; approvedSellingPrice?: number | null; status?: string; action?: "update" | "handoff" }) {
    setPublicQuoteBusy(request.id);
    setMessage("");
    try {
      const response = await fetch("/api/public/quote-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ id: request.id, ...changes })
      });
      const payload = (await response.json().catch(() => ({}))) as { request?: Partial<PublicWebsiteQuoteRequest>; portalRequest?: { request_number?: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update website quote request.");
      if (changes.action === "handoff") {
        setMessage(`${payload.portalRequest?.request_number ?? "Portal request"} created from website quote QR-${String(request.request_number).padStart(5, "0")}.`);
        await Promise.all([loadPublicQuoteRequests(), Promise.resolve(onRefresh())]);
      } else if (payload.request) {
        setPublicQuoteRequests((current) => current.map((item) => item.id === request.id ? { ...item, ...payload.request } : item));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update website quote request.");
    } finally {
      setPublicQuoteBusy("");
    }
  }

  async function loadAccessRequests() {
    setAccessRequestsLoading(true);
    try {
      const response = await fetch("/api/customer-portal/access-request", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as {
        requests?: CustomerPortalAccessRequest[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to load portal account requests.");
      setAccessRequests(payload.requests ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load portal account requests.");
    } finally {
      setAccessRequestsLoading(false);
    }
  }

  async function updateAccessRequest(request: CustomerPortalAccessRequest, status: CustomerPortalAccessRequestStatus) {
    setBusy(request.id);
    try {
      const response = await fetch("/api/customer-portal/access-request", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ id: request.id, status })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        request?: CustomerPortalAccessRequest;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to update portal account request.");
      if (payload.request) {
        setAccessRequests((current) => current.map((item) => item.id === request.id ? payload.request! : item));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update portal account request.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void loadAccessRequests();
    void loadPublicQuoteRequests();
  }, [authToken]);

  useEffect(() => {
    if (typeof window === "undefined" || !requests.length) return;
    const requestId = new URLSearchParams(window.location.search).get("request");
    if (!requestId) return;
    const request = requests.find((item) => item.id === requestId);
    if (!request) return;
    setQueue(queueFor(request.status));
    setSelectedId(request.id);
  }, [requests]);

  const counts = useMemo(
    () => ({
      attention: requests.filter((request) => queueFor(request.status) === "attention").length,
      ready: requests.filter((request) => queueFor(request.status) === "ready").length,
      waiting: requests.filter((request) => queueFor(request.status) === "waiting").length,
      converted: requests.filter((request) => queueFor(request.status) === "converted").length,
      archive: requests.filter((request) => queueFor(request.status) === "archive").length
    }),
    [requests]
  );

  const visible = requests
    .filter((request) => {
      const naturalQueue = queueFor(request.status);
      if (naturalQueue !== "converted") return naturalQueue === queue;
      const at = new Date(request.convertedAt ?? request.updatedAt).getTime();
      const recent = Number.isFinite(at) && Date.now() - at <= 7 * 24 * 60 * 60 * 1000;
      return queue === (recent ? "converted" : "archive");
    })
    .filter((request) => {
      const customer = customers.find((item) => item.id === request.customerId);
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return `${request.requestNumber} ${request.title} ${request.note} ${customer?.name} ${request.status}`
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const selected = visible.find((request) => request.id === selectedId) ?? visible[0];
  const customer = selected ? customers.find((item) => item.id === selected.customerId) : undefined;

  useEffect(() => {
    const metadata = selected ? requestMetadata(selected) : {};
    setDraftMetadata(metadata);
    setCustomerReplyDraft(typeof metadata.staffReply === "string" ? metadata.staffReply : "");
  }, [selected?.id, selected?.updatedAt]);

  const meta = selected ? draftMetadata : {};
  const previewRequest = selected ? { ...selected, metadata: draftMetadata } : undefined;
  const preview = previewRequest
    ? pricingPreview(previewRequest, paperStocks, productPresets, catalogPrices, quantityRateCurve)
    : undefined;
  const pricingAdjustment = customerPriceAdjustment(customer, meta.productType);
  const recommendedSellingPrice = preview
    ? Math.round(preview.pricing.total * (1 + pricingAdjustment / 100) * 100) / 100
    : undefined;
  const approvedSellingPrice = typeof meta.approvedSellingPrice === "number" ? meta.approvedSellingPrice : undefined;
  const similarJobs = selected
    ? jobs
        .filter((job) => job.customerId === selected.customerId && !job.archived && !job.deletedAt)
        .map((job) => ({ job, score: similarJobScore(job, meta) }))
        .filter((item) => item.score >= 4)
        .sort((a, b) => b.score - a.score || new Date(b.job.updatedAt ?? b.job.createdAt).getTime() - new Date(a.job.updatedAt ?? a.job.createdAt).getTime())
        .slice(0, 3)
    : [];

  async function patchRequest(request: CustomerPortalRequest, changes: {
    status?: CustomerPortalRequestStatus;
    metadata?: Record<string, unknown>;
    notificationReadAt?: string | null;
    notificationReadBy?: string | null;
  }) {
    setBusy(request.id);
    setMessage("");
    try {
      const response = await fetch("/api/customer-portal/admin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          action: changes.notificationReadAt !== undefined ? "notification" : "request",
          requestId: request.id,
          ...changes
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        request?: CustomerPortalRequest;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to update the portal request.");
      const updated = payload.request ?? {
        ...request,
        ...changes,
        notificationReadAt:
          changes.notificationReadAt === null
            ? undefined
            : changes.notificationReadAt ?? request.notificationReadAt,
        notificationReadBy:
          changes.notificationReadBy === null
            ? undefined
            : changes.notificationReadBy ?? request.notificationReadBy,
        updatedAt: new Date().toISOString()
      };
      onRequestsChange(requests.map((item) => (item.id === request.id ? updated : item)));
      setMessage(payload.message || "Portal request updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the portal request.");
    } finally {
      setBusy("");
    }
  }

  async function analyzeRequest(request: CustomerPortalRequest) {
    setBusy(request.id);
    setMessage("");
    try {
      const customer = customers.find((item) => item.id === request.customerId);
      const current = requestMetadata(request);
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          mode: "auto",
          source: "manual",
          requestText: `${request.title}\n\n${request.note}\n\n${JSON.stringify(current)}`,
          current: {
            customerName: customer?.name,
            productCategory: productCategory(current.productType),
            productName: current.productType,
            quantity: current.quantity,
            finishedWidth: current.finishedWidth,
            finishedHeight: current.finishedHeight,
            sides: current.sides,
            colorSpec: current.colorSpec,
            paperName: current.paperPreference,
            dueDate: current.dueDate
          },
          catalog: {
            categories: Array.from(new Set(productPresets.map((preset) => preset.category))),
            products: productPresets,
            papers: paperStocks.map((paper) => ({
              id: paper.id,
              name: paper.name,
              width: paper.sheetWidth,
              height: paper.sheetHeight,
              kind: paper.kind
            }))
          }
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        result?: {
          model: string;
          specification: {
            summary: string;
            confidence: number;
            missingInformation: string[];
            productCategory?: string;
            productName?: string;
            quantity?: number;
            finishedWidth?: number;
            finishedHeight?: number;
            sides?: 1 | 2;
            colorSpec?: string;
            paperHint?: string;
            finishing: string[];
          };
        };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error || "AI review failed.");
      const spec = payload.result.specification;
      const merged: Record<string, unknown> = {
        ...current,
        quantity: spec.quantity ?? current.quantity,
        finishedWidth: spec.finishedWidth ?? current.finishedWidth,
        finishedHeight: spec.finishedHeight ?? current.finishedHeight,
        sides: spec.sides ?? current.sides,
        colorSpec: spec.colorSpec ?? current.colorSpec,
        paperPreference: spec.paperHint ?? current.paperPreference,
        finishing: spec.finishing.length ? spec.finishing : current.finishing,
        aiSummary: spec.summary,
        aiConfidence: spec.confidence,
        aiMissingInformation: spec.missingInformation,
        aiModel: payload.result.model
      };
      const nextStatus: CustomerPortalRequestStatus = spec.missingInformation.length
        ? "Missing Information"
        : "AI Reviewed";
      const patchResponse = await fetch("/api/customer-portal/admin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          action: "request",
          requestId: request.id,
          status: nextStatus,
          metadata: merged
        })
      });
      const patchPayload = (await patchResponse.json().catch(() => ({}))) as {
        request?: CustomerPortalRequest;
        error?: string;
      };
      if (!patchResponse.ok) throw new Error(patchPayload.error || "Unable to save AI review.");
      const updated = patchPayload.request ?? {
        ...request,
        status: nextStatus,
        metadata: merged,
        updatedAt: new Date().toISOString()
      };
      onRequestsChange(requests.map((item) => (item.id === request.id ? updated : item)));
      setMessage(`AI review completed with ${Math.round(spec.confidence * 100)}% confidence.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI review failed.");
    } finally {
      setBusy("");
    }
  }

  async function openFile(request: CustomerPortalRequest) {
    const pending = window.open("about:blank", "_blank");
    try {
      const response = await fetch(
        `/api/customer-portal/admin/file?id=${encodeURIComponent(request.id)}`,
        {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
          cache: "no-store"
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Unable to open this customer upload.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (pending) {
        pending.opener = null;
        pending.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      pending?.close();
      setMessage(error instanceof Error ? error.message : "Unable to open this customer upload.");
    }
  }

  function updateDraft(changes: Partial<CustomerPortalRequestMetadata>) {
    setDraftMetadata((current) => ({ ...current, ...changes }));
  }

  async function saveDraftDetails() {
    if (!selected) return;
    await patchRequest(selected, {
      metadata: draftMetadata as Record<string, unknown>,
      status: selected.status === "New" ? "AI Reviewed" : selected.status
    });
  }

  const readyForConversion = Boolean(
    selected &&
      selected.customerId &&
      meta.quantity &&
      meta.productType &&
      (meta.finishedWidth || meta.productType === "Envelopes" || meta.productType === "Copies") &&
      (meta.finishedHeight || meta.productType === "Envelopes" || meta.productType === "Copies")
  );
  const missingFields = selected
    ? [
        !meta.productType ? "product" : "",
        !meta.quantity ? "quantity" : "",
        !meta.finishedWidth && !["Envelopes", "Copies"].includes(meta.productType ?? "")
          ? "finished width"
          : "",
        !meta.finishedHeight && !["Envelopes", "Copies"].includes(meta.productType ?? "")
          ? "finished height"
          : "",
        !meta.colorSpec ? "print specification" : "",
        !meta.sides ? "print sides" : ""
      ].filter(Boolean)
    : [];
  const closedRequest = selected
    ? ["Converted", "Closed", "Archived", "Completed"].includes(selected.status)
    : false;

  function focusCustomerMessage() {
    document.getElementById("portal-request-customer-message")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  return (
    <main className="page-view portal-requests-page">
      <div className="section-heading portal-requests-heading">
        <div>
          <p>Website quotes · Portal messages · Account requests</p>
          <h1>Portal Requests</h1>
          <span>Top section = public website quotes (no public price). Below = portal customer requests. Match the customer, set the selling price, then convert to one quote or job.</span>
        </div>
        <button className="secondary-button" type="button" onClick={() => { onRefresh(); void loadAccessRequests(); void loadPublicQuoteRequests(); }} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} size={17} />
          {loading ? "Refreshing..." : "Refresh requests"}
        </button>
      </div>

      {message ? <div className="portal-requests-message">{message}</div> : null}

      <section className="public-quote-inbox panel">
        <div className="public-quote-inbox-heading">
          <div><Globe2 size={19} /><span><strong>1. Public website quote requests</strong><small>Handle these first. Visitors never saw a price. 1) Confirm/match customer 2) Review internal estimate / set selling price 3) Approve 4) Send to Portal Requests / convert.</small></span></div>
          <b>{activePublicQuoteRequests.length}</b>
        </div>
        <div className="public-quote-inbox-list">
          {activePublicQuoteRequests.slice(0, 8).map((request) => {
            const suggested = request.customer_match?.[0];
            const selectedCustomerId = request.linked_customer_id || suggested?.customerId || "";
            const internalEstimate = Number(request.estimated_total);
            return (
              <article key={request.id}>
                <div className="public-quote-primary">
                  <span className="soft-chip">QR-{String(request.request_number).padStart(5, "0")}</span>
                  <strong>{request.product} · {request.quantity.toLocaleString()}</strong>
                  <small>{request.company || request.name} · {request.name} · {request.email}</small>
                  <p>{[request.size, request.color_spec, request.paper, request.paper_weight, request.coating, request.finishing, request.delivery_method].filter(Boolean).join(" · ")}</p>
                  {request.notes ? <em>{request.notes}</em> : null}
                </div>
                <div className="public-quote-match">
                  <span>Customer match</span>
                  {suggested ? <small>{suggested.customerName} · {suggested.reason}</small> : <small>No match found — choose or create the customer.</small>}
                  <select value={selectedCustomerId} onChange={(event) => void updatePublicQuote(request, { linkedCustomerId: event.target.value || null, status: "reviewing" })}>
                    <option value="">Choose customer...</option>
                    {customers.filter((customer) => !customer.archived && !customer.deletedAt).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </div>
                <div className="public-quote-price">
                  <span>Internal estimate</span>
                  <strong>{Number.isFinite(internalEstimate) ? formatMoney(internalEstimate) : "Review"}</strong>
                  <label>Approved price<input type="number" min="0" step="0.01" defaultValue={request.approved_selling_price ?? (Number.isFinite(internalEstimate) ? internalEstimate : "")} onBlur={(event) => event.target.value && void updatePublicQuote(request, { approvedSellingPrice: Number(event.target.value), status: "reviewing" })} /></label>
                </div>
                <div className="public-quote-actions">
                  <button className="secondary-button" type="button" disabled={publicQuoteBusy === request.id} onClick={() => void updatePublicQuote(request, { status: "reviewing", approvedSellingPrice: request.approved_selling_price ?? (Number.isFinite(internalEstimate) ? internalEstimate : undefined) })}>Approve / review</button>
                  <button className="primary-button" type="button" disabled={publicQuoteBusy === request.id || !selectedCustomerId} onClick={() => void updatePublicQuote(request, { action: "handoff", linkedCustomerId: selectedCustomerId, approvedSellingPrice: request.approved_selling_price ?? (Number.isFinite(internalEstimate) ? internalEstimate : undefined) })}>{publicQuoteBusy === request.id ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}Send to Portal Requests</button>
                </div>
              </article>
            );
          })}
          {!publicQuoteLoading && !activePublicQuoteRequests.length ? <p className="muted">No public website quote requests need action.</p> : null}
          {publicQuoteLoading ? <p className="muted">Loading website quote requests...</p> : null}
        </div>
      </section>

      <section className="portal-access-request-inbox panel">
        <div className="portal-access-request-heading">
          <div>
            <UserRoundCheck size={19} />
            <span><strong>New Customer Portal account requests</strong><small>Match the request to a customer record, then send the normal secure portal invitation from Customers.</small></span>
          </div>
          <b>{accessRequests.filter((request) => request.status === "Pending").length}</b>
        </div>
        <div className="portal-access-request-list">
          {accessRequests.filter((request) => request.status !== "Archived").slice(0, 8).map((request) => (
            <article key={request.id}>
              <div>
                <span className={`soft-chip ${request.status.toLowerCase()}`}>{request.status}</span>
                <strong>{request.companyName}</strong>
                <small>{request.contactName} · {request.email}{request.phone ? ` · ${request.phone}` : ""}</small>
                {request.existingCustomer ? <p>Existing customer reference: {request.existingCustomer}</p> : null}
                {request.note ? <p>{request.note}</p> : null}
              </div>
              <div>
                {request.status === "Pending" ? <button className="secondary-button" type="button" onClick={() => void updateAccessRequest(request, "Reviewed")} disabled={busy === request.id}>Mark reviewed</button> : null}
                <button className="primary-button" type="button" onClick={onOpenCustomers}>Open Customers</button>
                <button className="text-button small" type="button" onClick={() => void updateAccessRequest(request, "Archived")} disabled={busy === request.id}>Archive</button>
              </div>
            </article>
          ))}
          {!accessRequestsLoading && !accessRequests.length ? <p className="muted">No new portal account requests.</p> : null}
          {accessRequestsLoading ? <p className="muted">Loading account requests...</p> : null}
        </div>
      </section>

      <div className="portal-request-queue-tabs">
        {([
          ["attention", "Needs attention", counts.attention, Inbox],
          ["ready", "Ready", counts.ready, CheckCircle2],
          ["waiting", "Waiting for customer", counts.waiting, Clock3],
          ["converted", "Recently completed", counts.converted, History],
          ["archive", "Closed / archived", counts.archive, FileText]
        ] as const).map(([id, label, count, Icon]) => (
          <button
            className={queue === id ? "active" : ""}
            type="button"
            key={id}
            onClick={() => {
              setQueue(id);
              setSelectedId(undefined);
            }}
          >
            <Icon size={16} />
            <span>{label}</span>
            <b>{count}</b>
          </button>
        ))}
      </div>

      <div className="portal-request-workspace">
        <section className="panel portal-request-list-panel">
          <label className="portal-request-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search PR number, customer, or product..." />
          </label>
          <div className="portal-request-list">
            {visible.map((request) => {
              const requestCustomer = customers.find((item) => item.id === request.customerId);
              const requestMeta = requestMetadata(request);
              return (
                <button
                  type="button"
                  className={selected?.id === request.id ? "active" : ""}
                  key={request.id}
                  onClick={() => {
                    setSelectedId(request.id);
                    if (!request.notificationReadAt) {
                      void patchRequest(request, {
                        notificationReadAt: new Date().toISOString(),
                        notificationReadBy: "current-staff"
                      });
                    }
                  }}
                >
                  <span>
                    <strong>{request.requestNumber ?? "Portal request"}</strong>
                    <b>{request.title}</b>
                    <small>{requestCustomer?.name ?? "Customer not found"} · {requestMeta.productType ?? request.type.replace(/_/g, " ")}</small>
                  </span>
                  <em>{request.status}</em>
                </button>
              );
            })}
            {!visible.length ? (
              <div className="portal-request-empty">
                <Inbox size={28} />
                <strong>No requests in this queue</strong>
                <span>New customer website submissions will appear here.</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel portal-request-detail-panel">
          {selected ? (
            <>
              <header className="portal-request-detail-header">
                <div>
                  <p>{selected.requestNumber ?? "Portal request"} · {selected.status}</p>
                  <h2>{selected.title}</h2>
                  <span>{customer?.name ?? "Customer not found"} · {formatDateTime(selected.createdAt)}</span>
                </div>
                <div>
                  {selected.fileName ? (
                    <button className="secondary-button" type="button" onClick={() => void openFile(selected)}>
                      <Download size={16} />
                      Open customer upload
                    </button>
                  ) : null}
                </div>
              </header>

              {selected.status === "Converted" ? (
                <div className="portal-request-converted-card">
                  <CheckCircle2 size={25} />
                  <div>
                    <strong>Converted to {selected.convertedRecordNumber ?? "a Gross Printing record"}</strong>
                    <span>{selected.convertedAt ? formatDateTime(selected.convertedAt) : formatDateTime(selected.updatedAt)}{selected.convertedBy ? ` · ${selected.convertedBy}` : ""}</span>
                  </div>
                  {selected.jobId ? (
                    <button className="primary-button" type="button" onClick={() => onOpenJob(selected.jobId!)}>
                      Open linked record
                      <ArrowRight size={16} />
                    </button>
                  ) : null}
                </div>
              ) : null}

              {!closedRequest ? (
                <section className={`portal-request-next-action ${selected.status === "Waiting for Customer" ? "waiting" : readyForConversion ? "ready" : "attention"}`}>
                  <div className="portal-request-next-icon">
                    {selected.status === "Waiting for Customer" ? (
                      <Clock3 size={22} />
                    ) : readyForConversion ? (
                      <CheckCircle2 size={22} />
                    ) : (
                      <AlertTriangle size={22} />
                    )}
                  </div>
                  <div className="portal-request-next-copy">
                    <p>Next action</p>
                    {selected.status === "Waiting for Customer" ? (
                      <>
                        <h3>Waiting for the customer’s answer</h3>
                        <span>When the customer responds, review the updated information and continue the request.</span>
                      </>
                    ) : !selected.metadata?.aiSummary && selected.status === "New" ? (
                      <>
                        <h3>Review the request first</h3>
                        <span>Let AI organize the customer’s wording, then verify every field yourself.</span>
                      </>
                    ) : missingFields.length ? (
                      <>
                        <h3>{missingFields.length} required detail{missingFields.length === 1 ? " is" : "s are"} missing</h3>
                        <span>Complete {missingFields.join(", ")} or ask the customer before creating a quote or job.</span>
                      </>
                    ) : (
                      <>
                        <h3>Request is ready to continue</h3>
                        <span>{preview ? `Preliminary total ${formatMoney(preview.pricing.total)}. ` : ""}Choose whether this becomes a quote or an approved production job.</span>
                      </>
                    )}
                  </div>
                  <div className="portal-request-next-actions">
                    {selected.status === "Waiting for Customer" ? (
                      <button className="primary-button" type="button" onClick={() => void patchRequest(selected, { status: "AI Reviewed" })}>
                        <CheckCircle2 size={16} />
                        Customer replied
                      </button>
                    ) : !selected.metadata?.aiSummary && selected.status === "New" ? (
                      <button className="primary-button" type="button" onClick={() => void analyzeRequest(selected)} disabled={busy === selected.id}>
                        {busy === selected.id ? <LoaderCircle className="spin" size={16} /> : <BrainCircuit size={16} />}
                        {busy === selected.id ? "Reviewing..." : "Review with AI"}
                      </button>
                    ) : missingFields.length ? (
                      <>
                        <button className="secondary-button" type="button" onClick={() => void saveDraftDetails()} disabled={busy === selected.id}>
                          <CheckCircle2 size={16} />
                          Save corrected details
                        </button>
                        <button className="primary-button" type="button" onClick={focusCustomerMessage}>
                          <ArrowRight size={16} />
                          Ask customer
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="secondary-button" type="button" onClick={() => onStartConversion({ ...selected, status: "Ready for Quote", metadata: draftMetadata }, "quote")}>
                          <FileInput size={16} />
                          Create quote
                        </button>
                        <button className="primary-button" type="button" onClick={() => onStartConversion({ ...selected, status: "Ready for Job", metadata: draftMetadata }, "job")}>
                          <PackageCheck size={16} />
                          Create production job
                        </button>
                      </>
                    )}
                  </div>
                </section>
              ) : null}

              <section className="portal-request-edit-section">
                <div className="portal-request-edit-heading">
                  <div>
                    <strong>Staff-reviewed request details</strong>
                    <span>Correct the customer or AI interpretation before creating a quote or job.</span>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => void saveDraftDetails()} disabled={busy === selected.id}>
                    {busy === selected.id ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />}
                    Save details
                  </button>
                </div>
                <div className="portal-request-edit-grid">
                  <label>
                    Product
                    <select value={meta.productType ?? ""} onChange={(event) => updateDraft({ productType: event.target.value as CustomerPortalRequestMetadata["productType"] })}>
                      <option value="">Choose...</option>
                      {["Business Cards", "Flyers / Brochures", "Booklets", "Invitations", "Labels / Stickers", "Envelopes", "Posters", "Signs / Banners", "Copies", "Plans / Blueprints", "Other"].map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input type="number" min="1" value={meta.quantity ?? ""} onChange={(event) => updateDraft({ quantity: event.target.value ? Number(event.target.value) : undefined })} />
                  </label>
                  <label>
                    Finished width
                    <input type="number" min="0.1" step="0.125" value={meta.finishedWidth ?? ""} onChange={(event) => updateDraft({ finishedWidth: event.target.value ? Number(event.target.value) : undefined })} />
                  </label>
                  <label>
                    Finished height
                    <input type="number" min="0.1" step="0.125" value={meta.finishedHeight ?? ""} onChange={(event) => updateDraft({ finishedHeight: event.target.value ? Number(event.target.value) : undefined })} />
                  </label>
                  <label>
                    Print specification
                    <select value={meta.colorSpec ?? ""} onChange={(event) => updateDraft({ colorSpec: event.target.value })}>
                      <option value="">Choose...</option>
                      <option>4/4 full color</option>
                      <option>4/0 full color</option>
                      <option>1/1 black</option>
                      <option>1/0 black</option>
                    </select>
                  </label>
                  <label>
                    Sides
                    <select value={meta.sides ?? ""} onChange={(event) => updateDraft({ sides: event.target.value === "1" ? 1 : event.target.value === "2" ? 2 : undefined })}>
                      <option value="">Choose...</option>
                      <option value="1">1 side</option>
                      <option value="2">2 sides</option>
                    </select>
                  </label>
                  <label>
                    Paper / material
                    <input value={meta.paperPreference ?? meta.material ?? ""} onChange={(event) => updateDraft({ paperPreference: event.target.value, material: event.target.value })} />
                  </label>
                  <label>
                    Due date
                    <input type="date" value={meta.dueDate ?? ""} onChange={(event) => updateDraft({ dueDate: event.target.value })} />
                  </label>
                  <label className="wide">
                    Finishing
                    <input value={(meta.finishing ?? []).join(", ")} onChange={(event) => updateDraft({ finishing: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Fold, score, staple, laminate..." />
                  </label>
                  <label className="wide">
                    Staff note
                    <textarea value={meta.staffNote ?? ""} onChange={(event) => updateDraft({ staffNote: event.target.value })} placeholder="Internal review note; not shown to customer." />
                  </label>
                </div>
              </section>

              <section className="portal-request-note">
                <strong>Customer instructions</strong>
                <p>{selected.note || "No additional instructions."}</p>
              </section>

              {selected.type === "reorder" ? (
                <section className="portal-request-reorder-source">
                  <div>
                    <History size={18} />
                    <span>
                      <strong>Reorder of {String(meta.sourceJobNumber ?? selected.jobId ?? "previous job")}</strong>
                      <small>{String(meta.sourceJobTitle ?? selected.title)}</small>
                    </span>
                  </div>
                  <div className="portal-request-reorder-grid">
                    <div><span>Previous quantity</span><strong>{typeof meta.previousQuantity === "number" ? meta.previousQuantity.toLocaleString() : "Not recorded"}</strong></div>
                    <div><span>New quantity</span><strong>{typeof meta.quantity === "number" ? meta.quantity.toLocaleString() : "Missing"}</strong></div>
                    <div><span>Artwork</span><strong>{meta.useSameArtwork === false ? "Customer will provide new artwork" : "Use saved artwork"}</strong></div>
                    <div><span>Requested changes</span><strong>{String(meta.changesRequested || "No changes listed")}</strong></div>
                  </div>
                </section>
              ) : null}

              {Array.isArray(meta.aiMissingInformation) && meta.aiMissingInformation.length ? (
                <section className="portal-request-warning">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Information still needed</strong>
                    <ul>{meta.aiMissingInformation.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </section>
              ) : null}

              {!['Converted', 'Closed', 'Archived', 'Completed'].includes(selected.status) ? (
                <section className="portal-request-customer-reply" id="portal-request-customer-message">
                  <div>
                    <strong>Message the customer</strong>
                    <span>The response appears in the customer's portal request history. It is not sent until staff presses Send to customer.</span>
                  </div>
                  <textarea
                    value={customerReplyDraft}
                    onChange={(event) => setCustomerReplyDraft(event.target.value)}
                    placeholder="Please confirm the missing size, quantity, paper, due date, or other details..."
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!customerReplyDraft.trim() || busy === selected.id}
                    onClick={() => {
                      const repliedAt = new Date().toISOString();
                      void patchRequest(selected, {
                        status: "Waiting for Customer",
                        metadata: {
                          ...draftMetadata,
                          staffReply: customerReplyDraft.trim(),
                          staffRepliedAt: repliedAt
                        }
                      });
                    }}
                  >
                    <ArrowRight size={16} />
                    Send to customer
                  </button>
                </section>
              ) : null}

              <section className="portal-request-pricing v0674-pricing-review">
                <div className="portal-request-pricing-heading">
                  <div>
                    <Calculator size={19} />
                    <span>
                      <strong>Staff pricing review</strong>
                      <small>Gross Printing calculates first. Customer-specific B2B adjustments apply only when enabled on the customer record.</small>
                    </span>
                  </div>
                  {approvedSellingPrice ? <span className="portal-approved-price-chip"><CheckCircle2 size={15} />Approved {formatMoney(approvedSellingPrice)}</span> : null}
                </div>
                {preview && typeof recommendedSellingPrice === "number" ? (
                  <>
                    <div className="portal-request-price-summary">
                      <div><span>Base calculation</span><strong>{formatMoney(preview.pricing.total)}</strong></div>
                      <div><span>Customer adjustment</span><strong>{customer?.portalPricingEnabled ? `${pricingAdjustment > 0 ? "+" : ""}${pricingAdjustment}%` : "None"}</strong></div>
                      <div className="recommended"><span>Recommended selling price</span><strong>{formatMoney(recommendedSellingPrice)}</strong></div>
                    </div>
                    <div className="portal-request-price-breakdown">
                      <span>Paper <strong>{formatMoney(preview.pricing.paper)}</strong></span>
                      <span>Printing <strong>{formatMoney(preview.pricing.printing)}</strong></span>
                      <span>Finishing <strong>{formatMoney(preview.pricing.finishing)}</strong></span>
                      <span>Cutting <strong>{formatMoney(preview.pricing.cutting)}</strong></span>
                    </div>
                    <p>{preview.stock.name} · {preview.layout.piecesPerSheet} up · {preview.layout.sheetsNeeded.toLocaleString()} sheets</p>
                    <div className="portal-price-approval-actions">
                      <button className="primary-button" type="button" disabled={busy === selected.id} onClick={() => void patchRequest(selected, { metadata: { ...draftMetadata, approvedSellingPrice: recommendedSellingPrice, approvedPriceAt: new Date().toISOString(), approvedPriceBy: "current-staff" }, status: selected.status === "New" ? "AI Reviewed" : selected.status })}>
                        <CheckCircle2 size={16} />Approve {formatMoney(recommendedSellingPrice)}
                      </button>
                      <label>
                        Edit selling price
                        <input type="number" min="0" step="0.01" value={approvedSellingPrice ?? recommendedSellingPrice} onChange={(event) => updateDraft({ approvedSellingPrice: event.target.value ? Number(event.target.value) : undefined })} />
                      </label>
                      <button className="secondary-button" type="button" disabled={!meta.approvedSellingPrice || busy === selected.id} onClick={() => void patchRequest(selected, { metadata: { ...draftMetadata, approvedSellingPrice: meta.approvedSellingPrice, approvedPriceAt: new Date().toISOString(), approvedPriceBy: "current-staff" } })}>Save edited price</button>
                    </div>
                  </>
                ) : (
                  <em>Complete product, quantity, size, and paper information before calculating. Unusual products remain staff-review only.</em>
                )}
              </section>

              {similarJobs.length ? (
                <section className="portal-similar-jobs">
                  <div className="portal-similar-jobs-heading"><History size={18} /><span><strong>Previous similar work</strong><small>Use these as a reference; nothing is copied automatically.</small></span></div>
                  <div>
                    {similarJobs.map(({ job }) => (
                      <article key={job.id}>
                        <span><strong>{job.jobNumber} · {job.title}</strong><small>{job.quantity.toLocaleString()} qty · {job.pieceWidth} × {job.pieceHeight} · {job.colorSpec}</small></span>
                        <b>{formatMoney(job.pricing.total)}</b>
                        <button className="secondary-button" type="button" onClick={() => updateDraft({ previousJobId: job.id, previousJobNumber: job.jobNumber, previousQuantity: job.quantity, quantity: meta.quantity ?? job.quantity, finishedWidth: meta.finishedWidth ?? job.pieceWidth, finishedHeight: meta.finishedHeight ?? job.pieceHeight, colorSpec: meta.colorSpec ?? job.colorSpec, sides: meta.sides ?? job.sides, finishing: meta.finishing?.length ? meta.finishing : job.bindery.filter((item) => item !== "Cut to size") })}>Use as reference</button>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="portal-request-actions">
                {!closedRequest ? (
                  <>
                    <button className="secondary-button danger" type="button" onClick={() => void patchRequest(selected, { status: "Archived" })}>
                      Archive request
                    </button>
                  </>
                ) : null}
              </div>

              {!["Converted", "Closed", "Archived", "Completed"].includes(selected.status) ? (
                <section className="portal-request-existing-job">
                  <Link2 size={17} />
                  <label>
                    Add this request to an existing job
                    <select
                      value=""
                      onChange={(event) => event.target.value && onLinkExistingJob(selected, event.target.value)}
                    >
                      <option value="">Choose an active job...</option>
                      {jobs
                        .filter((job) => job.customerId === selected.customerId && !job.archived && !job.deletedAt)
                        .map((job) => <option value={job.id} key={job.id}>{job.jobNumber} — {job.title}</option>)}
                    </select>
                  </label>
                </section>
              ) : null}
            </>
          ) : (
            <div className="portal-request-empty">
              <UserRoundCheck size={30} />
              <strong>Select a portal request</strong>
              <span>The complete customer submission will open here.</span>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
