"use client";

import { Clock, GripVertical } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { formatDateTime, formatMoney } from "@/lib/pricing";
import type { Job } from "@/lib/types";
import { RushBadge } from "./StatusBadge";

interface JobCardProps {
  job: Job;
  onClick: () => void;
  onDragHandlePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  isDragging?: boolean;
  overlay?: boolean;
  showPricing?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dueWarning(job: Job) {
  const due = new Date(`${job.dueDate}T${job.dueTime || "17:00"}`);
  if (!Number.isFinite(due.getTime())) return null;
  const diffDays = Math.round((startOfLocalDay(due) - startOfLocalDay(new Date())) / DAY_MS);
  if (diffDays < 0) return { label: "Overdue", className: "due-overdue" };
  if (diffDays === 0) return { label: "Today", className: "due-today" };
  if (diffDays === 1) return { label: "Tomorrow", className: "due-tomorrow" };
  return null;
}

export function JobCard({
  job,
  onClick,
  onDragHandlePointerDown,
  isDragging = false,
  overlay = false,
  showPricing = true
}: JobCardProps) {
  const warning = dueWarning(job);

  return (
    <article
      className={`job-card ${warning ? `job-card-${warning.className}` : ""} ${isDragging ? "drag-source" : ""} ${overlay ? "drag-overlay-card" : ""}`}
      data-job-id={job.id}
      onClick={overlay ? undefined : onClick}
      role={overlay ? undefined : "button"}
      tabIndex={overlay ? -1 : 0}
      aria-hidden={overlay ? true : undefined}
      onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
        if (overlay) return;
        if ((event.key === "Enter" || event.key === " ") && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="job-card-top">
        <span className="job-number">{job.jobNumber}</span>
        <div className="job-card-top-actions">
          <div className="job-card-flags">
            {warning ? <span className={`due-chip ${warning.className}`}>{warning.label}</span> : null}
            <RushBadge rush={job.rush} />
          </div>
          {!overlay && onDragHandlePointerDown ? (
            <button
              className="job-card-drag-handle"
              type="button"
              aria-label={`Move ${job.jobNumber}`}
              title="Hold and drag to another production stage"
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => event.stopPropagation()}
              onPointerDown={onDragHandlePointerDown}
            >
              <GripVertical size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <h3 title={job.title}>{job.title}</h3>
      <p className="job-card-customer" title={job.customerName}>{job.customerName}</p>
      <div className="job-card-meta compact-job-meta">
        <span>
          <Clock size={13} />
          {formatDateTime(job.dueDate, job.dueTime)}
        </span>
        <span>{job.quantity.toLocaleString()} pcs</span>
      </div>
      {showPricing ? (
        <div className="job-card-footer">
          <strong>{formatMoney(job.pricing.total)}</strong>
        </div>
      ) : null}
    </article>
  );
}
