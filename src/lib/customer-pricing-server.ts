import { calculateEstimatePricing, calculateImposition, emptyBookletSetup, isRushDue, QUANTITY_RATE_CURVE, type QuantityRatePoint } from "./pricing";
import { PRODUCT_PRESETS, type ProductPreset } from "./product-catalog";
import type { CatalogPrice, Customer, EstimateFormData, ImpositionSettings, PaperStock } from "./types";
import type { CustomerPortalRequestMetadata, CustomerPortalProductType } from "./customer-portal-types";

export interface CustomerPriceResult {
  enabled: boolean;
  requiresReview: boolean;
  reason?: string;
  baseTotal?: number;
  customerTotal?: number;
  perUnit?: number;
  adjustmentPercent?: number;
  pricingTier?: string;
  breakdown?: {
    paper: number;
    printing: number;
    finishing: number;
    cutting: number;
    bookletCover: number;
  };
  stockName?: string;
  piecesPerSheet?: number;
  sheetsNeeded?: number;
}

function productCategory(product?: CustomerPortalProductType) {
  const map: Partial<Record<CustomerPortalProductType, string>> = {
    "Business Cards": "Business Cards",
    "Flyers / Brochures": "Flyers & Brochures",
    Booklets: "Booklets & Books",
    Invitations: "Invitations",
    "Labels / Stickers": "Labels & Stickers",
    Envelopes: "Envelopes",
    Posters: "Signs & Banners",
    "Signs / Banners": "Signs & Banners",
    Copies: "Copies",
    "Plans / Blueprints": "Copies",
    "Tea Party Cards": "Tea Party Cards",
    "Receipt Books": "Receipt Books",
    Stamps: "Stamps",
    "Simcha Bags": "Simcha Bags"
  };
  return product ? map[product] : undefined;
}

function sameSize(aWidth: number, aHeight: number, bWidth: number, bHeight: number) {
  const a = [Math.min(aWidth, aHeight), Math.max(aWidth, aHeight)];
  const b = [Math.min(bWidth, bHeight), Math.max(bWidth, bHeight)];
  return Math.abs(a[0] - b[0]) <= 0.15 && Math.abs(a[1] - b[1]) <= 0.15;
}

function settings(): ImpositionSettings {
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

function tierAdjustment(customer: Customer) {
  if (typeof customer.pricingAdjustmentPercent === "number" && Number.isFinite(customer.pricingAdjustmentPercent)) {
    return customer.pricingAdjustmentPercent;
  }
  if (customer.pricingTier === "wholesale") return -5;
  if (customer.pricingTier === "reseller") return -10;
  return 0;
}

function customerAdjustment(customer: Customer, product?: CustomerPortalProductType) {
  const specific = product ? customer.productPricingAdjustments?.[product] : undefined;
  const raw = typeof specific === "number" && Number.isFinite(specific) ? specific : tierAdjustment(customer);
  return Math.max(-50, Math.min(100, raw));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateCustomerPrice(input: {
  customer: Customer;
  metadata: CustomerPortalRequestMetadata;
  title?: string;
  paperStocks: PaperStock[];
  productPresets?: ProductPreset[];
  catalogPrices?: CatalogPrice[];
  quantityRateCurve?: QuantityRatePoint[];
}): CustomerPriceResult {
  const { customer, metadata } = input;
  if (!customer.portalPricingEnabled) {
    return { enabled: false, requiresReview: true, reason: "Automatic portal pricing is not enabled for this customer." };
  }

  const product = metadata.productType;
  const category = productCategory(product);
  const quantity = Number(metadata.quantity);
  if (!product || !category || !Number.isFinite(quantity) || quantity <= 0) {
    return { enabled: true, requiresReview: true, reason: "Choose a supported product and quantity before pricing." };
  }

  // These products need product-specific rules beyond the generic sheet calculator.
  if (["Booklets", "Receipt Books", "Stamps", "Simcha Bags", "Signs / Banners", "Plans / Blueprints", "Other"].includes(product)) {
    return { enabled: true, requiresReview: true, reason: "This product requires Gross Printing review before a price is shown." };
  }
  if (product === "Labels / Stickers" && metadata.labelFormat === "Roll labels") {
    return { enabled: true, requiresReview: true, reason: "Roll-label pricing requires Gross Printing review before a price is shown." };
  }
  if (metadata.dueDate && isRushDue(metadata.dueDate, "17:00")) {
    return { enabled: true, requiresReview: true, reason: "Rush timing requires Gross Printing review before a price is shown." };
  }

  const presets = input.productPresets?.length ? input.productPresets : PRODUCT_PRESETS;
  const categoryPresets = presets.filter((item) => item.category === category);
  const requestedWidth = Number(metadata.finishedWidth);
  const requestedHeight = Number(metadata.finishedHeight);
  const preset =
    (requestedWidth > 0 && requestedHeight > 0
      ? categoryPresets.find((item) => sameSize(item.width, item.height, requestedWidth, requestedHeight))
      : undefined) ?? categoryPresets[0];

  const width = requestedWidth > 0 ? requestedWidth : preset?.width ?? 0;
  const height = requestedHeight > 0 ? requestedHeight : preset?.height ?? 0;
  if (!width || !height) {
    return { enabled: true, requiresReview: true, reason: "Finished size is required before pricing this product." };
  }

  const paperHint = (metadata.paperPreference || metadata.material || "").trim().toLowerCase();
  const stock =
    input.paperStocks.find((paper) => paperHint && paper.name.toLowerCase().includes(paperHint)) ??
    (preset
      ? input.paperStocks.find((paper) => paper.kind === preset.stockKind && paper.productCategories?.includes(category)) ??
        input.paperStocks.find((paper) => paper.kind === preset.stockKind)
      : undefined);
  if (!stock) {
    return { enabled: true, requiresReview: true, reason: "The selected paper or material needs staff review." };
  }

  const colorSpec = metadata.colorSpec || preset?.colorSpec || "4/4 full color";
  const normalizedColor = colorSpec.toLowerCase();
  if (normalizedColor.includes("spot") || normalizedColor.includes("custom ink") || normalizedColor.includes("not sure")) {
    return { enabled: true, requiresReview: true, reason: "This print-color setup requires Gross Printing review before a price is shown." };
  }
  const sides = metadata.sides ?? preset?.sides ?? (colorSpec.includes("/0") ? 1 : 2);
  const layout = calculateImposition(stock, quantity, width, height, settings());
  const finishing = metadata.finishing ?? [];
  const parentMatches = sameSize(width, height, stock.sheetWidth, stock.sheetHeight);
  const noNormalCut = product === "Envelopes" || product === "Signs / Banners" || metadata.labelFormat === "Roll labels";
  const bindery =
    !noNormalCut && (!parentMatches || layout.piecesPerSheet > 1 || layout.cutsPerPile > 0)
      ? Array.from(new Set([...finishing, "Cut to size"]))
      : finishing;
  const coverStock = input.paperStocks.find((paper) => paper.kind === "cover") ?? stock;
  const form: EstimateFormData = {
    customerId: customer.id,
    title: input.title || `${quantity.toLocaleString()} ${product}`,
    quantity,
    pieceWidth: width,
    pieceHeight: height,
    dueDate: metadata.dueDate ?? "",
    dueTime: "17:00",
    stockId: stock.id,
    colorSpec,
    sides,
    bindery,
    orderSource: "Customer Portal",
    customerReference: metadata.customerPo ?? "Portal live price",
    cuttingMode: "auto",
    booklet: emptyBookletSetup(coverStock.id)
  };
  const pricing = calculateEstimatePricing(
    form,
    stock,
    layout,
    coverStock,
    input.catalogPrices ?? [],
    input.quantityRateCurve?.length ? input.quantityRateCurve : QUANTITY_RATE_CURVE
  );
  const adjustmentPercent = customerAdjustment(customer, product);
  const customerTotal = roundMoney(pricing.total * (1 + adjustmentPercent / 100));
  return {
    enabled: true,
    requiresReview: false,
    baseTotal: pricing.total,
    customerTotal,
    perUnit: roundMoney(customerTotal / quantity),
    adjustmentPercent,
    pricingTier: customer.pricingTier ?? "standard",
    breakdown: {
      paper: pricing.paper,
      printing: pricing.printing,
      finishing: pricing.finishing,
      cutting: pricing.cutting,
      bookletCover: pricing.bookletCover
    },
    stockName: stock.name,
    piecesPerSheet: layout.piecesPerSheet,
    sheetsNeeded: layout.sheetsNeeded
  };
}
