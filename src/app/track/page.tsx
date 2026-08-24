"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { WebsiteFooter } from "@/components/website/WebsiteFooter";
import { WebsiteHeader } from "@/components/website/WebsiteHeader";
import "../website/website.css";

export default function TrackOrderPage() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(
      "For live status, proofs, and files, sign in to the Customer Portal with the email on the order. " +
        "If you do not have portal access yet, ask your Gross Printing contact or request access from the portal page."
    );
  }

  return (
    <div className="gp-website">
      <WebsiteHeader />
      <main className="gp-main">
        <section className="gp-section">
          <div className="gp-section-inner">
            <div className="gp-section-header">
              <h2>Track your order</h2>
              <p>
                Enter the job number and the email used on the order. Full tracking, proofs, and
                invoices are in the Customer Portal.
              </p>
            </div>

            <div className="gp-track-card">
              <form onSubmit={handleSubmit}>
                <div className="gp-field" style={{ marginBottom: "1rem" }}>
                  <label htmlFor="orderId">Order / Job number</label>
                  <input
                    id="orderId"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="e.g. JO-10482"
                    required
                  />
                </div>
                <div className="gp-field" style={{ marginBottom: "1.25rem" }}>
                  <label htmlFor="trackEmail">Email on the order</label>
                  <input
                    id="trackEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                  />
                </div>
                <button type="submit" className="gp-btn gp-btn-primary gp-btn-block">
                  Look up order
                </button>
              </form>

              {message && (
                <div style={{ marginTop: "1.25rem", fontSize: "0.9rem", color: "var(--gp-ink-soft)" }}>
                  <p>{message}</p>
                  <p style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <Link href="/portal" className="gp-btn gp-btn-primary">
                      Open Customer Portal
                    </Link>
                    <Link href="/portal/request-access" className="gp-btn gp-btn-secondary">
                      Request portal access
                    </Link>
                    <Link href="/quote" className="gp-btn gp-btn-secondary">
                      Request a quote
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <WebsiteFooter />
    </div>
  );
}
