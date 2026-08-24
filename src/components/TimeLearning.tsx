"use client";

import { Play, Square } from "lucide-react";
import { useState } from "react";
import { TIME_LABELS } from "@/lib/pricing";
import type { Job, TimeCategory } from "@/lib/types";
import { RecordModal } from "./RecordModal";
import { StatusBadge } from "./StatusBadge";

interface TimeLearningProps {
  jobs: Job[];
  activeTimer?: { jobId: string; category: TimeCategory; startedAt: string };
  onStartTimer: (jobId: string, category: TimeCategory) => void;
  onStopTimer: () => void;
  onManualTime: (jobId: string, category: TimeCategory, minutes: number, note?: string) => void;
}

const categories = Object.keys(TIME_LABELS) as TimeCategory[];

export function TimeLearning({ jobs, activeTimer, onStartTimer, onStopTimer, onManualTime }: TimeLearningProps) {
  const liveJobs = jobs.filter((job) => !job.archived && !job.deletedAt && job.status !== "Quote");
  const [selectedId, setSelectedId] = useState("");
  const [manualMinutes, setManualMinutes] = useState(15);
  const selected = liveJobs.find((job) => job.id === selectedId);

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Time Learning</p>
          <h1>Actual production time for smarter estimating later</h1>
        </div>
      </div>

      <div>
        <section className="panel table-panel primary-data-table">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Total tracked</th>
              </tr>
            </thead>
            <tbody>
              {liveJobs.map((job) => {
                const total = categories.reduce((sum, category) => sum + job.time[category], 0);
                return (
                  <tr className={job.id === selected?.id ? "selected-row" : ""} key={job.id} onClick={() => setSelectedId(job.id)}>
                    <td>
                      <strong>{job.jobNumber}</strong>
                      <span>{job.title}</span>
                    </td>
                    <td><StatusBadge status={job.status} /></td>
                    <td>{total} min</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

      </div>

      {selected ? (
        <RecordModal title={selected.title} eyebrow={selected.status} subtitle={selected.jobNumber} onClose={() => setSelectedId("")}>
          <div className="manual-entry">
            <label>
              Manual time entry
              <input type="number" min="1" value={manualMinutes} onChange={(event) => setManualMinutes(Number(event.target.value))} />
            </label>
          </div>
          <div className="time-list large">
            {categories.map((category) => {
              const running = activeTimer?.jobId === selected.id && activeTimer?.category === category;
              return (
                <div className="time-row" key={category}>
                  <div>
                    <span>{TIME_LABELS[category]}</span>
                    <strong>{selected.time[category]} min</strong>
                  </div>
                  <div className="time-actions">
                    <button className="icon-button text-button" type="button" onClick={() => (running ? onStopTimer() : onStartTimer(selected.id, category))}>
                      {running ? <Square size={16} /> : <Play size={16} />}
                      {running ? "Stop Timer" : "Start Timer"}
                    </button>
                    <button className="icon-button text-button" type="button" onClick={() => onManualTime(selected.id, category, manualMinutes, "Manual time entry")}>
                      Add {manualMinutes} min
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="learning-note">
            <strong>Learning signal</strong>
            <span>Future estimating can compare similar stock, piece size, quantity, bindery, and machine path against this actual time.</span>
          </div>
        </RecordModal>
      ) : null}
    </main>
  );
}
