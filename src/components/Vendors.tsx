"use client";

/**
 * The shop's suppliers: paper merchants, trade finishers, outside printers,
 * delivery services.
 *
 * The mailbox has always sorted vendor quotes, bills and orders into their own
 * views, but had nowhere to file them — a bill from Mid-State Paper was
 * recognised as a bill and still connected to nothing. A vendor record gives
 * that mail somewhere to land, matched the same way customer mail is matched to
 * a customer.
 */

import { useMemo, useState } from "react";
import { Archive, Building2, Mail, Plus } from "lucide-react";
import { matchVendorCandidates, validateVendor } from "@/lib/vendor-match";
import type { EmailThread, Vendor } from "@/lib/types";

interface VendorsProps {
  vendors: Vendor[];
  /** Threads the mailbox classified as vendor mail, for the match preview. */
  vendorThreads?: Array<{ thread: EmailThread; category: string; from: string }>;
  onAddVendor: (vendor: Omit<Vendor, "id">) => string;
  onUpdateVendor: (vendorId: string, updates: Partial<Omit<Vendor, "id">>) => void;
  onArchiveVendor: (vendorId: string) => void;
}

const emptyDraft = {
  name: "", contact: "", email: "", phone: "",
  category: "Paper", terms: "Net 30", accountNumber: "", website: ""
};

const VENDOR_CATEGORIES = ["Paper", "Ink & consumables", "Trade finishing", "Outside printing", "Delivery", "Equipment", "Other"];
const VENDOR_TERMS = ["Due on receipt", "COD", "Net 15", "Net 30", "Net 60"];

export function Vendors({ vendors, vendorThreads = [], onAddVendor, onUpdateVendor, onArchiveVendor }: VendorsProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedId, setSelectedId] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const visible = vendors.filter((vendor) => !vendor.archived && !vendor.deletedAt);
  const selected = vendors.find((vendor) => vendor.id === selectedId);
  const validation = useMemo(() => validateVendor(draft, vendors), [draft, vendors]);
  const errors = validation.issues.filter((issue) => issue.level === "error");

  /**
   * Supplier mail the shop has received that matches no vendor record. This is
   * the reason the screen exists, so it is shown rather than buried.
   */
  const unmatched = useMemo(() => {
    const seen = new Map<string, { from: string; category: string; count: number }>();
    for (const entry of vendorThreads) {
      if (matchVendorCandidates(vendors, { email: entry.from }).length) continue;
      const existing = seen.get(entry.from);
      if (existing) existing.count += 1;
      else seen.set(entry.from, { from: entry.from, category: entry.category, count: 1 });
    }
    return Array.from(seen.values()).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [vendorThreads, vendors]);

  function set(field: keyof typeof emptyDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function save() {
    if (!validation.canSave) return;
    const id = onAddVendor({ ...draft, createdAt: new Date().toISOString() });
    if (!id) return;
    setDraft(emptyDraft);
    setShowAdd(false);
    setSelectedId(id);
  }

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Suppliers</p>
          <h1>Vendors</h1>
        </div>
        <div className="toolbar-actions">
          <button className="primary-button" type="button" onClick={() => setShowAdd((current) => !current)}>
            <Plus size={16} /> Add vendor
          </button>
        </div>
      </div>

      {unmatched.length ? (
        <section className="panel vendor-unmatched">
          <h2><Mail size={16} /> Supplier mail with no vendor record</h2>
          <p>These addresses sent quotes, bills or orders that could not be filed against anyone.</p>
          <ul>
            {unmatched.map((entry) => (
              <li key={entry.from}>
                <span><strong>{entry.from}</strong><small>{entry.count} message{entry.count === 1 ? "" : "s"} · {entry.category.replace("vendor_", "")}</small></span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    const domain = entry.from.split("@")[1] ?? "";
                    setDraft({ ...emptyDraft, name: domain.split(".")[0] ?? "", email: entry.from });
                    setShowAdd(true);
                  }}
                >
                  Create vendor
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showAdd ? (
        <section className="panel">
          <h2>New vendor</h2>
          <div className="customer-form">
            <div className="customer-form-grid">
              <label className={errors.some((issue) => issue.field === "name") ? "invalid" : ""}>
                <span>Vendor name</span>
                <input value={draft.name} onChange={(event) => set("name", event.target.value)} autoComplete="off" />
              </label>
              <label><span>Contact</span><input value={draft.contact} onChange={(event) => set("contact", event.target.value)} autoComplete="off" /></label>
              <label className={errors.some((issue) => issue.field === "email") ? "invalid" : ""}>
                <span>Email</span>
                <input type="email" value={draft.email} onChange={(event) => set("email", event.target.value)} autoComplete="off" />
              </label>
              <label><span>Phone</span><input value={draft.phone} onChange={(event) => set("phone", event.target.value)} autoComplete="off" /></label>
              <label>
                <span>Supplies</span>
                <select value={draft.category} onChange={(event) => set("category", event.target.value)}>
                  {VENDOR_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}
                </select>
              </label>
              <label>
                <span>Terms</span>
                <select value={draft.terms} onChange={(event) => set("terms", event.target.value)}>
                  {VENDOR_TERMS.map((term) => <option value={term} key={term}>{term}</option>)}
                </select>
              </label>
              <label><span>Account number</span><input value={draft.accountNumber} onChange={(event) => set("accountNumber", event.target.value)} autoComplete="off" /></label>
              <label><span>Website</span><input value={draft.website} onChange={(event) => set("website", event.target.value)} autoComplete="off" /></label>
            </div>
            {draft.name && validation.issues.length ? (
              <ul className="customer-form-issues">
                {validation.issues.map((issue) => (
                  <li className={`customer-form-issue ${issue.level}`} key={issue.message}>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="customer-form-actions">
              <button className="primary-button" type="button" onClick={save} disabled={!validation.canSave}>Save vendor</button>
              <button className="secondary-button" type="button" onClick={() => { setShowAdd(false); setDraft(emptyDraft); }}>Cancel</button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="list-split-layout">
        <section className="panel table-panel">
          {visible.length ? (
            <table>
              <thead>
                <tr><th>Vendor</th><th>Supplies</th><th>Terms</th><th>Email</th></tr>
              </thead>
              <tbody>
                {visible.map((vendor) => (
                  <tr
                    className={vendor.id === selectedId ? "selected-row" : ""}
                    key={vendor.id}
                    onClick={() => { setSelectedId(vendor.id); setArchiveConfirm(false); }}
                  >
                    <td><strong>{vendor.name}</strong><span>{vendor.contact}</span></td>
                    <td>{vendor.category}</td>
                    <td>{vendor.terms}</td>
                    <td>{vendor.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <Building2 size={28} />
              <strong>No vendors yet</strong>
              <span>Add the suppliers the shop buys from, so their quotes and bills stop arriving as unfiled mail.</span>
            </div>
          )}
        </section>

        {selected ? (
          <section className="panel">
            <h2>{selected.name}</h2>
            <div className="customer-form-grid">
              <label><span>Contact</span><input value={selected.contact ?? ""} onChange={(event) => onUpdateVendor(selected.id, { contact: event.target.value })} /></label>
              <label><span>Email</span><input type="email" value={selected.email ?? ""} onChange={(event) => onUpdateVendor(selected.id, { email: event.target.value })} /></label>
              <label><span>Phone</span><input value={selected.phone ?? ""} onChange={(event) => onUpdateVendor(selected.id, { phone: event.target.value })} /></label>
              <label>
                <span>Supplies</span>
                <select value={selected.category ?? "Other"} onChange={(event) => onUpdateVendor(selected.id, { category: event.target.value })}>
                  {VENDOR_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}
                </select>
              </label>
              <label>
                <span>Terms</span>
                <select value={selected.terms ?? "Net 30"} onChange={(event) => onUpdateVendor(selected.id, { terms: event.target.value })}>
                  {VENDOR_TERMS.map((term) => <option value={term} key={term}>{term}</option>)}
                </select>
              </label>
              <label><span>Account number</span><input value={selected.accountNumber ?? ""} onChange={(event) => onUpdateVendor(selected.id, { accountNumber: event.target.value })} /></label>
              <label className="customer-form-wide"><span>Notes</span><input value={selected.notes ?? ""} onChange={(event) => onUpdateVendor(selected.id, { notes: event.target.value })} /></label>
            </div>
            <div className="customer-form-actions">
              {archiveConfirm ? (
                <>
                  <span className="muted">Archive {selected.name}? Their past bills and orders stay as they are.</span>
                  <button className="secondary-button" type="button" onClick={() => setArchiveConfirm(false)}>Cancel</button>
                  <button className="primary-button" type="button" onClick={() => { onArchiveVendor(selected.id); setSelectedId(""); setArchiveConfirm(false); }}>
                    <Archive size={15} /> Yes, archive
                  </button>
                </>
              ) : (
                <button className="secondary-button" type="button" onClick={() => setArchiveConfirm(true)}>
                  <Archive size={15} /> Archive vendor
                </button>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
