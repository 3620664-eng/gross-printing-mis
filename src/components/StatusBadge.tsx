import clsx from "clsx";
import type { JobStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: JobStatus | string }) {
  return <span className={clsx("status-badge", `status-${status.toLowerCase().replaceAll(" ", "-")}`)}>{status}</span>;
}

export function RushBadge({ rush }: { rush?: boolean }) {
  if (!rush) return null;
  return <span className="rush-badge">Rush</span>;
}
