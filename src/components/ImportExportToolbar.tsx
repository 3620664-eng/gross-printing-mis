"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { exportRowsToExcel, importRowsFromExcel } from "@/lib/excel";

interface ImportExportToolbarProps<T extends Record<string, unknown>> {
  label: string;
  filename: string;
  rows: T[];
  onImport?: (rows: T[]) => void;
}

export function ImportExportToolbar<T extends Record<string, unknown>>({
  label,
  filename,
  rows,
  onImport
}: ImportExportToolbarProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      await exportRowsToExcel(filename, label, rows);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File | null) {
    if (!file || !onImport) return;
    setBusy(true);
    try {
      const imported = await importRowsFromExcel<T>(file);
      onImport(imported);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="toolbar-actions">
      <button className="icon-button text-button" type="button" onClick={handleExport} disabled={busy}>
        <Download size={16} />
        Export Excel
      </button>
      {onImport ? (
        <>
          <button className="icon-button text-button" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload size={16} />
            Import Excel
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => void handleImport(event.target.files?.[0] ?? null)}
          />
        </>
      ) : null}
    </div>
  );
}
