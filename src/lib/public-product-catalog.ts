export type PublicProductCategory = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  examples: string[];
  visual: "cards" | "paper" | "book" | "wide" | "label" | "envelope" | "invite" | "copy" | "special" | "receipt" | "stamp" | "bag";
};

// Public-facing product categories only. This intentionally contains no pricing,
// machine information, cost data, or internal production notes.
export const PUBLIC_PRODUCT_CATALOG: PublicProductCategory[] = [
  { id: "business-cards", title: "Business Cards", shortTitle: "Business Cards", description: "Professional cards for everyday business use, events, and premium presentations.", examples: ["3.5 × 2 cards", "One or two sided", "Premium cover stocks"], visual: "cards" },
  { id: "flyers-brochures", title: "Flyers & Brochures", shortTitle: "Flyers / Brochures", description: "Flyers, sell sheets, handouts, and folded brochures in a range of sizes and stocks.", examples: ["8.5 × 11 flyers", "Tri-fold brochures", "Marketing handouts"], visual: "paper" },
  { id: "booklets-books", title: "Booklets & Books", shortTitle: "Booklets / Books", description: "Multi-page printing for programs, catalogs, manuals, booklets, and books.", examples: ["Saddle stitch", "Small-format booklets", "Cover + inside pages"], visual: "book" },
  { id: "signs-banners", title: "Signs & Banners", shortTitle: "Signs / Banners", description: "Large-format graphics for indoor and outdoor use, displays, events, and storefronts.", examples: ["Vinyl banners", "Boards & signs", "Large-format graphics"], visual: "wide" },
  { id: "labels-stickers", title: "Labels & Stickers", shortTitle: "Labels / Stickers", description: "Custom labels and stickers for products, packages, mailings, and promotions.", examples: ["Sheet labels", "Round labels", "Custom sizes"], visual: "label" },
  { id: "envelopes", title: "Envelopes", shortTitle: "Envelopes", description: "Business, reply, invitation, booklet, catalog, and specialty envelopes.", examples: ["#10 & #9", "A-size envelopes", "Booklet & catalog"], visual: "envelope" },
  { id: "invitations", title: "Invitations", shortTitle: "Invitations", description: "Invitations, announcement cards, inserts, and matching envelope sets.", examples: ["5 × 7 cards", "Matching envelopes", "Premium stocks"], visual: "invite" },
  { id: "copies", title: "Copies", shortTitle: "Copies", description: "Black-and-white and color copies for office, school, event, and everyday needs.", examples: ["Letter size", "Tabloid size", "Single or double sided"], visual: "copy" },
  { id: "tea-party-cards", title: "Tea Party Cards", shortTitle: "Tea Party Cards", description: "Specialty cards and printed pieces prepared for your event or program.", examples: ["Custom sizes", "Color printing", "Finishing available"], visual: "special" },
  { id: "receipt-books", title: "Receipt Books", shortTitle: "Receipt Books", description: "Numbered and custom receipt books for organizations, offices, and events.", examples: ["Custom layouts", "Numbering", "Bound sets"], visual: "receipt" },
  { id: "stamps", title: "Stamps", shortTitle: "Stamps", description: "Custom business and office stamps made from your text, logo, or supplied artwork.", examples: ["Business stamps", "Address stamps", "Custom artwork"], visual: "stamp" },
  { id: "simcha-bags", title: "Simcha Bags", shortTitle: "Simcha Bags", description: "Custom printed bags and related event pieces prepared to your specifications.", examples: ["Custom print", "Event quantities", "Artwork assistance"], visual: "bag" }
];
