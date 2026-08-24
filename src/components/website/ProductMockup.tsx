import type { PublicProductCategory } from "@/lib/public-product-catalog";

export type ProductVisualKey = PublicProductCategory["visual"];

export function productVisualFromName(value?: string): ProductVisualKey {
  const text = (value ?? "").toLowerCase();
  if (text.includes("business card")) return "cards";
  if (text.includes("book") || text.includes("program") || text.includes("catalog")) return "book";
  if (text.includes("banner") || text.includes("sign") || text.includes("poster")) return "wide";
  if (text.includes("label") || text.includes("sticker")) return "label";
  if (text.includes("envelope")) return "envelope";
  if (text.includes("invitation")) return "invite";
  if (text.includes("copy") || text.includes("blueprint") || text.includes("plan")) return "copy";
  if (text.includes("receipt")) return "receipt";
  if (text.includes("stamp")) return "stamp";
  if (text.includes("bag")) return "bag";
  if (text.includes("tea party")) return "special";
  return "paper";
}

export function ProductMockup({
  visual,
  title,
  compact = false,
  imageUrl
}: {
  visual: ProductVisualKey;
  title: string;
  compact?: boolean;
  imageUrl?: string;
}) {
  if (imageUrl) {
    return (
      <div className={`gp-product-mockup actual${compact ? " compact" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={`${title} artwork`} />
      </div>
    );
  }

  return (
    <div className={`gp-product-mockup ${visual}${compact ? " compact" : ""}`} aria-label={`${title} sample product graphic`}>
      <div className="mockup-stage">
        <span className="mockup-sheet back" />
        <span className="mockup-sheet middle" />
        <span className="mockup-sheet front">
          <i className="mockup-brand">GP</i>
          <b>{title}</b>
          <em />
          <em />
        </span>
        <span className="mockup-extra one" />
        <span className="mockup-extra two" />
      </div>
      {!compact ? <small>Temporary product preview</small> : null}
    </div>
  );
}
