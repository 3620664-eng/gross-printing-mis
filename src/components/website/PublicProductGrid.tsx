import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PUBLIC_PRODUCT_CATALOG } from "@/lib/public-product-catalog";
import { ProductMockup } from "./ProductMockup";

export function PublicProductGrid({
  compact = false,
  withCategorySidebar = false
}: {
  compact?: boolean;
  withCategorySidebar?: boolean;
}) {
  const grid = (
    <div className={`gp-product-grid${compact ? " compact" : ""}`}>
      {PUBLIC_PRODUCT_CATALOG.map((product) => (
        <article className="gp-product-card" id={product.id} key={product.id}>
          <ProductMockup visual={product.visual} title={product.title} compact={compact} />
          <div className="gp-product-card-copy">
            <div><span className="gp-product-kicker">Print product</span><h3>{product.title}</h3></div>
            {!compact ? <p>{product.description}</p> : null}
            {!compact ? <ul>{product.examples.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            <Link className="gp-product-link" href={`/quote?product=${encodeURIComponent(product.shortTitle)}`}>
              Request this product <ArrowRight size={15} />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );

  if (!withCategorySidebar) return grid;

  return (
    <div className="gp-storefront-layout">
      <aside className="gp-product-category-sidebar">
        <div className="gp-category-title">All Products</div>
        {PUBLIC_PRODUCT_CATALOG.map((product) => (
          <a href={`#${product.id}`} key={product.id}>{product.title}<span>›</span></a>
        ))}
        <Link href="/quote?product=Other">Other / Custom <span>›</span></Link>
      </aside>
      {grid}
    </div>
  );
}
