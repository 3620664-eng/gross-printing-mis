import { NextRequest, NextResponse } from "next/server";
import { requireCustomerPortalUser } from "@/lib/customer-portal-server";
import { calculateCustomerPrice } from "@/lib/customer-pricing-server";
import type { CustomerPortalRequestMetadata } from "@/lib/customer-portal-types";
import type { CatalogPrice, Customer, PaperStock } from "@/lib/types";
import type { ProductPreset } from "@/lib/product-catalog";
import type { QuantityRatePoint } from "@/lib/pricing";
import { catalogPrices as demoCatalogPrices, customers as demoCustomers, paperStocks as demoPaperStocks } from "@/lib/demo-data";
import { PRODUCT_PRESETS } from "@/lib/product-catalog";
import { QUANTITY_RATE_CURVE } from "@/lib/pricing";
import { noStoreJson, rejectCrossSiteMutation, rejectOversizedJson, serviceFetch } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
const DEMO_MODE = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";

type RecordRow = { collection?: string; record?: unknown };

type PriceState = {
  customers: Customer[];
  paperStocks: PaperStock[];
  productPresets: ProductPreset[];
  catalogPrices: CatalogPrice[];
  quantityRateCurve: QuantityRatePoint[];
};

async function loadPriceState(): Promise<PriceState> {
  if (DEMO_MODE) {
    return {
      customers: demoCustomers,
      paperStocks: demoPaperStocks,
      productPresets: PRODUCT_PRESETS,
      catalogPrices: demoCatalogPrices,
      quantityRateCurve: QUANTITY_RATE_CURVE
    };
  }
  const response = await serviceFetch(
    "/rest/v1/mis_records?workspace_id=eq.gross-printing&deleted_at=is.null&collection=in.(customers,paperStocks,productPresets,catalogPrices,quantityRateCurve)&select=collection,record,sort_order&order=collection.asc,sort_order.asc"
  );
  if (!response.ok) throw new Error("Unable to load protected pricing data.");
  const rows = (await response.json()) as RecordRow[];
  const state: PriceState = { customers: [], paperStocks: [], productPresets: [], catalogPrices: [], quantityRateCurve: [] };
  for (const row of rows) {
    if (!row.collection || !(row.collection in state)) continue;
    (state[row.collection as keyof PriceState] as unknown[]).push(row.record);
  }
  return state;
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 40_000);
  if (oversized) return oversized;

  const portalUser = await requireCustomerPortalUser(request);
  if (portalUser instanceof NextResponse) return portalUser;

  try {
    const body = (await request.json()) as { metadata?: CustomerPortalRequestMetadata; title?: string };
    const metadata = body.metadata ?? {};
    const state = await loadPriceState();
    const customer = state.customers.find((item) => item.id === portalUser.customerId && !item.deletedAt && !item.archived);
    if (!customer) return noStoreJson({ error: "The linked customer record was not found." }, { status: 404 });

    const result = calculateCustomerPrice({
      customer,
      metadata,
      title: typeof body.title === "string" ? body.title.slice(0, 240) : undefined,
      paperStocks: state.paperStocks,
      productPresets: state.productPresets,
      catalogPrices: state.catalogPrices,
      quantityRateCurve: state.quantityRateCurve
    });

    if (!result.enabled) {
      return noStoreJson({ enabled: false, requiresReview: true, message: "Request a quote for this project." });
    }
    if (result.requiresReview || typeof result.customerTotal !== "number") {
      return noStoreJson({ enabled: true, requiresReview: true, message: result.reason ?? "Gross Printing will review this project before pricing." });
    }

    return noStoreJson({
      enabled: true,
      requiresReview: false,
      total: result.customerTotal,
      perUnit: result.perUnit,
      instantOrderEnabled: customer.portalInstantOrderEnabled === true,
      quoteApprovalRequired: customer.portalQuoteApprovalRequired !== false,
      message: "Customer-specific price calculated securely on the server."
    });
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : "Unable to calculate this price." }, { status: 500 });
  }
}
