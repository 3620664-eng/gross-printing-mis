import { isRushDue, statusAfterDrop } from "./pricing";
import type { Job, JobStatus } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dueTime(job: Job) {
  const due = new Date(`${job.dueDate}T${job.dueTime || "17:00"}`);
  return Number.isFinite(due.getTime()) ? due.getTime() : Number.MAX_SAFE_INTEGER;
}

function duePriority(job: Job) {
  const due = new Date(dueTime(job));
  if (!Number.isFinite(due.getTime())) return 4;
  const diffDays = Math.round((startOfLocalDay(due) - startOfLocalDay(new Date())) / DAY_MS);
  if (diffDays < 0) return 1;
  if (diffDays === 0) return 2;
  if (diffDays === 1) return 3;
  return 4;
}

export function sortWorkflowJobs(statusJobs: Job[]) {
  return [...statusJobs].sort((a, b) => {
    if (a.status === b.status) {
      const aOrder = Number.isFinite(a.workflowOrder) ? Number(a.workflowOrder) : undefined;
      const bOrder = Number.isFinite(b.workflowOrder) ? Number(b.workflowOrder) : undefined;
      if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) return aOrder - bOrder;
      if (aOrder !== undefined && bOrder === undefined) return -1;
      if (aOrder === undefined && bOrder !== undefined) return 1;
    }
    if (a.rush !== b.rush) return a.rush ? -1 : 1;
    const priority = duePriority(a) - duePriority(b);
    if (priority) return priority;
    const due = dueTime(a) - dueTime(b);
    if (due) return due;
    return a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true });
  });
}

export function placeJobInWorkflow(
  jobs: Job[],
  jobId: string,
  requestedStatus: JobStatus,
  targetIndex: number | undefined,
  movedAt: string
) {
  const original = jobs.find((job) => job.id === jobId);
  if (!original) return undefined;

  const finalStatus = statusAfterDrop(original.status, requestedStatus);
  const sourceStatus = original.status;
  const sourceLane = sortWorkflowJobs(
    jobs.filter((job) => job.id !== jobId && job.status === sourceStatus && !job.archived && !job.deletedAt)
  );
  const targetLane = finalStatus === sourceStatus
    ? sourceLane
    : sortWorkflowJobs(
        jobs.filter((job) => job.id !== jobId && job.status === finalStatus && !job.archived && !job.deletedAt)
      );
  const insertionIndex = Math.min(
    targetLane.length,
    Math.max(0, targetIndex === undefined ? targetLane.length : targetIndex)
  );

  const movedJob: Job = {
    ...original,
    status: finalStatus,
    invoiceId: finalStatus === "Ready" || finalStatus === "Delivered" ? `inv-${original.id}` : original.invoiceId,
    rush: isRushDue(original.dueDate, original.dueTime),
    updatedAt: movedAt
  };
  const orderedTargetLane = [...targetLane];
  orderedTargetLane.splice(insertionIndex, 0, movedJob);
  const orderUpdates = new Map<string, number>();
  orderedTargetLane.forEach((job, index) => orderUpdates.set(job.id, (index + 1) * 100));
  if (sourceStatus !== finalStatus) {
    sourceLane.forEach((job, index) => orderUpdates.set(job.id, (index + 1) * 100));
  }

  const nextJobs = jobs.map((job) => {
    if (job.id === jobId) return { ...movedJob, workflowOrder: orderUpdates.get(job.id) };
    const workflowOrder = orderUpdates.get(job.id);
    return workflowOrder === undefined ? job : { ...job, workflowOrder };
  });

  return {
    jobs: nextJobs,
    movedJob: { ...movedJob, workflowOrder: orderUpdates.get(jobId) },
    sourceStatus,
    finalStatus,
    statusChanged: sourceStatus !== finalStatus
  };
}
