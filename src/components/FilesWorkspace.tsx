"use client";

import { Archive, Download, FileStack, FileText, FolderUp, Image, RotateCcw, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Customer, Job, UploadedFile } from "@/lib/types";
import { RecordModal } from "./RecordModal";

interface FilesWorkspaceProps {
  files: UploadedFile[];
  customers: Customer[];
  jobs: Job[];
  onUploadFiles: (files: File[], folder: UploadedFile["folder"], customerId?: string, jobId?: string) => void;
  onArchiveFile: (fileId: string) => void;
  onRestoreFile: (fileId: string) => void;
  onOpenFile: (fileId: string) => void;
  focusedCustomerId?: string;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const folders: UploadedFile["folder"][] = ["Active Artwork", "Proofs", "Invoices", "Customer Files", "Archive"];

export function FilesWorkspace({ files, customers, jobs, onUploadFiles, onArchiveFile, onRestoreFile, onOpenFile, focusedCustomerId }: FilesWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [activeFolder, setActiveFolder] = useState<UploadedFile["folder"]>("Active Artwork");
  const [customerId, setCustomerId] = useState("");
  const [jobId, setJobId] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "pdf" | "images" | "documents" | "other">("all");
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "name">("newest");

  useEffect(() => {
    if (focusedCustomerId) {
      setCustomerId(focusedCustomerId);
      setActiveFolder("Customer Files");
      return;
    }
    setCustomerId("");
  }, [focusedCustomerId]);

  const visibleFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matchesType = (file: UploadedFile) => {
      const name = file.name.toLowerCase();
      const type = file.type.toLowerCase();
      const isPdf = type.includes("pdf") || name.endsWith(".pdf");
      const isImage = type.startsWith("image/") || /\.(png|jpe?g|gif|webp|tiff?)$/i.test(name);
      const isDocument = /\.(docx?|xlsx?|csv|txt|rtf|pptx?)$/i.test(name) || /word|excel|spreadsheet|text|presentation/.test(type);
      if (typeFilter === "pdf") return isPdf;
      if (typeFilter === "images") return isImage;
      if (typeFilter === "documents") return isDocument;
      if (typeFilter === "other") return !isPdf && !isImage && !isDocument;
      return true;
    };

    return files
      .filter((file) => {
        if (file.deletedAt) return false;
        const matchesFolder = activeFolder === "Archive"
          ? file.folder === "Archive" || file.status === "Archived"
          : file.folder === activeFolder && file.status !== "Archived";
        const matchesCustomer = !focusedCustomerId || file.customerId === focusedCustomerId;
        const searchable = `${file.name} ${file.customerName ?? ""} ${file.jobNumber ?? ""} ${file.orderNumber ?? ""}`.toLowerCase();
        return matchesFolder && matchesCustomer && (!query || searchable.includes(query)) && matchesType(file);
      })
      .sort((left, right) => {
        if (sortMode === "name") return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
        const leftTime = new Date(left.uploadedAt).getTime() || 0;
        const rightTime = new Date(right.uploadedAt).getTime() || 0;
        return sortMode === "oldest" ? leftTime - rightTime : rightTime - leftTime;
      });
  }, [files, activeFolder, focusedCustomerId, searchQuery, sortMode, typeFilter]);
  const selectedFile = files.find((file) => file.id === selectedFileId);

  function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    onUploadFiles(Array.from(fileList), activeFolder, customerId || undefined, jobId || undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Files</p>
          <h1>Artwork, proofs, customer folders, and active uploads</h1>
        </div>
        <div className="toolbar-actions">
          <button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            Upload files
          </button>
          <button className="icon-button text-button" type="button" onClick={() => folderInputRef.current?.click()}>
            <FolderUp size={16} />
            Upload folder
          </button>
          <input ref={fileInputRef} className="sr-only" type="file" multiple onChange={(event) => handleFiles(event.target.files)} />
          <input
            ref={folderInputRef}
            className="sr-only"
            type="file"
            multiple
            {...{ webkitdirectory: "true", directory: "" }}
            onChange={(event) => handleFiles(event.target.files)}
          />
        </div>
      </div>

      <div className="files-layout">
        <aside className="panel files-sidebar">
          <div className="panel-heading">
            <h2>Folders</h2>
            <FileStack size={18} />
          </div>
          <div className="folder-list">
            {folders.map((folder) => {
              const count = files.filter((file) => {
                if (file.deletedAt) return false;
                const matchesFolder = folder === "Archive"
                  ? file.folder === "Archive" || file.status === "Archived"
                  : file.folder === folder && file.status !== "Archived";
                return matchesFolder && (!focusedCustomerId || file.customerId === focusedCustomerId);
              }).length;
              return (
                <button className={activeFolder === folder ? "active" : ""} type="button" key={folder} onClick={() => setActiveFolder(folder)}>
                  <span>{folder}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </div>
          <label>
            Link new uploads to customer
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">No customer link</option>
              {customers.filter((customer) => !customer.archived && !customer.deletedAt).map((customer) => (
                <option value={customer.id} key={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          <label>
            Link new uploads to job
            <select value={jobId} onChange={(event) => setJobId(event.target.value)}>
              <option value="">No job link</option>
              {jobs.filter((job) => !job.archived && !job.deletedAt).map((job) => (
                <option value={job.id} key={job.id}>{job.jobNumber} / {job.title}</option>
              ))}
            </select>
          </label>
        </aside>

        <section className="panel files-panel">
          <div className="panel-heading files-panel-heading">
            <div>
              <h2>{activeFolder}</h2>
              <span>{visibleFiles.length} file{visibleFiles.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div className="files-card-toolbar">
            <label className="files-search">
              <Search size={16} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search files, customer, or job number…" />
            </label>
            <select aria-label="Filter file type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
              <option value="all">All types</option>
              <option value="pdf">PDF</option>
              <option value="images">Images</option>
              <option value="documents">Documents</option>
              <option value="other">Other</option>
            </select>
            <select aria-label="Sort files" value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
          <div className="file-grid file-grid-clean-cards">
            {visibleFiles.map((file) => {
              const isArchivedFile = file.folder === "Archive" || file.status === "Archived";
              return (
                <article className="file-card file-card-clean" key={file.id} onClick={() => setSelectedFileId(file.id)}>
                  <div className="file-preview file-preview-clean">
                    {file.preview ? <img src={file.preview} alt={`Preview of ${file.name}`} /> : (file.name.toLowerCase().endsWith(".pdf") ? <FileText size={34} /> : <Image size={34} />)}
                    <span className="file-type-badge">{file.name.includes(".") ? file.name.split(".").pop()?.slice(0, 5).toUpperCase() : "FILE"}</span>
                  </div>
                  <div className="file-card-copy">
                    <strong title={file.name}>{file.name}</strong>
                    <span>{file.customerName || "Unassigned"}{file.orderNumber ? ` / ${file.orderNumber}` : ""}{file.jobNumber ? ` / ${file.jobNumber}` : ""}</span>
                    <small>{formatBytes(file.size)} · {new Date(file.uploadedAt).toLocaleString()}</small>
                  </div>
                  <div className="file-card-bottom">
                    <span className="soft-chip">{file.status}</span>
                    {isArchivedFile ? (
                      <button className="icon-button text-button small" type="button" onClick={(event) => {
                        event.stopPropagation();
                        onRestoreFile(file.id);
                      }}>
                        <RotateCcw size={14} />
                        Restore
                      </button>
                    ) : (
                      <button className="icon-button text-button small" type="button" onClick={(event) => {
                        event.stopPropagation();
                        onArchiveFile(file.id);
                      }}>
                        <Archive size={14} />
                        Archive
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {!visibleFiles.length ? (
              <div className="empty-state">
                <FileStack size={34} />
                <strong>No files in this folder yet</strong>
                <span>Upload artwork files or a customer folder and they will stay in this workspace for linking to jobs later.</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {selectedFile ? (
        <RecordModal title={selectedFile.name} eyebrow={selectedFile.folder} subtitle={selectedFile.customerName || "Unassigned file"} onClose={() => setSelectedFileId("")}>
          <div className="file-detail-modal">
            <div className="file-preview large">
              {selectedFile.preview ? <img src={selectedFile.preview} alt="" /> : <Image size={42} />}
            </div>
            <div className="pricing-breakdown">
              <div><span>Status</span><strong>{selectedFile.status}</strong></div>
              <div><span>Size</span><strong>{formatBytes(selectedFile.size)}</strong></div>
              <div><span>Uploaded</span><strong>{new Date(selectedFile.uploadedAt).toLocaleString()}</strong></div>
              <div><span>Order</span><strong>{selectedFile.orderNumber ?? "No order link"}</strong></div><div><span>Job</span><strong>{selectedFile.jobNumber ?? "No job link"}</strong></div>
            </div>
            <button className="primary-button full" type="button" onClick={() => onOpenFile(selectedFile.id)}>
              <Download size={16} />
              Open or download file
            </button>
            {selectedFile.folder === "Archive" || selectedFile.status === "Archived" ? (
              <button className="icon-button text-button full" type="button" onClick={() => onRestoreFile(selectedFile.id)}>
                <RotateCcw size={16} />
                Restore file
              </button>
            ) : (
              <button className="icon-button text-button full" type="button" onClick={() => onArchiveFile(selectedFile.id)}>
                <Archive size={16} />
                Archive file
              </button>
            )}
          </div>
        </RecordModal>
      ) : null}
    </main>
  );
}
