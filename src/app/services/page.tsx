import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WebsiteHeader } from "@/components/website/WebsiteHeader";
import { WebsiteFooter } from "@/components/website/WebsiteFooter";
import { PublicProductGrid } from "@/components/website/PublicProductGrid";
import "../website/website.css";

export default function ServicesPage() {
  return (
    <div className="gp-website"><WebsiteHeader /><main className="gp-main">
      <section className="gp-page-hero"><div className="gp-section-inner"><span className="gp-eyebrow">Products & services</span><h1>Commercial printing for everyday jobs and custom projects.</h1><p>Browse the main Gross Printing product categories below. If your exact item is not listed, send the specifications and we will review it as a custom request.</p><div className="gp-hero-actions"><Link href="/quote" className="gp-btn gp-btn-primary gp-btn-lg">Request a Quote <ArrowRight size={18} /></Link><Link href="/portal" className="gp-btn gp-btn-hero-secondary gp-btn-lg">Customer Portal</Link></div></div></section>
      <section className="gp-section gp-product-section"><div className="gp-section-inner wide"><div className="gp-section-header"><span className="gp-eyebrow dark">Product catalog</span><h2>Choose the type of print job</h2><p>No public prices are shown. Send the project information and Gross Printing will confirm the quote.</p></div><PublicProductGrid withCategorySidebar /></div></section>
      <section className="gp-cta-band refined"><div><span className="gp-eyebrow">Custom work</span><h2>Do not see the exact product?</h2><p>Send the dimensions, quantity, paper or material, finishing, and due date. We can review the request directly.</p></div><Link href="/quote" className="gp-btn gp-btn-light gp-btn-lg">Send a custom request <ArrowRight size={18} /></Link></section>
    </main><WebsiteFooter /></div>
  );
}
