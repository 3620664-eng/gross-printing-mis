"use client";

import { CheckCircle2, Clock3, FileText, LayoutGrid, List, Paperclip, Ticket, UserRound } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { JobCard } from "./JobCard";
import { RushBadge, StatusBadge } from "./StatusBadge";
import { formatDateTime, formatMoney, WORKFLOW_STATUSES } from "@/lib/pricing";
import { sortWorkflowJobs } from "@/lib/workflow";
import type { EmailIntakeTicket, EmailRouteDestination, Job, JobStatus } from "@/lib/types";
import { ImportExportToolbar } from "./ImportExportToolbar";

interface WorkflowProps {
  jobs: Job[];
  onMoveJob: (jobId: string, status: JobStatus, targetIndex?: number) => void;
  onSelectJob: (jobId: string) => void;
  onEditJob: (jobId: string) => void;
  onImportJobs: (rows: Record<string, unknown>[]) => void;
  canEditJobs?: boolean;
  canImportJobs?: boolean;
  canViewPricing?: boolean;
  routedTickets?: EmailIntakeTicket[];
  currentUserId?: string;
  currentRole?: "admin" | "front_desk" | "prepress" | "press" | "finishing";
  authToken?: string;
  onOpenRoutedTicket?: (ticketId: string) => void;
  onViewRoutedTicket?: (ticketId: string) => void;
  onCompleteRoutedTicket?: (ticketId: string) => void;
  focusAssignedWork?: boolean;
  mode?: "workflow" | "assigned";
}

type DragState = {
  jobId: string;
  pointerId: number;
  sourceStatus: JobStatus;
  sourceIndex: number;
  targetStatus: JobStatus | null;
  targetIndex: number;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

const EDGE_SCROLL_ZONE = 56;
const EDGE_SCROLL_STEP = 20;

function laneClass(status: JobStatus) {
  return `lane-${status.toLowerCase().replace(/\s+/g, "-")}`;
}

function routedDestinationLabel(destination?: EmailRouteDestination) {
  if (destination === "job_setup") return "Job Setup";
  if (destination === "estimate") return "Estimate / Calculation";
  if (destination === "design") return "Graphics / Prepress";
  if (destination === "production") return "Printing / Production";
  if (destination === "finishing") return "Finishing";
  if (destination === "billing") return "Billing / Accounting";
  if (destination === "existing_job") return "Existing Job";
  return "Assigned work";
}

function formatCompletedAt(value?: string) {
  if (!value) return "Completed";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Completed";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function routedAge(ticket: EmailIntakeTicket) {
  const started = new Date(ticket.routedAt ?? ticket.updatedAt).getTime();
  if (!Number.isFinite(started)) return "Assigned";
  const hours = Math.max(0, Math.floor((Date.now() - started) / (60 * 60 * 1000)));
  if (hours < 1) return "Just assigned";
  if (hours < 24) return `${hours}h in queue`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} in queue`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function Workflow({
  jobs,
  onMoveJob,
  onSelectJob,
  onEditJob,
  onImportJobs,
  canEditJobs = true,
  canImportJobs = true,
  canViewPricing = true,
  routedTickets = [],
  currentUserId,
  currentRole = "front_desk",
  authToken,
  onOpenRoutedTicket,
  onViewRoutedTicket,
  onCompleteRoutedTicket,
  focusAssignedWork = false,
  mode = "workflow"
}: WorkflowProps) {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [drag, setDrag] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const assignedWorkRef = useRef<HTMLElement | null>(null);
  const onMoveJobRef = useRef(onMoveJob);
  const visibleJobs = useMemo(() => jobs.filter((job) => !job.archived && !job.deletedAt && job.status !== "Delivered"), [jobs]);
  const assignedTicketIsVisible = (ticket: EmailIntakeTicket) => {
    if (currentRole === "admin") return true;
    if (ticket.assignedToUserId) return ticket.assignedToUserId === currentUserId;
    return ticket.assignedRole === currentRole;
  };
  const visibleRoutedTickets = useMemo(() => routedTickets
    .filter((ticket) => Boolean(ticket.routedAt) && !ticket.routeCompletedAt && ticket.status !== "Converted" && ticket.status !== "Archived" && ticket.status !== "Ignored")
    .filter(assignedTicketIsVisible)
    .sort((a, b) => new Date(a.routedAt ?? a.updatedAt).getTime() - new Date(b.routedAt ?? b.updatedAt).getTime()),
  [routedTickets, currentRole, currentUserId]);
  const completedRoutedTickets = useMemo(() => routedTickets
    .filter((ticket) => Boolean(ticket.routedAt) && Boolean(ticket.routeCompletedAt))
    .filter(assignedTicketIsVisible)
    .sort((a, b) => new Date(b.routeCompletedAt ?? b.updatedAt).getTime() - new Date(a.routeCompletedAt ?? a.updatedAt).getTime()),
  [routedTickets, currentRole, currentUserId]);
  const recentCompletedJobs = useMemo(() => jobs
    .filter((job) => !job.deletedAt && job.status === "Delivered")
    .filter((job) => Date.now() - new Date(job.updatedAt).getTime() <= 7 * 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [jobs]);
  const sortedVisibleJobs = useMemo(() => sortWorkflowJobs(visibleJobs), [visibleJobs]);
  const draggedJob = drag ? visibleJobs.find((job) => job.id === drag.jobId) : undefined;

  async function openRoutedAttachment(source: NonNullable<EmailIntakeTicket["sourceAttachments"]>[number], action: "open" | "download") {
    if (!source.providerMessageId || !source.providerAttachmentId) return;
    const response = await fetch("/api/email/attachment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({
        messageId: source.providerMessageId,
        attachmentId: source.providerAttachmentId,
        uidValidity: source.uidValidity,
        filename: source.filename,
        mimeType: source.mimeType,
        folder: source.mailboxFolder === "sent" ? "sent" : "inbox",
        disposition: action === "open" ? "inline" : "attachment"
      })
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (action === "open") {
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = source.filename || "attachment";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
  }

  useEffect(() => {
    onMoveJobRef.current = onMoveJob;
  }, [onMoveJob]);

  useEffect(() => {
    if (!focusAssignedWork) return;
    window.requestAnimationFrame(() => assignedWorkRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [focusAssignedWork, visibleRoutedTickets.length, completedRoutedTickets.length]);

  const jobsByStatus = useMemo(() => {
    const lanes = new Map<JobStatus, Job[]>();
    WORKFLOW_STATUSES.forEach((status) => {
      lanes.set(status, sortWorkflowJobs(visibleJobs.filter((job) => job.status === status)));
    });
    return lanes;
  }, [visibleJobs]);

  function locateDropTarget(clientX: number, clientY: number, draggedId: string) {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const lane = element?.closest("[data-workflow-status]") as HTMLElement | null;
    if (!lane) return { status: null, index: 0 };
    const status = lane.dataset.workflowStatus as JobStatus;
    if (!WORKFLOW_STATUSES.includes(status)) return { status: null, index: 0 };

    const cards = Array.from(lane.querySelectorAll<HTMLElement>("[data-job-id]"))
      .filter((card) => card.dataset.jobId !== draggedId && !card.closest(".workflow-drag-overlay"));
    let index = cards.length;
    for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
      const rect = cards[cardIndex].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        index = cardIndex;
        break;
      }
    }
    return { status, index };
  }

  function beginDrag(job: Job, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const card = event.currentTarget.closest("[data-job-id]") as HTMLElement | null;
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = card.getBoundingClientRect();
    const sourceJobs = jobsByStatus.get(job.status) ?? [];
    const sourceIndex = Math.max(0, sourceJobs.findIndex((item) => item.id === job.id));
    setDrag({
      jobId: job.id,
      pointerId: event.pointerId,
      sourceStatus: job.status,
      sourceIndex,
      targetStatus: job.status,
      targetIndex: sourceIndex,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height
    });
  }

  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;
    document.body.classList.add("workflow-drag-active");

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) return;
      event.preventDefault();
      const board = boardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        if (event.clientX < rect.left + EDGE_SCROLL_ZONE) board.scrollLeft -= EDGE_SCROLL_STEP;
        else if (event.clientX > rect.right - EDGE_SCROLL_ZONE) board.scrollLeft += EDGE_SCROLL_STEP;
      }
      const target = locateDropTarget(event.clientX, event.clientY, activeDrag.jobId);
      setDrag((current) => current && current.pointerId === event.pointerId
        ? {
            ...current,
            clientX: event.clientX,
            clientY: event.clientY,
            targetStatus: target.status,
            targetIndex: target.index
          }
        : current);
    }

    function finishDrag(event: PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) return;
      event.preventDefault();
      const target = locateDropTarget(event.clientX, event.clientY, activeDrag.jobId);
      if (target.status) onMoveJobRef.current(activeDrag.jobId, target.status, target.index);
      setDrag(null);
    }

    function cancelDrag(event: PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) return;
      setDrag(null);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag, { passive: false });
    window.addEventListener("pointercancel", cancelDrag);
    return () => {
      document.body.classList.remove("workflow-drag-active");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
    };
  }, [drag?.jobId, drag?.pointerId]);

  function renderLaneItems(status: JobStatus) {
    const laneJobs = jobsByStatus.get(status) ?? [];
    if (!drag) {
      return laneJobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onClick={() => onSelectJob(job.id)}
          onDragHandlePointerDown={(event) => beginDrag(job, event)}
          showPricing={canViewPricing}
        />
      ));
    }

    const withoutDragged = laneJobs.filter((job) => job.id !== drag.jobId);
    const items: ReactNode[] = withoutDragged.map((job) => (
      <JobCard
        key={job.id}
        job={job}
        onClick={() => onSelectJob(job.id)}
        onDragHandlePointerDown={(event) => beginDrag(job, event)}
        showPricing={canViewPricing}
      />
    ));

    const insertPlaceholder = (index: number, kind: "source" | "target") => {
      items.splice(
        clamp(index, 0, items.length),
        0,
        <div
          className={`workflow-card-placeholder ${kind}`}
          style={{ height: drag.height }}
          key={`${kind}-placeholder-${status}`}
          aria-hidden="true"
        />
      );
    };

    if (drag.targetStatus === status) {
      insertPlaceholder(drag.targetIndex, "target");
    } else if (drag.sourceStatus === status) {
      insertPlaceholder(drag.sourceIndex, "source");
    }
    return items;
  }

  const assignedWorkPanel = (
<section className="workflow-assigned-work panel" ref={assignedWorkRef}>
        <div className="workflow-assigned-heading">
          <div>
            <Ticket size={18} />
            <span>
              <strong>{currentRole === "admin" ? "All assigned work" : "My assigned work"}</strong>
              <small>{currentRole === "admin" ? "Owner/Admin sees every routed task and who currently has it." : "Work assigned to you from Email Center appears here."}</small>
            </span>
          </div>
          <b>{visibleRoutedTickets.length}</b>
        </div>
        {visibleRoutedTickets.length ? (
          <div className="workflow-assigned-grid">
            {visibleRoutedTickets.map((ticket) => (
              <article className="workflow-assigned-card" key={ticket.id}>
                <div className="workflow-assigned-card-top">
                  <span className="soft-chip">{routedDestinationLabel(ticket.routeDestination)}</span>
                  <small><Clock3 size={12} /> {routedAge(ticket)}</small>
                </div>
                <strong>{ticket.ticketNumber ?? "Job Ticket"} · {ticket.subject || "No subject"}</strong>
                <p>{ticket.summary || ticket.notes || "No internal description."}</p>
                <div className="workflow-assigned-meta">
                  <span><UserRound size={13} /> Currently with: {ticket.assignedToName || ticket.assignedDepartment || ticket.assignedRole || "Assigned staff"}</span>
                  {ticket.sourceAttachments?.length ? <span><Paperclip size={13} /> {ticket.sourceAttachments.length} file{ticket.sourceAttachments.length === 1 ? "" : "s"}</span> : null}
                </div>
                {ticket.routingNote ? <div className="workflow-assigned-note"><FileText size={13} /><span>{ticket.routingNote}</span></div> : null}
                {ticket.sourceAttachments?.length && (currentRole === "admin" || currentRole === "front_desk" || currentRole === "prepress") ? (
                  <div className="workflow-assigned-files">
                    {ticket.sourceAttachments.slice(0, 6).map((source) => (
                      <span key={source.id}>
                        <b>{source.filename}</b>
                        <button type="button" onClick={() => void openRoutedAttachment(source, "open")}>Open</button>
                        <button type="button" onClick={() => void openRoutedAttachment(source, "download")}>Download</button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="workflow-assigned-actions">
                  {onViewRoutedTicket && (currentRole === "admin" || currentRole === "front_desk") ? (
                    <button className="secondary-button" type="button" onClick={() => onViewRoutedTicket(ticket.id)}>View ticket</button>
                  ) : null}
                  {onOpenRoutedTicket && (currentRole === "admin" || currentRole === "front_desk") && (ticket.routeDestination === "job_setup" || ticket.routeDestination === "estimate") ? (
                    <button className="secondary-button" type="button" onClick={() => onOpenRoutedTicket(ticket.id)}>Open setup</button>
                  ) : null}
                  {onCompleteRoutedTicket ? (
                    <button className="primary-button" type="button" onClick={() => onCompleteRoutedTicket(ticket.id)}><CheckCircle2 size={15} /> Done</button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="workflow-assigned-empty">No active assigned work is waiting right now.</div>
        )}

        <div className="workflow-assigned-history">
          <div className="workflow-assigned-history-heading">
            <span>
              <CheckCircle2 size={16} />
              <strong>{currentRole === "admin" ? "Recently completed assignments" : "My recently completed assignments"}</strong>
            </span>
            <b>{completedRoutedTickets.length}</b>
          </div>
          {completedRoutedTickets.length ? (
            <div className="workflow-assigned-history-list">
              {completedRoutedTickets.slice(0, 12).map((ticket) => (
                <article key={`${ticket.id}-completed`}>
                  <div>
                    <strong>{ticket.ticketNumber ?? "Job Ticket"} · {ticket.subject || "No subject"}</strong>
                    <span>
                      {routedDestinationLabel(ticket.routeDestination)} · Assigned to {ticket.assignedToName || ticket.assignedDepartment || ticket.assignedRole || "Assigned staff"}
                    </span>
                  </div>
                  <div>
                    <span>Completed by {ticket.routeCompletedBy || "staff"}</span>
                    <small>{formatCompletedAt(ticket.routeCompletedAt)}</small>
                    {onViewRoutedTicket && (currentRole === "admin" || currentRole === "front_desk") ? (
                      <button type="button" onClick={() => onViewRoutedTicket(ticket.id)}>View ticket</button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="workflow-assigned-empty compact">No completed assignments yet.</div>
          )}
        </div>
      </section>
  );

  if (mode === "assigned") {
    return (
      <main className="page-view assigned-work-page">
        <div className="section-heading assigned-work-page-heading">
          <div>
            <p>Assigned Work</p>
            <h1>{currentRole === "admin" ? "Every assigned task in one place" : "Your assigned work"}</h1>
            <span className="section-subtitle">{currentRole === "admin" ? "See what is waiting, who has it, and what was recently completed — without the production workflow board." : "See only the tasks assigned to you and your recently completed work."}</span>
          </div>
        </div>
        {assignedWorkPanel}
      </main>
    );
  }

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Workflow</p>
          <h1>One production board for every job</h1>
        </div>
        <div className="toolbar-actions">
          {canImportJobs ? (
            <ImportExportToolbar
              label="Jobs"
              filename="gross-printing-jobs.xlsx"
              rows={visibleJobs as unknown as Record<string, unknown>[]}
              onImport={onImportJobs}
            />
          ) : null}
          <div className="segmented compact-toggle">
            <button className={view === "kanban" ? "active" : ""} type="button" onClick={() => setView("kanban")} title="Kanban view">
              <LayoutGrid size={16} />
            </button>
            <button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")} title="List view">
              <List size={16} />
            </button>
          </div>
        </div>
      </div>


      {view === "kanban" ? (
        <div className="kanban-board" ref={boardRef}>
          {WORKFLOW_STATUSES.filter((status) => status !== "Delivered").map((status) => {
            const statusJobs = jobsByStatus.get(status) ?? [];
            return (
              <section
                className={`kanban-column ${laneClass(status)} ${drag?.targetStatus === status ? "drop-target" : ""}`}
                key={status}
                data-workflow-status={status}
              >
                <div className="kanban-heading">
                  <StatusBadge status={status} />
                  <span>{statusJobs.length}</span>
                </div>
                <div className="kanban-stack">{renderLaneItems(status)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="panel table-panel primary-data-table">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Due</th>
                <th>Qty</th>
                {canViewPricing ? <th>Total</th> : null}
                {canEditJobs ? <th>Edit</th> : null}
              </tr>
            </thead>
            <tbody>
              {sortedVisibleJobs.map((job) => (
                <tr key={job.id} onClick={() => onSelectJob(job.id)}>
                  <td>
                    <strong>{job.jobNumber}</strong>
                    <span>{job.title}</span>
                  </td>
                  <td>{job.customerName}</td>
                  <td>
                    <div className="badge-row">
                      <StatusBadge status={job.status} />
                      <RushBadge rush={job.rush} />
                    </div>
                  </td>
                  <td>{formatDateTime(job.dueDate, job.dueTime)}</td>
                  <td>{job.quantity.toLocaleString()}</td>
                  {canViewPricing ? <td>{formatMoney(job.pricing.total)}</td> : null}
                  {canEditJobs ? (
                    <td>
                      <button
                        className="icon-button text-button small"
                        type="button"
                        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          onEditJob(job.id);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {drag && draggedJob ? (
        <div
          className="workflow-drag-overlay"
          style={{
            width: drag.width,
            height: drag.height,
            transform: `translate3d(${drag.clientX - drag.offsetX}px, ${drag.clientY - drag.offsetY}px, 0)`
          }}
          aria-hidden="true"
        >
          <JobCard job={draggedJob} onClick={() => undefined} overlay showPricing={canViewPricing} />
        </div>
      ) : null}

      {recentCompletedJobs.length ? (
        <details className="recent-history-panel workflow-recent-completed">
          <summary><CheckCircle2 size={16} /> Recently completed <span>{recentCompletedJobs.length}</span></summary>
          <div className="recent-history-list">
            {recentCompletedJobs.map((job) => (
              <button type="button" key={job.id} onClick={() => onSelectJob(job.id)}>
                <span><strong>{job.jobNumber}</strong><small>{job.customerName} · {job.title}</small></span>
                <b>Delivered</b>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </main>
  );
}
