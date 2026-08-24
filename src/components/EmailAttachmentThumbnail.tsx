"use client";

import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import type { EmailMessage, EmailSourceAttachmentRef } from "@/lib/types";

const attachmentThumbnailCache = new Map<string, string>();
const attachmentBlobCache = new Map<string, Blob>();
const attachmentBlobRequests = new Map<string, Promise<Blob>>();

function sourceAttachmentCacheKey(source: Pick<EmailSourceAttachmentRef, "id" | "providerMessageId" | "providerAttachmentId" | "uidValidity">) {
  return `${source.providerMessageId ?? source.id}:${source.providerAttachmentId ?? source.id}:${source.uidValidity ?? ""}`;
}

export function emailAttachmentCacheKey(message: EmailMessage, attachment: EmailMessage["attachments"][number]) {
  return `${message.providerMessageId ?? message.id}:${attachment.providerAttachmentId ?? attachment.id}:${message.uidValidity ?? attachment.uidValidity ?? ""}`;
}

async function fetchAttachmentBlobRequest(
  authToken: string,
  requestBody: {
    messageId?: string;
    folder?: "inbox" | "sent";
    attachmentId?: string;
    uidValidity?: string;
    filename?: string;
    mimeType?: string;
  },
  externalSignal?: AbortSignal
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20_000);
  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch("/api/email/attachment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ ...requestBody, disposition: "inline" }),
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? "Unable to load attachment.");
    }
    return response.blob();
  } catch (error) {
    if (externalSignal?.aborted) throw new DOMException("Attachment opening was cancelled.", "AbortError");
    if (timedOut || (error instanceof DOMException && error.name === "AbortError")) {
      throw new Error("This file is taking longer than expected. Close this window or try again; the original file remains linked to the email.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function fetchCachedAttachmentBlob(
  key: string,
  authToken: string,
  requestBody: {
    messageId?: string;
    folder?: "inbox" | "sent";
    attachmentId?: string;
    uidValidity?: string;
    filename?: string;
    mimeType?: string;
  },
  options: { signal?: AbortSignal } = {}
) {
  const cached = attachmentBlobCache.get(key);
  if (cached) return cached;

  // A user-opened preview gets its own cancellable request. Background thumbnails
  // share one request per file so the mailbox is never hit repeatedly for the same bytes.
  if (options.signal) {
    const blob = await fetchAttachmentBlobRequest(authToken, requestBody, options.signal);
    attachmentBlobCache.set(key, blob);
    return blob;
  }

  const existingRequest = attachmentBlobRequests.get(key);
  if (existingRequest) return existingRequest;
  const request = fetchAttachmentBlobRequest(authToken, requestBody)
    .then((blob) => {
      attachmentBlobCache.set(key, blob);
      return blob;
    })
    .finally(() => attachmentBlobRequests.delete(key));
  attachmentBlobRequests.set(key, request);
  return request;
}

export async function getEmailAttachmentBlob(
  authToken: string,
  message: EmailMessage,
  attachment: EmailMessage["attachments"][number],
  options: { signal?: AbortSignal } = {}
) {
  return fetchCachedAttachmentBlob(emailAttachmentCacheKey(message, attachment), authToken, {
    messageId: message.providerMessageId,
    folder: message.mailboxFolder === "sent" ? "sent" : "inbox",
    attachmentId: attachment.providerAttachmentId,
    uidValidity: message.uidValidity ?? attachment.uidValidity,
    filename: attachment.filename,
    mimeType: attachment.mimeType
  }, options);
}

export async function getEmailSourceAttachmentBlob(
  authToken: string,
  source: EmailSourceAttachmentRef,
  options: { signal?: AbortSignal } = {}
) {
  return fetchCachedAttachmentBlob(sourceAttachmentCacheKey(source), authToken, {
    messageId: source.providerMessageId,
    folder: source.mailboxFolder === "sent" ? "sent" : "inbox",
    attachmentId: source.providerAttachmentId || (/part-\d+$/.test(source.id) ? source.id.match(/part-\d+$/)?.[0] : undefined),
    uidValidity: source.uidValidity,
    filename: source.filename,
    mimeType: source.mimeType
  }, options);
}


export function attachmentPreviewKind(attachment: EmailMessage["attachments"][number]) {
  const name = attachment.filename.toLowerCase();
  const mime = attachment.mimeType.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf" as const;
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(name)) return "image" as const;
  return "other" as const;
}

function configurePdfWorker(pdfjs: typeof import("pdfjs-dist")) {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  pdfjs.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
}

async function imageBlobThumbnail(blob: Blob) {
  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new window.Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("Image preview could not be rendered."));
      next.src = sourceUrl;
    });
    const maxWidth = 150;
    const maxHeight = 96;
    const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth), maxHeight / Math.max(1, image.naturalHeight));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image preview could not be rendered.");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function pdfBlobThumbnail(blob: Blob) {
  const pdfjs = await import("pdfjs-dist");
  configurePdfWorker(pdfjs);
  const bytes = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const natural = page.getViewport({ scale: 1 });
  const scale = Math.min(1.2, 150 / Math.max(1, natural.width), 96 / Math.max(1, natural.height));
  const viewport = page.getViewport({ scale: Math.max(0.2, scale) });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDF preview could not be rendered.");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function EmailAttachmentThumbnail({
  authToken,
  message,
  attachment,
  onOpen
}: {
  authToken?: string;
  message: EmailMessage;
  attachment: EmailMessage["attachments"][number];
  onOpen: () => void;
}) {
  const kind = attachmentPreviewKind(attachment);
  const cacheKey = emailAttachmentCacheKey(message, attachment);
  const [thumbnail, setThumbnail] = useState(() => attachmentThumbnailCache.get(cacheKey) ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = attachmentThumbnailCache.get(cacheKey);
    if (cached) {
      setThumbnail(cached);
      return;
    }
    setThumbnail("");
    if (
      kind === "other" ||
      !authToken ||
      !message.providerMessageId ||
      !attachment.providerAttachmentId ||
      attachment.providerAttachmentId.startsWith("demo-") ||
      !(message.uidValidity ?? attachment.uidValidity)
    ) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const blob = await getEmailAttachmentBlob(authToken, message, attachment);
        const dataUrl = kind === "pdf" ? await pdfBlobThumbnail(blob) : await imageBlobThumbnail(blob);
        if (cancelled) return;
        attachmentThumbnailCache.set(cacheKey, dataUrl);
        setThumbnail(dataUrl);
      } catch {
        // A thumbnail is a convenience only; Open large and Download still work.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.providerAttachmentId, attachment.uidValidity, authToken, cacheKey, kind, message.id, message.mailboxFolder, message.providerMessageId, message.uidValidity]);

  return (
    <button
      className={`email-attachment-thumbnail ${thumbnail ? "has-preview" : ""}`}
      type="button"
      onClick={onOpen}
      title={kind === "other" ? attachment.filename : `Open ${attachment.filename} large`}
      aria-label={`Open ${attachment.filename}`}
    >
      {thumbnail ? (
        <img src={thumbnail} alt="" />
      ) : (
        <span>
          <Paperclip size={18} />
          <i>{loading ? "Loading…" : kind === "pdf" ? "PDF" : kind === "image" ? "Image" : "File"}</i>
        </span>
      )}
    </button>
  );
}

export function EmailPdfViewer({ url, filename }: { url: string; filename: string }) {
  const [bytes, setBytes] = useState<Uint8Array | undefined>();
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageImage, setPageImage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBytes(undefined);
    setPageNumber(1);
    setPageCount(1);
    setPageImage("");
    setError("");
    setLoading(true);
    void fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("PDF could not be loaded.");
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!cancelled) setBytes(new Uint8Array(buffer));
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "PDF could not be loaded.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        configurePdfWorker(pdfjs);
        const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        if (cancelled) return;
        setPageCount(Math.max(1, pdf.numPages));
        const safePage = Math.min(Math.max(1, pageNumber), Math.max(1, pdf.numPages));
        if (safePage !== pageNumber) {
          setPageNumber(safePage);
          return;
        }
        const page = await pdf.getPage(safePage);
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.min(1.85, Math.max(0.9, 1050 / Math.max(1, natural.width)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PDF page could not be rendered.");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (!cancelled) setPageImage(canvas.toDataURL("image/jpeg", 0.84));
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "PDF could not be rendered.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes, pageNumber]);

  return (
    <div className="email-pdf-preview-viewer" aria-label={`PDF preview ${filename}`}>
      <div className="email-pdf-preview-toolbar">
        <button type="button" onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1}>← Previous</button>
        <strong>Page {pageNumber} of {pageCount}</strong>
        <button type="button" onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))} disabled={pageNumber >= pageCount}>Next →</button>
      </div>
      <div className="email-pdf-preview-page">
        {loading ? <span>Loading PDF…</span> : null}
        {error ? <span className="error">{error}</span> : null}
        {pageImage && !error ? <img src={pageImage} alt={`${filename} page ${pageNumber}`} /> : null}
      </div>
    </div>
  );
}
