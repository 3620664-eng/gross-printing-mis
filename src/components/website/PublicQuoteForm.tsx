"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, FileCheck2, Mail, ShieldCheck, Truck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PUBLIC_PRODUCTS, type PublicPaper, type PublicProduct } from "@/lib/public-quote-types";

type FormState = {
  name: string;
  email: string;
  phone: string;
  company: string;
  product: PublicProduct;
  quantity: string;
  size: string;
  sides: "1" | "2";
  colorSpec: string;
  paper: PublicPaper;
  paperWeight: string;
  coating: string;
  bleed: boolean;
  deliveryMethod: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  finishing: string;
  turnaround: string;
  neededDate: string;
  notes: string;
  website: string;
};

const INITIAL: FormState = {
  name: "",
  email: "",
  phone: "",
  company: "",
  product: "Business Cards",
  quantity: "500",
  size: '3.5" × 2"',
  sides: "2",
  colorSpec: "4/4 full color",
  paper: "14pt Cardstock",
  paperWeight: "14pt",
  coating: "",
  bleed: false,
  deliveryMethod: "Pickup",
  shippingAddress: "",
  shippingCity: "",
  shippingState: "",
  shippingZip: "",
  finishing: "",
  turnaround: "Standard",
  neededDate: "",
  notes: "",
  website: ""
};

const PAPERS_BY_PRODUCT: Record<PublicProduct, PublicPaper[]> = {
  "Business Cards": ["14pt Cardstock", "16pt Cardstock", "Not sure – recommend"],
  "Flyers / Brochures": ["100lb Gloss Text", "100lb Matte Text", "70lb Uncoated", "80lb Cover", "Not sure – recommend"],
  "Booklets / Books": ["100lb Gloss Text", "100lb Matte Text", "70lb Uncoated", "80lb Cover", "Not sure – recommend"],
  "Signs / Banners": ["Banner / sign material", "Not sure – recommend"],
  "Labels / Stickers": ["Label stock", "Not sure – recommend"],
  Envelopes: ["Envelope stock", "Not sure – recommend"],
  Invitations: ["14pt Cardstock", "16pt Cardstock", "80lb Cover", "Not sure – recommend"],
  Copies: ["Copy paper", "70lb Uncoated", "Not sure – recommend"],
  "Tea Party Cards": ["14pt Cardstock", "16pt Cardstock", "80lb Cover", "Not sure – recommend"],
  "Receipt Books": ["Copy paper", "Not sure – recommend"],
  Stamps: ["Not sure – recommend"],
  "Simcha Bags": ["Not sure – recommend"],
  Posters: ["100lb Gloss Text", "100lb Matte Text", "80lb Cover", "Not sure – recommend"],
  "Plans / Blueprints": ["Copy paper", "Not sure – recommend"],
  Other: ["14pt Cardstock", "100lb Gloss Text", "70lb Uncoated", "Not sure – recommend"]
};

function defaultSize(product: PublicProduct) {
  if (product === "Business Cards") return '3.5" × 2"';
  if (product === "Flyers / Brochures" || product === "Copies") return '8.5" × 11"';
  if (product === "Invitations" || product === "Tea Party Cards") return '5" × 7"';
  if (product === "Plans / Blueprints") return '24" × 36"';
  if (product === "Signs / Banners") return '36" × 24"';
  return "";
}

const STEPS = ["Contact", "Product", "Delivery"] as const;

export function PublicQuoteForm() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [requestNumber, setRequestNumber] = useState("");

  const papers = PAPERS_BY_PRODUCT[form.product] || PAPERS_BY_PRODUCT.Other;
  const needsAddress = form.deliveryMethod === "Local delivery" || form.deliveryMethod === "Ship";

  useEffect(() => {
    const productParam = searchParams.get("product");
    if (!productParam) return;
    const matched = PUBLIC_PRODUCTS.find((p) => p.toLowerCase() === productParam.toLowerCase());
    if (matched) {
      setForm((prev) => ({
        ...prev,
        product: matched,
        size: defaultSize(matched) || prev.size,
        paper: (PAPERS_BY_PRODUCT[matched] || PAPERS_BY_PRODUCT.Other)[0]
      }));
    }
  }, [searchParams]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "product") {
        const product = value as PublicProduct;
        const list = PAPERS_BY_PRODUCT[product] || PAPERS_BY_PRODUCT.Other;
        next.paper = list[0];
        next.size = defaultSize(product);
      }
      return next;
    });
  }

  function validateStep(current: number) {
    if (current === 0) {
      if (form.name.trim().length < 2) return "Please enter your name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email.";
    }
    if (current === 1) {
      if (!form.product) return "Please choose a product.";
      if (!form.quantity.trim()) return "Please enter a quantity.";
      if (form.turnaround === "Specific date" && !form.neededDate.trim()) return "Please choose the date you need this job.";
    }
    if (current === 2) {
      if (needsAddress && form.shippingAddress.trim().length < 3) {
        return "Please enter a delivery / shipping address.";
      }
      if (form.deliveryMethod === "Ship" && !form.shippingZip.trim()) {
        return "Please enter a ZIP code for shipping.";
      }
    }
    return "";
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setErrorMsg(err);
      setStatus("error");
      return;
    }
    setErrorMsg("");
    setStatus("idle");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setErrorMsg("");
    setStatus("idle");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const err = validateStep(2);
    if (err) {
      setErrorMsg(err);
      setStatus("error");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    setRequestNumber("");
    try {
      const shippingLine = needsAddress
        ? `Delivery / shipping address: ${[form.shippingAddress, form.shippingCity, form.shippingState, form.shippingZip].filter(Boolean).join(", ")}`
        : "";
      const requestedDateLine = form.turnaround === "Specific date" && form.neededDate
        ? `Requested completion date: ${form.neededDate}`
        : "";
      const payload = {
        ...form,
        // Keep the method short for the database field; preserve the full address/date in notes.
        deliveryMethod: form.deliveryMethod,
        notes: [form.notes.trim(), requestedDateLine, shippingLine].filter(Boolean).join("\n")
      };
      const response = await fetch("/api/public/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to submit quote request. Please try again or email us.");
      setRequestNumber(typeof data.requestNumber === "string" ? data.requestNumber : "");
      setStatus("success");
      setForm(INITIAL);
      setStep(0);
    } catch (error) {
      setStatus("error");
      setErrorMsg(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  const summary = useMemo(
    () =>
      [
        form.product,
        form.quantity ? `Qty ${form.quantity}` : null,
        form.size || null,
        form.sides === "2" ? "2-sided" : "1-sided",
        form.paper,
        form.turnaround === "Specific date" && form.neededDate ? `Needed ${form.neededDate}` : form.turnaround,
        form.deliveryMethod
      ]
        .filter(Boolean)
        .join(" · "),
    [form]
  );

  return (
    <section className="gp-section gp-quote-section">
      <div className="gp-section-inner">
        <div className="gp-section-header" style={{ marginBottom: "1.5rem" }}>
          <h2>Request a quote</h2>
          <p>
            Tell us what you need. <strong>There is no instant public price</strong> — our team reviews
            your specs and emails a firm quote after staff review.
          </p>
        </div>

        <div className="gp-quote-trust-row">
          <span>
            <ShieldCheck size={16} /> No online price guessing
          </span>
          <span>
            <Mail size={16} /> Reply by email with clear pricing
          </span>
          <span>
            <FileCheck2 size={16} /> Staff reviews every request
          </span>
        </div>

        <div className="gp-quote-layout">
          <div className="gp-quote-panel">
            <div className="gp-quote-panel-header">
              <h2>Project details</h2>
              <p>
                Step {step + 1} of {STEPS.length}: {STEPS[step]}
              </p>
            </div>

            <div className="gp-quote-steps" aria-label="Quote steps">
              {STEPS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`gp-quote-step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}
                  onClick={() => {
                    if (index < step) setStep(index);
                  }}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              ))}
            </div>

            <div className="gp-quote-body">
              {status === "success" ? (
                <div className="gp-success-box">
                  <CheckCircle2 size={28} style={{ marginBottom: "0.5rem" }} />
                  <h3>Quote request received</h3>
                  <p style={{ margin: "0 0 0.75rem" }}>
                    Thanks! We will review your specs and reply by email with confirmed pricing.
                    {requestNumber ? (
                      <>
                        <br />
                        Reference: <strong>{requestNumber}</strong>
                      </>
                    ) : null}
                  </p>
                  <p style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
                    Prefer the portal next time? Existing customers can upload files and track jobs in the{" "}
                    <Link href="/portal">Customer Portal</Link>.
                  </p>
                  <button
                    type="button"
                    className="gp-btn gp-btn-primary"
                    onClick={() => {
                      setStatus("idle");
                      setStep(0);
                    }}
                  >
                    Submit another request
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {status === "error" && errorMsg ? <div className="gp-error-box">{errorMsg}</div> : null}

                  {step === 0 && (
                    <div className="gp-form-grid">
                      <div className="gp-field">
                        <label htmlFor="name">Your name *</label>
                        <input id="name" required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Jane Smith" />
                      </div>
                      <div className="gp-field">
                        <label htmlFor="email">Email *</label>
                        <input id="email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@company.com" />
                      </div>
                      <div className="gp-field">
                        <label htmlFor="phone">Phone</label>
                        <input id="phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(555) 123-4567" />
                      </div>
                      <div className="gp-field">
                        <label htmlFor="company">Company</label>
                        <input id="company" value={form.company} onChange={(e) => update("company", e.target.value)} placeholder="Optional" />
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="gp-form-grid">
                      <div className="gp-field">
                        <label htmlFor="product">Product *</label>
                        <select id="product" value={form.product} onChange={(e) => update("product", e.target.value as PublicProduct)}>
                          {PUBLIC_PRODUCTS.map((product) => (
                            <option key={product} value={product}>
                              {product}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="gp-field">
                        <label htmlFor="quantity">Quantity *</label>
                        <input id="quantity" required value={form.quantity} onChange={(e) => update("quantity", e.target.value)} placeholder="500" />
                      </div>
                      <div className="gp-field">
                        <label htmlFor="size">Finished size</label>
                        <input id="size" value={form.size} onChange={(e) => update("size", e.target.value)} placeholder='e.g. 3.5" × 2"' />
                      </div>
                      <div className="gp-field">
                        <label htmlFor="sides">Sides</label>
                        <select id="sides" value={form.sides} onChange={(e) => update("sides", e.target.value as "1" | "2")}>
                          <option value="1">1-sided</option>
                          <option value="2">2-sided</option>
                        </select>
                      </div>
                      <div className="gp-field">
                        <label htmlFor="colorSpec">Printing / color</label>
                        <select id="colorSpec" value={form.colorSpec} onChange={(e) => update("colorSpec", e.target.value)}>
                          <option>4/4 full color</option>
                          <option>4/0 color front only</option>
                          <option>4/1 color + black back</option>
                          <option>1/1 black both sides</option>
                          <option>1/0 black one side</option>
                          <option>Spot / custom — review</option>
                          <option>Not sure — recommend</option>
                        </select>
                      </div>
                      <div className="gp-field">
                        <label htmlFor="paper">Paper / stock</label>
                        <select id="paper" value={form.paper} onChange={(e) => update("paper", e.target.value as PublicPaper)}>
                          {papers.map((paper) => (
                            <option key={paper} value={paper}>
                              {paper}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="gp-field">
                        <label htmlFor="paperWeight">Weight</label>
                        <input id="paperWeight" value={form.paperWeight} onChange={(e) => update("paperWeight", e.target.value)} placeholder="14pt / 100lb" />
                      </div>
                      <div className="gp-field">
                        <label htmlFor="coating">Coating</label>
                        <input id="coating" value={form.coating} onChange={(e) => update("coating", e.target.value)} placeholder="Gloss, matte, soft-touch…" />
                      </div>
                      <div className="gp-field">
                        <label htmlFor="finishing">Finishing</label>
                        <input id="finishing" value={form.finishing} onChange={(e) => update("finishing", e.target.value)} placeholder="UV, rounded corners, fold…" />
                      </div>
                      <div className="gp-field">
                        <label htmlFor="turnaround">Needed by</label>
                        <select id="turnaround" value={form.turnaround} onChange={(e) => update("turnaround", e.target.value)}>
                          <option value="Standard">Standard</option>
                          <option value="Rush">Rush — staff confirms availability</option>
                          <option value="Specific date">Specific date</option>
                          <option value="Flexible">Flexible</option>
                        </select>
                      </div>
                      {form.turnaround === "Specific date" ? (
                        <div className="gp-field">
                          <label htmlFor="neededDate">Date needed *</label>
                          <input id="neededDate" type="date" required value={form.neededDate} onChange={(e) => update("neededDate", e.target.value)} />
                        </div>
                      ) : null}
                      <div className="gp-field full">
                        <label className="gp-check-label">
                          <input type="checkbox" checked={form.bleed} onChange={(e) => update("bleed", e.target.checked)} />
                          Artwork has bleed
                        </label>
                      </div>
                      <div className="gp-field full">
                        <label htmlFor="notes">Notes / special instructions</label>
                        <textarea
                          id="notes"
                          value={form.notes}
                          onChange={(e) => update("notes", e.target.value)}
                          placeholder="File status, colors, delivery notes… You can email artwork after we reply."
                        />
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="gp-form-grid">
                      <div className="gp-field full">
                        <label htmlFor="deliveryMethod">Shipping / delivery *</label>
                        <select id="deliveryMethod" value={form.deliveryMethod} onChange={(e) => update("deliveryMethod", e.target.value)}>
                          <option value="Pickup">Pickup at shop</option>
                          <option value="Local delivery">Local delivery</option>
                          <option value="Ship">Ship to me</option>
                        </select>
                      </div>
                      {needsAddress ? (
                        <>
                          <div className="gp-field full">
                            <label htmlFor="shippingAddress">Street address *</label>
                            <input
                              id="shippingAddress"
                              required
                              value={form.shippingAddress}
                              onChange={(e) => update("shippingAddress", e.target.value)}
                              placeholder="123 Main St"
                            />
                          </div>
                          <div className="gp-field">
                            <label htmlFor="shippingCity">City</label>
                            <input id="shippingCity" value={form.shippingCity} onChange={(e) => update("shippingCity", e.target.value)} />
                          </div>
                          <div className="gp-field">
                            <label htmlFor="shippingState">State</label>
                            <input id="shippingState" value={form.shippingState} onChange={(e) => update("shippingState", e.target.value)} />
                          </div>
                          <div className="gp-field full">
                            <label htmlFor="shippingZip">ZIP {form.deliveryMethod === "Ship" ? "*" : ""}</label>
                            <input
                              id="shippingZip"
                              required={form.deliveryMethod === "Ship"}
                              value={form.shippingZip}
                              onChange={(e) => update("shippingZip", e.target.value)}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="gp-field full">
                          <p className="gp-inline-note">
                            <Truck size={16} /> You will pick up finished work at Gross Printing. We will confirm when it is ready.
                          </p>
                        </div>
                      )}
                      <div className="gp-field full">
                        <div className="gp-review-box">
                          <strong>Review before send</strong>
                          <p>{summary}</p>
                          <p style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "var(--gp-muted)" }}>
                            Contact: {form.name} · {form.email}
                            {form.phone ? ` · ${form.phone}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                    <label htmlFor="website">Website</label>
                    <input
                      id="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={(e) => update("website", e.target.value)}
                    />
                  </div>

                  <div className="gp-form-actions gp-step-actions">
                    {step > 0 ? (
                      <button type="button" className="gp-btn gp-btn-secondary" onClick={goBack}>
                        <ChevronLeft size={16} /> Back
                      </button>
                    ) : (
                      <span />
                    )}
                    {step < STEPS.length - 1 ? (
                      <button type="button" className="gp-btn gp-btn-primary" onClick={goNext}>
                        Continue <ChevronRight size={16} />
                      </button>
                    ) : (
                      <button type="submit" className="gp-btn gp-btn-primary" disabled={status === "sending"}>
                        {status === "sending" ? "Sending…" : "Submit quote request"}
                      </button>
                    )}
                  </div>
                  <p className="gp-form-note">
                    Prefer email? <a href="mailto:jobs@grossprinting.com">jobs@grossprinting.com</a>
                    {" · "}
                    <Link href="/portal">Customer Portal</Link>
                  </p>
                </form>
              )}
            </div>
          </div>

          <aside className="gp-price-card">
            <h3>How quoting works</h3>
            <ol className="gp-how-list">
              <li>You send product specs (no public price shown).</li>
              <li>Staff reviews files, stock, and timing.</li>
              <li>You receive a firm quote by email.</li>
              <li>Existing accounts can also use the portal for B2B pricing when enabled.</li>
            </ol>
            <p className="gp-price-note">
              Account customers with portal pricing turned on can see private prices after sign-in. Public visitors always get a staff-reviewed quote.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
