"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

interface RecordModalProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

export function RecordModal({ title, eyebrow, subtitle, actions, children, onClose, className = "" }: RecordModalProps) {
  return (
    <aside className="drawer-backdrop record-modal-backdrop" onMouseDown={onClose}>
      <section className={`record-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="record-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="record-modal-header">
          <div className="record-modal-title">
            {eyebrow ? <span className="soft-chip">{eyebrow}</span> : null}
            <h2 id="record-modal-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="record-modal-actions">
            {actions}
            <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close dialog">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="record-modal-body">{children}</div>
      </section>
    </aside>
  );
}
