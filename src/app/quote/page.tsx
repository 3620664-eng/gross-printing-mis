import { Suspense } from "react";
import { WebsiteFooter } from "@/components/website/WebsiteFooter";
import { WebsiteHeader } from "@/components/website/WebsiteHeader";
import { PublicQuoteForm } from "@/components/website/PublicQuoteForm";
import "../website/website.css";

export default function QuotePage() {
  return (
    <div className="gp-website">
      <WebsiteHeader />
      <main className="gp-main">
        <Suspense fallback={<section className="gp-section"><div className="gp-section-inner">Opening quote request…</div></section>}>
          <PublicQuoteForm />
        </Suspense>
      </main>
      <WebsiteFooter />
    </div>
  );
}
