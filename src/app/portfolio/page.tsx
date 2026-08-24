import Link from "next/link";
import { ArrowRight, ImagePlus } from "lucide-react";
import { WebsiteHeader } from "@/components/website/WebsiteHeader";
import { WebsiteFooter } from "@/components/website/WebsiteFooter";
import { PUBLIC_PRODUCT_CATALOG } from "@/lib/public-product-catalog";
import "../website/website.css";

export default function PortfolioPage() {
  return (
    <div className="gp-website"><WebsiteHeader /><main className="gp-main">
      <section className="gp-page-hero compact"><div className="gp-section-inner"><span className="gp-eyebrow">Portfolio</span><h1>Gross Printing project gallery</h1><p>The layout is ready for your own real job photos. No stock images are presented as customer work.</p></div></section>
      <section className="gp-section gp-portfolio-section"><div className="gp-section-inner wide"><div className="gp-portfolio-grid">
        {PUBLIC_PRODUCT_CATALOG.slice(0,8).map((category,index)=><article className={`gp-portfolio-card visual-${(index%4)+1}`} key={category.id}><div className="gp-portfolio-placeholder" aria-label={`Placeholder for ${category.title} project photo`}><ImagePlus size={30}/><span>Replace with your photo</span></div><div><span>Project category</span><h3>{category.title}</h3><p>{category.description}</p></div></article>)}
      </div><div className="gp-centered-action"><Link href="/quote" className="gp-btn gp-btn-primary gp-btn-lg">Request a Quote <ArrowRight size={18}/></Link></div></div></section>
    </main><WebsiteFooter /></div>
  );
}
