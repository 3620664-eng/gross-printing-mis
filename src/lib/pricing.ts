import type {
  BookletSetup,
  CatalogPrice,
  EstimateFormData,
  ImpositionResult,
  ImpositionSettings,
  JobPricing,
  JobStatus,
  PaperStock,
  TimeCategory,
  UpPreset
} from "./types";
import { calculatePriceListEstimate } from "./price-list";

export const JOB_STATUSES: JobStatus[] = [
  "Quote",
  "Approved",
  "Prepress",
  "Printing",
  "Finishing",
  "Ready",
  "Delivered",
  "Cancelled"
];

export const WORKFLOW_STATUSES: JobStatus[] = JOB_STATUSES.filter((status) => status !== "Cancelled");

export const TIME_LABELS: Record<TimeCategory, string> = {
  prepress: "Prepress time",
  printingSetup: "Printing setup time",
  printingRun: "Printing run time",
  finishing: "Finishing time"
};

export const CUTTING_RATE = 2;

export const PILE_LIMIT_BY_KIND: Record<PaperStock["kind"], number> = {
  cover: 250,
  text: 500,
  "wide-format": 250,
  specialty: 250
};

export const MANUAL_UP_PRESETS: UpPreset[] = ["auto", "custom"];

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDateTime(date: string, time: string) {
  return `${new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  })} ${time}`;
}

export function getQuickDueDate(choice: "Today" | "Tomorrow" | "+2 Days" | "Next Week") {
  const date = new Date();
  const days = choice === "Today" ? 0 : choice === "Tomorrow" ? 1 : choice === "+2 Days" ? 2 : 7;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isRushDue(dueDate: string, dueTime: string, now = new Date()) {
  const due = new Date(`${dueDate}T${dueTime || "17:00"}`);
  const ms = due.getTime() - now.getTime();
  return ms >= 0 && ms <= 24 * 60 * 60 * 1000;
}

function safePositive(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeNonNegative(value: number, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function safeWhole(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;
}

function getAutoGrid(
  sheetWidth: number,
  sheetHeight: number,
  pieceWidth: number,
  pieceHeight: number,
  margin: number,
  gutter: number
) {
  const safeSheetWidth = safePositive(sheetWidth);
  const safeSheetHeight = safePositive(sheetHeight);
  const safePieceWidth = safePositive(pieceWidth);
  const safePieceHeight = safePositive(pieceHeight);
  const safeMargin = safeNonNegative(margin);
  const safeGutter = safeNonNegative(gutter);
  const usableWidth = Math.max(0, safeSheetWidth - safeMargin * 2);
  const usableHeight = Math.max(0, safeSheetHeight - safeMargin * 2);
  const columns = safeWhole((usableWidth + safeGutter) / (safePieceWidth + safeGutter));
  const rows = safeWhole((usableHeight + safeGutter) / (safePieceHeight + safeGutter));
  return { columns, rows };
}

function getLayoutSize(columns: number, rows: number, pieceWidth: number, pieceHeight: number, gutter: number) {
  const safeColumns = safeWhole(columns);
  const safeRows = safeWhole(rows);
  const safePieceWidth = safePositive(pieceWidth);
  const safePieceHeight = safePositive(pieceHeight);
  const safeGutter = safeNonNegative(gutter);
  return {
    width: safeColumns * safePieceWidth + Math.max(0, safeColumns - 1) * safeGutter,
    height: safeRows * safePieceHeight + Math.max(0, safeRows - 1) * safeGutter
  };
}

function clampGrid(
  grid: { columns: number; rows: number },
  usableWidth: number,
  usableHeight: number,
  pieceWidth: number,
  pieceHeight: number,
  gutter: number
) {
  const safeUsableWidth = safeNonNegative(usableWidth);
  const safeUsableHeight = safeNonNegative(usableHeight);
  const safePieceWidth = safePositive(pieceWidth);
  const safePieceHeight = safePositive(pieceHeight);
  const safeGutter = safeNonNegative(gutter);
  const maxColumns = safeWhole((safeUsableWidth + safeGutter) / (safePieceWidth + safeGutter));
  const maxRows = safeWhole((safeUsableHeight + safeGutter) / (safePieceHeight + safeGutter));
  return {
    columns: Math.max(1, Math.min(safeWhole(grid.columns), maxColumns)),
    rows: Math.max(1, Math.min(safeWhole(grid.rows), maxRows))
  };
}

function buildCandidate(
  grid: { columns: number; rows: number },
  sheetWidth: number,
  sheetHeight: number,
  usableWidth: number,
  usableHeight: number,
  pieceWidth: number,
  pieceHeight: number,
  gutter: number,
  artworkRotation: number,
  sheetRotated: boolean
) {
  const clampedGrid = clampGrid(grid, usableWidth, usableHeight, pieceWidth, pieceHeight, gutter);
  const layout = getLayoutSize(clampedGrid.columns, clampedGrid.rows, pieceWidth, pieceHeight, gutter);
  return {
    ...clampedGrid,
    ...layout,
    sheetWidth,
    sheetHeight,
    sheetRotated,
    pieceWidth,
    pieceHeight,
    artworkRotated: artworkRotation === 90 || artworkRotation === 270,
    artworkRotation,
    pieces: clampedGrid.columns * clampedGrid.rows,
    fits: layout.width <= usableWidth + 0.001 && layout.height <= usableHeight + 0.001
  };
}

function betterCandidate<T extends { fits: boolean; pieces: number }>(current: T, next: T) {
  if (next.fits !== current.fits) return next.fits;
  return next.pieces > current.pieces;
}

function rotationModeToDegrees(settings: ImpositionSettings) {
  const rotationMode = settings.rotationMode ?? (settings.rotate ? "90" : "0");
  if (rotationMode === "auto" || rotationMode === "360") return 0;
  const degrees = Number(rotationMode);
  return Number.isFinite(degrees) ? degrees : 0;
}

export function calculateImposition(
  stock: PaperStock,
  quantity: number,
  pieceWidth: number,
  pieceHeight: number,
  settings: ImpositionSettings
): ImpositionResult {
  const safeSheetWidth = safePositive(stock.sheetWidth);
  const safeSheetHeight = safePositive(stock.sheetHeight);
  const safePieceWidth = safePositive(pieceWidth);
  const safePieceHeight = safePositive(pieceHeight);
  const safeQuantity = safeWhole(quantity);
  const safeGutter = safeNonNegative(settings.gutter);
  const activeBleed = settings.imageBleedEnabled ? safeNonNegative(settings.bleed) : 0;
  const margin = safeNonNegative(settings.margin);
  const safeMargin = settings.keepBleedMargins === false ? margin : Math.max(margin, activeBleed);
  const rotationDegrees = rotationModeToDegrees(settings);

  const buildSheetCandidate = (sheetWidth: number, sheetHeight: number, sheetRotated: boolean) => {
    const usableWidth = Math.max(0, sheetWidth - safeMargin * 2);
    const usableHeight = Math.max(0, sheetHeight - safeMargin * 2);
    const baseGrid =
      settings.preset === "auto"
        ? getAutoGrid(sheetWidth, sheetHeight, safePieceWidth, safePieceHeight, safeMargin, safeGutter)
        : { columns: safeWhole(settings.customColumns), rows: safeWhole(settings.customRows) };

    return buildCandidate(
      baseGrid,
      sheetWidth,
      sheetHeight,
      usableWidth,
      usableHeight,
      safePieceWidth,
      safePieceHeight,
      safeGutter,
      rotationDegrees,
      sheetRotated
    );
  };

  const makeBookletCandidate = (candidate: ReturnType<typeof buildSheetCandidate>) => {
    if (settings.mode !== "booklet") return candidate;
    const evenColumns = candidate.columns >= 2 ? candidate.columns - (candidate.columns % 2) : 0;
    if (evenColumns < 2) return { ...candidate, fits: false, pieces: 0, columns: Math.max(1, candidate.columns) };
    const layout = getLayoutSize(evenColumns, candidate.rows, candidate.pieceWidth, candidate.pieceHeight, safeGutter);
    const usableWidth = Math.max(0, candidate.sheetWidth - safeMargin * 2);
    const usableHeight = Math.max(0, candidate.sheetHeight - safeMargin * 2);
    return {
      ...candidate,
      columns: evenColumns,
      width: layout.width,
      height: layout.height,
      pieces: evenColumns * candidate.rows,
      fits: layout.width <= usableWidth + 0.001 && layout.height <= usableHeight + 0.001
    };
  };

  const upright = makeBookletCandidate(buildSheetCandidate(safeSheetWidth, safeSheetHeight, false));
  const sideways =
    (settings.preset === "auto" || settings.mode === "booklet") && safeSheetWidth !== safeSheetHeight
      ? makeBookletCandidate(buildSheetCandidate(safeSheetHeight, safeSheetWidth, true))
      : upright;
  const chosen = betterCandidate(upright, sideways) ? sideways : upright;
  const grid = { columns: chosen.columns, rows: chosen.rows };
  const finalPieceWidth = chosen.pieceWidth;
  const finalPieceHeight = chosen.pieceHeight;
  const piecesPerSheet = safeWhole(grid.columns * grid.rows);
  const layoutWidth = chosen.width;
  const layoutHeight = chosen.height;
  const usableWidth = Math.max(0, chosen.sheetWidth - safeMargin * 2);
  const usableHeight = Math.max(0, chosen.sheetHeight - safeMargin * 2);
  const layoutLeft = safeMargin + Math.max(0, (usableWidth - layoutWidth) / 2);
  const layoutTop = safeMargin + Math.max(0, (usableHeight - layoutHeight) / 2);
  const bookletPageCount = settings.mode === "booklet"
    ? Math.max(4, Math.ceil(safeWhole(settings.bookletPageCount ?? 4) / 4) * 4)
    : 0;
  const bookletCopiesPerParent = settings.mode === "booklet"
    ? Math.max(1, Math.floor(grid.columns / 2) * grid.rows)
    : 0;
  const bookletSignatures = settings.mode === "booklet" ? Math.max(1, bookletPageCount / 4) : 0;
  const sheetsNeeded = settings.mode === "booklet"
    ? Math.ceil(safeQuantity / bookletCopiesPerParent) * bookletSignatures
    : Math.ceil(safeQuantity / piecesPerSheet);
  const pileLimit = PILE_LIMIT_BY_KIND[stock.kind];
  const piles = Math.max(1, Math.ceil(sheetsNeeded / pileLimit));
  const innerCuts = Math.max(0, grid.columns - 1) + Math.max(0, grid.rows - 1);
  const needsOuterTrim = layoutWidth < usableWidth - 0.01 || layoutHeight < usableHeight - 0.01;
  const trimCuts = settings.margin > 0 || activeBleed > 0 || needsOuterTrim ? 4 : 0;
  const cutsPerPile = innerCuts + trimCuts;
  const cuttingCharge = cutsPerPile * piles * CUTTING_RATE;
  const usedArea = piecesPerSheet * finalPieceWidth * finalPieceHeight;
  const parentArea = chosen.sheetWidth * chosen.sheetHeight;
  const wastePercent = Math.max(0, Math.min(99, ((parentArea - usedArea) / parentArea) * 100));
  const estimatedMinutes = Math.max(5, Math.ceil(8 + sheetsNeeded * 0.42 + cutsPerPile * piles * 1.5));

  return {
    columns: grid.columns,
    rows: grid.rows,
    piecesPerSheet,
    artworkRotated: chosen.artworkRotated,
    artworkRotation: chosen.artworkRotation,
    sheetWidth: chosen.sheetWidth,
    sheetHeight: chosen.sheetHeight,
    sheetRotated: chosen.sheetRotated,
    pieceWidth: finalPieceWidth,
    pieceHeight: finalPieceHeight,
    layoutLeft,
    layoutTop,
    layoutWidth,
    layoutHeight,
    sheetsNeeded,
    piles,
    cutsPerPile,
    cuttingCharge,
    wastePercent,
    estimatedMinutes,
    instructions: settings.mode === "booklet"
      ? `Saddle-stitch booklet: impose ${bookletPageCount} pages as ${bookletSignatures} nested sheet${bookletSignatures === 1 ? "" : "s"} per booklet, ${bookletCopiesPerParent} booklet cop${bookletCopiesPerParent === 1 ? "y" : "ies"} per parent sheet. Print duplex, keep front/back registration, cut rows/pairs, collate in signature order, fold and staple.`
      : `Center ${grid.columns} columns by ${grid.rows} rows on ${chosen.sheetWidth}x${chosen.sheetHeight}. Trim from the centered crop marks, then cut ${grid.columns} lanes and ${grid.rows} rows across ${piles} pile${piles === 1 ? "" : "s"} at max ${pileLimit} sheets per pile.`
  };
}

export function calculateBookletCoverCost(booklet: BookletSetup, coverStock?: PaperStock) {
  if (!booklet.enabled || !coverStock) return 0;
  const coverSheets = Math.ceil(booklet.pageCount / 4);
  const bindingMultiplier =
    booklet.binding === "spiral" ? 2.25 : booklet.binding === "glue" ? 1.75 : booklet.binding === "fold-staple" ? 1.25 : 0.8;
  return coverSheets * coverStock.sellPerSheet * bindingMultiplier + booklet.coverCost;
}

const DEFAULT_PRINT_SPEC_RATES: Record<string, number> = {
  "4/4": 0.13,
  "4/1": 0.09,
  "4/0": 0.07,
  "1/1": 0.036,
  "1/0": 0.018
};

export interface QuantityRatePoint {
  quantity: number;
  multiplier: number;
}

export const QUANTITY_RATE_CURVE: QuantityRatePoint[] = [
  { quantity: 1, multiplier: 1.55 },
  { quantity: 50, multiplier: 1.35 },
  { quantity: 100, multiplier: 1.22 },
  { quantity: 250, multiplier: 1.08 },
  { quantity: 500, multiplier: 0.96 },
  { quantity: 1000, multiplier: 0.86 },
  { quantity: 2500, multiplier: 0.78 },
  { quantity: 5000, multiplier: 0.72 },
  { quantity: 10000, multiplier: 0.66 }
];

function roundCurrency(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function interpolateByQuantity(points: { quantity: number; value: number }[], quantity: number) {
  const sorted = [...points].sort((a, b) => a.quantity - b.quantity);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (quantity <= first.quantity) return first.value;
  if (quantity >= last.quantity) return last.value;
  const upperIndex = sorted.findIndex((point) => quantity <= point.quantity);
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  const span = upper.quantity - lower.quantity;
  if (!span) return upper.value;
  return lower.value + ((quantity - lower.quantity) / span) * (upper.value - lower.value);
}

function cleanQuantityCurve(curve: QuantityRatePoint[]) {
  const cleaned = curve
    .filter((point) => Number.isFinite(point.quantity) && point.quantity > 0 && Number.isFinite(point.multiplier) && point.multiplier > 0)
    .map((point) => ({ quantity: Math.round(point.quantity), multiplier: point.multiplier }));
  return cleaned.length ? cleaned : QUANTITY_RATE_CURVE;
}

function printSpecCode(colorSpec: string) {
  const normalized = colorSpec.toLowerCase();
  if (normalized.includes("4/4")) return "4/4";
  if (normalized.includes("4/1")) return "4/1";
  if (normalized.includes("4/0") || normalized.includes("wide format") || normalized.includes("banner")) return "4/0";
  if (normalized.includes("1/1")) return "1/1";
  if (normalized.includes("1/0")) return "1/0";
  if (normalized.includes("black") && normalized.includes("2")) return "1/1";
  if (normalized.includes("black")) return "1/0";
  return undefined;
}

function catalogPrintSpecRate(colorSpec: string, catalogPrices: CatalogPrice[]) {
  const code = printSpecCode(colorSpec);
  if (!code) return undefined;
  const record = catalogPrices.find((price) => {
    const text = `${price.category} ${price.name} ${price.unit} ${price.notes}`.toLowerCase();
    return price.category.toLowerCase() === "printing" && text.includes(code);
  });
  return record?.price ?? DEFAULT_PRINT_SPEC_RATES[code];
}

function catalogMinimumCharge(catalogPrices: CatalogPrice[]) {
  return (
    catalogPrices.find((price) => `${price.category} ${price.name}`.toLowerCase().includes("minimum service charge"))?.price ??
    catalogPrices.find((price) => price.category.toLowerCase() === "service" && price.name.toLowerCase().includes("minimum"))?.price ??
    20
  );
}

function finishingRecordFor(option: string, catalogPrices: CatalogPrice[]) {
  const normalized = option.toLowerCase();
  if (normalized.includes("cut to size")) return undefined;
  const keywords = normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["and", "the", "set", "box", "wrap"].includes(word));

  return catalogPrices.find((price) => {
    const text = `${price.category} ${price.name} ${price.notes}`.toLowerCase();
    return price.category.toLowerCase() !== "printing" && keywords.some((word) => text.includes(word));
  });
}

function extraPerThousand(price: CatalogPrice) {
  const match = price.notes.match(/add\s+\$?([\d.]+)\s+per thousand/i);
  return match ? Number(match[1]) : price.price;
}

function priceFinishingOption(option: string, price: CatalogPrice | undefined, data: EstimateFormData, imposition: ImpositionResult) {
  if (!price) return Math.max(8, data.quantity * 0.01);
  const unit = price.unit.toLowerCase();
  if (unit.includes("actual cut")) return 0;
  if (unit.includes("sheet")) return price.price * imposition.sheetsNeeded;
  if (unit.includes("first 1000")) {
    return price.price + Math.max(0, Math.ceil((data.quantity - 1000) / 1000)) * extraPerThousand(price);
  }
  if (unit.includes("up to") || unit.includes("job") || unit.includes("setup") || unit.includes("stop")) return price.price;
  if (unit.includes("piece") || unit.includes("each") || unit.includes("side")) return price.price * data.quantity;
  return option.toLowerCase().includes("box") || option.toLowerCase().includes("wrap") ? Math.max(8, data.quantity * 0.01) : price.price;
}

export function calculateEstimatePricing(
  data: EstimateFormData,
  stock: PaperStock,
  imposition: ImpositionResult,
  coverStock?: PaperStock,
  catalogPrices: CatalogPrice[] = [],
  quantityRateCurve: QuantityRatePoint[] = QUANTITY_RATE_CURVE
): JobPricing {
  const bookletCover = calculateBookletCoverCost(data.booklet, coverStock);
  const priceList = calculatePriceListEstimate(data, stock, imposition);

  if (priceList) {
    const { notes: _notes, ...priceListParts } = priceList;
    const cutting = data.bindery.some((option) => option.toLowerCase().includes("cut to size"))
      ? roundCurrency(imposition.cuttingCharge)
      : 0;
    const total =
      priceListParts.paper +
      priceListParts.printing +
      priceListParts.finishing +
      cutting +
      bookletCover;

    return { ...priceListParts, cutting, bookletCover, total };
  }

  const quantityMultiplier = interpolateByQuantity(
    cleanQuantityCurve(quantityRateCurve).map((point) => ({ quantity: point.quantity, value: point.multiplier })),
    data.quantity
  );
  const printRate = catalogPrintSpecRate(data.colorSpec, catalogPrices) ?? data.sides * 0.065;
  const paper = roundCurrency(imposition.sheetsNeeded * stock.sellPerSheet);
  const printing = roundCurrency(data.quantity * printRate * quantityMultiplier);
  const finishing = roundCurrency(
    data.bindery
      .filter((option) => !option.toLowerCase().includes("cut to size"))
      .reduce((sum, option) => sum + priceFinishingOption(option, finishingRecordFor(option, catalogPrices), data, imposition), 0)
  );
  const cutting = data.bindery.some((option) => option.toLowerCase().includes("cut to size"))
    ? roundCurrency(imposition.cuttingCharge)
    : 0;
  const minimumCharge = catalogMinimumCharge(catalogPrices);
  const subtotal = paper + printing + finishing + cutting + bookletCover;
  const minimumAdjustment = Math.max(0, minimumCharge - subtotal);
  const total = roundCurrency(subtotal + minimumAdjustment);
  return { paper, printing: roundCurrency(printing + minimumAdjustment), finishing, cutting, bookletCover, total };
}

export function statusAfterDrop(current: JobStatus, requested: JobStatus) {
  return requested;
}

export function emptyBookletSetup(coverPaperId: string): BookletSetup {
  return {
    enabled: false,
    insidePages: 0,
    coverPaperId,
    pageCount: 0,
    binding: "fold-staple",
    readingDirection: "ltr",
    coverCost: 0
  };
}
