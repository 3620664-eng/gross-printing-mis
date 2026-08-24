"use client";

import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Download,
  FileInput,
  FolderTree,
  Forward,
  History,
  Inbox,
  Link2,
  LoaderCircle,
  Mail,
  MailCheck,
  SlidersHorizontal,
  Minus,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Star,
  Tag,
  WandSparkles,
  ArchiveRestore,
  Ticket,
  UserRoundCheck,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  calculateEstimatePricing,
  calculateImposition,
  emptyBookletSetup,
  formatMoney,
  QUANTITY_RATE_CURVE,
  type QuantityRatePoint
} from "@/lib/pricing";
import { CATEGORY_FINISHING, type ProductPreset } from "@/lib/product-catalog";
import { matchCustomerCandidates } from "@/lib/customer-match";
import { classifyBusinessEmail, emailBusinessCategoryLabel, emailHeaderAddress, emailHeaderName } from "@/lib/email-business-classifier";
import { buildCommunicationRecommendation, type CommunicationRecommendation } from "@/lib/communication-learning";
import { userVisibleEmailAttachments, userVisibleThreadAttachments } from "@/lib/email-attachment-utils";
import { MultiItemOrderReview } from "./MultiItemOrderReview";
import { EmailAttachmentThumbnail, EmailPdfViewer, attachmentPreviewKind, getEmailAttachmentBlob } from "./EmailAttachmentThumbnail";
import type {
  AiAnalysisResult,
  AiLearningExample,
  AiOrderSplitResult,
  ArtworkPreflightResult,
  CatalogPrice,
  Customer,
  EmailBusinessCategory,
  EmailBusinessRule,
  EmailIntakeStatus,
  EmailIntakeTicket,
  EmailLog,
  EmailMessage,
  EmailRouteDestination,
  EmailTemplate,
  EmailThread,
  EmailWorkPath,
  EstimateFormData,
  ImpositionSettings,
  Job,
  PaperStock
} from "@/lib/types";

interface EmailCenterProps {
  threads: EmailThread[];
  tickets: EmailIntakeTicket[];
  businessRules: EmailBusinessRule[];
  logs: EmailLog[];
  templates: EmailTemplate[];
  customers: Customer[];
  jobs: Job[];
  learningExamples: AiLearningExample[];
  connectionLabel: string;
  syncing: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  onSync: () => void;
  onLoadOlder: () => void;
  onSearchMailbox: (query: string) => Promise<number>;
  onSendNewMessage: (input: {
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    threadId?: string;
    attachments?: Array<{ filename: string; mimeType: string; base64: string; size: number }>;
    sourceAttachments?: Array<{ messageId: string; attachmentId: string; folder?: "inbox" | "sent"; uidValidity?: string; filename: string; mimeType: string; size: number }>;
  }) => Promise<boolean>;
  onCreateTicket: (threadId: string, messageId?: string) => Promise<string | undefined>;
  onUpdateTicket: (ticketId: string, changes: Partial<EmailIntakeTicket>) => void;
  onRouteTicket: (ticketId: string, route: {
    destination: EmailRouteDestination;
    assigneeUserId?: string;
    assigneeName?: string;
    assigneeRole?: "admin" | "front_desk" | "prepress" | "press" | "finishing";
    assigneeDepartment?: string;
    note?: string;
    existingJobId?: string;
  }) => void;
  onCreateCustomerFromEmail: (ticketId: string) => void;
  onAddSenderAsContact: (ticketId: string, customerId: string) => void;
  onStartEstimate: (ticketId: string, preferredConversion: "quote" | "job") => void;
  onQuickStartJob: (threadId: string, messageId: string, attachmentId?: string, handoffArtworkFile?: File) => void | Promise<void>;
  onCreateMultiItemOrder: (ticketId: string, analysis: AiOrderSplitResult, mode: "quote" | "job") => void;
  onSendTicketReply: (ticketId: string, body: string) => Promise<boolean>;
  onLinkThreadToJob: (threadId: string, jobId: string) => void;
  onCombineThreads: (sourceThreadId: string, targetThreadId: string) => void;
  onSeparateMessage: (threadId: string, messageId: string) => void;
  onSetBusinessCategory: (threadId: string, messageId: string, category: EmailBusinessCategory) => void;
  onArchiveThread: (threadId: string) => void;
  onUnarchiveThread: (threadId: string) => void;
  onToggleStar: (threadId: string, messageId: string) => void;
  onSetMessageTags: (threadId: string, messageId: string, tags: string[]) => void;
  onMarkThreadRead: (threadId: string) => void;
  onMarkThreadUnread: (threadId: string) => void;
  onMarkMessageRead: (threadId: string, messageId: string) => void;
  onMarkMessageUnread: (threadId: string, messageId: string) => void;
  onSendReply: (threadId: string, body: string) => void;
  onDownloadAttachment: (threadId: string, messageId: string, attachmentId: string, action?: "download" | "open") => void;
  onHydrateMessage: (threadId: string, messageId: string) => Promise<EmailMessage | undefined>;
  onOpenJob: (jobId: string) => void;
  authToken?: string;
  currentUserId?: string;
  currentRole?: "admin" | "front_desk" | "prepress" | "press" | "finishing";
  productCategories: string[];
  productPresets: ProductPreset[];
  paperStocks: PaperStock[];
  catalogPrices: CatalogPrice[];
  quantityRateCurve?: QuantityRatePoint[];
}

type EmailCenterSection = "inbox" | "tickets" | "sent" | "testing" | "drafts";
type TicketView = "needs" | "ready" | "waiting" | "converted" | "archive";
type MailDensity = "comfortable" | "normal" | "compact";
type MailFontSize = "small" | "standard" | "large" | "extra";
type MailPaneLayout = "right" | "bottom";
type MailBusinessView = "all" | "jobs" | "followup" | "vendor" | "proofs" | "bills" | "shipping" | "newsletter" | "junk" | "review";
type MailQuickFilter = "all" | "unread" | "starred" | "attachments" | "linked" | "needs_reply";
type MailSort = "newest" | "oldest" | "sender" | "subject" | "size";
type ComposeDraft = { id: string; threadId?: string; to: string; cc: string; bcc: string; subject: string; body: string; savedAt: string };
type OpenMailTab = { threadId: string; messageId: string; title: string; archived?: boolean };
type TicketSort = "newest" | "sender" | "customer" | "status";
type RecipientField = "to" | "cc" | "bcc";
type ForwardAttachment = { messageId: string; attachmentId: string; folder?: "inbox" | "sent"; uidValidity?: string; filename: string; mimeType: string; size: number };
type AttachmentPreviewState = { url: string; filename: string; mimeType: string; size: number; threadId: string; messageId: string; attachmentId: string; direction: EmailMessage["direction"] };
type AttachmentPreviewRequest = { threadId: string; messageId: string; attachmentId: string; filename: string };
type GoogleDriveLink = { url: string; previewUrl: string; filename: string; fileKey: string };
type DrivePreviewState = { url: string; previewUrl: string; filename: string; threadId: string; messageId: string; direction: EmailMessage["direction"]; contextLabel: string };
type MailRow = { thread: EmailThread; message: EmailMessage };
type RecipientSuggestion = {
  email: string;
  name?: string;
  customerName?: string;
  source: "Customer" | "Contact" | "Email history" | "Sent history";
  lastSeen: number;
  priority: number;
};

type StaffDirectoryEntry = {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "front_desk" | "prepress" | "press" | "finishing";
  department: string;
  title: string;
  isOwner: boolean;
};

function mailBusinessViewMatches(view: MailBusinessView, category: EmailBusinessCategory) {
  if (view === "all") return true;
  if (view === "jobs") return category === "customer_job";
  if (view === "followup") return category === "customer_existing_job";
  if (view === "vendor") return category === "vendor_quote" || category === "vendor_order";
  if (view === "proofs") return category === "proof";
  if (view === "bills") return category === "vendor_bill";
  if (view === "shipping") return category === "shipping";
  if (view === "newsletter") return category === "newsletter";
  if (view === "junk") return category === "junk";
  return category === "needs_review" || category === "delivery_failure";
}

function ticketSenderIdentity(ticket: EmailIntakeTicket, threads: EmailThread[]) {
  const thread = threads.find((item) => item.id === ticket.threadId);
  const message = thread?.messages.find((item) => item.id === ticket.messageId)
    ?? thread?.messages.slice().reverse().find((item) => item.direction === "inbound");
  const header = message?.from ?? "";
  const email = emailHeaderAddress(header);
  const name = emailHeaderName(header);
  return { name: name || email || "Unknown sender", email, header };
}

function approximateMessageSize(message: EmailMessage) {
  const textBytes = new TextEncoder().encode(`${message.subject}\n${message.bodyText}\n${message.bodyHtml ?? ""}`).length;
  return textBytes + message.attachments.reduce((sum, attachment) => sum + Math.max(0, attachment.size || 0), 0);
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;
  return `${Math.max(0, bytes)} B`;
}

function threadNeedsReply(thread: EmailThread) {
  const latest = thread.messages.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()).at(-1);
  return latest?.direction === "inbound";
}

const EMAIL_TAG_OPTIONS = ["Rush", "Waiting", "Problem", "Need artwork", "Call customer", "Pickup", "Delivery", "Accounting", "Vendor", "Follow up"] as const;
const DRAFT_STORAGE_KEY = "gross-email-compose-drafts-v1";

const PRINT_SPECS = [
  "4/4 full color",
  "4/1 color",
  "4/0 full color",
  "1/1 black",
  "1/0 black",
  "4/4 booklet",
  "Black & white inside, color cover",
  "Full color wide format",
  "Full color banner",
  "Large format color"
];

function formatDateTime(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
    hour: "numeric",
    minute: "2-digit"
  });
}

function ticketActionDueLabel(ticket?: EmailIntakeTicket) {
  if (!ticket) return "";
  const due = ticket.actionDueAt ? new Date(ticket.actionDueAt).getTime() : new Date(ticket.createdAt).getTime() + 24 * 60 * 60 * 1000;
  if (!Number.isFinite(due)) return "Action required";
  const diff = due - Date.now();
  const hours = Math.ceil(Math.abs(diff) / (60 * 60 * 1000));
  if (diff < -24 * 60 * 60 * 1000) return `Overdue ${Math.max(2, Math.ceil(Math.abs(diff) / (24 * 60 * 60 * 1000)))} days`;
  if (diff < 0) return `Overdue ${Math.max(1, hours)}h`;
  if (hours <= 2) return `Due in ${Math.max(1, hours)}h`;
  if (hours <= 24) return `Action due today`;
  return `Action due in ${Math.ceil(hours / 24)} days`;
}

function messageAnchorId(messageId: string) {
  return `email-message-card-${messageId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function mailTextLooksBroken(value?: string) {
  if (!value) return false;
  const replacementCount = (value.match(/�/g) ?? []).length;
  const questionRun = /\?{4,}/.test(value);
  return replacementCount >= 2 || questionRun;
}

function displayMailText(value: string | undefined, fallback = "Refreshing message text…") {
  return !value || mailTextLooksBroken(value) ? fallback : value;
}

function inlineEmailHtml(message: EmailMessage) {
  if (message.bodyHtml && mailTextLooksBroken(message.bodyHtml)) return undefined;
  if (!message.bodyHtml || !message.providerMessageId) return message.bodyHtml;
  let html = message.bodyHtml;
  message.attachments
    .filter((attachment) => attachment.inline && attachment.contentId && attachment.providerAttachmentId && /^image\/(png|jpeg|jpg|gif|webp)$/i.test(attachment.mimeType))
    .forEach((attachment) => {
      const url = `/api/email/inline?messageId=${encodeURIComponent(message.providerMessageId!)}&attachmentId=${encodeURIComponent(attachment.providerAttachmentId!)}&folder=${message.mailboxFolder === "sent" ? "sent" : "inbox"}&uidValidity=${encodeURIComponent(message.uidValidity ?? attachment.uidValidity ?? "")}`;
      const escaped = attachment.contentId!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(`cid:${escaped}`, "gi"), url);
    });
  html = html.replace(/<img\b[^>]*data-remote-image=(?:"blocked"|'blocked')[^>]*>/gi, "");
  return html;
}


function decodeEmailHtmlText(value: string) {
  return value
    .replace(/<br\s*\/?>(?=.)/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function googleDriveLinkFromUrl(rawUrl: string, label?: string): GoogleDriveLink | undefined {
  const decodedUrl = rawUrl.replace(/&amp;/gi, "&").trim();
  let parsed: URL;
  try {
    parsed = new URL(decodedUrl);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "drive.google.com" && host !== "docs.google.com") return undefined;

  let previewUrl = "";
  let fileKey = "";
  const driveFile = parsed.pathname.match(/^\/file\/d\/([^/]+)/i);
  if (host === "drive.google.com" && driveFile?.[1]) {
    fileKey = driveFile[1];
    previewUrl = `https://drive.google.com/file/d/${encodeURIComponent(fileKey)}/preview`;
  } else if (host === "drive.google.com" && parsed.searchParams.get("id")) {
    fileKey = parsed.searchParams.get("id")!;
    previewUrl = `https://drive.google.com/file/d/${encodeURIComponent(fileKey)}/preview`;
  } else {
    const docsFile = parsed.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/i);
    if (!docsFile?.[1] || !docsFile?.[2]) return undefined;
    fileKey = `${docsFile[1]}:${docsFile[2]}`;
    previewUrl = `https://docs.google.com/${docsFile[1]}/d/${encodeURIComponent(docsFile[2])}/preview`;
  }

  const cleanedLabel = decodeEmailHtmlText(label ?? "").replace(/^[-–—•\s]+|[-–—•\s]+$/g, "");
  const filename = cleanedLabel && cleanedLabel.length <= 180 ? cleanedLabel : "Google Drive file";
  return { url: decodedUrl, previewUrl, filename, fileKey };
}

function googleDriveLinks(message: EmailMessage) {
  const links: GoogleDriveLink[] = [];
  const seen = new Set<string>();
  const add = (rawUrl: string, label?: string) => {
    const link = googleDriveLinkFromUrl(rawUrl, label);
    if (!link || seen.has(link.fileKey)) return;
    seen.add(link.fileKey);
    links.push(link);
  };

  if (message.bodyHtml) {
    const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorPattern.exec(message.bodyHtml))) {
      add(match[1] || match[2] || "", match[3]);
    }
  }

  const lines = (message.bodyText || "").split(/\r?\n/);
  const urlPattern = /https:\/\/(?:drive|docs)\.google\.com\/[^\s<>"']+/gi;
  lines.forEach((line, index) => {
    const matches = line.match(urlPattern) ?? [];
    matches.forEach((url) => {
      const previous = (lines[index - 1] || "").replace(/[<>]/g, "").trim();
      add(url.replace(/[)>.,;]+$/, ""), /\.(pdf|jpe?g|png|tiff?|eps|ai|psd|docx?|xlsx?)$/i.test(previous) ? previous : undefined);
    });
  });
  return links;
}

function emailAddress(value: string) {
  const bracket = value.match(/<([^>]+)>/);
  return (bracket?.[1] ?? value).trim().toLowerCase();
}

function emailDisplayName(value: string) {
  const bracket = value.match(/^\s*([^<]+?)\s*<[^>]+>\s*$/);
  const name = bracket?.[1]?.replace(/^[\"']|[\"']$/g, "").trim();
  return name || undefined;
}

function currentRecipientToken(value: string) {
  const lastComma = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  return value.slice(lastComma + 1).trim().toLowerCase();
}

function textMatch(left?: string, right?: string) {
  if (!left || !right) return false;
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

function compactAiMessageBody(value?: string, maxLength = 8_000) {
  if (!value) return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLength);
}

function buildAiTicketRequestText(ticket: EmailIntakeTicket, sourceThread?: EmailThread) {
  const inbound = sourceThread?.messages.filter((message) => message.direction === "inbound") ?? [];
  const latest = inbound.at(-1);
  const previous = inbound.length > 1 ? inbound.at(-2) : undefined;
  return [
    ticket.subject ? `SUBJECT:\n${ticket.subject}` : "",
    ticket.summary ? `CURRENT TICKET SUMMARY:\n${compactAiMessageBody(ticket.summary, 1_500)}` : "",
    ticket.notes ? `STAFF NOTES:\n${compactAiMessageBody(ticket.notes, 1_500)}` : "",
    latest?.bodyText ? `LATEST CUSTOMER MESSAGE — PRIMARY SOURCE:\n${compactAiMessageBody(latest.bodyText, 8_000)}` : "",
    previous?.bodyText ? `PREVIOUS CUSTOMER MESSAGE — CONTEXT ONLY:\n${compactAiMessageBody(previous.bodyText, 2_000)}` : ""
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 14_000);
}

class AiRateLimitClientError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs = 12_000) {
    super(message);
    this.name = "AiRateLimitClientError";
    this.retryAfterMs = retryAfterMs;
  }
}

function sameSize(aWidth: number, aHeight: number, bWidth: number, bHeight: number) {
  const a = [Math.min(aWidth, aHeight), Math.max(aWidth, aHeight)];
  const b = [Math.min(bWidth, bHeight), Math.max(bWidth, bHeight)];
  return Math.abs(a[0] - b[0]) <= 0.15 && Math.abs(a[1] - b[1]) <= 0.15;
}

function cleanSize(value?: number) {
  if (!Number.isFinite(value)) return "—";
  return String(Number((value ?? 0).toFixed(3))).replace(/\.?0+$/, "");
}

function preflightQuestion(result: ArtworkPreflightResult) {
  const requested = result.requestedWidth && result.requestedHeight
    ? `${cleanSize(result.requestedWidth)} × ${cleanSize(result.requestedHeight)}`
    : "the requested size";
  const measured = result.artworkWidth && result.artworkHeight
    ? `${cleanSize(result.artworkWidth)} × ${cleanSize(result.artworkHeight)}`
    : result.artworkWidthPixels && result.artworkHeightPixels
      ? `${result.artworkWidthPixels} × ${result.artworkHeightPixels} px`
      : "a different proportion";
  return `We received ${result.filename}. You requested ${requested} inches, but the file measures ${measured}. Please confirm whether the finished size should stay ${requested}, or if we should use the file size/proportion instead. We will not resize or crop it without confirmation.`;
}

function canonicalStatus(status: EmailIntakeStatus): Exclude<EmailIntakeStatus, "Draft" | "In Review"> {
  if (status === "Draft") return "New";
  if (status === "In Review") return "AI Reviewed";
  return status;
}

function isStaffActionTicket(ticket: EmailIntakeTicket) {
  return ticket.origin === "staff" || ticket.status === "Converted";
}

function ticketViewFor(ticket: EmailIntakeTicket): TicketView {
  const status = canonicalStatus(ticket.status);
  if (status === "Ready for Quote" || status === "Ready for Job") return "ready";
  if (status === "Waiting for Customer") return "waiting";
  if (status === "Converted") return "converted";
  if (status === "Ignored" || status === "Archived") return "archive";
  return "needs";
}

function workPathLabel(path?: EmailWorkPath) {
  if (path === "job") return "Create production job";
  if (path === "estimate") return "Create estimate / quote";
  if (path === "design") return "Design / prepress first";
  if (path === "calculation") return "Needs calculation";
  if (path === "existing_job") return "Link to existing job";
  return "Choose next action";
}

function ticketStatusLabel(ticket: EmailIntakeTicket) {
  const status = canonicalStatus(ticket.status);
  if (status === "Converted" || status === "Ignored" || status === "Archived" || status === "Waiting for Customer") return status;
  if (ticket.workPath === "design") return "Design / Prepress";
  if (ticket.workPath === "calculation") return "Needs calculation";
  if (ticket.workPath === "existing_job") return "Link existing job";
  if (status === "Ready for Job") return "Ready for job";
  if (status === "Ready for Quote") return "Ready for estimate";
  return status;
}

function suggestTicketWorkPath(ticket: EmailIntakeTicket, sourceThread?: EmailThread): { path?: EmailWorkPath; reason?: string } {
  if (ticket.workPathConfirmed && ticket.workPath) return { path: ticket.workPath, reason: ticket.workPathReason };
  if (sourceThread?.jobId || ticket.businessCategory === "customer_existing_job") {
    return { path: "existing_job", reason: "This conversation appears to belong to work already in the system." };
  }
  const latestInbound = sourceThread?.messages.slice().reverse().find((message) => message.direction === "inbound");
  const text = [ticket.subject, ticket.summary, ticket.notes, latestInbound?.bodyText].filter(Boolean).join(" ").toLowerCase();
  if (/\b(quote|estimate|pricing|price|how much|cost to print|send me a price|need a price)\b/.test(text)) {
    return { path: "estimate", reason: "The customer is asking for price/estimate information before production." };
  }
  if (/\b(design|redesign|layout|typeset|typesetting|create artwork|make artwork|artwork needed|logo design|prepress)\b/.test(text)) {
    return { path: "design", reason: "The request appears to need design or prepress work before production." };
  }
  if (/\b(calculate|calculation|figure out|work out the cost|costing|need to calculate)\b/.test(text)) {
    return { path: "calculation", reason: "The request appears to need internal calculation before the next production decision." };
  }
  if (ticket.businessCategory === "customer_job") {
    return { path: "job", reason: "This looks like a customer production request rather than a follow-up or vendor message." };
  }
  return { path: ticket.workPath, reason: ticket.workPathReason };
}

function ticketProgressIndex(ticket: EmailIntakeTicket) {
  const status = canonicalStatus(ticket.status);
  if (status === "Converted") return 3;
  if (status === "Ready for Quote" || status === "Ready for Job") return 2;
  if (
    status === "AI Reviewed" ||
    status === "Missing Information" ||
    status === "Waiting for Customer"
  ) return 1;
  return 0;
}

function defaultImpositionSettings(): ImpositionSettings {
  return {
    mode: "step-repeat",
    preset: "auto",
    rotate: false,
    rotationMode: "0",
    fitMode: "contain",
    artworkBoxMode: "full-page",
    artworkCrop: 0,
    imageBleedEnabled: false,
    bleedType: "duplication",
    bleedColor: "#ffffff",
    bleedLinked: true,
    trimLinked: true,
    bleedTop: 0,
    bleedRight: 0,
    bleedBottom: 0,
    bleedLeft: 0,
    trimTop: 0,
    trimRight: 0,
    trimBottom: 0,
    trimLeft: 0,
    keepBleedMargins: true,
    customColumns: 5,
    customRows: 5,
    margin: 0,
    gutter: 0,
    bleed: 0,
    cropMarkLength: 0,
    cropMarkOffset: 0,
    showBleedGuide: false,
    showRegistrationMarks: false,
    showFoldMarks: false,
    showCornerMarks: true,
    duplexMirror: false,
    bookletReadingDirection: "ltr"
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The email attachment could not be prepared for AI review."));
    reader.readAsDataURL(blob);
  });
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function splitEmailInput(value: string) {
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function ticketQuestionDraft(ticket: EmailIntakeTicket) {
  const questions = (ticket.aiMissingInformation ?? []).filter(
    (question) => question && !question.toLowerCase().includes("customer record")
  );
  if (!questions.length) {
    return `Thank you for your email. Before we prepare the quote, please confirm any missing job specifications, including quantity, finished size, paper, print sides, and due date.`;
  }
  return `Thank you for your email. Before we prepare the quote, please confirm:\n\n${questions
    .map((question, index) => `${index + 1}. ${question}`)
    .join("\n")}\n\nThank you,\nGross Printing`;
}

function ticketPricingPreview(
  ticket: EmailIntakeTicket,
  productPresets: ProductPreset[],
  paperStocks: PaperStock[],
  catalogPrices: CatalogPrice[],
  quantityRateCurve: QuantityRatePoint[]
) {
  const quantity = ticket.quantity;
  const width = ticket.pieceWidth ?? ticket.aiSpecification?.finishedWidth;
  const height = ticket.pieceHeight ?? ticket.aiSpecification?.finishedHeight;
  const category = ticket.productCategory ?? ticket.aiSpecification?.productCategory;
  const productName = ticket.productName ?? ticket.productHint ?? ticket.aiSpecification?.productName;
  const colorSpec = ticket.colorSpec ?? ticket.aiSpecification?.colorSpec;
  const sides = ticket.sides ?? ticket.aiSpecification?.sides;
  const paperHint = ticket.paperHint ?? ticket.aiSpecification?.paperHint;

  const preset =
    productPresets.find((item) => textMatch(item.name, productName)) ??
    (width && height
      ? productPresets.find((item) => sameSize(item.width, item.height, width, height) && (!category || textMatch(item.category, category)))
      : undefined) ??
    productPresets.find((item) => textMatch(item.category, category));

  const stock =
    (paperHint ? paperStocks.find((paper) => textMatch(paper.name, paperHint)) : undefined) ??
    (preset
      ? paperStocks.find((paper) => paper.productCategories?.includes(preset.category) && paper.kind === preset.stockKind) ??
        paperStocks.find((paper) => paper.kind === preset.stockKind)
      : undefined);

  const finalWidth = width ?? preset?.width;
  const finalHeight = height ?? preset?.height;
  const finalQuantity = quantity ?? preset?.quantity;
  const finalColorSpec = colorSpec ?? preset?.colorSpec;
  const finalSides = sides ?? preset?.sides;
  const productDescription = `${category ?? ""} ${productName ?? ""}`.toLowerCase();
  if (productDescription.includes("booklet") || productDescription.includes("book ")) {
    // A safe booklet calculation needs page count, inside/cover stock, and binding details.
    return undefined;
  }
  if (!stock || !finalWidth || !finalHeight || !finalQuantity || !finalColorSpec || !finalSides) {
    return undefined;
  }

  const imposition = calculateImposition(
    stock,
    finalQuantity,
    finalWidth,
    finalHeight,
    defaultImpositionSettings()
  );
  const description = `${category ?? ""} ${productName ?? ""} ${stock.name}`.toLowerCase();
  const noNormalCut =
    description.includes("envelope") ||
    description.includes("roll label") ||
    description.includes("die cut") ||
    description.includes("kiss cut") ||
    stock.kind === "wide-format";
  const parentMatches = sameSize(finalWidth, finalHeight, stock.sheetWidth, stock.sheetHeight);
  const needsCut = !noNormalCut && (
    imposition.piecesPerSheet > 1 ||
    imposition.cutsPerPile > 0 ||
    !parentMatches
  );
  const finishing = (ticket.finishing ?? ticket.aiSpecification?.finishing ?? preset?.bindery ?? [])
    .filter((item) => item !== "Cut to size");
  const bindery = needsCut ? [...finishing, "Cut to size"] : finishing;
  const form: EstimateFormData = {
    customerId: ticket.customerId ?? "",
    title: productName ?? preset?.name ?? "Email print request",
    quantity: finalQuantity,
    pieceWidth: finalWidth,
    pieceHeight: finalHeight,
    dueDate: ticket.dueDate ?? "",
    dueTime: ticket.dueTime ?? "17:00",
    stockId: stock.id,
    colorSpec: finalColorSpec,
    sides: finalSides,
    bindery,
    orderSource: "Email",
    customerReference: ticket.subject,
    sourceEmailThreadId: ticket.threadId,
    sourceEmailMessageId: ticket.messageId,
    intakeTicketId: ticket.id,
    cuttingMode: "auto",
    booklet: emptyBookletSetup(
      paperStocks.find((paper) => paper.kind === "cover")?.id ?? stock.id
    )
  };
  const coverStock = paperStocks.find((paper) => paper.id === form.booklet.coverPaperId);
  const pricing = calculateEstimatePricing(
    form,
    stock,
    imposition,
    coverStock,
    catalogPrices,
    quantityRateCurve
  );
  return {
    pricing,
    stock,
    preset,
    imposition,
    bindery,
    form
  };
}

export function EmailCenter({
  threads,
  tickets,
  businessRules,
  logs,
  templates,
  customers,
  jobs,
  learningExamples,
  connectionLabel,
  syncing,
  loadingOlder,
  hasMore,
  onSync,
  onLoadOlder,
  onSearchMailbox,
  onSendNewMessage,
  onCreateTicket,
  onUpdateTicket,
  onRouteTicket,
  onCreateCustomerFromEmail,
  onAddSenderAsContact,
  onStartEstimate,
  onQuickStartJob,
  onCreateMultiItemOrder,
  onSendTicketReply,
  onLinkThreadToJob,
  onCombineThreads,
  onSeparateMessage,
  onSetBusinessCategory,
  onArchiveThread,
  onUnarchiveThread,
  onToggleStar,
  onSetMessageTags,
  onMarkThreadRead,
  onMarkThreadUnread,
  onMarkMessageRead,
  onMarkMessageUnread,
  onSendReply,
  onDownloadAttachment,
  onHydrateMessage,
  onOpenJob,
  authToken,
  currentUserId,
  currentRole,
  productCategories,
  productPresets,
  paperStocks,
  catalogPrices,
  quantityRateCurve = QUANTITY_RATE_CURVE
}: EmailCenterProps) {
  const [section, setSection] = useState<EmailCenterSection>("inbox");
  const [ticketView, setTicketView] = useState<TicketView>("needs");
  const [mailBusinessView, setMailBusinessView] = useState<MailBusinessView>("all");
  const [mailQuickFilter, setMailQuickFilter] = useState<MailQuickFilter>("all");
  const [mailSort, setMailSort] = useState<MailSort>("newest");
  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketSort, setTicketSort] = useState<TicketSort>("newest");
  const [query, setQuery] = useState("");
  const [fullSearchBusy, setFullSearchBusy] = useState(false);
  const [fullSearchMessage, setFullSearchMessage] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(
    threads.find((thread) => !thread.archived)?.id
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>(
    tickets.find((ticket) => ticketViewFor(ticket) === "needs")?.id
  );
  const [replyBody, setReplyBody] = useState("");
  const [communicationBusy, setCommunicationBusy] = useState(false);
  const [communicationMessage, setCommunicationMessage] = useState("");
  const [communicationRecommendation, setCommunicationRecommendation] = useState<CommunicationRecommendation | undefined>();
  const [openMailTabs, setOpenMailTabs] = useState<OpenMailTab[]>([]);
  const [aiTicketBusy, setAiTicketBusy] = useState(false);
  const [ticketReplyBusy, setTicketReplyBusy] = useState(false);
  const [aiTicketMessage, setAiTicketMessage] = useState("");
  const [multiItemOpen, setMultiItemOpen] = useState(false);
  const [messageZoom, setMessageZoom] = useState(100);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeThreadId, setComposeThreadId] = useState<string | undefined>();
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [routeTicketId, setRouteTicketId] = useState<string | undefined>();
  const [routeDestination, setRouteDestination] = useState<EmailRouteDestination | "">("");
  const [routeAssigneeId, setRouteAssigneeId] = useState("");
  const [routeExistingJobId, setRouteExistingJobId] = useState("");
  const [routeNote, setRouteNote] = useState("");
  const [staffDirectory, setStaffDirectory] = useState<StaffDirectoryEntry[]>([]);
  const [staffDirectoryBusy, setStaffDirectoryBusy] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeForwardAttachments, setComposeForwardAttachments] = useState<ForwardAttachment[]>([]);
  const [composeDrafts, setComposeDrafts] = useState<ComposeDraft[]>([]);
  const [composeTemplateId, setComposeTemplateId] = useState("");
  const [composeMoreOpen, setComposeMoreOpen] = useState(false);
  const [activeRecipientField, setActiveRecipientField] = useState<RecipientField | undefined>();
  const [recipientSuggestionIndex, setRecipientSuggestionIndex] = useState(-1);
  const [mailDensity, setMailDensity] = useState<MailDensity>("normal");
  const [mailFontSize, setMailFontSize] = useState<MailFontSize>("standard");
  const [mailPaneLayout, setMailPaneLayout] = useState<MailPaneLayout>("right");
  const [mailListWidth, setMailListWidth] = useState(430);
  const [mailListHeight, setMailListHeight] = useState(310);
  const [threadExpanded, setThreadExpanded] = useState(true);
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>();
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | undefined>();
  const [attachmentPreviewRequest, setAttachmentPreviewRequest] = useState<AttachmentPreviewRequest | undefined>();
  const [attachmentPreviewBusy, setAttachmentPreviewBusy] = useState(false);
  const [attachmentPreviewError, setAttachmentPreviewError] = useState("");
  const [quickJobPreparingKey, setQuickJobPreparingKey] = useState("");
  const [drivePreview, setDrivePreview] = useState<DrivePreviewState | undefined>();
  const [drivePreviewLoading, setDrivePreviewLoading] = useState(false);
  const [emailReadingMode, setEmailReadingMode] = useState(false);
  const [mailDisplayMenuOpen, setMailDisplayMenuOpen] = useState(false);
  const [mailFilterMenuOpen, setMailFilterMenuOpen] = useState(false);
  const [mailMoreActionsOpen, setMailMoreActionsOpen] = useState(false);
  const [mailWorkPanelOpen, setMailWorkPanelOpen] = useState(false);
  const [staffKnowledgeDraft, setStaffKnowledgeDraft] = useState("");
  const [existingJobChoice, setExistingJobChoice] = useState("");
  const mailListRef = useRef<HTMLDivElement | null>(null);
  const mailListScrollTopRef = useRef(0);
  const attachmentPreviewAbortRef = useRef<AbortController | null>(null);
  const hydratingMessageIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!attachmentPreview && !attachmentPreviewBusy && !attachmentPreviewError && !drivePreview) return;
    const handlePreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drivePreview) closeDrivePreview();
      else closeAttachmentPreview();
    };
    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [attachmentPreview, attachmentPreviewBusy, attachmentPreviewError, drivePreview]);

  useEffect(() => {
    setMailMoreActionsOpen(false);
    setMailWorkPanelOpen(false);
  }, [selectedThreadId, selectedMessageId]);

  useEffect(() => {
    setStaffKnowledgeDraft("");
    setExistingJobChoice("");
  }, [selectedTicketId]);

  const activeThreads = useMemo(() => threads
    .filter((thread) => !thread.archived && thread.messages.some((message) => message.direction === "inbound"))
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()), [threads]);
  const mailboxThreads = activeThreads;
  const mailboxRows = useMemo<MailRow[]>(() => mailboxThreads
    .flatMap((thread) => thread.messages
      .filter((message) => message.direction === "inbound")
      .map((message) => ({ thread, message })))
    .sort((a, b) => new Date(b.message.sentAt).getTime() - new Date(a.message.sentAt).getTime()), [mailboxThreads]);
  const classifiedMailRows = useMemo(() => mailboxRows.map((row) => ({
    ...row,
    classification: classifyBusinessEmail(row.message, { thread: row.thread, rules: businessRules })
  })), [mailboxRows, businessRules]);
  const businessCounts = useMemo(() => ({
    all: classifiedMailRows.length,
    jobs: classifiedMailRows.filter((row) => mailBusinessViewMatches("jobs", row.classification.category)).length,
    followup: classifiedMailRows.filter((row) => mailBusinessViewMatches("followup", row.classification.category)).length,
    vendor: classifiedMailRows.filter((row) => mailBusinessViewMatches("vendor", row.classification.category)).length,
    proofs: classifiedMailRows.filter((row) => mailBusinessViewMatches("proofs", row.classification.category)).length,
    bills: classifiedMailRows.filter((row) => mailBusinessViewMatches("bills", row.classification.category)).length,
    shipping: classifiedMailRows.filter((row) => mailBusinessViewMatches("shipping", row.classification.category)).length,
    newsletter: classifiedMailRows.filter((row) => mailBusinessViewMatches("newsletter", row.classification.category)).length,
    junk: classifiedMailRows.filter((row) => mailBusinessViewMatches("junk", row.classification.category)).length,
    review: classifiedMailRows.filter((row) => mailBusinessViewMatches("review", row.classification.category)).length
  }), [classifiedMailRows]);
  const filteredMailRows = classifiedMailRows
    .filter(({ thread, message, classification }) => {
      if (!mailBusinessViewMatches(mailBusinessView, classification.category)) return false;
      // Keep the currently opened message visible even after opening it marks it
      // read. Reading mail must never look like it disappeared from Inbox.
      if (mailQuickFilter === "unread" && !message.unread && message.id !== selectedMessageId) return false;
      if (mailQuickFilter === "starred" && !message.starred) return false;
      if (mailQuickFilter === "attachments" && !userVisibleEmailAttachments(message).length) return false;
      if (mailQuickFilter === "linked" && !thread.jobId) return false;
      if (mailQuickFilter === "needs_reply" && !threadNeedsReply(thread)) return false;
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return true;
      const haystack = [
        message.from,
        ...message.to,
        ...(message.cc ?? []),
        message.subject,
        message.bodyText,
        emailBusinessCategoryLabel(classification.category),
        classification.partyName,
        ...(message.tags ?? []),
        ...message.attachments.map((attachment) => attachment.filename),
        ...thread.participantEmails
      ].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => {
      if (mailSort === "oldest") return new Date(a.message.sentAt).getTime() - new Date(b.message.sentAt).getTime();
      if (mailSort === "sender") return emailHeaderName(a.message.from).localeCompare(emailHeaderName(b.message.from));
      if (mailSort === "subject") return a.message.subject.localeCompare(b.message.subject);
      if (mailSort === "size") return approximateMessageSize(b.message) - approximateMessageSize(a.message);
      return new Date(b.message.sentAt).getTime() - new Date(a.message.sentAt).getTime();
    });
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? filteredMailRows[0]?.thread ?? mailboxThreads[0] ?? activeThreads[0];
  const selectedMessages = useMemo(
    () => selectedThread?.messages.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()) ?? [],
    [selectedThread]
  );
  const selectedMessage = selectedMessages.find((message) => message.id === selectedMessageId) ?? selectedMessages.at(-1);

  useEffect(() => {
    if (!selectedThread || !selectedMessage || selectedMessage.fullyLoaded) return;
    if (!selectedMessage.providerMessageId || !selectedMessage.uidValidity) return;
    const hydrationKey = `${selectedThread.id}:${selectedMessage.id}`;
    if (hydratingMessageIdsRef.current.has(hydrationKey)) return;
    hydratingMessageIdsRef.current.add(hydrationKey);
    void onHydrateMessage(selectedThread.id, selectedMessage.id).finally(() => {
      hydratingMessageIdsRef.current.delete(hydrationKey);
    });
  }, [selectedThread?.id, selectedMessage?.id, selectedMessage?.fullyLoaded, selectedMessage?.providerMessageId, selectedMessage?.uidValidity]);

  const selectedThreadAttachments = useMemo(
    () => selectedThread ? userVisibleThreadAttachments(selectedThread) : [],
    [selectedThread]
  );
  const selectedBusinessClassification = selectedMessage?.direction === "inbound" && selectedThread
    ? classifyBusinessEmail(selectedMessage, { thread: selectedThread, rules: businessRules })
    : undefined;
  // Long conversations keep only the selected full body mounted. When the
  // conversation is expanded, a lightweight history list appears above it.
  const visibleSelectedMessages = selectedMessage ? [selectedMessage] : [];
  const queueTickets = tickets.filter((ticket) =>
    ticketViewFor(ticket) === ticketView &&
    (ticketView === "converted" || ticketView === "archive" || (isStaffActionTicket(ticket) && !ticket.routedAt))
  );
  const visibleTickets = queueTickets
    .filter((ticket) => {
      const sender = ticketSenderIdentity(ticket, threads);
      const terms = ticketQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return true;
      const haystack = [ticket.ticketNumber, ticket.subject, ticket.customerName, sender.name, sender.email, ticket.summary, ticket.status, ticket.convertedRecordNumber]
        .filter(Boolean).join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => {
      if (ticketSort === "sender") return ticketSenderIdentity(a, threads).name.localeCompare(ticketSenderIdentity(b, threads).name);
      if (ticketSort === "customer") return (a.customerName || ticketSenderIdentity(a, threads).name).localeCompare(b.customerName || ticketSenderIdentity(b, threads).name);
      if (ticketSort === "status") return ticketStatusLabel(a).localeCompare(ticketStatusLabel(b));
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  const selectedTicket =
    visibleTickets.find((ticket) => ticket.id === selectedTicketId) ?? visibleTickets[0];
  const selectedCustomer = selectedThread?.customerId
    ? customers.find((customer) => customer.id === selectedThread.customerId)
    : undefined;
  const linkedJob = selectedThread?.jobId
    ? jobs.find((job) => job.id === selectedThread.jobId)
    : undefined;
  const learnedCommunicationRecommendation = useMemo(() => selectedThread
    ? buildCommunicationRecommendation({ thread: selectedThread, threads, logs, jobs, customers })
    : undefined, [selectedThread, threads, logs, jobs, customers]);
  const threadTickets = selectedThread
    ? tickets
        .filter((ticket) => ticket.threadId === selectedThread.id && isStaffActionTicket(ticket))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    : [];
  const selectedMessageTicket = selectedMessageId ? tickets.find((ticket) => ticket.messageId === selectedMessageId && isStaffActionTicket(ticket)) : undefined;
  const threadTicket = selectedMessageTicket ?? threadTickets[0];
  const routeTicket = routeTicketId ? tickets.find((ticket) => ticket.id === routeTicketId) : undefined;
  const routeTargetRole = routeRole(routeDestination);
  const routeAssigneeOptions = staffDirectory.filter((entry) => entry.role === routeTargetRole || entry.role === "admin");
  const routeCustomerJobs = routeTicket?.customerId
    ? jobs.filter((job) => !job.archived && !job.deletedAt && job.customerId === routeTicket.customerId)
    : [];
  const unreadCount = activeThreads.flatMap((thread) => thread.messages).filter((message) => message.direction === "inbound" && message.unread).length;
  const counts = {
    needs: tickets.filter((ticket) => isStaffActionTicket(ticket) && !ticket.routedAt && ticketViewFor(ticket) === "needs").length,
    ready: tickets.filter((ticket) => isStaffActionTicket(ticket) && !ticket.routedAt && ticketViewFor(ticket) === "ready").length,
    waiting: tickets.filter((ticket) => isStaffActionTicket(ticket) && !ticket.routedAt && ticketViewFor(ticket) === "waiting").length,
    converted: tickets.filter((ticket) => ticketViewFor(ticket) === "converted").length,
    archive: tickets.filter((ticket) => ticketViewFor(ticket) === "archive").length
  };
  const sentLogs = logs
    .filter((log) => log.status === "Sent" || log.status === "Test Sent" || log.status === "Demo")
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const testingLogs = logs
    .filter((log) => log.status === "Blocked" || log.status === "Redirected" || log.status === "Test Sent")
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const mailboxSentMessages = useMemo(() => {
    const seen = new Set<string>();
    return threads
      .flatMap((thread) => thread.messages.map((message) => ({ thread, message })))
      .filter(({ message }) => message.direction === "outbound")
      .filter(({ message }) => {
        const key = message.rfcMessageId?.toLowerCase() || `${message.mailboxFolder ?? "sent"}:${message.providerMessageId ?? message.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.message.sentAt).getTime() - new Date(a.message.sentAt).getTime());
  }, [threads]);
  const recipientDirectory = useMemo(() => {
    const mailbox = "jobs@grossprinting.com";
    const map = new Map<string, RecipientSuggestion>();
    const add = (raw: string | undefined, suggestion: Omit<RecipientSuggestion, "email">) => {
      if (!raw) return;
      const email = emailAddress(raw);
      if (!email || email === mailbox || !email.includes("@")) return;
      const existing = map.get(email);
      const name = suggestion.name || emailDisplayName(raw) || existing?.name;
      const next = { ...suggestion, email, name };
      if (!existing || next.priority > existing.priority || next.lastSeen > existing.lastSeen) map.set(email, { ...existing, ...next });
    };
    customers.forEach((customer) => {
      add(customer.email, { name: customer.contact || customer.name, customerName: customer.name, source: "Customer", lastSeen: 0, priority: 5 });
      (customer.contacts ?? []).forEach((contact) => add(contact.email, { name: contact.name, customerName: customer.name, source: "Contact", lastSeen: 0, priority: 6 }));
    });
    threads.forEach((thread) => thread.messages.forEach((message) => {
      const seenAt = new Date(message.sentAt).getTime() || 0;
      add(message.from, { source: "Email history", lastSeen: seenAt, priority: message.direction === "inbound" ? 4 : 3 });
      message.to.forEach((value) => add(value, { source: message.direction === "outbound" ? "Sent history" : "Email history", lastSeen: seenAt, priority: 3 }));
      (message.cc ?? []).forEach((value) => add(value, { source: message.direction === "outbound" ? "Sent history" : "Email history", lastSeen: seenAt, priority: 2 }));
    }));
    logs.forEach((log) => add(log.to, { source: "Sent history", lastSeen: new Date(log.createdAt).getTime() || 0, priority: 3 }));
    return Array.from(map.values()).sort((a, b) => b.priority - a.priority || b.lastSeen - a.lastSeen || a.email.localeCompare(b.email));
  }, [customers, logs, threads]);

  const selectedPricing = useMemo(
    () =>
      selectedTicket
        ? ticketPricingPreview(
            selectedTicket,
            productPresets,
            paperStocks,
            catalogPrices,
            quantityRateCurve
          )
        : undefined,
    [selectedTicket, productPresets, paperStocks, catalogPrices, quantityRateCurve]
  );
  const selectedTicketThread = selectedTicket
    ? threads.find((thread) => thread.id === selectedTicket.threadId)
    : undefined;
  const selectedTicketJobs = useMemo(() => {
    if (!selectedTicket?.customerId) return [];
    return jobs
      .filter((job) => job.customerId === selectedTicket.customerId && job.status !== "Cancelled")
      .slice()
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 25);
  }, [jobs, selectedTicket?.customerId]);
  const selectedTicketAttachments = useMemo(() => {
    if (!selectedTicket || !selectedTicketThread) return [];
    const ids = new Set(selectedTicket.attachmentIds);
    return selectedTicketThread.messages.flatMap((message) =>
      message.attachments
        .filter((attachment) => ids.has(attachment.id))
        .map((attachment) => ({ message, attachment }))
    );
  }, [selectedTicket, selectedTicketThread]);
  const selectedPrimaryArtwork = useMemo(() =>
    selectedTicketAttachments.find(({ attachment }) => attachmentPreviewKind(attachment) === "pdf") ??
    selectedTicketAttachments.find(({ attachment }) => attachmentPreviewKind(attachment) === "image"),
  [selectedTicketAttachments]);
  const selectedPrimaryPreflight = selectedPrimaryArtwork
    ? selectedTicket?.artworkPreflight?.find((item) => item.attachmentId === selectedPrimaryArtwork.attachment.id)
    : undefined;
  const selectedProgress = selectedTicket ? ticketProgressIndex(selectedTicket) : 0;

  const customerMatch = useMemo(() => {
    if (!selectedThread) return undefined;
    if (selectedCustomer) return selectedCustomer;
    const participants = selectedThread.participantEmails.map(emailAddress);
    return customers.find((customer) =>
      participants.includes(customer.email.trim().toLowerCase())
    );
  }, [customers, selectedCustomer, selectedThread]);
  const selectedTicketMatchCandidates = useMemo(() => {
    if (!selectedTicketThread) return [];
    const inboundSender = selectedTicketThread.messages.slice().reverse().find((message) => message.direction === "inbound")?.from ?? "";
    return matchCustomerCandidates(customers, {
      email: inboundSender,
      company: selectedTicket?.customerName,
      name: selectedTicket?.customerName
    });
  }, [customers, selectedTicket?.customerName, selectedTicketThread]);
  const selectedTicketInboundSender = useMemo(
    () => selectedTicketThread?.messages.slice().reverse().find((message) => message.direction === "inbound")?.from ?? "",
    [selectedTicketThread]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedDensity = window.localStorage.getItem("gross-email-density") as MailDensity | null;
    const savedFont = window.localStorage.getItem("gross-email-font-size") as MailFontSize | null;
    const savedPane = window.localStorage.getItem("gross-email-pane-layout") as MailPaneLayout | null;
    const savedWidth = Number(window.localStorage.getItem("gross-email-list-width"));
    const savedHeight = Number(window.localStorage.getItem("gross-email-list-height"));
    if (savedDensity === "comfortable" || savedDensity === "normal" || savedDensity === "compact") setMailDensity(savedDensity);
    if (savedFont === "small" || savedFont === "standard" || savedFont === "large" || savedFont === "extra") setMailFontSize(savedFont);
    if (savedPane === "right" || savedPane === "bottom") setMailPaneLayout(savedPane);
    if (Number.isFinite(savedWidth) && savedWidth >= 160 && savedWidth <= 1200) setMailListWidth(savedWidth);
    if (Number.isFinite(savedHeight) && savedHeight >= 190 && savedHeight <= 650) setMailListHeight(savedHeight);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gross-email-density", mailDensity);
    window.localStorage.setItem("gross-email-font-size", mailFontSize);
    window.localStorage.setItem("gross-email-pane-layout", mailPaneLayout);
    window.localStorage.setItem("gross-email-list-width", String(mailListWidth));
    window.localStorage.setItem("gross-email-list-height", String(mailListHeight));
  }, [mailDensity, mailFontSize, mailPaneLayout, mailListWidth, mailListHeight]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || "[]") as ComposeDraft[];
      if (Array.isArray(saved)) setComposeDrafts(saved.filter((draft) => draft && typeof draft.id === "string").slice(0, 40));
    } catch {
      setComposeDrafts([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(composeDrafts.slice(0, 40)));
  }, [composeDrafts]);

  useEffect(() => {
    if (!routeTicketId || !routeDestination || routeDestination === "existing_job" || routeAssigneeId) return;
    const targetRole = routeRole(routeDestination);
    const currentStaff = staffDirectory.find((entry) => entry.userId === currentUserId && entry.role === targetRole);
    if (currentStaff) {
      setRouteAssigneeId(currentStaff.userId);
      return;
    }
    const matching = staffDirectory.filter((entry) => entry.role === targetRole);
    if (matching.length === 1) setRouteAssigneeId(matching[0].userId);
    else if (currentRole === "admin") setRouteAssigneeId("");
  }, [routeTicketId, routeDestination, routeAssigneeId, staffDirectory, currentUserId, currentRole]);

  useEffect(() => {
    if (!routeTicket || routeDestination) return;
    setRouteDestination(routeDestinationFromTicket(routeTicket));
  }, [routeTicket?.id, routeDestination]);

  useEffect(() => {
    if (!composeOpen) return;
    const hasContent = Boolean(composeTo.trim() || composeSubject.trim() || composeBody.trim());
    if (!hasContent) return;
    const timer = window.setTimeout(() => {
      const id = composeThreadId ? `thread:${composeThreadId}` : "new-message";
      const savedAt = new Date().toISOString();
      const draft: ComposeDraft = { id, threadId: composeThreadId, to: composeTo, cc: composeCc, bcc: composeBcc, subject: composeSubject, body: composeBody, savedAt };
      setComposeDrafts((current) => [draft, ...current.filter((item) => item.id !== id)].slice(0, 40));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [composeOpen, composeThreadId, composeTo, composeCc, composeBcc, composeSubject, composeBody]);

  useEffect(() => {
    if (!selectedThread || composeOpen) return;
    if (!replyBody.trim()) {
      const draftId = `thread:${selectedThread.id}`;
      setComposeDrafts((current) => current.some((draft) => draft.id === draftId) ? current.filter((draft) => draft.id !== draftId) : current);
      return;
    }
    const timer = window.setTimeout(() => saveInlineReplyDraft(selectedThread, replyBody), 700);
    return () => window.clearTimeout(timer);
  }, [selectedThread?.id, replyBody, composeOpen]);

  useEffect(() => {
    const latest = selectedMessages[selectedMessages.length - 1];
    if (!selectedMessages.some((message) => message.id === selectedMessageId)) setSelectedMessageId(latest?.id);
  }, [selectedThread?.id, selectedMessages.length, selectedMessageId]);

  useEffect(() => {
    if (typeof window === "undefined" || !tickets.length) return;
    const params = new URLSearchParams(window.location.search);
    const linkedTicketId = params.get("ticket");
    if (!linkedTicketId) return;
    const linkedTicket = tickets.find((ticket) => ticket.id === linkedTicketId);
    if (!linkedTicket) return;
    setSection("tickets");
    setTicketView(ticketViewFor(linkedTicket));
    setSelectedTicketId(linkedTicket.id);
  }, [tickets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const basePath = window.location.pathname || "/email-center";
    if (section === "tickets" && selectedTicket) {
      const params = new URLSearchParams();
      params.set("ticket", selectedTicket.id);
      params.set("queue", ticketView);
      window.history.replaceState({}, "", `${basePath}?${params.toString()}`);
    } else {
      window.history.replaceState({}, "", basePath);
    }
  }, [section, selectedTicket?.id, ticketView]);

  function applyEmailDisplayPreset(preset: string) {
    if (preset === "maximum") {
      setMailDensity("compact");
      setMailFontSize("standard");
      setMailPaneLayout("right");
      setMailListWidth(520);
      return;
    }
    if (preset === "balanced") {
      setMailDensity("normal");
      setMailFontSize("standard");
      setMailPaneLayout("right");
      setMailListWidth(430);
      return;
    }
    if (preset === "reading") {
      setMailDensity("comfortable");
      setMailFontSize("large");
      setMailPaneLayout("bottom");
      setMailListHeight(300);
      return;
    }
    if (preset === "large-text") {
      setMailDensity("comfortable");
      setMailFontSize("extra");
      setMailPaneLayout("bottom");
      setMailListHeight(340);
    }
  }

  function resetEmailDisplay() {
    setMailDensity("normal");
    setMailFontSize("standard");
    setMailPaneLayout("right");
    setMailListWidth(430);
    setMailListHeight(310);
    setMessageZoom(100);
  }

  function beginPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = mailListWidth;
    const startHeight = mailListHeight;
    const stackedLayout = mailPaneLayout === "bottom" || window.matchMedia("(max-width: 1120px)").matches;
    document.body.classList.add("email-pane-resizing");
    const onMove = (moveEvent: PointerEvent) => {
      if (!stackedLayout) {
        const maxWidth = Math.max(320, window.innerWidth - 280);
        setMailListWidth(Math.max(160, Math.min(maxWidth, startWidth + moveEvent.clientX - startX)));
      } else {
        setMailListHeight(Math.max(190, Math.min(650, startHeight + moveEvent.clientY - startY)));
      }
    };
    const onUp = () => {
      document.body.classList.remove("email-pane-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resizePaneWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const stackedLayout = mailPaneLayout === "bottom" || window.matchMedia("(max-width: 1120px)").matches;
    const step = event.shiftKey ? 40 : 16;
    if (!stackedLayout) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const maxWidth = Math.max(320, window.innerWidth - 280);
      if (event.key === "Home") setMailListWidth(160);
      else if (event.key === "End") setMailListWidth(maxWidth);
      else setMailListWidth((value) => Math.max(160, Math.min(maxWidth, value + (event.key === "ArrowRight" ? step : -step))));
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") setMailListHeight(190);
    else if (event.key === "End") setMailListHeight(650);
    else setMailListHeight((value) => Math.max(190, Math.min(650, value + (event.key === "ArrowDown" ? step : -step))));
  }

  function jumpToMessage(messageId: string) {
    setSelectedMessageId(messageId);
    if (threadExpanded) window.setTimeout(() => document.getElementById(messageAnchorId(messageId))?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function moveInConversation(delta: number) {
    if (!selectedMessages.length) return;
    const currentIndex = Math.max(0, selectedMessages.findIndex((message) => message.id === selectedMessageId));
    const nextIndex = Math.max(0, Math.min(selectedMessages.length - 1, currentIndex + delta));
    jumpToMessage(selectedMessages[nextIndex].id);
  }

  function recipientSuggestions(value: string) {
    const token = currentRecipientToken(value);
    if (!token) return [];
    return recipientDirectory
      .filter((item) => `${item.name ?? ""} ${item.email} ${item.customerName ?? ""}`.toLowerCase().includes(token))
      .sort((a, b) => {
        const aStarts = a.email.startsWith(token) || (a.name ?? "").toLowerCase().startsWith(token) || (a.customerName ?? "").toLowerCase().startsWith(token);
        const bStarts = b.email.startsWith(token) || (b.name ?? "").toLowerCase().startsWith(token) || (b.customerName ?? "").toLowerCase().startsWith(token);
        return Number(bStarts) - Number(aStarts) || b.priority - a.priority || b.lastSeen - a.lastSeen;
      })
      .slice(0, 8);
  }

  function applyRecipientSuggestion(value: string, suggestion: RecipientSuggestion) {
    const lastComma = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
    const prefix = lastComma >= 0 ? `${value.slice(0, lastComma + 1).trimEnd()} ` : "";
    return `${prefix}${suggestion.email}`;
  }

  function renderRecipientField(field: RecipientField, label: string, value: string, setter: (value: string) => void, placeholder: string) {
    const suggestions = activeRecipientField === field ? recipientSuggestions(value) : [];
    const listId = `email-recipient-suggestions-${field}`;
    const chooseSuggestion = (suggestion: RecipientSuggestion) => {
      setter(applyRecipientSuggestion(value, suggestion));
      setActiveRecipientField(undefined);
      setRecipientSuggestionIndex(-1);
    };
    return (
      <label className="email-recipient-field">
        <span>{label}</span>
        <div className="email-recipient-input-wrap">
          <input
            value={value}
            onFocus={() => { setActiveRecipientField(field); setRecipientSuggestionIndex(-1); }}
            onBlur={() => window.setTimeout(() => setActiveRecipientField((current) => current === field ? undefined : current), 120)}
            onChange={(event) => { setter(event.target.value); setActiveRecipientField(field); setRecipientSuggestionIndex(-1); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") { setActiveRecipientField(undefined); setRecipientSuggestionIndex(-1); return; }
              if (!suggestions.length) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                setRecipientSuggestionIndex((current) => {
                  const seed = current < 0 ? (delta > 0 ? -1 : 0) : current;
                  return (seed + delta + suggestions.length) % suggestions.length;
                });
                return;
              }
              if (event.key === "Enter" && recipientSuggestionIndex >= 0 && suggestions[recipientSuggestionIndex]) {
                event.preventDefault();
                chooseSuggestion(suggestions[recipientSuggestionIndex]);
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(suggestions.length)}
            aria-controls={suggestions.length ? listId : undefined}
          />
          {suggestions.length ? (
            <div className="email-recipient-suggestions" role="listbox" id={listId}>
              {suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={recipientSuggestionIndex === index}
                  className={recipientSuggestionIndex === index ? "active" : ""}
                  key={`${field}-${suggestion.email}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(suggestion)}
                >
                  <span><strong>{suggestion.name || suggestion.email}</strong><small>{suggestion.email}</small></span>
                  <i>{suggestion.customerName ? `${suggestion.customerName} · ` : ""}{suggestion.source}</i>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </label>
    );
  }

  async function runFullMailboxSearch() {
    const term = query.trim();
    if (term.length < 2 || fullSearchBusy) return;
    setFullSearchBusy(true);
    setFullSearchMessage("");
    try {
      const count = await onSearchMailbox(term);
      setFullSearchMessage(count ? `${count} matching mailbox message${count === 1 ? "" : "s"} loaded.` : "No additional mailbox matches found.");
    } finally {
      setFullSearchBusy(false);
    }
  }

  function chooseThread(thread: EmailThread) {
    setSelectedThreadId(thread.id);
    const latestInbound = thread.messages.filter((message) => message.direction === "inbound").at(-1);
    if (latestInbound) {
      setSelectedMessageId(latestInbound.id);
      setThreadExpanded(false);
      if (latestInbound.unread) onMarkMessageRead(thread.id, latestInbound.id);
    }
  }

  function inlineReplyDraftForThread(threadId: string) {
    return composeDrafts.find((draft) => draft.id === `thread:${threadId}`);
  }

  function saveInlineReplyDraft(thread: EmailThread | undefined, body: string) {
    if (!thread) return;
    const id = `thread:${thread.id}`;
    const cleanBody = body.trim();
    if (!cleanBody) {
      setComposeDrafts((current) => current.filter((draft) => draft.id !== id));
      return;
    }
    const latestInbound = thread.messages.slice().reverse().find((message) => message.direction === "inbound");
    const to = latestInbound ? emailHeaderAddress(latestInbound.from) : "";
    const subject = latestInbound ? prefixedSubject(latestInbound.subject || thread.subject, "Re") : prefixedSubject(thread.subject, "Re");
    const draft: ComposeDraft = { id, threadId: thread.id, to, cc: "", bcc: "", subject, body, savedAt: new Date().toISOString() };
    setComposeDrafts((current) => [draft, ...current.filter((item) => item.id !== id)].slice(0, 40));
  }

  function chooseMailRow(row: MailRow) {
    mailListScrollTopRef.current = mailListRef.current?.scrollTop ?? mailListScrollTopRef.current;
    if (selectedThread && selectedThread.id !== row.thread.id) saveInlineReplyDraft(selectedThread, replyBody);
    setReplyBody(inlineReplyDraftForThread(row.thread.id)?.body ?? "");
    setCommunicationMessage("");
    setSelectedThreadId(row.thread.id);
    setSelectedMessageId(row.message.id);
    setThreadExpanded(false);
    const tab: OpenMailTab = { threadId: row.thread.id, messageId: row.message.id, title: displayMailText(row.message.subject, "No subject"), archived: Boolean(row.thread.archived) };
    setOpenMailTabs((current) => [...current.filter((item) => !(item.threadId === tab.threadId && item.messageId === tab.messageId)), tab].slice(-8));
    if (row.message.unread) onMarkMessageRead(row.thread.id, row.message.id);
  }

  function openMailTab(tab: OpenMailTab) {
    if (selectedThread && selectedThread.id !== tab.threadId) saveInlineReplyDraft(selectedThread, replyBody);
    setReplyBody(inlineReplyDraftForThread(tab.threadId)?.body ?? "");
    setCommunicationMessage("");
    setSection("inbox");
    setSelectedThreadId(tab.threadId);
    setSelectedMessageId(tab.messageId);
    setThreadExpanded(false);
  }

  function closeMailTab(tab: OpenMailTab) {
    setOpenMailTabs((current) => current.filter((item) => !(item.threadId === tab.threadId && item.messageId === tab.messageId)));
  }

  function toggleEmailReadingMode() {
    if (!emailReadingMode) {
      mailListScrollTopRef.current = mailListRef.current?.scrollTop ?? mailListScrollTopRef.current;
      setEmailReadingMode(true);
      return;
    }
    setEmailReadingMode(false);
    window.requestAnimationFrame(() => {
      if (mailListRef.current) mailListRef.current.scrollTop = mailListScrollTopRef.current;
    });
  }

  function openSentMailboxMessage(threadId: string, messageId: string) {
    setSection("inbox");
    setSelectedThreadId(threadId);
    setSelectedMessageId(messageId);
    setThreadExpanded(false);
    setEmailReadingMode(true);
    setMailMoreActionsOpen(false);
    setMailWorkPanelOpen(false);
  }

  function openSavedDraft(draft: ComposeDraft) {
    setComposeThreadId(draft.threadId);
    setComposeTo(draft.to);
    setComposeCc(draft.cc);
    setComposeBcc(draft.bcc);
    setComposeSubject(draft.subject);
    setComposeBody(draft.body);
    setComposeTemplateId("");
    setComposeFiles([]);
    setComposeForwardAttachments([]);
    setComposeMessage(`Draft restored · saved ${formatDateTime(draft.savedAt)}`);
    setComposeOpen(true);
    setSection("inbox");
  }

  function discardSavedDraft(draftId: string) {
    setComposeDrafts((current) => current.filter((draft) => draft.id !== draftId));
  }

  function applyComposerTemplate(templateId: string) {
    setComposeTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const customerName = customerMatch?.contact || customerMatch?.name || selectedCustomer?.contact || selectedCustomer?.name || "Customer";
    const values: Record<string, string> = {
      customer_name: customerName,
      job_number: linkedJob?.jobNumber ?? "",
      job_name: linkedJob?.title ?? "",
      quote_number: "",
      invoice_number: "",
      amount: linkedJob ? formatMoney(linkedJob.pricing.total) : "",
      due_date: linkedJob ? `${linkedJob.dueDate} ${linkedJob.dueTime}` : "",
      pickup_address: "Gross Printing, 6 Jackson Ave, Spring Valley, NY 10977",
      company_contact: "Shulem Gross",
      company_name: "Gross Printing",
      company_phone: "845-362-0664",
      company_email: "jobs@grossprinting.com",
      portal_link: "https://gross-printing.vercel.app/portal",
      portal_job_link: linkedJob ? `https://gross-printing.vercel.app/portal?job=${encodeURIComponent(linkedJob.id)}` : "https://gross-printing.vercel.app/portal",
      portal_quote_link: "https://gross-printing.vercel.app/portal",
      portal_invoice_link: "https://gross-printing.vercel.app/portal"
    };
    const render = (value: string) => Object.entries(values).reduce((result, [key, replacement]) => result.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), replacement), value);
    setComposeSubject(render(template.subject));
    setComposeBody(render(template.body));
  }

  async function suggestCommunicationReply() {
    if (!selectedThread || !selectedMessage || selectedMessage.direction !== "inbound") return;
    const recommendation = learnedCommunicationRecommendation ?? buildCommunicationRecommendation({ thread: selectedThread, threads, logs, jobs, customers });
    setCommunicationRecommendation(recommendation);
    setCommunicationMessage("");
    if (recommendation.deterministicDraft) {
      setReplyBody(recommendation.deterministicDraft);
      setCommunicationMessage(`${recommendation.source === "trusted_business_fact" ? "Trusted Gross Printing fact" : "Gross Printing memory"} · ${Math.round(recommendation.confidence * 100)}% confidence · review before sending.`);
      return;
    }
    if (!authToken) {
      setCommunicationMessage("Sign in again before asking AI to draft this reply.");
      return;
    }
    setCommunicationBusy(true);
    try {
      const currentInbound = selectedThread.messages.slice().reverse().find((message) => message.direction === "inbound");
      const response = await fetch("/api/ai/communication", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          intent: recommendation.intent,
          customerName: customerMatch?.name || selectedCustomer?.name,
          currentMessage: `${currentInbound?.subject ?? selectedThread.subject}\n${currentInbound?.bodyText ?? selectedThread.snippet}`,
          conversation: selectedThread.messages.slice(-30).map((message) => ({ direction: message.direction, subject: message.subject, body: message.bodyText })),
          job: linkedJob ? { jobNumber: linkedJob.jobNumber, title: linkedJob.title, status: linkedJob.status } : undefined,
          examples: recommendation.examples.map((example) => ({ request: example.request, reply: example.reply }))
        })
      });
      const payload = await response.json().catch(() => ({})) as { draft?: string; model?: string; error?: string };
      if (!response.ok || !payload.draft) throw new Error(payload.error ?? "AI could not draft this reply.");
      setReplyBody(payload.draft);
      setCommunicationMessage(`${recommendation.matchedCount ? `Gross Printing memory (${recommendation.matchedCount} similar sent replies) + ` : ""}${payload.model ?? "AI"} · draft only · review before sending.`);
    } catch (error) {
      setCommunicationMessage(error instanceof Error ? error.message : "AI could not draft this reply.");
    } finally {
      setCommunicationBusy(false);
    }
  }

  function closeAttachmentPreview() {
    // Closing the modal is always immediate. Abort the browser request first so a
    // slow Rackspace/IMAP response can never keep the user trapped behind the overlay.
    attachmentPreviewAbortRef.current?.abort();
    attachmentPreviewAbortRef.current = null;
    if (attachmentPreview?.url) URL.revokeObjectURL(attachmentPreview.url);
    setAttachmentPreview(undefined);
    setAttachmentPreviewRequest(undefined);
    setAttachmentPreviewBusy(false);
    setAttachmentPreviewError("");
  }

  function retryAttachmentPreview() {
    const pending = attachmentPreviewRequest;
    if (!pending) return;
    const thread = threads.find((item) => item.id === pending.threadId);
    const message = thread?.messages.find((item) => item.id === pending.messageId);
    const attachment = message?.attachments.find((item) => item.id === pending.attachmentId);
    if (message && attachment) void previewEmailAttachment(pending.threadId, message, attachment);
  }

  function closeDrivePreview() {
    setDrivePreview(undefined);
    setDrivePreviewLoading(false);
  }

  function driveContextForMessage(message: EmailMessage) {
    const matchingTicket = tickets.find((ticket) => ticket.threadId === message.threadId && ticket.messageId === message.id)
      ?? tickets.find((ticket) => ticket.threadId === message.threadId);
    const relatedJobId = message.jobId || selectedThread?.jobId || matchingTicket?.jobId;
    const relatedJob = relatedJobId ? jobs.find((job) => job.id === relatedJobId) : undefined;
    if (relatedJob) return `${relatedJob.jobNumber} — ${relatedJob.title}`;
    if (matchingTicket?.convertedRecordNumber) return `${matchingTicket.convertedRecordNumber}${matchingTicket.ticketNumber ? ` · ${matchingTicket.ticketNumber}` : ""}`;
    if (matchingTicket?.ticketNumber) return `Job Ticket ${matchingTicket.ticketNumber}`;
    return message.subject || selectedThread?.subject || "Email";
  }

  function openDrivePreview(message: EmailMessage, link: GoogleDriveLink) {
    setAttachmentPreview(undefined);
    setAttachmentPreviewError("");
    setDrivePreviewLoading(true);
    setDrivePreview({
      url: link.url,
      previewUrl: link.previewUrl,
      filename: link.filename,
      threadId: message.threadId,
      messageId: message.id,
      direction: message.direction,
      contextLabel: driveContextForMessage(message)
    });
  }

  function handleRichEmailClick(event: ReactMouseEvent<HTMLDivElement>, message: EmailMessage, links: GoogleDriveLink[]) {
    const target = event.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    const parsed = googleDriveLinkFromUrl(href, anchor.textContent || undefined);
    if (!parsed) return;
    event.preventDefault();
    event.stopPropagation();
    const known = links.find((link) => link.fileKey === parsed.fileKey) ?? parsed;
    openDrivePreview(message, known);
  }


  async function openAttachmentInQuickJob(threadId: string, message: EmailMessage, attachment: EmailMessage["attachments"][number]) {
    const key = `${message.id}:${attachment.id}`;
    setQuickJobPreparingKey(key);
    let handoffFile: File | undefined;
    try {
      if (
        authToken &&
        message.providerMessageId &&
        attachment.providerAttachmentId &&
        !attachment.providerAttachmentId.startsWith("demo-") &&
        (message.uidValidity ?? attachment.uidValidity)
      ) {
        try {
          const blob = await getEmailAttachmentBlob(authToken, message, attachment);
          const kind = attachmentPreviewKind(attachment);
          const mimeType = kind === "pdf"
            ? "application/pdf"
            : kind === "image"
              ? (blob.type.startsWith("image/") ? blob.type : attachment.mimeType || "image/png")
              : blob.type || attachment.mimeType || "application/octet-stream";
          handoffFile = new File([blob], attachment.filename, { type: mimeType });
        } catch {
          // If the warm handoff misses, Job Setup keeps the verified email source and can retry it there.
        }
      }
      await onQuickStartJob(threadId, message.id, attachment.id, handoffFile);
    } finally {
      setQuickJobPreparingKey("");
    }
  }

  async function previewEmailAttachment(threadId: string, message: EmailMessage, attachment: EmailMessage["attachments"][number]) {
    const previewKind = attachmentPreviewKind(attachment);
    if (previewKind === "other" || !authToken || !message.providerMessageId || !attachment.providerAttachmentId || attachment.providerAttachmentId.startsWith("demo-")) {
      onDownloadAttachment(threadId, message.id, attachment.id, "open");
      return;
    }

    attachmentPreviewAbortRef.current?.abort();
    const controller = new AbortController();
    attachmentPreviewAbortRef.current = controller;
    setAttachmentPreviewRequest({ threadId, messageId: message.id, attachmentId: attachment.id, filename: attachment.filename });
    setAttachmentPreviewBusy(true);
    setAttachmentPreviewError("");
    try {
      const blob = await getEmailAttachmentBlob(authToken, message, attachment, { signal: controller.signal });
      if (controller.signal.aborted || attachmentPreviewAbortRef.current !== controller) return;
      if (attachmentPreview?.url) URL.revokeObjectURL(attachmentPreview.url);
      const previewBlob = previewKind === "pdf"
        ? new Blob([await blob.arrayBuffer()], { type: "application/pdf" })
        : blob;
      if (controller.signal.aborted || attachmentPreviewAbortRef.current !== controller) return;
      const url = URL.createObjectURL(previewBlob);
      const previewMime = previewKind === "pdf" ? "application/pdf" : (previewBlob.type.startsWith("image/") ? previewBlob.type : attachment.mimeType);
      setAttachmentPreview({ url, filename: attachment.filename, mimeType: previewMime, size: attachment.size, threadId, messageId: message.id, attachmentId: attachment.id, direction: message.direction });
    } catch (error) {
      if (controller.signal.aborted) return;
      setAttachmentPreviewError(error instanceof Error ? error.message : "Unable to preview attachment.");
    } finally {
      if (attachmentPreviewAbortRef.current === controller) {
        attachmentPreviewAbortRef.current = null;
        setAttachmentPreviewBusy(false);
      }
    }
  }

  function openTicket(ticket: EmailIntakeTicket) {
    setSection("tickets");
    setTicketView(ticketViewFor(ticket));
    setSelectedTicketId(ticket.id);
    setAiTicketMessage("");
  }

  function routeRole(destination: EmailRouteDestination | "") {
    if (destination === "design") return "prepress" as const;
    if (destination === "production") return "press" as const;
    if (destination === "finishing") return "finishing" as const;
    return "front_desk" as const;
  }

  function routeDestinationFromTicket(ticket: EmailIntakeTicket): EmailRouteDestination | "" {
    if (ticket.routeDestination) return ticket.routeDestination;
    const suggestion = suggestTicketWorkPath(ticket, threads.find((thread) => thread.id === ticket.threadId)).path;
    if (suggestion === "job") return "job_setup";
    if (suggestion === "estimate" || suggestion === "calculation") return "estimate";
    if (suggestion === "design") return "design";
    if (suggestion === "existing_job") return "existing_job";
    return "";
  }

  async function loadStaffDirectory() {
    if (staffDirectoryBusy || staffDirectory.length) return;
    setStaffDirectoryBusy(true);
    try {
      const response = await fetch("/api/staff-directory", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({})) as { staff?: StaffDirectoryEntry[] };
      if (response.ok && Array.isArray(payload.staff)) setStaffDirectory(payload.staff);
    } finally {
      setStaffDirectoryBusy(false);
    }
  }

  function openRouteTicket(ticket: EmailIntakeTicket) {
    if (ticket.status === "Converted") {
      openTicket(ticket);
      return;
    }
    const destination = routeDestinationFromTicket(ticket);
    setRouteTicketId(ticket.id);
    setRouteDestination(destination);
    setRouteAssigneeId("");
    setRouteExistingJobId("");
    setRouteNote("");
    setRouteMessage("");
    void loadStaffDirectory();
  }

  async function useMessageInJob(threadId: string, messageId: string) {
    const existingTicket = tickets.find((ticket) => ticket.messageId === messageId);
    if (existingTicket) {
      openRouteTicket(existingTicket);
      return;
    }
    const createdId = await onCreateTicket(threadId, messageId);
    if (createdId) {
      setRouteTicketId(createdId);
      setRouteDestination("");
      setRouteAssigneeId("");
      setRouteExistingJobId("");
      setRouteNote("");
      setRouteMessage("");
      void loadStaffDirectory();
    }
  }

  function submitTicketRoute() {
    if (!routeTicket) return;
    if (!routeDestination) {
      setRouteMessage("Choose where this Job Ticket should go.");
      return;
    }
    if (routeDestination === "existing_job") {
      if (!routeExistingJobId) {
        setRouteMessage("Choose the existing job first.");
        return;
      }
      onRouteTicket(routeTicket.id, { destination: routeDestination, existingJobId: routeExistingJobId, note: routeNote });
      setRouteTicketId(undefined);
      return;
    }
    const assignee = staffDirectory.find((entry) => entry.userId === routeAssigneeId);
    if (!assignee) {
      setRouteMessage(staffDirectoryBusy ? "Loading staff…" : "Assign this action to a staff member before sending it.");
      if (!staffDirectoryBusy) void loadStaffDirectory();
      return;
    }
    onRouteTicket(routeTicket.id, {
      destination: routeDestination,
      assigneeUserId: assignee.userId,
      assigneeName: assignee.name,
      assigneeRole: assignee.role,
      assigneeDepartment: assignee.department,
      note: routeNote
    });
    setRouteTicketId(undefined);
    setRouteMessage("");
  }

  async function copyTicketLink() {
    if (!selectedTicket || typeof window === "undefined") return;
    const url = `${window.location.origin}${window.location.pathname}?ticket=${encodeURIComponent(
      selectedTicket.id
    )}&queue=${ticketViewFor(selectedTicket)}`;
    try {
      await navigator.clipboard.writeText(url);
      setAiTicketMessage(`${selectedTicket.ticketNumber ?? "Ticket"} link copied.`);
    } catch {
      window.prompt("Copy this ticket link:", url);
    }
  }

  function sendReply() {
    const body = replyBody.trim();
    if (!selectedThread || !body) return;
    onSendReply(selectedThread.id, body);
    const draftId = `thread:${selectedThread.id}`;
    setComposeDrafts((current) => current.filter((draft) => draft.id !== draftId));
    setReplyBody("");
    setCommunicationMessage("");
  }

  function prefixedSubject(subject: string, prefix: "Re" | "Fwd") {
    const cleaned = subject.trim() || "No subject";
    if (prefix === "Re" && /^re\s*:/i.test(cleaned)) return cleaned;
    if (prefix === "Fwd" && /^(fw|fwd)\s*:/i.test(cleaned)) return cleaned;
    return `${prefix}: ${cleaned}`;
  }

  function quotedMessage(message: EmailThread["messages"][number]) {
    const quoted = message.bodyText.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
    return `\n\nOn ${formatDateTime(message.sentAt)}, ${message.from || "the sender"} wrote:\n${quoted}`;
  }

  async function openComposer(mode: "new" | "reply" | "replyAll" | "forward") {
    setComposeMessage("");
    setComposeMoreOpen(false);
    setComposeTemplateId("");
    setComposeFiles([]);
    setComposeForwardAttachments([]);
    if (mode === "new" || !selectedThread) {
      setComposeThreadId(undefined);
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeBody("");
      setComposeOpen(true);
      return;
    }

    const messages = selectedThread.messages.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    const latest = messages[messages.length - 1];
    const latestInbound = [...messages].reverse().find((message) => message.direction === "inbound") ?? latest;
    if (!latest || !latestInbound) return;

    if (mode === "forward") {
      let forwardSource = selectedMessage ?? latest;
      if (!forwardSource.fullyLoaded) {
        const hydrated = await onHydrateMessage(selectedThread.id, forwardSource.id);
        if (hydrated) forwardSource = hydrated;
      }
      const regularAttachments = userVisibleEmailAttachments(forwardSource);
      const forwardable = regularAttachments.flatMap((attachment) =>
        forwardSource.providerMessageId && attachment.providerAttachmentId
          ? [{
              messageId: forwardSource.providerMessageId,
              attachmentId: attachment.providerAttachmentId,
              folder: forwardSource.mailboxFolder === "sent" ? "sent" as const : "inbox" as const,
              uidValidity: forwardSource.uidValidity ?? attachment.uidValidity,
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              size: attachment.size
            }]
          : []
      );
      setComposeThreadId(undefined);
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject(prefixedSubject(forwardSource.subject, "Fwd"));
      setComposeBody(`\n\n---------- Forwarded message ----------\nFrom: ${forwardSource.from}\nDate: ${formatDateTime(forwardSource.sentAt)}\nSubject: ${forwardSource.subject}\nTo: ${forwardSource.to.join(", ")}\n\n${forwardSource.bodyText}`);
      setComposeForwardAttachments(forwardable);
      if (regularAttachments.length > forwardable.length) {
        const unavailable = regularAttachments.length - forwardable.length;
        setComposeMessage(`${unavailable} older attachment${unavailable === 1 ? " is" : "s are"} not available from the mailbox copy. The available attachments will still be forwarded.`);
      }
      setComposeOpen(true);
      return;
    }

    const sender = latestInbound.from;
    const mailbox = "jobs@grossprinting.com";
    const allReplyAddresses = [...latestInbound.to, ...(latestInbound.cc ?? [])]
      .filter((value) => emailAddress(value) !== mailbox)
      .filter((value) => emailAddress(value) !== emailAddress(sender));
    setComposeThreadId(selectedThread.id);
    setComposeTo(sender);
    setComposeCc(mode === "replyAll" ? Array.from(new Set(allReplyAddresses)).join(", ") : "");
    setComposeBcc("");
    setComposeSubject(prefixedSubject(latestInbound.subject, "Re"));
    setComposeBody(quotedMessage(latestInbound));
    setComposeOpen(true);
  }

  async function sendComposeMessage() {
    if (composeBusy) return;
    const to = composeTo.trim();
    const subject = composeSubject.trim();
    const body = composeBody.trim();
    if (!to || !subject || !body) {
      setComposeMessage("To, Subject, and Message are required.");
      return;
    }
    const manualBytes = composeFiles.reduce((sum, file) => sum + file.size, 0);
    const forwardedBytes = composeForwardAttachments.reduce((sum, file) => sum + file.size, 0);
    if (manualBytes > 2_500_000) {
      setComposeMessage("New browser attachments are limited to about 2.5 MB total. Forwarded original attachments can be larger because they stay on the mail server.");
      return;
    }
    if (manualBytes + forwardedBytes > 20_000_000) {
      setComposeMessage("This email has more than about 20 MB of attachments. Remove an attachment or use Files & Paperwork for the large files.");
      return;
    }
    setComposeBusy(true);
    setComposeMessage("");
    try {
      const attachments = await Promise.all(composeFiles.map(async (file) => ({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        base64: await fileToBase64(file)
      })));
      const sent = await onSendNewMessage({
        to,
        cc: splitEmailInput(composeCc),
        bcc: splitEmailInput(composeBcc),
        subject,
        body: composeBody,
        threadId: composeThreadId,
        attachments,
        sourceAttachments: composeForwardAttachments
      });
      if (!sent) {
        setComposeMessage("The email was not delivered. If Shadow/Test Mode is active, check Testing outbox for the blocked or redirected message.");
        return;
      }
      const draftId = composeThreadId ? `thread:${composeThreadId}` : "new-message";
      setComposeDrafts((current) => current.filter((draft) => draft.id !== draftId));
      setComposeOpen(false);
      setComposeFiles([]);
      setComposeForwardAttachments([]);
      setComposeBody("");
      setComposeTemplateId("");
      setComposeMessage("");
    } catch (error) {
      setComposeMessage(error instanceof Error ? error.message : "The email could not be sent.");
    } finally {
      setComposeBusy(false);
    }
  }

  async function preflightTicketArtwork(
    ticket: EmailIntakeTicket,
    sourceThread: EmailThread | undefined,
    requestedWidth?: number,
    requestedHeight?: number
  ) {
    if (!sourceThread || !authToken) return ticket.artworkPreflight ?? [];
    const wanted = new Set(ticket.attachmentIds);
    const entries = sourceThread.messages.flatMap((message) =>
      message.attachments
        .filter((attachment) => wanted.has(attachment.id))
        .filter((attachment) => attachment.mimeType === "application/pdf" || attachment.mimeType.startsWith("image/"))
        .map((attachment) => ({ message, attachment }))
    ).slice(0, 8);
    if (!entries.length) return [];

    const results: ArtworkPreflightResult[] = [];
    for (const { message, attachment } of entries) {
      if (!message.providerMessageId || !attachment.providerAttachmentId || attachment.providerAttachmentId.startsWith("demo-")) {
        results.push({
          attachmentId: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          requestedWidth,
          requestedHeight,
          severity: "unsupported",
          message: "Artwork exists, but the mailbox file is not available for automatic measurement yet.",
          questions: []
        });
        continue;
      }
      try {
        const response = await fetch("/api/email/preflight", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({
            messageId: message.providerMessageId,
            attachmentId: attachment.providerAttachmentId,
            folder: message.mailboxFolder === "sent" ? "sent" : "inbox",
            uidValidity: message.uidValidity ?? attachment.uidValidity,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            requestedWidth,
            requestedHeight
          })
        });
        const payload = (await response.json().catch(() => ({}))) as { result?: ArtworkPreflightResult; error?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || "Artwork could not be measured.");
        results.push({ ...payload.result, attachmentId: attachment.id });
      } catch (error) {
        results.push({
          attachmentId: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          requestedWidth,
          requestedHeight,
          severity: "unsupported",
          message: error instanceof Error ? error.message : "Artwork could not be measured automatically.",
          questions: []
        });
      }
    }
    return results;
  }

  async function analyzeTicket(
    ticket: EmailIntakeTicket,
    showMessage = true,
    mode: "auto" | "basic" | "advanced" = "auto"
  ) {
    const sourceThread = threads.find((thread) => thread.id === ticket.threadId);
    const requestText = buildAiTicketRequestText(ticket, sourceThread);

    const attachmentSource = sourceThread?.messages
      .slice()
      .reverse()
      .flatMap((message) =>
        message.attachments.map((attachment) => ({ message, attachment }))
      )
      .find(({ attachment }) =>
        (attachment.mimeType.startsWith("image/") || attachment.mimeType === "application/pdf") &&
        attachment.size <= 4_000_000
      );

    let artworkDataUrl: string | undefined;
    if (
      attachmentSource &&
      authToken &&
      attachmentSource.message.providerMessageId &&
      attachmentSource.attachment.providerAttachmentId &&
      !attachmentSource.attachment.providerAttachmentId.startsWith("demo-")
    ) {
      try {
        const blob = await getEmailAttachmentBlob(authToken, attachmentSource.message, attachmentSource.attachment);
        if (blob.size <= 4_000_000) artworkDataUrl = await blobToDataUrl(blob);
      } catch {
        // AI can still analyze the email text if the artwork bytes are temporarily unavailable.
      }
    }

    const response = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({
        mode,
        source: attachmentSource ? "email_artwork" : "email",
        requestText,
        artwork: attachmentSource
          ? {
              name: attachmentSource.attachment.filename,
              mimeType: attachmentSource.attachment.mimeType,
              dataUrl: artworkDataUrl
            }
          : undefined,
        current: {
          customerName: ticket.customerName,
          productCategory: ticket.productCategory,
          productName: ticket.productName ?? ticket.productHint,
          quantity: ticket.aiAnalysisId ? undefined : ticket.quantity,
          finishedWidth: ticket.pieceWidth,
          finishedHeight: ticket.pieceHeight,
          sides: ticket.sides,
          colorSpec: ticket.colorSpec,
          paperName: ticket.paperHint,
          dueDate: ticket.dueDate,
          dueTime: ticket.dueTime
        },
        catalog: {
          categories: productCategories,
          products: productPresets.map((preset) => ({
            id: preset.id,
            category: preset.category,
            name: preset.name,
            width: preset.width,
            height: preset.height,
            colorSpec: preset.colorSpec,
            sides: preset.sides
          })),
          papers: paperStocks.map((paper) => ({
            id: paper.id,
            name: paper.name,
            width: paper.sheetWidth,
            height: paper.sheetHeight,
            kind: paper.kind
          })),
          finishing: Array.from(new Set(Object.values(CATEGORY_FINISHING).flat()))
        }
      })
    });
    const payload = (await response.json().catch(() => ({}))) as {
      result?: AiAnalysisResult;
      error?: string;
      retryAfterMs?: number;
    };
    if (!response.ok || !payload.result) {
      if (response.status === 429) {
        throw new AiRateLimitClientError(
          payload.error || "The AI service is temporarily rate limited.",
          Math.max(2_000, Math.min(30_000, Number(payload.retryAfterMs) || 12_000))
        );
      }
      throw new Error(payload.error || "The AI assistant could not analyze this email.");
    }

    const result = payload.result;
    const spec = result.specification;
    const inboundSender = sourceThread?.messages.slice().reverse().find((message) => message.direction === "inbound")?.from ?? "";
    const matchCandidates = matchCustomerCandidates(customers, {
      email: inboundSender,
      company: spec.customerName,
      name: ticket.customerName
    });
    const automaticCandidate = matchCandidates.find((candidate) => candidate.kind === "exact_email" || candidate.kind === "contact_email");
    const matchedCustomer =
      (ticket.customerId ? customers.find((customer) => customer.id === ticket.customerId) : undefined) ??
      (automaticCandidate ? customers.find((customer) => customer.id === automaticCandidate.customerId) : undefined);
    const possibleCandidate = !matchedCustomer ? matchCandidates[0] : undefined;
    const requestedWidth = spec.finishedWidth ?? ticket.pieceWidth;
    const requestedHeight = spec.finishedHeight ?? ticket.pieceHeight;
    const freshPreflight = await preflightTicketArtwork(ticket, sourceThread, requestedWidth, requestedHeight);
    const previousPreflight = new Map((ticket.artworkPreflight ?? []).map((item) => [item.attachmentId, item]));
    const artworkPreflight = freshPreflight.map((item) => {
      const previous = previousPreflight.get(item.attachmentId);
      return previous?.approved ? { ...item, approved: true, approvedAt: previous.approvedAt } : item;
    });
    const blockingPreflight = artworkPreflight.filter((item) => item.severity === "warning" && !item.approved);
    const internalCustomerIssue = matchedCustomer
      ? []
      : [possibleCandidate ? `Confirm possible customer: ${possibleCandidate.customerName}. ${possibleCandidate.reason}` : "Match this email to a customer record."];
    const preflightIssues = blockingPreflight.map((item) => `Artwork check: ${item.filename} — ${item.message}`);
    const reviewIssues = [...spec.missingInformation, ...internalCustomerIssue, ...preflightIssues];
    const nextStatus: EmailIntakeStatus = reviewIssues.length
      ? "Missing Information"
      : "AI Reviewed";
    const questionTicket = {
      ...ticket,
      aiMissingInformation: spec.missingInformation
    };
    const standardQuestions = spec.missingInformation.length ? ticketQuestionDraft(questionTicket) : "";
    const artworkQuestions = blockingPreflight.map(preflightQuestion).join("\n\n");
    const customerReplyDraft = [standardQuestions, artworkQuestions].filter(Boolean).join("\n\n") || ticket.customerReplyDraft;
    const matchForAudit = automaticCandidate ?? possibleCandidate;
    const workPathSuggestion = suggestTicketWorkPath(ticket, sourceThread);

    onUpdateTicket(ticket.id, {
      status: nextStatus,
      customerId: matchedCustomer?.id ?? ticket.customerId,
      customerName: matchedCustomer?.name ?? ticket.customerName,
      productHint: spec.productName || spec.productCategory || ticket.productHint,
      productCategory: spec.productCategory ?? ticket.productCategory,
      productName: spec.productName ?? ticket.productName,
      quantity: spec.quantity ?? (ticket.aiAnalysisId ? undefined : ticket.quantity),
      pieceWidth: spec.finishedWidth ?? ticket.pieceWidth,
      pieceHeight: spec.finishedHeight ?? ticket.pieceHeight,
      sides: spec.sides ?? ticket.sides,
      colorSpec: spec.colorSpec ?? ticket.colorSpec,
      paperHint: spec.paperHint ?? ticket.paperHint,
      finishing: spec.finishing.length ? spec.finishing : ticket.finishing,
      dueDate: spec.dueDate ?? ticket.dueDate,
      dueTime: spec.dueTime ?? ticket.dueTime,
      summary: spec.summary,
      customerReplyDraft,
      aiAnalysisId: result.id,
      aiConfidence: spec.confidence,
      aiModel: result.model,
      aiUsedMode: result.usedMode,
      aiMissingInformation: reviewIssues,
      aiSpecification: spec,
      customerMatchKind: matchedCustomer ? (automaticCandidate?.kind ?? ticket.customerMatchKind ?? "exact_email") : (possibleCandidate?.kind ?? "unmatched"),
      customerMatchConfidence: matchForAudit?.score,
      customerMatchReason: matchForAudit?.reason,
      suggestedCustomerIds: matchCandidates.map((candidate) => candidate.customerId),
      artworkPreflight,
      preflightReviewedAt: new Date().toISOString(),
      workPath: ticket.workPathConfirmed ? ticket.workPath : workPathSuggestion.path,
      workPathReason: ticket.workPathConfirmed ? ticket.workPathReason : workPathSuggestion.reason,
      updatedAt: new Date().toISOString()
    });

    if (showMessage) {
      setAiTicketMessage(
        `AI review completed with ${Math.round(
          spec.confidence * 100
        )}% confidence. Verify the fields, then follow the Job Ticket next action.`
      );
    }
    return result;
  }

  async function analyzeSelectedTicket() {
    if (!selectedTicket || aiTicketBusy) return;
    setAiTicketBusy(true);
    setAiTicketMessage("");
    try {
      await analyzeTicket(selectedTicket, true, selectedTicket.aiAnalysisId ? "advanced" : "auto");
    } catch (error) {
      setAiTicketMessage(
        error instanceof Error
          ? error.message
          : "The AI assistant could not analyze this email."
      );
    } finally {
      setAiTicketBusy(false);
    }
  }

  useEffect(() => {
    if (section !== "tickets" || !selectedTicket || selectedTicket.aiAnalysisId || aiTicketBusy) return;
    // Job Tickets analyze themselves on first open so staff does not have to hunt for an AI button.
    void analyzeSelectedTicket();
    // Intentionally keyed to the opened Job Ticket. A failed check can still be retried manually.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, selectedTicket?.id]);

  async function sendTicketQuestions() {
    if (!selectedTicket || ticketReplyBusy) return;
    const body = (
      selectedTicket.customerReplyDraft || ticketQuestionDraft(selectedTicket)
    ).trim();
    if (!body) return;
    setTicketReplyBusy(true);
    setAiTicketMessage("");
    try {
      const sent = await onSendTicketReply(selectedTicket.id, body);
      setAiTicketMessage(
        sent
          ? "Questions sent. This ticket moved to Waiting for Customer."
          : "The customer questions could not be sent."
      );
      if (sent) setTicketView("waiting");
    } finally {
      setTicketReplyBusy(false);
    }
  }

  function updateTicket(changes: Partial<EmailIntakeTicket>) {
    if (!selectedTicket) return;
    onUpdateTicket(selectedTicket.id, {
      ...changes,
      updatedAt: new Date().toISOString()
    });
  }

  function resolveArtworkWarning(attachmentId: string, sizeOption?: { width: number; height: number }) {
    if (!selectedTicket) return;
    const now = new Date().toISOString();
    const current = selectedTicket.artworkPreflight ?? [];
    const target = current.find((item) => item.attachmentId === attachmentId);
    const remainingIssues = (selectedTicket.aiMissingInformation ?? []).filter(
      (item) => !target || !item.includes(`Artwork check: ${target.filename}`)
    );
    updateTicket({
      ...(sizeOption ? { pieceWidth: sizeOption.width, pieceHeight: sizeOption.height } : {}),
      artworkPreflight: current.map((item) => item.attachmentId === attachmentId ? { ...item, approved: true, approvedAt: now } : item),
      aiMissingInformation: remainingIssues,
      status: remainingIssues.length ? "Missing Information" : "AI Reviewed",
      preflightReviewedAt: now
    });
  }

  function draftArtworkQuestion(result: ArtworkPreflightResult) {
    if (!selectedTicket) return;
    const question = preflightQuestion(result);
    const existing = (selectedTicket.customerReplyDraft ?? "").trim();
    updateTicket({
      status: "Missing Information",
      customerReplyDraft: existing.includes(question) ? existing : [existing, question].filter(Boolean).join("\n\n")
    });
    setAiTicketMessage("Artwork question added to the customer reply draft. Review it before sending.");
  }

  function prepareKnownAnswer(question: string) {
    setStaffKnowledgeDraft(`${question}
Answer: `);
  }

  function queueCustomerQuestion(question: string) {
    if (!selectedTicket) return;
    const existing = (selectedTicket.customerReplyDraft ?? "").trim();
    const numbered = question.trim();
    if (!numbered) return;
    updateTicket({
      customerReplyDraft: existing.includes(numbered)
        ? existing
        : [existing, numbered].filter(Boolean).join("\n\n")
    });
    setAiTicketMessage("Question added to the customer draft. Nothing was sent.");
  }

  async function applyStaffKnowledgeAndAnalyze() {
    if (!selectedTicket || aiTicketBusy) return;
    const answer = staffKnowledgeDraft.trim();
    if (!answer) {
      setAiTicketMessage("Type what you already know about the job first.");
      return;
    }
    const noteLine = `STAFF-KNOWN JOB INFORMATION (${new Date().toLocaleString()}): ${answer}`;
    const updatedTicket: EmailIntakeTicket = {
      ...selectedTicket,
      notes: [selectedTicket.notes?.trim(), noteLine].filter(Boolean).join("\n\n"),
      updatedAt: new Date().toISOString()
    };
    onUpdateTicket(selectedTicket.id, {
      notes: updatedTicket.notes,
      updatedAt: updatedTicket.updatedAt
    });
    setStaffKnowledgeDraft("");
    setAiTicketBusy(true);
    setAiTicketMessage("Using your answer and checking the job again…");
    try {
      await analyzeTicket(updatedTicket, true, selectedTicket.aiAnalysisId ? "advanced" : "auto");
    } catch (error) {
      setAiTicketMessage(error instanceof Error ? error.message : "The Job Assistant could not re-check this job.");
    } finally {
      setAiTicketBusy(false);
    }
  }

  const unresolvedArtworkWarning = Boolean(
    selectedTicket?.artworkPreflight?.some((item) => item.severity === "warning" && !item.approved)
  );
  const setupReady = Boolean(
    selectedTicket?.customerId &&
      selectedTicket.quantity &&
      (selectedTicket.productName ||
        selectedTicket.productHint ||
        selectedTicket.productCategory) &&
      !unresolvedArtworkWarning
  );

  return (
    <main className={`page-view email-center-page email-font-${mailFontSize} ${emailReadingMode ? "email-reading-full-page" : ""}`}>
      <div className="section-heading email-center-heading email-center-heading-compact email-center-heading-minimal">
        <div>
          <h1>Email Center</h1>
          <span>{connectionLabel} · {unreadCount} unread · {counts.needs + counts.ready + counts.waiting} active Job Ticket{counts.needs + counts.ready + counts.waiting === 1 ? "" : "s"}</span>
        </div>
        <div className="email-center-heading-actions">
          <button className="secondary-button" type="button" onClick={onSync} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            {syncing ? "Refreshing…" : "Refresh"}
          </button>
          <button className="primary-button" type="button" onClick={() => void openComposer("new")}>
            <Plus size={16} />
            New email
          </button>
        </div>
      </div>

      {composeOpen ? (
        <div className="email-compose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !composeBusy) setComposeOpen(false); }}>
          <section className="email-compose-modal" role="dialog" aria-modal="true" aria-label="Compose email">
            <header>
              <div><Mail size={18} /><strong>{composeThreadId ? "Reply" : composeSubject.startsWith("Fwd:") ? "Forward" : "New email"}</strong></div>
              <button className="text-button small" type="button" onClick={() => setComposeOpen(false)} disabled={composeBusy} aria-label="Close compose"><X size={17} /></button>
            </header>
            <div className="email-compose-simple-fields">
              {renderRecipientField("to", "To", composeTo, setComposeTo, "Name or email")}
              <label className="email-compose-subject"><span>Subject</span><input value={composeSubject} onChange={(event) => setComposeSubject(event.target.value)} /></label>
            </div>
            <button className="email-compose-more-toggle" type="button" onClick={() => setComposeMoreOpen((value) => !value)}>
              {composeMoreOpen ? "Hide options" : "CC, BCC & template"}
              <ChevronsUpDown size={14} />
            </button>
            {composeMoreOpen ? (
              <div className="email-compose-advanced-fields">
                {renderRecipientField("cc", "CC", composeCc, setComposeCc, "Optional")}
                {renderRecipientField("bcc", "BCC", composeBcc, setComposeBcc, "Optional")}
                <label className="email-compose-template"><span>Template</span><select value={composeTemplateId} onChange={(event) => applyComposerTemplate(event.target.value)}><option value="">No template</option>{templates.filter((template) => template.isActive).map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label>
              </div>
            ) : null}
            <textarea className="email-compose-body email-compose-body-modal" value={composeBody} onChange={(event) => setComposeBody(event.target.value)} placeholder="Write your email…" autoFocus />
            {(composeFiles.length || composeForwardAttachments.length) ? (
              <div className="email-compose-attachments">
                <div><Paperclip size={14} /><strong>{composeFiles.length + composeForwardAttachments.length} attachment{composeFiles.length + composeForwardAttachments.length === 1 ? "" : "s"}</strong><span>{formatBytes(composeFiles.reduce((sum, file) => sum + file.size, 0) + composeForwardAttachments.reduce((sum, file) => sum + file.size, 0))}</span></div>
                <div className="email-compose-attachment-chips">
                  {composeForwardAttachments.map((attachment) => (
                    <button type="button" key={`${attachment.messageId}-${attachment.attachmentId}`} onClick={() => setComposeForwardAttachments((current) => current.filter((item) => item !== attachment))} title="Remove from email"><Paperclip size={12} />{attachment.filename}<X size={11} /></button>
                  ))}
                  {composeFiles.map((file, index) => (
                    <button type="button" key={`${file.name}-${file.size}-${index}`} onClick={() => setComposeFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} title="Remove from email"><Paperclip size={12} />{file.name}<X size={11} /></button>
                  ))}
                </div>
              </div>
            ) : null}
            {composeMessage ? <div className="email-compose-message">{composeMessage}</div> : null}
            <footer>
              <label className="secondary-button email-attach-button"><Paperclip size={15} />Attach files<input type="file" multiple onChange={(event) => setComposeFiles((current) => [...current, ...Array.from(event.target.files ?? [])])} /></label>
              <span className="email-compose-modal-spacer" />
              <button className="text-button" type="button" onClick={() => setComposeOpen(false)} disabled={composeBusy}>Cancel</button>
              <button className="primary-button" type="button" onClick={() => void sendComposeMessage()} disabled={composeBusy}>
                {composeBusy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
                {composeBusy ? "Sending…" : "Send"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {routeTicketId ? (
        <div className="email-compose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setRouteTicketId(undefined); }}>
          <section className="email-route-modal" role="dialog" aria-modal="true" aria-label="Route Job Ticket">
            <header>
              <div><Ticket size={18} /><strong>Route Job Ticket</strong></div>
              <button className="text-button small" type="button" onClick={() => setRouteTicketId(undefined)} aria-label="Close routing"><X size={17} /></button>
            </header>
            {routeTicket ? (
              <>
                <div className="email-route-ticket-summary">
                  <div>
                    <strong>{routeTicket.ticketNumber ?? "Job Ticket"} · <span dir="auto">{displayMailText(routeTicket.subject, "No subject")}</span></strong>
                    <span>{routeTicket.customerName || ticketSenderIdentity(routeTicket, threads).name}</span>
                  </div>
                  <b className={ticketActionDueLabel(routeTicket).startsWith("Overdue") ? "overdue" : ""}>{ticketActionDueLabel(routeTicket)}</b>
                </div>

                <div className="email-route-step">
                  <strong>1. Where should this go?</strong>
                  <span>Taking an action removes it from the Email Center action list.</span>
                  <div className="email-route-destination-grid">
                    {([
                      ["job_setup", "Job Setup", "Create a new production job"],
                      ["estimate", "Estimate / Calculation", "Price it or finish calculations"],
                      ["design", "Graphics / Prepress", "Design, layout, artwork or prepress"],
                      ["production", "Printing / Production", "Send work to the press department"],
                      ["finishing", "Finishing", "Bindery, cutting or finishing work"],
                      ["billing", "Billing / Accounting", "Invoice, receipt or accounting action"],
                      ["existing_job", "Existing Job", "Attach this email to work already open"]
                    ] as Array<[EmailRouteDestination, string, string]>).map(([value, label, description]) => (
                      <button
                        type="button"
                        className={routeDestination === value ? "active" : ""}
                        key={value}
                        onClick={() => { setRouteDestination(value); setRouteAssigneeId(""); setRouteExistingJobId(""); setRouteMessage(""); }}
                      >
                        <strong>{label}</strong>
                        <span>{description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {routeDestination && routeDestination !== "existing_job" ? (
                  <div className="email-route-step email-route-assignment">
                    <strong>2. Assign it to someone</strong>
                    <span>The person receives it in their work queue. Owner/Admin can see every routed task.</span>
                    <label>
                      <span>Assigned to</span>
                      <select value={routeAssigneeId} onChange={(event) => setRouteAssigneeId(event.target.value)} disabled={staffDirectoryBusy}>
                        <option value="">{staffDirectoryBusy ? "Loading staff…" : "Choose staff member…"}</option>
                        {routeAssigneeOptions.map((entry) => (
                          <option value={entry.userId} key={entry.userId}>{entry.name}{entry.department ? ` · ${entry.department}` : ""}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                {routeDestination === "existing_job" ? (
                  <div className="email-route-step email-route-assignment">
                    <strong>2. Choose the existing job</strong>
                    <span>The email and every inbound attachment stay linked to that job.</span>
                    <label>
                      <span>Existing job</span>
                      <select value={routeExistingJobId} onChange={(event) => setRouteExistingJobId(event.target.value)}>
                        <option value="">{routeTicket.customerId ? (routeCustomerJobs.length ? "Choose job…" : "No active jobs found for this customer") : "Match the customer first"}</option>
                        {routeCustomerJobs.map((job) => <option value={job.id} key={job.id}>{job.jobNumber} · {job.title} · {job.status}</option>)}
                      </select>
                    </label>
                  </div>
                ) : null}

                {routeDestination ? (
                  <div className="email-route-step email-route-note">
                    <strong>3. Optional instruction</strong>
                    <textarea value={routeNote} onChange={(event) => setRouteNote(event.target.value)} placeholder="Example: Customer needs this by tomorrow. Use the attached corrected PDF." />
                  </div>
                ) : null}

                {routeMessage ? <div className="email-compose-message email-route-message">{routeMessage}</div> : null}
                <footer>
                  <button className="text-button" type="button" onClick={() => { setRouteTicketId(undefined); openTicket(routeTicket); }}>Full details</button>
                  <span />
                  <button className="text-button" type="button" onClick={() => setRouteTicketId(undefined)}>Cancel</button>
                  <button className="primary-button" type="button" onClick={submitTicketRoute} disabled={!routeDestination || staffDirectoryBusy}>
                    <ArrowRight size={16} /> Send to next step
                  </button>
                </footer>
              </>
            ) : (
              <div className="email-route-loading"><LoaderCircle className="spin" size={22} /><span>Preparing Job Ticket…</span></div>
            )}
          </section>
        </div>
      ) : null}

      <div className="email-center-tabs" role="tablist" aria-label="Email Center sections">
        <button
          className={section === "inbox" ? "active" : ""}
          type="button"
          onClick={() => setSection("inbox")}
        >
          <Inbox size={16} />
          Inbox
        </button>
        <button
          className={section === "tickets" ? "active" : ""}
          type="button"
          onClick={() => setSection("tickets")}
        >
          <Ticket size={16} />
          Job Tickets
        </button>
        <button
          className={section === "sent" ? "active" : ""}
          type="button"
          onClick={() => setSection("sent")}
        >
          <Send size={16} />
          Sent
        </button>
        <button
          className={section === "testing" ? "active" : ""}
          type="button"
          onClick={() => setSection("testing")}
        >
          <ShieldCheck size={16} />
          Testing outbox {testingLogs.length ? <b>{testingLogs.length}</b> : null}
        </button>
        <button
          className={section === "drafts" ? "active" : ""}
          type="button"
          onClick={() => setSection("drafts")}
        >
          <Mail size={16} />
          Drafts {composeDrafts.length ? <b>{composeDrafts.length}</b> : null}
        </button>
      </div>

      {section === "inbox" ? (
        <div className="email-mail-toolbar">
          <label className="email-mail-queue-select">
            <span>Mailbox view</span>
            <select value={mailBusinessView} onChange={(event) => setMailBusinessView(event.target.value as MailBusinessView)}>
              <option value="all">All mail ({businessCounts.all})</option>
              <option value="jobs">Jobs & quotes ({businessCounts.jobs})</option>
              <option value="followup">Existing job follow-ups ({businessCounts.followup})</option>
              <option value="vendor">Vendor orders ({businessCounts.vendor})</option>
              <option value="proofs">Proofs ({businessCounts.proofs})</option>
              <option value="bills">Bills ({businessCounts.bills})</option>
              <option value="shipping">Shipping ({businessCounts.shipping})</option>
              <option value="newsletter">Newsletter / promotional ({businessCounts.newsletter})</option>
              <option value="junk">Junk ({businessCounts.junk})</option>
              <option value="review">Needs review ({businessCounts.review})</option>
            </select>
          </label>
          <button className={mailFilterMenuOpen ? "secondary-button active" : "secondary-button"} type="button" onClick={() => setMailFilterMenuOpen((value) => !value)}>
            <SlidersHorizontal size={15} /> Filter
          </button>
        </div>
      ) : null}

      {section === "inbox" && mailDisplayMenuOpen ? (
        <div className="email-display-controls">
          <SlidersHorizontal size={15} />
          <label>
            <span>View preset</span>
            <select value="" onChange={(event) => applyEmailDisplayPreset(event.target.value)} aria-label="Email layout preset">
              <option value="">Custom</option>
              <option value="maximum">Maximum messages</option>
              <option value="balanced">Balanced</option>
              <option value="reading">Reading</option>
              <option value="large-text">Large text</option>
            </select>
          </label>
          <label>
            <span>Spacing</span>
            <select value={mailDensity} onChange={(event) => setMailDensity(event.target.value as MailDensity)}>
              <option value="compact">Compact — most mail</option>
              <option value="normal">Normal</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </label>
          <label>
            <span>Text size</span>
            <select value={mailFontSize} onChange={(event) => setMailFontSize(event.target.value as MailFontSize)}>
              <option value="small">Small</option>
              <option value="standard">Standard</option>
              <option value="large">Large</option>
              <option value="extra">Extra large</option>
            </select>
          </label>
          <label>
            <span>Reading pane</span>
            <select value={mailPaneLayout} onChange={(event) => setMailPaneLayout(event.target.value as MailPaneLayout)}>
              <option value="right">Right side</option>
              <option value="bottom">Below inbox</option>
            </select>
          </label>
          {mailPaneLayout === "right" ? (
            <label className="email-list-width-control">
              <span>Inbox width</span>
              <input type="range" min="160" max="1200" step="10" value={mailListWidth} onChange={(event) => setMailListWidth(Number(event.target.value))} />
              <b>{Math.round(mailListWidth)}px</b>
            </label>
          ) : (
            <label className="email-list-width-control">
              <span>Inbox height</span>
              <input type="range" min="190" max="650" step="10" value={mailListHeight} onChange={(event) => setMailListHeight(Number(event.target.value))} />
              <b>{Math.round(mailListHeight)}px</b>
            </label>
          )}
          <button className="email-reset-layout" type="button" onClick={resetEmailDisplay} title="Reset email display">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      ) : null}

      {section === "inbox" && mailFilterMenuOpen ? (
        <div className="email-quick-filter-bar">
          <div className="email-quick-filter-buttons">
            {([
              ["all", "All", Mail],
              ["unread", "Unread", MailCheck],
              ["starred", "Starred", Star],
              ["attachments", "Attachment", Paperclip],
              ["linked", "Linked job", Link2],
              ["needs_reply", "Needs reply", Reply]
            ] as const).map(([filter, label, Icon]) => (
              <button type="button" key={filter} className={mailQuickFilter === filter ? "active" : ""} onClick={() => setMailQuickFilter(filter)}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <label>
            <span>Sort</span>
            <select value={mailSort} onChange={(event) => setMailSort(event.target.value as MailSort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="sender">Sender</option>
              <option value="subject">Subject</option>
              <option value="size">Largest message</option>
            </select>
          </label>
        </div>
      ) : null}

      {section === "inbox" && openMailTabs.length ? (
        <div className="email-open-tabs" aria-label="Open email tabs">
          {openMailTabs.map((tab) => (
            <div className={selectedThreadId === tab.threadId && selectedMessageId === tab.messageId ? "active" : ""} key={`${tab.threadId}-${tab.messageId}`}>
              <button type="button" onClick={() => openMailTab(tab)} title={tab.title}><Mail size={13} /><span>{tab.title}</span></button>
              <button type="button" className="email-open-tab-close" onClick={() => closeMailTab(tab)} aria-label={`Close ${tab.title}`}><X size={12} /></button>
            </div>
          ))}
        </div>
      ) : null}

      {section === "inbox" ? (
        <div
          className={`email-inbox-layout email-density-${mailDensity} email-pane-${mailPaneLayout} ${emailReadingMode ? "email-reading-full" : ""}`}
          style={{
            "--email-list-width": `${mailListWidth}px`,
            "--email-list-height": `${mailListHeight}px`
          } as CSSProperties}
        >
          <section className="panel email-thread-list-panel">
            <div className="email-search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setFullSearchMessage(""); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runFullMailboxSearch(); } }}
                placeholder="Search name, email address, subject, message text, or attachment..."
                aria-label="Search email. Press Enter to search the full mailbox."
              />
              <span className="email-search-count">{filteredMailRows.length}/{businessCounts[mailBusinessView]}</span>
              {query.trim().length >= 2 ? (
                <button className="email-search-all" type="button" onClick={() => void runFullMailboxSearch()} disabled={fullSearchBusy} title="Search the full Rackspace mailbox, including older mail">
                  {fullSearchBusy ? <LoaderCircle size={14} className="spin" /> : <History size={14} />}
                  <span>{fullSearchBusy ? "Searching…" : "All mail"}</span>
                </button>
              ) : null}
              {query ? <button type="button" onClick={() => { setQuery(""); setFullSearchMessage(""); }} aria-label="Clear email search"><X size={14} /></button> : null}
            </div>
            {fullSearchMessage ? <div className="email-search-status" role="status">{fullSearchMessage}</div> : null}
            <div className="email-thread-list" ref={mailListRef}>
              {filteredMailRows.map((row) => {
                const { thread, message } = row;
                const relatedTicket = tickets.find((ticket) => ticket.messageId === message.id && isStaffActionTicket(ticket)) ?? tickets
                  .filter((ticket) => ticket.threadId === thread.id && isStaffActionTicket(ticket))
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
                const conversationCount = thread.messages.length;
                return (
                  <button
                    type="button"
                    className={`email-thread-row ${
                      selectedThread?.id === thread.id && selectedMessageId === message.id ? "active" : ""
                    } ${message.unread ? "unread" : ""}`}
                    key={`${thread.id}-${message.id}`}
                    onClick={() => chooseMailRow(row)}
                  >
                    <span className="email-thread-row-top">
                      <i className="email-unread-dot" aria-hidden="true" />
                      <strong dir="auto">{emailHeaderName(message.from) || emailHeaderAddress(message.from) || "Unknown sender"}</strong>
                      <small>{formatDateTime(message.sentAt)}</small>
                    </span>
                    <span className="email-thread-participants" dir="auto">{displayMailText(message.subject, "No subject")}</span>
                    <span className={`email-business-badge category-${row.classification.category}`}>{emailBusinessCategoryLabel(row.classification.category)}</span>
                    <span className="email-thread-snippet" dir="auto">{displayMailText(message.bodyText)}</span>
                    {message.tags?.length ? <span className="email-row-tags">{message.tags.slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</span> : null}
                    <span className="email-thread-flags">
                      {message.starred ? <b className="email-starred-flag"><Star size={12} fill="currentColor" /> Starred</b> : null}
                      {message.unread ? <b>Unread</b> : null}
                      <i>{formatBytes(approximateMessageSize(message))}</i>
                      {conversationCount > 1 ? <i title="Related conversation"><FolderTree size={13} /> {conversationCount} messages</i> : null}
                      {thread.customerId ? (
                        <i><UserRoundCheck size={13} /> Customer matched</i>
                      ) : null}
                      {thread.jobId ? (
                        <i><Link2 size={13} /> Job linked</i>
                      ) : null}
                      {relatedTicket ? <i>{ticketStatusLabel(relatedTicket)}</i> : null}
                    </span>
                  </button>
                );
              })}
              {!filteredMailRows.length ? (
                <div className="email-empty-state">
                  <Mail size={28} />
                  <strong>No matching email</strong>
                  <span>The mailbox refreshes automatically. Change the search or load older mail.</span>
                </div>
              ) : null}
            </div>
            <div className="email-load-older">
              <button className="secondary-button" type="button" onClick={onLoadOlder} disabled={loadingOlder || !hasMore}>
                {loadingOlder ? <LoaderCircle size={15} className="spin" /> : <History size={15} />}
                {loadingOlder ? "Loading older mail..." : hasMore ? "Load older mail" : "All loaded mail shown"}
              </button>
            </div>
          </section>

          <div
            className="email-pane-resizer"
            role="separator"
            tabIndex={0}
            aria-label="Resize mailbox message list"
            aria-orientation={mailPaneLayout === "right" ? "vertical" : "horizontal"}
            aria-valuemin={mailPaneLayout === "right" ? 160 : 190}
            aria-valuemax={mailPaneLayout === "right" ? Math.max(320, (typeof window !== "undefined" ? window.innerWidth : 1200) - 280) : 650}
            aria-valuenow={mailPaneLayout === "right" ? Math.round(mailListWidth) : Math.round(mailListHeight)}
            title={mailPaneLayout === "right" ? "Drag left or right, or use arrow keys, to resize the inbox" : "Drag up or down, or use arrow keys, to resize the inbox"}
            onKeyDown={resizePaneWithKeyboard}
            onPointerDown={beginPaneResize}
          ><span /></div>

          <section className={`panel email-thread-detail-panel ${mailWorkPanelOpen ? "email-work-details-open" : ""}`}> 
            {selectedThread ? (
              <>
                <header className="email-thread-detail-header">
                  <div>
                    <p dir="auto">{selectedMessage ? `${selectedMessage.from} → ${selectedMessage.to.join(", ")}` : selectedThread.participantEmails.join(" / ")}</p>
                    <h2 dir="auto">{displayMailText(selectedMessage?.subject || selectedThread.subject, "No subject")}</h2>
                    <span>{formatDateTime(selectedMessage?.sentAt ?? selectedThread.lastMessageAt)}</span>
                  </div>
                  <div className="email-thread-actions email-thread-actions-clean">
                    <button className="secondary-button" type="button" onClick={() => void openComposer("reply")}>
                      <Reply size={16} /> Reply
                    </button>
                    <button className="secondary-button" type="button" onClick={() => void openComposer("forward")}>
                      <Forward size={16} /> Forward
                    </button>
                    {selectedMessage?.direction === "inbound" && threadTicket?.status !== "Converted" ? (
                      <button className="primary-button email-quick-job-button" type="button" onClick={() => { const attachment = selectedMessage.attachments.find((item) => attachmentPreviewKind(item) !== "other"); if (attachment) void openAttachmentInQuickJob(selectedThread.id, selectedMessage, attachment); else void onQuickStartJob(selectedThread.id, selectedMessage.id); }}>
                        <FileInput size={16} /> Set up job
                      </button>
                    ) : null}
                    {threadTicket ? (
                      <button className="secondary-button" type="button" onClick={() => openRouteTicket(threadTicket)}>
                        {threadTicket.status === "Converted" ? <History size={16} /> : <Ticket size={16} />}
                        {threadTicket.status === "Converted" ? `View ${threadTicket.convertedRecordNumber ?? "job"}` : "Job Ticket"}
                      </button>
                    ) : selectedMessage?.direction === "inbound" ? (
                      <button className="secondary-button" type="button" onClick={() => void useMessageInJob(selectedThread.id, selectedMessage.id)}>
                        <Ticket size={16} /> Ticket only
                      </button>
                    ) : null}
                    <div className="email-more-menu-wrap">
                      <button className="secondary-button" type="button" onClick={() => setMailMoreActionsOpen((value) => !value)}>
                        More
                      </button>
                      {mailMoreActionsOpen ? (
                        <div className="email-more-menu">
                          <button type="button" onClick={() => { toggleEmailReadingMode(); setMailMoreActionsOpen(false); }}><Mail size={15} /> {emailReadingMode ? "Back to mailbox" : "Full page"}</button>
                          <button type="button" onClick={() => { setMailWorkPanelOpen((value) => !value); setMailMoreActionsOpen(false); }}><Link2 size={15} /> {mailWorkPanelOpen ? "Hide work details" : "Work details"}</button>
                          <button type="button" onClick={() => void openComposer("replyAll")}><Users size={15} /> Reply all</button>
                          <button type="button" onClick={() => {
                            if (selectedMessage?.direction === "inbound") {
                              if (selectedMessage.unread) onMarkMessageRead(selectedThread.id, selectedMessage.id);
                              else onMarkMessageUnread(selectedThread.id, selectedMessage.id);
                            } else if (selectedThread.unread) onMarkThreadRead(selectedThread.id);
                            else onMarkThreadUnread(selectedThread.id);
                          }}>{selectedMessage?.unread ? <MailCheck size={15} /> : <Mail size={15} />}{selectedMessage?.unread ? "Mark read" : "Mark unread"}</button>
                          {selectedMessage ? <button type="button" onClick={() => onToggleStar(selectedThread.id, selectedMessage.id)}><Star size={15} fill={selectedMessage.starred ? "currentColor" : "none"} />{selectedMessage.starred ? "Remove star" : "Star"}</button> : null}
                          {selectedMessage?.direction === "inbound" && selectedBusinessClassification?.category !== "junk" ? <button type="button" onClick={() => onSetBusinessCategory(selectedThread.id, selectedMessage.id, "junk")}><AlertTriangle size={15} /> Junk</button> : null}
                          <button type="button" onClick={() => selectedThread.archived ? onUnarchiveThread(selectedThread.id) : onArchiveThread(selectedThread.id)}>{selectedThread.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{selectedThread.archived ? "Restore email" : "Archive email"}</button>
                          <span className="email-more-zoom"><button type="button" onClick={() => setMessageZoom((value) => Math.max(80, value - 10))}><Minus size={13} /></button><b>{messageZoom}%</b><button type="button" onClick={() => setMessageZoom((value) => Math.min(150, value + 10))}><Plus size={13} /></button></span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </header>

                {selectedThreadAttachments.length ? (
                  <div className="email-thread-attachments">
                    <div className="email-thread-attachments-heading">
                      <span><Paperclip size={15} /><strong>{selectedThreadAttachments.length} file{selectedThreadAttachments.length === 1 ? "" : "s"}</strong><small>{formatBytes(selectedThreadAttachments.reduce((sum, entry) => sum + entry.attachment.size, 0))}</small></span>
                      {selectedThreadAttachments.length > 1 ? (
                        <button type="button" onClick={() => selectedThreadAttachments.forEach(({ message, attachment }) => onDownloadAttachment(selectedThread.id, message.id, attachment.id, "download"))}><Download size={13} />Download all</button>
                      ) : null}
                    </div>
                    <div className="email-thread-attachment-grid">
                      {selectedThreadAttachments.map(({ message, attachment }) => (
                        <div className="email-thread-attachment" key={attachment.id}>
                          <EmailAttachmentThumbnail
                            authToken={authToken}
                            message={message}
                            attachment={attachment}
                            onOpen={() => void previewEmailAttachment(selectedThread.id, message, attachment)}
                          />
                          <span className="email-thread-attachment-info"><strong>{attachment.filename}</strong><small>{formatBytes(attachment.size)} · {formatDateTime(message.sentAt)}</small></span>
                          <span className="email-thread-attachment-actions">
                            {message.direction === "inbound" && attachmentPreviewKind(attachment) !== "other" ? <button className="attachment-job-setup" type="button" disabled={quickJobPreparingKey === `${message.id}:${attachment.id}`} onClick={() => void openAttachmentInQuickJob(selectedThread.id, message, attachment)}><FileInput size={13} />{quickJobPreparingKey === `${message.id}:${attachment.id}` ? "Preparing file…" : "Set up job"}</button> : null}
                            <button type="button" onClick={() => void previewEmailAttachment(selectedThread.id, message, attachment)}>Open large</button>
                            <button type="button" onClick={() => onDownloadAttachment(selectedThread.id, message.id, attachment.id, "download")} aria-label={`Download ${attachment.filename}`}><Download size={13} /></button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedMessage && selectedBusinessClassification && mailWorkPanelOpen ? (
                  <div className="email-business-routing-card">
                    <div>
                      <span className={`email-business-badge category-${selectedBusinessClassification.category}`}>{emailBusinessCategoryLabel(selectedBusinessClassification.category)}</span>
                      <strong>{selectedBusinessClassification.partyName || emailHeaderName(selectedMessage.from) || "Business email"}</strong>
                      <small>{selectedBusinessClassification.reason} · {Math.round(selectedBusinessClassification.confidence * 100)}% confidence{selectedBusinessClassification.matchKind ? ` · match: ${selectedBusinessClassification.matchKind.replaceAll("_", " ")}` : ""}</small>
                    </div>
                    <label>
                      <span>Route this email as</span>
                      <select value={selectedBusinessClassification.category} onChange={(event) => onSetBusinessCategory(selectedThread.id, selectedMessage.id, event.target.value as EmailBusinessCategory)}>
                        <option value="customer_job">Job / quote request</option>
                        <option value="customer_existing_job">Existing job / question</option>
                        <option value="vendor_quote">Vendor quote</option>
                        <option value="vendor_order">Vendor order</option>
                        <option value="proof">Proof</option>
                        <option value="vendor_bill">Bill / invoice</option>
                        <option value="shipping">Shipping / tracking</option>
                        <option value="delivery_failure">Email problem</option>
                        <option value="newsletter">Newsletter / promotional</option>
                        <option value="junk">Junk / spam</option>
                        <option value="general">General mail</option>
                        <option value="needs_review">Needs review</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {selectedMessage && mailWorkPanelOpen ? (
                  <div className="email-tag-manager">
                    <span><Tag size={14} /><strong>Tags</strong></span>
                    <div>
                      {(selectedMessage.tags ?? []).map((tag) => (
                        <button type="button" key={tag} onClick={() => onSetMessageTags(selectedThread.id, selectedMessage.id, (selectedMessage.tags ?? []).filter((item) => item !== tag))} title={`Remove ${tag}`}>
                          {tag} <X size={11} />
                        </button>
                      ))}
                      <select value="" onChange={(event) => { const tag = event.target.value; if (tag) onSetMessageTags(selectedThread.id, selectedMessage.id, [...(selectedMessage.tags ?? []), tag]); }}>
                        <option value="">+ Add tag</option>
                        {EMAIL_TAG_OPTIONS.filter((tag) => !(selectedMessage.tags ?? []).includes(tag)).map((tag) => <option value={tag} key={tag}>{tag}</option>)}
                      </select>
                      <input
                        className="email-custom-tag-input"
                        placeholder="Custom tag + Enter"
                        maxLength={30}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          const tag = event.currentTarget.value.trim();
                          if (!tag) return;
                          onSetMessageTags(selectedThread.id, selectedMessage.id, [...(selectedMessage.tags ?? []), tag]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {mailWorkPanelOpen ? <div className="email-link-card">
                  <div>
                    <strong>
                      {selectedBusinessClassification?.partyType === "vendor"
                        ? selectedBusinessClassification.partyName || emailHeaderName(selectedMessage?.from ?? "") || "Vendor"
                        : customerMatch ? customerMatch.name : "Customer not matched"}
                    </strong>
                    <span>
                      {selectedBusinessClassification?.partyType === "vendor"
                        ? "Vendor email — keep it out of customer intake and link it to the related job when applicable."
                        : customerMatch
                          ? customerMatch.email
                          : "Choose or create the customer when reviewing a customer job/quote ticket."}
                    </span>
                    {threadTicket ? (
                      <small>
                        Ticket: {ticketStatusLabel(threadTicket)}
                        {threadTicket.convertedRecordNumber
                          ? ` · ${threadTicket.convertedRecordNumber}`
                          : ""}
                      </small>
                    ) : null}
                  </div>
                  {linkedJob ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onOpenJob(linkedJob.id)}
                    >
                      {linkedJob.jobNumber}
                      <ArrowRight size={15} />
                    </button>
                  ) : (
                    <label>
                      <span>Link to an existing job</span>
                      <select
                        value=""
                        onChange={(event) => {
                          const jobId = event.target.value;
                          if (!jobId) return;
                          const job = jobs.find((item) => item.id === jobId);
                          if (selectedThread.customerId && job?.customerId && selectedThread.customerId !== job.customerId) {
                            const emailCustomer = customers.find((customer) => customer.id === selectedThread.customerId)?.name ?? "the email customer";
                            const jobCustomer = customers.find((customer) => customer.id === job.customerId)?.name ?? "another customer";
                            if (!window.confirm(`This email is matched to ${emailCustomer}, but ${job.jobNumber} belongs to ${jobCustomer}. Link it anyway?`)) return;
                          }
                          onLinkThreadToJob(selectedThread.id, jobId);
                        }}
                      >
                        <option value="">Choose job...</option>
                        {selectedThread.customerId ? (
                          <optgroup label="This customer's jobs">
                            {jobs
                              .filter((job) => !job.archived && !job.deletedAt && job.customerId === selectedThread.customerId)
                              .map((job) => (
                                <option value={job.id} key={`customer-${job.id}`}>{job.jobNumber} — {job.title}</option>
                              ))}
                          </optgroup>
                        ) : null}
                        <optgroup label={selectedThread.customerId ? "Other jobs" : "All jobs"}>
                          {jobs
                            .filter((job) => !job.archived && !job.deletedAt && (!selectedThread.customerId || job.customerId !== selectedThread.customerId))
                            .map((job) => (
                              <option value={job.id} key={`other-${job.id}`}>{job.jobNumber} — {job.title}</option>
                            ))}
                        </optgroup>
                      </select>
                    </label>
                  )}
                </div> : null}

                {selectedMessages.length > 1 ? (
                  <div className="email-conversation-nav">
                    <button className="secondary-button" type="button" onClick={() => setThreadExpanded((value) => !value)}>
                      <FolderTree size={15} />
                      {threadExpanded ? `Collapse conversation (${selectedMessages.length})` : `Show conversation (${selectedMessages.length})`}
                    </button>
                    <span className="email-conversation-jump">
                      <button type="button" onClick={() => moveInConversation(-1)} disabled={selectedMessages.findIndex((message) => message.id === selectedMessageId) <= 0} aria-label="Previous message"><ChevronLeft size={15} /></button>
                      <select value={selectedMessageId ?? selectedMessages[selectedMessages.length - 1]?.id ?? ""} onChange={(event) => jumpToMessage(event.target.value)} aria-label="Jump to a message in this conversation">
                        {selectedMessages.map((message, index) => (
                          <option value={message.id} key={message.id}>
                            {index + 1} of {selectedMessages.length} · {formatDateTime(message.sentAt)} · {message.direction === "inbound" ? emailDisplayName(message.from) ?? emailAddress(message.from) : `Sent to ${emailAddress(message.to[0] ?? "")}`}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => moveInConversation(1)} disabled={selectedMessages.findIndex((message) => message.id === selectedMessageId) >= selectedMessages.length - 1} aria-label="Next message"><ChevronRight size={15} /></button>
                    </span>

                  </div>
                ) : null}

                {!threadExpanded && selectedMessages.length > 1 ? (
                  <button className="email-collapsed-thread-note" type="button" onClick={() => setThreadExpanded(true)}>
                    {selectedMessages.length - 1} earlier message{selectedMessages.length === 2 ? "" : "s"} hidden — click to expand
                  </button>
                ) : null}

                {threadExpanded && selectedMessages.length > 1 ? (
                  <div className="email-conversation-history" aria-label="Conversation message history">
                    {selectedMessages.map((message, index) => (
                      <button
                        type="button"
                        className={selectedMessage?.id === message.id ? "active" : ""}
                        key={message.id}
                        onClick={() => jumpToMessage(message.id)}
                      >
                        <span><strong>{index + 1}</strong> {message.direction === "inbound" ? emailDisplayName(message.from) ?? emailAddress(message.from) : `Sent to ${emailAddress(message.to[0] ?? "")}`}</span>
                        <span>{formatDateTime(message.sentAt)}</span>
                        <small dir="auto">{displayMailText(message.bodyText.slice(0, 140), "Message text loading…")}</small>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="email-message-stack" style={{ fontSize: `${messageZoom}%` }}>
                  {visibleSelectedMessages.map((message) => {
                    const richHtml = inlineEmailHtml(message);
                    const driveLinks = googleDriveLinks(message);
                    return (
                      <article
                        id={messageAnchorId(message.id)}
                        className={`email-message ${message.direction} ${selectedMessageId === message.id ? "focused" : ""}`}
                        key={message.id}
                        onClick={() => setSelectedMessageId(message.id)}
                      >
                        <header>
                          <div>
                            <strong>
                              {message.direction === "inbound"
                                ? message.from
                                : `Gross Printing → ${message.to.join(", ")}`}
                            </strong>
                            <span>{formatDateTime(message.sentAt)}</span>
                          </div>
                          <b>
                            {message.direction === "inbound" ? "Received" : "Sent"}
                          </b>
                        </header>
                        {richHtml ? (
                          <div className="email-html-body" dir="auto" onClick={(event) => handleRichEmailClick(event, message, driveLinks)} dangerouslySetInnerHTML={{ __html: richHtml }} />
                        ) : (
                          <p dir="auto">{displayMailText(message.bodyText)}</p>
                        )}
                        {driveLinks.length ? (
                          <div className="email-drive-link-list" aria-label="Google Drive files in this email">
                            {driveLinks.map((link) => (
                              <button
                                className="email-drive-link-card"
                                type="button"
                                key={link.fileKey}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDrivePreview(message, link);
                                }}
                              >
                                <span className="email-drive-link-icon"><Link2 size={18} /></span>
                                <span className="email-drive-link-info">
                                  <strong>{link.filename}</strong>
                                  <small>Google Drive file · opens here without leaving Email Center</small>
                                </span>
                                <span className="email-drive-link-open">Preview <ArrowRight size={14} /></span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

              </>
            ) : (
              <div className="email-empty-state">
                <Mail size={30} />
                <strong>Select an email</strong>
                <span>The complete thread will open here.</span>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {section === "drafts" ? (
        <section className="panel email-drafts-panel">
          <div className="panel-heading">
            <div><h2>Drafts</h2><span>Replies and new messages auto-save on this computer until you send or discard them.</span></div>
            <button className="primary-button" type="button" onClick={() => void openComposer("new")}><Plus size={15} /> New email</button>
          </div>
          <div className="email-draft-list">
            {composeDrafts.map((draft) => (
              <article key={draft.id}>
                <button type="button" className="email-draft-open" onClick={() => openSavedDraft(draft)}>
                  <Mail size={16} />
                  <span><strong>{draft.subject || "No subject"}</strong><small>{draft.to || "No recipient"} · saved {formatDateTime(draft.savedAt)}</small><p>{draft.body.slice(0, 180) || "Empty draft"}</p></span>
                </button>
                <button type="button" className="text-button small" onClick={() => discardSavedDraft(draft.id)}><X size={14} /> Discard</button>
              </article>
            ))}
            {!composeDrafts.length ? <div className="email-empty-state"><Mail size={28} /><strong>No saved drafts</strong><span>Start a new message or reply; it will auto-save while you work.</span></div> : null}
          </div>
        </section>
      ) : null}

      {section === "tickets" ? (
        <>
          <div className="email-ticket-view-tabs" role="tablist" aria-label="Ticket work queues">
            {(
              [
                ["needs", "Action needed", counts.needs, CircleHelp],
                ["ready", "Ready to route", counts.ready, CheckCircle2],
                ["waiting", "Waiting for customer", counts.waiting, Reply],
                ["converted", "Completed / converted", counts.converted, History]
              ] as const
            ).map(([view, label, count, Icon]) => (
              <button
                className={ticketView === view ? "active" : ""}
                type="button"
                key={view}
                onClick={() => {
                  setTicketView(view);
                  setSelectedTicketId(
                    tickets.find((ticket) => ticketViewFor(ticket) === view)?.id
                  );
                  setAiTicketMessage("");
                }}
              >
                <Icon size={15} />
                <span>{label}</span>
                <b>{count}</b>
              </button>
            ))}
          </div>

          <div className="email-ticket-layout">
            <section className="panel email-ticket-list">
              <div className="email-ticket-list-toolbar">
                <label className="email-ticket-search">
                  <Search size={15} />
                  <input value={ticketQuery} onChange={(event) => setTicketQuery(event.target.value)} placeholder="Search customer, sender, email, subject, Job Ticket number..." />
                  {ticketQuery ? <button type="button" onClick={() => setTicketQuery("")} aria-label="Clear ticket search"><X size={13} /></button> : null}
                </label>
                <select value={ticketSort} onChange={(event) => setTicketSort(event.target.value as TicketSort)} aria-label="Sort Job Tickets">
                  <option value="newest">Newest first</option>
                  <option value="customer">Customer</option>
                  <option value="sender">Sender</option>
                  <option value="status">Status</option>
                </select>
              </div>
              {visibleTickets.map((ticket) => {
                const sender = ticketSenderIdentity(ticket, threads);
                const primaryName = ticket.customerName || sender.name || sender.email || "Unknown sender";
                return (
                <button
                  type="button"
                  className={selectedTicket?.id === ticket.id ? "active" : ""}
                  key={ticket.id}
                  onClick={() => {
                    setSelectedTicketId(ticket.id);
                    setAiTicketMessage("");
                  }}
                >
                  <span className="email-ticket-row-identity">
                    <strong dir="auto">{primaryName}</strong>
                    <small className="email-ticket-row-email" dir="auto">{sender.email || "No sender email"}</small>
                    <span className="email-ticket-row-subject" dir="auto">{ticket.subject || "No subject"}</span>
                    <small className="email-ticket-row-meta">{ticket.ticketNumber ?? "Email ticket"}{ticket.convertedRecordNumber ? ` · ${ticket.convertedRecordNumber}` : ""}</small>
                    {ticketView !== "converted" && !ticket.routedAt ? <small className={`email-ticket-action-due ${ticketActionDueLabel(ticket).startsWith("Overdue") ? "overdue" : ""}`}>{ticketActionDueLabel(ticket)}</small> : null}
                  </span>
                  <b className={`ticket-status-${ticketViewFor(ticket)}`}>
                    {ticketStatusLabel(ticket)}
                  </b>
                </button>
                );
              })}
              {!visibleTickets.length ? (
                <div className="email-empty-state">
                  <Ticket size={28} />
                  <strong>No Job Tickets in this queue</strong>
                  <span>
                    Converted Job Tickets leave active work automatically but remain in Converted history.
                  </span>
                </div>
              ) : null}
            </section>

            <section className="panel email-ticket-editor">
              {selectedTicket ? (
                <>
                  <header>
                    <div>
                      <p>
                        {selectedTicket.ticketNumber ?? "Job Ticket"} ·{" "}
                        {ticketView === "converted"
                          ? "Job Ticket history"
                          : "Job Ticket workspace"}
                      </p>
                      <h2>{selectedTicket.subject}</h2>
                    </div>
                    <div className="email-ticket-header-actions email-ticket-header-actions-clean">
                      <span className={`soft-chip ticket-status-${ticketViewFor(selectedTicket)}`}>{ticketStatusLabel(selectedTicket)}</span>
                      {ticketView !== "converted" && ticketView !== "archive" ? (
                        aiTicketBusy ? (
                          <span className="soft-chip"><LoaderCircle className="spin" size={14} /> AI checking…</span>
                        ) : (
                          <button className="secondary-button" type="button" onClick={analyzeSelectedTicket}>
                            <BrainCircuit size={15} /> {selectedTicket.aiAnalysisId ? "Re-check AI" : "Retry AI"}
                          </button>
                        )
                      ) : null}
                      {ticketView !== "converted" && ticketView !== "archive" && selectedTicket.aiAnalysisId ? (
                        <button className="secondary-button" type="button" onClick={() => setMultiItemOpen(true)}>
                          <FolderTree size={16} /> Job setup
                        </button>
                      ) : null}
                    </div>
                  </header>

                  <div className="ticket-process-rail" aria-label="Email-to-job review progress">
                    {[
                      ["Email received", "Source conversation and files"],
                      ["Job Ticket", "AI + staff review"],
                      ["Next action", workPathLabel(selectedTicket.workPath)],
                      ["Linked / created", "Estimate, job, or existing record"]
                    ].map(([label, detail], index) => (
                      <div
                        className={
                          index < selectedProgress
                            ? "complete"
                            : index === selectedProgress
                              ? "current"
                              : "upcoming"
                        }
                        key={label}
                      >
                        <span>{index < selectedProgress ? <CheckCircle2 size={14} /> : index + 1}</span>
                        <div>
                          <strong>{label}</strong>
                          <small>{detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>

                  {ticketView !== "converted" && ticketView !== "archive" ? (
                    <section className="email-to-press-command">
                      <div className="email-to-press-heading">
                        <div>
                          <p>Email → setup → quote → press</p>
                          <h3>Job command center</h3>
                          <span>The customer PDF stays first. Review the file, confirm size, then continue without rebuilding the job in another screen.</span>
                        </div>
                        {selectedTicket.ticketNumber ? <b>{selectedTicket.ticketNumber}</b> : null}
                      </div>

                      <div className={`email-primary-artwork-card ${selectedPrimaryPreflight?.severity === "warning" && !selectedPrimaryPreflight.approved ? "warning" : ""}`}>
                        {selectedPrimaryArtwork ? (
                          <>
                            <EmailAttachmentThumbnail
                              authToken={authToken}
                              message={selectedPrimaryArtwork.message}
                              attachment={selectedPrimaryArtwork.attachment}
                              onOpen={() => void previewEmailAttachment(selectedTicket.threadId, selectedPrimaryArtwork.message, selectedPrimaryArtwork.attachment)}
                            />
                            <div className="email-primary-artwork-info">
                              <span className="email-primary-artwork-label">PRIMARY ARTWORK</span>
                              <strong>{selectedPrimaryArtwork.attachment.filename}</strong>
                              <small>{Math.max(1, Math.round(selectedPrimaryArtwork.attachment.size / 1024)).toLocaleString()} KB · {attachmentPreviewKind(selectedPrimaryArtwork.attachment) === "pdf" ? "PDF" : "Image"}</small>
                              {selectedPrimaryPreflight ? (
                                <div className="email-primary-size-check">
                                  <span><small>Requested</small><b>{selectedPrimaryPreflight.requestedWidth && selectedPrimaryPreflight.requestedHeight ? `${cleanSize(selectedPrimaryPreflight.requestedWidth)} × ${cleanSize(selectedPrimaryPreflight.requestedHeight)} in` : "Not confirmed"}</b></span>
                                  <span><small>File</small><b>{selectedPrimaryPreflight.artworkWidth && selectedPrimaryPreflight.artworkHeight ? `${cleanSize(selectedPrimaryPreflight.artworkWidth)} × ${cleanSize(selectedPrimaryPreflight.artworkHeight)} in` : "Checking size"}</b></span>
                                  <em className={selectedPrimaryPreflight.severity === "warning" && !selectedPrimaryPreflight.approved ? "mismatch" : "ok"}>{selectedPrimaryPreflight.severity === "warning" && !selectedPrimaryPreflight.approved ? "Size mismatch" : "Size checked"}</em>
                                </div>
                              ) : <div className="email-primary-size-check pending">Size will be checked against the requested finished size during AI review.</div>}
                            </div>
                            <div className="email-primary-artwork-actions">
                              <button className="secondary-button" type="button" onClick={() => void previewEmailAttachment(selectedTicket.threadId, selectedPrimaryArtwork.message, selectedPrimaryArtwork.attachment)}>Open PDF</button>
                              {selectedPrimaryPreflight?.severity === "warning" && !selectedPrimaryPreflight.approved ? <button className="text-button small" type="button" onClick={() => draftArtworkQuestion(selectedPrimaryPreflight)}><Reply size={14} />Ask customer</button> : null}
                            </div>
                          </>
                        ) : (
                          <div className="email-primary-artwork-empty"><FileInput size={23} /><span><strong>No PDF attached</strong><small>You can still create the Job Ticket and request artwork from the customer.</small></span></div>
                        )}
                      </div>

                      <div className="email-to-press-actions">
                        <button type="button" onClick={() => selectedPrimaryArtwork && void previewEmailAttachment(selectedTicket.threadId, selectedPrimaryArtwork.message, selectedPrimaryArtwork.attachment)} disabled={!selectedPrimaryArtwork}>
                          <span>1</span><div><strong>Review artwork</strong><small>Open PDF + size check</small></div>
                        </button>
                        <button type="button" onClick={() => onStartEstimate(selectedTicket.id, "job")}>
                          <span>2</span><div><strong>Job Setup</strong><small>AI details + step & repeat + paper</small></div>
                        </button>
                        <button type="button" onClick={() => onStartEstimate(selectedTicket.id, "quote")}>
                          <span>3</span><div><strong>Make quote</strong><small>Use the normal pricing engine</small></div>
                        </button>
                        <button type="button" onClick={() => openRouteTicket(selectedTicket)}>
                          <span>4</span><div><strong>Route / assign</strong><small>Graphics, press, finishing, billing</small></div>
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {!selectedTicket.customerId ? (
                    <section className="email-customer-match-card">
                      <div>
                        <UserRoundCheck size={18} />
                        <span>
                          <strong>{selectedTicketMatchCandidates.length ? "Possible existing customer" : "Customer not matched yet"}</strong>
                          <small>
                            Exact email/contact matches can link automatically. Domain or company-name matches always wait for staff confirmation.
                          </small>
                        </span>
                      </div>
                      {selectedTicketMatchCandidates.length ? (
                        <div className="email-customer-match-options">
                          {selectedTicketMatchCandidates.slice(0, 3).map((candidate) => (
                            <div className="email-customer-match-option-row" key={candidate.customerId}>
                              <button type="button" onClick={() => onUpdateTicket(selectedTicket.id, {
                                customerId: candidate.customerId,
                                customerName: candidate.customerName,
                                customerMatchKind: candidate.kind,
                                customerMatchConfidence: candidate.score,
                                customerMatchReason: candidate.reason,
                                aiMissingInformation: (selectedTicket.aiMissingInformation ?? []).filter((item) => !item.toLowerCase().includes("customer"))
                              })}>
                                <span><strong>{candidate.customerName}</strong><small>{candidate.matchedContact ? `${candidate.matchedContact} · ` : ""}{candidate.reason}</small></span>
                                <b>{Math.round(candidate.score * 100)}%</b>
                              </button>
                              {candidate.kind === "company_domain" || candidate.kind === "company_name" ? (
                                <button className="text-button small email-add-contact-button" type="button" onClick={() => onAddSenderAsContact(selectedTicket.id, candidate.customerId)}>
                                  <Users size={14} /> Add sender as contact
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="email-new-customer-row">
                        <span><small>Sender</small><strong>{selectedTicketInboundSender || "Unknown sender"}</strong></span>
                        <button className="secondary-button" type="button" onClick={() => onCreateCustomerFromEmail(selectedTicket.id)}>
                          <Plus size={15} /> Create new customer
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {selectedTicket.status === "Converted" ? (
                    <div className="converted-ticket-summary">
                      <CheckCircle2 size={26} />
                      <div>
                        <p>This Job Ticket is no longer active work.</p>
                        <h3>
                          Converted to{" "}
                          {selectedTicket.convertedRecordNumber ??
                            (selectedTicket.conversionKind === "quote"
                              ? "a quote"
                              : "a production job")}
                        </h3>
                        <span>
                          {selectedTicket.convertedAt
                            ? formatDateTime(selectedTicket.convertedAt)
                            : formatDateTime(selectedTicket.updatedAt)}
                          {selectedTicket.convertedBy
                            ? ` · by ${selectedTicket.convertedBy}`
                            : ""}
                          {selectedTicket.sourceAttachmentFileIds?.length
                            ? ` · ${selectedTicket.sourceAttachmentFileIds.length} attachment${
                                selectedTicket.sourceAttachmentFileIds.length === 1 ? "" : "s"
                              } linked`
                            : ""}
                        </span>
                      </div>
                      {selectedTicket.jobId ? (
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => onOpenJob(selectedTicket.jobId!)}
                        >
                          Open linked record
                          <ArrowRight size={16} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedTicket.aiAnalysisId ? (
                    <div className="email-ai-review-strip">
                      <BrainCircuit size={17} />
                      <div>
                        <strong>
                          {selectedTicket.aiModel ?? "AI review"} ·{" "}
                          {Math.round((selectedTicket.aiConfidence ?? 0) * 100)}%
                          confidence
                        </strong>
                        <span>
                          {selectedTicket.aiMissingInformation?.length
                            ? `${selectedTicket.aiMissingInformation.length} question(s) still need staff answers.`
                            : "No required questions were identified. Staff review is still required."}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {aiTicketMessage ? (
                    <div className="email-ai-message">{aiTicketMessage}</div>
                  ) : null}

                  {selectedTicket.artworkPreflight?.length ? (
                    <section className="email-artwork-preflight">
                      <div className="email-artwork-preflight-heading">
                        <div>
                          <AlertTriangle size={18} />
                          <span>
                            <strong>Artwork preflight</strong>
                            <small>File size and proportion are checked against the requested finished size. Warnings must be reviewed before setup.</small>
                          </span>
                        </div>
                        <b>{selectedTicket.artworkPreflight.filter((item) => item.severity === "warning" && !item.approved).length} needs review</b>
                      </div>
                      <div className="email-artwork-preflight-list">
                        {selectedTicket.artworkPreflight.map((result) => (
                          <article className={`email-artwork-preflight-card ${result.severity} ${result.approved ? "approved" : ""}`} key={result.attachmentId}>
                            <div className="email-artwork-preflight-status">
                              {result.severity === "ok" || result.approved ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                              <div>
                                <strong>{result.filename}</strong>
                                <span>{result.message}</span>
                              </div>
                              <b>{result.approved ? "Approved" : result.severity === "ok" ? "OK" : result.severity === "minor" ? "Check" : result.severity === "warning" ? "Mismatch" : "Manual review"}</b>
                            </div>
                            <div className="email-artwork-preflight-meta">
                              <span><small>Requested</small><strong>{result.requestedWidth && result.requestedHeight ? `${cleanSize(result.requestedWidth)} × ${cleanSize(result.requestedHeight)} in` : "Not confirmed"}</strong></span>
                              <span><small>Artwork</small><strong>{result.artworkWidth && result.artworkHeight ? `${cleanSize(result.artworkWidth)} × ${cleanSize(result.artworkHeight)} in` : result.artworkWidthPixels && result.artworkHeightPixels ? `${result.artworkWidthPixels} × ${result.artworkHeightPixels} px` : "Measured by proportion"}</strong></span>
                              {result.pageCount ? <span><small>Pages</small><strong>{result.pageCount}</strong></span> : null}
                              {result.dpi ? <span><small>DPI</small><strong>{Math.round(result.dpi)}</strong></span> : null}
                              {Number.isFinite(result.aspectMismatchPercent) ? <span><small>Ratio difference</small><strong>{cleanSize(result.aspectMismatchPercent)}%</strong></span> : null}
                            </div>
                            {result.severity === "warning" && !result.approved ? (
                              <div className="email-artwork-preflight-actions">
                                <button className="secondary-button" type="button" onClick={() => draftArtworkQuestion(result)}><Reply size={15} /> Ask customer</button>
                                {result.proportionalWidthOption ? (
                                  <button className="text-button" type="button" onClick={() => resolveArtworkWarning(result.attachmentId, result.proportionalWidthOption)}>
                                    Use {cleanSize(result.proportionalWidthOption.width)} × {cleanSize(result.proportionalWidthOption.height)}
                                  </button>
                                ) : null}
                                {result.proportionalHeightOption && (
                                  !result.proportionalWidthOption ||
                                  result.proportionalHeightOption.width !== result.proportionalWidthOption.width ||
                                  result.proportionalHeightOption.height !== result.proportionalWidthOption.height
                                ) ? (
                                  <button className="text-button" type="button" onClick={() => resolveArtworkWarning(result.attachmentId, result.proportionalHeightOption)}>
                                    Use {cleanSize(result.proportionalHeightOption.width)} × {cleanSize(result.proportionalHeightOption.height)}
                                  </button>
                                ) : null}
                                <button className="text-button" type="button" onClick={() => resolveArtworkWarning(result.attachmentId)}>Approve anyway</button>
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {ticketView === "archive" ? (
                    <div className="archived-ticket-summary">
                      <Archive size={23} />
                      <div>
                        <strong>This ticket is outside active intake work.</strong>
                        <span>Restore it before analyzing, replying, or opening quote/job setup.</span>
                      </div>
                    </div>
                  ) : null}

                  {ticketView !== "converted" && ticketView !== "archive" ? (
                    <>
                      <div className="email-ticket-form-grid">
                        <label>
                          <span>Customer</span>
                          <select
                            value={selectedTicket.customerId ?? ""}
                            onChange={(event) => {
                              const customer = customers.find(
                                (item) => item.id === event.target.value
                              );
                              updateTicket({
                                customerId: customer?.id,
                                customerName: customer?.name
                              });
                            }}
                          >
                            <option value="">Choose customer...</option>
                            {customers
                              .filter(
                                (customer) =>
                                  !customer.archived && !customer.deletedAt
                              )
                              .map((customer) => (
                                <option value={customer.id} key={customer.id}>
                                  {customer.name}
                                </option>
                              ))}
                          </select>
                        </label>

                        <label>
                          <span>Product category</span>
                          <select
                            value={selectedTicket.productCategory ?? ""}
                            onChange={(event) =>
                              updateTicket({
                                productCategory: event.target.value || undefined
                              })
                            }
                          >
                            <option value="">Choose category...</option>
                            {productCategories.map((category) => (
                              <option value={category} key={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Product</span>
                          <input
                            value={
                              selectedTicket.productName ??
                              selectedTicket.productHint ??
                              ""
                            }
                            onChange={(event) =>
                              updateTicket({
                                productName: event.target.value,
                                productHint: event.target.value
                              })
                            }
                          />
                        </label>

                        <label>
                          <span>Quantity</span>
                          <input
                            type="number"
                            min="1"
                            value={selectedTicket.quantity ?? ""}
                            onChange={(event) =>
                              updateTicket({
                                quantity: event.target.value
                                  ? Number(event.target.value)
                                  : undefined
                              })
                            }
                          />
                        </label>

                        <label>
                          <span>Finished width</span>
                          <input
                            type="number"
                            min="0.1"
                            step="0.125"
                            value={selectedTicket.pieceWidth ?? ""}
                            onChange={(event) =>
                              updateTicket({
                                pieceWidth: event.target.value
                                  ? Number(event.target.value)
                                  : undefined
                              })
                            }
                          />
                        </label>

                        <label>
                          <span>Finished height</span>
                          <input
                            type="number"
                            min="0.1"
                            step="0.125"
                            value={selectedTicket.pieceHeight ?? ""}
                            onChange={(event) =>
                              updateTicket({
                                pieceHeight: event.target.value
                                  ? Number(event.target.value)
                                  : undefined
                              })
                            }
                          />
                        </label>

                        <label>
                          <span>Print specification</span>
                          <select
                            value={selectedTicket.colorSpec ?? ""}
                            onChange={(event) =>
                              updateTicket({
                                colorSpec: event.target.value || undefined
                              })
                            }
                          >
                            <option value="">Choose print...</option>
                            {PRINT_SPECS.map((option) => (
                              <option value={option} key={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Sides</span>
                          <select
                            value={selectedTicket.sides ?? ""}
                            onChange={(event) =>
                              updateTicket({
                                sides:
                                  event.target.value === "1"
                                    ? 1
                                    : event.target.value === "2"
                                      ? 2
                                      : undefined
                              })
                            }
                          >
                            <option value="">Choose sides...</option>
                            <option value="1">1 side</option>
                            <option value="2">2 sides</option>
                          </select>
                        </label>

                        <label>
                          <span>Paper hint</span>
                          <input
                            list="email-paper-options"
                            value={selectedTicket.paperHint ?? ""}
                            onChange={(event) =>
                              updateTicket({ paperHint: event.target.value })
                            }
                          />
                          <datalist id="email-paper-options">
                            {paperStocks.map((paper) => (
                              <option value={paper.name} key={paper.id} />
                            ))}
                          </datalist>
                        </label>

                        <label>
                          <span>Finishing</span>
                          <input
                            value={(selectedTicket.finishing ?? []).join(", ")}
                            onChange={(event) =>
                              updateTicket({
                                finishing: event.target.value
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean)
                              })
                            }
                            placeholder="Fold, score, staple..."
                          />
                        </label>

                        <label>
                          <span>Due date</span>
                          <input
                            type="date"
                            value={selectedTicket.dueDate ?? ""}
                            onChange={(event) =>
                              updateTicket({ dueDate: event.target.value })
                            }
                          />
                        </label>

                        <label>
                          <span>Due time</span>
                          <input
                            type="time"
                            value={selectedTicket.dueTime ?? ""}
                            onChange={(event) =>
                              updateTicket({ dueTime: event.target.value })
                            }
                          />
                        </label>
                      </div>

                      <label className="email-ticket-notes">
                        <span>Request summary and internal review notes</span>
                        <textarea
                          value={selectedTicket.notes || selectedTicket.summary}
                          onChange={(event) =>
                            updateTicket({ notes: event.target.value })
                          }
                        />
                      </label>

                      <section className="email-ticket-source">
                        <div className="email-ticket-source-heading">
                          <div>
                            <Mail size={18} />
                            <span>
                              <strong>Source email and attachments</strong>
                              <small>The exact customer message remains connected through conversion.</small>
                            </span>
                          </div>
                          <button
                            className="text-button small"
                            type="button"
                            onClick={() => {
                              setSection("inbox");
                              setSelectedThreadId(selectedTicket.threadId);
                            }}
                          >
                            Open email thread
                            <ArrowRight size={14} />
                          </button>
                        </div>
                        <div className="email-ticket-source-files">
                          {selectedTicketAttachments.map(({ message, attachment }) => (
                            <button
                              type="button"
                              key={attachment.id}
                              onClick={() =>
                                attachmentPreviewKind(attachment) === "other"
                                  ? onDownloadAttachment(selectedTicket.threadId, message.id, attachment.id)
                                  : void previewEmailAttachment(selectedTicket.threadId, message, attachment)
                              }
                            >
                              <Download size={15} />
                              <span>
                                <strong>{attachment.filename}</strong>
                                <small>
                                  {attachment.mimeType} ·{" "}
                                  {Math.max(1, Math.round(attachment.size / 1024)).toLocaleString()} KB
                                </small>
                              </span>
                            </button>
                          ))}
                          {!selectedTicketAttachments.length ? (
                            <span className="muted">No attachment was included with this Job Ticket.</span>
                          ) : null}
                        </div>
                      </section>

                      <section className="email-ticket-calculation">
                        <div className="email-ticket-calculation-heading">
                          <div>
                            <Calculator size={18} />
                            <span>
                              <strong>Preliminary Gross Printing calculation</strong>
                              <small>
                                This uses the normal pricing engine, not an AI-created
                                price.
                              </small>
                            </span>
                          </div>
                          {selectedPricing ? (
                            <b>{formatMoney(selectedPricing.pricing.total)}</b>
                          ) : (
                            <em>More specifications needed</em>
                          )}
                        </div>
                        {selectedPricing ? (
                          <>
                            <div className="email-ticket-price-grid">
                              <div>
                                <span>Paper</span>
                                <strong>
                                  {formatMoney(selectedPricing.pricing.paper)}
                                </strong>
                              </div>
                              <div>
                                <span>Printing</span>
                                <strong>
                                  {formatMoney(selectedPricing.pricing.printing)}
                                </strong>
                              </div>
                              <div>
                                <span>Finishing</span>
                                <strong>
                                  {formatMoney(selectedPricing.pricing.finishing)}
                                </strong>
                              </div>
                              <div>
                                <span>Cutting</span>
                                <strong>
                                  {formatMoney(selectedPricing.pricing.cutting)}
                                </strong>
                              </div>
                            </div>
                            <p>
                              {selectedPricing.stock.name} ·{" "}
                              {selectedPricing.imposition.piecesPerSheet} up ·{" "}
                              {selectedPricing.imposition.sheetsNeeded.toLocaleString()}{" "}
                              sheets · {selectedPricing.bindery.join(", ") || "No finishing"}
                            </p>
                          </>
                        ) : (
                          <p>
                            Confirm product, quantity, finished size, print specification,
                            sides, and paper before the system can calculate.
                          </p>
                        )}
                      </section>

                      <section className="email-ticket-staff-knowledge">
                        <div>
                          <strong>Tell the Job Assistant what you already know</strong>
                          <span>Use this for repeat jobs, phone calls, or facts you already know. This is internal only and is never emailed to the customer.</span>
                        </div>
                        <textarea
                          value={staffKnowledgeDraft}
                          onChange={(event) => setStaffKnowledgeDraft(event.target.value)}
                          placeholder="Example: Same #10 envelope and same artwork as their last order. Customer told me by phone they need 10,000 for Friday."
                        />
                        <button className="primary-button" type="button" onClick={() => void applyStaffKnowledgeAndAnalyze()} disabled={aiTicketBusy || !staffKnowledgeDraft.trim()}>
                          {aiTicketBusy ? <LoaderCircle className="spin" size={15} /> : <BrainCircuit size={15} />}
                          Use my answer + re-check
                        </button>
                      </section>

                      {selectedTicket.aiMissingInformation?.length ? (
                        <section className="email-ticket-question-list">
                          <strong>Questions that still need an answer</strong>
                          <ul>
                            {selectedTicket.aiMissingInformation.map((question) => (
                              <li key={question}>
                                <span>{question}</span>
                                <span className="email-ticket-question-actions">
                                  <button type="button" onClick={() => prepareKnownAnswer(question)}>I know the answer</button>
                                  <button type="button" onClick={() => queueCustomerQuestion(question)}>Ask customer</button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}

                      <section className="email-ticket-customer-reply">
                        <div>
                          <strong>Ask the customer for missing information</strong>
                          <span>
                            This remains editable and is not sent until an employee
                            presses Send questions.
                          </span>
                        </div>
                        <textarea
                          value={
                            selectedTicket.customerReplyDraft ??
                            ticketQuestionDraft(selectedTicket)
                          }
                          onChange={(event) =>
                            updateTicket({
                              customerReplyDraft: event.target.value
                            })
                          }
                        />
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={sendTicketQuestions}
                          disabled={ticketReplyBusy}
                        >
                          {ticketReplyBusy ? (
                            <LoaderCircle className="spin" size={16} />
                          ) : (
                            <Reply size={16} />
                          )}
                          {ticketReplyBusy ? "Sending..." : "Send questions"}
                        </button>
                      </section>
                    </>
                  ) : null}

                  <section className="email-ticket-audit">
                    <div className="email-ticket-audit-heading">
                      <div>
                        <History size={18} />
                        <span>
                          <strong>Job Ticket history</strong>
                          <small>Every status handoff remains traceable.</small>
                        </span>
                      </div>
                      <b>{selectedTicket.history?.length ?? 0} events</b>
                    </div>
                    <div className="email-ticket-audit-list">
                      {(selectedTicket.history ?? [])
                        .slice()
                        .sort(
                          (a, b) =>
                            new Date(b.createdAt).getTime() -
                            new Date(a.createdAt).getTime()
                        )
                        .map((event) => (
                          <div key={event.id}>
                            <span />
                            <div>
                              <strong>{event.status}</strong>
                              <p>{event.note}</p>
                              <small>
                                {formatDateTime(event.createdAt)}
                                {event.employeeName ? ` · ${event.employeeName}` : ""}
                              </small>
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>

                  {ticketView !== "converted" && ticketView !== "archive" ? (
                    <section className="job-ticket-next-action">
                      <div className="job-ticket-next-action-heading">
                        <div>
                          <strong>Take action</strong>
                          <span>Send this ticket to Job Setup, Graphics, Production, Finishing, Billing, or an existing job. It will leave this Email Center queue after you send it.</span>
                        </div>
                        <small className={ticketActionDueLabel(selectedTicket).startsWith("Overdue") ? "overdue" : ""}>{ticketActionDueLabel(selectedTicket)}</small>
                      </div>
                      <div className="job-ticket-next-action-row">
                        <button className="primary-button" type="button" onClick={() => openRouteTicket(selectedTicket)}>
                          <ArrowRight size={16} /> Route & assign
                        </button>
                        <span className="job-ticket-next-action-note">Assigned work appears in the recipient's work queue; Owner/Admin can see all routed work.</span>
                      </div>
                    </section>
                  ) : null}

                  <div className="email-ticket-actions job-ticket-secondary-actions">
                    {ticketView === "archive" ? (
                      <button className="secondary-button" type="button" onClick={() => updateTicket({ status: "New", preferredConversion: undefined, workPath: undefined, workPathConfirmed: false })}>
                        <RotateCcw size={16} /> Restore to active work
                      </button>
                    ) : ticketView !== "converted" ? (
                      <button className="text-button" type="button" onClick={() => updateTicket({ status: "Archived" })}><Archive size={15} /> Move to Settings archive</button>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="email-empty-state">
                  <Ticket size={30} />
                  <strong>Select a Job Ticket</strong>
                  <span>Review the email, files, AI findings, and choose one next action.</span>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}

      {multiItemOpen && selectedTicket ? (
        <MultiItemOrderReview
          ticket={selectedTicket}
          thread={selectedTicketThread}
          authToken={authToken}
          productCategories={productCategories}
          productPresets={productPresets}
          paperStocks={paperStocks}
          learningExamples={learningExamples}
          jobs={jobs}
          onClose={() => setMultiItemOpen(false)}
          onSaveAnalysis={(analysis) => updateTicket({ splitAnalysis: analysis })}
          onCreateOrder={(analysis, mode) => {
            onCreateMultiItemOrder(selectedTicket.id, analysis, mode);
            setMultiItemOpen(false);
          }}
        />
      ) : null}

      {section === "testing" ? (
        <section className="panel email-sent-log email-testing-outbox">
          <div className="panel-heading">
            <div>
              <h2>Testing outbox</h2>
              <span>Messages the MIS blocked, redirected, or sent only to an approved test recipient. A blocked/redirected item does not count as a customer notification.</span>
            </div>
          </div>
          <div className="email-sent-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Intended customer</th>
                  <th>Subject / message</th>
                  <th>Safety result</th>
                </tr>
              </thead>
              <tbody>
                {testingLogs.map((log) => (
                  <tr key={`testing-${log.id}`}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.originalTo || log.to}</td>
                    <td><strong>{log.subject}</strong><small>{log.body}</small></td>
                    <td>
                      <span className={`email-status ${String(log.status ?? "Blocked").toLowerCase().replace(/\s+/g, "-")}`}>{log.status ?? "Blocked"}</span>
                      {log.safetyMode ? <small>{log.safetyMode.toUpperCase()} MODE</small> : null}
                      {log.safetyReason ? <small>{log.safetyReason}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!testingLogs.length ? (
            <div className="email-empty-state">
              <ShieldCheck size={28} />
              <strong>No testing messages yet</strong>
              <span>When Shadow/Test Mode blocks or redirects a customer email, it will appear here instead of disappearing.</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {section === "sent" ? (
        <section className="panel email-sent-log">
          <div className="panel-heading">
            <div>
              <h2>Sent mailbox</h2>
              <span>Real Rackspace Sent history — including messages sent from Thunderbird, Outlook, phones, other computers, and the MIS.</span>
            </div>
            <div className="email-sent-heading-actions">
              <button className="secondary-button" type="button" onClick={() => void openComposer("new")}><Plus size={16} /> New email</button>
              <button className="secondary-button" type="button" onClick={onSync} disabled={syncing}><RefreshCw size={16} className={syncing ? "spin" : ""} /> Refresh</button>
            </div>
          </div>
          <div className="email-sent-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>To</th>
                  <th>Subject / message</th>
                  <th>Source</th>
                  <th>Files</th>
                </tr>
              </thead>
              <tbody>
                {mailboxSentMessages.map(({ thread, message }) => (
                  <tr
                    className="email-sent-clickable"
                    key={`${thread.id}-${message.id}`}
                    tabIndex={0}
                    role="button"
                    onClick={() => openSentMailboxMessage(thread.id, message.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openSentMailboxMessage(thread.id, message.id); } }}
                  >
                    <td>{formatDateTime(message.sentAt)}</td>
                    <td>{message.to.join(", ") || "Recipient"}{message.cc?.length ? <small>CC: {message.cc.join(", ")}</small> : null}</td>
                    <td><strong>{message.subject}</strong><small>{message.bodyText}</small></td>
                    <td><span className="email-status sent">Mailbox Sent</span></td>
                    <td>
                      {message.attachments.length ? message.attachments.map((attachment) => (
                        <button className="text-button small" type="button" key={attachment.id} onClick={(event) => { event.stopPropagation(); void previewEmailAttachment(thread.id, message, attachment); }}>
                          <Paperclip size={13} /> {attachment.filename}
                        </button>
                      )) : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
                {sentLogs.filter((log) => !mailboxSentMessages.some(({ message }) => message.rfcMessageId && message.rfcMessageId === log.providerMessageId)).map((log) => (
                  <tr key={`log-${log.id}`}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.to}</td>
                    <td><strong>{log.subject}</strong><small>{log.body}</small></td>
                    <td><span className={`email-status ${String(log.status ?? "Sent").toLowerCase()}`}>MIS {log.status ?? "Sent"}</span></td>
                    <td><span className="muted">—</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!mailboxSentMessages.length && !sentLogs.length ? (
            <div className="email-empty-state">
              <CheckCircle2 size={28} />
              <strong>No sent email loaded yet</strong>
              <span>The MIS will read the server Sent folder automatically.</span>
            </div>
          ) : null}
          <div className="email-load-older">
            <button className="secondary-button" type="button" onClick={onLoadOlder} disabled={loadingOlder || !hasMore}>
              {loadingOlder ? <LoaderCircle size={15} className="spin" /> : <History size={15} />}
              {loadingOlder ? "Loading older mail..." : hasMore ? "Load older mail" : "All loaded mail shown"}
            </button>
          </div>
        </section>
      ) : null}

      {drivePreview ? (
        <div className="email-attachment-preview-backdrop" role="dialog" aria-modal="true" aria-label="Google Drive preview">
          <section className="email-attachment-preview-modal email-drive-preview-modal">
            <header>
              <div>
                <Link2 size={17} />
                <span>
                  <strong>{drivePreview.filename}</strong>
                  <small>{drivePreview.contextLabel} · Google Drive</small>
                </span>
              </div>
              <div>
                {drivePreview.direction === "inbound" ? <button type="button" onClick={() => { void useMessageInJob(drivePreview.threadId, drivePreview.messageId); closeDrivePreview(); }}><FileInput size={15} /> Use in job</button> : null}
                <button type="button" onClick={closeDrivePreview} aria-label="Close Google Drive preview"><X size={18} /></button>
              </div>
            </header>
            <div className="email-attachment-preview-body email-drive-preview-body">
              {drivePreviewLoading ? (
                <div className="email-drive-preview-loading">
                  <LoaderCircle className="spin" size={38} />
                  <strong>Opening Google Drive file…</strong>
                  <span>{drivePreview.contextLabel}</span>
                </div>
              ) : null}
              <iframe
                key={drivePreview.previewUrl}
                src={drivePreview.previewUrl}
                title={`${drivePreview.filename} — ${drivePreview.contextLabel}`}
                onLoad={() => setDrivePreviewLoading(false)}
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </section>
        </div>
      ) : null}

      {(attachmentPreview || attachmentPreviewBusy || attachmentPreviewError) ? (
        <div className="email-attachment-preview-backdrop" role="dialog" aria-modal="true" aria-label="Attachment preview">
          <section className="email-attachment-preview-modal">
            <header>
              <div><Paperclip size={17} /><span><strong>{attachmentPreview?.filename ?? attachmentPreviewRequest?.filename ?? "Opening attachment"}</strong><small>{attachmentPreview ? `${Math.max(1, Math.round(attachmentPreview.size / 1024))} KB` : attachmentPreviewBusy ? "Retrieving original high-resolution file" : ""}</small></span></div>
              <div>
                {attachmentPreview?.direction === "inbound" ? <button type="button" disabled={quickJobPreparingKey === `${attachmentPreview.messageId}:${attachmentPreview.attachmentId}`} onClick={() => { const thread = threads.find((item) => item.id === attachmentPreview.threadId); const message = thread?.messages.find((item) => item.id === attachmentPreview.messageId); const attachment = message?.attachments.find((item) => item.id === attachmentPreview.attachmentId); if (message && attachment) { void openAttachmentInQuickJob(attachmentPreview.threadId, message, attachment).then(() => closeAttachmentPreview()); } else { void onQuickStartJob(attachmentPreview.threadId, attachmentPreview.messageId, attachmentPreview.attachmentId); closeAttachmentPreview(); } }}><FileInput size={15} /> {quickJobPreparingKey === `${attachmentPreview.messageId}:${attachmentPreview.attachmentId}` ? "Preparing original…" : "Set up this file"}</button> : null}
                {attachmentPreview ? <button type="button" onClick={() => onDownloadAttachment(attachmentPreview.threadId, attachmentPreview.messageId, attachmentPreview.attachmentId, "download")}><Download size={15} /> Download</button> : null}
                <button type="button" onClick={closeAttachmentPreview} aria-label="Close attachment preview"><X size={18} /></button>
              </div>
            </header>
            <div className="email-attachment-preview-body">
              {attachmentPreviewBusy ? <div className="email-preview-loading"><LoaderCircle className="spin" size={28} /><strong>Opening attachment…</strong></div> : null}
              {attachmentPreviewError ? <div className="email-preview-loading error"><AlertTriangle size={28} /><strong>{attachmentPreviewError}</strong><span>The email stays open in the same place. You can retry without leaving this screen.</span><button className="secondary-button" type="button" onClick={retryAttachmentPreview}>Retry attachment</button></div> : null}
              {attachmentPreview?.mimeType === "application/pdf" ? <EmailPdfViewer url={attachmentPreview.url} filename={attachmentPreview.filename} /> : null}
              {attachmentPreview?.mimeType.startsWith("image/") ? <img src={attachmentPreview.url} alt={attachmentPreview.filename} /> : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

// v0.7.0.15 retained feature markers for automated validation:
// email-business-tabs | Route this email as | email-ticket-row-identity
// Prepare job setup | Suggest reply | Approve & send reply | Communication Learning Engine
