export const PUBLIC_PRODUCTS = [
  "Business Cards", "Flyers / Brochures", "Booklets / Books", "Signs / Banners", "Labels / Stickers", "Envelopes", "Invitations", "Copies", "Tea Party Cards", "Receipt Books", "Stamps", "Simcha Bags", "Posters", "Plans / Blueprints", "Other"
] as const;
export type PublicProduct = (typeof PUBLIC_PRODUCTS)[number];
export const PUBLIC_PAPERS = ["14pt Cardstock", "16pt Cardstock", "100lb Gloss Text", "100lb Matte Text", "70lb Uncoated", "80lb Cover", "Envelope stock", "Label stock", "Banner / sign material", "Copy paper", "Not sure – recommend"] as const;
export type PublicPaper = (typeof PUBLIC_PAPERS)[number];
export const PUBLIC_TURNAROUNDS = ["Standard", "Rush", "Specific date", "Flexible"] as const;
export type PublicTurnaround = (typeof PUBLIC_TURNAROUNDS)[number];
export type PublicQuoteSpec = { product: PublicProduct; quantity: number; size: string; sides: 1 | 2; colorSpec: string; paper: PublicPaper; paperWeight: string; coating: string; bleed: boolean; deliveryMethod: string; finishing: string; turnaround: PublicTurnaround; };
export type PublicEstimate = { total: number; perUnit: number; breakdown: string[]; confidence: "table" | "estimate" | "request"; note: string; };
