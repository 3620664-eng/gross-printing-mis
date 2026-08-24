"use client";

import { Database, ListTree, Percent, Plus, Scissors, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProductPreset } from "@/lib/product-catalog";
import type { CatalogPrice, Machine, PaperStock } from "@/lib/types";
import { CUTTING_RATE, formatMoney, PILE_LIMIT_BY_KIND, QUANTITY_RATE_CURVE, type QuantityRatePoint } from "@/lib/pricing";
import { ImportExportToolbar } from "./ImportExportToolbar";
import { RecordModal } from "./RecordModal";

interface CatalogProps {
  paperStocks: PaperStock[];
  productCategories: string[];
  productPresets: ProductPreset[];
  prices: CatalogPrice[];
  machines: Machine[];
  quantityRateCurve?: QuantityRatePoint[];
  onUpdateQuantityRateCurve?: (curve: QuantityRatePoint[]) => void;
  onAddProductCategory: (category: string) => void;
  onRenameProductCategory: (oldCategory: string, newCategory: string) => void;
  onRemoveProductCategory: (category: string) => void;
  onAddProductPreset: (preset: Omit<ProductPreset, "id">) => void;
  onUpdateProductPreset: (presetId: string, preset: Omit<ProductPreset, "id">) => void;
  onRemoveProductPreset: (presetId: string) => void;
  onAddPaperStock: (stock: Omit<PaperStock, "id">) => void;
  onUpdatePaperStock: (stockId: string, stock: Omit<PaperStock, "id">) => void;
  onRemovePaperStock: (stockId: string) => void;
  onAddCatalogPrice: (price: Omit<CatalogPrice, "id">) => void;
  onUpdateCatalogPrice: (priceId: string, price: Omit<CatalogPrice, "id">) => void;
  onRemoveCatalogPrice: (priceId: string) => void;
  onAddMachine: (machine: Omit<Machine, "id">) => void;
  onUpdateMachine: (machineId: string, machine: Omit<Machine, "id">) => void;
  onRemoveMachine: (machineId: string) => void;
  onImportPaper: (rows: Record<string, unknown>[]) => void;
  onImportCatalog: (rows: Record<string, unknown>[]) => void;
}

const baseCatalogCategories = [
  "Printing",
  "Finishing",
  "Cutting",
  "Vinyl/Signs",
  "Booklets",
  "Proofing",
  "Delivery",
  "Outsourcing",
  "Scheduling"
];

const printSpecTemplates = [
  {
    code: "4/4",
    name: "4/4 full color - 2 sides",
    unit: "per finished piece",
    price: 0.13,
    notes: "Color front and color back. General fallback before product-specific tables."
  },
  {
    code: "4/1",
    name: "4/1 color front / black back - 2 sides",
    unit: "per finished piece",
    price: 0.09,
    notes: "Color front with black back."
  },
  {
    code: "4/0",
    name: "4/0 full color - 1 side",
    unit: "per finished piece",
    price: 0.07,
    notes: "Color one side only."
  },
  {
    code: "1/1",
    name: "1/1 black - 2 sides",
    unit: "per finished piece",
    price: 0.036,
    notes: "Black front and black back."
  },
  {
    code: "1/0",
    name: "1/0 black - 1 side",
    unit: "per finished piece",
    price: 0.018,
    notes: "Black one side only."
  }
] as const;

const regularPricingSteps = [
  {
    title: "1. Check product table",
    detail: "Business cards, envelopes, labels, invitations, copies, laminating, and other price-book products can use their own customer price tables first."
  },
  {
    title: "2. Use regular formula",
    detail: "If no product table matches, the estimate uses paper sheets + selected print click rate + finishing + $2 cutting."
  },
  {
    title: "3. Apply quantity curve",
    detail: "Small runs carry more setup. Larger runs interpolate down so 10,000 copies price cheaper per piece than 10 copies."
  }
] as const;

const quantityCurveNotes: Record<number, string> = {
  1: "walk-in minimum",
  50: "small run",
  100: "short run",
  250: "light production",
  500: "standard",
  1000: "baseline",
  2500: "good run",
  5000: "volume",
  10000: "best run"
};

type CatalogEditModal = "product" | "stock" | "price" | "machine";
type CatalogAddModal = CatalogEditModal;
type CatalogView = "rules" | "products" | "product-prices" | "paper" | "print" | "finishing" | "machines";

const finishingCategories = new Set([
  "Cutting",
  "Delivery",
  "Die Cut",
  "Finishing",
  "Folding",
  "Graphics",
  "Laminating",
  "Outsourcing",
  "Padding",
  "Proofing",
  "Scheduling",
  "Service"
]);

const finishingNameKeywords = [
  "bind",
  "crease",
  "cut",
  "delivery",
  "die",
  "drill",
  "fold",
  "laminate",
  "number",
  "pad",
  "perforat",
  "proof",
  "score",
  "service",
  "setup",
  "staple"
];

const catalogIntro: Record<CatalogView, { title: string; body: string; bullets: string[] }> = {
  rules: {
    title: "Estimator rules",
    body: "This is not a second price list. It explains the one order the estimator follows: product price table first, then paper + click rate + finishing + cuts, with quantity discounts applied automatically.",
    bullets: ["Product price tables win first", "Regular work uses stock, click rate, finishing, and cuts", "Quantity breaks interpolate instead of jumping"]
  },
  products: {
    title: "Products are job templates",
    body: "Use products for the presets that appear in New Estimate / Job. Products set defaults only; the selling rules live in Product Price Tables, paper, click rates, and finishing.",
    bullets: ["Finished size and default quantity", "Default paper type and print spec", "Default machine and finishing steps"]
  },
  "product-prices": {
    title: "Product price tables are special selling prices",
    body: "Use this when a product should sell by its own price book instead of raw paper and clicks. Business cards, envelopes, labels, invitations, copies, and special jobs belong here.",
    bullets: ["Business card and envelope tables", "Copies, labels, invitations, laminating", "Product table wins before regular formula"]
  },
  paper: {
    title: "Paper is the stock you actually buy and keep",
    body: "Keep one clean stock record for each useful parent sheet, not every vendor line. This is where parent size, stock type, cost, sell price, and inventory belong.",
    bullets: ["Parent sheet size", "Cover/text/wide-format pile rule", "Cost, sell price, supplier, inventory"]
  },
  print: {
    title: "Print click rates are the regular fallback",
    body: "Use this only for generic production click rates such as 4/4, 4/1, 4/0, 1/1, and 1/0. Product Price Tables can still override these when a job should be priced like a product.",
    bullets: ["4/4 color two sides", "4/1, 4/0, 1/1, 1/0", "Fallback when no product table matches"]
  },
  finishing: {
    title: "Finishing is shop work after printing",
    body: "Use this for cutting, scoring, folding, lamination, padding, drilling, numbering, delivery, proofing, and service charges.",
    bullets: ["Cutting stays $2 per actual cut", "Score, fold, laminate, pad, drill", "Delivery, proofing, and service add-ons"]
  },
  machines: {
    title: "Machines route production and time",
    body: "Machines help the job ticket know where it runs and how long it may take. They support costing, but they do not replace the product or print price tables.",
    bullets: ["Ricoh, large format, cutter/creaser", "Hourly shop rate", "Production notes and routing"]
  }
};

function withoutId<T extends { id: string }>(item: T): Omit<T, "id"> {
  const { id: _id, ...rest } = item;
  return rest;
}

function sidesFromColorSpec(colorSpec: string): 1 | 2 {
  return colorSpec.includes("/0") || colorSpec.includes("wide format") || colorSpec.includes("banner") ? 1 : 2;
}

function isFinishingPrice(price: CatalogPrice) {
  const category = price.category.trim();
  const name = price.name.toLowerCase();
  return finishingCategories.has(category) || finishingNameKeywords.some((keyword) => name.includes(keyword));
}

function printSpecCodeFor(price: CatalogPrice) {
  if (price.category.trim().toLowerCase() !== "printing") return undefined;

  const name = price.name.trim().toLowerCase();
  const unit = price.unit.trim().toLowerCase();
  const notes = price.notes.trim().toLowerCase();
  const text = `${name} ${unit} ${notes}`;
  const looksLikeClickRate =
    unit.includes("finished piece") ||
    unit.includes("click") ||
    name.includes("click") ||
    notes.includes("click rate") ||
    notes.includes("fallback") ||
    notes.includes("regular production");

  if (!looksLikeClickRate) return undefined;

  return printSpecTemplates.find((template) => text.includes(template.code) || name === template.name.toLowerCase())?.code;
}

export function Catalog({
  paperStocks,
  productCategories,
  productPresets,
  prices,
  machines,
  quantityRateCurve = QUANTITY_RATE_CURVE,
  onUpdateQuantityRateCurve,
  onAddProductCategory,
  onRenameProductCategory,
  onRemoveProductCategory,
  onAddProductPreset,
  onUpdateProductPreset,
  onRemoveProductPreset,
  onAddPaperStock,
  onUpdatePaperStock,
  onRemovePaperStock,
  onAddCatalogPrice,
  onUpdateCatalogPrice,
  onRemoveCatalogPrice,
  onAddMachine,
  onUpdateMachine,
  onRemoveMachine,
  onImportPaper,
  onImportCatalog
}: CatalogProps) {
  const [view, setView] = useState<CatalogView>("rules");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedStockId, setSelectedStockId] = useState("");
  const [selectedPriceId, setSelectedPriceId] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [catalogModal, setCatalogModal] = useState<CatalogEditModal | null>(null);
  const [addModal, setAddModal] = useState<CatalogAddModal | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [customCatalogCategories, setCustomCatalogCategories] = useState<string[]>([]);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [newProductCategoryName, setNewProductCategoryName] = useState("");
  const [newPriceCategoryName, setNewPriceCategoryName] = useState("");
  const [categoryRenameDrafts, setCategoryRenameDrafts] = useState<Record<string, string>>({});
  const [categoryNotice, setCategoryNotice] = useState("");
  const [stockForm, setStockForm] = useState<Omit<PaperStock, "id">>({
    name: "",
    kind: "cover",
    inventoryCategory: "Paper Stock",
    sheetWidth: 13,
    sheetHeight: 19,
    costPerSheet: 0,
    sellPerSheet: 0,
    inventorySheets: 0,
    productCategories: []
  });
  const [priceForm, setPriceForm] = useState<Omit<CatalogPrice, "id">>({
    category: "Printing",
    name: "",
    unit: "side",
    price: 0,
    notes: ""
  });
  const [machineForm, setMachineForm] = useState<Omit<Machine, "id">>({
    name: "",
    type: "Digital press",
    hourlyRate: 0,
    notes: ""
  });
  const [priceSearch, setPriceSearch] = useState("");
  const [productForm, setProductForm] = useState<Omit<ProductPreset, "id">>({
    category: "Business Cards",
    name: "",
    quantity: 1000,
    width: 3.5,
    height: 2,
    sides: 2,
    colorSpec: "4/4 full color",
    stockKind: "cover",
    bindery: ["Cut to size"],
    impositionPreset: "auto",
    machine: "Ricoh Pro C7200",
    notes: ""
  });
  const [stockSearch, setStockSearch] = useState("");
  const [stockKind, setStockKind] = useState<"all" | PaperStock["kind"]>("all");
  const [stockCategory, setStockCategory] = useState("all");
  const selectedProduct = productPresets.find((preset) => preset.id === selectedProductId);
  const selectedStock = paperStocks.find((stock) => stock.id === selectedStockId);
  const selectedPrice = prices.find((price) => price.id === selectedPriceId);
  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId);
  const [productEdit, setProductEdit] = useState<Omit<ProductPreset, "id"> | undefined>(selectedProduct ? withoutId(selectedProduct) : undefined);
  const [stockEdit, setStockEdit] = useState<Omit<PaperStock, "id"> | undefined>(selectedStock ? withoutId(selectedStock) : undefined);
  const [priceEdit, setPriceEdit] = useState<Omit<CatalogPrice, "id"> | undefined>(selectedPrice ? withoutId(selectedPrice) : undefined);
  const [machineEdit, setMachineEdit] = useState<Omit<Machine, "id"> | undefined>(selectedMachine ? withoutId(selectedMachine) : undefined);

  useEffect(() => {
    setPriceSearch("");
  }, [view]);

  const productCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...productCategories,
          ...productPresets.map((preset) => preset.category),
          ...paperStocks.flatMap((stock) => stock.productCategories ?? [])
        ].filter(Boolean))
      ).sort(),
    [paperStocks, productCategories, productPresets]
  );
  const priceCategories = useMemo(
    () => Array.from(new Set([...baseCatalogCategories, ...customCatalogCategories, ...prices.map((price) => price.category)].filter(Boolean))).sort(),
    [customCatalogCategories, prices]
  );
  const productCategoryRows = useMemo(
    () =>
      productCategoryOptions.map((category) => ({
        category,
        productCount: productPresets.filter((preset) => preset.category === category).length,
        stockCount: paperStocks.filter((stock) => stock.productCategories?.includes(category)).length
      })),
    [paperStocks, productCategoryOptions, productPresets]
  );
  const priceCategoryRows = useMemo(
    () =>
      priceCategories.map((category) => ({
        category,
        priceCount: prices.filter((price) => price.category === category).length,
        system: baseCatalogCategories.includes(category)
      })),
    [priceCategories, prices]
  );
  const stockCategories = useMemo(
    () => Array.from(new Set(paperStocks.map((stock) => stock.inventoryCategory).filter(Boolean) as string[])).sort(),
    [paperStocks]
  );
  const filteredPaperStocks = useMemo(() => {
    const search = stockSearch.trim().toLowerCase();
    return paperStocks.filter((stock) => {
      const haystack = [
        stock.name,
        stock.kind,
        stock.inventoryCategory,
        stock.supplier,
        stock.invoiceNumber,
        stock.productCategories?.join(" "),
        `${stock.sheetWidth}x${stock.sheetHeight}`
      ].join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesKind = stockKind === "all" || stock.kind === stockKind;
      const matchesCategory = stockCategory === "all" || stock.inventoryCategory === stockCategory;
      return matchesSearch && matchesKind && matchesCategory;
    });
  }, [paperStocks, stockCategory, stockKind, stockSearch]);
  const visiblePaperStocks = filteredPaperStocks.slice(0, 35);
  const remainingPaperCount = Math.max(filteredPaperStocks.length - visiblePaperStocks.length, 0);
  const finishingPrices = useMemo(() => prices.filter(isFinishingPrice), [prices]);
  const printPrices = useMemo(() => prices.filter((price) => !isFinishingPrice(price)), [prices]);
  const printSpecRows = useMemo(
    () =>
      printSpecTemplates.map((template) => ({
        ...template,
        priceRecord: printPrices.find((price) => printSpecCodeFor(price) === template.code)
      })),
    [printPrices]
  );
  const formulaPrintPrices = useMemo(() => printPrices.filter((price) => Boolean(printSpecCodeFor(price))), [printPrices]);
  const specialProductPrices = useMemo(() => printPrices.filter((price) => !printSpecCodeFor(price)), [printPrices]);
  const minimumCharge = useMemo(() => {
    const minimumRecord =
      prices.find((price) => `${price.category} ${price.name}`.toLowerCase().includes("minimum service charge")) ??
      prices.find((price) => price.category.toLowerCase() === "service" && price.name.toLowerCase().includes("minimum"));
    return minimumRecord?.price ?? 20;
  }, [prices]);
  const averagePaperMarkup = useMemo(() => {
    const ratios = paperStocks
      .filter((stock) => stock.costPerSheet > 0 && stock.sellPerSheet > 0)
      .map((stock) => stock.sellPerSheet / stock.costPerSheet);
    if (!ratios.length) return 0;
    return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  }, [paperStocks]);
  const setupHealthCards = [
    {
      label: "Product price tables",
      value: specialProductPrices.length,
      note: "Business cards, copies, labels, envelopes, invitations, signs"
    },
    {
      label: "Formula click rates",
      value: formulaPrintPrices.length,
      note: "4/4, 4/1, 4/0, 1/1, 1/0 formula rates"
    },
    {
      label: "Paper inventory",
      value: paperStocks.length,
      note: "Parent sheets, cost, sell price, inventory"
    },
    {
      label: "Finishing rules",
      value: finishingPrices.length,
      note: "Cutting, folding, scoring, lamination, padding, delivery"
    }
  ];
  const visibleCatalogPrices =
    view === "finishing"
      ? finishingPrices
      : view === "print"
        ? formulaPrintPrices
        : view === "product-prices"
          ? specialProductPrices
          : [];
  const searchedCatalogPrices = useMemo(() => {
    const search = priceSearch.trim().toLowerCase();
    if (!search) return visibleCatalogPrices;
    return visibleCatalogPrices.filter((price) =>
      [price.category, price.name, price.unit, price.notes, String(price.price)].join(" ").toLowerCase().includes(search)
    );
  }, [priceSearch, visibleCatalogPrices]);
  const activeIntro = catalogIntro[view];
  const activeQuantityCurve = quantityRateCurve.length ? quantityRateCurve : QUANTITY_RATE_CURVE;
  const isPriceView = view === "product-prices" || view === "print" || view === "finishing";
  const priceAddTitle =
    view === "finishing" ? "Add finishing price" : view === "print" ? "Add click rate" : "Add product price";
  const priceAddSubtitle =
    view === "finishing"
      ? "Add cutting, folding, lamination, delivery, or other shop work."
      : view === "print"
        ? "Add one regular fallback click rate such as 4/4, 4/1, 4/0, 1/1, or 1/0."
        : "Add a customer-facing product price table for business cards, envelopes, labels, invitations, copies, or special products.";
  const priceTableTitle =
    view === "finishing" ? "Finishing prices" : view === "print" ? "Click rate records" : "Product price tables";
  const priceTableSubtitle =
    view === "finishing"
      ? "Shop work after printing: cutting, folding, scoring, lamination, delivery, proofing, and service."
      : view === "print"
        ? "Only the generic fallback click rates are listed here. Product-specific selling prices are kept in Product Price Tables."
        : "Special product selling tables are listed here. These can override paper and click-rate formula pricing.";
  const priceSearchPlaceholder =
    view === "finishing"
      ? "Cutting, lamination, folding..."
      : view === "print"
        ? "4/4, 4/1, 4/0, 1/1, 1/0..."
        : "Business cards, envelopes, labels, copies...";
  const activeAddLabel =
    view === "rules"
      ? "Add product price"
      : view === "products"
      ? "Add product"
      : view === "product-prices"
        ? "Add product price"
      : view === "paper"
        ? "Add paper stock"
        : view === "print"
          ? "Add click rate"
          : view === "finishing"
            ? "Add finishing price"
            : "Add machine";
  const catalogTabs: Array<{ id: CatalogView; label: string; count: number; summary: string }> = [
    { id: "rules", label: "Estimator rules", count: activeQuantityCurve.length, summary: "Calculator order and curves" },
    { id: "products", label: "Products", count: productPresets.length, summary: "Templates used in estimates" },
    { id: "product-prices", label: "Product Price Tables", count: specialProductPrices.length, summary: "Special selling prices" },
    { id: "paper", label: "Paper Inventory", count: paperStocks.length, summary: "Parent sheets and inventory" },
    { id: "print", label: "Formula Click Rates", count: formulaPrintPrices.length, summary: "4/4, 4/1, 4/0, 1/1, 1/0" },
    { id: "finishing", label: "Finishing Rules", count: finishingPrices.length, summary: "Cut, fold, score, laminate" },
    { id: "machines", label: "Machines", count: machines.length, summary: "Routing and shop time" }
  ];

  useEffect(() => {
    setProductEdit(selectedProduct ? withoutId(selectedProduct) : undefined);
  }, [selectedProduct]);

  useEffect(() => {
    setStockEdit(selectedStock ? withoutId(selectedStock) : undefined);
  }, [selectedStock]);

  useEffect(() => {
    setPriceEdit(selectedPrice ? withoutId(selectedPrice) : undefined);
  }, [selectedPrice]);

  useEffect(() => {
    setMachineEdit(selectedMachine ? withoutId(selectedMachine) : undefined);
  }, [selectedMachine]);

  function categoryDraftKey(kind: "product" | "price", category: string) {
    return `${kind}:${category}`;
  }

  function setCategoryDraft(kind: "product" | "price", category: string, value: string) {
    setCategoryRenameDrafts((current) => ({ ...current, [categoryDraftKey(kind, category)]: value }));
  }

  function categoryDraft(kind: "product" | "price", category: string) {
    return categoryRenameDrafts[categoryDraftKey(kind, category)] ?? category;
  }

  function addProductCategoryFromManager() {
    const category = newProductCategoryName.trim();
    if (!category) return;
    if (productCategoryOptions.some((item) => item.toLowerCase() === category.toLowerCase())) {
      setCategoryNotice(`${category} already exists.`);
      return;
    }
    onAddProductCategory(category);
    setProductForm((current) => ({ ...current, category }));
    setNewProductCategoryName("");
    setCategoryNotice(`${category} added to product categories.`);
  }

  function addPriceCategoryFromManager() {
    const category = newPriceCategoryName.trim();
    if (!category) return;
    if (priceCategories.some((item) => item.toLowerCase() === category.toLowerCase())) {
      setCategoryNotice(`${category} already exists.`);
      return;
    }
    setCustomCatalogCategories((current) => [...current, category]);
    setPriceForm((current) => ({ ...current, category }));
    setNewPriceCategoryName("");
    setCategoryNotice(`${category} added to pricing categories.`);
  }

  function renameProductCategoryFromManager(oldCategory: string) {
    const nextCategory = categoryDraft("product", oldCategory).trim();
    if (!nextCategory || nextCategory === oldCategory) return;
    if (productCategoryOptions.some((item) => item !== oldCategory && item.toLowerCase() === nextCategory.toLowerCase())) {
      setCategoryNotice(`${nextCategory} already exists.`);
      return;
    }
    onRenameProductCategory(oldCategory, nextCategory);
    setProductForm((current) => (current.category === oldCategory ? { ...current, category: nextCategory } : current));
    setProductEdit((current) => (current?.category === oldCategory ? { ...current, category: nextCategory } : current));
    setStockForm((current) => ({
      ...current,
      productCategories: current.productCategories?.map((category) => (category === oldCategory ? nextCategory : category))
    }));
    setStockEdit((current) =>
      current
        ? {
            ...current,
            productCategories: current.productCategories?.map((category) => (category === oldCategory ? nextCategory : category))
          }
        : current
    );
    setCategoryRenameDrafts((current) => {
      const { [categoryDraftKey("product", oldCategory)]: _removed, ...rest } = current;
      return rest;
    });
    setCategoryNotice(`${oldCategory} renamed to ${nextCategory}.`);
  }

  function removeProductCategoryFromManager(category: string) {
    const row = productCategoryRows.find((item) => item.category === category);
    const usedCount = (row?.productCount ?? 0) + (row?.stockCount ?? 0);
    if (usedCount > 0) {
      setCategoryNotice(`${category} is used by ${usedCount} records. Move or rename those records first.`);
      return;
    }
    onRemoveProductCategory(category);
    setCategoryRenameDrafts((current) => {
      const { [categoryDraftKey("product", category)]: _removed, ...rest } = current;
      return rest;
    });
    setCategoryNotice(`${category} deleted.`);
  }

  function renamePriceCategoryFromManager(oldCategory: string) {
    const nextCategory = categoryDraft("price", oldCategory).trim();
    if (!nextCategory || nextCategory === oldCategory) return;
    if (priceCategories.some((item) => item !== oldCategory && item.toLowerCase() === nextCategory.toLowerCase())) {
      setCategoryNotice(`${nextCategory} already exists.`);
      return;
    }
    prices
      .filter((price) => price.category === oldCategory)
      .forEach((price) => onUpdateCatalogPrice(price.id, { ...withoutId(price), category: nextCategory }));
    setCustomCatalogCategories((current) => Array.from(new Set(current.map((category) => (category === oldCategory ? nextCategory : category)))));
    setPriceForm((current) => (current.category === oldCategory ? { ...current, category: nextCategory } : current));
    setPriceEdit((current) => (current?.category === oldCategory ? { ...current, category: nextCategory } : current));
    setCategoryRenameDrafts((current) => {
      const { [categoryDraftKey("price", oldCategory)]: _removed, ...rest } = current;
      return rest;
    });
    setCategoryNotice(`${oldCategory} renamed to ${nextCategory}.`);
  }

  function removePriceCategoryFromManager(category: string) {
    const row = priceCategoryRows.find((item) => item.category === category);
    if (row?.system) {
      setCategoryNotice(`${category} is a default pricing category, so it stays available.`);
      return;
    }
    if ((row?.priceCount ?? 0) > 0) {
      setCategoryNotice(`${category} has pricing items. Move or rename those prices first.`);
      return;
    }
    setCustomCatalogCategories((current) => current.filter((item) => item !== category));
    setCategoryRenameDrafts((current) => {
      const { [categoryDraftKey("price", category)]: _removed, ...rest } = current;
      return rest;
    });
    setCategoryNotice(`${category} deleted.`);
  }

  function openAddModal(modal: CatalogAddModal) {
    if (modal === "product") setView("products");
    if (modal === "stock") setView("paper");
    if (modal === "price" && !["product-prices", "print", "finishing"].includes(view)) setView("product-prices");
    if (modal === "machine") setView("machines");
    setAddModal(modal);
  }

  function openActiveAddModal() {
    if (view === "paper") {
      openAddModal("stock");
      return;
    }
    if (view === "machines") {
      openAddModal("machine");
      return;
    }
    if (view === "product-prices" || view === "print" || view === "finishing" || view === "rules") {
      setPriceForm((current) => ({
        ...current,
        category: view === "finishing" ? "Finishing" : view === "print" ? "Printing" : "Business Cards",
        unit: view === "print" ? "per finished piece" : view === "product-prices" || view === "rules" ? "1000 cards" : current.unit
      }));
      openAddModal("price");
      return;
    }
    openAddModal("product");
  }

  function confirmRemove(label: string, remove: () => void) {
    if (window.confirm(`Remove "${label}" from the active catalog? Existing jobs and history will stay saved.`)) {
      remove();
    }
  }

  function removeSelectedProduct() {
    if (!selectedProduct) return;
    confirmRemove(selectedProduct.name, () => {
      onRemoveProductPreset(selectedProduct.id);
      setCatalogModal(null);
      setSelectedProductId("");
    });
  }

  function removeSelectedStock() {
    if (!selectedStock) return;
    confirmRemove(selectedStock.name, () => {
      onRemovePaperStock(selectedStock.id);
      setCatalogModal(null);
      setSelectedStockId("");
    });
  }

  function removeSelectedPrice() {
    if (!selectedPrice) return;
    confirmRemove(selectedPrice.name, () => {
      onRemoveCatalogPrice(selectedPrice.id);
      setCatalogModal(null);
      setSelectedPriceId("");
    });
  }

  function normalizePriceEdit(price: Omit<CatalogPrice, "id">) {
    return {
      category: price.category.trim() || "Printing",
      name: price.name.trim(),
      unit: price.unit.trim() || "job",
      price: Number.isFinite(price.price) ? Math.max(0, price.price) : 0,
      notes: price.notes.trim()
    };
  }

  function saveSelectedPrice() {
    if (!selectedPrice || !priceEdit?.name.trim()) return;
    onUpdateCatalogPrice(selectedPrice.id, normalizePriceEdit(priceEdit));
    setCatalogModal(null);
  }

  function removeSelectedMachine() {
    if (!selectedMachine) return;
    confirmRemove(selectedMachine.name, () => {
      onRemoveMachine(selectedMachine.id);
      setCatalogModal(null);
      setSelectedMachineId("");
    });
  }

  function openPrintSpecPrice(template: (typeof printSpecTemplates)[number]) {
    const existingPrice = printPrices.find((price) => printSpecCodeFor(price) === template.code);
    if (existingPrice) {
      setSelectedPriceId(existingPrice.id);
      setCatalogModal("price");
      return;
    }

    setPriceForm({
      category: "Printing",
      name: template.name,
      unit: template.unit,
      price: template.price,
      notes: template.notes
    });
    setView("print");
    setAddModal("price");
  }

  function toggleProductCategory(stock: Omit<PaperStock, "id">, category: string) {
    const current = stock.productCategories ?? [];
    return current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category];
  }

  function addProductPreset() {
    if (!productForm.name.trim()) return;
    onAddProductPreset({ ...productForm, name: productForm.name.trim() });
    setProductForm((current) => ({ ...current, name: "", notes: "" }));
    setAddModal(null);
  }

  function addPaperStock() {
    if (!stockForm.name.trim()) return;
    onAddPaperStock(stockForm);
    setStockForm({
      name: "",
      kind: "cover",
      inventoryCategory: "Paper Stock",
      sheetWidth: 13,
      sheetHeight: 19,
      costPerSheet: 0,
      sellPerSheet: 0,
      inventorySheets: 0,
      productCategories: []
    });
    setAddModal(null);
  }

  function addPricingItem() {
    if (!priceForm.name.trim()) return;
    onAddCatalogPrice(normalizePriceEdit(priceForm));
    setPriceForm({
      category: view === "finishing" ? "Finishing" : view === "print" ? "Printing" : "Business Cards",
      name: "",
      unit: view === "print" ? "per finished piece" : view === "product-prices" ? "1000 cards" : "side",
      price: 0,
      notes: ""
    });
    setAddModal(null);
  }

  function addMachineItem() {
    if (!machineForm.name.trim()) return;
    onAddMachine(machineForm);
    setMachineForm({ name: "", type: "Digital press", hourlyRate: 0, notes: "" });
    setAddModal(null);
  }

  function updateQuantityCurvePoint(quantity: number, multiplierText: string) {
    const rawValue = Number(multiplierText);
    if (!Number.isFinite(rawValue) || rawValue <= 0) return;
    const multiplier = rawValue > 10 ? rawValue / 100 : rawValue;
    const cleanedMultiplier = Math.round(Math.min(9.99, Math.max(0.01, multiplier)) * 100) / 100;
    onUpdateQuantityRateCurve?.(
      activeQuantityCurve.map((point) => (point.quantity === quantity ? { ...point, multiplier: cleanedMultiplier } : point))
    );
  }

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Catalog / Estimator</p>
          <h1>Estimator setup</h1>
        </div>
        <div className="toolbar-actions">
          <button className="icon-button" type="button" onClick={() => setCategoryManagerOpen(true)}>
            <ListTree size={16} />
            Categories
          </button>
          <button className="primary-button" type="button" onClick={openActiveAddModal}>
            <Plus size={16} />
            {activeAddLabel}
          </button>
          <ImportExportToolbar
            label="Catalog Pricing"
            filename="gross-printing-catalog-pricing.xlsx"
            rows={prices as unknown as Record<string, unknown>[]}
            onImport={onImportCatalog}
          />
        </div>
      </div>

      <section className="panel catalog-tab-bar">
        <div className="catalog-tab-grid">
          {catalogTabs.map((tab) => (
            <button className={view === tab.id ? "active" : ""} type="button" key={tab.id} onClick={() => setView(tab.id)}>
              <span>{tab.count}</span>
              <strong>{tab.label}</strong>
              <small>{tab.summary}</small>
            </button>
          ))}
        </div>
      </section>

      <section className={`panel catalog-command-strip ${helpOpen ? "open" : ""}`}>
        <div className="catalog-command-main">
          <span>{activeIntro.title}</span>
          <p>{activeIntro.body}</p>
        </div>
        <button className="icon-button" type="button" onClick={() => setHelpOpen((open) => !open)}>
          {helpOpen ? "Hide guide" : "How it works"}
        </button>
        {helpOpen ? (
          <div className="catalog-command-details">
            <div className="catalog-rule-list">
              {activeIntro.bullets.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="pricing-engine-strip compact">
              {regularPricingSteps.map((step) => (
                <div key={step.title}>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {categoryManagerOpen ? (
        <RecordModal
          title="Manage categories"
          subtitle="Add, rename, or remove unused categories without opening each product one by one."
          onClose={() => setCategoryManagerOpen(false)}
          className="wide"
        >
          <div className="category-manager-grid">
            <section className="category-manager-panel">
              <div className="category-manager-heading">
                <div>
                  <h3>Product categories</h3>
                  <p>These appear in New Estimate / Job and product presets.</p>
                </div>
                <span>{productCategoryRows.length}</span>
              </div>
              <div className="category-add-row">
                <input
                  value={newProductCategoryName}
                  onChange={(event) => setNewProductCategoryName(event.target.value)}
                  placeholder="Menus, Mailers, Magnets..."
                />
                <button className="primary-button" type="button" onClick={addProductCategoryFromManager} disabled={!newProductCategoryName.trim()}>
                  <Plus size={16} />
                  Add
                </button>
              </div>
              <div className="category-list">
                {productCategoryRows.map((row) => {
                  const draft = categoryDraft("product", row.category);
                  const usedCount = row.productCount + row.stockCount;
                  return (
                    <div className="category-row" key={row.category}>
                      <div className="category-row-main">
                        <input
                          value={draft}
                          onChange={(event) => setCategoryDraft("product", row.category, event.target.value)}
                          aria-label={`Rename ${row.category}`}
                        />
                        <div className="category-counts">
                          <span>{row.productCount} products</span>
                          <span>{row.stockCount} stock links</span>
                        </div>
                      </div>
                      <div className="category-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => renameProductCategoryFromManager(row.category)}
                          disabled={!draft.trim() || draft.trim() === row.category}
                        >
                          Rename
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => removeProductCategoryFromManager(row.category)}
                          disabled={usedCount > 0}
                          title={usedCount > 0 ? "Move or rename linked records before deleting." : "Delete unused category"}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="category-manager-panel">
              <div className="category-manager-heading">
                <div>
                  <h3>Pricing categories</h3>
                  <p>These organize printing, finishing, delivery, and shop charges.</p>
                </div>
                <span>{priceCategoryRows.length}</span>
              </div>
              <div className="category-add-row">
                <input
                  value={newPriceCategoryName}
                  onChange={(event) => setNewPriceCategoryName(event.target.value)}
                  placeholder="Mailing, Proofing, Bindery..."
                />
                <button className="primary-button" type="button" onClick={addPriceCategoryFromManager} disabled={!newPriceCategoryName.trim()}>
                  <Plus size={16} />
                  Add
                </button>
              </div>
              <div className="category-list">
                {priceCategoryRows.map((row) => {
                  const draft = categoryDraft("price", row.category);
                  return (
                    <div className="category-row" key={row.category}>
                      <div className="category-row-main">
                        <input
                          value={draft}
                          onChange={(event) => setCategoryDraft("price", row.category, event.target.value)}
                          aria-label={`Rename ${row.category}`}
                        />
                        <div className="category-counts">
                          <span>{row.priceCount} prices</span>
                          {row.system ? <span>default</span> : <span>custom</span>}
                        </div>
                      </div>
                      <div className="category-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => renamePriceCategoryFromManager(row.category)}
                          disabled={!draft.trim() || draft.trim() === row.category}
                        >
                          Rename
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => removePriceCategoryFromManager(row.category)}
                          disabled={row.system || row.priceCount > 0}
                          title={row.system ? "Default pricing categories stay available." : row.priceCount > 0 ? "Move or rename prices before deleting." : "Delete unused category"}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          {categoryNotice ? <p className="category-manager-notice">{categoryNotice}</p> : null}
        </RecordModal>
      ) : null}

      {addModal === "product" ? (
        <RecordModal title="Add product preset" subtitle="This product will appear in New Estimate / Job." onClose={() => setAddModal(null)} className="wide">
          <div className="field-grid four">
            <label>
              Product name
              <input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} placeholder="Business Cards 3.5 x 2 - 2 Sides" />
            </label>
            <label>
              Category
              <select value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}>
                {productCategoryOptions.map((category) => (
                  <option value={category} key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input type="number" min="1" value={productForm.quantity} onChange={(event) => setProductForm({ ...productForm, quantity: Number(event.target.value) })} />
            </label>
            <label>
              Machine
              <select value={productForm.machine} onChange={(event) => setProductForm({ ...productForm, machine: event.target.value })}>
                {machines.map((machine) => (
                  <option value={machine.name} key={machine.id}>{machine.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-grid four">
            <label>
              Finished width
              <input type="number" min="0.1" step="0.125" value={productForm.width} onChange={(event) => setProductForm({ ...productForm, width: Number(event.target.value) })} />
            </label>
            <label>
              Finished height
              <input type="number" min="0.1" step="0.125" value={productForm.height} onChange={(event) => setProductForm({ ...productForm, height: Number(event.target.value) })} />
            </label>
            <label>
              Print spec
              <select
                value={productForm.colorSpec}
                onChange={(event) => {
                  const colorSpec = event.target.value;
                  setProductForm({ ...productForm, colorSpec, sides: sidesFromColorSpec(colorSpec) });
                }}
              >
                <option value="4/4 full color">4/4 full color - 2 sides</option>
                <option value="4/1 color">4/1 color front / black back - 2 sides</option>
                <option value="4/0 full color">4/0 full color - 1 side</option>
                <option value="1/1 black">1/1 black - 2 sides</option>
                <option value="1/0 black">1/0 black - 1 side</option>
                <option value="Full color wide format">Full color wide format</option>
              </select>
            </label>
            <label>
              Stock type
              <select value={productForm.stockKind} onChange={(event) => setProductForm({ ...productForm, stockKind: event.target.value as ProductPreset["stockKind"] })}>
                <option value="cover">Cover/cardstock</option>
                <option value="text">Text</option>
                <option value="wide-format">Wide-format</option>
                <option value="specialty">Specialty</option>
              </select>
            </label>
          </div>
          <div className="field-grid two">
            <label>
              Finishing
              <input
                value={productForm.bindery.join(", ")}
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    bindery: event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                  })
                }
                placeholder="Cut to size, Box by set"
              />
            </label>
            <label>
              Notes
              <input value={productForm.notes} onChange={(event) => setProductForm({ ...productForm, notes: event.target.value })} placeholder="Centered run, envelope setup, label stock..." />
            </label>
          </div>
          <button className="primary-button full" type="button" disabled={!productForm.name.trim()} onClick={addProductPreset}>
            <Plus size={16} />
            Add product
          </button>
        </RecordModal>
      ) : null}

      {addModal === "stock" ? (
        <RecordModal title="Add paper stock" subtitle="Add parent sheet, cost, sell price, and where this stock is used." onClose={() => setAddModal(null)} className="wide">
          <div className="field-grid four">
            <label>
              Stock name
              <input value={stockForm.name} onChange={(event) => setStockForm({ ...stockForm, name: event.target.value })} placeholder="14pt C2S - 12x18" />
            </label>
            <label>
              Kind
              <select value={stockForm.kind} onChange={(event) => setStockForm({ ...stockForm, kind: event.target.value as PaperStock["kind"] })}>
                <option value="cover">Cover/cardstock</option>
                <option value="text">Text</option>
                <option value="wide-format">Wide-format</option>
                <option value="specialty">Specialty</option>
              </select>
            </label>
            <label>
              Category
              <input value={stockForm.inventoryCategory ?? ""} onChange={(event) => setStockForm({ ...stockForm, inventoryCategory: event.target.value })} placeholder="Paper Stock" />
            </label>
            <label>
              Inventory sheets
              <input type="number" min="0" value={stockForm.inventorySheets} onChange={(event) => setStockForm({ ...stockForm, inventorySheets: Number(event.target.value) })} />
            </label>
          </div>
          <div className="field-grid four">
            <label>
              Sheet width
              <input type="number" min="0.1" step="0.125" value={stockForm.sheetWidth} onChange={(event) => setStockForm({ ...stockForm, sheetWidth: Number(event.target.value) })} />
            </label>
            <label>
              Sheet height
              <input type="number" min="0.1" step="0.125" value={stockForm.sheetHeight} onChange={(event) => setStockForm({ ...stockForm, sheetHeight: Number(event.target.value) })} />
            </label>
            <label>
              Cost / sheet
              <input type="number" min="0" step="0.01" value={stockForm.costPerSheet} onChange={(event) => setStockForm({ ...stockForm, costPerSheet: Number(event.target.value) })} />
            </label>
            <label>
              Sell / sheet
              <input type="number" min="0" step="0.01" value={stockForm.sellPerSheet} onChange={(event) => setStockForm({ ...stockForm, sellPerSheet: Number(event.target.value) })} />
            </label>
          </div>
          <div>
            <p className="field-help">Use this stock for product categories</p>
            <div className="check-grid">
              {productCategoryOptions.map((category) => (
                <label className="checkbox-pill" key={category}>
                  <input
                    type="checkbox"
                    checked={stockForm.productCategories?.includes(category) ?? false}
                    onChange={() => setStockForm({ ...stockForm, productCategories: toggleProductCategory(stockForm, category) })}
                  />
                  {category}
                </label>
              ))}
            </div>
          </div>
          <button className="primary-button full" type="button" disabled={!stockForm.name.trim()} onClick={addPaperStock}>
            <Plus size={16} />
            Add stock
          </button>
        </RecordModal>
      ) : null}

      {addModal === "price" ? (
        <RecordModal
          title={priceAddTitle}
          subtitle={priceAddSubtitle}
          onClose={() => setAddModal(null)}
        >
          <div className="field-grid two">
            <label>
              Category
              <select value={priceForm.category} onChange={(event) => setPriceForm({ ...priceForm, category: event.target.value })}>
                {priceCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label>
              Item name
              <input value={priceForm.name} onChange={(event) => setPriceForm({ ...priceForm, name: event.target.value })} placeholder="Proof approval, barcode scan, delivery..." />
            </label>
            <label>
              Unit
              <input value={priceForm.unit} onChange={(event) => setPriceForm({ ...priceForm, unit: event.target.value })} />
            </label>
            <label>
              Price
              <input type="number" min="0" step="0.01" value={priceForm.price} onChange={(event) => setPriceForm({ ...priceForm, price: Number(event.target.value) })} />
            </label>
          </div>
          <label>
            Notes
            <input value={priceForm.notes} onChange={(event) => setPriceForm({ ...priceForm, notes: event.target.value })} />
          </label>
          <button className="primary-button full" type="button" disabled={!priceForm.name.trim()} onClick={addPricingItem}>
            <Plus size={16} />
            Add price
          </button>
        </RecordModal>
      ) : null}

      {addModal === "machine" ? (
        <RecordModal title="Add machine" subtitle="Add presses, cutters, bindery, and wide-format equipment." onClose={() => setAddModal(null)}>
          <div className="field-grid two">
            <label>
              Machine name
              <input value={machineForm.name} onChange={(event) => setMachineForm({ ...machineForm, name: event.target.value })} placeholder="Folder, press, cutter..." />
            </label>
            <label>
              Type
              <input value={machineForm.type} onChange={(event) => setMachineForm({ ...machineForm, type: event.target.value })} />
            </label>
            <label>
              Hourly rate
              <input type="number" min="0" step="0.01" value={machineForm.hourlyRate} onChange={(event) => setMachineForm({ ...machineForm, hourlyRate: Number(event.target.value) })} />
            </label>
          </div>
          <label>
            Notes
            <input value={machineForm.notes} onChange={(event) => setMachineForm({ ...machineForm, notes: event.target.value })} />
          </label>
          <button className="primary-button full" type="button" disabled={!machineForm.name.trim()} onClick={addMachineItem}>
            <Plus size={16} />
            Add machine
          </button>
        </RecordModal>
      ) : null}

      {view === "rules" ? (
        <div className="catalog-detail-grid">
          <section className="panel catalog-rule-dashboard">
            <div className="panel-heading">
              <div>
                <h2>Setup status</h2>
                <span>The records feeding the estimator today.</span>
              </div>
              <Database size={18} />
            </div>
            <div className="catalog-health-grid">
              {setupHealthCards.map((card) => (
                <div className="catalog-health-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value.toLocaleString()}</strong>
                  <small>{card.note}</small>
                </div>
              ))}
              <div className="catalog-health-card accent">
                <span>Minimum charge</span>
                <strong>{formatMoney(minimumCharge)}</strong>
                <small>Applied when regular formula work is below shop minimum.</small>
              </div>
              <div className="catalog-health-card accent">
                <span>Avg. stock markup</span>
                <strong>{averagePaperMarkup ? `${averagePaperMarkup.toFixed(2)}x` : "Not set"}</strong>
                <small>Sell price divided by cost for stocks with both values.</small>
              </div>
            </div>
          </section>

          <section className="panel quantity-curve-panel">
            <div className="panel-heading">
              <div>
                <h2>Quantity discount curve</h2>
                <span>The estimator interpolates between these points. A 700 run does not use the same price as 500 or 1,000; it lands between them.</span>
              </div>
              <Percent size={18} />
            </div>
            <p className="quantity-curve-help">Type a multiplier or percent. 1.50 and 150 both mean 150% / 1.5x. 0.86 and 86 both mean 86% of the base rate.</p>
            <div className="quantity-curve-examples" aria-label="Quantity multiplier examples">
              <span><b>1.50x</b> adds 50%</span>
              <span><b>1.00x</b> regular price</span>
              <span><b>0.86x</b> 14% cheaper</span>
            </div>
            <div className="quantity-curve-table">
              {activeQuantityCurve.map((point) => (
                <div key={point.quantity}>
                  <strong>{point.quantity.toLocaleString()}</strong>
                  <label className="quantity-curve-edit-row">
                    <input
                      type="number"
                      min="0.01"
                      max="999"
                      step="0.01"
                      value={point.multiplier}
                      onChange={(event) => updateQuantityCurvePoint(point.quantity, event.target.value)}
                      aria-label={`${point.quantity.toLocaleString()} quantity multiplier`}
                    />
                    <span>x</span>
                  </label>
                  <small>{quantityCurveNotes[point.quantity] ?? "interpolated point"}</small>
                </div>
              ))}
            </div>
          </section>

        </div>
      ) : null}

      {view === "products" ? (
        <div className="catalog-detail-grid">
          <section className="panel table-panel">
          <div className="panel-heading">
            <div>
              <h2>Product presets</h2>
              <span>Add products here; they appear in New Estimate / Job. Click a row to edit.</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Finished size</th>
                <th>Qty</th>
                <th>Print spec</th>
                <th>Stock type</th>
                <th>Machine</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {productPresets.map((preset) => (
                <tr
                  className={preset.id === selectedProduct?.id ? "selected-row" : ""}
                  key={preset.id}
                  onClick={() => {
                    setSelectedProductId(preset.id);
                    setCatalogModal("product");
                  }}
                >
                  <td>
                    <strong>{preset.name}</strong>
                    <span>{preset.notes}</span>
                  </td>
                  <td>{preset.category}</td>
                  <td>{preset.width}x{preset.height}</td>
                  <td>{preset.quantity.toLocaleString()}</td>
                  <td>{preset.colorSpec}</td>
                  <td>{preset.stockKind}</td>
                  <td>{preset.machine}</td>
                  <td className="table-action-cell">
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        confirmRemove(preset.name, () => onRemoveProductPreset(preset.id));
                      }}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </section>

          {catalogModal === "product" && selectedProduct && productEdit ? (
            <RecordModal title={selectedProduct.name} eyebrow="Product details" subtitle={`${selectedProduct.category} / ${selectedProduct.width} x ${selectedProduct.height}`} onClose={() => setCatalogModal(null)}>
              <label>
                Product name
                <input value={productEdit.name} onChange={(event) => setProductEdit({ ...productEdit, name: event.target.value })} />
              </label>
              <div className="field-grid two">
                <label>
                  Category
                  <select value={productEdit.category} onChange={(event) => setProductEdit({ ...productEdit, category: event.target.value })}>
                    {productCategoryOptions.map((category) => (
                      <option value={category} key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input type="number" min="1" value={productEdit.quantity} onChange={(event) => setProductEdit({ ...productEdit, quantity: Number(event.target.value) })} />
                </label>
                <label>
                  Width
                  <input type="number" min="0.1" step="0.125" value={productEdit.width} onChange={(event) => setProductEdit({ ...productEdit, width: Number(event.target.value) })} />
                </label>
                <label>
                  Height
                  <input type="number" min="0.1" step="0.125" value={productEdit.height} onChange={(event) => setProductEdit({ ...productEdit, height: Number(event.target.value) })} />
                </label>
                <label>
                  Print spec
                  <select
                    value={productEdit.colorSpec}
                    onChange={(event) => {
                      const colorSpec = event.target.value;
                      setProductEdit({ ...productEdit, colorSpec, sides: sidesFromColorSpec(colorSpec) });
                    }}
                  >
                    <option value="4/4 full color">4/4 full color - 2 sides</option>
                    <option value="4/1 color">4/1 color front / black back - 2 sides</option>
                    <option value="4/0 full color">4/0 full color - 1 side</option>
                    <option value="1/1 black">1/1 black - 2 sides</option>
                    <option value="1/0 black">1/0 black - 1 side</option>
                    <option value="Full color wide format">Full color wide format</option>
                  </select>
                </label>
                <label>
                  Stock type
                  <select value={productEdit.stockKind} onChange={(event) => setProductEdit({ ...productEdit, stockKind: event.target.value as ProductPreset["stockKind"] })}>
                    <option value="cover">Cover/cardstock</option>
                    <option value="text">Text</option>
                    <option value="wide-format">Wide-format</option>
                    <option value="specialty">Specialty</option>
                  </select>
                </label>
              </div>
              <label>
                Machine
                <select value={productEdit.machine} onChange={(event) => setProductEdit({ ...productEdit, machine: event.target.value })}>
                  {machines.map((machine) => (
                    <option value={machine.name} key={machine.id}>{machine.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Finishing
                <input
                  value={productEdit.bindery.join(", ")}
                  onChange={(event) =>
                    setProductEdit({
                      ...productEdit,
                      bindery: event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                    })
                  }
                />
              </label>
              <label>
                Notes
                <textarea value={productEdit.notes} onChange={(event) => setProductEdit({ ...productEdit, notes: event.target.value })} />
              </label>
              <div className="record-form-footer">
                <button className="icon-button danger" type="button" onClick={removeSelectedProduct}>
                  <Trash2 size={16} />
                  Remove product
                </button>
                <button className="primary-button" type="button" onClick={() => onUpdateProductPreset(selectedProduct.id, productEdit)} disabled={!productEdit.name.trim()}>
                  Save product changes
                </button>
              </div>
            </RecordModal>
          ) : null}
        </div>
      ) : null}

      {view === "paper" ? (
        <div className="catalog-detail-grid">
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Paper inventory</h2>
                <span>{filteredPaperStocks.length} matching stocks from {paperStocks.length} total. Click a row to edit.</span>
              </div>
              <div className="button-row right">
                <ImportExportToolbar
                  label="Paper Inventory"
                  filename="gross-printing-paper-inventory.xlsx"
                  rows={paperStocks as unknown as Record<string, unknown>[]}
                  onImport={onImportPaper}
                />
              </div>
            </div>
            <div className="field-grid three" style={{ padding: "14px 14px 0" }}>
              <label>
                Search stock
                <input
                  value={stockSearch}
                  onChange={(event) => setStockSearch(event.target.value)}
                  placeholder="Envelope, 13x19, gloss, supplier..."
                />
              </label>
              <label>
                Category
                <select value={stockCategory} onChange={(event) => setStockCategory(event.target.value)}>
                  <option value="all">All categories</option>
                  {stockCategories.map((category) => (
                    <option value={category} key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Kind
                <select value={stockKind} onChange={(event) => setStockKind(event.target.value as "all" | PaperStock["kind"])}>
                  <option value="all">All kinds</option>
                  <option value="cover">Cover/cardstock</option>
                  <option value="text">Text</option>
                  <option value="wide-format">Wide-format</option>
                  <option value="specialty">Specialty</option>
                </select>
              </label>
            </div>
            <p style={{ margin: 0, padding: "10px 14px 12px", color: "var(--muted)", fontSize: "0.86rem" }}>
              Showing first {visiblePaperStocks.length} results. {remainingPaperCount ? `${remainingPaperCount} more hidden; use search or filters to narrow it.` : "All matching stocks are visible."}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Category</th>
                  <th>Parent sheet</th>
                  <th>Kind</th>
                  <th>Used for</th>
                  <th>Supplier</th>
                  <th>Sell</th>
                  <th>Inventory</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePaperStocks.map((stock) => (
                  <tr
                    className={stock.id === selectedStock?.id ? "selected-row" : ""}
                    key={stock.id}
                    onClick={() => {
                      setSelectedStockId(stock.id);
                      setCatalogModal("stock");
                    }}
                  >
                    <td>
                      <strong>{stock.name}</strong>
                      {stock.lastOrderedDate ? <span>Last ordered {stock.lastOrderedDate}</span> : null}
                    </td>
                    <td>{stock.inventoryCategory ?? "Catalog"}</td>
                    <td>{stock.sheetWidth}x{stock.sheetHeight}</td>
                    <td>{stock.kind}</td>
                    <td>{stock.productCategories?.length ? stock.productCategories.join(", ") : "Any matching product"}</td>
                    <td>
                      {stock.supplier ?? "-"}
                      {stock.invoiceNumber ? <span>Inv {stock.invoiceNumber}{stock.sourcePage ? ` / p.${stock.sourcePage}` : ""}</span> : null}
                    </td>
                    <td>{formatMoney(stock.sellPerSheet)}</td>
                    <td>
                      {stock.inventorySheets.toLocaleString()}
                      <span>{stock.unit ?? "sheets"}</span>
                    </td>
                    <td className="table-action-cell">
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          confirmRemove(stock.name, () => onRemovePaperStock(stock.id));
                        }}
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {catalogModal === "stock" && selectedStock && stockEdit ? (
            <RecordModal title={selectedStock.name} eyebrow="Paper details" subtitle={`${selectedStock.sheetWidth} x ${selectedStock.sheetHeight} / ${selectedStock.kind}`} onClose={() => setCatalogModal(null)} className="wide">
              <label>
                Stock name
                <input value={stockEdit.name} onChange={(event) => setStockEdit({ ...stockEdit, name: event.target.value })} />
              </label>
              <div className="field-grid two">
                <label>
                  Category
                  <input value={stockEdit.inventoryCategory ?? ""} onChange={(event) => setStockEdit({ ...stockEdit, inventoryCategory: event.target.value })} />
                </label>
                <label>
                  Kind
                  <select value={stockEdit.kind} onChange={(event) => setStockEdit({ ...stockEdit, kind: event.target.value as PaperStock["kind"] })}>
                    <option value="cover">Cover/cardstock</option>
                    <option value="text">Text</option>
                    <option value="wide-format">Wide-format</option>
                    <option value="specialty">Specialty</option>
                  </select>
                </label>
                <label>
                  Sheet width
                  <input type="number" step="0.001" value={stockEdit.sheetWidth} onChange={(event) => setStockEdit({ ...stockEdit, sheetWidth: Number(event.target.value) })} />
                </label>
                <label>
                  Sheet height
                  <input type="number" step="0.001" value={stockEdit.sheetHeight} onChange={(event) => setStockEdit({ ...stockEdit, sheetHeight: Number(event.target.value) })} />
                </label>
                <label>
                  Cost / sheet
                  <input type="number" step="0.01" value={stockEdit.costPerSheet} onChange={(event) => setStockEdit({ ...stockEdit, costPerSheet: Number(event.target.value) })} />
                </label>
                <label>
                  Sell / sheet
                  <input type="number" step="0.01" value={stockEdit.sellPerSheet} onChange={(event) => setStockEdit({ ...stockEdit, sellPerSheet: Number(event.target.value) })} />
                </label>
                <label>
                  Inventory
                  <input type="number" value={stockEdit.inventorySheets} onChange={(event) => setStockEdit({ ...stockEdit, inventorySheets: Number(event.target.value) })} />
                </label>
                <label>
                  Unit
                  <input value={stockEdit.unit ?? ""} onChange={(event) => setStockEdit({ ...stockEdit, unit: event.target.value })} />
                </label>
                <label>
                  Supplier
                  <input value={stockEdit.supplier ?? ""} onChange={(event) => setStockEdit({ ...stockEdit, supplier: event.target.value })} />
                </label>
                <label>
                  Invoice #
                  <input value={stockEdit.invoiceNumber ?? ""} onChange={(event) => setStockEdit({ ...stockEdit, invoiceNumber: event.target.value })} />
                </label>
                <label>
                  Last ordered qty
                  <input value={stockEdit.lastOrderedQty ?? ""} onChange={(event) => setStockEdit({ ...stockEdit, lastOrderedQty: event.target.value })} />
                </label>
                <label>
                  Last ordered date
                  <input value={stockEdit.lastOrderedDate ?? ""} onChange={(event) => setStockEdit({ ...stockEdit, lastOrderedDate: event.target.value })} />
                </label>
              </div>
              <label>
                Source page / notes
                <input value={stockEdit.sourcePage ?? ""} onChange={(event) => setStockEdit({ ...stockEdit, sourcePage: event.target.value })} />
              </label>
              <div>
                <p className="field-help">Use this stock for product categories</p>
                <div className="check-grid">
                  {productCategoryOptions.map((category) => (
                    <label className="checkbox-pill" key={category}>
                      <input
                        type="checkbox"
                        checked={stockEdit.productCategories?.includes(category) ?? false}
                        onChange={() => setStockEdit({ ...stockEdit, productCategories: toggleProductCategory(stockEdit, category) })}
                      />
                      {category}
                    </label>
                  ))}
                </div>
              </div>
              <div className="record-form-footer">
                <button className="icon-button danger" type="button" onClick={removeSelectedStock}>
                  <Trash2 size={16} />
                  Remove paper stock
                </button>
                <button className="primary-button" type="button" onClick={() => onUpdatePaperStock(selectedStock.id, stockEdit)} disabled={!stockEdit.name.trim()}>
                  Save paper changes
                </button>
              </div>
            </RecordModal>
          ) : null}
        </div>
      ) : null}

      {isPriceView ? (
        <div className="catalog-detail-grid">
          {view === "print" ? (
            <section className="panel print-spec-panel">
              <div className="panel-heading">
                <div>
                  <h2>Print click rates</h2>
                  <span>These are the regular fallback rates for color/black work. Product tables like business cards can still override these rates.</span>
                </div>
              </div>
              <div className="print-spec-grid">
                {printSpecRows.map((row) => (
                  <button
                    className={`print-spec-card ${row.priceRecord ? "" : "missing"}`}
                    type="button"
                    key={row.code}
                    onClick={() => openPrintSpecPrice(row)}
                  >
                    <strong>{row.code}</strong>
                    <span>{row.name}</span>
                    <b>{row.priceRecord ? formatMoney(row.priceRecord.price) : "Not set"}</b>
                    <small>{row.priceRecord?.unit ?? row.unit}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>{priceTableTitle}</h2>
                <span>{priceTableSubtitle}</span>
              </div>
              <Database size={18} />
            </div>
            <div className="table-toolbar">
              <label>
                Search pricing records
                <input
                  value={priceSearch}
                  onChange={(event) => setPriceSearch(event.target.value)}
                  placeholder={priceSearchPlaceholder}
                />
              </label>
              <span>{searchedCatalogPrices.length} of {visibleCatalogPrices.length} rules</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Item</th>
                  <th>Unit</th>
                  <th>Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {searchedCatalogPrices.map((price) => (
                  <tr
                    className={price.id === selectedPrice?.id ? "selected-row" : ""}
                    key={price.id}
                    onClick={() => {
                      setSelectedPriceId(price.id);
                      setCatalogModal("price");
                    }}
                  >
                    <td>{price.category}</td>
                    <td>
                      <strong>{price.name}</strong>
                      <span>{price.notes}</span>
                    </td>
                    <td>{price.unit}</td>
                    <td>{formatMoney(price.price)}</td>
                    <td className="table-action-cell">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedPriceId(price.id);
                          setCatalogModal("price");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          confirmRemove(price.name, () => onRemoveCatalogPrice(price.id));
                        }}
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {searchedCatalogPrices.length === 0 ? <p className="table-footnote">No pricing rules match this search.</p> : null}
          </section>

          {catalogModal === "price" && selectedPrice && priceEdit ? (
            <RecordModal title={selectedPrice.name} eyebrow="Price details" subtitle={`${selectedPrice.category} / ${formatMoney(selectedPrice.price)}`} onClose={() => setCatalogModal(null)}>
              <label>
                Category
                <select value={priceEdit.category} onChange={(event) => setPriceEdit({ ...priceEdit, category: event.target.value })}>
                  {priceCategories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label>
                Item name
                <input value={priceEdit.name} onChange={(event) => setPriceEdit({ ...priceEdit, name: event.target.value })} />
              </label>
              <div className="field-grid two">
                <label>
                  Unit
                  <input value={priceEdit.unit} onChange={(event) => setPriceEdit({ ...priceEdit, unit: event.target.value })} />
                </label>
                <label>
                  Price
                  <input type="number" step="0.01" value={priceEdit.price} onChange={(event) => setPriceEdit({ ...priceEdit, price: Number(event.target.value) })} />
                </label>
              </div>
              <label>
                Notes
                <textarea value={priceEdit.notes} onChange={(event) => setPriceEdit({ ...priceEdit, notes: event.target.value })} />
              </label>
              <div className="record-form-footer">
                <button className="icon-button danger" type="button" onClick={removeSelectedPrice}>
                  <Trash2 size={16} />
                  Remove price
                </button>
                <button className="primary-button" type="button" onClick={saveSelectedPrice} disabled={!priceEdit.name.trim()}>
                  Save price changes
                </button>
              </div>
            </RecordModal>
          ) : null}
        </div>
      ) : null}

      {view === "machines" ? (
        <div className="catalog-detail-grid">
          <section className="panel">
            <div className="panel-heading">
              <h2>Machines</h2>
              <Settings2 size={18} />
            </div>
            <div className="machine-list">
              {machines.map((machine) => (
                <button
                  className={`machine-card ${machine.id === selectedMachine?.id ? "active" : ""}`}
                  type="button"
                  key={machine.id}
                  onClick={() => {
                    setSelectedMachineId(machine.id);
                    setCatalogModal("machine");
                  }}
                >
                  <div>
                    <strong>{machine.name}</strong>
                    <span>{machine.type}</span>
                  </div>
                  <b>{formatMoney(machine.hourlyRate)}/hr</b>
                  <p>{machine.notes}</p>
                </button>
              ))}
            </div>
            <div className="cutting-rule">
              <Scissors size={18} />
              <div>
                <strong>Cutting rule</strong>
                <span>$2 per actual cut. Cover/cardstock piles max 250 sheets. Text piles max 500 sheets.</span>
              </div>
            </div>
          </section>

          {catalogModal === "machine" && selectedMachine && machineEdit ? (
            <RecordModal title={selectedMachine.name} eyebrow="Machine details" subtitle={`${selectedMachine.type} / ${formatMoney(selectedMachine.hourlyRate)}/hr`} onClose={() => setCatalogModal(null)}>
              <label>
                Machine name
                <input value={machineEdit.name} onChange={(event) => setMachineEdit({ ...machineEdit, name: event.target.value })} />
              </label>
              <div className="field-grid two">
                <label>
                  Type
                  <input value={machineEdit.type} onChange={(event) => setMachineEdit({ ...machineEdit, type: event.target.value })} />
                </label>
                <label>
                  Hourly rate
                  <input type="number" step="0.01" value={machineEdit.hourlyRate} onChange={(event) => setMachineEdit({ ...machineEdit, hourlyRate: Number(event.target.value) })} />
                </label>
              </div>
              <label>
                Notes
                <textarea value={machineEdit.notes} onChange={(event) => setMachineEdit({ ...machineEdit, notes: event.target.value })} />
              </label>
              <div className="record-form-footer">
                <button className="icon-button danger" type="button" onClick={removeSelectedMachine}>
                  <Trash2 size={16} />
                  Remove machine
                </button>
                <button className="primary-button" type="button" onClick={() => onUpdateMachine(selectedMachine.id, machineEdit)} disabled={!machineEdit.name.trim()}>
                  Save machine changes
                </button>
              </div>
            </RecordModal>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
