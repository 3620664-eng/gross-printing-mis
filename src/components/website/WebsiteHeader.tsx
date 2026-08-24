"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { PUBLIC_PRODUCT_CATALOG } from "@/lib/public-product-catalog";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/services", label: "All Products" },
  { href: "/quote", label: "Request a Quote" },
  { href: "/track", label: "Track Order" },
  { href: "/contact", label: "Contact" }
];

export function WebsiteHeader() {
  const pathname = usePathname();

  return (
    <header className="gp-header">
      <div className="gp-header-inner">
        <Link href="/" className="gp-logo">
          <span className="gp-logo-mark">GP</span>
          Gross Printing
        </Link>

        <nav className="gp-nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : undefined}>
              {item.label}{item.href === "/services" ? <ChevronDown size={14} /> : null}
            </Link>
          ))}
        </nav>

        <div className="gp-header-cta">
          <Link href="/portal" className="gp-btn gp-btn-secondary">Customer Portal</Link>
          <Link href="/quote" className="gp-btn gp-btn-primary">Get a Quote</Link>
        </div>
      </div>
      <div className="gp-product-nav-wrap">
        <nav className="gp-product-nav" aria-label="Product categories">
          <Link className="all-products" href="/services">All Products <ChevronDown size={13} /></Link>
          {PUBLIC_PRODUCT_CATALOG.slice(0, 9).map((product) => (
            <Link key={product.id} href={`/services#${product.id}`}>{product.title}</Link>
          ))}
          <Link className="product-search" href="/quote" aria-label="Request a custom product"><Search size={16} /></Link>
        </nav>
      </div>
    </header>
  );
}
