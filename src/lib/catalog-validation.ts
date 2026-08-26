/**
 * Checks on the numbers every estimate is built from.
 *
 * Paper stocks and catalog rates are the quietest place in the system for a
 * mistake to live. A wrong customer address announces itself the first time
 * mail bounces; a sheet cost entered as 8.82 instead of 0.882 just prices every
 * future job ten times over, and nobody notices until a customer argues.
 *
 * Stock is also looked up by *name* in several places in Job Setup
 * (`NewEstimateJob.tsx` matches `paper.name` against a requested paper), so two
 * stocks sharing a name make that lookup ambiguous — it will find one of them,
 * and which one is not something the shop chose.
 */

import type { CatalogPrice, PaperStock } from "./types";

export type CatalogIssueLevel = "error" | "warning";

export interface CatalogIssue {
  field?: string;
  level: CatalogIssueLevel;
  message: string;
}

export interface CatalogValidation {
  issues: CatalogIssue[];
  canSave: boolean;
}

function result(issues: CatalogIssue[]): CatalogValidation {
  return { issues, canSave: !issues.some((issue) => issue.level === "error") };
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A sheet larger than any press in the shop is almost certainly a typo. */
const MAX_SHEET_INCHES = 120;

export interface PaperStockDraft {
  name: string;
  sheetWidth: number;
  sheetHeight: number;
  costPerSheet: number;
  sellPerSheet: number;
  inventorySheets?: number;
}

export function validatePaperStock(
  draft: PaperStockDraft,
  stocks: PaperStock[],
  existingId?: string
): CatalogValidation {
  const issues: CatalogIssue[] = [];
  const name = (draft.name ?? "").trim();

  if (!name) {
    issues.push({ field: "name", level: "error", message: "A paper stock needs a name." });
  } else if (stocks.some((stock) => stock.id !== existingId && sameName(stock.name, name))) {
    issues.push({
      field: "name",
      level: "error",
      message: `Another stock is already called "${name}". Job Setup matches paper by name, so two with the same name cannot be told apart.`
    });
  }

  for (const [field, value, label] of [
    ["sheetWidth", draft.sheetWidth, "Sheet width"],
    ["sheetHeight", draft.sheetHeight, "Sheet height"]
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({ field, level: "error", message: `${label} must be more than zero.` });
    } else if (value > MAX_SHEET_INCHES) {
      issues.push({
        field,
        level: "warning",
        message: `${label} of ${value}in is larger than any press in the shop. Check the units.`
      });
    }
  }

  if (!Number.isFinite(draft.costPerSheet) || draft.costPerSheet < 0) {
    issues.push({ field: "costPerSheet", level: "error", message: "Cost per sheet cannot be negative." });
  }
  if (!Number.isFinite(draft.sellPerSheet) || draft.sellPerSheet < 0) {
    issues.push({ field: "sellPerSheet", level: "error", message: "Sell per sheet cannot be negative." });
  }

  // Selling under cost is legal and occasionally deliberate, so it warns rather
  // than blocks — but it should never happen silently.
  if (
    Number.isFinite(draft.costPerSheet) && Number.isFinite(draft.sellPerSheet) &&
    draft.sellPerSheet > 0 && draft.sellPerSheet < draft.costPerSheet
  ) {
    issues.push({
      field: "sellPerSheet",
      level: "warning",
      message: `Selling at $${draft.sellPerSheet} below the $${draft.costPerSheet} it costs. Every job on this stock loses money.`
    });
  }
  if (Number.isFinite(draft.sellPerSheet) && draft.sellPerSheet === 0 && draft.costPerSheet > 0) {
    issues.push({
      field: "sellPerSheet",
      level: "warning",
      message: "Sell price is zero, so this stock is given away in every estimate."
    });
  }

  if (draft.inventorySheets !== undefined && (!Number.isFinite(draft.inventorySheets) || draft.inventorySheets < 0)) {
    issues.push({ field: "inventorySheets", level: "error", message: "Sheets on hand cannot be negative." });
  }

  return result(issues);
}

export interface CatalogPriceDraft {
  category: string;
  name: string;
  unit: string;
  price: number;
}

export function validateCatalogPrice(
  draft: CatalogPriceDraft,
  prices: CatalogPrice[],
  existingId?: string
): CatalogValidation {
  const issues: CatalogIssue[] = [];
  const name = (draft.name ?? "").trim();
  const category = (draft.category ?? "").trim();

  if (!name) issues.push({ field: "name", level: "error", message: "A rate needs a name." });
  if (!category) issues.push({ field: "category", level: "error", message: "A rate needs a category." });
  if (!(draft.unit ?? "").trim()) {
    issues.push({
      field: "unit",
      level: "error",
      message: "A rate needs a unit. Without one, nobody can tell $2 per cut from $2 per thousand."
    });
  }

  if (!Number.isFinite(draft.price) || draft.price < 0) {
    issues.push({ field: "price", level: "error", message: "A rate cannot be negative." });
  } else if (draft.price === 0) {
    issues.push({ field: "price", level: "warning", message: "This rate is zero, so it adds nothing to any estimate." });
  }

  // Same name in the same category is a duplicate; the same name under a
  // different category is normal ("Cutting" appears in more than one place).
  if (name && category && prices.some((price) =>
    price.id !== existingId && sameName(price.name, name) && sameName(price.category, category)
  )) {
    issues.push({
      field: "name",
      level: "error",
      message: `${category} already has a rate called "${name}".`
    });
  }

  return result(issues);
}

/**
 * Whether a paper stock can be removed.
 *
 * Jobs record the stock they were printed on by name, so removing one that jobs
 * reference leaves those jobs describing paper the shop no longer lists — and
 * re-pricing or reprinting them stops working. Stock that has been used gets
 * emptied rather than deleted.
 */
export function paperStockRemoval(stock: PaperStock, jobs: Array<{ stockName?: string; archived?: boolean; deletedAt?: string }>) {
  const usedBy = jobs.filter((job) => !job.deletedAt && job.stockName && sameName(job.stockName, stock.name)).length;
  return {
    usedBy,
    canRemove: usedBy === 0,
    message: usedBy === 0
      ? `Remove ${stock.name} from the paper list.`
      : `${stock.name} is recorded on ${usedBy} job${usedBy === 1 ? "" : "s"}. Set its sheets on hand to zero instead, so those jobs keep describing the paper they were printed on.`
  };
}
