import Link from "next/link";
import { WebsiteHeader } from "@/components/website/WebsiteHeader";
import { WebsiteFooter } from "@/components/website/WebsiteFooter";
import "../website/website.css";

export default function ContactPage() {
  return (
    <div className="gp-website">
      <WebsiteHeader />
      <main className="gp-main">
        <section className="gp-section">
          <div className="gp-section-inner">
            <div className="gp-section-header">
              <h2>Contact Gross Printing</h2>
              <p>Questions about a job, file setup, or rush turnaround? We are here to help.</p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem",
                maxWidth: "900px",
                margin: "0 auto"
              }}
            >
              <div className="gp-service-card">
                <h3>Email</h3>
                <p style={{ marginBottom: "0.75rem" }}>
                  Best for quotes, file questions, and job details.
                </p>
                <a href="mailto:jobs@grossprinting.com" className="gp-btn gp-btn-primary">
                  jobs@grossprinting.com
                </a>
              </div>

              <div className="gp-service-card">
                <h3>Get a Quote</h3>
                <p style={{ marginBottom: "0.75rem" }}>
                  Use the online form for the fastest response with clear specs.
                </p>
                <Link href="/quote" className="gp-btn gp-btn-primary">
                  Start Quote Form
                </Link>
              </div>

              <div className="gp-service-card">
                <h3>Customer Portal</h3>
                <p style={{ marginBottom: "0.75rem" }}>
                  Existing customers can track jobs, approve proofs, and reorder.
                </p>
                <Link href="/portal" className="gp-btn gp-btn-secondary">
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <WebsiteFooter />
    </div>
  );
}
