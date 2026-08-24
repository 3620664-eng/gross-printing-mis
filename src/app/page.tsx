import Link from "next/link";
import { ArrowRight, CheckCircle2, FileCheck2, FolderOpen, PackageCheck, Upload } from "lucide-react";
import { WebsiteHeader } from "@/components/website/WebsiteHeader";
import { WebsiteFooter } from "@/components/website/WebsiteFooter";
import { PublicProductGrid } from "@/components/website/PublicProductGrid";
import "./website/website.css";

export default function PublicHomePage() {
  return (
    <div className="gp-website">
      <WebsiteHeader />
      <main className="gp-main">
        <section className="gp-home-hero">
          <div className="gp-home-hero-inner">
            <div className="gp-home-hero-copy">
              <span className="gp-eyebrow">Gross Printing & Publishing</span>
              <h1>Print work that is easy to order, easy to track, and ready when you need it.</h1>
              <p>Send us the specifications and artwork. Our team reviews the job, confirms the quote, and keeps you updated through production.</p>
              <div className="gp-hero-actions">
                <Link href="/quote" className="gp-btn gp-btn-primary gp-btn-lg">Request a Quote <ArrowRight size={18} /></Link>
                <Link href="/portal" className="gp-btn gp-btn-hero-secondary gp-btn-lg">Customer Portal</Link>
              </div>
              <div className="gp-hero-trust-row">
                <span><CheckCircle2 size={16} />Commercial print</span><span><CheckCircle2 size={16} />Customer file portal</span><span><CheckCircle2 size={16} />Order status updates</span>
              </div>
            </div>
            <div className="gp-hero-visual" aria-label="Gross Printing order workflow preview">
              <div className="gp-hero-visual-glow" />
              <div className="gp-hero-job-card primary">
                <div className="gp-hero-job-top"><span className="gp-mini-brand">GP</span><span className="gp-mini-status">In production</span></div>
                <strong>Summer Program Brochures</strong><small>2,500 pieces · Full color</small>
                <div className="gp-mini-progress"><span /></div>
                <div className="gp-mini-steps"><span className="done">Received</span><span className="done">Confirmed</span><span className="active">Production</span><span>Ready</span></div>
              </div>
              <div className="gp-hero-job-card floating one"><Upload size={20} /><span><strong>Artwork received</strong><small>PDF uploaded securely</small></span></div>
              <div className="gp-hero-job-card floating two"><PackageCheck size={20} /><span><strong>Order update</strong><small>Ready for pickup</small></span></div>
            </div>
          </div>
        </section>

        <section className="gp-home-action-strip"><div className="gp-home-action-inner">
          <Link href="/quote"><FileCheck2 size={21} /><span><strong>Request a quote</strong><small>Send the job details</small></span><ArrowRight size={17} /></Link>
          <Link href="/portal"><FolderOpen size={21} /><span><strong>Send files</strong><small>Use your customer portal</small></span><ArrowRight size={17} /></Link>
          <Link href="/track"><PackageCheck size={21} /><span><strong>Track an order</strong><small>See customer-facing status</small></span><ArrowRight size={17} /></Link>
        </div></section>

        <section className="gp-section gp-product-section"><div className="gp-section-inner wide">
          <div className="gp-section-header split"><div><span className="gp-eyebrow dark">Products</span><h2>What can we print for you?</h2><p>Choose a product to start a quote. The product tiles are ready for your own photos or graphics later without rebuilding the page.</p></div><Link href="/services" className="gp-btn gp-btn-secondary">View all products <ArrowRight size={16} /></Link></div>
          <PublicProductGrid compact />
        </div></section>

        <section className="gp-process-section"><div className="gp-section-inner">
          <div className="gp-section-header"><span className="gp-eyebrow dark">Simple process</span><h2>From request to finished job</h2><p>Customers see only the steps and updates that matter to them.</p></div>
          <div className="gp-process-grid">
            <article><b>01</b><h3>Tell us what you need</h3><p>Send quantity, size, paper, finishing, due date, and artwork when available.</p></article>
            <article><b>02</b><h3>We review & confirm</h3><p>Gross Printing checks the specifications and confirms pricing and timing.</p></article>
            <article><b>03</b><h3>Track the job</h3><p>Your portal shows clear customer-facing updates while the work moves through production.</p></article>
            <article><b>04</b><h3>Ready & complete</h3><p>See pickup/completion status, customer files, and invoices from the same account.</p></article>
          </div>
        </div></section>

        <section className="gp-portal-band"><div><span className="gp-eyebrow">Already a customer?</span><h2>Your orders, files, messages, quotes, and invoices in one place.</h2><p>Sign in to the Customer Portal to start a request or check existing work.</p></div><Link href="/portal" className="gp-btn gp-btn-light gp-btn-lg">Open Customer Portal <ArrowRight size={18} /></Link></section>
      </main>
      <WebsiteFooter />
    </div>
  );
}
