"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  Receipt,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  UserCog,
  Database,
  X
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AdminCenter } from "./AdminCenter";
import { BackOffice } from "./BackOffice";
import { Catalog } from "./Catalog";
import { CustomerPortal } from "./CustomerPortal";
import { FilesWorkspace } from "./FilesWorkspace";
import { Dashboard } from "./Dashboard";
import { EmailCenter } from "./EmailCenter";
import { Invoices } from "./Invoices";
import { JobDrawer } from "./JobDrawer";
import { NewEstimateJob } from "./NewEstimateJob";
import { NotificationCenter } from "./NotificationCenter";
import { Orders } from "./Orders";
import { OwnerOperations } from "./OwnerOperations";
import { PortalRequests } from "./PortalRequests";
import { Quotes } from "./Quotes";
import { Settings } from "./Settings";
import { TimeLearning } from "./TimeLearning";
import { Workflow } from "./Workflow";
import {
  catalogPrices as demoCatalogPrices,
  customers as demoCustomers,
  employees,
  defaultEmailTemplates,
  emailIntakeTickets as demoEmailIntakeTickets,
  emailLogs as demoEmailLogs,
  emailThreads as demoEmailThreads,
  invoices as demoInvoices,
  jobs as demoJobs,
  machines as demoMachines,
  paperStocks as demoPaperStocks,
  quotes as demoQuotes,
  statusEvents as demoStatusEvents,
  uploadedFiles as demoUploadedFiles
} from "@/lib/demo-data";
import { PRODUCT_CATEGORIES, PRODUCT_PRESETS, type ProductPreset } from "@/lib/product-catalog";
import { matchCustomerCandidates } from "@/lib/customer-match";
import { classifyBusinessEmail, emailDomain, emailHeaderAddress, emailHeaderName, isPublicEmailDomain, safeBusinessRules } from "@/lib/email-business-classifier";
import { sanitizeLearningText } from "@/lib/learning-engine";
import { userVisibleEmailAttachments, userVisibleThreadAttachments } from "@/lib/email-attachment-utils";
import type { CustomerPortalAdminData, CustomerPortalRequest } from "@/lib/customer-portal-types";
import { calculateEstimatePricing, calculateImposition, emptyBookletSetup, formatMoney, isRushDue, QUANTITY_RATE_CURVE, type QuantityRatePoint } from "@/lib/pricing";
import { placeJobInWorkflow } from "@/lib/workflow";
import {
  clearAuthLinkFromAddressBar,
  passwordChecks,
  readSupabaseEmailLinkFromBrowser,
  updateSupabasePassword
} from "@/lib/supabase-auth-flow";
import type {
  AiLearningExample,
  AiLearningSourceKind,
  AiOrderSplitResult,
  AppView,
  CatalogPrice,
  Customer,
  EmailBusinessCategory,
  EmailBusinessRule,
  EmailIntakeTicket,
  EmailRouteDestination,
  EmailLog,
  EmailMessage,
  EmailSafetyMode,
  EmailSafetySettings,
  EmailSourceAttachmentRef,
  EmailTemplate,
  EmailTemplateKey,
  EmailThread,
  Employee,
  EstimateFormData,
  EstimateIntent,
  Invoice,
  Job,
  JobPricing,
  JobStatus,
  JobStatusEvent,
  Machine,
  OperationalActivity,
  OrderItemSuggestion,
  OrderLineItem,
  PaperStock,
  PrintOrder,
  Quote,
  TimeCategory,
  UploadedFile,
  ImpositionSettings
} from "@/lib/types";

function learningPresetForJob(job: Job, presets: ProductPreset[]) {
  const title = job.title.toLowerCase();
  const named = presets.find((preset) => title.includes(preset.name.toLowerCase()));
  if (named) return named;
  const sized = presets.filter((preset) => {
    const a = [Math.min(job.pieceWidth, job.pieceHeight), Math.max(job.pieceWidth, job.pieceHeight)];
    const b = [Math.min(preset.width, preset.height), Math.max(preset.width, preset.height)];
    return Math.abs(a[0] - b[0]) <= 0.15 && Math.abs(a[1] - b[1]) <= 0.15;
  });
  return sized.length === 1 ? sized[0] : sized.find((preset) => title.includes(preset.category.toLowerCase())) ?? sized[0];
}

type AppRole = "admin" | "front_desk" | "prepress" | "press" | "finishing";

type AuthSetupMode = "invite" | "recovery";

const ALL_ROLES: AppRole[] = ["admin", "front_desk", "prepress", "press", "finishing"];
const OFFICE_ROLES: AppRole[] = ["admin", "front_desk"];

/**
 * Navigation follows the path a job actually takes through the shop: it arrives
 * (Sales), it gets made (Production), it gets billed (Customers), and the shop
 * itself is configured (Administration). The previous grouping split screens
 * into "Work", "Business", and "System", which put Quotes and Orders under one
 * heading and Invoices and Email Center under another, so related steps of the
 * same job were spread across the sidebar.
 */
type NavGroup = "Production" | "Sales" | "Customers" | "Administration";

type MenuItem = {
  id?: string;
  view: AppView;
  label?: string;
  icon: React.ComponentType<{ size?: number }>;
  roles: AppRole[];
  group: NavGroup;
};

const menu: MenuItem[] = [
  // Production. The only group every role can see, and the only group a press,
  // prepress, or finishing user sees at all.
  { view: "Assigned Work", icon: CheckCircle2, roles: ALL_ROLES, group: "Production" },
  { view: "Workflow", icon: ClipboardList, roles: ALL_ROLES, group: "Production" },

  // Sales and intake, in the order a job moves through them.
  { view: "Email Center", icon: Mail, roles: OFFICE_ROLES, group: "Sales" },
  { view: "Portal Requests", icon: ClipboardList, roles: OFFICE_ROLES, group: "Sales" },
  { view: "New Estimate / Job", icon: Gauge, roles: OFFICE_ROLES, group: "Sales" },
  { view: "Quotes", icon: FileText, roles: OFFICE_ROLES, group: "Sales" },
  { view: "Orders", icon: Boxes, roles: OFFICE_ROLES, group: "Sales" },

  // Customers and money. Never visible to production roles: the server already
  // strips invoice fields for those roles, and the sidebar now matches.
  { view: "Customer Portal", icon: Users, roles: OFFICE_ROLES, group: "Customers" },
  { view: "Invoices", icon: Receipt, roles: OFFICE_ROLES, group: "Customers" },
  { view: "Files", icon: FileText, roles: ["admin"], group: "Customers" },

  // Running the shop.
  { view: "Dashboard", icon: LayoutDashboard, roles: ["admin"], group: "Administration" },
  { view: "Catalog", icon: Boxes, roles: ["admin"], group: "Administration" },
  { view: "Back Office", icon: Database, roles: ["admin"], group: "Administration" },
  { view: "Owner Operations", icon: Activity, roles: ["admin"], group: "Administration" },
  { view: "Admin", icon: UserCog, roles: ["admin"], group: "Administration" },
  { view: "Settings", icon: SettingsIcon, roles: ["admin"], group: "Administration" }
];

const navGroupLabels: Record<NavGroup, string> = {
  Production: "Production",
  Sales: "Sales & intake",
  Customers: "Customers & billing",
  Administration: "Shop administration"
};

const NAV_GROUP_ORDER: NavGroup[] = ["Production", "Sales", "Customers", "Administration"];

/**
 * Where each role starts their day. The owner wants the whole shop at a glance,
 * the front desk starts in the inbox, and a production user wants the work that
 * is actually assigned to them rather than the full job board.
 */
const roleLandingView: Record<AppRole, AppView> = {
  admin: "Dashboard",
  front_desk: "Email Center",
  prepress: "Assigned Work",
  press: "Assigned Work",
  finishing: "Assigned Work"
};

const ESTIMATE_DRAFT_STORAGE_KEY = "gross-printing-estimate-draft";
const QUANTITY_CURVE_STORAGE_KEY = "gross-printing-quantity-rate-curve-v1";
const DEMO_STATE_STORAGE_KEY = "gross-printing-demo-state-v1";
const SUPABASE_AUTH_STORAGE_KEY = "gross-printing-supabase-auth-v1";
const PERSISTENCE_CLIENT_STORAGE_KEY = "gross-printing-persistence-client-v1";
const APP_SESSION_STORAGE_KEY = "gross-printing-app-session-v1";
const EMAIL_NOTIFICATION_READ_STORAGE_KEY = "gross-printing-email-notification-read-v1";
const DEMO_PORTAL_REQUESTS_KEY = "gross-printing-demo-portal-requests-v1";
const SUPABASE_FILES_BUCKET = "mis-files";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const DEMO_MODE = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const GOOGLE_AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH !== "false";
const REQUIRE_APPROVED_PROFILE = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_REQUIRE_APPROVED_PROFILE === "true";
const VIEW_PATHS: Record<AppView, string> = {
  Dashboard: "/dashboard",
  Workflow: "/workflow",
  "Assigned Work": "/assigned-work",
  Orders: "/orders",
  "New Estimate / Job": "/new-estimate",
  Quotes: "/quotes",
  Invoices: "/invoices",
  "Email Center": "/email-center",
  "Portal Requests": "/portal-requests",
  "Customer Portal": "/customers",
  Files: "/files",
  Catalog: "/catalog",
  "Time Learning": "/time-learning",
  Settings: "/settings",
  "Back Office": "/back-office",
  "Owner Operations": "/operations",
  Admin: "/admin"
};
const PATH_VIEWS = Object.fromEntries(Object.entries(VIEW_PATHS).map(([view, path]) => [path, view])) as Record<string, AppView>;

function viewLabel(view: AppView) {
  if (view === "Customer Portal") return "Customers";
  if (view === "Portal Requests") return "Portal Requests";
  if (view === "Workflow") return "Jobs / Workflow";
  if (view === "Assigned Work") return "Assigned Work";
  if (view === "New Estimate / Job") return "Job Setup";
  if (view === "Catalog") return "Catalog & Pricing";
  if (view === "Admin") return "Owner Admin";
  if (view === "Files") return "Files & Paperwork";
  return view;
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function multiItemImpositionSettings(): ImpositionSettings {
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
    customColumns: 1,
    customRows: 1,
    margin: 0,
    gutter: 0,
    bleed: 0,
    cropMarkLength: 0,
    cropMarkOffset: 0,
    showBleedGuide: false,
    showRegistrationMarks: false,
    showFoldMarks: false,
    showCornerMarks: true,
    duplexMirror: false
  };
}

function deriveParentOrderStatus(order: PrintOrder, childJobs: Job[]): PrintOrder["status"] {
  const allJobs = childJobs.filter((job) => order.jobIds.includes(job.id));
  if (!allJobs.length) return order.status;
  if (allJobs.every((job) => job.status === "Cancelled")) return "Cancelled";
  const jobs = allJobs.filter((job) => job.status !== "Cancelled");
  if (!jobs.length) return "Cancelled";
  if (jobs.every((job) => job.status === "Delivered")) return "Delivered";
  if (jobs.every((job) => job.status === "Ready" || job.status === "Delivered")) return "Ready";
  if (jobs.some((job) => job.status === "Ready" || job.status === "Delivered")) return "Partially ready";
  if (jobs.some((job) => ["Prepress", "Printing", "Finishing"].includes(job.status))) return "In production";
  if (jobs.some((job) => job.status === "Approved")) return "Approved";
  if (jobs.some((job) => job.status === "Quote")) return "Quote";
  return order.status;
}

function normalizeEmailAddress(value?: string) {
  const raw = value?.trim() ?? "";
  const bracket = raw.match(/<([^>]+)>/);
  return (bracket?.[1] ?? raw).trim().toLowerCase();
}

function displayNameFromEmailHeader(value?: string) {
  const raw = value?.trim() ?? "";
  const beforeBracket = raw.match(/^\s*([^<]+?)\s*<[^>]+>/)?.[1]?.trim();
  if (beforeBracket) return beforeBracket.replace(/^"|"$/g, "");
  const email = normalizeEmailAddress(raw);
  const local = email.split("@")[0] ?? "";
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Customer";
}

function companyNameFromEmailAddress(value?: string) {
  const email = normalizeEmailAddress(value);
  const domain = email.split("@")[1] ?? "";
  const root = domain.split(".")[0] ?? "";
  return root.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || displayNameFromEmailHeader(value);
}

function renderTemplateText(value: string, variables: Record<string, string | number | undefined>) {
  return value.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => {
    const replacement = variables[key];
    return replacement === undefined || replacement === null ? "" : String(replacement);
  });
}

function inferEmailQuantity(text: string) {
  const normalized = text
    .replace(/,/g, "")
    .replace(/\b(?:\+?1[\s.()-]*)?(?:\(?\d{3}\)?[\s.-]+)\d{3}[\s.-]+\d{4}\b/g, " [phone number] ")
    .replace(/\b(?:tel|telephone|phone|cell|mobile)\s*[:#-]?\s*[+()\d\s.-]{7,}\b/gi, " [phone number] ");
  const unit = "(?:pcs?|pieces?|copies?|cards?|flyers?|brochures?|postcards?|labels?|stickers?|booklets?|books?|posters?|signs?|banners?|envelopes?|sheets?|sets?|pads?|invitations?|receipts?)";
  const keywordMatch = normalized.match(/(?:qty|quantity|print|need|order|make|run)\s*[:#=-]?\s*(\d{1,7})\b/i);
  const unitMatch = normalized.match(new RegExp(`\\b(\\d{1,7})\\s*${unit}\\b`, "i"));
  const quantity = Number((keywordMatch ?? unitMatch)?.[1]);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : undefined;
}

function inferEmailProduct(text: string) {
  const products = [
    "business cards",
    "postcards",
    "flyers",
    "booklets",
    "journal",
    "labels",
    "stickers",
    "envelopes",
    "invitations",
    "posters",
    "banners",
    "signs",
    "copies"
  ];
  const lower = text.toLowerCase();
  return products.find((product) => lower.includes(product));
}

function asString(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized ? normalized : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferCustomerType(name: string, email = "") {
  const text = `${name} ${email}`.toLowerCase();
  if (/yeshiva|school|talmud|seminary|academy|pre-k|curriculum/.test(text)) return "School";
  if (/camp/.test(text)) return "Camp";
  if (/refuah|health|care|chesed|rccs/.test(text)) return "Healthcare";
  if (/judaica|gift|market|butcher|coffee|ice cream|cookies|juicery/.test(text)) return "Retail";
  if (/cong|congregation|bais|ohr|kollel|torah|chevrah|kashres|mosdos|mifal|kupath/.test(text)) return "Nonprofit";
  if (/realty|electric|supply|media|printing|agency|homes|inc|llc/.test(text)) return "Business";
  return "Customer";
}

function inferPaperKind(category: string, name: string): PaperStock["kind"] {
  const text = `${category} ${name}`.toLowerCase();
  if (/wide format|banner|corrugated|plastic sheet|printer boxes|roll/.test(text)) return "wide-format";
  if (/envelope|label|laser film|carbonless|ncr/.test(text)) return "specialty";
  if (/cover|c2s|bristol|vellum|card|11pt|13\.8pt|fuschia hots/.test(text)) return "cover";
  return "text";
}

function viewForPathname(pathname: string | null) {
  if (!pathname || pathname === "/") return "Dashboard";
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return PATH_VIEWS[normalized] ?? "Dashboard";
}

function pathForView(view: AppView) {
  return VIEW_PATHS[view];
}

function normalizeQuantityRateCurve(curve: unknown): QuantityRatePoint[] {
  if (!Array.isArray(curve)) return QUANTITY_RATE_CURVE.map((point) => ({ ...point }));
  return QUANTITY_RATE_CURVE.map((defaultPoint) => {
    const savedPoint = curve.find((point) => Math.round(asNumber((point as Partial<QuantityRatePoint>)?.quantity, 0)) === defaultPoint.quantity);
    const multiplier = asNumber((savedPoint as Partial<QuantityRatePoint> | undefined)?.multiplier, defaultPoint.multiplier);
    return {
      quantity: defaultPoint.quantity,
      multiplier: Math.round(Math.min(9.99, Math.max(0.01, multiplier)) * 100) / 100
    };
  });
}

function readQuantityRateCurve() {
  if (typeof window === "undefined" || !DEMO_MODE) return QUANTITY_RATE_CURVE.map((point) => ({ ...point }));
  try {
    return normalizeQuantityRateCurve(JSON.parse(window.localStorage.getItem(QUANTITY_CURVE_STORAGE_KEY) || "[]"));
  } catch {
    return QUANTITY_RATE_CURVE.map((point) => ({ ...point }));
  }
}

type PersistenceMeta = {
  schemaVersion: 1;
  revision: number;
  savedAt: string;
  clientId: string;
};

type NumberingSettings = {
  nextJobNumber?: number;
  updatedAt?: string;
  updatedBy?: string;
};

type DemoPersistedState = {
  customers: Customer[];
  orders: PrintOrder[];
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  uploadedFiles: UploadedFile[];
  emailLogs: EmailLog[];
  emailTemplates: EmailTemplate[];
  emailThreads: EmailThread[];
  emailIntakeTickets: EmailIntakeTicket[];
  emailBusinessRules: EmailBusinessRule[];
  emailSafetySettings: EmailSafetySettings[];
  aiLearningExamples: AiLearningExample[];
  statusEvents: JobStatusEvent[];
  operationalActivities: OperationalActivity[];
  paperStocks: PaperStock[];
  productCategories: string[];
  productPresets: ProductPreset[];
  catalogPrices: CatalogPrice[];
  machines: Machine[];
  quantityRateCurve: QuantityRatePoint[];
  numberingSettings: NumberingSettings;
  persistence?: PersistenceMeta;
};

type SupabaseAuthSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
  email?: string;
  displayName?: string;
  provider?: string;
  role?: AppRole;
  isActive?: boolean;
  profileConfigured?: boolean;
  isOwner?: boolean;
  setupMode?: AuthSetupMode;
};

type SupabaseUserResponse = {
  id?: string;
  email?: string;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  user_metadata?: {
    display_name?: string;
    full_name?: string;
    name?: string;
  };
};



function normalizeRole(value?: string): AppRole {
  if (value === "admin" || value === "front_desk" || value === "prepress" || value === "press" || value === "finishing") {
    return value;
  }
  return "front_desk";
}

function roleLabel(role?: AppRole) {
  if (role === "admin") return "Administrator";
  if (role === "front_desk") return "Office / Estimator";
  if (role === "prepress") return "Prepress";
  if (role === "press") return "Press";
  if (role === "finishing") return "Finishing";
  return "Staff";
}

function roleCanAccessView(role: AppRole, view: AppView) {
  return menu.some((item) => item.view === view && item.roles.includes(role));
}

function displayNameFromUser(user?: SupabaseUserResponse) {
  const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.user_metadata?.display_name;
  return name?.trim() || user?.email;
}

function isAuthExpired(session: SupabaseAuthSession) {
  return Boolean(session.expiresAt && session.expiresAt < Date.now() + 60_000);
}

function readStoredAuthSession(): SupabaseAuthSession | null {
  // v0.6.7 keeps staff access and refresh tokens out of browser storage.
  return null;
}

function storeAuthSession(_session: SupabaseAuthSession | null) {
  // Authentication is persisted only in secure HttpOnly server cookies.
}

async function readServerAuthSession(): Promise<SupabaseAuthSession | null> {
  const requestSession = async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    const payload = (await response.json().catch(() => ({}))) as { session?: SupabaseAuthSession; retryable?: boolean };
    return { response, payload };
  };
  const readWithRetry = async () => {
    let result = await requestSession();
    // A remembered login is shared by every MIS tab. If another tab rotated the
    // refresh token a fraction of a second earlier, wait for its Set-Cookie to
    // settle and retry with the browser's newest cookie rather than logging out.
    if (!result.response.ok && result.payload.retryable) {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      result = await requestSession();
    }
    if (!result.response.ok) return null;
    return result.payload.session?.accessToken ? result.payload.session : null;
  };

  // Chrome/Edge support Web Locks across tabs on the same origin. Serializing
  // auth refreshes here prevents two open MIS tabs from spending the same
  // one-time Supabase refresh token at once. Other browsers use the safe retry.
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("gross-printing-auth-refresh", { mode: "exclusive" }, readWithRetry);
  }
  return readWithRetry();
}

async function establishServerAuthSession(session: SupabaseAuthSession, rememberDays = 0): Promise<SupabaseAuthSession> {
  if (!session.accessToken || !session.refreshToken) throw new Error("The secure sign-in session is incomplete.");
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: Math.max(60, Math.round(((session.expiresAt ?? Date.now() + 3600000) - Date.now()) / 1000)),
      rememberDays
    })
  });
  const payload = (await response.json().catch(() => ({}))) as { session?: SupabaseAuthSession; error?: string };
  if (!response.ok || !payload.session) throw new Error(payload.error ?? "Secure sign-in could not be established.");
  return {
    ...payload.session,
    accessToken: session.setupMode ? session.accessToken : payload.session.accessToken,
    refreshToken: session.setupMode ? session.refreshToken : undefined,
    setupMode: session.setupMode
  };
}

async function clearServerAuthSession() {
  await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin", cache: "no-store" }).catch(() => undefined);
}

function getAppSessionId() {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(APP_SESSION_STORAGE_KEY);
  if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  const sessionId = crypto.randomUUID();
  window.localStorage.setItem(APP_SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

async function updateAppSession(accessToken: string, sessionId: string, currentView: string) {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sessionId, currentView, event: "heartbeat" }),
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    role?: AppRole;
    isOwner?: boolean;
    displayName?: string;
  };
  return { response, payload };
}

function readAuthSessionFromUrl(): { session: SupabaseAuthSession | null; error?: string } {
  if (typeof window === "undefined") return { session: readStoredAuthSession() };
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  const error = hashParams.get("error_description") ?? queryParams.get("error_description") ?? hashParams.get("error") ?? queryParams.get("error");
  const accessToken = hashParams.get("access_token") ?? queryParams.get("access_token");
  if (!accessToken) return { session: readStoredAuthSession(), error: error ? decodeURIComponent(error.replace(/\+/g, " ")) : undefined };

  const expiresIn = Number(hashParams.get("expires_in") ?? queryParams.get("expires_in") ?? 3600);
  const type = hashParams.get("type") ?? queryParams.get("type");
  const session: SupabaseAuthSession = {
    accessToken,
    refreshToken: hashParams.get("refresh_token") ?? queryParams.get("refresh_token") ?? undefined,
    expiresAt: Date.now() + expiresIn * 1000,
    setupMode: type === "invite" ? "invite" : type === "recovery" ? "recovery" : undefined
  };
  storeAuthSession(session);
  window.history.replaceState(null, "", window.location.pathname);
  return { session };
}


function cloneDemoValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultDemoState(): DemoPersistedState {
  return {
    customers: cloneDemoValue(demoCustomers),
    orders: [],
    jobs: cloneDemoValue(demoJobs),
    quotes: cloneDemoValue(demoQuotes),
    invoices: cloneDemoValue(demoInvoices),
    uploadedFiles: cloneDemoValue(demoUploadedFiles),
    emailLogs: cloneDemoValue(demoEmailLogs),
    emailTemplates: cloneDemoValue(defaultEmailTemplates),
    emailThreads: cloneDemoValue(demoEmailThreads),
    emailIntakeTickets: cloneDemoValue(demoEmailIntakeTickets),
    emailBusinessRules: [],
    emailSafetySettings: [{
      id: "primary",
      mode: "shadow",
      testRecipients: [],
      redirectBlockedEnabled: false,
      redirectBlockedTo: "",
      updatedAt: "2026-08-17T00:00:00.000Z"
    }],
    aiLearningExamples: [],
    statusEvents: cloneDemoValue(demoStatusEvents),
    operationalActivities: [],
    paperStocks: cloneDemoValue(demoPaperStocks),
    productCategories: cloneDemoValue(PRODUCT_CATEGORIES),
    productPresets: cloneDemoValue(PRODUCT_PRESETS),
    catalogPrices: cloneDemoValue(demoCatalogPrices),
    machines: cloneDemoValue(demoMachines),
    quantityRateCurve: QUANTITY_RATE_CURVE.map((point) => ({ ...point })),
    numberingSettings: {}
  };
}

function normalizeEmailIntakeStatus(ticket: EmailIntakeTicket): EmailIntakeTicket["status"] {
  if (ticket.status === "Draft") return "New";
  if (ticket.status === "In Review") {
    return ticket.aiMissingInformation?.length ? "Missing Information" : ticket.aiAnalysisId ? "AI Reviewed" : "New";
  }
  return ticket.status;
}

function normalizeEmailIntakeTicket(ticket: EmailIntakeTicket, index = 0): EmailIntakeTicket {
  const normalizedStatus = normalizeEmailIntakeStatus(ticket);
  const historyText = (ticket.history ?? []).map((event) => event.note || "").join(" ").toLowerCase();
  const origin: EmailIntakeTicket["origin"] = ticket.origin ?? (
    historyText.includes("staff created this intake ticket") || historyText.includes("staff created this job ticket")
      ? "staff"
      : "legacy_auto"
  );
  // v0.7.0.21 changes Job Tickets into a staff action queue. Old automatic
  // tickets stay in history but are moved out of active work once on hydration.
  const status: EmailIntakeTicket["status"] =
    origin === "legacy_auto" && !["Converted", "Ignored", "Archived"].includes(normalizedStatus)
      ? "Archived"
      : normalizedStatus;
  const createdAt = ticket.createdAt || new Date().toISOString();
  return {
    ...ticket,
    origin,
    ticketNumber: ticket.ticketNumber ?? `ET-${String(1001 + index).padStart(4, "0")}`,
    status,
    finishing: Array.isArray(ticket.finishing) ? ticket.finishing : ticket.aiSpecification?.finishing ?? [],
    productCategory: ticket.productCategory ?? ticket.aiSpecification?.productCategory,
    productName: ticket.productName ?? ticket.aiSpecification?.productName,
    pieceWidth: ticket.pieceWidth ?? ticket.aiSpecification?.finishedWidth,
    pieceHeight: ticket.pieceHeight ?? ticket.aiSpecification?.finishedHeight,
    sides: ticket.sides ?? ticket.aiSpecification?.sides,
    colorSpec: ticket.colorSpec ?? ticket.aiSpecification?.colorSpec,
    paperHint: ticket.paperHint ?? ticket.aiSpecification?.paperHint,
    preferredConversion:
      ticket.preferredConversion ??
      (status === "Ready for Job" ? "job" : status === "Ready for Quote" ? "quote" : undefined),
    workPath:
      ticket.workPath ??
      (status === "Ready for Job" ? "job" : status === "Ready for Quote" ? "estimate" : undefined),
    history: ticket.history?.length
      ? ticket.history
      : [{
          id: `ticket-event-${ticket.id}-created`,
          status,
          createdAt,
          note: "Job Ticket created from email."
        }]
  };
}

function upgradeEmailTemplateForPortalLinks(template: EmailTemplate): EmailTemplate {
  if (/{{\s*portal_(?:link|job_link|quote_link|invoice_link)\s*}}/i.test(template.body)) return template;
  const variable = template.id === "quote_ready"
    ? "{{portal_quote_link}}"
    : template.id === "invoice" || template.id === "ready_pickup"
      ? "{{portal_invoice_link}}"
      : ["job_in_production", "job_completed", "job_received", "proof_approval", "changes_requested"].includes(template.id)
        ? "{{portal_job_link}}"
        : "";
  if (!variable) return template;
  return {
    ...template,
    body: `${template.body.trim()}\n\nMore details in the Gross Printing Customer Portal:\n${variable}`,
    updatedAt: "2026-08-14T16:30:00-04:00"
  };
}

function normalizeDemoState(saved?: Partial<DemoPersistedState>): DemoPersistedState {
  const defaults = defaultDemoState();
  return {
    customers: Array.isArray(saved?.customers) ? saved.customers : defaults.customers,
    orders: Array.isArray(saved?.orders) ? saved.orders : defaults.orders,
    jobs: Array.isArray(saved?.jobs) ? saved.jobs : defaults.jobs,
    quotes: Array.isArray(saved?.quotes) ? saved.quotes : defaults.quotes,
    invoices: Array.isArray(saved?.invoices) ? saved.invoices : defaults.invoices,
    uploadedFiles: Array.isArray(saved?.uploadedFiles) ? saved.uploadedFiles : defaults.uploadedFiles,
    emailLogs: Array.isArray(saved?.emailLogs) ? saved.emailLogs : defaults.emailLogs,
    emailTemplates: Array.isArray(saved?.emailTemplates)
      ? [
          ...defaults.emailTemplates.map(
            (template) => upgradeEmailTemplateForPortalLinks(saved.emailTemplates!.find((savedTemplate) => savedTemplate.id === template.id) ?? template)
          ),
          ...saved.emailTemplates.filter(
            (savedTemplate) => !defaults.emailTemplates.some((template) => template.id === savedTemplate.id)
          ).map(upgradeEmailTemplateForPortalLinks)
        ]
      : defaults.emailTemplates.map(upgradeEmailTemplateForPortalLinks),
    emailThreads: Array.isArray(saved?.emailThreads)
      ? DEMO_MODE
        ? [
            ...saved.emailThreads,
            ...defaults.emailThreads.filter(
              (thread) => !saved.emailThreads!.some((savedThread) => savedThread.id === thread.id)
            )
          ]
        : saved.emailThreads
      : defaults.emailThreads,
    emailIntakeTickets: (Array.isArray(saved?.emailIntakeTickets) ? saved.emailIntakeTickets : defaults.emailIntakeTickets)
      .map((ticket, index) => normalizeEmailIntakeTicket(ticket, index)),
    emailBusinessRules: safeBusinessRules(Array.isArray(saved?.emailBusinessRules) ? saved.emailBusinessRules : defaults.emailBusinessRules),
    emailSafetySettings: Array.isArray(saved?.emailSafetySettings) && saved.emailSafetySettings.length
      ? saved.emailSafetySettings.map((item) => ({
          id: "primary" as const,
          mode: item.mode === "live" || item.mode === "test" ? item.mode : "shadow",
          testRecipients: Array.isArray(item.testRecipients) ? [...new Set(item.testRecipients.map((email) => email.trim().toLowerCase()).filter(isValidEmail))].slice(0, 50) : [],
          redirectBlockedEnabled: Boolean(item.redirectBlockedEnabled && item.redirectBlockedTo),
          redirectBlockedTo: item.redirectBlockedTo?.trim().toLowerCase() || "",
          updatedAt: item.updatedAt || nowIso(),
          updatedBy: item.updatedBy
        }))
      : defaults.emailSafetySettings,
    aiLearningExamples: Array.isArray(saved?.aiLearningExamples) ? saved.aiLearningExamples : defaults.aiLearningExamples,
    statusEvents: Array.isArray(saved?.statusEvents) ? saved.statusEvents : defaults.statusEvents,
    operationalActivities: Array.isArray(saved?.operationalActivities) ? saved.operationalActivities : defaults.operationalActivities,
    paperStocks: Array.isArray(saved?.paperStocks) ? saved.paperStocks : defaults.paperStocks,
    productCategories: Array.isArray(saved?.productCategories) ? saved.productCategories : defaults.productCategories,
    productPresets: Array.isArray(saved?.productPresets) ? saved.productPresets : defaults.productPresets,
    catalogPrices: Array.isArray(saved?.catalogPrices) ? saved.catalogPrices : defaults.catalogPrices,
    machines: Array.isArray(saved?.machines) ? saved.machines : defaults.machines,
    quantityRateCurve: Array.isArray(saved?.quantityRateCurve)
      ? normalizeQuantityRateCurve(saved.quantityRateCurve)
      : defaults.quantityRateCurve,
    numberingSettings: saved?.numberingSettings && typeof saved.numberingSettings === "object"
      ? {
          nextJobNumber: Number.isFinite(Number(saved.numberingSettings.nextJobNumber)) && Number(saved.numberingSettings.nextJobNumber) > 0
            ? Math.floor(Number(saved.numberingSettings.nextJobNumber))
            : undefined,
          updatedAt: saved.numberingSettings.updatedAt,
          updatedBy: saved.numberingSettings.updatedBy
        }
      : defaults.numberingSettings,
    persistence: saved?.persistence
  };
}

function stateFingerprint(state: Omit<DemoPersistedState, "persistence"> | DemoPersistedState) {
  const { persistence: _persistence, ...records } = state as DemoPersistedState;
  return JSON.stringify(records);
}

function persistenceTime(state?: Partial<DemoPersistedState>) {
  const timestamp = state?.persistence?.savedAt ? new Date(state.persistence.savedAt).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newestSavedState(
  localState?: Partial<DemoPersistedState>,
  cloudState?: Partial<DemoPersistedState>
): Partial<DemoPersistedState> | undefined {
  if (!localState) return cloudState;
  if (!cloudState) return localState;
  const localIsLegacy = !localState.persistence;
  const cloudIsLegacy = cloudState.persistence?.clientId === "legacy-cloud";
  if (localIsLegacy && cloudIsLegacy) return localState;
  const localTime = persistenceTime(localState);
  const cloudTime = persistenceTime(cloudState);
  if (localTime !== cloudTime) return localTime > cloudTime ? localState : cloudState;
  const localRevision = localState.persistence?.revision ?? 0;
  const cloudRevision = cloudState.persistence?.revision ?? 0;
  return localRevision >= cloudRevision ? localState : cloudState;
}

function readDemoState(): Partial<DemoPersistedState> | undefined {
  if (typeof window === "undefined" || !DEMO_MODE) return undefined;
  try {
    const raw = window.localStorage.getItem(DEMO_STATE_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getPersistenceClientId() {
  if (!DEMO_MODE) return "server-v067";
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(PERSISTENCE_CLIENT_STORAGE_KEY);
  if (existing) return existing;
  const created = `browser-${crypto.randomUUID()}`;
  window.localStorage.setItem(PERSISTENCE_CLIENT_STORAGE_KEY, created);
  return created;
}

async function readCloudDemoState(accessToken?: string): Promise<Partial<DemoPersistedState> | undefined> {
  if (!accessToken) return undefined;
  const response = await fetch("/api/shop-data", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json().catch(() => ({}))) as { state?: Partial<DemoPersistedState>; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Protected server load failed");
  return payload.state;
}

async function writeCloudDemoState(state: DemoPersistedState, accessToken?: string, baseRevision = 0) {
  if (!accessToken) return { serverRevision: baseRevision, savedAt: nowIso() };
  const response = await fetch("/api/shop-data", {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ state, baseRevision })
  });
  const payload = (await response.json().catch(() => ({}))) as { serverRevision?: number; savedAt?: string; error?: string; code?: string };
  if (!response.ok) {
    const error = new Error(payload.error ?? "Protected server save failed") as Error & { code?: string; serverRevision?: number };
    error.code = payload.code;
    error.serverRevision = payload.serverRevision;
    throw error;
  }
  return { serverRevision: Number(payload.serverRevision ?? baseRevision + 1), savedAt: payload.savedAt ?? nowIso() };
}

function safeStorageName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}

async function uploadSupabaseFile(file: File, storagePath: string, accessToken?: string) {
  if (!accessToken) return false;
  const form = new FormData();
  form.set("file", file);
  form.set("storagePath", storagePath);
  const response = await fetch("/api/files/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  if (!response.ok) throw new Error(await readResponseError(response, `Could not upload ${file.name}.`));
  return true;
}

async function signedSupabaseFileUrl(storagePath: string, accessToken?: string) {
  if (!accessToken) return undefined;
  const response = await fetch(`/api/files/sign?path=${encodeURIComponent(storagePath)}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(await readResponseError(response, "Could not create a secure file link."));
  const payload = (await response.json()) as { url?: string };
  return payload.url;
}

function isValidEmail(email?: string) {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
}

async function readResponseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string; error_description?: string; error?: string; msg?: string };
    return payload.message ?? payload.error_description ?? payload.msg ?? payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

function nextPrefixedNumber(existingNumbers: Array<string | undefined>, prefix: string, fallbackStart: number, preferredNext?: number) {
  const used = new Set<number>();
  let highest = fallbackStart - 1;
  existingNumbers.forEach((value) => {
    const match = value?.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    const parsed = match ? Number(match[1]) : Number.NaN;
    if (!Number.isFinite(parsed)) return;
    used.add(parsed);
    highest = Math.max(highest, parsed);
  });
  let candidate = Number.isFinite(preferredNext) && Number(preferredNext) > 0
    ? Math.floor(Number(preferredNext))
    : highest + 1;
  while (used.has(candidate)) candidate += 1;
  return `${prefix}-${candidate}`;
}

function nextNumberAfter(value?: string) {
  const match = value?.match(/-(\d+)$/);
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed + 1 : undefined;
}

export function MISApp() {
  const [clientPathname, setClientPathname] = useState("/");
  const [clientSearch, setClientSearch] = useState("");
  const activeView = viewForPathname(clientPathname);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [demoStateHydrated, setDemoStateHydrated] = useState(false);
  const [quantityCurveHydrated, setQuantityCurveHydrated] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paperStocks, setPaperStocks] = useState<PaperStock[]>([]);
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [productPresets, setProductPresets] = useState<ProductPreset[]>([]);
  const [catalogPrices, setCatalogPrices] = useState<CatalogPrice[]>([]);
  const [quantityRateCurve, setQuantityRateCurve] = useState<QuantityRatePoint[]>([]);
  const [numberingSettings, setNumberingSettings] = useState<NumberingSettings>({});
  const [machines, setMachines] = useState<Machine[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [emailThreads, setEmailThreads] = useState<EmailThread[]>([]);
  const [emailIntakeTickets, setEmailIntakeTickets] = useState<EmailIntakeTicket[]>([]);
  const [emailBusinessRules, setEmailBusinessRules] = useState<EmailBusinessRule[]>([]);
  const [emailSafetySettings, setEmailSafetySettings] = useState<EmailSafetySettings[]>([]);
  const [aiLearningExamples, setAiLearningExamples] = useState<AiLearningExample[]>([]);
  const [activeIntakeTicketId, setActiveIntakeTicketId] = useState<string | undefined>();
  const [portalRequests, setPortalRequests] = useState<CustomerPortalRequest[]>([]);
  const [portalRequestsLoading, setPortalRequestsLoading] = useState(false);
  const [activePortalRequest, setActivePortalRequest] = useState<CustomerPortalRequest | undefined>();
  const [readEmailNotificationIds, setReadEmailNotificationIds] = useState<string[]>([]);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [emailLoadingOlder, setEmailLoadingOlder] = useState(false);
  const [emailHistoryPage, setEmailHistoryPage] = useState(0);
  const [emailHasMore, setEmailHasMore] = useState(true);
  const [emailConnectionLabel, setEmailConnectionLabel] = useState(DEMO_MODE ? "Demo mailbox" : "Not checked");
  const [statusEvents, setStatusEvents] = useState<JobStatusEvent[]>([]);
  const [operationalActivities, setOperationalActivities] = useState<OperationalActivity[]>([]);
  const [completionPrompt, setCompletionPrompt] = useState<{ jobId: string; invoiceId: string }>();
  const [focusedInvoiceId, setFocusedInvoiceId] = useState<string>();
  const [focusedQuoteId, setFocusedQuoteId] = useState<string>();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | undefined>();
  const [currentEmployeeId, setCurrentEmployeeId] = useState(employees[0]?.id ?? "");
  const [focusedCustomerId, setFocusedCustomerId] = useState<string | undefined>();
  const [estimateCustomerId, setEstimateCustomerId] = useState<string | undefined>();
  const [estimateHandoffArtworkFile, setEstimateHandoffArtworkFile] = useState<File | undefined>();
  const [activeTimer, setActiveTimer] = useState<{ jobId: string; category: TimeCategory; startedAt: string } | undefined>();
  const [notice, setNotice] = useState(DEMO_MODE ? "Local demo data is active." : "Workspace ready.");
  const [toast, setToast] = useState<string | undefined>();
  const [estimateDirty, setEstimateDirty] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState<{ action: () => void } | undefined>();
  const [authReady, setAuthReady] = useState(false);
  const [authSession, setAuthSession] = useState<SupabaseAuthSession | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [rememberDays, setRememberDays] = useState<0 | 7 | 30>(30);
  const [authNewPassword, setAuthNewPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authLinkProblem, setAuthLinkProblem] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "forgot" | "reset-sent">("signin");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [cloudSaveState, setCloudSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dataSyncState, setDataSyncState] = useState<"idle" | "checking" | "current" | "offline" | "error">("idle");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const cloudSaveTimer = useRef<number | null>(null);
  const pendingCloudState = useRef<DemoPersistedState | null>(null);
  const cloudSaveInFlight = useRef(false);
  const authTokenRef = useRef<string | undefined>(undefined);
  const appSessionIdRef = useRef("");
  const lastStateFingerprint = useRef("");
  const persistenceRevision = useRef(0);
  const serverRevisionRef = useRef(0);
  const persistenceClientId = useRef("");
  const convertingTicketIdsRef = useRef<Set<string>>(new Set());
  const emailSyncInFlightRef = useRef(false);
  const cloudReadInFlightRef = useRef(false);
  const displayViewRef = useRef<AppView>("Dashboard");
  const scrollPositionsRef = useRef<Record<string, number>>({});

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId), [jobs, selectedJobId]);
  const selectedCustomer = selectedJob ? customers.find((customer) => customer.id === selectedJob.customerId) : undefined;
  const selectedQuote = selectedJob?.quoteId ? quotes.find((quote) => quote.id === selectedJob.quoteId) : undefined;
  const selectedParentOrder = selectedJob?.orderId ? orders.find((order) => order.id === selectedJob.orderId) : undefined;
  const selectedInvoice = selectedJob?.invoiceId ? invoices.find((invoice) => invoice.id === selectedJob.invoiceId) : undefined;
  const selectedIntakeTicket = selectedJob?.intakeTicketId
    ? emailIntakeTickets.find((ticket) => ticket.id === selectedJob.intakeTicketId)
    : undefined;
  const selectedPortalRequest = selectedJob?.portalRequestId
    ? portalRequests.find((request) => request.id === selectedJob.portalRequestId)
    : undefined;
  const editingJob = editingJobId ? jobs.find((job) => job.id === editingJobId) : undefined;
  const activeIntakeTicket = activeIntakeTicketId ? emailIntakeTickets.find((ticket) => ticket.id === activeIntakeTicketId) : undefined;
  const portalActiveCount = portalRequests.filter(
    (request) => !["Converted", "Closed", "Archived", "Completed"].includes(request.status)
  ).length;
  const unreadEmailCount = emailThreads
    .filter((thread) => !thread.archived)
    .flatMap((thread) => thread.messages)
    .filter((message) => message.direction === "inbound" && message.unread).length;
  const currentEmployee: Employee = authSession
    ? {
        id: authSession.userId ?? "signed-in-user",
        name: authSession.displayName ?? authSession.email ?? "Signed-in user",
        role: roleLabel(authSession.role)
      }
    : employees.find((employee) => employee.id === currentEmployeeId) ?? { id: "emp-demo", name: "Demo Operator", role: "Production" };
  const authConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  const authRequired = authConfigured && !DEMO_MODE;
  const needsAuthSetup = !authConfigured && !DEMO_MODE;
  const authToken = authSession?.accessToken;
  const currentRole = authSession?.role ?? "admin";
  const activeAssignedWorkCount = emailIntakeTickets
    .filter((ticket) => Boolean(ticket.routedAt) && !ticket.routeCompletedAt && ticket.status !== "Converted" && ticket.status !== "Archived" && ticket.status !== "Ignored")
    .filter((ticket) => {
      if (currentRole === "admin") return true;
      if (ticket.assignedToUserId) return ticket.assignedToUserId === authSession?.userId;
      return ticket.assignedRole === currentRole;
    }).length;
  const emailSafety: EmailSafetySettings = emailSafetySettings[0] ?? {
    id: "primary",
    mode: "shadow",
    testRecipients: [],
    redirectBlockedEnabled: false,
    redirectBlockedTo: "",
    updatedAt: "2026-08-17T00:00:00.000Z"
  };
  const visibleMenu = menu.filter((item) => item.roles.includes(currentRole));
  const groupedVisibleMenu = NAV_GROUP_ORDER
    .map((group) => ({ group, items: visibleMenu.filter((item) => item.group === group) }))
    .filter((section) => section.items.length > 0);
  // Land each role on the screen their day starts from, falling back to the
  // first screen they are allowed to open.
  const landing = roleLandingView[currentRole];
  const defaultView = landing && roleCanAccessView(currentRole, landing)
    ? landing
    : visibleMenu[0]?.view ?? "Workflow";
  const displayView = roleCanAccessView(currentRole, activeView) ? activeView : defaultView;
  const ActiveViewIcon = visibleMenu.find((item) => item.view === displayView)?.icon ?? LayoutDashboard;

  async function loadPortalRequestQueue() {
    if (!demoStateHydrated && !DEMO_MODE) return;
    if (!DEMO_MODE && !["admin", "front_desk"].includes(currentRole)) {
      setPortalRequests([]);
      setPortalRequestsLoading(false);
      return;
    }
    setPortalRequestsLoading(true);
    try {
      const response = await fetch("/api/customer-portal/admin", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as CustomerPortalAdminData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load portal requests.");
      let nextRequests = payload.requests ?? [];
      if (DEMO_MODE && typeof window !== "undefined") {
        try {
          const saved = JSON.parse(
            window.localStorage.getItem(DEMO_PORTAL_REQUESTS_KEY) ?? "[]"
          ) as unknown;
          if (Array.isArray(saved)) {
            const localRequests = saved.filter(
              (item): item is CustomerPortalRequest => Boolean(item && typeof item === "object")
            );
            nextRequests = [
              ...localRequests,
              ...nextRequests.filter(
                (request) => !localRequests.some((local) => local.id === request.id)
              )
            ];
          }
        } catch {
          window.localStorage.removeItem(DEMO_PORTAL_REQUESTS_KEY);
        }
      }
      setPortalRequests(nextRequests);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load portal requests.");
    } finally {
      setPortalRequestsLoading(false);
    }
  }

  async function patchPortalNotification(requestId: string, read: boolean) {
    const readAt = read ? nowIso() : null;
    const readBy = read ? currentEmployee.name : null;
    setPortalRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              notificationReadAt: readAt ?? undefined,
              notificationReadBy: readBy ?? undefined
            }
          : request
      )
    );
    try {
      await fetch("/api/customer-portal/admin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          action: "notification",
          requestId,
          notificationReadAt: readAt,
          notificationReadBy: readBy
        })
      });
    } catch {
      // The next queue refresh restores the server state if this update failed.
    }
  }

  async function markAllPortalNotificationsRead() {
    const unread = portalRequests.filter((request) => !request.notificationReadAt);
    const readAt = nowIso();
    setPortalRequests((current) =>
      current.map((request) =>
        request.notificationReadAt
          ? request
          : { ...request, notificationReadAt: readAt, notificationReadBy: currentEmployee.name }
      )
    );
    await Promise.all(
      unread.map((request) =>
        fetch("/api/customer-portal/admin", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          },
          body: JSON.stringify({
            action: "notification",
            requestId: request.id,
            notificationReadAt: readAt,
            notificationReadBy: currentEmployee.name
          })
        }).catch(() => undefined)
      )
    );
  }

  function markEmailNotificationRead(ticketId: string) {
    setReadEmailNotificationIds((current) =>
      current.includes(ticketId) ? current : [...current, ticketId]
    );
  }

  function openPortalRequest(requestId: string) {
    updateClientLocation(`/portal-requests?request=${encodeURIComponent(requestId)}`);
  }

  function openEmailTicketNotification(ticketId: string) {
    updateClientLocation(`/email-center?ticket=${encodeURIComponent(ticketId)}`);
  }

  function currentPersistedState(overrides: Partial<DemoPersistedState> = {}): DemoPersistedState {
    return {
      customers: overrides.customers ?? customers,
      orders: overrides.orders ?? orders,
      jobs: overrides.jobs ?? jobs,
      quotes: overrides.quotes ?? quotes,
      invoices: overrides.invoices ?? invoices,
      uploadedFiles: overrides.uploadedFiles ?? uploadedFiles,
      emailLogs: overrides.emailLogs ?? emailLogs,
      emailTemplates: overrides.emailTemplates ?? emailTemplates,
      emailThreads: overrides.emailThreads ?? emailThreads,
      emailIntakeTickets: overrides.emailIntakeTickets ?? emailIntakeTickets,
      emailBusinessRules: overrides.emailBusinessRules ?? emailBusinessRules,
      emailSafetySettings: overrides.emailSafetySettings ?? emailSafetySettings,
      aiLearningExamples: overrides.aiLearningExamples ?? aiLearningExamples,
      statusEvents: overrides.statusEvents ?? statusEvents,
      operationalActivities: overrides.operationalActivities ?? operationalActivities,
      paperStocks: overrides.paperStocks ?? paperStocks,
      productCategories: overrides.productCategories ?? productCategories,
      productPresets: overrides.productPresets ?? productPresets,
      catalogPrices: overrides.catalogPrices ?? catalogPrices,
      machines: overrides.machines ?? machines,
      quantityRateCurve: overrides.quantityRateCurve ?? quantityRateCurve,
      numberingSettings: overrides.numberingSettings ?? numberingSettings
    };
  }

  function applyPersistedStateSnapshot(
    selectedState?: Partial<DemoPersistedState>,
    options: { writeBrowserBackup?: boolean } = {}
  ) {
    const normalized = normalizeDemoState(selectedState);
    const selectedRevision = selectedState?.persistence?.revision ?? 0;
    const selectedSavedAt = selectedState?.persistence?.savedAt ?? nowIso();
    const selectedClientId = selectedState?.persistence?.clientId ?? getPersistenceClientId();
    const hydratedState: DemoPersistedState = {
      ...normalized,
      persistence: {
        schemaVersion: 1,
        revision: selectedRevision,
        savedAt: selectedSavedAt,
        clientId: selectedClientId
      }
    };

    persistenceRevision.current = selectedRevision;
    serverRevisionRef.current = selectedRevision;
    persistenceClientId.current = selectedClientId;
    lastStateFingerprint.current = stateFingerprint(hydratedState);
    if (DEMO_MODE && options.writeBrowserBackup !== false) {
      try {
        window.localStorage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify(hydratedState));
      } catch {
        setCloudSaveState("error");
      }
    }

    setCustomers(hydratedState.customers);
    setOrders(hydratedState.orders);
    setJobs(hydratedState.jobs);
    setQuotes(hydratedState.quotes);
    setInvoices(hydratedState.invoices);
    setUploadedFiles(hydratedState.uploadedFiles);
    setEmailLogs(hydratedState.emailLogs);
    setEmailTemplates(hydratedState.emailTemplates);
    setEmailThreads(hydratedState.emailThreads);
    setEmailIntakeTickets(hydratedState.emailIntakeTickets);
    setEmailBusinessRules(hydratedState.emailBusinessRules);
    setEmailSafetySettings(hydratedState.emailSafetySettings);
    setAiLearningExamples(hydratedState.aiLearningExamples);
    setStatusEvents(hydratedState.statusEvents);
    setOperationalActivities(hydratedState.operationalActivities);
    setPaperStocks(hydratedState.paperStocks);
    setProductCategories(hydratedState.productCategories);
    setProductPresets(hydratedState.productPresets);
    setCatalogPrices(hydratedState.catalogPrices);
    setMachines(hydratedState.machines);
    setQuantityRateCurve(hydratedState.quantityRateCurve);
    setNumberingSettings(hydratedState.numberingSettings);
    setDemoStateHydrated(true);
    setQuantityCurveHydrated(true);
    setCloudSaveState((current) => (current === "error" ? current : "saved"));
    return hydratedState;
  }

  function updateClientLocation(target: string, mode: "push" | "replace" = "push") {
    if (typeof window === "undefined") return;
    const url = new URL(target, window.location.origin);
    const currentKey = `${clientPathname}${clientSearch}`;
    scrollPositionsRef.current[currentKey] = window.scrollY;
    const nextAddress = `${url.pathname}${url.search}${url.hash}`;
    const currentAddress = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextAddress !== currentAddress) {
      if (mode === "replace") window.history.replaceState({ grossPrintingView: true }, "", nextAddress);
      else window.history.pushState({ grossPrintingView: true }, "", nextAddress);
    }
    setClientPathname(url.pathname);
    setClientSearch(url.search);
    const nextKey = `${url.pathname}${url.search}`;
    window.requestAnimationFrame(() => {
      window.scrollTo({ left: 0, top: scrollPositionsRef.current[nextKey] ?? 0, behavior: "auto" });
    });
  }

  async function synchronizeShopData() {
    if (!authRequired || !authTokenRef.current || cloudReadInFlightRef.current) return;
    cloudReadInFlightRef.current = true;
    setDataSyncState("checking");
    try {
      const localState = readDemoState();
      const cloudState = await readCloudDemoState(authTokenRef.current);
      const selectedState = newestSavedState(localState, cloudState);
      if (!selectedState) {
        const initialState = applyPersistedStateSnapshot(defaultDemoState());
        queueCloudSave(initialState, 0);
      } else {
        const cloudIsSelected = Boolean(cloudState) && selectedState === cloudState;
        if (cloudIsSelected || !demoStateHydrated) {
          applyPersistedStateSnapshot(selectedState);
        }
        const localWasSelected = Boolean(localState) && selectedState === localState;
        const localWasNewer = localWasSelected && (
          !cloudState ||
          (!localState?.persistence && cloudState?.persistence?.clientId === "legacy-cloud") ||
          persistenceTime(localState) > persistenceTime(cloudState) ||
          (persistenceTime(localState) === persistenceTime(cloudState) &&
            (localState?.persistence?.revision ?? 0) > (cloudState?.persistence?.revision ?? 0))
        );
        if (localWasNewer) {
          queueCloudSave(normalizeDemoState(localState), 0);
        }
      }
      setDataSyncState("current");
    } catch {
      setDataSyncState(navigator.onLine ? "error" : "offline");
    } finally {
      cloudReadInFlightRef.current = false;
    }
  }

  async function flushCloudSaveQueue() {
    if (cloudSaveInFlight.current) return;
    const nextState = pendingCloudState.current;
    const token = authTokenRef.current;
    if (!nextState || !token) return;
    pendingCloudState.current = null;
    cloudSaveInFlight.current = true;
    setCloudSaveState("saving");
    try {
      const saved = await writeCloudDemoState(nextState, token, serverRevisionRef.current);
      serverRevisionRef.current = Math.max(serverRevisionRef.current, saved.serverRevision);
      persistenceRevision.current = Math.max(persistenceRevision.current, saved.serverRevision);
      cloudSaveInFlight.current = false;
      if (pendingCloudState.current) {
        void flushCloudSaveQueue();
      } else {
        setCloudSaveState("saved");
      }
    } catch (error) {
      cloudSaveInFlight.current = false;
      setCloudSaveState("error");
      const protectedError = error as Error & { code?: string; serverRevision?: number };
      if (protectedError.code === "REVISION_CONFLICT") {
        if (typeof protectedError.serverRevision === "number") serverRevisionRef.current = protectedError.serverRevision;
        setNotice("Another user saved newer information. Refreshing the protected server copy before saving again.");
        void synchronizeShopData();
      } else {
        setNotice(protectedError.message || "Protected server save failed. Your unsaved screen changes remain open.");
      }
    }
  }

  function queueCloudSave(state: DemoPersistedState, delay = 700) {
    if (!authRequired || !authTokenRef.current) return;
    pendingCloudState.current = state;
    if (cloudSaveTimer.current) window.clearTimeout(cloudSaveTimer.current);
    setCloudSaveState("saving");
    cloudSaveTimer.current = window.setTimeout(() => {
      cloudSaveTimer.current = null;
      void flushCloudSaveQueue();
    }, delay);
  }

  function persistStateNow(overrides: Partial<DemoPersistedState> = {}, cloudDelay = 700) {
    if (typeof window === "undefined" || !demoStateHydrated) return;
    const baseState = currentPersistedState(overrides);
    const fingerprint = stateFingerprint(baseState);
    if (fingerprint === lastStateFingerprint.current) return;
    lastStateFingerprint.current = fingerprint;
    persistenceRevision.current += 1;
    const snapshot: DemoPersistedState = {
      ...baseState,
      persistence: {
        schemaVersion: 1,
        revision: persistenceRevision.current,
        savedAt: nowIso(),
        clientId: persistenceClientId.current || getPersistenceClientId()
      }
    };
    persistenceClientId.current = snapshot.persistence!.clientId;
    if (DEMO_MODE) {
      try {
        window.localStorage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        setCloudSaveState("error");
        setNotice("Local demo save failed. Do not reload until browser storage is available.");
        return;
      }
    }
    setCloudSaveState(authRequired ? "saving" : "saved");
    queueCloudSave(snapshot, cloudDelay);
  }

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    setClientPathname(window.location.pathname || "/");
    setClientSearch(window.location.search || "");

    if (!DEMO_MODE) {
      // Remove v0.6.6 browser copies and tokens during the security migration.
      window.localStorage.removeItem(DEMO_STATE_STORAGE_KEY);
      window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
      window.localStorage.removeItem(QUANTITY_CURVE_STORAGE_KEY);
      window.localStorage.removeItem(ESTIMATE_DRAFT_STORAGE_KEY);
      window.localStorage.removeItem("gross-printing-estimate-draft-v2");
    }
    if (!authRequired) setAuthReady(true);

    const localState = readDemoState();
    if (localState) {
      applyPersistedStateSnapshot(localState, { writeBrowserBackup: false });
    } else if (DEMO_MODE) {
      applyPersistedStateSnapshot(defaultDemoState());
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setClientPathname(window.location.pathname || "/");
      setClientSearch(window.location.search || "");
      const key = `${window.location.pathname}${window.location.search}`;
      window.requestAnimationFrame(() => {
        window.scrollTo({ left: 0, top: scrollPositionsRef.current[key] ?? 0, behavior: "auto" });
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    displayViewRef.current = displayView;
  }, [displayView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(EMAIL_NOTIFICATION_READ_STORAGE_KEY) ?? "[]") as unknown;
      if (Array.isArray(saved)) {
        setReadEmailNotificationIds(saved.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      window.localStorage.removeItem(EMAIL_NOTIFICATION_READ_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      EMAIL_NOTIFICATION_READ_STORAGE_KEY,
      JSON.stringify(readEmailNotificationIds)
    );
  }, [readEmailNotificationIds]);

  useEffect(() => {
    if (!DEMO_MODE || typeof window === "undefined" || !portalRequests.length) return;
    window.localStorage.setItem(
      DEMO_PORTAL_REQUESTS_KEY,
      JSON.stringify(portalRequests.slice(0, 200))
    );
  }, [portalRequests]);

  useEffect(() => {
    if (!demoStateHydrated || !authReady) return;
    void loadPortalRequestQueue();
    const timer = window.setInterval(() => void loadPortalRequestQueue(), 60000);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DEMO_PORTAL_REQUESTS_KEY) void loadPortalRequestQueue();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, [demoStateHydrated, authReady, authToken, currentRole]);

  useEffect(() => {
    if (!DEMO_MODE || typeof window === "undefined" || !portalRequests.length) return;
    window.localStorage.setItem(DEMO_PORTAL_REQUESTS_KEY, JSON.stringify(portalRequests));
  }, [portalRequests]);

  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  useEffect(() => {
    return () => {
      if (cloudSaveTimer.current) window.clearTimeout(cloudSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initializeAuthentication() {
      if (!authRequired) {
        if (!cancelled) setAuthReady(true);
        return;
      }
      const linkResult = await readSupabaseEmailLinkFromBrowser();
      const authPath = window.location.pathname;
      if (authPath === "/forgot-password") setAuthMode("forgot");
      else if (authPath === "/login") setAuthMode("signin");
      if (linkResult.error) {
        setAuthMessage(linkResult.error);
        setAuthLinkProblem(linkResult.hadAuthLink);
      }

      let session: SupabaseAuthSession | null = null;
      try {
        if (linkResult.session) {
          const storedRememberDays = Number(window.localStorage.getItem("gross-printing-remember-days") ?? (window.localStorage.getItem("gross-printing-remember-computer") === "1" ? "30" : "0"));
          const rememberOauthDays = storedRememberDays === 30 ? 30 : storedRememberDays === 7 ? 7 : 0;
          try {
            session = await establishServerAuthSession({ ...linkResult.session }, rememberOauthDays);
            clearAuthLinkFromAddressBar(window.location.pathname);
          } catch (staffError) {
            // The same Google/Supabase identity may be a Customer Portal account
            // instead of staff. Preserve one shared login experience without
            // weakening either server-side role check.
            const portalResponse = await fetch("/api/customer-portal/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              cache: "no-store",
              body: JSON.stringify({
                accessToken: linkResult.session.accessToken,
                refreshToken: linkResult.session.refreshToken,
                expiresIn: Math.max(60, Math.round(((linkResult.session.expiresAt ?? Date.now() + 3600000) - Date.now()) / 1000)),
                rememberDays: rememberOauthDays
              })
            });
            const portalPayload = (await portalResponse.json().catch(() => ({}))) as { session?: { email?: string }; error?: string };
            if (portalResponse.ok && portalPayload.session) {
              clearAuthLinkFromAddressBar("/portal");
              window.location.assign("/portal");
              return;
            }
            throw staffError;
          }
        } else if (!linkResult.hadAuthLink) {
          session = await readServerAuthSession();
        }
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : "Secure sign-in could not be restored.");
        setAuthLinkProblem(linkResult.hadAuthLink);
      }

      if (!session && !linkResult.hadAuthLink && (authPath === "/reset-password" || authPath === "/set-password")) {
        setAuthLinkProblem(true);
        setAuthMessage("Open the newest invitation or password-reset email. This page needs a valid secure link.");
      }
      if (cancelled) return;
      authTokenRef.current = session?.accessToken;
      setAuthSession(session);
      setAuthReady(true);
    }
    void initializeAuthentication();
    return () => {
      cancelled = true;
    };
  }, [authRequired]);

  useEffect(() => {
    if (!authRequired || !authSession) return;
    let refreshing = false;
    const refreshFromServer = () => {
      if (refreshing) return;
      refreshing = true;
      void readServerAuthSession()
        .then((updated) => {
          if (!updated) {
            setAuthSession(null);
            setAuthMessage("Your secure session expired. Please sign in again.");
            setDemoStateHydrated(false);
            return;
          }
          authTokenRef.current = updated.accessToken;
          setAuthSession(updated);
        })
        .finally(() => {
          refreshing = false;
        });
    };
    const intervalId = window.setInterval(refreshFromServer, 5 * 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isAuthExpired(authSession)) refreshFromServer();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authRequired, authSession?.userId, authSession?.expiresAt]);



  useEffect(() => {
    if (!authRequired || !authToken || authSession?.isActive === false) return;
    const sessionId = getAppSessionId();
    const sessionAccessToken = authToken;
    appSessionIdRef.current = sessionId;
    let stopped = false;

    async function heartbeat() {
      try {
        const { response, payload } = await updateAppSession(sessionAccessToken, sessionId, viewLabel(displayViewRef.current));
        if (stopped) return;
        if (response.status === 401 || response.status === 403) {
          // The short-lived Supabase access token can expire while a 7/30-day
          // refresh cookie is still valid. Refresh the secure server session first;
          // only sign out when that refresh also fails.
          const refreshed = await readServerAuthSession().catch(() => null);
          if (refreshed?.accessToken) {
            authTokenRef.current = refreshed.accessToken;
            setAuthSession((current) => current ? { ...current, ...refreshed } : refreshed);
            return;
          }
          storeAuthSession(null);
          window.localStorage.removeItem(APP_SESSION_STORAGE_KEY);
          appSessionIdRef.current = "";
          setAuthSession(null);
          authTokenRef.current = undefined;
          pendingCloudState.current = null;
          setCustomers([]);
          setOrders([]);
          setJobs([]);
          setQuotes([]);
          setInvoices([]);
          setUploadedFiles([]);
          setEmailLogs([]);
          setEmailTemplates([]);
          setEmailThreads([]);
          setEmailIntakeTickets([]);
          setAiLearningExamples([]);
          setStatusEvents([]);
          setOperationalActivities([]);
          setPaperStocks([]);
          setProductCategories([]);
          setProductPresets([]);
          setCatalogPrices([]);
          setMachines([]);
          setQuantityRateCurve([]);
          setDemoStateHydrated(false);
          setCloudSaveState("idle");
          setAuthMessage(payload.error ?? "This login session was ended. Sign in again.");
          setNotice("Sign in to load Gross Printing MIS.");
          return;
        }
        if (response.ok && (payload.role || payload.displayName || payload.isOwner !== undefined)) {
          setAuthSession((current) => {
            if (!current) return current;
            const updated: SupabaseAuthSession = {
              ...current,
              role: payload.role ?? current.role,
              displayName: payload.displayName ?? current.displayName,
              isOwner: payload.isOwner ?? current.isOwner,
              isActive: true
            };
            storeAuthSession(updated);
            return updated;
          });
        }
      } catch {
        // Keep the current in-memory screen open during a temporary network interruption.
      }
    }

    void heartbeat();
    const intervalId = window.setInterval(() => void heartbeat(), 45_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authRequired, authToken, authSession?.isActive]);

  useEffect(() => {
    if (!authReady) return;
    if (authRequired && (!authToken || authSession?.isActive === false)) {
      if (!demoStateHydrated) setQuantityCurveHydrated(true);
      return;
    }

    authTokenRef.current = authToken;
    if (!demoStateHydrated && DEMO_MODE) {
      const localState = readDemoState();
      if (localState) applyPersistedStateSnapshot(localState, { writeBrowserBackup: false });
      else applyPersistedStateSnapshot(defaultDemoState());
    }

    if (!authRequired) {
      setDataSyncState("current");
      return;
    }

    void synchronizeShopData();
    const intervalId = window.setInterval(() => void synchronizeShopData(), 5 * 60_000);
    const handleOnline = () => void synchronizeShopData();
    const handleVisible = () => {
      if (document.visibilityState === "visible") void synchronizeShopData();
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [authReady, authRequired, authToken, authSession?.isActive, demoStateHydrated]);

  useEffect(() => {
    if (DEMO_MODE || !demoStateHydrated || !authToken || authSession?.isActive === false) return;
    if (currentRole !== "admin" && currentRole !== "front_desk") return;
    let stopped = false;
    const refreshMailbox = () => {
      if (!stopped && document.visibilityState === "visible") void syncEmailInbox({ silent: true });
    };
    const firstRefresh = window.setTimeout(refreshMailbox, 100);
    const intervalId = window.setInterval(refreshMailbox, 60_000);
    const handleVisible = () => {
      if (document.visibilityState === "visible") refreshMailbox();
    };
    window.addEventListener("focus", refreshMailbox);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      stopped = true;
      window.clearTimeout(firstRefresh);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshMailbox);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [demoStateHydrated, authToken, authSession?.isActive, currentRole, customers.length, emailThreads.length, emailIntakeTickets.length, emailBusinessRules.length]);

  useEffect(() => {
    if (!DEMO_MODE || !quantityCurveHydrated || typeof window === "undefined") return;
    window.localStorage.setItem(QUANTITY_CURVE_STORAGE_KEY, JSON.stringify(quantityRateCurve));
  }, [quantityCurveHydrated, quantityRateCurve]);

  useEffect(() => {
    if (!demoStateHydrated) return;
    if (authRequired && (!authToken || authSession?.isActive === false)) return;
    persistStateNow();
  }, [
    demoStateHydrated,
    authRequired,
    authToken,
    authSession?.isActive,
    customers,
    orders,
    jobs,
    quotes,
    invoices,
    uploadedFiles,
    emailLogs,
    emailTemplates,
    emailThreads,
    emailIntakeTickets,
    emailBusinessRules,
    emailSafetySettings,
    aiLearningExamples,
    statusEvents,
    operationalActivities,
    paperStocks,
    productCategories,
    productPresets,
    catalogPrices,
    machines,
    quantityRateCurve,
    numberingSettings
  ]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const matches = (...parts: Array<string | number | undefined>) =>
      parts
        .filter((part) => part !== undefined)
        .join(" ")
        .toLowerCase()
        .includes(query);
    const results: Array<{
      id: string;
      label: string;
      meta: string;
      view: AppView;
      kind: string;
      jobId?: string;
      customerId?: string;
      ticketId?: string;
      portalRequestId?: string;
    }> = [];

    customers
      .filter((customer) => !customer.archived && !customer.deletedAt && matches(customer.name, customer.contact, customer.email, customer.phone, customer.companyType))
      .forEach((customer) =>
        results.push({
          id: `customer-${customer.id}`,
          label: customer.name,
          meta: `${customer.contact} / ${customer.email}`,
          view: "Customer Portal",
          kind: "Customer",
          customerId: customer.id
        })
      );
    orders
      .filter((order) => !order.archived && !order.deletedAt && matches(order.orderNumber, order.title, order.customerName, order.status))
      .forEach((order) =>
        results.push({
          id: `order-${order.id}`,
          label: `${order.orderNumber} / ${order.title}`,
          meta: `${order.customerName} / ${order.status} / ${order.jobIds.length} jobs`,
          view: "Orders",
          kind: "Order"
        })
      );
    jobs
      .filter((job) => !job.archived && !job.deletedAt && matches(job.jobNumber, job.title, job.customerName, job.status, job.stockName))
      .forEach((job) =>
        results.push({
          id: `job-${job.id}`,
          label: `${job.jobNumber} / ${job.title}`,
          meta: `${job.customerName} / ${job.status}`,
          view: "Workflow",
          kind: "Job",
          jobId: job.id
        })
      );
    quotes
      .filter((quote) => !quote.archived && !quote.deletedAt && matches(quote.quoteNumber, quote.title, quote.customerName, quote.status))
      .forEach((quote) =>
        results.push({
          id: `quote-${quote.id}`,
          label: `${quote.quoteNumber} / ${quote.title}`,
          meta: `${quote.customerName} / ${quote.status}`,
          view: "Quotes",
          kind: "Quote"
        })
      );
    invoices
      .filter((invoice) => !invoice.archived && !invoice.deletedAt && matches(invoice.invoiceNumber, invoice.title, invoice.customerName, invoice.status))
      .forEach((invoice) =>
        results.push({
          id: `invoice-${invoice.id}`,
          label: `${invoice.invoiceNumber} / ${invoice.title}`,
          meta: `${invoice.customerName} / ${invoice.status}`,
          view: "Invoices",
          kind: "Invoice"
        })
      );
    emailIntakeTickets
      .filter((ticket) =>
        matches(
          ticket.ticketNumber,
          ticket.subject,
          ticket.customerName,
          ticket.productName,
          ticket.productHint,
          ticket.status,
          ticket.convertedRecordNumber
        )
      )
      .forEach((ticket) =>
        results.push({
          id: `ticket-${ticket.id}`,
          label: `${ticket.ticketNumber ?? "Email ticket"} / ${ticket.subject}`,
          meta: `${ticket.customerName ?? "Customer not matched"} / ${ticket.status}${
            ticket.convertedRecordNumber ? ` / ${ticket.convertedRecordNumber}` : ""
          }`,
          view: "Email Center",
          kind: "Email ticket",
          ticketId: ticket.id
        })
      );
    portalRequests
      .filter((request) => {
        const customer = customers.find((item) => item.id === request.customerId);
        const metadata = request.metadata ?? {};
        return matches(
          request.requestNumber,
          request.title,
          request.note,
          request.status,
          request.convertedRecordNumber,
          customer?.name,
          typeof metadata.productType === "string" ? metadata.productType : undefined
        );
      })
      .forEach((request) => {
        const customer = customers.find((item) => item.id === request.customerId);
        results.push({
          id: `portal-request-${request.id}`,
          label: `${request.requestNumber ?? "Portal request"} / ${request.title}`,
          meta: `${customer?.name ?? "Customer"} / ${request.status}${
            request.convertedRecordNumber ? ` / ${request.convertedRecordNumber}` : ""
          }`,
          view: "Portal Requests",
          kind: "Portal request",
          portalRequestId: request.id
        });
      });
    uploadedFiles
      .filter((file) => matches(file.name, file.folder, file.customerName, file.jobNumber, file.status))
      .forEach((file) =>
        results.push({
          id: `file-${file.id}`,
          label: file.name,
          meta: `${file.folder} / ${file.status}`,
          view: "Files",
          kind: "File"
        })
      );
    paperStocks
      .filter((paper) => matches(paper.name, paper.kind, paper.sheetWidth, paper.sheetHeight))
      .forEach((paper) =>
        results.push({
          id: `paper-${paper.id}`,
          label: paper.name,
          meta: `${paper.sheetWidth} x ${paper.sheetHeight} / ${paper.kind}`,
          view: "Catalog",
          kind: "Paper"
        })
      );
    catalogPrices
      .filter((price) => matches(price.name, price.category, price.unit, price.notes))
      .forEach((price) =>
        results.push({
          id: `catalog-${price.id}`,
          label: price.name,
          meta: `${price.category} / ${price.unit}`,
          view: "Catalog",
          kind: "Pricing"
        })
      );

    return results.filter((result) => roleCanAccessView(currentRole, result.view)).slice(0, 12);
  }, [
    searchQuery,
    customers,
    jobs,
    quotes,
    invoices,
    portalRequests,
    uploadedFiles,
    paperStocks,
    catalogPrices,
    currentRole
  ]);

  useEffect(() => {
    if (window.innerWidth <= 760) setSidebarOpen(false);
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (!authReady || !authRequired || !authSession?.isActive) return;
    if (!roleCanAccessView(currentRole, activeView)) {
      updateClientLocation(pathForView(defaultView), "replace");
      setNotice(`Your ${roleLabel(currentRole)} account does not have access to that section.`);
    }
  }, [activeView, authReady, authRequired, authSession?.isActive, currentRole, defaultView]);

  useEffect(() => {
    if (clientPathname === "/") {
      updateClientLocation(pathForView(defaultView), "replace");
    }
  }, [clientPathname, defaultView]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!estimateDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [estimateDirty]);

  useEffect(() => {
    if (window.innerWidth <= 760) setSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (!notice || notice === "Local demo data is active." || notice === "Workspace ready.") return;
    setToast(notice);
    const timeoutId = window.setTimeout(() => setToast(undefined), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  function runWithLeaveGuard(action: () => void) {
    if (estimateDirty) {
      setLeavePrompt({ action });
      return;
    }
    action();
  }

  function activateView(view: AppView) {
    const nextPath = pathForView(view);
    if (clientPathname !== nextPath || clientSearch) {
      updateClientLocation(nextPath);
    }
  }

  function navigateTo(view: AppView) {
    if (!roleCanAccessView(currentRole, view)) {
      setNotice(`Your ${roleLabel(currentRole)} account does not have access to that section.`);
      return;
    }
    if (view === activeView && clientPathname === pathForView(view) && !clientSearch) {
      if (window.innerWidth <= 760) setSidebarOpen(false);
      return;
    }
    runWithLeaveGuard(() => {
      if (view === "Files") setFocusedCustomerId(undefined);
      if (view === "New Estimate / Job") setEstimateCustomerId(undefined);
      activateView(view);
      if (window.innerWidth <= 760) setSidebarOpen(false);
    });
  }

  function stayOnEstimate() {
    setLeavePrompt(undefined);
  }

  function saveDraftAndLeave() {
    const action = leavePrompt?.action;
    setEstimateDirty(false);
    setLeavePrompt(undefined);
    setNotice("Estimate draft saved. You can come back to New Estimate / Job.");
    action?.();
  }

  function leaveWithoutSaving() {
    const action = leavePrompt?.action;
    window.localStorage.removeItem(ESTIMATE_DRAFT_STORAGE_KEY);
    setEstimateDirty(false);
    setLeavePrompt(undefined);
    setNotice("Estimate draft discarded.");
    action?.();
  }

  function openSearchResult(result: (typeof searchResults)[number]) {
    runWithLeaveGuard(() => {
      if (result.ticketId) {
        updateClientLocation(`/email-center?ticket=${encodeURIComponent(result.ticketId)}`);
      } else if (result.portalRequestId) {
        updateClientLocation(`/portal-requests?request=${encodeURIComponent(result.portalRequestId)}`);
      } else {
        activateView(result.view);
      }
      if (result.jobId) {
        setSelectedJobId(result.jobId);
      }
      if (result.customerId) {
        setFocusedCustomerId(result.customerId);
      }
      setSearchQuery("");
      setSearchFocused(false);
    });
  }

  function logEmail(entry: Omit<EmailLog, "id" | "createdAt">, createdAt = nowIso()) {
    const id = makeId("email");
    setEmailLogs((current) => [{ ...entry, id, createdAt }, ...current]);
    return id;
  }

  function emailTemplateVariables(input: { customer?: Customer; job?: Job; quote?: Quote; invoice?: Invoice }) {
    const portalBase = typeof window !== "undefined" ? `${window.location.origin}/portal` : "/portal";
    const portalJobLink = input.job ? `${portalBase}?job=${encodeURIComponent(input.job.id)}` : portalBase;
    const portalQuoteLink = input.quote ? `${portalBase}?quote=${encodeURIComponent(input.quote.id)}` : portalJobLink;
    const portalInvoiceLink = input.invoice ? `${portalBase}?invoice=${encodeURIComponent(input.invoice.id)}` : portalJobLink;
    const portalLink = input.quote ? portalQuoteLink : input.invoice ? portalInvoiceLink : portalJobLink;
    return {
      customer_name: input.customer?.contact || input.customer?.name || input.job?.customerName || "Customer",
      job_number: input.job?.jobNumber ?? "",
      job_name: input.job?.title ?? input.quote?.title ?? input.invoice?.title ?? "",
      quote_number: input.quote?.quoteNumber ?? "",
      invoice_number: input.invoice?.invoiceNumber ?? "",
      amount: input.invoice
        ? formatMoney(input.invoice.amount)
        : input.quote
          ? formatMoney(input.quote.amount)
          : input.job
            ? formatMoney(input.job.pricing.total)
            : "",
      due_date: input.job ? `${input.job.dueDate} ${input.job.dueTime}` : "",
      pickup_address: "Gross Printing, 6 Jackson Ave, Spring Valley, NY 10977",
      company_contact: "Shulem Gross",
      company_name: "Gross Printing",
      company_phone: "845-362-0664",
      company_email: "jobs@grossprinting.com",
      portal_link: portalLink,
      portal_job_link: portalJobLink,
      portal_quote_link: portalQuoteLink,
      portal_invoice_link: portalInvoiceLink
    };
  }

  function messageIdForLocalAttachment(rfcMessageId: string | undefined, threadId: string, index: number) {
    return rfcMessageId ? `${rfcMessageId}-${index}` : `${threadId}-${index}`;
  }

  function appendOutgoingEmailMessage(input: {
    to: string;
    cc?: string[];
    subject: string;
    body: string;
    threadId?: string;
    providerThreadId?: string;
    providerMessageId?: string;
    rfcMessageId?: string;
    attachments?: Array<{ filename: string; mimeType: string; size: number }>;
    customerId?: string;
    jobId?: string;
    quoteId?: string;
    invoiceId?: string;
    sentAt: string;
  }) {
    const internalThreadId = input.threadId ?? (input.providerThreadId ? `gmail-thread-${input.providerThreadId}` : makeId("thread"));
    const message: EmailMessage = {
      id: input.providerMessageId ? `gmail-message-${input.providerMessageId}` : makeId("message"),
      providerMessageId: input.providerMessageId,
      rfcMessageId: input.rfcMessageId,
      mailboxFolder: "sent",
      threadId: internalThreadId,
      direction: "outbound",
      from: "Gross Printing <jobs@grossprinting.com>",
      to: [input.to],
      cc: input.cc,
      subject: input.subject,
      bodyText: input.body,
      sentAt: input.sentAt,
      unread: false,
      attachments: (input.attachments ?? []).map((attachment, index) => ({
        id: `local-sent-${internalThreadId}-${index}`,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        messageId: messageIdForLocalAttachment(input.rfcMessageId, internalThreadId, index)
      })),
      customerId: input.customerId,
      jobId: input.jobId,
      quoteId: input.quoteId,
      invoiceId: input.invoiceId
    };
    setEmailThreads((current) => {
      const existing = current.find((thread) => thread.id === internalThreadId);
      if (existing) {
        const duplicate = existing.messages.some((item) => item.id === message.id || (message.providerMessageId && item.providerMessageId === message.providerMessageId));
        return current.map((thread) =>
          thread.id === existing.id
            ? {
                ...thread,
                providerThreadId: input.providerThreadId ?? thread.providerThreadId,
                subject: input.subject || thread.subject,
                participantEmails: Array.from(new Set([...thread.participantEmails, input.to, ...(input.cc ?? []), "jobs@grossprinting.com"])),
                snippet: input.body.slice(0, 240),
                lastMessageAt: input.sentAt,
                unread: false,
                customerId: input.customerId ?? thread.customerId,
                jobId: input.jobId ?? thread.jobId,
                quoteId: input.quoteId ?? thread.quoteId,
                invoiceId: input.invoiceId ?? thread.invoiceId,
                messages: duplicate ? thread.messages : [...thread.messages, message]
              }
            : thread
        );
      }
      return [
        {
          id: internalThreadId,
          providerThreadId: input.providerThreadId,
          subject: input.subject,
          participantEmails: [input.to, ...(input.cc ?? []), "jobs@grossprinting.com"],
          snippet: input.body.slice(0, 240),
          lastMessageAt: input.sentAt,
          unread: false,
          customerId: input.customerId,
          jobId: input.jobId,
          quoteId: input.quoteId,
          invoiceId: input.invoiceId,
          messages: [message]
        },
        ...current
      ];
    });
    return internalThreadId;
  }

  async function sendConfiguredEmail(input: {
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    attachments?: Array<{ filename: string; mimeType: string; base64: string; size: number }>;
    sourceAttachments?: Array<{ messageId: string; attachmentId: string; folder?: "inbox" | "sent"; uidValidity?: string; filename: string; mimeType: string; size: number }>;
    templateId?: EmailTemplateKey;
    entityId: string;
    entityType: EmailLog["entityType"];
    customerId?: string;
    jobId?: string;
    quoteId?: string;
    invoiceId?: string;
    threadId?: string;
  }) {
    const createdAt = nowIso();
    const existingThread = input.threadId ? emailThreads.find((thread) => thread.id === input.threadId) : undefined;
    const latestThreadMessage = existingThread?.messages.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()).at(-1);
    const demoSend = DEMO_MODE || !authToken;
    const logId = logEmail(
      {
        entityId: input.entityId,
        entityType: input.entityType,
        to: input.to,
        from: "jobs@grossprinting.com",
        subject: input.subject,
        body: input.body,
        status: demoSend ? "Demo" : "Pending",
        templateId: input.templateId,
        customerId: input.customerId,
        jobId: input.jobId,
        quoteId: input.quoteId,
        invoiceId: input.invoiceId,
        threadId: input.threadId,
        sentBy: currentEmployee.name
      },
      createdAt
    );

    const outgoingAttachmentMetadata = [
      ...(input.attachments ?? []).map(({ filename, mimeType, size }) => ({ filename, mimeType, size })),
      ...(input.sourceAttachments ?? []).map(({ filename, mimeType, size }) => ({ filename, mimeType, size }))
    ];

    if (demoSend) {
      const internalThreadId = appendOutgoingEmailMessage({
        ...input,
        attachments: outgoingAttachmentMetadata,
        sentAt: createdAt,
        providerThreadId: existingThread?.providerThreadId
      });
      setEmailLogs((current) => current.map((log) => (log.id === logId ? { ...log, threadId: internalThreadId } : log)));
      return true;
    }

    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          body: input.body,
          attachments: input.attachments?.map(({ size: _size, ...attachment }) => attachment),
          sourceAttachments: input.sourceAttachments?.map(({ size: _size, ...attachment }) => attachment),
          threadId: existingThread?.providerThreadId,
          inReplyTo: latestThreadMessage?.rfcMessageId,
          references: latestThreadMessage?.references
        })
      });
      const responseText = await response.text();
      let payload: {
        error?: string;
        messageId?: string;
        threadId?: string;
        delivery?: "sent" | "blocked" | "redirected" | "test_sent";
        safetyMode?: EmailSafetyMode;
        safetyReason?: string;
        originalTo?: string;
      } = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText) as typeof payload;
        } catch {
          if (!response.ok) throw new Error(`Unable to send email (${response.status}).`);
          throw new Error("The mail server returned an unreadable send response.");
        }
      }
      if (!response.ok) throw new Error(payload.error ?? `Unable to send email (${response.status}).`);
      if (payload.delivery === "blocked" || payload.delivery === "redirected") {
        const status = payload.delivery === "redirected" ? "Redirected" : "Blocked";
        setEmailLogs((current) =>
          current.map((log) =>
            log.id === logId
              ? {
                  ...log,
                  status,
                  providerMessageId: payload.delivery === "redirected" ? payload.messageId : undefined,
                  safetyMode: payload.safetyMode,
                  safetyReason: payload.safetyReason,
                  originalTo: payload.originalTo || input.to
                }
              : log
          )
        );
        setNotice(
          payload.delivery === "redirected"
            ? `TEST MODE: customer email was redirected to the configured test inbox. Original recipient: ${payload.originalTo || input.to}`
            : `${payload.safetyMode === "test" ? "TEST MODE" : "SHADOW MODE"}: customer email was blocked. Nothing was sent to ${payload.originalTo || input.to}.`
        );
        return false;
      }
      const internalThreadId = appendOutgoingEmailMessage({
        ...input,
        attachments: outgoingAttachmentMetadata,
        sentAt: createdAt,
        rfcMessageId: payload.messageId,
        providerThreadId: payload.threadId ?? existingThread?.providerThreadId
      });
      setEmailLogs((current) =>
        current.map((log) =>
          log.id === logId
            ? {
                ...log,
                status: payload.delivery === "test_sent" ? "Test Sent" : "Sent",
                providerMessageId: payload.messageId,
                threadId: internalThreadId,
                safetyMode: payload.safetyMode,
                safetyReason: payload.safetyReason,
                originalTo: payload.originalTo
              }
            : log
        )
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send email.";
      setEmailLogs((current) => current.map((log) => (log.id === logId ? { ...log, status: "Failed", error: message } : log)));
      setNotice(message);
      return false;
    }
  }

  async function sendNewEmailMessage(input: {
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    threadId?: string;
    attachments?: Array<{ filename: string; mimeType: string; base64: string; size: number }>;
    sourceAttachments?: Array<{ messageId: string; attachmentId: string; folder?: "inbox" | "sent"; uidValidity?: string; filename: string; mimeType: string; size: number }>;
  }) {
    const entityId = input.threadId ?? makeId("thread");
    return sendConfiguredEmail({
      ...input,
      entityId,
      entityType: "thread"
    });
  }

  async function sendTemplateEmail(
    templateId: EmailTemplateKey,
    input: {
      to: string;
      entityId: string;
      entityType: EmailLog["entityType"];
      customer?: Customer;
      job?: Job;
      quote?: Quote;
      invoice?: Invoice;
      threadId?: string;
    }
  ) {
    const template = emailTemplates.find((item) => item.id === templateId);
    if (!template?.isActive) {
      setNotice(`${template?.name ?? templateId} email is disabled in Settings.`);
      return false;
    }
    const variables = emailTemplateVariables(input);
    return sendConfiguredEmail({
      to: input.to,
      subject: renderTemplateText(template.subject, variables),
      body: renderTemplateText(template.body, variables),
      templateId,
      entityId: input.entityId,
      entityType: input.entityType,
      customerId: input.customer?.id,
      jobId: input.job?.id,
      quoteId: input.quote?.id,
      invoiceId: input.invoice?.id,
      threadId: input.threadId
    });
  }

  function mailboxMessageKey(message: EmailMessage) {
    // RFC Message-ID lets existing v0.7.0.6 browser records reconcile once with
    // the new UIDVALIDITY-aware locator. New attachment operations still use
    // canonicalId + uidValidity, never a bare UID.
    return message.rfcMessageId?.trim().toLowerCase() ||
      message.canonicalId ||
      (message.providerMessageId
        ? `${message.mailboxFolder ?? "inbox"}:${message.uidValidity ?? "unknown"}:${message.providerMessageId}`
        : message.id);
  }

  function sourceAttachmentRefs(message: EmailMessage): EmailSourceAttachmentRef[] {
    return userVisibleEmailAttachments(message)
      .map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        messageId: message.id,
        providerMessageId: message.providerMessageId,
        providerAttachmentId: attachment.providerAttachmentId,
        mailboxFolder: message.mailboxFolder === "sent" ? "sent" : "inbox",
        mailboxName: message.mailboxName ?? attachment.mailboxName,
        uidValidity: message.uidValidity ?? attachment.uidValidity
      }));
  }

  function threadSourceAttachmentRefs(thread: EmailThread): EmailSourceAttachmentRef[] {
    return userVisibleThreadAttachments(thread).flatMap(({ message, attachment }) => {
      if (!attachment.providerAttachmentId && !message.providerMessageId) return [];
      return [{
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        messageId: message.id,
        providerMessageId: message.providerMessageId,
        providerAttachmentId: attachment.providerAttachmentId,
        mailboxFolder: message.mailboxFolder === "sent" ? "sent" as const : "inbox" as const,
        mailboxName: message.mailboxName ?? attachment.mailboxName,
        uidValidity: message.uidValidity ?? attachment.uidValidity
      }];
    });
  }

  function emailSourceAttachmentsForTicket(ticket: EmailIntakeTicket): EmailSourceAttachmentRef[] {
    const thread = emailThreads.find((item) => item.id === ticket.threadId);
    const wanted = new Set([...(ticket.attachmentIds ?? []), ...(ticket.sourceAttachments ?? []).map((item) => item.id)]);
    const fresh: EmailSourceAttachmentRef[] = thread
      ? thread.messages.flatMap((message) => sourceAttachmentRefs(message).filter((item) => wanted.has(item.id)))
      : [];
    if (!ticket.sourceAttachments?.length) return fresh;

    // Stored Job Tickets can outlive the mailbox refresh that added UIDVALIDITY/provider locators.
    // Merge the current mailbox identity back into the saved refs so Job Setup can securely reopen the real file.
    const freshById = new Map<string, EmailSourceAttachmentRef>(fresh.map((item) => [item.id, item]));
    const merged = ticket.sourceAttachments.map((stored) => {
      const current = freshById.get(stored.id) ?? fresh.find((item) =>
        item.messageId === stored.messageId && item.filename.trim().toLowerCase() === stored.filename.trim().toLowerCase()
      );
      return current ? { ...stored, ...current, filename: stored.filename || current.filename, mimeType: stored.mimeType || current.mimeType } : stored;
    });
    fresh.forEach((item) => {
      if (!merged.some((stored) => stored.id === item.id)) merged.push(item);
    });
    return merged;
  }

  function mailboxMessageThreadKey(message: EmailMessage) {
    if (message.providerThreadKey) return message.providerThreadKey;
    const reference = message.references?.match(/<[^<>]+>/g)?.[0]
      ?? message.inReplyTo?.match(/<[^<>]+>/g)?.[0]
      ?? message.rfcMessageId?.match(/<[^<>]+>/g)?.[0]
      ?? message.inReplyTo
      ?? message.rfcMessageId;
    return reference ? `ref:${reference.trim().toLowerCase()}` : message.threadId;
  }

  function combineMailboxThreads(threads: EmailThread[]) {
    const combined = new Map<string, EmailThread>();
    threads.forEach((thread) => {
      const key = thread.providerThreadKey ?? thread.providerThreadId ?? thread.id;
      const existing = combined.get(key);
      if (!existing) {
        combined.set(key, { ...thread, messages: [...thread.messages] });
        return;
      }
      const messages = [...existing.messages];
      thread.messages.forEach((message) => {
        const messageKey = mailboxMessageKey(message);
        if (!messages.some((item) => mailboxMessageKey(item) === messageKey)) messages.push(message);
      });
      messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
      const latest = messages[messages.length - 1];
      combined.set(key, {
        ...existing,
        ...thread,
        id: existing.id,
        participantEmails: Array.from(new Set([...existing.participantEmails, ...thread.participantEmails])),
        subject: latest?.subject || thread.subject || existing.subject,
        snippet: latest?.bodyText.slice(0, 240) || thread.snippet || existing.snippet,
        lastMessageAt: latest?.sentAt || thread.lastMessageAt || existing.lastMessageAt,
        unread: messages.some((message) => message.direction === "inbound" && message.unread),
        messages
      });
    });
    return Array.from(combined.values());
  }

  function applyManualConversationOverrides(threads: EmailThread[]) {
    const manualMessages = new Map<string, Array<{ thread: EmailThread; message: EmailMessage }>>();
    const normalThreads: EmailThread[] = [];

    threads.forEach((thread) => {
      const remaining: EmailMessage[] = [];
      thread.messages.forEach((message) => {
        if (!message.manualConversationId) {
          remaining.push(message);
          return;
        }
        const current = manualMessages.get(message.manualConversationId) ?? [];
        current.push({ thread, message });
        manualMessages.set(message.manualConversationId, current);
      });
      if (remaining.length) {
        const sorted = remaining.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
        const latest = sorted[sorted.length - 1];
        normalThreads.push({
          ...thread,
          subject: latest?.subject ?? thread.subject,
          snippet: latest?.bodyText.slice(0, 240) ?? thread.snippet,
          lastMessageAt: latest?.sentAt ?? thread.lastMessageAt,
          unread: sorted.some((message) => message.direction === "inbound" && message.unread),
          messages: sorted
        });
      }
    });

    manualMessages.forEach((entries, manualId) => {
      const uniqueEntries = Array.from(new Map(entries.map((entry) => [mailboxMessageKey(entry.message), entry])).values());
      const sorted = uniqueEntries.map((entry) => entry.message).sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
      const latest = sorted[sorted.length - 1];
      const preferredBase = uniqueEntries.find((entry) => entry.thread.id === manualId)?.thread ?? uniqueEntries[0]?.thread;
      if (!preferredBase || !latest) return;
      const participantEmails = Array.from(new Set(uniqueEntries.flatMap(({ thread, message }) => [
        ...thread.participantEmails,
        message.from,
        ...message.to,
        ...(message.cc ?? [])
      ]).filter(Boolean)));
      normalThreads.push({
        ...preferredBase,
        id: manualId,
        providerThreadId: undefined,
        providerThreadKey: undefined,
        subject: latest.subject,
        participantEmails,
        snippet: latest.bodyText.slice(0, 240),
        lastMessageAt: latest.sentAt,
        unread: sorted.some((message) => message.direction === "inbound" && message.unread),
        messages: sorted
      });
    });

    return normalThreads;
  }

  function combineEmailConversations(sourceThreadId: string, targetThreadId: string) {
    if (sourceThreadId === targetThreadId) return;
    const source = emailThreads.find((thread) => thread.id === sourceThreadId);
    const target = emailThreads.find((thread) => thread.id === targetThreadId);
    if (!source || !target) return;
    if (source.customerId && target.customerId && source.customerId !== target.customerId) {
      const sourceCustomer = customers.find((customer) => customer.id === source.customerId)?.name ?? "the first customer";
      const targetCustomer = customers.find((customer) => customer.id === target.customerId)?.name ?? "the second customer";
      if (!window.confirm(`These emails are matched to different customers (${sourceCustomer} and ${targetCustomer}). Combine them anyway?`)) return;
    }
    const manualId = targetThreadId;
    const sourceMessageIds = new Set(source.messages.map((message) => message.id));
    const targetMessageIds = new Set(target.messages.map((message) => message.id));
    setEmailThreads((current) => applyManualConversationOverrides(current.map((thread) => ({
      ...thread,
      messages: thread.messages.map((message) =>
        sourceMessageIds.has(message.id) || targetMessageIds.has(message.id)
          ? { ...message, manualConversationId: manualId, manualConversationMode: "combined" as const }
          : message
      )
    }))));
    setEmailIntakeTickets((current) => current.map((ticket) => ticket.threadId === sourceThreadId ? { ...ticket, threadId: targetThreadId } : ticket));
    setJobs((current) => current.map((job) => ({
      ...job,
      sourceEmailThreadId: job.sourceEmailThreadId === sourceThreadId ? targetThreadId : job.sourceEmailThreadId,
      emailThreadIds: job.emailThreadIds?.map((threadId) => threadId === sourceThreadId ? targetThreadId : threadId).filter((threadId, index, values) => values.indexOf(threadId) === index)
    })));
    setNotice("Email conversations combined. This manual choice will survive mailbox refreshes.");
  }

  function separateEmailMessage(threadId: string, messageId: string) {
    const thread = emailThreads.find((item) => item.id === threadId);
    const message = thread?.messages.find((item) => item.id === messageId);
    if (!thread || !message || thread.messages.length <= 1) return;
    const manualId = makeId("mail-thread-separated");
    setEmailThreads((current) => applyManualConversationOverrides(current.map((item) => ({
      ...item,
      messages: item.messages.map((entry) => entry.id === messageId
        ? { ...entry, manualConversationId: manualId, manualConversationMode: "separate" as const }
        : entry)
    }))));
    setEmailIntakeTickets((current) => current.map((ticket) => ticket.messageId === messageId ? { ...ticket, threadId: manualId } : ticket));
    setNotice("Selected email separated into its own conversation. This manual choice will survive mailbox refreshes.");
  }

  function setEmailBusinessCategory(threadId: string, messageId: string, category: EmailBusinessCategory) {
    const thread = emailThreads.find((item) => item.id === threadId);
    const message = thread?.messages.find((item) => item.id === messageId);
    if (!thread || !message) return;
    const vendorCategory = ["vendor_quote", "vendor_bill", "vendor_order", "proof", "shipping"].includes(category);
    const customerCategory = category === "customer_job" || category === "customer_existing_job";
    const partyType = vendorCategory ? "vendor" as const : customerCategory ? "customer" as const : "other" as const;
    const partyName = emailHeaderName(message.from);
    const reason = "Staff chose this business routing category.";
    setEmailThreads((current) => current.map((item) => item.id !== threadId ? item : {
      ...item,
      messages: item.messages.map((entry) => entry.id !== messageId ? entry : {
        ...entry,
        businessCategory: category,
        businessCategoryConfidence: 1,
        businessCategoryReason: reason,
        businessCategorySource: "staff" as const,
        businessPartyName: partyName
      })
    }));

    const associatedTicket = emailIntakeTickets.find((ticket) => ticket.messageId === messageId);
    const nonCustomerCategory = ["customer_existing_job", "vendor_quote", "vendor_bill", "vendor_order", "proof", "shipping", "delivery_failure", "newsletter", "junk", "general"].includes(category);
    if (associatedTicket && nonCustomerCategory && !["Converted", "Archived", "Ignored"].includes(associatedTicket.status)) {
      updateEmailIntakeTicket(associatedTicket.id, {
        status: "Ignored",
        businessCategory: category,
        businessCategoryReason: reason,
        updatedAt: nowIso()
      }, "Staff routed this email out of customer Job Intake.");
    } else if (associatedTicket && category === "customer_job" && associatedTicket.status === "Ignored" && associatedTicket.businessCategory && associatedTicket.businessCategory !== "customer_job") {
      updateEmailIntakeTicket(associatedTicket.id, {
        status: "New",
        businessCategory: category,
        businessCategoryReason: reason,
        updatedAt: nowIso()
      }, "Staff restored this email to customer Job Intake.");
    }

    const learnedFixedCategory = category === "newsletter" || category === "junk";
    const sender = emailHeaderAddress(message.from);
    // If staff corrects a sender away from Newsletter/Junk, remove the old fixed
    // exact-sender rule so the next email is not forced back into the old bucket.
    if (sender && !learnedFixedCategory) {
      setEmailBusinessRules((current) => current.filter((rule) => !(
        rule.matchType === "email" &&
        rule.matchValue.toLowerCase() === sender &&
        (rule.defaultCategory === "newsletter" || rule.defaultCategory === "junk")
      )));
    }
    if (partyType !== "other" || learnedFixedCategory) {
      const domain = emailDomain(message.from);
      // Public mailbox providers are shared by unrelated people. Never teach the
      // MIS that all Gmail/Yahoo/Outlook users are one vendor/customer. Vendor
      // company domains may be learned; newsletter/junk choices learn only the
      // exact sender so one marketing sender cannot poison a whole domain.
      const matchType = partyType === "vendor" && domain && !isPublicEmailDomain(domain) ? "domain" as const : "email" as const;
      const matchValue = matchType === "domain" ? domain : sender;
      if (matchValue) {
        const updatedAt = nowIso();
        setEmailBusinessRules((current) => {
          const existing = current.find((rule) => rule.matchType === matchType && rule.matchValue.toLowerCase() === matchValue.toLowerCase());
          if (existing) return current.map((rule) => rule.id === existing.id ? {
            ...rule,
            partyType,
            partyName,
            defaultCategory: learnedFixedCategory ? category : undefined,
            updatedAt
          } : rule);
          return [{
            id: makeId("email-business-rule"),
            matchType,
            matchValue,
            partyType,
            partyName,
            defaultCategory: learnedFixedCategory ? category : undefined,
            createdAt: updatedAt,
            updatedAt
          }, ...current];
        });
      }
    }
    setNotice(`${partyName || "Email"} routed as ${category.replaceAll("_", " ")}. Future messages from this sender are easier to classify.`);
  }

  function mergeHydratedMailboxMessage(existing: EmailMessage, full: EmailMessage, threadId: string): EmailMessage {
    return {
      ...full,
      id: existing.id,
      threadId,
      customerId: existing.customerId,
      jobId: existing.jobId,
      quoteId: existing.quoteId,
      invoiceId: existing.invoiceId,
      manualConversationId: existing.manualConversationId,
      manualConversationMode: existing.manualConversationMode,
      businessCategory: existing.businessCategorySource === "staff" ? existing.businessCategory : full.businessCategory,
      businessCategoryConfidence: existing.businessCategorySource === "staff" ? existing.businessCategoryConfidence : full.businessCategoryConfidence,
      businessCategoryReason: existing.businessCategorySource === "staff" ? existing.businessCategoryReason : full.businessCategoryReason,
      businessCategorySource: existing.businessCategorySource === "staff" ? existing.businessCategorySource : full.businessCategorySource,
      businessPartyName: existing.businessCategorySource === "staff" ? existing.businessPartyName : full.businessPartyName,
      starred: existing.starred,
      tags: existing.tags,
      fullyLoaded: true
    };
  }

  async function fetchFullMailboxMessage(message: EmailMessage, threadId: string): Promise<EmailMessage> {
    if (message.fullyLoaded || !message.providerMessageId || !message.uidValidity || !/^\d+$/.test(message.uidValidity)) return message;
    const response = await fetch("/api/email/message", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        messageId: message.providerMessageId,
        folder: message.mailboxFolder === "sent" ? "sent" : "inbox",
        uidValidity: message.uidValidity
      }),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({})) as { message?: EmailMessage; error?: string };
    if (!response.ok || !payload.message) throw new Error(payload.error ?? "Unable to load the complete email message.");
    return mergeHydratedMailboxMessage(message, payload.message, threadId);
  }

  async function hydrateEmailMessage(threadId: string, messageId: string): Promise<EmailMessage | undefined> {
    const thread = emailThreads.find((item) => item.id === threadId);
    const message = thread?.messages.find((item) => item.id === messageId);
    if (!thread || !message) return undefined;
    if (message.fullyLoaded) return message;
    try {
      const full = await fetchFullMailboxMessage(message, thread.id);
      if (full === message) return message;
      setEmailThreads((current) => current.map((item) => {
        if (item.id !== thread.id) return item;
        const messages = item.messages.map((entry) => entry.id === message.id ? full : entry);
        const latest = messages.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()).at(-1);
        return {
          ...item,
          subject: latest?.subject ?? item.subject,
          snippet: latest?.bodyText.slice(0, 240) ?? item.snippet,
          lastMessageAt: latest?.sentAt ?? item.lastMessageAt,
          messages
        };
      }));
      return full;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load the complete email.");
      return undefined;
    }
  }

  async function hydrateInboundThreadForJobTicket(thread: EmailThread): Promise<EmailThread> {
    const messages = [...thread.messages];
    const pending = messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.direction === "inbound" && !message.fullyLoaded && message.providerMessageId);
    for (let offset = 0; offset < pending.length; offset += 3) {
      const batch = pending.slice(offset, offset + 3);
      const loaded = await Promise.all(batch.map(async ({ message, index }) => ({ index, full: await fetchFullMailboxMessage(message, thread.id) })));
      loaded.forEach(({ index, full }) => { messages[index] = full; });
    }
    const updated = { ...thread, messages };
    if (pending.length) setEmailThreads((current) => current.map((item) => item.id === thread.id ? updated : item));
    return updated;
  }

  async function syncEmailInbox(options: { silent?: boolean; older?: boolean } = {}) {
    const silent = Boolean(options.silent);
    const older = Boolean(options.older);
    if (emailSyncInFlightRef.current) return;
    if (DEMO_MODE) {
      if (!silent) {
        setEmailConnectionLabel("Demo mailbox");
        setNotice("Demo inbox is already synchronized. Connect the Gross Printing mailbox after hosting to load real messages.");
      }
      return;
    }
    if (!authToken) {
      if (!silent) setNotice("Sign in before synchronizing the mailbox.");
      return;
    }

    emailSyncInFlightRef.current = true;
    if (older) setEmailLoadingOlder(true);
    else setEmailSyncing(true);
    try {
      const page = older ? emailHistoryPage + 1 : 0;
      const headers = { Authorization: `Bearer ${authToken}` };
      const requestPage = async (folder: "inbox" | "sent", maxResults: number, offset: number) => {
        const response = await fetch(`/api/email/inbox?folder=${folder}&maxResults=${maxResults}&offset=${offset}`, { headers, cache: "no-store" });
        const responseText = await response.text();
        let payload: {
          error?: string;
          configured?: boolean;
          mailbox?: string;
          folder?: "inbox" | "sent";
          threads?: EmailThread[];
          hasMore?: boolean;
          total?: number;
        } = {};
        if (responseText) {
          try {
            payload = JSON.parse(responseText) as typeof payload;
          } catch {
            if (response.status === 504) throw new Error("Mailbox refresh took too long. Please try again.");
            throw new Error(response.ok ? "The mailbox returned an unreadable response." : `Mailbox refresh failed (${response.status}).`);
          }
        }
        if (!response.ok) throw new Error(payload.error ?? `Unable to load ${folder} (${response.status}).`);
        return payload;
      };

      // Inbox is the critical path. Do not let an optional Sent-folder problem
      // prevent new customer email from reaching the MIS.
      const inboxPayload = await requestPage("inbox", 15, page * 15);
      if (!inboxPayload.configured) {
        setEmailConnectionLabel("Mailbox not configured");
        if (!silent) setNotice("The Email Center is ready, but the Gross Printing mailbox server variables still need to be added.");
        return;
      }

      let sentPayload: Awaited<ReturnType<typeof requestPage>> = {
        configured: inboxPayload.configured,
        mailbox: inboxPayload.mailbox,
        folder: "sent",
        threads: [],
        hasMore: false,
        total: 0
      };
      let sentRefreshWarning = "";
      try {
        sentPayload = await requestPage("sent", 15, page * 15);
      } catch (error) {
        sentRefreshWarning = error instanceof Error ? error.message : "Sent history could not be refreshed.";
      }

      const serverThreads = combineMailboxThreads([...(inboxPayload.threads ?? []), ...(sentPayload.threads ?? [])]);
      const currentByProvider = new Map(
        emailThreads
          .filter((thread) => thread.providerThreadKey || thread.providerThreadId)
          .map((thread) => [thread.providerThreadKey ?? thread.providerThreadId!, thread])
      );
      const currentByMessageKey = new Map<string, EmailThread>();
      const currentMessageByKey = new Map<string, EmailMessage>();
      const messageIdMigration = new Map<string, string>();
      const attachmentIdMigration = new Map<string, string>();
      emailThreads.forEach((thread) => thread.messages.forEach((message) => {
        const key = mailboxMessageKey(message);
        currentByMessageKey.set(key, thread);
        currentMessageByKey.set(key, message);
      }));
      const preparedIncoming: EmailThread[] = serverThreads.map((thread) => {
        const providerKey = thread.providerThreadKey ?? thread.providerThreadId;
        const exactExisting = providerKey ? currentByProvider.get(providerKey) : undefined;
        const fallbackExisting = thread.messages.map((message) => currentByMessageKey.get(mailboxMessageKey(message))).find(Boolean);
        const existing = exactExisting ?? fallbackExisting;
        const participantAddresses = thread.participantEmails.map(normalizeEmailAddress);
        const matchedCustomer = customers.find((customer) =>
          participantAddresses.includes(normalizeEmailAddress(customer.email)) ||
          (customer.contacts ?? []).some((contact) => participantAddresses.includes(normalizeEmailAddress(contact.email)))
        );
        const messages: EmailMessage[] = thread.messages.map((message) => {
          const previousMessage = currentMessageByKey.get(mailboxMessageKey(message));
          if (previousMessage && previousMessage.id !== message.id) {
            messageIdMigration.set(previousMessage.id, message.id);
            previousMessage.attachments.forEach((oldAttachment) => {
              const replacement = message.attachments.find((attachment) =>
                (oldAttachment.providerAttachmentId && attachment.providerAttachmentId === oldAttachment.providerAttachmentId) ||
                (attachment.filename === oldAttachment.filename && attachment.size === oldAttachment.size)
              );
              if (replacement && replacement.id !== oldAttachment.id) attachmentIdMigration.set(oldAttachment.id, replacement.id);
            });
          }
          return {
            ...message,
            customerId: previousMessage?.customerId ?? existing?.customerId ?? matchedCustomer?.id ?? message.customerId,
            jobId: previousMessage?.jobId ?? existing?.jobId ?? message.jobId,
            manualConversationId: previousMessage?.manualConversationId,
            manualConversationMode: previousMessage?.manualConversationMode
          };
        });
        // Only carry old messages that belong to this RFC conversation. This repairs
        // older subject-based merges without mixing unrelated customers/suppliers again.
        existing?.messages.forEach((message) => {
          if (thread.providerThreadKey && mailboxMessageThreadKey(message) !== thread.providerThreadKey) return;
          const key = mailboxMessageKey(message);
          if (!messages.some((item) => mailboxMessageKey(item) === key)) messages.push(message);
        });
        messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
        const latest = messages[messages.length - 1];
        return {
          ...thread,
          id: exactExisting?.id ?? thread.id,
          archived: exactExisting?.archived,
          customerId: existing?.customerId ?? matchedCustomer?.id,
          jobId: existing?.jobId,
          quoteId: existing?.quoteId,
          invoiceId: existing?.invoiceId,
          subject: latest?.subject || thread.subject,
          snippet: latest?.bodyText.slice(0, 240) || thread.snippet,
          lastMessageAt: latest?.sentAt || thread.lastMessageAt,
          unread: messages.some((message) => message.direction === "inbound" && message.unread),
          messages
        };
      });

      const incomingThreadByMessageId = new Map<string, string>();
      const incomingSourceByAttachmentId = new Map<string, EmailSourceAttachmentRef>();
      preparedIncoming.forEach((thread) => thread.messages.forEach((message) => {
        incomingThreadByMessageId.set(message.id, thread.id);
        sourceAttachmentRefs(message).forEach((source) => incomingSourceByAttachmentId.set(source.id, source));
      }));
      const remapTargets = new Map<string, Set<string>>();
      emailIntakeTickets.forEach((ticket) => {
        const target = incomingThreadByMessageId.get(ticket.messageId);
        if (!target || target === ticket.threadId) return;
        const targets = remapTargets.get(ticket.threadId) ?? new Set<string>();
        targets.add(target);
        remapTargets.set(ticket.threadId, targets);
      });
      const uniqueThreadRemaps = new Map<string, string>();
      remapTargets.forEach((targets, sourceThreadId) => {
        if (targets.size === 1) uniqueThreadRemaps.set(sourceThreadId, Array.from(targets)[0]);
      });
      if (incomingThreadByMessageId.size) {
        setEmailIntakeTickets((current) => current.map((ticket) => {
          const migratedMessageId = messageIdMigration.get(ticket.messageId) ?? ticket.messageId;
          const target = incomingThreadByMessageId.get(migratedMessageId) ?? incomingThreadByMessageId.get(ticket.messageId);
          const attachmentIds = ticket.attachmentIds.map((id) => attachmentIdMigration.get(id) ?? id);
          const sourceAttachments = ticket.sourceAttachments?.map((source) => {
            const migratedId = attachmentIdMigration.get(source.id) ?? source.id;
            const authoritative = incomingSourceByAttachmentId.get(migratedId);
            return authoritative
              ? { ...source, ...authoritative }
              : { ...source, id: migratedId, messageId: messageIdMigration.get(source.messageId) ?? source.messageId };
          });
          if (target || migratedMessageId !== ticket.messageId || attachmentIds.some((id, index) => id !== ticket.attachmentIds[index])) {
            return {
              ...ticket,
              threadId: target ?? ticket.threadId,
              messageId: migratedMessageId,
              attachmentIds,
              sourceAttachments
            };
          }
          return ticket;
        }));
        if (uniqueThreadRemaps.size) {
          setJobs((current) => current.map((job) => {
            const sourceEmailThreadId = job.sourceEmailThreadId ? uniqueThreadRemaps.get(job.sourceEmailThreadId) ?? job.sourceEmailThreadId : undefined;
            const emailThreadIds = job.emailThreadIds?.map((threadId) => uniqueThreadRemaps.get(threadId) ?? threadId);
            return {
              ...job,
              sourceEmailThreadId,
              sourceEmailMessageId: job.sourceEmailMessageId ? messageIdMigration.get(job.sourceEmailMessageId) ?? job.sourceEmailMessageId : job.sourceEmailMessageId,
              emailThreadIds: emailThreadIds ? Array.from(new Set(emailThreadIds)) : emailThreadIds
            };
          }));
        }
      }
      if (messageIdMigration.size || attachmentIdMigration.size) {
        setUploadedFiles((current) => current.map((file) => ({
          ...file,
          sourceEmailMessageId: file.sourceEmailMessageId ? messageIdMigration.get(file.sourceEmailMessageId) ?? file.sourceEmailMessageId : file.sourceEmailMessageId,
          sourceEmailAttachmentId: file.sourceEmailAttachmentId ? attachmentIdMigration.get(file.sourceEmailAttachmentId) ?? file.sourceEmailAttachmentId : file.sourceEmailAttachmentId
        })));
      }

      setEmailThreads((current) => {
        const incomingByProvider = new Map(preparedIncoming.map((thread) => [thread.providerThreadKey ?? thread.providerThreadId ?? thread.id, thread]));
        const incomingMessageKeys = new Set(preparedIncoming.flatMap((thread) => thread.messages.map(mailboxMessageKey)));
        const result: EmailThread[] = [];
        current.forEach((thread) => {
          const key = thread.providerThreadKey ?? thread.providerThreadId ?? thread.id;
          const incoming = incomingByProvider.get(key);
          if (!incoming) {
            const remainingMessages = thread.messages.filter((message) => !incomingMessageKeys.has(mailboxMessageKey(message)));
            if (!remainingMessages.length) return;
            if (remainingMessages.length === thread.messages.length) {
              result.push(thread);
              return;
            }
            const latest = remainingMessages.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()).at(-1);
            result.push({
              ...thread,
              subject: latest?.subject ?? thread.subject,
              snippet: latest?.bodyText.slice(0, 240) ?? thread.snippet,
              lastMessageAt: latest?.sentAt ?? thread.lastMessageAt,
              unread: remainingMessages.some((message) => message.direction === "inbound" && message.unread),
              messages: remainingMessages
            });
            return;
          }
          incomingByProvider.delete(key);
          const messages = incoming.messages.map((incomingMessage) => {
            const existingMessage = thread.messages.find((message) => mailboxMessageKey(message) === mailboxMessageKey(incomingMessage));
            if (!existingMessage) return incomingMessage;
            const preserved = {
              starred: existingMessage.starred,
              tags: existingMessage.tags
            };
            if (existingMessage.businessCategorySource !== "staff") return { ...incomingMessage, ...preserved };
            return {
              ...incomingMessage,
              ...preserved,
              businessCategory: existingMessage.businessCategory,
              businessCategoryConfidence: existingMessage.businessCategoryConfidence,
              businessCategoryReason: existingMessage.businessCategoryReason,
              businessCategorySource: existingMessage.businessCategorySource,
              businessPartyName: existingMessage.businessPartyName
            };
          });
          thread.messages.forEach((message) => {
            if (incoming.providerThreadKey && mailboxMessageThreadKey(message) !== incoming.providerThreadKey) return;
            const messageKey = mailboxMessageKey(message);
            if (!messages.some((item) => mailboxMessageKey(item) === messageKey)) messages.push(message);
          });
          messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
          const latest = messages[messages.length - 1];
          result.push({
            ...thread,
            ...incoming,
            id: thread.id,
            archived: thread.archived,
            customerId: thread.customerId ?? incoming.customerId,
            jobId: thread.jobId ?? incoming.jobId,
            quoteId: thread.quoteId ?? incoming.quoteId,
            invoiceId: thread.invoiceId ?? incoming.invoiceId,
            subject: latest?.subject || incoming.subject,
            snippet: latest?.bodyText.slice(0, 240) || incoming.snippet,
            lastMessageAt: latest?.sentAt || incoming.lastMessageAt,
            messages
          });
        });
        incomingByProvider.forEach((thread) => result.push(thread));
        return applyManualConversationOverrides(result)
          .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      });

      if (!older) {
        const inboxProviderIds = new Set((inboxPayload.threads ?? []).map((thread) => thread.providerThreadKey ?? thread.providerThreadId).filter(Boolean));
        const inboxThreads = preparedIncoming.filter((thread) => {
          const key = thread.providerThreadKey ?? thread.providerThreadId;
          return Boolean(key && inboxProviderIds.has(key));
        });
        // Job Tickets are deliberately manual from v0.7.0.21 forward. AI may
        // classify/suggest work, but simply receiving or reading mail never creates
        // an action ticket. This keeps Inbox as mail and Job Tickets as a true staff
        // action queue.
        const autoTickets: EmailIntakeTicket[] = [];
        const latestInboundByThread = new Map<string, EmailMessage>();
        for (const thread of inboxThreads) {
          const latestInbound = thread.messages
            .filter((message) => message.direction === "inbound")
            .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
            .at(-1);
          if (latestInbound) latestInboundByThread.set(thread.id, latestInbound);
        }

        const nonCustomerCategories = new Set<EmailBusinessCategory>([
          "vendor_quote", "vendor_bill", "vendor_order", "proof", "shipping", "delivery_failure", "newsletter", "junk", "general"
        ]);
        const autoRouteByTicketId = new Map<string, ReturnType<typeof classifyBusinessEmail>>();
        emailIntakeTickets.forEach((ticket) => {
          // Never auto-close a Job Ticket that staff deliberately created.
          if (ticket.origin === "staff") return;
          if (!["New", "AI Reviewed", "Missing Information"].includes(ticket.status)) return;
          const sourceThread = inboxThreads.find((thread) => thread.id === ticket.threadId);
          const sourceMessage = sourceThread?.messages.find((message) => message.id === ticket.messageId);
          if (!sourceThread || !sourceMessage) return;
          const classification = classifyBusinessEmail(sourceMessage, { thread: sourceThread, rules: emailBusinessRules });
          if (nonCustomerCategories.has(classification.category) && classification.confidence >= 0.85) {
            autoRouteByTicketId.set(ticket.id, classification);
          }
        });
        const autoRoutedCount = autoRouteByTicketId.size;
        setEmailIntakeTickets((current) => current.map((ticket) => {
          const classification = autoRouteByTicketId.get(ticket.id);
          if (!classification) return ticket;
          const routedAt = nowIso();
          return {
            ...ticket,
            status: "Ignored" as const,
            businessCategory: classification.category,
            businessCategoryReason: classification.reason,
            updatedAt: routedAt,
            history: appendTicketEvent(ticket, "Ignored", `Smart routing moved this non-customer email out of Job Intake: ${classification.reason}`, routedAt)
          };
        }));

        const reopenedTicketIds = new Set(
          emailIntakeTickets
            .filter((ticket) => {
              if (ticket.status !== "Waiting for Customer") return false;
              const latestInbound = latestInboundByThread.get(ticket.threadId);
              if (!latestInbound) return false;
              const waitingTime = new Date(ticket.waitingSince ?? ticket.updatedAt).getTime();
              const replyTime = new Date(latestInbound.sentAt).getTime();
              return Number.isFinite(replyTime) && replyTime > waitingTime && latestInbound.id !== ticket.messageId;
            })
            .map((ticket) => ticket.id)
        );

        // A waiting Job Ticket is already an explicit staff action. If the
        // customer replies with several files, hydrate that complete reply
        // before reopening the ticket so every real attachment follows the
        // action instead of only the first file from the fast Inbox preview.
        const reopenedFullMessageByThread = new Map<string, EmailMessage>();
        if (reopenedTicketIds.size) {
          await Promise.all(emailIntakeTickets.filter((ticket) => reopenedTicketIds.has(ticket.id)).map(async (ticket) => {
            const preview = latestInboundByThread.get(ticket.threadId);
            if (!preview) return;
            try {
              reopenedFullMessageByThread.set(ticket.threadId, await fetchFullMailboxMessage(preview, ticket.threadId));
            } catch {
              // Keep mailbox refresh resilient. The Job Ticket itself will
              // still verify the full message before conversion.
            }
          }));
          if (reopenedFullMessageByThread.size) {
            setEmailThreads((current) => current.map((thread) => {
              const full = reopenedFullMessageByThread.get(thread.id);
              if (!full) return thread;
              return { ...thread, messages: thread.messages.map((message) => message.id === full.id ? full : message) };
            }));
          }
        }

        const reopenedCount = reopenedTicketIds.size;
        setEmailIntakeTickets((current) => {
          const updated = current.map((ticket) => {
            if (!reopenedTicketIds.has(ticket.id)) return ticket;
            const latestInbound = reopenedFullMessageByThread.get(ticket.threadId) ?? latestInboundByThread.get(ticket.threadId);
            if (!latestInbound) return ticket;
            const reopenedAt = nowIso();
            return {
              ...ticket,
              status: "New" as const,
              messageId: latestInbound.id,
              subject: latestInbound.subject,
              summary: latestInbound.bodyText,
              notes: `${ticket.notes}\n\nCustomer reply received:\n${latestInbound.bodyText}`.trim(),
              attachmentIds: Array.from(new Set([...ticket.attachmentIds, ...userVisibleEmailAttachments(latestInbound).map((attachment) => attachment.id)])),
              sourceAttachments: Array.from(new Map([...(ticket.sourceAttachments ?? []), ...sourceAttachmentRefs(latestInbound)].map((item) => [item.id, item])).values()),
              lastCustomerReplyAt: latestInbound.sentAt,
              waitingSince: undefined,
              updatedAt: reopenedAt,
              history: appendTicketEvent(ticket, "New", "A newer customer reply reopened this ticket for staff review.", reopenedAt)
            };
          });
          const newTickets = autoTickets.filter((ticket) => !updated.some((item) => item.messageId === ticket.messageId));
          return [...newTickets, ...updated];
        });

        if (!silent) {
          setNotice(
            `Mailbox refreshed` +
            `${autoRoutedCount ? `; ${autoRoutedCount} non-job email ticket${autoRoutedCount === 1 ? "" : "s"} moved out of Job Intake` : ""}` +
            `${reopenedCount ? `; ${reopenedCount} waiting ticket${reopenedCount === 1 ? "" : "s"} reopened` : ""}.`
          );
        }
      } else {
        setEmailHistoryPage(page);
        if (!silent) setNotice("Older mailbox history loaded.");
      }

      setEmailHasMore(Boolean(inboxPayload.hasMore || sentPayload.hasMore));
      if (sentRefreshWarning) {
        setEmailConnectionLabel(inboxPayload.mailbox ? `Connected: ${inboxPayload.mailbox} · Inbox live` : "Inbox connected · Auto refresh");
        if (!silent) setNotice(`Inbox refreshed. Sent history needs attention: ${sentRefreshWarning}`);
      } else {
        setEmailConnectionLabel(inboxPayload.mailbox ? `Connected: ${inboxPayload.mailbox} · Auto refresh` : "Mailbox connected · Auto refresh");
      }
    } catch (error) {
      setEmailConnectionLabel("Mailbox needs attention");
      if (!silent) setNotice(error instanceof Error ? error.message : "Unable to refresh the mailbox.");
    } finally {
      emailSyncInFlightRef.current = false;
      setEmailSyncing(false);
      setEmailLoadingOlder(false);
    }
  }

  async function loadOlderEmailHistory() {
    await syncEmailInbox({ older: true });
  }

  async function searchFullMailbox(query: string) {
    const term = query.trim();
    if (term.length < 2) return 0;
    if (DEMO_MODE || !authToken) {
      setNotice("Full mailbox search is available after the live mailbox is connected.");
      return 0;
    }
    const headers = { Authorization: `Bearer ${authToken}` };
    const searchFolder = async (folder: "inbox" | "sent") => {
      const response = await fetch(`/api/email/inbox?folder=${folder}&maxResults=15&offset=0&q=${encodeURIComponent(term)}`, { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { threads?: EmailThread[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Unable to search ${folder}.`);
      return payload.threads ?? [];
    };
    try {
      const inbox = await searchFolder("inbox");
      let sent: EmailThread[] = [];
      try { sent = await searchFolder("sent"); } catch { /* Inbox search remains useful if Sent is unavailable. */ }
      const found = combineMailboxThreads([...inbox, ...sent]);
      setEmailThreads((current) => {
        const existingMessageByKey = new Map(current.flatMap((thread) => thread.messages.map((message) => [mailboxMessageKey(message), message] as const)));
        const mergedIncoming = found.map((thread) => ({
          ...thread,
          messages: thread.messages.map((message) => {
            const existing = existingMessageByKey.get(mailboxMessageKey(message));
            return existing ? { ...message, ...existing, unread: message.unread } : message;
          })
        }));
        return applyManualConversationOverrides(combineMailboxThreads([...current, ...mergedIncoming]))
          .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      });
      return found.flatMap((thread) => thread.messages).length;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to search the full mailbox.");
      return 0;
    }
  }

  function appendTicketEvent(
    ticket: EmailIntakeTicket,
    status: EmailIntakeTicket["status"],
    note: string,
    createdAt = nowIso()
  ) {
    return [
      {
        id: makeId("ticket-event"),
        status,
        createdAt,
        employeeName: currentEmployee.name,
        note
      },
      ...(ticket.history ?? [])
    ];
  }

  function updateEmailIntakeTicket(ticketId: string, changes: Partial<EmailIntakeTicket>, statusNote?: string) {
    setEmailIntakeTickets((current) =>
      current.map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        const nextStatus = changes.status ?? ticket.status;
        const statusChanged = Boolean(changes.status && changes.status !== ticket.status);
        return {
          ...ticket,
          ...changes,
          history: statusChanged
            ? appendTicketEvent(
                ticket,
                nextStatus,
                statusNote ?? `Ticket moved from ${ticket.status} to ${nextStatus}.`,
                changes.updatedAt ?? nowIso()
              )
            : ticket.history
        };
      })
    );
  }

  async function createEmailIntakeTicket(threadId: string, preferredMessageId?: string): Promise<string | undefined> {
    const existingThread = emailThreads.find((item) => item.id === threadId);
    if (!existingThread) return undefined;
    let thread: EmailThread;
    try {
      thread = await hydrateInboundThreadForJobTicket(existingThread);
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : "Unable to verify all customer attachments."} Job Ticket was not created, so no attachment can be silently lost.`);
      return undefined;
    }
    const preferredMessage = preferredMessageId ? thread.messages.find((message) => message.id === preferredMessageId) : undefined;
    const latestInbound = (preferredMessage?.direction === "inbound" ? preferredMessage : undefined) ?? [...thread.messages].reverse().find((message) => message.direction === "inbound") ?? thread.messages[thread.messages.length - 1];
    if (!latestInbound) return undefined;
    const existing = emailIntakeTickets.find((ticket) => ticket.messageId === latestInbound.id);
    if (existing) {
      setNotice(existing.status === "Converted"
        ? `This exact email was already converted to ${existing.convertedRecordNumber ?? "a quote or job"}.`
        : "This exact email already has a Job Ticket.");
      return existing.id;
    }
    const participantAddresses = thread.participantEmails.map(normalizeEmailAddress);
    const customer = thread.customerId
      ? customers.find((item) => item.id === thread.customerId)
      : customers.find((item) =>
          participantAddresses.includes(normalizeEmailAddress(item.email)) ||
          (item.contacts ?? []).some((contact) => participantAddresses.includes(normalizeEmailAddress(contact.email)))
        );
    const combined = `${latestInbound.subject}
${latestInbound.bodyText}`;
    const businessClassification = classifyBusinessEmail(latestInbound, { thread, rules: emailBusinessRules });
    const createdAt = nowIso();
    const ticketId = makeId("intake");
    const ticket: EmailIntakeTicket = {
      id: ticketId,
      ticketNumber: nextPrefixedNumber(emailIntakeTickets.map((item) => item.ticketNumber), "ET", 1001),
      threadId: thread.id,
      messageId: latestInbound.id,
      status: "New",
      origin: "staff",
      subject: latestInbound.subject,
      summary: latestInbound.bodyText,
      customerId: customer?.id,
      customerName: customer?.name,
      productHint: inferEmailProduct(combined),
      quantity: inferEmailQuantity(combined),
      notes: latestInbound.bodyText,
      // Carry every real attachment in the conversation into the action ticket.
      // Revised/same-named files remain separate because their attachment IDs differ.
      attachmentIds: userVisibleThreadAttachments(thread).filter(({ message }) => message.direction === "inbound").map(({ attachment }) => attachment.id),
      sourceAttachments: threadSourceAttachmentRefs(thread).filter((source) => {
        const parent = thread.messages.find((message) => message.id === source.messageId);
        return parent?.direction === "inbound";
      }),
      businessCategory: businessClassification.category,
      businessCategoryReason: businessClassification.reason,
      actionDueAt: new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt,
      updatedAt: createdAt,
      history: [{
        id: makeId("ticket-event"),
        status: "New",
        createdAt,
        employeeName: currentEmployee.name,
        note: "Staff created this intake ticket from the selected email."
      }]
    };
    setEmailIntakeTickets((current) => [ticket, ...current]);
    setEmailThreads((current) => current.map((item) => (item.id === thread.id ? { ...item, customerId: customer?.id ?? item.customerId } : item)));
    setNotice("Job Ticket created. Review it and choose the next action.");
    return ticketId;
  }

  async function quickStartJobFromEmail(threadId: string, messageId: string, preferredAttachmentId?: string, handoffArtworkFile?: File) {
    const existing = emailIntakeTickets.find((ticket) => ticket.messageId === messageId);
    if (existing?.status === "Converted" || existing?.jobId || existing?.quoteId) {
      if (existing.jobId) {
        setSelectedJobId(existing.jobId);
        activateView("Workflow");
        setNotice(`${existing.convertedRecordNumber ?? existing.ticketNumber ?? "Job"} is already created.`);
      } else {
        setNotice(`This email was already converted to ${existing?.convertedRecordNumber ?? "a quote or job"}.`);
      }
      return;
    }

    const ticketId = existing?.id ?? await createEmailIntakeTicket(threadId, messageId);
    if (!ticketId) return;
    const openedAt = nowIso();
    setEmailIntakeTickets((current) => current.map((ticket) => ticket.id === ticketId ? {
      ...ticket,
      status: "Ready for Job",
      preferredConversion: "job",
      attachmentIds: preferredAttachmentId ? [preferredAttachmentId, ...ticket.attachmentIds.filter((id) => id !== preferredAttachmentId)] : ticket.attachmentIds,
      sourceAttachments: preferredAttachmentId ? [...(ticket.sourceAttachments ?? []).filter((item) => item.id === preferredAttachmentId), ...(ticket.sourceAttachments ?? []).filter((item) => item.id !== preferredAttachmentId)] : ticket.sourceAttachments,
      workPath: "job",
      workPathConfirmed: true,
      workPathReason: "Opened directly from the customer email in Quick Job Setup.",
      updatedAt: openedAt,
      history: [{ id: makeId("ticket-event"), status: "Ready for Job", createdAt: openedAt, employeeName: currentEmployee.name, note: "Opened directly from Email Center in Quick Job Setup." }, ...(ticket.history ?? [])]
    } : ticket));
    setEstimateCustomerId(undefined);
    setEstimateHandoffArtworkFile(handoffArtworkFile);
    setActivePortalRequest(undefined);
    setEditingJobId(undefined);
    setEstimateDirty(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("gross-printing-estimate-draft");
      window.localStorage.removeItem("gross-printing-estimate-draft-v2");
    }
    setActiveIntakeTicketId(ticketId);
    activateView("New Estimate / Job");
    setNotice("Email artwork opened in Quick Job Setup. The PDF, customer, and email source stay linked.");
  }

  function routeEmailIntakeTicket(
    ticketId: string,
    route: {
      destination: EmailRouteDestination;
      assigneeUserId?: string;
      assigneeName?: string;
      assigneeRole?: "admin" | "front_desk" | "prepress" | "press" | "finishing";
      assigneeDepartment?: string;
      note?: string;
      existingJobId?: string;
    }
  ) {
    const ticket = emailIntakeTickets.find((item) => item.id === ticketId);
    if (!ticket) return;
    if (ticket.status === "Converted" || ticket.jobId || ticket.quoteId) {
      setNotice(`This Job Ticket was already converted to ${ticket.convertedRecordNumber ?? "a quote or job"}.`);
      return;
    }
    if (route.destination === "existing_job") {
      if (!route.existingJobId) {
        setNotice("Choose the existing job before sending this Job Ticket.");
        return;
      }
      void linkEmailThreadToJob(ticket.threadId, route.existingJobId);
      return;
    }

    const routedAt = nowIso();
    const defaultRole = route.destination === "design"
      ? "prepress"
      : route.destination === "production"
        ? "press"
        : route.destination === "finishing"
          ? "finishing"
          : "front_desk";
    const destinationLabel: Record<EmailRouteDestination, string> = {
      job_setup: "Job Setup",
      estimate: "Estimate / Calculation",
      design: "Graphics / Prepress",
      production: "Printing / Production",
      finishing: "Finishing",
      billing: "Billing / Accounting",
      existing_job: "Existing Job"
    };
    const nextStatus: EmailIntakeTicket["status"] = route.destination === "job_setup"
      ? "Ready for Job"
      : route.destination === "estimate"
        ? "Ready for Quote"
        : "AI Reviewed";
    const workPath: EmailIntakeTicket["workPath"] = route.destination === "job_setup" || route.destination === "production" || route.destination === "finishing"
      ? "job"
      : route.destination === "estimate" || route.destination === "billing"
        ? "calculation"
        : "design";
    const routedNote = route.note?.trim() || `Sent to ${destinationLabel[route.destination]}.`;

    setEmailIntakeTickets((current) => current.map((item) => {
      if (item.id !== ticketId) return item;
      return {
        ...item,
        status: nextStatus,
        routeDestination: route.destination,
        routedAt,
        routedBy: currentEmployee.name,
        assignedToUserId: route.assigneeUserId,
        assignedToName: route.assigneeName,
        assignedRole: route.assigneeRole ?? defaultRole,
        assignedDepartment: route.assigneeDepartment,
        routingNote: routedNote,
        workPath,
        workPathConfirmed: true,
        workPathReason: `Routed by staff to ${destinationLabel[route.destination]}.`,
        preferredConversion: route.destination === "job_setup" ? "job" : route.destination === "estimate" ? "quote" : item.preferredConversion,
        updatedAt: routedAt,
        history: [
          {
            id: makeId("ticket-event"),
            status: nextStatus,
            createdAt: routedAt,
            employeeName: currentEmployee.name,
            note: `${routedNote}${route.assigneeName ? ` Assigned to ${route.assigneeName}.` : ""}`
          },
          ...(item.history ?? [])
        ]
      };
    }));

    if (route.destination === "job_setup" || route.destination === "estimate") {
      setEstimateHandoffArtworkFile(undefined);
      setActiveIntakeTicketId(ticketId);
      activateView("New Estimate / Job");
      setNotice(`${ticket.ticketNumber ?? "Job Ticket"} sent to ${destinationLabel[route.destination]} and opened.`);
    } else {
      setNotice(`${ticket.ticketNumber ?? "Job Ticket"} sent to ${route.assigneeName || destinationLabel[route.destination]}. It is no longer waiting in Email Center.`);
    }
  }

  function completeRoutedEmailTicket(ticketId: string) {
    const completedAt = nowIso();
    setEmailIntakeTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId || !ticket.routedAt || ticket.routeCompletedAt) return ticket;
      return {
        ...ticket,
        routeCompletedAt: completedAt,
        routeCompletedBy: currentEmployee.name,
        updatedAt: completedAt,
        history: [
          {
            id: makeId("ticket-event"),
            status: ticket.status,
            createdAt: completedAt,
            employeeName: currentEmployee.name,
            note: `Assigned work completed by ${currentEmployee.name}.`
          },
          ...(ticket.history ?? [])
        ]
      };
    }));
    setNotice("Assigned work marked complete and moved to Recently completed assignments.");
  }

  function createCustomerFromEmailTicket(ticketId: string) {
    const ticket = emailIntakeTickets.find((item) => item.id === ticketId);
    const thread = ticket ? emailThreads.find((item) => item.id === ticket.threadId) : undefined;
    const inbound = thread?.messages.slice().reverse().find((message) => message.direction === "inbound");
    const senderEmail = normalizeEmailAddress(inbound?.from);
    if (!ticket || !thread || !senderEmail || !isValidEmail(senderEmail)) {
      setNotice("A valid sender email is required before creating the customer.");
      return;
    }
    const exact = matchCustomerCandidates(customers, { email: senderEmail }).find((candidate) => candidate.kind === "exact_email" || candidate.kind === "contact_email");
    if (exact) {
      const existing = customers.find((customer) => customer.id === exact.customerId);
      if (existing) {
        updateEmailIntakeTicket(ticketId, {
          customerId: existing.id,
          customerName: existing.name,
          customerMatchKind: exact.kind,
          customerMatchConfidence: exact.score,
          customerMatchReason: exact.reason,
          aiMissingInformation: (ticket.aiMissingInformation ?? []).filter((item) => !item.toLowerCase().includes("customer"))
        });
        setEmailThreads((current) => current.map((item) => item.id === thread.id ? { ...item, customerId: existing.id } : item));
        setNotice(`${existing.name} already uses this email. The ticket was linked instead of creating a duplicate.`);
        return;
      }
    }
    const contactName = displayNameFromEmailHeader(inbound?.from);
    const ticketCustomerName = ticket.customerName?.trim();
    const ticketNameLooksUsable = Boolean(ticketCustomerName && !ticketCustomerName.includes("@") && !/^(gmail|googlemail|yahoo|outlook|hotmail|icloud)$/i.test(ticketCustomerName));
    const suggestedCompany = isPublicEmailDomain(emailDomain(senderEmail))
      ? contactName
      : ticketNameLooksUsable
        ? ticketCustomerName!
        : companyNameFromEmailAddress(senderEmail);
    const createdAt = nowIso();
    const customer: Customer = {
      id: makeId("customer"),
      name: suggestedCompany,
      contact: contactName,
      email: senderEmail,
      phone: "",
      companyType: "Commercial",
      terms: "Due on receipt",
      lastOrder: "",
      totalSpend: 0,
      openBalance: 0,
      contacts: [{ id: makeId("contact"), name: contactName, email: senderEmail, isPrimary: true }],
      portalPricingEnabled: false,
      portalInstantOrderEnabled: false,
      portalQuoteApprovalRequired: true
    };
    setCustomers((current) => [customer, ...current]);
    updateEmailIntakeTicket(ticketId, {
      customerId: customer.id,
      customerName: customer.name,
      customerMatchKind: "exact_email",
      customerMatchConfidence: 1,
      customerMatchReason: "Customer created by staff from this sender email.",
      aiMissingInformation: (ticket.aiMissingInformation ?? []).filter((item) => !item.toLowerCase().includes("customer"))
    });
    setEmailThreads((current) => current.map((item) => item.id === thread.id ? { ...item, customerId: customer.id } : item));
    setOperationalActivities((current) => [makeOperationalActivity({
      category: "customer",
      action: "customer_created_from_email",
      description: `${customer.name} created from ${senderEmail} after staff approval.`,
      customerId: customer.id,
      customerName: customer.name,
      createdAt
    }), ...current]);
    setNotice(`${customer.name} created and linked to this email. No customer email was sent.`);
  }

  function addEmailSenderAsCustomerContact(ticketId: string, customerId: string) {
    const ticket = emailIntakeTickets.find((item) => item.id === ticketId);
    const thread = ticket ? emailThreads.find((item) => item.id === ticket.threadId) : undefined;
    const customer = customers.find((item) => item.id === customerId);
    const inbound = thread?.messages.slice().reverse().find((message) => message.direction === "inbound");
    const senderEmail = normalizeEmailAddress(inbound?.from);
    if (!ticket || !thread || !customer || !senderEmail || !isValidEmail(senderEmail)) {
      setNotice("A customer and valid sender email are required.");
      return;
    }
    const alreadyUsedByOther = customers.find((item) => item.id !== customer.id && (
      normalizeEmailAddress(item.email) === senderEmail ||
      (item.contacts ?? []).some((contact) => normalizeEmailAddress(contact.email) === senderEmail)
    ));
    if (alreadyUsedByOther) {
      setNotice(`${senderEmail} is already linked to ${alreadyUsedByOther.name}. Review that customer before moving the contact.`);
      return;
    }
    const contactName = displayNameFromEmailHeader(inbound?.from);
    setCustomers((current) => current.map((item) => {
      if (item.id !== customer.id) return item;
      const contacts = item.contacts ?? [];
      if (contacts.some((contact) => normalizeEmailAddress(contact.email) === senderEmail) || normalizeEmailAddress(item.email) === senderEmail) return item;
      return { ...item, contacts: [...contacts, { id: makeId("contact"), name: contactName, email: senderEmail }] };
    }));
    updateEmailIntakeTicket(ticketId, {
      customerId: customer.id,
      customerName: customer.name,
      customerMatchKind: "contact_email",
      customerMatchConfidence: 1,
      customerMatchReason: `Staff added ${senderEmail} as a contact under ${customer.name}.`,
      aiMissingInformation: (ticket.aiMissingInformation ?? []).filter((item) => !item.toLowerCase().includes("customer"))
    });
    setEmailThreads((current) => current.map((item) => item.id === thread.id ? { ...item, customerId: customer.id } : item));
    setOperationalActivities((current) => [makeOperationalActivity({
      category: "customer",
      action: "customer_contact_added_from_email",
      description: `${contactName} (${senderEmail}) added as a contact under ${customer.name}.`,
      customerId: customer.id,
      customerName: customer.name
    }), ...current]);
    setNotice(`${contactName} is now a contact under ${customer.name}. Future emails can match automatically.`);
  }

  function startEstimateFromEmailTicket(ticketId: string, preferredConversion: "quote" | "job") {
    const ticket = emailIntakeTickets.find((item) => item.id === ticketId);
    if (!ticket) return;
    if (ticket.status === "Converted" || ticket.jobId || ticket.quoteId) {
      setNotice(`This ticket was already converted to ${ticket.convertedRecordNumber ?? "a quote or job"}.`);
      return;
    }
    if (ticket.status === "Ignored" || ticket.status === "Archived") {
      setNotice("Restore this Job Ticket to active work first.");
      return;
    }
    if (!ticket.customerId) {
      setNotice("Choose the customer before starting the quote or job.");
      return;
    }
    const unresolvedArtwork = ticket.artworkPreflight?.filter((item) => item.severity === "warning" && !item.approved) ?? [];
    if (unresolvedArtwork.length) {
      setNotice("Review the artwork proportion warning before opening quote/job setup, or approve the exception.");
      return;
    }
    const readyStatus = preferredConversion === "job" ? "Ready for Job" : "Ready for Quote";
    updateEmailIntakeTicket(
      ticketId,
      { status: readyStatus, preferredConversion, updatedAt: nowIso() },
      `Staff continued this Job Ticket to ${preferredConversion === "job" ? "Job Setup" : "Estimate Setup"}.`
    );
    setEstimateHandoffArtworkFile(undefined);
    setActiveIntakeTicketId(ticketId);
    activateView("New Estimate / Job");
    setNotice(`Job Ticket opened in ${preferredConversion === "job" ? "Job Setup" : "Estimate Setup"}.`);
  }

  async function linkEmailThreadToJob(threadId: string, jobId: string) {
    const job = jobs.find((item) => item.id === jobId);
    const customer = job ? customers.find((item) => item.id === job.customerId) : undefined;
    if (!job || !customer) return;

    const linkedAt = nowIso();
    const sourceTicket = emailIntakeTickets
      .filter(
        (ticket) =>
          ticket.threadId === threadId &&
          ticket.status !== "Converted" &&
          ticket.status !== "Ignored" &&
          ticket.status !== "Archived"
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    let linkedFiles: UploadedFile[] = [];
    if (sourceTicket) {
      try {
        linkedFiles = await linkedEmailFilesForTicket(sourceTicket, customer, job.id, job.jobNumber, linkedAt);
      } catch (error) {
        setNotice(`${error instanceof Error ? error.message : "Unable to preserve email artwork."} Nothing was linked to the job.`);
        return;
      }
    }

    setEmailThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? { ...thread, jobId, customerId: job.customerId }
          : thread
      )
    );
    setJobs((current) =>
      current.map((item) =>
        item.id === jobId
          ? {
              ...item,
              sourceEmailThreadId: item.sourceEmailThreadId ?? threadId,
              emailThreadIds: Array.from(new Set([...(item.emailThreadIds ?? []), threadId])),
              artworkName:
                item.artworkName ??
                linkedFiles.find(
                  (file) => file.type.startsWith("image/") || file.type === "application/pdf"
                )?.name,
              updatedAt: linkedAt
            }
          : item
      )
    );

    if (linkedFiles.length) {
      setUploadedFiles((current) => [...linkedFiles, ...current]);
      setCustomers((current) =>
        current.map((item) =>
          item.id === customer.id
            ? { ...item, attachments: (item.attachments ?? 0) + linkedFiles.length }
            : item
        )
      );
    }

    if (sourceTicket) {
      convertingTicketIdsRef.current.add(sourceTicket.id);
      setEmailIntakeTickets((current) =>
        current.map((ticket) =>
          ticket.id === sourceTicket.id
            ? {
                ...ticket,
                status: "Converted",
                customerId: customer.id,
                customerName: customer.name,
                jobId: job.id,
                quoteId: job.quoteId,
                convertedAt: linkedAt,
                convertedBy: currentEmployee.name,
                conversionKind: "job",
                convertedRecordNumber: job.jobNumber,
                sourceAttachmentFileIds: linkedFiles.map((file) => file.id),
                conversionStartedAt: linkedAt,
                updatedAt: linkedAt,
                history: [
                  {
                    id: makeId("ticket-event"),
                    status: "Converted",
                    createdAt: linkedAt,
                    employeeName: currentEmployee.name,
                    note: `Linked to existing job ${job.jobNumber}. ${linkedFiles.length} email attachment${
                      linkedFiles.length === 1 ? "" : "s"
                    } linked to Files.`
                  },
                  ...(ticket.history ?? [])
                ]
              }
            : ticket
        )
      );
    }

    activateView("Workflow");
    setSelectedJobId(job.id);
    setNotice(
      sourceTicket
        ? `${sourceTicket.ticketNumber ?? "Email ticket"} linked to ${job.jobNumber} and moved to Converted history.`
        : `Email thread linked to ${job.jobNumber} and opened.`
    );
  }

  function archiveEmailThread(threadId: string) {
    setEmailThreads((current) => current.map((thread) => (thread.id === threadId ? { ...thread, archived: true, unread: false } : thread)));
    setNotice("Email thread archived in the MIS.");
  }

  function unarchiveEmailThread(threadId: string) {
    setEmailThreads((current) => current.map((thread) => (thread.id === threadId ? { ...thread, archived: false } : thread)));
    setNotice("Email thread restored to the inbox view.");
  }

  function restoreArchivedEmailTicket(ticketId: string) {
    const restoredAt = nowIso();
    setEmailIntakeTickets((current) => current.map((ticket) => ticket.id !== ticketId ? ticket : {
      ...ticket,
      status: "New",
      routedAt: undefined,
      routedBy: undefined,
      routeDestination: undefined,
      assignedToUserId: undefined,
      assignedToName: undefined,
      assignedRole: undefined,
      assignedDepartment: undefined,
      routeCompletedAt: undefined,
      routeCompletedBy: undefined,
      actionDueAt: new Date(new Date(restoredAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: restoredAt,
      history: [
        {
          id: makeId("ticket-event"),
          status: "New",
          createdAt: restoredAt,
          employeeName: currentEmployee.name,
          note: "Restored from Settings archive to the active Email Center action queue."
        },
        ...(ticket.history ?? [])
      ]
    }));
    setNotice("Job Ticket restored to Email Center and given a new 1-day action window.");
  }

  function toggleEmailMessageStar(threadId: string, messageId: string) {
    setEmailThreads((current) => current.map((thread) => thread.id !== threadId ? thread : {
      ...thread,
      messages: thread.messages.map((message) => message.id === messageId ? { ...message, starred: !message.starred } : message)
    }));
  }

  function setEmailMessageTags(threadId: string, messageId: string, tags: string[]) {
    const normalized = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
    setEmailThreads((current) => current.map((thread) => thread.id !== threadId ? thread : {
      ...thread,
      messages: thread.messages.map((message) => message.id === messageId ? { ...message, tags: normalized } : message)
    }));
  }

  async function setEmailThreadReadState(threadId: string, unread: boolean) {
    const thread = emailThreads.find((item) => item.id === threadId);
    if (!thread) return;
    const inbound = thread.messages.filter((message) => message.direction === "inbound");
    const targetMessages = unread
      ? [...inbound].reverse().filter((message) => message.providerMessageId).slice(0, 1)
      : inbound.filter((message) => message.providerMessageId && message.unread);
    const previousUnreadById = new Map(thread.messages.map((message) => [message.id, Boolean(message.unread)]));

    setEmailThreads((current) => current.map((item) => {
      if (item.id !== threadId) return item;
      const targetIds = new Set(targetMessages.map((message) => message.id));
      const messages = item.messages.map((message) => {
        if (unread) return targetIds.has(message.id) ? { ...message, unread: true } : message;
        return message.direction === "inbound" ? { ...message, unread: false } : message;
      });
      return { ...item, unread, messages };
    }));

    if (DEMO_MODE || !authToken || !targetMessages.length) return;
    try {
      const response = await fetch("/api/email/read-state", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          changes: targetMessages.map((message) => ({
            messageId: message.providerMessageId,
            folder: message.mailboxFolder === "sent" ? "sent" : "inbox",
            uidValidity: message.uidValidity,
            unread
          }))
        })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update mailbox read status.");
    } catch (error) {
      setEmailThreads((current) => current.map((item) => {
        if (item.id !== threadId) return item;
        const messages = item.messages.map((message) => ({ ...message, unread: previousUnreadById.get(message.id) ?? Boolean(message.unread) }));
        return { ...item, unread: messages.some((message) => message.direction === "inbound" && message.unread), messages };
      }));
      setNotice(error instanceof Error ? error.message : "Unable to update mailbox read status.");
    }
  }

  function markEmailThreadRead(threadId: string) {
    void setEmailThreadReadState(threadId, false);
  }

  function markEmailThreadUnread(threadId: string) {
    void setEmailThreadReadState(threadId, true);
  }

  async function setEmailMessageReadState(threadId: string, messageId: string, unread: boolean) {
    const thread = emailThreads.find((item) => item.id === threadId);
    const message = thread?.messages.find((item) => item.id === messageId);
    if (!thread || !message || message.direction !== "inbound") return;
    const previousUnread = Boolean(message.unread);
    setEmailThreads((current) => current.map((item) => {
      if (item.id !== threadId) return item;
      const messages = item.messages.map((entry) => entry.id === messageId ? { ...entry, unread } : entry);
      return { ...item, unread: messages.some((entry) => entry.direction === "inbound" && entry.unread), messages };
    }));
    if (DEMO_MODE || !authToken || !message.providerMessageId) return;
    try {
      const response = await fetch("/api/email/read-state", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ changes: [{ messageId: message.providerMessageId, folder: message.mailboxFolder === "sent" ? "sent" : "inbox", uidValidity: message.uidValidity, unread }] })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update mailbox read status.");
    } catch (error) {
      setEmailThreads((current) => current.map((item) => {
        if (item.id !== threadId) return item;
        const messages = item.messages.map((entry) => entry.id === messageId ? { ...entry, unread: previousUnread } : entry);
        return { ...item, unread: messages.some((entry) => entry.direction === "inbound" && entry.unread), messages };
      }));
      setNotice(error instanceof Error ? error.message : "Unable to update mailbox read status.");
    }
  }

  function markEmailMessageRead(threadId: string, messageId: string) {
    void setEmailMessageReadState(threadId, messageId, false);
  }

  function markEmailMessageUnread(threadId: string, messageId: string) {
    void setEmailMessageReadState(threadId, messageId, true);
  }

  async function replyToEmailThread(threadId: string, body: string): Promise<boolean> {
    const thread = emailThreads.find((item) => item.id === threadId);
    if (!thread) return false;
    const latestInbound = [...thread.messages].reverse().find((message) => message.direction === "inbound");
    const recipient = normalizeEmailAddress(latestInbound?.from) || thread.participantEmails.map(normalizeEmailAddress).find((email) => email && email !== "jobs@grossprinting.com");
    if (!recipient || !isValidEmail(recipient)) {
      setNotice("A valid customer email could not be found in this thread.");
      return false;
    }
    const sent = await sendConfiguredEmail({
      to: recipient,
      subject: thread.subject.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject}`,
      body,
      entityId: thread.id,
      entityType: "thread",
      customerId: thread.customerId,
      jobId: thread.jobId,
      quoteId: thread.quoteId,
      invoiceId: thread.invoiceId,
      threadId: thread.id
    });
    setNotice(sent ? `Reply ${DEMO_MODE ? "saved in demo mode" : "sent"}.` : "Reply could not be sent.");
    return sent;
  }

  async function sendEmailTicketReply(ticketId: string, body: string) {
    const ticket = emailIntakeTickets.find((item) => item.id === ticketId);
    if (!ticket) return false;
    const sent = await replyToEmailThread(ticket.threadId, body);
    if (!sent) return false;
    const sentAt = nowIso();
    updateEmailIntakeTicket(
      ticketId,
      {
        status: "Waiting for Customer",
        customerReplyDraft: body,
        waitingSince: sentAt,
        updatedAt: sentAt
      },
      "Missing-information questions were sent to the customer."
    );
    return true;
  }

  async function downloadEmailAttachment(
    threadId: string,
    messageId: string,
    attachmentId: string,
    action: "download" | "open" = "download"
  ) {
    const thread = emailThreads.find((item) => item.id === threadId);
    const message = thread?.messages.find((item) => item.id === messageId);
    const attachment = message?.attachments.find((item) => item.id === attachmentId);
    if (!message || !attachment) return;

    if (
      DEMO_MODE ||
      !message.providerMessageId ||
      !attachment.providerAttachmentId ||
      attachment.providerAttachmentId.startsWith("demo-")
    ) {
      setNotice(
        `${attachment.filename} is not available from the mailbox yet. Refresh the mailbox and try again.`
      );
      return;
    }
    if (!authToken) {
      setNotice("Sign in again before opening the email attachment.");
      return;
    }

    const pendingWindow = action === "open" ? window.open("about:blank", "_blank") : null;
    try {
      const response = await fetch("/api/email/attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          messageId: message.providerMessageId,
          folder: message.mailboxFolder === "sent" ? "sent" : "inbox",
          attachmentId: attachment.providerAttachmentId,
          uidValidity: message.uidValidity ?? attachment.uidValidity,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          disposition: action === "open" ? "inline" : "attachment"
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Unable to load attachment.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (action === "open") {
        if (pendingWindow) {
          pendingWindow.opener = null;
          pendingWindow.location.href = url;
        } else {
          window.location.href = url;
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = attachment.filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      pendingWindow?.close();
      setNotice(error instanceof Error ? error.message : "Unable to load attachment.");
    }
  }

  function updateEmailTemplate(templateId: EmailTemplateKey, changes: Partial<EmailTemplate>) {
    setEmailTemplates((current) => current.map((template) => template.id === templateId ? { ...template, ...changes, updatedAt: nowIso() } : template));
    setNotice("Email template saved.");
  }

  async function updateEmailSafetySettings(changes: Partial<EmailSafetySettings>) {
    if (currentRole !== "admin" || (!DEMO_MODE && !authSession?.isOwner)) {
      setNotice("Only the Owner can change customer email safety settings.");
      return;
    }
    const enablingLive = changes.mode === "live" && emailSafety.mode !== "live";
    if (enablingLive && typeof window !== "undefined" && !window.confirm("LIVE MODE will allow real customer emails to leave the MIS. Continue only when you are ready for production sending.")) return;

    const next: EmailSafetySettings = {
      ...emailSafety,
      ...changes,
      id: "primary",
      testRecipients: changes.testRecipients
        ? [...new Set(changes.testRecipients.map((email) => email.trim().toLowerCase()).filter(isValidEmail))].slice(0, 50)
        : emailSafety.testRecipients,
      redirectBlockedTo: changes.redirectBlockedTo !== undefined ? changes.redirectBlockedTo.trim().toLowerCase() : emailSafety.redirectBlockedTo,
      updatedAt: nowIso(),
      updatedBy: currentEmployee.name
    };
    if (next.redirectBlockedEnabled && !isValidEmail(next.redirectBlockedTo)) next.redirectBlockedEnabled = false;

    if (!DEMO_MODE) {
      if (!authToken) {
        setNotice("Sign in again before changing customer email safety mode.");
        return;
      }
      // Stop any not-yet-started whole-state save from carrying the old kill-switch value.
      // Current React state already contains those edits; after this immediate safety save we
      // queue one fresh full snapshot with the confirmed new setting.
      if (cloudSaveTimer.current) {
        window.clearTimeout(cloudSaveTimer.current);
        cloudSaveTimer.current = null;
      }
      pendingCloudState.current = null;
      setCloudSaveState("saving");
      try {
        const response = await fetch("/api/email/safety", {
          method: "PUT",
          credentials: "same-origin",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ settings: next, confirmLive: enablingLive })
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string; settings?: EmailSafetySettings; serverRevision?: number };
        if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Unable to save customer email safety mode.");
        const confirmed = payload.settings;
        if (typeof payload.serverRevision === "number") {
          serverRevisionRef.current = Math.max(serverRevisionRef.current, payload.serverRevision);
          persistenceRevision.current = Math.max(persistenceRevision.current, payload.serverRevision);
        }
        setEmailSafetySettings([confirmed]);
        persistStateNow({ emailSafetySettings: [confirmed] }, 0);
        setNotice(
          confirmed.mode === "live"
            ? "LIVE EMAIL MODE enabled. Real customer emails can now be sent."
            : confirmed.mode === "test"
              ? `TEST EMAIL MODE enabled. Only ${confirmed.testRecipients.length} approved test recipient${confirmed.testRecipients.length === 1 ? "" : "s"} may receive external email.`
              : "SHADOW EMAIL MODE enabled. External customer emails are blocked."
        );
      } catch (error) {
        setCloudSaveState("error");
        setNotice(error instanceof Error ? error.message : "Unable to save customer email safety mode.");
      }
      return;
    }

    setEmailSafetySettings([next]);
    persistStateNow({ emailSafetySettings: [next] }, 0);
    setNotice(
      next.mode === "live"
        ? "LIVE EMAIL MODE enabled. Real customer emails can now be sent."
        : next.mode === "test"
          ? `TEST EMAIL MODE enabled. Only ${next.testRecipients.length} approved test recipient${next.testRecipients.length === 1 ? "" : "s"} may receive external email.`
          : "SHADOW EMAIL MODE enabled. External customer emails are blocked."
    );
  }

  function resetEmailTemplates() {
    setEmailTemplates(cloneDemoValue(defaultEmailTemplates));
    setNotice("Default Gross Printing email templates restored.");
  }

  function makeOperationalActivity(
    input: Omit<OperationalActivity, "id" | "employeeId" | "employeeName" | "createdAt"> & {
      createdAt?: string;
      employeeId?: string;
      employeeName?: string;
    }
  ): OperationalActivity {
    return {
      ...input,
      id: makeId("activity"),
      employeeId: input.employeeId ?? currentEmployee.id,
      employeeName: input.employeeName ?? currentEmployee.name,
      createdAt: input.createdAt ?? nowIso()
    };
  }

  function invoicesWithJob(current: Invoice[], job: Job) {
    const invoiceId = job.invoiceId ?? `inv-${job.id}`;
    const existing = current.find((invoice) => invoice.id === invoiceId || invoice.jobId === job.id);
    const timestamp = nowIso();
    if (existing) {
      return current.map((invoice) =>
        invoice.id === existing.id
          ? {
              ...invoice,
              amount: job.pricing.total,
              title: job.title,
              status: ["Ready", "Sent", "Paid"].includes(invoice.status)
                ? invoice.status
                : "Draft" as const,
              updatedAt: timestamp
            }
          : invoice
      );
    }
    return [
      {
        id: invoiceId,
        invoiceNumber: nextPrefixedNumber(current.map((invoice) => invoice.invoiceNumber), "INV", 3009),
        jobId: job.id,
        customerId: job.customerId,
        customerName: job.customerName,
        title: job.title,
        amount: job.pricing.total,
        status: "Draft" as const,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      ...current
    ];
  }

  function invoicesWithOrder(current: Invoice[], order: PrintOrder, childJobs: Job[]) {
    const invoiceId = order.invoiceId ?? `inv-${order.id}`;
    const timestamp = nowIso();
    const lineItems: OrderLineItem[] = childJobs.map((job) => ({
      id: `invoice-line-${job.id}`,
      jobId: job.id,
      title: job.title,
      quantity: job.quantity,
      amount: job.pricing.total,
      description: `${job.pieceWidth} × ${job.pieceHeight} · ${job.colorSpec} · ${job.stockName}`
    }));
    const amount = lineItems.reduce((sum, line) => sum + line.amount, 0);
    const existing = current.find((invoice) => invoice.id === invoiceId || invoice.orderId === order.id);
    if (existing) {
      return current.map((invoice) => invoice.id === existing.id ? {
        ...invoice,
        orderId: order.id,
        jobId: childJobs[0]?.id ?? invoice.jobId,
        jobIds: childJobs.map((job) => job.id),
        lineItems,
        title: `${order.orderNumber} — ${order.title}`,
        amount,
        status: ["Ready", "Sent", "Paid"].includes(invoice.status) ? invoice.status : "Draft" as const,
        updatedAt: timestamp
      } : invoice);
    }
    return [{
      id: invoiceId,
      invoiceNumber: nextPrefixedNumber(current.map((invoice) => invoice.invoiceNumber), "INV", 3009),
      jobId: childJobs[0]?.id ?? order.id,
      orderId: order.id,
      jobIds: childJobs.map((job) => job.id),
      lineItems,
      customerId: order.customerId,
      customerName: order.customerName,
      title: `${order.orderNumber} — ${order.title}`,
      amount,
      status: "Draft" as const,
      createdAt: timestamp,
      updatedAt: timestamp
    }, ...current];
  }

  function syncInvoice(job: Job) {
    setInvoices((current) => invoicesWithJob(current, job));
  }

  function ensureInvoiceForJob(jobId: string) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) {
      setNotice("Job could not be found.");
      return;
    }
    const timestamp = nowIso();
    const parentOrder = job.orderId ? orders.find((order) => order.id === job.orderId) : undefined;
    const childJobs = parentOrder
      ? jobs.filter((item) => parentOrder.jobIds.includes(item.id) && !item.deletedAt)
      : [job];
    const invoiceId = parentOrder?.invoiceId ?? job.invoiceId ?? `inv-${parentOrder?.id ?? job.id}`;
    const nextJobs = jobs.map((item) =>
      childJobs.some((child) => child.id === item.id)
        ? {
            ...item,
            invoiceId,
            invoiceCreatedAt: item.invoiceCreatedAt ?? timestamp,
            updatedAt: timestamp
          }
        : item
    );
    const nextOrders = parentOrder
      ? orders.map((order) =>
          order.id === parentOrder.id
            ? { ...order, invoiceId, updatedAt: timestamp }
            : order
        )
      : orders;
    const nextInvoices = parentOrder
      ? invoicesWithOrder(invoices, { ...parentOrder, invoiceId }, childJobs)
      : invoicesWithJob(invoices, { ...job, invoiceId });
    const invoice = nextInvoices.find(
      (item) => item.id === invoiceId || item.orderId === parentOrder?.id || item.jobId === job.id
    );
    const activity = makeOperationalActivity({
      category: "invoice",
      action: invoice?.createdAt === invoice?.updatedAt ? "invoice_created" : "invoice_refreshed",
      description: parentOrder
        ? `${invoice?.invoiceNumber ?? "Invoice"} prepared as one draft invoice for ${parentOrder.orderNumber}.`
        : `${invoice?.invoiceNumber ?? "Invoice"} prepared as a draft for ${job.jobNumber}.`,
      customerId: job.customerId,
      customerName: job.customerName,
      jobId: job.id,
      jobNumber: job.jobNumber,
      invoiceId: invoice?.id,
      invoiceNumber: invoice?.invoiceNumber,
      toValue: "Draft",
      createdAt: timestamp,
      details: parentOrder ? { orderId: parentOrder.id, itemCount: childJobs.length } : undefined
    });
    const nextActivities = [activity, ...operationalActivities];
    persistStateNow(
      { jobs: nextJobs, orders: nextOrders, invoices: nextInvoices, operationalActivities: nextActivities },
      120
    );
    setJobs(nextJobs);
    if (nextOrders !== orders) setOrders(nextOrders);
    setInvoices(nextInvoices);
    setOperationalActivities(nextActivities);
    setFocusedInvoiceId(invoice?.id);
    setNotice(
      parentOrder
        ? `Draft invoice ${invoice?.invoiceNumber ?? ""} prepared for all ${childJobs.length} items in ${parentOrder.orderNumber}.`
        : `Draft invoice ${invoice?.invoiceNumber ?? ""} prepared for ${job.jobNumber}.`
    );
  }

  function markInvoiceReady(invoiceId: string) {
    const invoice = invoices.find((item) => item.id === invoiceId);
    const linkedJobIds = invoice
      ? invoice.jobIds?.length
        ? invoice.jobIds
        : [invoice.jobId]
      : [];
    const linkedJobs = jobs.filter((item) => linkedJobIds.includes(item.id));
    const job = linkedJobs[0];
    if (!invoice || !job) return;
    const timestamp = nowIso();
    const nextInvoices = invoices.map((item) =>
      item.id === invoiceId ? { ...item, status: "Ready" as const, updatedAt: timestamp } : item
    );
    const nextJobs = jobs.map((item) =>
      linkedJobIds.includes(item.id)
        ? {
            ...item,
            invoiceReviewedAt: timestamp,
            invoiceReviewedBy: currentEmployee.name,
            updatedAt: timestamp
          }
        : item
    );
    const nextOrders = invoice.orderId
      ? orders.map((order) =>
          order.id === invoice.orderId ? { ...order, invoiceId: invoice.id, updatedAt: timestamp } : order
        )
      : orders;
    const activity = makeOperationalActivity({
      category: "invoice",
      action: "invoice_reviewed",
      description: `${invoice.invoiceNumber} reviewed and marked ready to send${invoice.orderId ? ` for ${linkedJobs.length} order items` : ""}.`,
      customerId: job.customerId,
      customerName: job.customerName,
      jobId: job.id,
      jobNumber: job.jobNumber,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      fromValue: invoice.status,
      toValue: "Ready",
      createdAt: timestamp,
      details: invoice.orderId ? { orderId: invoice.orderId, itemCount: linkedJobs.length } : undefined
    });
    const nextActivities = [activity, ...operationalActivities];
    persistStateNow(
      { jobs: nextJobs, orders: nextOrders, invoices: nextInvoices, operationalActivities: nextActivities },
      120
    );
    setJobs(nextJobs);
    if (nextOrders !== orders) setOrders(nextOrders);
    setInvoices(nextInvoices);
    setOperationalActivities(nextActivities);
    setNotice(`${invoice.invoiceNumber} is ready to send.`);
  }

  async function notifyCustomerForJobStatus(
    job: Job,
    status: JobStatus,
    parentStatus?: PrintOrder["status"],
    parentOrderOverride?: PrintOrder
  ) {
    const customer = customers.find((item) => item.id === job.customerId);
    if (!customer) return;

    const parentOrder = parentOrderOverride ?? (job.orderId ? orders.find((order) => order.id === job.orderId) : undefined);
    const orderStatus = parentOrder
      ? parentStatus ?? deriveParentOrderStatus(parentOrder, jobs)
      : undefined;
    const notificationScope = parentOrder ?? job;
    if (notificationScope.customerEmailNotificationsEnabled === false || notificationScope.customerNotificationPath === "manual") return;
    let templateId: EmailTemplateKey | undefined;
    let notificationField: "customerProductionNotifiedAt" | "customerReadyNotifiedAt" | "customerCompletedNotifiedAt" | undefined;
    const alreadyNotified = parentOrder ?? job;

    if (["Prepress", "Printing", "Finishing"].includes(status) && !alreadyNotified.customerProductionNotifiedAt) {
      templateId = "job_in_production";
      notificationField = "customerProductionNotifiedAt";
    } else if (
      (parentOrder ? orderStatus === "Ready" : status === "Ready") &&
      !alreadyNotified.customerReadyNotifiedAt
    ) {
      templateId = "ready_pickup";
      notificationField = "customerReadyNotifiedAt";
    } else if (
      (parentOrder ? orderStatus === "Delivered" : status === "Delivered") &&
      !alreadyNotified.customerCompletedNotifiedAt
    ) {
      templateId = "job_completed";
      notificationField = "customerCompletedNotifiedAt";
    }
    if (!templateId || !notificationField) return;

    const customerFacingJob = parentOrder
      ? { ...job, jobNumber: parentOrder.orderNumber, title: parentOrder.title }
      : job;
    const linkedInvoice = parentOrder?.invoiceId
      ? invoices.find((item) => item.id === parentOrder.invoiceId || item.orderId === parentOrder.id)
      : job.invoiceId
        ? invoices.find((item) => item.id === job.invoiceId)
        : undefined;
    const sent = isValidEmail(customer.email)
      ? await sendTemplateEmail(templateId, {
          to: customer.email,
          entityId: parentOrder?.id ?? job.id,
          entityType: "job",
          customer,
          job: customerFacingJob,
          invoice: linkedInvoice,
          threadId: parentOrder?.sourceEmailThreadId ?? job.sourceEmailThreadId
        })
      : false;
    const timestamp = nowIso();

    if (parentOrder) {
      setOrders((current) =>
        current.map((order) =>
          order.id === parentOrder.id
            ? { ...order, ...(sent ? { [notificationField!]: timestamp } : {}), updatedAt: timestamp }
            : order
        )
      );
      if (sent) {
        setJobs((current) =>
          current.map((item) =>
            parentOrder.jobIds.includes(item.id)
              ? { ...item, [notificationField!]: timestamp, updatedAt: timestamp }
              : item
          )
        );
      }
    } else {
      setJobs((current) =>
        current.map((item) =>
          item.id === job.id
            ? { ...item, ...(sent ? { [notificationField!]: timestamp } : {}), updatedAt: timestamp }
            : item
        )
      );
    }

    setOperationalActivities((current) => [
      makeOperationalActivity({
        category: "email",
        action: sent ? "customer_status_notification_sent" : "customer_status_notification_not_sent",
        description: sent
          ? `${parentOrder?.orderNumber ?? job.jobNumber} customer ${templateId === "ready_pickup" ? "ready" : templateId === "job_completed" ? "completed" : "production"} notification sent.`
          : `${parentOrder?.orderNumber ?? job.jobNumber} status updated in the portal; email notification was not sent.`,
        customerId: customer.id,
        customerName: customer.name,
        jobId: job.id,
        jobNumber: parentOrder?.orderNumber ?? job.jobNumber,
        toValue: parentOrder ? orderStatus : status,
        details: { emailSent: sent, orderId: parentOrder?.id, itemCount: parentOrder?.jobIds.length },
        createdAt: timestamp
      }),
      ...current
    ]);
  }

  function moveJob(jobId: string, requestedStatus: JobStatus, targetIndex?: number) {
    if (requestedStatus === "Cancelled") {
      setNotice("Cancelled was removed from workflow. Use Archive or Trash from job details instead.");
      return;
    }

    const original = jobs.find((job) => job.id === jobId);
    if (!original) {
      setNotice("That job could not be found. Reload the workflow and try again.");
      return;
    }

    const hasProductionArtwork = Boolean(
      original.artworkName ||
      original.artworkPreview ||
      uploadedFiles.some((file) => file.jobId === jobId && !file.deletedAt)
    );
    if (original.status === "Prepress" && requestedStatus === "Printing" && !hasProductionArtwork) {
      setNotice(`${original.jobNumber} needs approved artwork before it can move to Printing.`);
      return;
    }

    const movedAt = nowIso();
    const placement = placeJobInWorkflow(jobs, jobId, requestedStatus, targetIndex, movedAt);
    if (!placement) {
      setNotice("That job could not be moved. Reload the workflow and try again.");
      return;
    }
    const { jobs: placedJobs, movedJob, sourceStatus, finalStatus, statusChanged } = placement;
    const parentOrder = original.orderId ? orders.find((order) => order.id === original.orderId) : undefined;
    const projectedOrderStatus = parentOrder ? deriveParentOrderStatus(parentOrder, placedJobs) : undefined;
    const orderReadyForInvoice = projectedOrderStatus === "Ready" || projectedOrderStatus === "Delivered";
    const existingInvoice = parentOrder
      ? invoices.find((invoice) => invoice.orderId === parentOrder.id || invoice.id === parentOrder.invoiceId)
      : invoices.find((invoice) => invoice.jobId === jobId || invoice.id === original.invoiceId);
    const invoiceId = existingInvoice?.id ?? parentOrder?.invoiceId ?? original.invoiceId ?? `inv-${parentOrder?.id ?? jobId}`;
    const shouldPrepareInvoice = statusChanged && (parentOrder ? orderReadyForInvoice : finalStatus === "Ready" || finalStatus === "Delivered");
    const nextJobs = placedJobs.map((job) =>
      shouldPrepareInvoice && (parentOrder ? parentOrder.jobIds.includes(job.id) : job.id === jobId)
        ? {
            ...job,
            invoiceId,
            invoiceCreatedAt: job.invoiceCreatedAt ?? movedAt,
            updatedAt: movedAt
          }
        : job
    );
    const movedLinkedJob = nextJobs.find((job) => job.id === jobId) ?? movedJob;
    const nextOrders = parentOrder
      ? orders.map((order) => order.id === parentOrder.id ? {
          ...order,
          status: projectedOrderStatus ?? order.status,
          invoiceId: shouldPrepareInvoice ? invoiceId : order.invoiceId,
          updatedAt: movedAt
        } : order)
      : orders;

    let nextStatusEvents = statusEvents;
    let eventToAdd: JobStatusEvent | undefined;
    if (statusChanged) {
      const latestEvent = statusEvents
        .filter((event) => event.jobId === original.id)
        .sort((a, b) => new Date(b.movedAt).getTime() - new Date(a.movedAt).getTime())[0];
      const enteredAt = latestEvent?.movedAt ?? original.createdAt;
      eventToAdd = {
        id: makeId("move"),
        jobId: original.id,
        fromStatus: sourceStatus,
        toStatus: finalStatus,
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
        movedAt,
        minutesInPreviousStatus: Math.max(
          0,
          Math.round((new Date(movedAt).getTime() - new Date(enteredAt).getTime()) / 60000)
        )
      };
      nextStatusEvents = [eventToAdd, ...statusEvents];
    }

    const nextQuotes = statusChanged && (requestedStatus === "Approved" || finalStatus === "Prepress")
      ? quotes.map((quote) => (quote.jobId === jobId ? { ...quote, status: "Approved" as const } : quote))
      : quotes;
    const orderJobsForInvoice = parentOrder
      ? nextJobs.filter((job) => parentOrder.jobIds.includes(job.id) && job.status !== "Cancelled")
      : [];
    const nextInvoices = shouldPrepareInvoice
      ? parentOrder
        ? invoicesWithOrder(invoices, { ...parentOrder, invoiceId }, orderJobsForInvoice)
        : invoicesWithJob(invoices, movedLinkedJob)
      : invoices;
    const invoice = shouldPrepareInvoice
      ? nextInvoices.find((item) => item.jobId === jobId || item.id === invoiceId)
      : undefined;
    const movementActivity = statusChanged
      ? makeOperationalActivity({
          category: "job",
          action: "status_changed",
          description: `${original.jobNumber} moved from ${sourceStatus} to ${finalStatus}.`,
          customerId: original.customerId,
          customerName: original.customerName,
          jobId: original.id,
          jobNumber: original.jobNumber,
          fromValue: sourceStatus,
          toValue: finalStatus,
          createdAt: movedAt,
          details: { minutesInPreviousStatus: eventToAdd?.minutesInPreviousStatus ?? 0 }
        })
      : undefined;
    const invoiceActivity = shouldPrepareInvoice && invoice
      ? makeOperationalActivity({
          category: "invoice",
          action: existingInvoice ? "invoice_refreshed" : "invoice_created",
          description: parentOrder
            ? `${invoice.invoiceNumber} prepared for ${parentOrder.orderNumber} after all ${parentOrder.jobIds.length} jobs became ready.`
            : `${invoice.invoiceNumber} prepared as a draft when ${original.jobNumber} reached ${finalStatus}.`,
          customerId: original.customerId,
          customerName: original.customerName,
          jobId: original.id,
          jobNumber: original.jobNumber,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          toValue: invoice.status,
          createdAt: movedAt
        })
      : undefined;
    const nextActivities = [movementActivity, invoiceActivity, ...operationalActivities]
      .filter((item): item is OperationalActivity => Boolean(item));

    persistStateNow(
      {
        jobs: nextJobs,
        orders: nextOrders,
        statusEvents: nextStatusEvents,
        quotes: nextQuotes,
        invoices: nextInvoices,
        operationalActivities: nextActivities
      },
      120
    );
    setJobs(nextJobs);
    if (nextOrders !== orders) setOrders(nextOrders);
    if (nextStatusEvents !== statusEvents) setStatusEvents(nextStatusEvents);
    if (nextQuotes !== quotes) setQuotes(nextQuotes);
    if (nextInvoices !== invoices) setInvoices(nextInvoices);
    setOperationalActivities(nextActivities);

    if (shouldPrepareInvoice && invoice && !["Sent", "Paid"].includes(invoice.status)) {
      setCompletionPrompt({ jobId, invoiceId: invoice.id });
    }
    if (statusChanged) void notifyCustomerForJobStatus(movedLinkedJob, finalStatus, projectedOrderStatus);
    if (statusChanged && sourceStatus === "Quote" && finalStatus !== "Quote") {
      const learningTicket = movedLinkedJob.intakeTicketId
        ? emailIntakeTickets.find((ticket) => ticket.id === movedLinkedJob.intakeTicketId)
        : undefined;
      const attachmentNames = learningTicket
        ? emailSourceAttachmentsForTicket(learningTicket).map((attachment) => attachment.filename)
        : [];
      learnApprovedJob(movedLinkedJob, movedLinkedJob.orderId ? "approved_multi_item" : "approved_job", learningTicket, attachmentNames);
    }

    if (!statusChanged) {
      setNotice(`${original.jobNumber} order saved.`);
    } else if (shouldPrepareInvoice) {
      setNotice(parentOrder
        ? `Moved ${original.jobNumber} to ${finalStatus}. All items in ${parentOrder.orderNumber} are ready and draft invoice ${invoice?.invoiceNumber ?? ""} was prepared.`
        : `Moved ${original.jobNumber} to ${finalStatus}. Draft invoice ${invoice?.invoiceNumber ?? ""} prepared.`);
    } else {
      setNotice(`Moved ${original.jobNumber} to ${finalStatus}.`);
    }
  }

  function editJob(jobId: string) {
    runWithLeaveGuard(() => {
      setEditingJobId(jobId);
      setSelectedJobId(null);
      activateView("New Estimate / Job");
      setNotice("Job loaded into the edit setup form.");
    });
  }

  function linkedPortalFileForRequest(
    request: CustomerPortalRequest,
    customer: Customer,
    jobId: string,
    jobNumber: string,
    createdAt: string
  ): UploadedFile | undefined {
    if (!request.fileName) return undefined;
    if (uploadedFiles.some((file) => file.sourcePortalRequestId === request.id)) {
      return undefined;
    }
    const metadata = request.metadata ?? {};
    const mimeType =
      typeof metadata.mimeType === "string"
        ? metadata.mimeType
        : request.fileName.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/octet-stream";
    const productionFile = mimeType.startsWith("image/") || mimeType === "application/pdf";
    return {
      id: makeId("file"),
      name: request.fileName,
      folder: productionFile ? "Active Artwork" : "Customer Files",
      customerId: customer.id,
      customerName: customer.name,
      jobId,
      jobNumber,
      size: typeof metadata.size === "number" ? metadata.size : 0,
      type: mimeType,
      uploadedAt: createdAt,
      status: "Linked",
      sourceProvider: "customer_portal",
      sourcePortalRequestId: request.id,
      storagePath: request.storagePath,
      storageBucket: "customer-portal-files"
    };
  }

  async function finalizePortalRequestConversion(input: {
    request: CustomerPortalRequest;
    jobId: string;
    quoteId?: string;
    recordNumber: string;
    conversionKind: "quote" | "job" | "existing_job";
  }) {
    const convertedAt = nowIso();
    const optimistic: CustomerPortalRequest = {
      ...input.request,
      status: "Converted",
      jobId: input.jobId,
      quoteId: input.quoteId,
      convertedAt,
      convertedBy: currentEmployee.name,
      convertedRecordNumber: input.recordNumber,
      conversionKind: input.conversionKind,
      notificationReadAt: convertedAt,
      notificationReadBy: currentEmployee.name,
      updatedAt: convertedAt
    };
    setPortalRequests((current) =>
      current.map((request) => (request.id === input.request.id ? optimistic : request))
    );
    try {
      const response = await fetch("/api/customer-portal/admin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          action: "conversion",
          requestId: input.request.id,
          status: "Converted",
          jobId: input.jobId,
          quoteId: input.quoteId,
          convertedAt,
          convertedBy: currentEmployee.name,
          convertedRecordNumber: input.recordNumber,
          conversionKind: input.conversionKind,
          notificationReadAt: convertedAt,
          notificationReadBy: currentEmployee.name
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        request?: CustomerPortalRequest;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Portal request conversion could not be saved.");
      if (payload.request) {
        setPortalRequests((current) =>
          current.map((request) => (request.id === input.request.id ? payload.request! : request))
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Portal request conversion could not be saved.");
    }
  }

  async function linkPortalRequestToExistingJob(request: CustomerPortalRequest, jobId: string) {
    const job = jobs.find((item) => item.id === jobId);
    const customer = job ? customers.find((item) => item.id === job.customerId) : undefined;
    if (!job || !customer) {
      setNotice("The existing job or customer could not be found.");
      return;
    }
    if (request.status === "Converted") {
      setNotice(`${request.requestNumber ?? "Portal request"} was already converted.`);
      return;
    }
    const linkedAt = nowIso();
    const linkedFile = linkedPortalFileForRequest(request, customer, job.id, job.jobNumber, linkedAt);
    if (linkedFile) {
      setUploadedFiles((current) => [linkedFile, ...current]);
      setCustomers((current) =>
        current.map((item) =>
          item.id === customer.id
            ? { ...item, attachments: (item.attachments ?? 0) + 1 }
            : item
        )
      );
    }
    setJobs((current) =>
      current.map((item) =>
        item.id === job.id
          ? {
              ...item,
              portalRequestId: request.id,
              artworkName: item.artworkName ?? linkedFile?.name,
              updatedAt: linkedAt
            }
          : item
      )
    );
    await finalizePortalRequestConversion({
      request,
      jobId: job.id,
      quoteId: job.quoteId,
      recordNumber: job.jobNumber,
      conversionKind: "existing_job"
    });
    activateView("Workflow");
    setSelectedJobId(job.id);
    setNotice(`${request.requestNumber ?? "Portal request"} linked to ${job.jobNumber} and moved to Converted history.`);
  }

  async function createMultiItemOrderFromEmail(
    ticketId: string,
    analysis: AiOrderSplitResult,
    mode: "quote" | "job"
  ) {
    const ticket = emailIntakeTickets.find((item) => item.id === ticketId);
    const customer = ticket?.customerId
      ? customers.find((item) => item.id === ticket.customerId)
      : undefined;
    const thread = ticket ? emailThreads.find((item) => item.id === ticket.threadId) : undefined;
    if (!ticket || !customer || !thread) {
      setNotice("Match the email ticket to a customer before creating a multi-item order.");
      return;
    }
    if (ticket.status === "Converted" || ticket.orderId || ticket.jobId || ticket.quoteId) {
      setNotice(`${ticket.ticketNumber ?? "Email ticket"} was already converted.`);
      return;
    }
    const unresolvedArtwork = ticket.artworkPreflight?.filter((item) => item.severity === "warning" && !item.approved) ?? [];
    if (unresolvedArtwork.length) {
      setNotice(`Review the artwork proportion warning${unresolvedArtwork.length === 1 ? "" : "s"} before creating the order.`);
      return;
    }
    if (!analysis.items.length) {
      setNotice("Add at least one finished product before creating the order.");
      return;
    }
    const incompleteItem = analysis.items.find((item) =>
      !item.title.trim() ||
      !item.productCategory?.trim() ||
      !item.quantity ||
      !item.finishedWidth ||
      !item.finishedHeight ||
      !item.sides ||
      !item.colorSpec?.trim() ||
      !item.stockId ||
      !item.stockConfirmed ||
      item.missingInformation.length > 0 ||
      (mode === "job" && !item.dueDate?.trim())
    );
    if (incompleteItem) {
      setNotice(
        mode === "job"
          ? `Complete product, quantity, size, sides, print, staff-confirmed stock, due date, and every Needs confirmation item for ${incompleteItem.title || "every item"}.`
          : `Complete product, quantity, size, sides, print, staff-confirmed stock, and every Needs confirmation item for ${incompleteItem.title || "every item"}.`
      );
      return;
    }
    const assignedAttachmentIds = [
      ...analysis.items.flatMap((item) => item.attachmentIds),
      ...analysis.generalAttachmentIds
    ];
    if (new Set(assignedAttachmentIds).size !== assignedAttachmentIds.length) {
      setNotice("Each attachment must belong to only one product or to General order files.");
      return;
    }
    const missingAttachment = ticket.attachmentIds.find((id) => !assignedAttachmentIds.includes(id));
    if (missingAttachment) {
      setNotice("Assign every email attachment to a product or to General order files before creating the order.");
      return;
    }

    const allAttachments = thread.messages.flatMap((message) =>
      message.attachments.map((attachment) => ({ message, attachment }))
    );
    const attachmentById = new Map(allAttachments.map((entry) => [entry.attachment.id, entry]));
    const createdAt = nowIso();
    const orderId = makeId("order");
    const orderNumber = nextPrefixedNumber(orders.map((order) => order.orderNumber), "OR", 1001);
    const quoteId = mode === "quote" ? makeId("quote") : undefined;
    const quoteNumber = quoteId
      ? nextPrefixedNumber(quotes.map((quote) => quote.quoteNumber), "Q", 2043)
      : undefined;

    const sourceItems: OrderItemSuggestion[] =
      analysis.recommendedMode === "single_job" && analysis.items.length === 1
        ? [{
            ...analysis.items[0],
            id: `combined-${analysis.items[0].id}`,
            title: analysis.items[0].title || ticket.subject,
            attachmentIds: Array.from(new Set(analysis.items.flatMap((item) => item.attachmentIds))),
            notes: analysis.items.map((item) => `${item.title}: ${item.notes ?? ""}`.trim()).join("\n"),
            missingInformation: Array.from(new Set(analysis.items.flatMap((item) => item.missingInformation))),
            warnings: Array.from(new Set(analysis.items.flatMap((item) => item.warnings)))
          }]
        : analysis.items;

    let nextJobNumberSeed = jobs.map((job) => job.jobNumber);
    const newJobs: Job[] = [];
    const newFiles: UploadedFile[] = [];
    const lineItems: OrderLineItem[] = [];
    const newStatusEvents: JobStatusEvent[] = [];
    const newActivities: OperationalActivity[] = [];

    for (const item of sourceItems) {
      const quantity = item.quantity ?? 1;
      const width = item.finishedWidth ?? 8.5;
      const height = item.finishedHeight ?? 11;
      const sides = item.sides ?? 1;
      const colorSpec = item.colorSpec ?? (sides === 2 ? "4/4 full color" : "4/0 full color");
      const stock = item.stockId ? paperStocks.find((paper) => paper.id === item.stockId) : undefined;
      if (!stock) {
        setNotice(`Choose a confirmed paper stock for ${item.title || "every production item"} before creating the order.`);
        return;
      }

      const jobId = makeId("job");
      const jobNumber = nextPrefixedNumber(nextJobNumberSeed, "GP", 1052, numberingSettings.nextJobNumber);
      nextJobNumberSeed = [...nextJobNumberSeed, jobNumber];
      const initialBindery = item.finishing ?? [];
      const baseForm: EstimateFormData = {
        customerId: customer.id,
        title: item.title,
        quantity,
        pieceWidth: width,
        pieceHeight: height,
        dueDate: item.dueDate ?? ticket.dueDate ?? "",
        dueTime: item.dueTime ?? ticket.dueTime ?? "17:00",
        stockId: stock.id,
        colorSpec,
        sides,
        bindery: initialBindery,
        orderSource: "Email",
        customerReference: ticket.ticketNumber,
        sourceEmailThreadId: ticket.threadId,
        sourceEmailMessageId: ticket.messageId,
        intakeTicketId: ticket.id,
        orderId,
        cuttingMode: "auto",
        booklet: emptyBookletSetup(stock.id)
      };
      const preliminary = calculateImposition(stock, quantity, width, height, multiItemImpositionSettings());
      const parentMatches =
        Math.abs(Math.min(width, height) - Math.min(stock.sheetWidth, stock.sheetHeight)) <= 0.05 &&
        Math.abs(Math.max(width, height) - Math.max(stock.sheetWidth, stock.sheetHeight)) <= 0.05;
      const noNormalCut =
        item.productCategory === "Envelopes" ||
        item.productCategory === "Signs & Banners" ||
        item.productCategory === "Labels & Stickers" && item.productName?.toLowerCase().includes("roll");
      const bindery = !noNormalCut && (!parentMatches || preliminary.piecesPerSheet > 1)
        ? Array.from(new Set([...initialBindery, "Cut to size"]))
        : initialBindery;
      const form = { ...baseForm, bindery };
      const imposition = calculateImposition(stock, quantity, width, height, multiItemImpositionSettings());
      const pricing = calculateEstimatePricing(
        form,
        stock,
        imposition,
        paperStocks.find((paper) => paper.kind === "cover") ?? stock,
        catalogPrices,
        quantityRateCurve
      );
      const assignedEntries = item.attachmentIds
        .map((id) => attachmentById.get(id))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      const artwork = assignedEntries.find(({ attachment }) =>
        attachment.mimeType === "application/pdf" || attachment.mimeType.startsWith("image/")
      );
      const job: Job = {
        id: jobId,
        jobNumber,
        orderId,
        title: item.title,
        customerId: customer.id,
        customerName: customer.name,
        status: mode === "job" ? "Prepress" : "Quote",
        quantity,
        pieceWidth: width,
        pieceHeight: height,
        dueDate: form.dueDate,
        dueTime: form.dueTime,
        rush: isRushDue(form.dueDate, form.dueTime),
        stockId: stock.id,
        stockName: stock.name,
        colorSpec,
        sides,
        bindery,
        orderSource: "Email",
        customerReference: ticket.ticketNumber,
        customerEmailNotificationsEnabled: true,
        customerNotificationPath: mode === "quote" ? "quote_then_status" : "direct_job",
        sourceEmailThreadId: ticket.threadId,
        sourceEmailMessageId: ticket.messageId,
        emailThreadIds: [ticket.threadId],
        intakeTicketId: ticket.id,
        cuttingMode: "auto",
        notes: item.notes,
        artworkName: artwork?.attachment.filename,
        quoteId,
        booklet: form.booklet,
        time: { prepress: 0, printingSetup: 0, printingRun: 0, finishing: 0 },
        pricing,
        createdAt,
        updatedAt: createdAt
      };
      newJobs.push(job);
      lineItems.push({
        id: makeId("line"),
        jobId,
        title: item.title,
        quantity,
        amount: pricing.total,
        description: `${width} × ${height} · ${colorSpec} · ${stock.name} · ${bindery.join(", ") || "standard production"}`
      });
      newStatusEvents.push({
        id: makeId("move"),
        jobId,
        toStatus: job.status,
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
        movedAt: createdAt,
        minutesInPreviousStatus: 0,
        note: `${orderNumber} item created from ${ticket.ticketNumber ?? "email ticket"}.`
      });
      newActivities.push(makeOperationalActivity({
        category: mode === "quote" ? "quote" : "job",
        action: "order_item_created",
        description: `${jobNumber} created as an item under ${orderNumber}.`,
        customerId: customer.id,
        customerName: customer.name,
        jobId,
        jobNumber,
        quoteId,
        quoteNumber,
        toValue: job.status,
        createdAt,
        details: { orderNumber, itemCount: sourceItems.length }
      }));

      for (const { message, attachment } of assignedEntries) {
        if (newFiles.some((file) => file.sourceEmailAttachmentId === attachment.id)) continue;
        const source = sourceAttachmentRefs(message).find((item) => item.id === attachment.id);
        if (!source) {
          setNotice(`Refresh Email Center before converting: ${attachment.filename} is missing its mailbox source identity.`);
          return;
        }
        try {
          const file = await persistEmailAttachmentRef(source, customer, jobId, jobNumber, createdAt, { id: orderId, number: orderNumber });
          file.sourceEmailThreadId = ticket.threadId;
          newFiles.push(file);
        } catch (error) {
          setNotice(`${error instanceof Error ? error.message : "Unable to preserve email artwork."} The order was not created.`);
          return;
        }
      }
    }

    if (!newJobs.length) {
      setNotice("The order could not be created because no usable paper stock was available.");
      return;
    }

    for (const attachmentId of analysis.generalAttachmentIds) {
      const entry = attachmentById.get(attachmentId);
      if (!entry || newFiles.some((file) => file.sourceEmailAttachmentId === attachmentId)) continue;
      const source = sourceAttachmentRefs(entry.message).find((item) => item.id === entry.attachment.id);
      const storageJob = newJobs[0];
      if (!source || !storageJob) {
        setNotice(`Refresh Email Center before converting: ${entry.attachment.filename} is missing its mailbox source identity.`);
        return;
      }
      try {
        const file = await persistEmailAttachmentRef(source, customer, storageJob.id, storageJob.jobNumber, createdAt, { id: orderId, number: orderNumber });
        file.folder = "Customer Files";
        file.jobId = undefined;
        file.jobNumber = undefined;
        file.sourceEmailThreadId = ticket.threadId;
        newFiles.push(file);
      } catch (error) {
        setNotice(`${error instanceof Error ? error.message : "Unable to preserve email file."} The order was not created.`);
        return;
      }
    }

    const amount = lineItems.reduce((sum, line) => sum + line.amount, 0);
    const quote: Quote | undefined = quoteId && quoteNumber
      ? {
          id: quoteId,
          quoteNumber,
          jobId: newJobs[0].id,
          orderId,
          jobIds: newJobs.map((job) => job.id),
          lineItems,
          customerId: customer.id,
          customerName: customer.name,
          title: `${orderNumber} — ${ticket.subject}`,
          amount,
          status: "Draft",
          createdAt
        }
      : undefined;
    const order: PrintOrder = {
      id: orderId,
      orderNumber,
      customerId: customer.id,
      customerName: customer.name,
      title: ticket.subject,
      status: mode === "quote" ? "Quote" : "In production",
      source: "Email",
      sourceEmailThreadId: ticket.threadId,
      intakeTicketId: ticket.id,
      customerReference: ticket.ticketNumber,
      customerEmailNotificationsEnabled: true,
      customerNotificationPath: mode === "quote" ? "quote_then_status" : "direct_job",
      dueDate: newJobs.every((job) => job.dueDate === newJobs[0].dueDate) ? newJobs[0].dueDate : undefined,
      dueTime: newJobs.every((job) => job.dueTime === newJobs[0].dueTime) ? newJobs[0].dueTime : undefined,
      jobIds: newJobs.map((job) => job.id),
      quoteId,
      overallNote: analysis.summary,
      createdAt,
      updatedAt: createdAt
    };

    const updatedTicket: EmailIntakeTicket = {
      ...ticket,
      status: "Converted",
      orderId,
      jobId: newJobs[0].id,
      quoteId,
      convertedAt: createdAt,
      convertedBy: currentEmployee.name,
      conversionKind: mode,
      convertedRecordNumber: orderNumber,
      splitAnalysis: analysis,
      sourceAttachmentFileIds: newFiles.map((file) => file.id),
      updatedAt: createdAt,
      history: [{
        id: makeId("ticket-event"),
        status: "Converted",
        createdAt,
        employeeName: currentEmployee.name,
        note: `Converted to ${orderNumber} with ${newJobs.length} production job${newJobs.length === 1 ? "" : "s"}.`
      }, ...(ticket.history ?? [])]
    };

    setOrders((current) => [order, ...current]);
    setJobs((current) => [...newJobs, ...current]);
    if (numberingSettings.nextJobNumber) {
      const nextJobNumber = nextNumberAfter(newJobs.at(-1)?.jobNumber);
      if (nextJobNumber) setNumberingSettings((current) => ({ ...current, nextJobNumber, updatedAt: createdAt, updatedBy: currentEmployee.name }));
    }
    if (mode === "job") {
      newJobs.forEach((job, index) => {
        const sourceItem = sourceItems[index];
        const attachmentNames = (sourceItem?.attachmentIds ?? [])
          .map((id) => attachmentById.get(id)?.attachment.filename)
          .filter((value): value is string => Boolean(value));
        learnApprovedJob(job, "approved_multi_item", ticket, attachmentNames);
      });
    }
    if (quote) setQuotes((current) => [quote, ...current]);
    setUploadedFiles((current) => [...newFiles, ...current]);
    setStatusEvents((current) => [...newStatusEvents, ...current]);
    setOperationalActivities((current) => [
      makeOperationalActivity({
        category: "job",
        action: "parent_order_created",
        description: `${orderNumber} created with ${newJobs.length} production item${newJobs.length === 1 ? "" : "s"}.`,
        customerId: customer.id,
        customerName: customer.name,
        jobId: newJobs[0].id,
        jobNumber: newJobs[0].jobNumber,
        quoteId,
        quoteNumber,
        createdAt,
        details: { orderNumber, itemCount: newJobs.length, total: amount }
      }),
      ...newActivities,
      ...current
    ]);
    setEmailIntakeTickets((current) => current.map((item) => item.id === ticket.id ? updatedTicket : item));
    setEmailThreads((current) => current.map((item) => item.id === ticket.threadId
      ? { ...item, customerId: customer.id, jobId: newJobs[0].id, quoteId }
      : item));
    setCustomers((current) => current.map((item) => item.id === customer.id
      ? { ...item, attachments: (item.attachments ?? 0) + newFiles.length }
      : item));
    if (mode === "job") {
      void notifyCustomerForJobStatus(newJobs[0], "Prepress", "In production", order);
    }
    activateView("Orders");
    setNotice(`${orderNumber} created with ${newJobs.length} job${newJobs.length === 1 ? "" : "s"}${quoteNumber ? ` and quote ${quoteNumber}` : ""}.`);
  }

  async function persistEmailAttachmentRef(
    source: EmailSourceAttachmentRef,
    customer: Customer,
    jobId: string,
    jobNumber: string,
    createdAt: string,
    order?: { id: string; number: string }
  ): Promise<UploadedFile> {
    const existing = uploadedFiles.find((file) =>
      file.sourceProvider === "gmail" &&
      file.sourceEmailAttachmentId === source.id &&
      Boolean(file.storagePath)
    );
    if (existing?.storagePath) {
      return {
        ...existing,
        id: makeId("file"),
        customerId: customer.id,
        customerName: customer.name,
        jobId,
        jobNumber,
        orderId: order?.id,
        orderNumber: order?.number,
        uploadedAt: createdAt,
        status: "Linked"
      };
    }
    if (DEMO_MODE) {
      return {
        id: makeId("file"),
        name: source.filename,
        folder: source.mimeType.startsWith("image/") || source.mimeType === "application/pdf" ? "Active Artwork" : "Customer Files",
        customerId: customer.id,
        customerName: customer.name,
        jobId,
        jobNumber,
        orderId: order?.id,
        orderNumber: order?.number,
        size: source.size,
        type: source.mimeType || "application/octet-stream",
        uploadedAt: createdAt,
        status: "Linked",
        sourceProvider: "gmail",
        sourceEmailThreadId: undefined,
        sourceEmailMessageId: source.messageId,
        sourceEmailAttachmentId: source.id,
        sourceEmailMailbox: source.mailboxName,
        sourceEmailUidValidity: source.uidValidity
      };
    }
    if (!authToken || !source.providerMessageId || !source.providerAttachmentId || !source.uidValidity || !/^\d+$/.test(source.uidValidity)) {
      throw new Error(`Cannot preserve ${source.filename}: the mailbox source identity is incomplete. Refresh Email Center and reopen the ticket.`);
    }

    const response = await fetch("/api/email/artwork", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        messageId: source.providerMessageId,
        attachmentId: source.providerAttachmentId,
        folder: source.mailboxFolder === "sent" ? "sent" : "inbox",
        uidValidity: source.uidValidity,
        filename: source.filename,
        mimeType: source.mimeType,
        mailboxName: source.mailboxName,
        jobId,
        jobNumber,
        customerId: customer.id,
        sourceMessageId: source.messageId
      })
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      filename?: string;
      mimeType?: string;
      size?: number;
      storagePath?: string;
      storageBucket?: string;
      checksumSha256?: string;
      mailboxName?: string;
      uidValidity?: string;
      persistedAt?: string;
    };
    if (!response.ok || !payload.storagePath) {
      throw new Error(payload.error ?? `Unable to preserve ${source.filename} as durable job artwork.`);
    }
    const mimeType = payload.mimeType || source.mimeType || "application/octet-stream";
    return {
      id: makeId("file"),
      name: payload.filename || source.filename,
      folder: mimeType.startsWith("image/") || mimeType === "application/pdf" ? "Active Artwork" : "Customer Files",
      customerId: customer.id,
      customerName: customer.name,
      jobId,
      jobNumber,
      orderId: order?.id,
      orderNumber: order?.number,
      size: payload.size ?? source.size,
      type: mimeType,
      uploadedAt: createdAt,
      status: "Linked",
      storagePath: payload.storagePath,
      storageBucket: payload.storageBucket || "mis-files",
      sourceProvider: "gmail",
      sourceEmailThreadId: undefined,
      sourceEmailMessageId: source.messageId,
      sourceEmailAttachmentId: source.id,
      sourceEmailMailbox: payload.mailboxName || source.mailboxName,
      sourceEmailUidValidity: payload.uidValidity || source.uidValidity,
      checksumSha256: payload.checksumSha256,
      persistedFromEmailAt: payload.persistedAt || createdAt
    };
  }

  async function linkedEmailFilesForTicket(
    ticket: EmailIntakeTicket,
    customer: Customer,
    jobId: string,
    jobNumber: string,
    createdAt: string,
    requestedAttachmentIds?: string[],
    order?: { id: string; number: string }
  ): Promise<UploadedFile[]> {
    const requested = new Set(requestedAttachmentIds?.length ? requestedAttachmentIds : ticket.attachmentIds);
    const sources = emailSourceAttachmentsForTicket(ticket).filter((source) => requested.has(source.id));
    const files: UploadedFile[] = [];
    for (const source of sources) {
      const file = await persistEmailAttachmentRef(source, customer, jobId, jobNumber, createdAt, order);
      file.sourceEmailThreadId = ticket.threadId;
      files.push(file);
    }
    return files;
  }

  async function createEstimate(data: EstimateFormData, intent: EstimateIntent, pricing: JobPricing, artworkFile?: File) {
    const customer = customers.find((item) => item.id === data.customerId);
    const stock = paperStocks.find((paper) => paper.id === data.stockId);
    if (!customer) {
      setNotice("Choose a customer before saving or sending this estimate.");
      return;
    }
    if (!stock) {
      setNotice("Choose a paper stock before saving or sending this estimate.");
      return;
    }
    if ((intent === "sendQuote" || intent === "createJobEmail") && !isValidEmail(customer.email)) {
      setNotice(`${customer.name} needs a valid email address before this can be emailed.`);
      return;
    }

    const sourceTicket = data.intakeTicketId
      ? emailIntakeTickets.find((ticket) => ticket.id === data.intakeTicketId)
      : undefined;
    const sourcePortalRequest = data.portalRequestId
      ? portalRequests.find((request) => request.id === data.portalRequestId) ?? activePortalRequest
      : undefined;
    if (data.intakeTicketId && !sourceTicket) {
      setNotice("The source email ticket could not be found. Return to Email Center and reopen it.");
      return;
    }
    if (data.portalRequestId && !sourcePortalRequest) {
      setNotice("The source Portal Request could not be found. Return to Portal Requests and reopen it.");
      return;
    }
    if (sourcePortalRequest?.status === "Converted") {
      setNotice(
        `${sourcePortalRequest.requestNumber ?? "Portal request"} was already converted${
          sourcePortalRequest.convertedRecordNumber
            ? ` to ${sourcePortalRequest.convertedRecordNumber}`
            : ""
        }.`
      );
      return;
    }
    if (
      sourceTicket &&
      (sourceTicket.status === "Converted" ||
        sourceTicket.jobId ||
        sourceTicket.quoteId ||
        convertingTicketIdsRef.current.has(sourceTicket.id))
    ) {
      setNotice(
        `This ticket was already converted${
          sourceTicket.convertedRecordNumber ? ` to ${sourceTicket.convertedRecordNumber}` : ""
        }.`
      );
      return;
    }
    if (sourceTicket) {
      // Lock this ticket in-memory before the async artwork copy so a double-click
      // cannot create two records. Do not mutate ticket history or clear the draft
      // until every required source attachment has been preserved successfully.
      convertingTicketIdsRef.current.add(sourceTicket.id);
    }

    const createdAt = nowIso();
    const jobId = makeId("job");
    const createsProductionJob = intent === "createJob" || intent === "createJobEmail";
    const quoteId = createsProductionJob ? undefined : makeId("quote");
    const reservedJobNumber = data.reservedJobNumber?.trim();
    const jobNumber = createsProductionJob && reservedJobNumber && !jobs.some((job) => job.jobNumber === reservedJobNumber)
      ? reservedJobNumber
      : nextPrefixedNumber(jobs.map((job) => job.jobNumber), "GP", 1052, numberingSettings.nextJobNumber);
    const quoteNumber = quoteId ? nextPrefixedNumber(quotes.map((quote) => quote.quoteNumber), "Q", 2043) : undefined;
    let linkedEmailFiles: UploadedFile[] = [];
    if (sourceTicket) {
      try {
        linkedEmailFiles = await linkedEmailFilesForTicket(sourceTicket, customer, jobId, jobNumber, createdAt);
      } catch (error) {
        convertingTicketIdsRef.current.delete(sourceTicket.id);
        const message = error instanceof Error ? error.message : "Unable to preserve email artwork.";
        setNotice(`${message} The job was not created, so no production file can be lost.`);
        return false;
      }
    }
    if (sourceTicket) {
      const conversionStartedAt = nowIso();
      setEmailIntakeTickets((current) =>
        current.map((ticket) =>
          ticket.id === sourceTicket.id
            ? {
                ...ticket,
                conversionStartedAt,
                updatedAt: conversionStartedAt,
                history: [
                  {
                    id: makeId("ticket-event"),
                    status: ticket.status,
                    createdAt: conversionStartedAt,
                    employeeName: currentEmployee.name,
                    note: `Conversion started as ${
                      intent === "createJob" || intent === "createJobEmail"
                        ? "a production job"
                        : "a quote"
                    }.`
                  },
                  ...(ticket.history ?? [])
                ]
              }
            : ticket
        )
      );
    }
    setEstimateDirty(false);
    window.localStorage.removeItem(ESTIMATE_DRAFT_STORAGE_KEY);

    const linkedPortalFile = sourcePortalRequest
      ? linkedPortalFileForRequest(sourcePortalRequest, customer, jobId, jobNumber, createdAt)
      : undefined;
    const sourceArtworkFile =
      linkedEmailFiles.find(
        (file) => file.type.startsWith("image/") || file.type === "application/pdf"
      ) ??
      (linkedPortalFile &&
      (linkedPortalFile.type.startsWith("image/") || linkedPortalFile.type === "application/pdf")
        ? linkedPortalFile
        : undefined);
    const job: Job = {
      id: jobId,
      jobNumber,
      title: data.title,
      customerId: customer.id,
      customerName: customer.name,
      status: createsProductionJob ? "Prepress" : "Quote",
      quantity: data.quantity,
      pieceWidth: data.pieceWidth,
      pieceHeight: data.pieceHeight,
      dueDate: data.dueDate,
      dueTime: data.dueTime,
      rush: isRushDue(data.dueDate, data.dueTime),
      stockId: stock.id,
      stockName: stock.name,
      colorSpec: data.colorSpec,
      sides: data.sides,
      bindery: data.bindery,
      orderSource: data.orderSource,
      customerReference: data.customerReference,
      customerEmailNotificationsEnabled: true,
      customerNotificationPath: quoteId ? "quote_then_status" : "direct_job",
      sourceEmailThreadId: data.sourceEmailThreadId,
      sourceEmailMessageId: data.sourceEmailMessageId,
      emailThreadIds: data.sourceEmailThreadId ? [data.sourceEmailThreadId] : [],
      intakeTicketId: data.intakeTicketId,
      portalRequestId: data.portalRequestId,
      orderId: data.orderId,
      cuttingMode: data.cuttingMode,
      artworkName: data.artworkName || sourceArtworkFile?.name,
      artworkPreview: data.artworkPreview,
      quoteId,
      booklet: data.booklet,
      time: { prepress: 0, printingSetup: 0, printingRun: 0, finishing: 0 },
      pricing,
      createdAt,
      updatedAt: createdAt
    };
    setJobs((current) => [job, ...current]);
    if (createsProductionJob && numberingSettings.nextJobNumber) {
      const nextJobNumber = nextNumberAfter(job.jobNumber);
      if (nextJobNumber) setNumberingSettings((current) => ({ ...current, nextJobNumber, updatedAt: createdAt, updatedBy: currentEmployee.name }));
    }
    if (createsProductionJob) {
      learnApprovedJob(job, "approved_job", sourceTicket, linkedEmailFiles.map((file) => file.name));
    }
    setStatusEvents((current) => [
      {
        id: makeId("move"),
        jobId,
        toStatus: job.status,
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
        movedAt: createdAt,
        minutesInPreviousStatus: 0,
        note: quoteId ? "Quote created from estimate." : "Job created from estimate."
      },
      ...current
    ]);
    setOperationalActivities((current) => [
      makeOperationalActivity({
        category: quoteId ? "quote" : "job",
        action: quoteId ? "quote_created" : "job_created",
        description: quoteId
          ? `${quoteNumber ?? "Quote"} created for ${customer.name}.`
          : `${jobNumber} created in Prepress for ${customer.name}.`,
        customerId: customer.id,
        customerName: customer.name,
        jobId,
        jobNumber,
        quoteId,
        quoteNumber,
        toValue: job.status,
        createdAt
      }),
      ...current
    ]);

    const linkedSourceFiles = [
      ...linkedEmailFiles,
      ...(linkedPortalFile ? [linkedPortalFile] : [])
    ];
    if (linkedSourceFiles.length) {
      setUploadedFiles((current) => [...linkedSourceFiles, ...current]);
      setCustomers((current) =>
        current.map((item) =>
          item.id === customer.id
            ? { ...item, attachments: (item.attachments ?? 0) + linkedSourceFiles.length }
            : item
        )
      );
    }

    const artworkAlreadyPreserved = Boolean(artworkFile && linkedSourceFiles.some((file) => file.name === artworkFile.name && file.size === artworkFile.size));
    if (artworkFile && !artworkAlreadyPreserved) {
      await uploadFiles([artworkFile], "Active Artwork", customer.id, job.id, job);
    }

    if (quoteId && quoteNumber) {
      const quote: Quote = {
        id: quoteId,
        quoteNumber,
        jobId,
        customerId: customer.id,
        customerName: customer.name,
        title: data.title,
        amount: pricing.total,
        status: intent === "sendQuote" ? "Sent" : "Draft",
        createdAt,
        sentAt: intent === "sendQuote" ? createdAt : undefined
      };
      setQuotes((current) => [quote, ...current]);
      if (intent === "sendQuote") {
        void sendTemplateEmail("quote_ready", {
          to: customer.email,
          entityId: quoteId,
          entityType: "quote",
          customer,
          job,
          quote,
          threadId: data.sourceEmailThreadId
        });
      }
      if (sourceTicket || sourcePortalRequest) {
        activateView("Workflow");
        setSelectedJobId(jobId);
        const sourceLabel =
          sourcePortalRequest?.requestNumber ??
          sourceTicket?.ticketNumber ??
          "Intake request";
        setNotice(
          intent === "sendQuote"
            ? `${sourceLabel} converted to ${quote.quoteNumber}, sent to ${customer.email}, and opened.`
            : `${sourceLabel} converted to ${quote.quoteNumber} and opened.`
        );
      } else {
        activateView("Quotes");
        setNotice(
          intent === "sendQuote"
            ? `Quote ${quote.quoteNumber} sent to ${customer.email} and added to Workflow > Quote.`
            : `Quote ${quote.quoteNumber} saved and added to Workflow > Quote.`
        );
      }
    } else {
      void notifyCustomerForJobStatus(job, "Prepress");
      activateView("Workflow");
      setSelectedJobId(jobId);
      setNotice(
        sourcePortalRequest
          ? `${sourcePortalRequest.requestNumber ?? "Portal request"} converted to ${job.jobNumber} and opened in Prepress.`
          : `Job ${job.jobNumber} created in Workflow > Prepress. Customer production status update started.`
      );
    }

    if (data.sourceEmailThreadId) {
      setEmailThreads((current) =>
        current.map((thread) =>
          thread.id === data.sourceEmailThreadId
            ? { ...thread, customerId: customer.id, jobId, quoteId }
            : thread
        )
      );
    }
    if (data.intakeTicketId) {
      setEmailIntakeTickets((current) =>
        current.map((ticket) =>
          ticket.id === data.intakeTicketId
            ? {
                ...ticket,
                status: "Converted",
                customerId: customer.id,
                customerName: customer.name,
                jobId,
                quoteId,
                convertedAt: createdAt,
                convertedBy: currentEmployee.name,
                conversionKind: quoteId ? "quote" : "job",
                convertedRecordNumber: quoteNumber ?? jobNumber,
                preferredConversion: quoteId ? "quote" : "job",
                sourceAttachmentFileIds: linkedEmailFiles.map((file) => file.id),
                conversionStartedAt: ticket.conversionStartedAt ?? createdAt,
                updatedAt: createdAt,
                history: [
                  {
                    id: makeId("ticket-event"),
                    status: "Converted",
                    createdAt,
                    employeeName: currentEmployee.name,
                    note: `Converted to ${quoteNumber ?? jobNumber}. ${linkedEmailFiles.length} email attachment${
                      linkedEmailFiles.length === 1 ? "" : "s"
                    } linked to the record.`
                  },
                  ...(ticket.history ?? [])
                ]
              }
            : ticket
        )
      );
      setActiveIntakeTicketId(undefined);
    }
    if (sourcePortalRequest) {
      void finalizePortalRequestConversion({
        request: sourcePortalRequest,
        jobId,
        quoteId,
        recordNumber: quoteNumber ?? jobNumber,
        conversionKind: quoteId ? "quote" : "job"
      });
      setActivePortalRequest(undefined);
    }
    return true;
  }

  function updateJob(jobId: string, data: EstimateFormData, pricing: JobPricing) {
    setEstimateDirty(false);
    window.localStorage.removeItem(ESTIMATE_DRAFT_STORAGE_KEY);
    const customer = customers.find((item) => item.id === data.customerId) ?? customers[0];
    const stock = paperStocks.find((paper) => paper.id === data.stockId) ?? paperStocks[0];
    let updatedJob: Job | undefined;
    setJobs((current) =>
      current.map((job) => {
        if (job.id !== jobId) return job;
        updatedJob = {
          ...job,
          title: data.title,
          customerId: customer.id,
          customerName: customer.name,
          quantity: data.quantity,
          pieceWidth: data.pieceWidth,
          pieceHeight: data.pieceHeight,
          dueDate: data.dueDate,
          dueTime: data.dueTime,
          rush: isRushDue(data.dueDate, data.dueTime),
          stockId: stock.id,
          stockName: stock.name,
          colorSpec: data.colorSpec,
          sides: data.sides,
          bindery: data.bindery,
          orderSource: data.orderSource,
          customerReference: data.customerReference,
          sourceEmailThreadId: data.sourceEmailThreadId ?? job.sourceEmailThreadId,
          sourceEmailMessageId: data.sourceEmailMessageId ?? job.sourceEmailMessageId,
          emailThreadIds: data.sourceEmailThreadId
            ? Array.from(new Set([...(job.emailThreadIds ?? []), data.sourceEmailThreadId]))
            : job.emailThreadIds,
          intakeTicketId: data.intakeTicketId ?? job.intakeTicketId,
          portalRequestId: data.portalRequestId ?? job.portalRequestId,
          orderId: data.orderId ?? job.orderId,
          cuttingMode: data.cuttingMode,
          artworkName: data.artworkName,
          artworkPreview: data.artworkPreview,
          booklet: data.booklet,
          pricing,
          updatedAt: nowIso()
        };
        return updatedJob;
      })
    );
    setQuotes((current) =>
      current.map((quote) =>
        quote.jobId === jobId
          ? { ...quote, customerId: customer.id, customerName: customer.name, title: data.title, amount: pricing.total }
          : quote
      )
    );
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.jobId === jobId
          ? { ...invoice, customerId: customer.id, customerName: customer.name, title: data.title, amount: pricing.total, updatedAt: nowIso() }
          : invoice
      )
    );
    setEditingJobId(undefined);
    activateView("Workflow");
    const savedJob = updatedJob as Job | undefined;
    if (savedJob) {
      if (savedJob.status !== "Quote") {
        const learningTicket = savedJob.intakeTicketId
          ? emailIntakeTickets.find((ticket) => ticket.id === savedJob.intakeTicketId)
          : undefined;
        const attachmentNames = learningTicket
          ? emailSourceAttachmentsForTicket(learningTicket).map((attachment) => attachment.filename)
          : [];
        learnApprovedJob(savedJob, "job_update", learningTicket, attachmentNames);
      }
      setOperationalActivities((current) => [
        makeOperationalActivity({
          category: "job",
          action: "job_updated",
          description: `${savedJob.jobNumber} specifications updated.`,
          customerId: savedJob.customerId,
          customerName: savedJob.customerName,
          jobId: savedJob.id,
          jobNumber: savedJob.jobNumber
        }),
        ...current
      ]);
    }
    setNotice(savedJob ? `${savedJob.jobNumber} updated.` : "Job updated.");
  }

  async function sendQuoteEmail(quoteId: string) {
    const quote = quotes.find((item) => item.id === quoteId);
    const customer = quote ? customers.find((item) => item.id === quote.customerId) : undefined;
    const job = quote ? jobs.find((item) => item.id === quote.jobId) : undefined;
    if (!quote) {
      setNotice("Quote could not be found.");
      return;
    }
    if (!customer || !job) {
      setNotice(`Quote ${quote.quoteNumber} needs a customer and linked job before it can be emailed.`);
      return;
    }
    if (!isValidEmail(customer.email)) {
      setNotice(`Quote ${quote.quoteNumber} needs a valid customer email before sending.`);
      return;
    }
    const sent = await sendTemplateEmail("quote_ready", {
      to: customer.email,
      entityId: quote.id,
      entityType: "quote",
      customer,
      job,
      quote,
      threadId: job.sourceEmailThreadId
    });
    if (sent) {
      const sentAt = nowIso();
      setQuotes((current) => current.map((item) => (item.id === quoteId ? { ...item, status: "Sent", sentAt } : item)));
      setNotice(`Quote ${quote.quoteNumber} ${DEMO_MODE ? "saved to the demo email log" : "sent to " + customer.email}.`);
    }
  }

  function convertQuoteToJob(quoteId: string) {
    const quote = quotes.find((item) => item.id === quoteId);
    const linkedJobIds = quote ? (quote.jobIds?.length ? quote.jobIds : [quote.jobId]) : [];
    const linkedJobs = jobs.filter((item) => linkedJobIds.includes(item.id));
    const job = linkedJobs[0];
    if (!quote || !job || !linkedJobs.length) {
      setNotice("Quote or linked workflow jobs could not be found.");
      return;
    }
    if (
      quote.status === "Approved" &&
      linkedJobs.every((linkedJob) => !["Quote", "Approved"].includes(linkedJob.status))
    ) {
      setNotice(
        quote.orderId
          ? `${quote.quoteNumber} was already approved and its ${linkedJobs.length} jobs are in production.`
          : `${quote.quoteNumber} was already approved and ${job.jobNumber} is in production.`
      );
      return;
    }
    const convertedAt = nowIso();
    const nextQuotes = quotes.map((item) => item.id === quoteId ? { ...item, status: "Approved" as const } : item);
    const nextJobs = jobs.map((item) => linkedJobIds.includes(item.id) ? {
      ...item,
      status: "Prepress" as const,
      rush: isRushDue(item.dueDate, item.dueTime),
      updatedAt: convertedAt
    } : item);
    const newEvents: JobStatusEvent[] = linkedJobs.map((linkedJob) => ({
      id: makeId("move"),
      jobId: linkedJob.id,
      fromStatus: linkedJob.status,
      toStatus: "Prepress",
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      movedAt: convertedAt,
      minutesInPreviousStatus: 0,
      note: quote.orderId
        ? `Order quote ${quote.quoteNumber} approved and released to prepress.`
        : "Quote approved and released to prepress."
    }));
    const nextOrders = quote.orderId
      ? orders.map((order) => order.id === quote.orderId ? { ...order, status: "In production" as const, updatedAt: convertedAt } : order)
      : orders;
    setQuotes(nextQuotes);
    setJobs(nextJobs);
    setStatusEvents((current) => [...newEvents, ...current]);
    if (nextOrders !== orders) setOrders(nextOrders);
    if (quote.orderId) {
      const parentOrder = orders.find((order) => order.id === quote.orderId);
      void notifyCustomerForJobStatus(
        { ...job, status: "Prepress", updatedAt: convertedAt },
        "Prepress",
        "In production",
        parentOrder
      );
    } else {
      void notifyCustomerForJobStatus({ ...job, status: "Prepress", updatedAt: convertedAt }, "Prepress");
    }
    setOperationalActivities((current) => [
      makeOperationalActivity({
        category: "quote",
        action: "quote_approved",
        description: quote.orderId
          ? `${quote.quoteNumber} approved and ${linkedJobs.length} jobs released to Prepress.`
          : `${quote.quoteNumber} approved and ${job.jobNumber} released to Prepress.`,
        customerId: job.customerId,
        customerName: job.customerName,
        jobId: job.id,
        jobNumber: job.jobNumber,
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        fromValue: job.status,
        toValue: "Prepress",
        createdAt: convertedAt,
        details: { itemCount: linkedJobs.length, orderId: quote.orderId }
      }),
      ...current
    ]);
    activateView(quote.orderId ? "Orders" : "Workflow");
    if (!quote.orderId) setSelectedJobId(quote.jobId);
    setNotice(
      quote.orderId
        ? `Quote ${quote.quoteNumber} approved. All ${linkedJobs.length} jobs were released to Prepress.`
        : `Quote ${quote.quoteNumber} approved and ${job.jobNumber} moved to Workflow > Prepress.`
    );
  }

  function archiveQuote(quoteId: string) {
    setQuotes((current) => current.map((quote) => (quote.id === quoteId ? { ...quote, archived: true, status: "Archived" } : quote)));
    setNotice("Quote archived.");
  }

  function restoreQuote(quoteId: string) {
    setQuotes((current) =>
      current.map((quote) =>
        quote.id === quoteId
          ? {
              ...quote,
              archived: false,
              deletedAt: undefined,
              status: quote.status === "Archived" ? "Draft" : quote.status
            }
          : quote
      )
    );
    setNotice("Quote restored.");
  }

  async function emailInvoice(invoiceId: string) {
    const invoice = invoices.find((item) => item.id === invoiceId);
    const customer = invoice ? customers.find((item) => item.id === invoice.customerId) : undefined;
    const linkedJobIds = invoice
      ? invoice.jobIds?.length
        ? invoice.jobIds
        : [invoice.jobId]
      : [];
    const linkedJobs = jobs.filter((item) => linkedJobIds.includes(item.id));
    const job = linkedJobs[0];
    if (!invoice || !customer || !job) return;
    if (!isValidEmail(customer.email)) {
      setNotice(`${customer.name} needs a valid email address before sending the invoice.`);
      return;
    }
    const sent = await sendTemplateEmail("invoice", {
      to: customer.email,
      entityId: invoice.id,
      entityType: "invoice",
      customer,
      job,
      invoice,
      threadId: job.sourceEmailThreadId
    });
    if (sent) {
      const timestamp = nowIso();
      const nextInvoices = invoices.map((item) =>
        item.id === invoiceId ? { ...item, status: "Sent" as const, updatedAt: timestamp } : item
      );
      const nextJobs = jobs.map((item) =>
        linkedJobIds.includes(item.id)
          ? { ...item, invoiceSentAt: timestamp, updatedAt: timestamp }
          : item
      );
      const nextOrders = invoice.orderId
        ? orders.map((order) =>
            order.id === invoice.orderId ? { ...order, invoiceId: invoice.id, updatedAt: timestamp } : order
          )
        : orders;
      const activity = makeOperationalActivity({
        category: "invoice",
        action: "invoice_sent",
        description: `${invoice.invoiceNumber} sent to ${customer.email}${invoice.orderId ? ` for ${linkedJobs.length} order items` : ""}.`,
        customerId: customer.id,
        customerName: customer.name,
        jobId: job.id,
        jobNumber: job.jobNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        fromValue: invoice.status,
        toValue: "Sent",
        createdAt: timestamp,
        details: invoice.orderId ? { orderId: invoice.orderId, itemCount: linkedJobs.length } : undefined
      });
      const nextActivities = [activity, ...operationalActivities];
      persistStateNow(
        { jobs: nextJobs, orders: nextOrders, invoices: nextInvoices, operationalActivities: nextActivities },
        120
      );
      setInvoices(nextInvoices);
      setJobs(nextJobs);
      if (nextOrders !== orders) setOrders(nextOrders);
      setOperationalActivities(nextActivities);
      setCompletionPrompt((current) => current?.invoiceId === invoiceId ? undefined : current);
      setNotice(`Invoice ${invoice.invoiceNumber} ${DEMO_MODE ? "saved to the demo email log" : "sent"}.`);
    }
  }

  function archiveInvoice(invoiceId: string) {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId ? { ...invoice, archived: true, status: "Archived", updatedAt: nowIso() } : invoice
      )
    );
    setNotice("Invoice archived.");
  }

  function restoreInvoice(invoiceId: string) {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId
          ? {
              ...invoice,
              archived: false,
              deletedAt: undefined,
              status: invoice.status === "Archived" ? "Ready" : invoice.status,
              updatedAt: nowIso()
            }
          : invoice
      )
    );
    setNotice("Invoice restored.");
  }

  function archiveJob(jobId: string) {
    setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, archived: true, updatedAt: nowIso() } : job)));
    setSelectedJobId(null);
    setNotice("Job archived.");
  }

  function restoreJob(jobId: string) {
    setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, deletedAt: undefined, archived: false, updatedAt: nowIso() } : job)));
    setNotice("Job restored.");
  }

  function updateJobNote(jobId: string, notes: string) {
    const job = jobs.find((item) => item.id === jobId);
    const timestamp = nowIso();
    setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, notes, updatedAt: timestamp } : item)));
    if (job) {
      setOperationalActivities((current) => [
        makeOperationalActivity({
          category: "job",
          action: "note_updated",
          description: `${job.jobNumber} internal note updated.`,
          customerId: job.customerId,
          customerName: job.customerName,
          jobId: job.id,
          jobNumber: job.jobNumber,
          createdAt: timestamp
        }),
        ...current
      ]);
    }
    setNotice("Job note saved.");
  }

  function updateJobCustomerEmailSettings(
    jobId: string,
    changes: Pick<Job, "customerEmailNotificationsEnabled" | "customerNotificationPath">
  ) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    const timestamp = nowIso();
    setJobs((current) => current.map((item) => item.id === jobId ? { ...item, ...changes, updatedAt: timestamp } : item));
    if (job.orderId) {
      setOrders((current) => current.map((order) => order.id === job.orderId ? { ...order, ...changes, updatedAt: timestamp } : order));
    }
    setOperationalActivities((current) => [makeOperationalActivity({
      category: "email",
      action: "customer_email_policy_updated",
      description: `${job.jobNumber} customer email notifications ${changes.customerEmailNotificationsEnabled === false || changes.customerNotificationPath === "manual" ? "set to manual" : "enabled"}.`,
      customerId: job.customerId,
      customerName: job.customerName,
      jobId: job.id,
      jobNumber: job.jobNumber,
      createdAt: timestamp,
      details: changes
    }), ...current]);
    setNotice(changes.customerEmailNotificationsEnabled === false || changes.customerNotificationPath === "manual"
      ? "Automatic customer emails are off for this job. Portal status will still update."
      : "Customer email notification path updated.");
  }

  function startTimer(jobId: string, category: TimeCategory) {
    setActiveTimer({ jobId, category, startedAt: nowIso() });
    setNotice("Timer started.");
  }

  function stopTimer() {
    if (!activeTimer) return;
    const minutes = Math.max(1, Math.round((Date.now() - new Date(activeTimer.startedAt).getTime()) / 60000));
    addManualTime(activeTimer.jobId, activeTimer.category, minutes, "Timer entry");
    setActiveTimer(undefined);
    setNotice(`Timer stopped and ${minutes} min saved.`);
  }

  function addManualTime(jobId: string, category: TimeCategory, minutes: number, _note?: string) {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              time: { ...job.time, [category]: job.time[category] + Math.max(0, Math.round(minutes)) },
              updatedAt: nowIso()
            }
          : job
      )
    );
  }

  function setManualTime(jobId: string, category: TimeCategory, minutes: number) {
    const cleanedMinutes = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              time: { ...job.time, [category]: cleanedMinutes },
              updatedAt: nowIso()
            }
          : job
      )
    );
  }

  function addCustomer(customer: Omit<Customer, "id">) {
    const id = makeId("cust");
    setCustomers((current) => [{ ...customer, id }, ...current]);
    setFocusedCustomerId(id);
    setNotice(`${customer.name} added to Customers.`);
    return id;
  }

  function updateCustomer(customerId: string, updates: Partial<Omit<Customer, "id">>) {
    setCustomers((current) => current.map((customer) => (customer.id === customerId ? { ...customer, ...updates } : customer)));
    if (updates.name) {
      setJobs((current) => current.map((job) => (job.customerId === customerId ? { ...job, customerName: updates.name!, updatedAt: nowIso() } : job)));
      setQuotes((current) => current.map((quote) => (quote.customerId === customerId ? { ...quote, customerName: updates.name! } : quote)));
      setInvoices((current) => current.map((invoice) => (invoice.customerId === customerId ? { ...invoice, customerName: updates.name!, updatedAt: nowIso() } : invoice)));
    }
  }

  function archiveCustomer(customerId: string) {
    setCustomers((current) => current.map((customer) => (customer.id === customerId ? { ...customer, archived: true } : customer)));
    setFocusedCustomerId(undefined);
    setNotice("Customer archived.");
  }

  function restoreCustomer(customerId: string) {
    setCustomers((current) =>
      current.map((customer) => (customer.id === customerId ? { ...customer, archived: false, deletedAt: undefined } : customer))
    );
    setNotice("Customer restored.");
  }

  function addPaperStock(stock: Omit<PaperStock, "id">) {
    const id = makeId("stock");
    setPaperStocks((current) => [{ ...stock, id }, ...current]);
    setNotice(`${stock.name} added to Catalog and New Estimate / Job.`);
    return id;
  }

  function updatePaperStock(stockId: string, updates: Omit<PaperStock, "id">) {
    setPaperStocks((current) => current.map((stock) => (stock.id === stockId ? { ...stock, ...updates } : stock)));
    setNotice(`${updates.name} updated in paper inventory.`);
  }

  function removePaperStock(stockId: string) {
    const removed = paperStocks.find((stock) => stock.id === stockId);
    setPaperStocks((current) => current.filter((stock) => stock.id !== stockId));
    setNotice(`${removed?.name ?? "Paper stock"} removed from active paper inventory.`);
  }

  function addProductPreset(preset: Omit<ProductPreset, "id">) {
    setProductCategories((current) => (current.some((category) => category.toLowerCase() === preset.category.toLowerCase()) ? current : [...current, preset.category]));
    setProductPresets((current) => [{ ...preset, id: makeId("preset") }, ...current]);
    setNotice(`${preset.name} added to Catalog and New Estimate / Job.`);
  }

  function updateProductPreset(presetId: string, updates: Omit<ProductPreset, "id">) {
    setProductCategories((current) => (current.some((category) => category.toLowerCase() === updates.category.toLowerCase()) ? current : [...current, updates.category]));
    setProductPresets((current) => current.map((preset) => (preset.id === presetId ? { ...updates, id: presetId } : preset)));
    setNotice(`${updates.name} updated in product presets.`);
  }

  function removeProductPreset(presetId: string) {
    const removed = productPresets.find((preset) => preset.id === presetId);
    setProductPresets((current) => current.filter((preset) => preset.id !== presetId));
    setNotice(`${removed?.name ?? "Product preset"} removed from active product presets.`);
  }

  function addProductCategory(category: string) {
    const normalized = category.trim();
    if (!normalized) return;
    setProductCategories((current) => (current.some((item) => item.toLowerCase() === normalized.toLowerCase()) ? current : [...current, normalized]));
    setNotice(`${normalized} added to product categories.`);
  }

  function renameProductCategory(oldCategory: string, newCategory: string) {
    const normalized = newCategory.trim();
    if (!oldCategory || !normalized || oldCategory === normalized) return;
    setProductCategories((current) => {
      const renamed = current.map((category) => (category === oldCategory ? normalized : category));
      return Array.from(new Set(renamed));
    });
    setProductPresets((current) => current.map((preset) => (preset.category === oldCategory ? { ...preset, category: normalized } : preset)));
    setPaperStocks((current) =>
      current.map((stock) => ({
        ...stock,
        productCategories: stock.productCategories?.map((category) => (category === oldCategory ? normalized : category))
      }))
    );
    setNotice(`${oldCategory} renamed to ${normalized}.`);
  }

  function removeProductCategory(category: string) {
    setProductCategories((current) => current.filter((item) => item !== category));
    setNotice(`${category} removed from product categories.`);
  }

  function addCatalogPrice(price: Omit<CatalogPrice, "id">) {
    setCatalogPrices((current) => [{ ...price, id: makeId("cat") }, ...current]);
    setNotice(`${price.name} added to pricing catalog.`);
  }

  function updateCatalogPrice(priceId: string, updates: Omit<CatalogPrice, "id">) {
    setCatalogPrices((current) => current.map((price) => (price.id === priceId ? { ...price, ...updates } : price)));
    setNotice(`${updates.name} updated in pricing catalog.`);
  }

  function removeCatalogPrice(priceId: string) {
    const removed = catalogPrices.find((price) => price.id === priceId);
    setCatalogPrices((current) => current.filter((price) => price.id !== priceId));
    setNotice(`${removed?.name ?? "Pricing item"} removed from active pricing catalog.`);
  }

  function updateQuantityRateCurve(curve: QuantityRatePoint[]) {
    setQuantityRateCurve(normalizeQuantityRateCurve(curve));
    setNotice("Quantity discount curve updated.");
  }

  function addMachine(machine: Omit<Machine, "id">) {
    setMachines((current) => [{ ...machine, id: makeId("machine") }, ...current]);
    setNotice(`${machine.name} added to machines.`);
  }

  function updateMachine(machineId: string, updates: Omit<Machine, "id">) {
    setMachines((current) => current.map((machine) => (machine.id === machineId ? { ...machine, ...updates } : machine)));
    setNotice(`${updates.name} updated in machines.`);
  }

  function removeMachine(machineId: string) {
    const removed = machines.find((machine) => machine.id === machineId);
    setMachines((current) => current.filter((machine) => machine.id !== machineId));
    setNotice(`${removed?.name ?? "Machine"} removed from active machines.`);
  }

  async function uploadFiles(files: File[], folder: UploadedFile["folder"], customerId?: string, jobId?: string, jobOverride?: Job) {
    const linkedJob = jobOverride ?? (jobId ? jobs.find((job) => job.id === jobId) : undefined);
    const linkedCustomer = customerId
      ? customers.find((customer) => customer.id === customerId)
      : linkedJob
        ? customers.find((customer) => customer.id === linkedJob.customerId)
        : undefined;
    const uploadedAt = nowIso();
    const uploaded: UploadedFile[] = [];
    let failed = 0;

    for (const file of files) {
      const id = makeId("file");
      const relativeName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const storagePath = `${linkedCustomer?.id ?? "unassigned"}/${linkedJob?.id ?? "customer-files"}/${Date.now()}-${id}-${safeStorageName(file.name)}`;
      let storedInCloud = false;
      let uploadFailed = false;
      let preview: string | undefined;
      if (authRequired && authToken) {
        try {
          storedInCloud = await uploadSupabaseFile(file, storagePath, authToken);
        } catch {
          uploadFailed = true;
          failed += 1;
        }
        if (storedInCloud && file.type.startsWith("image/")) {
          try {
            preview = await signedSupabaseFileUrl(storagePath, authToken);
          } catch {
            preview = undefined;
          }
        }
      } else if (file.type.startsWith("image/")) {
        preview = URL.createObjectURL(file);
      }
      uploaded.push({
        id,
        name: relativeName,
        folder,
        customerId: linkedCustomer?.id,
        customerName: linkedCustomer?.name,
        jobId: linkedJob?.id,
        jobNumber: linkedJob?.jobNumber,
        size: file.size,
        type: file.type || "unknown",
        uploadedAt,
        status: uploadFailed ? "Needs Review" : linkedJob || linkedCustomer ? "Linked" : "Active",
        preview,
        storagePath: storedInCloud ? storagePath : undefined,
        storageBucket: storedInCloud ? SUPABASE_FILES_BUCKET : undefined
      });
    }

    setUploadedFiles((current) => [...uploaded, ...current]);
    if (uploaded.length) {
      setOperationalActivities((current) => [
        ...uploaded.map((item) =>
          makeOperationalActivity({
            category: "file",
            action: "file_uploaded",
            description: `${item.name} uploaded to ${item.folder}.`,
            customerId: item.customerId,
            customerName: item.customerName,
            jobId: item.jobId,
            jobNumber: item.jobNumber,
            details: { size: item.size, status: item.status },
            createdAt: item.uploadedAt
          })
        ),
        ...current
      ]);
    }
    if (linkedCustomer) {
      setCustomers((current) => current.map((customer) => customer.id === linkedCustomer.id ? { ...customer, attachments: (customer.attachments ?? 0) + uploaded.length } : customer));
    }
    setNotice(
      failed
        ? `${uploaded.length - failed} file${uploaded.length - failed === 1 ? "" : "s"} saved permanently; ${failed} upload${failed === 1 ? "" : "s"} need review.`
        : `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} uploaded to ${folder}${authRequired ? " and saved in Supabase Storage" : ""}.`
    );
  }

  async function openUploadedFile(fileId: string) {
    const file = uploadedFiles.find((item) => item.id === fileId);
    if (!file) return;

    if (file.sourceProvider === "customer_portal" && file.sourcePortalRequestId) {
      const pendingWindow = window.open("about:blank", "_blank");
      try {
        const response = await fetch(
          `/api/customer-portal/admin/file?id=${encodeURIComponent(file.sourcePortalRequestId)}`,
          {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
            cache: "no-store"
          }
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Unable to open this customer portal file.");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (pendingWindow) {
          pendingWindow.opener = null;
          pendingWindow.location.href = url;
          window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
      } catch (error) {
        pendingWindow?.close();
        setNotice(error instanceof Error ? error.message : "Unable to open this customer portal file.");
      }
      return;
    }

    if (
      file.sourceProvider === "gmail" &&
      file.sourceEmailThreadId &&
      file.sourceEmailMessageId &&
      file.sourceEmailAttachmentId
    ) {
      await downloadEmailAttachment(
        file.sourceEmailThreadId,
        file.sourceEmailMessageId,
        file.sourceEmailAttachmentId,
        "open"
      );
      return;
    }

    const pendingWindow = window.open("about:blank", "_blank");
    try {
      const url = file.storagePath && authToken
        ? await signedSupabaseFileUrl(file.storagePath, authToken)
        : file.preview;
      if (!url) {
        pendingWindow?.close();
        setNotice("This record has file information but no downloadable file. Upload it again after Supabase Storage is connected.");
        return;
      }
      if (pendingWindow) {
        pendingWindow.opener = null;
        pendingWindow.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (error) {
      pendingWindow?.close();
      setNotice(error instanceof Error ? error.message : "Could not open this file.");
    }
  }

  function archiveFile(fileId: string) {
    setUploadedFiles((current) =>
      current.map((file) => (file.id === fileId ? { ...file, status: "Archived", folder: "Archive" } : file))
    );
    setNotice("File moved to Archive.");
  }

  function restoreFile(fileId: string) {
    setUploadedFiles((current) =>
      current.map((file) =>
        file.id === fileId
          ? {
              ...file,
              deletedAt: undefined,
              status: file.jobId || file.customerId ? "Linked" : "Active",
              folder: file.jobId ? "Active Artwork" : file.customerId ? "Customer Files" : "Active Artwork"
            }
          : file
      )
    );
    setNotice("File restored.");
  }

  function importCustomers(rows: Record<string, unknown>[]) {
    const imported = rows.map<Customer>((row, index) => {
      const name = asString(row.name ?? row.Customer ?? row.customerName ?? row["Company name"] ?? row.Name, `Imported Customer ${index + 1}`);
      const contact = asString(row.contact ?? row.Contact ?? row.Name, "");
      const email = asString(row.email ?? row.Email, "");
      const openBalance = asNumber(row.openBalance ?? row["Open balance"] ?? row.totalSpend, 0);

      return {
        id: makeId("cust"),
        name,
        contact,
        email,
        phone: asString(row.phone ?? row.Phone, ""),
        companyType: asString(row.companyType ?? row.Type, inferCustomerType(name, email)),
        terms: asString(row.terms ?? row.Terms, "Due on receipt"),
        lastOrder: asString(row.lastOrder, ""),
        totalSpend: openBalance,
        address: asString(row.address ?? row["Street Address"], ""),
        city: asString(row.city ?? row.City, ""),
        state: asString(row.state ?? row.State, ""),
        country: asString(row.country ?? row.Country, ""),
        zip: asString(row.zip ?? row.Zip, ""),
        attachments: asNumber(row.attachments ?? row.Attachments, 0),
        openBalance,
        importedFrom: asString(row.importedFrom, "Excel import")
      };
    });
    setCustomers((current) => [...imported, ...current]);
    setNotice(`Imported ${imported.length} customers.`);
  }

  function importJobs(rows: Record<string, unknown>[]) {
    const stock = paperStocks[0];
    const customer = customers[0];
    const imported = rows.map<Job>((row, index) => ({
      id: makeId("job"),
      jobNumber: asString(row.jobNumber, `GP-IMP-${index + 1}`),
      title: asString(row.title, `Imported Job ${index + 1}`),
      customerId: customer.id,
      customerName: asString(row.customerName, customer.name),
      status: "Quote",
      quantity: asNumber(row.quantity, 1000),
      pieceWidth: asNumber(row.pieceWidth, 4),
      pieceHeight: asNumber(row.pieceHeight, 6),
      dueDate: asString(row.dueDate, new Date().toISOString().slice(0, 10)),
      dueTime: asString(row.dueTime, "17:00"),
      rush: false,
      stockId: stock.id,
      stockName: stock.name,
      colorSpec: asString(row.colorSpec, "4/4 full color"),
      sides: 2,
      bindery: ["Cut to size"],
      time: { prepress: 0, printingSetup: 0, printingRun: 0, finishing: 0 },
      pricing: { paper: 0, printing: 0, finishing: 0, cutting: 0, bookletCover: 0, total: asNumber(row.total, 0) },
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));
    setJobs((current) => [...imported, ...current]);
    setNotice(`Imported ${imported.length} jobs.`);
  }

  function importQuotes(rows: Record<string, unknown>[]) {
    const imported = rows.map<Quote>((row, index) => ({
      id: makeId("quote"),
      quoteNumber: asString(row.quoteNumber, `Q-IMP-${index + 1}`),
      jobId: asString(row.jobId, ""),
      customerId: asString(row.customerId, customers[0]?.id ?? ""),
      customerName: asString(row.customerName, customers[0]?.name ?? "Imported"),
      title: asString(row.title, `Imported Quote ${index + 1}`),
      amount: asNumber(row.amount, 0),
      status: "Draft",
      createdAt: nowIso()
    }));
    setQuotes((current) => [...imported, ...current]);
    setNotice(`Imported ${imported.length} quotes.`);
  }

  function importInvoices(rows: Record<string, unknown>[]) {
    const imported = rows.map<Invoice>((row, index) => ({
      id: makeId("invoice"),
      invoiceNumber: asString(row.invoiceNumber, `INV-IMP-${index + 1}`),
      jobId: asString(row.jobId, ""),
      customerId: asString(row.customerId, customers[0]?.id ?? ""),
      customerName: asString(row.customerName, customers[0]?.name ?? "Imported"),
      title: asString(row.title, `Imported Invoice ${index + 1}`),
      amount: asNumber(row.amount, 0),
      status: "Draft",
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));
    setInvoices((current) => [...imported, ...current]);
    setNotice(`Imported ${imported.length} invoices.`);
  }

  function importPaper(rows: Record<string, unknown>[]) {
    const imported = rows.map<PaperStock>((row, index) => {
      const name = asString(row.name ?? row.Stock ?? row["Paper / Item"], `Imported Stock ${index + 1}`);
      const inventoryCategory = asString(row.inventoryCategory ?? row.Category, "");
      const productCategories = asString(row.productCategories ?? row["Product Categories"], "")
        .split(",")
        .map((category) => category.trim())
        .filter(Boolean);

      return {
        id: makeId("stock"),
        name,
        kind: asString(row.kind, inferPaperKind(inventoryCategory, name)) as PaperStock["kind"],
        sheetWidth: asNumber(row.sheetWidth ?? row["Sheet width"], 13),
        sheetHeight: asNumber(row.sheetHeight ?? row["Sheet height"], 19),
        costPerSheet: asNumber(row.costPerSheet, 0),
        sellPerSheet: asNumber(row.sellPerSheet, 0),
        inventorySheets: asNumber(row.inventorySheets ?? row["Last Ordered Qty"], 0),
        inventoryCategory,
        supplier: asString(row.supplier ?? row.Supplier, ""),
        invoiceNumber: asString(row.invoiceNumber ?? row["Invoice #"], ""),
        sourcePage: asString(row.sourcePage ?? row["PDF Page"], ""),
        lastOrderedQty: asString(row.lastOrderedQty ?? row["Last Ordered Qty"], ""),
        unit: asString(row.unit ?? row.Unit, ""),
        lastOrderedDate: asString(row.lastOrderedDate ?? row["Last Ordered Date"], ""),
        importedFrom: asString(row.importedFrom, "Excel import"),
        productCategories
      };
    });
    setPaperStocks((current) => [...imported, ...current]);
    setNotice(`Imported ${imported.length} paper stocks.`);
  }

  function importCatalog(rows: Record<string, unknown>[]) {
    const imported = rows.map<CatalogPrice>((row, index) => ({
      id: makeId("cat"),
      category: "Printing",
      name: asString(row.name, `Imported Price ${index + 1}`),
      unit: asString(row.unit, "unit"),
      price: asNumber(row.price, 0),
      notes: asString(row.notes, "")
    }));
    setCatalogPrices((current) => [...imported, ...current]);
    setNotice(`Imported ${imported.length} catalog prices.`);
  }

  function saveAiLearningExample(example: AiLearningExample, quiet = false) {
    setAiLearningExamples((current) => [
      example,
      ...current.filter((item) => item.id !== example.id && (!example.jobId || item.jobId !== example.jobId))
    ].slice(0, 1500));
    if (!quiet) {
      setNotice(example.outcome === "corrected"
        ? "Learning example saved with staff corrections."
        : "Approved setup saved to Gross Printing memory.");
    }
  }

  function approvedJobLearningExample(
    job: Job,
    sourceKind: AiLearningSourceKind,
    ticket?: EmailIntakeTicket,
    sourceAttachmentNames: string[] = []
  ): AiLearningExample {
    const preset = learningPresetForJob(job, productPresets);
    const sourceThread = ticket ? emailThreads.find((thread) => thread.id === ticket.threadId) : undefined;
    const recentInbound = sourceThread?.messages
      .filter((message) => message.direction === "inbound")
      .slice(-2)
      .map((message) => message.bodyText)
      .join(" ");
    const sourceText = sanitizeLearningText(
      [ticket?.subject, ticket?.summary, ticket?.notes, recentInbound, job.title, sourceAttachmentNames.join(" ")]
        .filter(Boolean)
        .join(" ") || `${job.customerName} ${job.title}`,
      1800
    );
    return {
      id: `approved-job-${job.id}`,
      analysisId: ticket?.splitAnalysis?.id ?? `approved-job-${job.id}`,
      source: ticket || job.sourceEmailThreadId ? "email" : "manual",
      sourceKind,
      model: "Gross Printing staff approval",
      createdAt: nowIso(),
      createdBy: currentEmployee.name,
      customerId: job.customerId,
      customerName: job.customerName,
      jobId: job.id,
      jobNumber: job.jobNumber,
      orderId: job.orderId,
      productCategory: preset?.category,
      productName: preset?.name ?? job.title,
      sourceAttachmentNames,
      inputSummary: sourceText,
      suggested: {
        summary: `${job.customerName} — ${job.title}`,
        customerName: job.customerName,
        productCategory: preset?.category,
        productName: preset?.name ?? job.title,
        quantity: job.quantity,
        finishedWidth: job.pieceWidth,
        finishedHeight: job.pieceHeight,
        sides: job.sides,
        colorSpec: job.colorSpec,
        paperHint: job.stockName,
        finishing: job.bindery,
        missingInformation: [],
        warnings: [],
        confidence: 1,
        complexity: job.bindery.length > 1 ? "moderate" : "simple"
      },
      finalForm: {
        customerId: job.customerId,
        title: job.title,
        quantity: job.quantity,
        pieceWidth: job.pieceWidth,
        pieceHeight: job.pieceHeight,
        stockId: job.stockId,
        colorSpec: job.colorSpec,
        sides: job.sides,
        bindery: job.bindery,
        cuttingMode: job.cuttingMode,
        booklet: job.booklet
      },
      corrections: [],
      outcome: "accepted"
    };
  }

  function learnApprovedJob(job: Job, sourceKind: AiLearningSourceKind, ticket?: EmailIntakeTicket, sourceAttachmentNames: string[] = []) {
    saveAiLearningExample(approvedJobLearningExample(job, sourceKind, ticket, sourceAttachmentNames), true);
  }

  function clearAiLearningExamples() {
    setAiLearningExamples([]);
    setNotice("AI training examples cleared from the MIS workspace.");
  }

  function restoreCompleteBackup(value: unknown) {
    const envelope = value && typeof value === "object" ? value as { state?: unknown } : undefined;
    const rawState = envelope?.state ?? value;
    if (!rawState || typeof rawState !== "object") {
      setNotice("Backup restore failed. The selected file does not contain MIS data.");
      return false;
    }
    const candidate = rawState as Partial<DemoPersistedState>;
    const hasCoreRecords = Array.isArray(candidate.customers) && Array.isArray(candidate.jobs) && Array.isArray(candidate.quotes) && Array.isArray(candidate.invoices);
    if (!hasCoreRecords) {
      setNotice("Backup restore failed. Customers, jobs, quotes, or invoices are missing.");
      return false;
    }
    const restored = normalizeDemoState(candidate);
    setCustomers(restored.customers);
    setOrders(restored.orders);
    setJobs(restored.jobs);
    setQuotes(restored.quotes);
    setInvoices(restored.invoices);
    setUploadedFiles(restored.uploadedFiles);
    setEmailLogs(restored.emailLogs);
    setEmailTemplates(restored.emailTemplates);
    setEmailThreads(restored.emailThreads);
    setEmailIntakeTickets(restored.emailIntakeTickets);
    setEmailBusinessRules(restored.emailBusinessRules);
    setEmailSafetySettings(restored.emailSafetySettings);
    setAiLearningExamples(restored.aiLearningExamples);
    setStatusEvents(restored.statusEvents);
    setOperationalActivities(restored.operationalActivities);
    setPaperStocks(restored.paperStocks);
    setProductCategories(restored.productCategories);
    setProductPresets(restored.productPresets);
    setCatalogPrices(restored.catalogPrices);
    setMachines(restored.machines);
    setQuantityRateCurve(restored.quantityRateCurve);
    setSelectedJobId(null);
    setFocusedCustomerId(undefined);
    lastStateFingerprint.current = "";
    window.setTimeout(() => persistStateNow(restored, 0), 0);
    setNotice(`Backup restored: ${restored.customers.length} customers and ${restored.jobs.length} jobs loaded.`);
    return true;
  }

  function repairDataLinks() {
    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
    const repairedJobs = jobs.map((job) => {
      const customer = customerMap.get(job.customerId);
      return customer && customer.name !== job.customerName ? { ...job, customerName: customer.name, updatedAt: nowIso() } : job;
    });
    const repairedJobMap = new Map(repairedJobs.map((job) => [job.id, job]));
    const repairedQuotes = quotes.map((quote) => {
      const job = repairedJobMap.get(quote.jobId);
      const customer = job ? customerMap.get(job.customerId) : customerMap.get(quote.customerId);
      if (!job && !customer) return quote;
      return {
        ...quote,
        customerId: customer?.id ?? quote.customerId,
        customerName: customer?.name ?? quote.customerName,
        jobId: job?.id ?? quote.jobId
      };
    });
    const repairedInvoices = invoices.map((invoice) => {
      const job = repairedJobMap.get(invoice.jobId);
      const customer = job ? customerMap.get(job.customerId) : customerMap.get(invoice.customerId);
      if (!job && !customer) return invoice;
      return {
        ...invoice,
        customerId: customer?.id ?? invoice.customerId,
        customerName: customer?.name ?? invoice.customerName,
        jobId: job?.id ?? invoice.jobId,
        updatedAt: nowIso()
      };
    });
    const repairedFiles: UploadedFile[] = uploadedFiles.map((file) => {
      const job = file.jobId ? repairedJobMap.get(file.jobId) : undefined;
      const customer = job ? customerMap.get(job.customerId) : file.customerId ? customerMap.get(file.customerId) : undefined;
      const status: UploadedFile["status"] = job || customer
        ? (file.status === "Archived" ? "Archived" : "Linked")
        : (file.status === "Archived" ? "Archived" : "Active");
      return {
        ...file,
        jobId: job?.id,
        jobNumber: job?.jobNumber,
        customerId: customer?.id,
        customerName: customer?.name,
        status
      };
    });
    const attachmentCounts = new Map<string, number>();
    repairedFiles.forEach((file) => {
      if (file.customerId && !file.deletedAt) attachmentCounts.set(file.customerId, (attachmentCounts.get(file.customerId) ?? 0) + 1);
    });
    const repairedCustomers = customers.map((customer) => ({ ...customer, attachments: attachmentCounts.get(customer.id) ?? 0 }));
    setCustomers(repairedCustomers);
    setJobs(repairedJobs);
    setQuotes(repairedQuotes);
    setInvoices(repairedInvoices);
    setUploadedFiles(repairedFiles);
    setNotice("Safe data repair completed. Names, valid cross-links, and customer file counts were refreshed.");
  }

  function trashJob(jobId: string) {
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, archived: false, deletedAt: nowIso(), updatedAt: nowIso() } : job));
    setNotice("Job moved to the recycle bin.");
  }

  function trashQuote(quoteId: string) {
    setQuotes((current) => current.map((quote) => quote.id === quoteId ? { ...quote, archived: false, deletedAt: nowIso() } : quote));
    setNotice("Quote moved to the recycle bin.");
  }

  function trashInvoice(invoiceId: string) {
    setInvoices((current) => current.map((invoice) => invoice.id === invoiceId ? { ...invoice, archived: false, deletedAt: nowIso(), updatedAt: nowIso() } : invoice));
    setNotice("Invoice moved to the recycle bin.");
  }

  function trashCustomer(customerId: string) {
    setCustomers((current) => current.map((customer) => customer.id === customerId ? { ...customer, archived: false, deletedAt: nowIso() } : customer));
    setFocusedCustomerId(undefined);
    setNotice("Customer moved to the recycle bin.");
  }

  function trashFile(fileId: string) {
    setUploadedFiles((current) => current.map((file) => file.id === fileId ? { ...file, deletedAt: nowIso() } : file));
    setNotice("File moved to the recycle bin.");
  }

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      setAuthMessage("The secure database connection is not configured yet.");
      return;
    }
    if (!isValidEmail(authEmail)) {
      setAuthMessage("Enter a valid email address.");
      return;
    }
    if (!authPassword) {
      setAuthMessage("Enter your password.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword, rememberDays })
      });
      const payload = (await response.json().catch(() => ({}))) as { session?: SupabaseAuthSession; error?: string };
      if (response.ok && payload.session) {
        const session = payload.session;
        authTokenRef.current = session.accessToken;
        setAuthSession(session);
        setAuthPassword("");
        setAuthMessage("");
        setNotice("Signed in to Gross Printing MIS.");
        updateClientLocation(pathForView("Dashboard"), "replace");
        return;
      }

      // One shared sign-in page: if this valid Supabase account is not approved as staff,
      // try the Customer Portal mapping before showing an error. Staff is always checked first.
      if (response.status === 403) {
        const portalResponse = await fetch("/api/customer-portal/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ email: authEmail.trim().toLowerCase(), password: authPassword, rememberDays })
        });
        const portalPayload = (await portalResponse.json().catch(() => ({}))) as { session?: { email?: string }; error?: string };
        if (portalResponse.ok && portalPayload.session) {
          setAuthPassword("");
          window.location.assign("/portal");
          return;
        }
        throw new Error(portalPayload.error ?? payload.error ?? "This account does not have access to a Gross Printing workspace.");
      }

      throw new Error(payload.error ?? "Email or password is incorrect.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not sign in. Check your email and password.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function sendPasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidEmail(authEmail)) {
      setAuthMessage("Enter the email address used for your Gross Printing account.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email: authEmail.trim().toLowerCase(), redirectPath: "auto" })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not send the password reset email.");
      setAuthMode("reset-sent");
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not send the reset email.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function setInvitationPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken || !authSession) {
      setAuthLinkProblem(true);
      setAuthMessage("This invitation or password-reset link is missing, invalid, or expired.");
      return;
    }
    const checks = passwordChecks(authNewPassword);
    if (!checks.length || !checks.letter || !checks.number) {
      setAuthMessage("Use at least 8 characters with a letter and a number.");
      return;
    }
    if (authNewPassword !== authConfirmPassword) {
      setAuthMessage("The passwords do not match.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await updateSupabasePassword(authToken, authNewPassword);
      const secured = await establishServerAuthSession(authSession);
      const updated: SupabaseAuthSession = { ...secured, refreshToken: undefined, setupMode: undefined };
      authTokenRef.current = updated.accessToken;
      setAuthSession(updated);
      setAuthNewPassword("");
      setAuthConfirmPassword("");
      setAuthLinkProblem(false);
      setAuthMessage("");
      setNotice(authSession.setupMode === "recovery" ? "Password changed successfully." : "Account setup is complete.");
      updateClientLocation(pathForView("Dashboard"), "replace");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not save the password. Open the newest link and try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  function signInWithGoogle() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("gross-printing-remember-days", String(rememberDays));
      window.localStorage.setItem("gross-printing-remember-computer", rememberDays ? "1" : "0");
    }
    if (!GOOGLE_AUTH_ENABLED) {
      setAuthMessage("Google sign-in is disabled for this deployment.");
      return;
    }
    if (!SUPABASE_URL) {
      setAuthMessage("The secure database connection is not configured yet.");
      return;
    }
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
      `${window.location.origin}${pathForView("Dashboard")}`
    )}`;
  }

  function signOut() {
    setShowSignOutConfirm(false);
    const sessionId = appSessionIdRef.current || (typeof window !== "undefined" ? window.localStorage.getItem(APP_SESSION_STORAGE_KEY) ?? "" : "");
    if (authToken && sessionId) {
      void fetch("/api/session", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sessionId })
      }).catch(() => undefined);
    }
    void clearServerAuthSession();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(APP_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(DEMO_STATE_STORAGE_KEY);
      window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
      window.localStorage.removeItem(QUANTITY_CURVE_STORAGE_KEY);
      window.localStorage.removeItem(ESTIMATE_DRAFT_STORAGE_KEY);
      window.localStorage.removeItem("gross-printing-estimate-draft-v2");
    }
    appSessionIdRef.current = "";
    storeAuthSession(null);
    setAuthSession(null);
    authTokenRef.current = undefined;
    pendingCloudState.current = null;
    setCustomers([]);
    setOrders([]);
    setJobs([]);
    setQuotes([]);
    setInvoices([]);
    setUploadedFiles([]);
    setEmailLogs([]);
    setEmailTemplates([]);
    setEmailThreads([]);
    setEmailIntakeTickets([]);
    setEmailBusinessRules([]);
    setAiLearningExamples([]);
    setStatusEvents([]);
    setOperationalActivities([]);
    setPaperStocks([]);
    setProductCategories([]);
    setProductPresets([]);
    setCatalogPrices([]);
    setMachines([]);
    setQuantityRateCurve([]);
    setAuthEmail("");
    setAuthPassword("");
    setAuthNewPassword("");
    setAuthConfirmPassword("");
    setAuthMode("signin");
    setAuthLinkProblem(false);
    setAuthMessage("Signed out safely.");
    setDemoStateHydrated(false);
    setCloudSaveState("idle");
    setNotice("Sign in to load Gross Printing MIS.");
  }

  const authBrandPanel = (
    <section className="auth-brand-panel">
      <div className="auth-brand-lockup">
        <img src="/brand/gross-printing-mark.png" alt="Gross Printing" />
        <div>
          <strong>Gross Printing</strong>
          <span>Print · Production · Customer Portal</span>
        </div>
      </div>
      <div className="auth-brand-copy">
        <span className="auth-eyebrow">One secure sign-in</span>
        <h1>Everything for your print work, in one place.</h1>
        <p>Sign in once. Your account automatically opens the right workspace — staff MIS or Customer Portal.</p>
      </div>
      <div className="auth-feature-list">
        <div><CheckCircle2 size={17} /><span>Same clean sign-in for staff and customers</span></div>
        <div><CheckCircle2 size={17} /><span>Your permissions decide what you can open</span></div>
        <div><CheckCircle2 size={17} /><span>Secure sessions without saving your password</span></div>
      </div>
      <p className="auth-brand-footer">Gross Printing & Publishing Inc. · Spring Valley, New York</p>
    </section>
  );

  if (needsAuthSetup) {
    return (
      <main className="auth-page">
        <div className="auth-layout">
          {authBrandPanel}
          <section className="auth-panel auth-setup-panel">
            <div className="auth-card-icon warning"><AlertTriangle size={24} /></div>
            <div>
              <span className="auth-kicker">Setup required</span>
              <h2>Connect Supabase before publishing</h2>
              <p>This release does not expose shop data when authentication is missing.</p>
            </div>
            <div className="auth-setup-list">
              <div><strong>1</strong><span>Create a Supabase backup before changing the database.</span></div>
              <div><strong>2</strong><span>Run the completed V044, V060, V061, V063 files, then <code>GROSS_PRINTING_MIS_V067_SERVER_SECURITY.sql</code>.</span></div>
              <div><strong>3</strong><span>Add the public Supabase variables and the server-only secret key in Vercel.</span></div>
              <div><strong>4</strong><span>Set production demo mode to false, redeploy, then sign in with the approved owner account.</span></div>
            </div>
            <p className="auth-message info">For a temporary local demo only, set <code>NEXT_PUBLIC_DEMO_MODE=true</code>.</p>
          </section>
        </div>
      </main>
    );
  }

  if (authRequired && !authReady) {
    return (
      <main className="workspace-boot-shell" aria-live="polite">
        <aside className="workspace-boot-sidebar" aria-hidden="true">
          <div className="workspace-boot-brand">
            <img src="/brand/gross-printing-mark.png" alt="" />
            <span><strong>Gross Printing</strong><small>MIS</small></span>
          </div>
        </aside>
        <section className="workspace-boot-main">
          <header className="workspace-boot-topbar">
            <span>Gross Printing workspace</span>
          </header>
          <div className="workspace-boot-message">
            <span className="workspace-boot-dot" aria-hidden="true" />
            <div><strong>Opening your workspace</strong><small>Checking your secure session…</small></div>
          </div>
        </section>
      </main>
    );
  }

  if (authRequired && !authSession && authLinkProblem) {
    return (
      <main className="auth-page">
        <div className="auth-layout">
          {authBrandPanel}
          <section className="auth-panel auth-invalid-link-panel">
            <div className="auth-card-icon warning"><AlertTriangle size={23} /></div>
            <span className="auth-kicker">Account link problem</span>
            <h2>This link cannot be used</h2>
            <p>{authMessage || "The invitation or password-reset link is invalid, expired, or was already used."}</p>
            <button className="primary-button auth-submit" type="button" onClick={() => { setAuthLinkProblem(false); setAuthMode("forgot"); setAuthMessage(""); }}>Send a new reset link</button>
            <button className="auth-link-button" type="button" onClick={() => { setAuthLinkProblem(false); setAuthMode("signin"); setAuthMessage(""); updateClientLocation("/login", "replace"); }}>Back to sign in</button>
          </section>
        </div>
      </main>
    );
  }

  if (authRequired && !authSession) {
    return (
      <main className="auth-page">
        <div className="auth-layout">
          {authBrandPanel}
          <section className="auth-panel">
            <div className="auth-card-heading">
              <div className="auth-card-icon"><ShieldCheck size={23} /></div>
              <div>
                <span className="auth-kicker">Gross Printing secure access</span>
                <h2>{authMode === "forgot" ? "Reset your password" : authMode === "reset-sent" ? "Check your email" : "Welcome back"}</h2>
                <p>{authMode === "forgot" ? "We will email a secure password-reset link." : authMode === "reset-sent" ? "Use the newest password-reset email from Supabase." : "Use your Gross Printing account. We’ll open the correct workspace automatically."}</p>
              </div>
            </div>

            {authMode === "reset-sent" ? (
              <div className="auth-success-panel">
                <div className="auth-card-icon success"><CheckCircle2 size={23} /></div>
                <h3>Password-reset email sent</h3>
                <p>Open the newest email for <strong>{authEmail}</strong>. The link opens a page where you can enter and confirm a new password.</p>
                <button className="primary-button auth-submit" type="button" onClick={() => setAuthMode("forgot")}>Send another link</button>
                <button className="auth-link-button" type="button" onClick={() => { setAuthMode("signin"); setAuthMessage(""); }}>Back to sign in</button>
              </div>
            ) : authMode === "forgot" ? (
              <form className="auth-form" onSubmit={sendPasswordReset}>
                <label>
                  Email address
                  <span className="auth-input-wrap">
                    <Mail size={17} />
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      autoComplete="email"
                      placeholder="name@grossprinting.com"
                      autoFocus
                    />
                  </span>
                </label>
                <button className="primary-button auth-submit" type="submit" disabled={authBusy}>
                  {authBusy ? "Sending..." : "Send reset link"}
                  <ArrowRight size={17} />
                </button>
                <button
                  className="auth-link-button"
                  type="button"
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthMessage("");
                  }}
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <>
                <form className="auth-form" onSubmit={signInWithPassword}>
                  <label>
                    Email address
                    <span className="auth-input-wrap">
                      <Mail size={17} />
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(event) => setAuthEmail(event.target.value)}
                        autoComplete="email"
                        placeholder="name@grossprinting.com"
                        autoFocus
                      />
                    </span>
                  </label>
                  <label>
                    <span className="auth-label-row">
                      <span>Password</span>
                      <button
                        className="auth-link-button"
                        type="button"
                        onClick={() => {
                          setAuthMode("forgot");
                          setAuthMessage("");
                        }}
                      >
                        Forgot password?
                      </button>
                    </span>
                    <span className="auth-input-wrap">
                      <Lock size={17} />
                      <input
                        type={showAuthPassword ? "text" : "password"}
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        autoComplete="current-password"
                        placeholder="Your password"
                      />
                      <button className="auth-password-toggle" type="button" onClick={() => setShowAuthPassword((current) => !current)} aria-label={showAuthPassword ? "Hide password" : "Show password"}>
                        {showAuthPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </span>
                  </label>
                  <label className="auth-remember-simple">
                    <input
                      type="checkbox"
                      checked={rememberDays > 0}
                      onChange={(event) => setRememberDays(event.target.checked ? 30 : 0)}
                    />
                    <span>Keep me signed in on this computer</span>
                  </label>
                  <button className="primary-button auth-submit" type="submit" disabled={authBusy}>
                    {authBusy ? "Signing in..." : "Sign in"}
                    <ArrowRight size={17} />
                  </button>
                </form>

                {GOOGLE_AUTH_ENABLED ? (
                  <>
                    <div className="auth-divider"><span>or</span></div>
                    <button className="auth-google-button" type="button" onClick={signInWithGoogle} disabled={authBusy}>
                      <span className="google-mark">G</span>
                      Continue with Google
                    </button>
                  </>
                ) : null}
                <p className="auth-hint">Staff and customers use this same sign-in. New staff must still be invited and approved; new customers can <a href="/portal/signup">open a Customer Portal account</a>.</p>
              </>
            )}

            {authMessage ? <p className="auth-message" role="status">{authMessage}</p> : null}
          </section>
        </div>
      </main>
    );
  }

  if (authRequired && authSession?.setupMode) {
    const isRecovery = authSession.setupMode === "recovery";
    return (
      <main className="auth-page">
        <div className="auth-layout">
          {authBrandPanel}
          <section className="auth-panel">
            <div className="auth-card-heading">
              <div className="auth-card-icon"><Lock size={22} /></div>
              <div>
                <span className="auth-kicker">{isRecovery ? "Secure password reset" : "Invitation accepted"}</span>
                <h2>{isRecovery ? "Choose a new password" : "Finish your account"}</h2>
                <p>{authSession.email ? `Account: ${authSession.email}` : "Use at least 8 characters."}</p>
              </div>
            </div>
            <form className="auth-form" onSubmit={setInvitationPassword}>
              <label>
                New password
                <span className="auth-input-wrap">
                  <Lock size={17} />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={authNewPassword}
                    onChange={(event) => setAuthNewPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    autoFocus
                  />
                  <button className="auth-password-toggle" type="button" onClick={() => setShowNewPassword((current) => !current)} aria-label={showNewPassword ? "Hide password" : "Show password"}>
                    {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
              <label>
                Confirm password
                <span className="auth-input-wrap">
                  <Lock size={17} />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={authConfirmPassword}
                    onChange={(event) => setAuthConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Repeat the password"
                  />
                </span>
              </label>
              <div className="password-requirements">
                <span className={passwordChecks(authNewPassword).length ? "met" : ""}>At least 8 characters</span>
                <span className={passwordChecks(authNewPassword).letter ? "met" : ""}>Contains a letter</span>
                <span className={passwordChecks(authNewPassword).number ? "met" : ""}>Contains a number</span>
                <span className={authNewPassword && authNewPassword === authConfirmPassword ? "met" : ""}>Passwords match</span>
              </div>
              <button className="primary-button auth-submit" type="submit" disabled={authBusy}>
                {authBusy ? "Saving..." : "Save password and continue"}
                <ArrowRight size={17} />
              </button>
            </form>
            <button className="auth-link-button" type="button" onClick={signOut}>Cancel and sign out</button>
            {authMessage ? <p className="auth-message" role="status">{authMessage}</p> : null}
          </section>
        </div>
      </main>
    );
  }

  if (authRequired && authSession?.isActive === false) {
    return (
      <main className="auth-page">
        <div className="auth-layout">
          {authBrandPanel}
          <section className="auth-panel auth-pending-panel">
            <div className="auth-card-icon warning"><Lock size={23} /></div>
            <div>
              <span className="auth-kicker">Signed in successfully</span>
              <h2>Account approval is still needed</h2>
              <p>The login is valid, but this account cannot load Gross Printing shop data until an administrator activates it.</p>
            </div>
            <div className="auth-account-summary">
              <span>Account</span>
              <strong>{authSession.email ?? "Signed-in user"}</strong>
              <small>Requested role: {roleLabel(authSession.role)}</small>
            </div>
            <p className="auth-message info">Ask the Gross Printing Owner Administrator to activate this user under Owner Admin → Users.</p>
            <button className="auth-google-button" type="button" onClick={signOut}><LogOut size={17} />Sign out</button>
          </section>
        </div>
      </main>
    );
  }

  let content: React.ReactNode;
  if (!demoStateHydrated) {
    content = (
      <section className="workspace-opening-panel" aria-live="polite" aria-busy="true">
        <span className="workspace-opening-dot" aria-hidden="true" />
        <div>
          <strong>Opening your workspace</strong>
          <span>Loading the latest shop information securely…</span>
        </div>
      </section>
    );
  } else if (displayView === "Dashboard") {
    content = (
      <Dashboard
        jobs={jobs}
        quotes={quotes}
        invoices={invoices}
        customers={customers}
        onSelectJob={setSelectedJobId}
        onEditJob={editJob}
        onNavigate={navigateTo}
        onMoveJob={moveJob}
        onEnsureInvoice={ensureInvoiceForJob}
        portalRequests={portalRequests}
        onOpenPortalRequests={() => navigateTo("Portal Requests")}
      />
    );
  } else if (displayView === "Assigned Work") {
    content = (
      <Workflow
        mode="assigned"
        jobs={jobs}
        onMoveJob={moveJob}
        onSelectJob={setSelectedJobId}
        onEditJob={editJob}
        onImportJobs={importJobs}
        canEditJobs={false}
        canImportJobs={false}
        canViewPricing={currentRole === "admin" || currentRole === "front_desk"}
        routedTickets={emailIntakeTickets}
        currentUserId={authSession?.userId}
        currentRole={currentRole}
        authToken={authToken}
        onOpenRoutedTicket={(ticketId) => {
          const ticket = emailIntakeTickets.find((item) => item.id === ticketId);
          if (!ticket) return;
          setEstimateHandoffArtworkFile(undefined);
          setActiveIntakeTicketId(ticket.id);
          activateView("New Estimate / Job");
        }}
        onViewRoutedTicket={(ticketId) => {
          updateClientLocation(`/email-center?ticket=${encodeURIComponent(ticketId)}`);
        }}
        onCompleteRoutedTicket={completeRoutedEmailTicket}
      />
    );
  } else if (displayView === "Workflow") {
    content = (
      <Workflow
        mode="workflow"
        jobs={jobs}
        onMoveJob={moveJob}
        onSelectJob={setSelectedJobId}
        onEditJob={editJob}
        onImportJobs={importJobs}
        canEditJobs={currentRole === "admin"}
        canImportJobs={currentRole === "admin"}
        canViewPricing={currentRole === "admin" || currentRole === "front_desk"}
        routedTickets={emailIntakeTickets}
        currentUserId={authSession?.userId}
        currentRole={currentRole}
        authToken={authToken}
        onOpenRoutedTicket={(ticketId) => {
          const ticket = emailIntakeTickets.find((item) => item.id === ticketId);
          if (!ticket) return;
          setEstimateHandoffArtworkFile(undefined);
          setActiveIntakeTicketId(ticket.id);
          activateView("New Estimate / Job");
        }}
        onViewRoutedTicket={(ticketId) => {
          updateClientLocation(`/email-center?ticket=${encodeURIComponent(ticketId)}`);
        }}
        onCompleteRoutedTicket={completeRoutedEmailTicket}
      />
    );
  } else if (displayView === "Orders") {
    content = (
      <Orders
        orders={orders}
        jobs={jobs}
        quotes={quotes}
        invoices={invoices}
        onOpenJob={(jobId) => { activateView("Workflow"); setSelectedJobId(jobId); }}
        onOpenQuote={(quoteId) => { setFocusedQuoteId(quoteId); activateView("Quotes"); }}
        onOpenInvoice={(invoiceId) => { setFocusedInvoiceId(invoiceId); activateView("Invoices"); }}
        onArchiveOrder={(orderId) => {
          setOrders((current) => current.map((order) => order.id === orderId ? { ...order, archived: true, updatedAt: nowIso() } : order));
          setNotice("Order archived. Child jobs remain available in Workflow.");
        }}
      />
    );
  } else if (displayView === "New Estimate / Job") {
    content = (
      <NewEstimateJob
        customers={customers}
        paperStocks={paperStocks}
        catalogPrices={catalogPrices}
        quantityRateCurve={quantityRateCurve}
        productCategories={productCategories}
        productPresets={productPresets}
        onCreate={createEstimate}
        onAddCustomer={addCustomer}
        editingJob={editingJob}
        onUpdateJob={updateJob}
        onDirtyChange={setEstimateDirty}
        intakeTicket={activeIntakeTicket}
        sourceEmailAttachments={activeIntakeTicket ? emailSourceAttachmentsForTicket(activeIntakeTicket) : []}
        initialArtworkFile={estimateHandoffArtworkFile}
        portalRequest={activePortalRequest}
        authToken={authToken}
        onSaveAiLearning={saveAiLearningExample}
        initialCustomerId={estimateCustomerId}
        plannedJobNumber={editingJob?.jobNumber ?? nextPrefixedNumber(jobs.map((job) => job.jobNumber), "GP", 1052, numberingSettings.nextJobNumber)}
        currentRole={currentRole}
        onCancelEdit={() => {
          setEstimateDirty(false);
          setEditingJobId(undefined);
          setNotice("Edit cancelled.");
        }}
      />
    );
  } else if (displayView === "Quotes") {
    content = <Quotes quotes={quotes} jobs={jobs} onSendQuote={sendQuoteEmail} onConvertQuote={convertQuoteToJob} onArchiveQuote={archiveQuote} onImportQuotes={importQuotes} focusedQuoteId={focusedQuoteId} />;
  } else if (displayView === "Invoices") {
    content = (
      <Invoices
        invoices={invoices}
        jobs={jobs}
        onEmailInvoice={emailInvoice}
        onArchiveInvoice={archiveInvoice}
        onMarkInvoiceReady={markInvoiceReady}
        onImportInvoices={importInvoices}
        focusedInvoiceId={focusedInvoiceId}
      />
    );
  } else if (displayView === "Email Center") {
    content = (
      <EmailCenter
        key={`email-center-${clientSearch}`}
        threads={emailThreads}
        tickets={emailIntakeTickets}
        businessRules={emailBusinessRules}
        logs={emailLogs}
        templates={emailTemplates}
        customers={customers}
        jobs={jobs}
        learningExamples={aiLearningExamples}
        connectionLabel={emailConnectionLabel}
        syncing={emailSyncing}
        loadingOlder={emailLoadingOlder}
        hasMore={emailHasMore}
        onSync={() => void syncEmailInbox()}
        onLoadOlder={() => void loadOlderEmailHistory()}
        onSearchMailbox={searchFullMailbox}
        onSendNewMessage={sendNewEmailMessage}
        onCreateTicket={createEmailIntakeTicket}
        onUpdateTicket={updateEmailIntakeTicket}
        onRouteTicket={routeEmailIntakeTicket}
        onCreateCustomerFromEmail={createCustomerFromEmailTicket}
        onAddSenderAsContact={addEmailSenderAsCustomerContact}
        onStartEstimate={startEstimateFromEmailTicket}
        onQuickStartJob={quickStartJobFromEmail}
        onCreateMultiItemOrder={createMultiItemOrderFromEmail}
        onSendTicketReply={(ticketId, body) => sendEmailTicketReply(ticketId, body)}
        onLinkThreadToJob={linkEmailThreadToJob}
        onCombineThreads={combineEmailConversations}
        onSeparateMessage={separateEmailMessage}
        onSetBusinessCategory={setEmailBusinessCategory}
        onArchiveThread={archiveEmailThread}
        onUnarchiveThread={unarchiveEmailThread}
        onToggleStar={toggleEmailMessageStar}
        onSetMessageTags={setEmailMessageTags}
        onMarkThreadRead={markEmailThreadRead}
        onMarkThreadUnread={markEmailThreadUnread}
        onMarkMessageRead={markEmailMessageRead}
        onMarkMessageUnread={markEmailMessageUnread}
        onSendReply={(threadId, body) => void replyToEmailThread(threadId, body)}
        onDownloadAttachment={(threadId, messageId, attachmentId, action) => void downloadEmailAttachment(threadId, messageId, attachmentId, action)}
        onHydrateMessage={hydrateEmailMessage}
        onOpenJob={(jobId) => { activateView("Workflow"); setSelectedJobId(jobId); }}
        authToken={authToken}
        currentUserId={authSession?.userId}
        currentRole={currentRole}
        productCategories={productCategories}
        productPresets={productPresets}
        paperStocks={paperStocks}
        catalogPrices={catalogPrices}
        quantityRateCurve={quantityRateCurve}
      />
    );
  } else if (displayView === "Portal Requests") {
    content = (
      <PortalRequests
        key={`portal-requests-${clientSearch}`}
        requests={portalRequests}
        customers={customers}
        jobs={jobs}
        paperStocks={paperStocks}
        productPresets={productPresets}
        catalogPrices={catalogPrices}
        quantityRateCurve={quantityRateCurve}
        authToken={authToken}
        loading={portalRequestsLoading}
        onRefresh={() => void loadPortalRequestQueue()}
        onRequestsChange={setPortalRequests}
        onStartConversion={(request, mode) => {
          setEstimateHandoffArtworkFile(undefined);
          setActivePortalRequest({
            ...request,
            status: mode === "job" ? "Ready for Job" : "Ready for Quote"
          });
          setActiveIntakeTicketId(undefined);
          activateView("New Estimate / Job");
          setNotice(`${request.requestNumber ?? "Portal request"} opened in ${mode} setup.`);
        }}
        onLinkExistingJob={(request, jobId) => void linkPortalRequestToExistingJob(request, jobId)}
        onOpenJob={(jobId) => {
          activateView("Workflow");
          setSelectedJobId(jobId);
        }}
        onOpenCustomers={() => activateView("Customer Portal")}
      />
    );
  } else if (displayView === "Customer Portal") {
    content = (
      <CustomerPortal
        customers={customers}
        jobs={jobs}
        quotes={quotes}
        invoices={invoices}
        files={uploadedFiles}
        onAddCustomer={addCustomer}
        onUpdateCustomer={updateCustomer}
        onArchiveCustomer={archiveCustomer}
        onImportCustomers={importCustomers}
        onOpenFiles={(customerId) => {
          setFocusedCustomerId(customerId);
          activateView("Files");
        }}
        onOpenFile={(fileId) => { void openUploadedFile(fileId); }}
        onOpenJob={(jobId) => { activateView("Workflow"); setSelectedJobId(jobId); }}
        onStartEstimate={(customerId, mode) => {
          setEstimateCustomerId(customerId);
          setEstimateHandoffArtworkFile(undefined);
          setActiveIntakeTicketId(undefined);
          setActivePortalRequest(undefined);
          setEditingJobId(undefined);
          setEstimateDirty(false);
          activateView("New Estimate / Job");
          setNotice(`${mode === "job" ? "New Job Setup" : "New Quote"} opened for ${customers.find((item) => item.id === customerId)?.name ?? "customer"}.`);
        }}
        focusedCustomerId={focusedCustomerId}
        authToken={authToken}
        canManagePortal={currentRole === "admin"}
        canBulkManage={currentRole === "admin"}
      />
    );
  } else if (displayView === "Files") {
    content = <FilesWorkspace files={uploadedFiles} customers={customers} jobs={jobs} onUploadFiles={uploadFiles} onArchiveFile={archiveFile} onRestoreFile={restoreFile} onOpenFile={openUploadedFile} focusedCustomerId={focusedCustomerId} />;
  } else if (displayView === "Catalog") {
    content = (
      <Catalog
        paperStocks={paperStocks}
        productCategories={productCategories}
        productPresets={productPresets}
        prices={catalogPrices}
        machines={machines}
        quantityRateCurve={quantityRateCurve}
        onUpdateQuantityRateCurve={updateQuantityRateCurve}
        onAddProductCategory={addProductCategory}
        onRenameProductCategory={renameProductCategory}
        onRemoveProductCategory={removeProductCategory}
        onAddProductPreset={addProductPreset}
        onUpdateProductPreset={updateProductPreset}
        onRemoveProductPreset={removeProductPreset}
        onAddPaperStock={addPaperStock}
        onUpdatePaperStock={updatePaperStock}
        onRemovePaperStock={removePaperStock}
        onAddCatalogPrice={addCatalogPrice}
        onUpdateCatalogPrice={updateCatalogPrice}
        onRemoveCatalogPrice={removeCatalogPrice}
        onAddMachine={addMachine}
        onUpdateMachine={updateMachine}
        onRemoveMachine={removeMachine}
        onImportPaper={importPaper}
        onImportCatalog={importCatalog}
      />
    );
  } else if (displayView === "Time Learning") {
    content = <TimeLearning jobs={jobs} activeTimer={activeTimer} onStartTimer={startTimer} onStopTimer={stopTimer} onManualTime={addManualTime} />;
  } else if (displayView === "Back Office") {
    content = (
      <BackOffice
        state={currentPersistedState()}
        onRestoreBackup={restoreCompleteBackup}
        onRepairData={repairDataLinks}
        onOpenJob={(jobId) => {
          activateView("Workflow");
          setSelectedJobId(jobId);
        }}
        onOpenCustomer={(customerId) => {
          setFocusedCustomerId(customerId);
          activateView("Customer Portal");
        }}
        onOpenArchive={() => activateView("Settings")}
        onOpenFiles={() => {
          setFocusedCustomerId(undefined);
          activateView("Files");
        }}
        onImportCustomers={importCustomers}
        onImportJobs={importJobs}
        onImportQuotes={importQuotes}
        onImportInvoices={importInvoices}
        onImportPaper={importPaper}
        onImportCatalog={importCatalog}
      />
    );
  } else if (displayView === "Owner Operations") {
    content = (
      <OwnerOperations
        authToken={authToken}
        jobs={jobs}
        customers={customers}
        quotes={quotes}
        invoices={invoices}
        statusEvents={statusEvents}
        emailLogs={emailLogs}
        portalRequests={portalRequests}
        operationalActivities={operationalActivities}
        onOpenJob={(jobId) => {
          activateView("Workflow");
          setSelectedJobId(jobId);
        }}
        onOpenCustomer={(customerId) => {
          setFocusedCustomerId(customerId);
          activateView("Customer Portal");
        }}
      />
    );
  } else if (displayView === "Admin") {
    content = (
      <AdminCenter
        authToken={authToken}
        authEnabled={authRequired}
        currentUserId={authSession?.userId}
        currentUserEmail={authSession?.email}
      />
    );
  } else {
    content = (
      <Settings
        emailLogs={emailLogs}
        emailTemplates={emailTemplates}
        emailConnectionLabel={emailConnectionLabel}
        onUpdateEmailTemplate={updateEmailTemplate}
        onResetEmailTemplates={resetEmailTemplates}
        emailSafetySettings={emailSafety}
        onUpdateEmailSafetySettings={updateEmailSafetySettings}
        jobs={jobs}
        quotes={quotes}
        invoices={invoices}
        customers={customers}
        files={uploadedFiles}
        emailThreads={emailThreads}
        emailIntakeTickets={emailIntakeTickets}
        onRestoreJob={restoreJob}
        onRestoreQuote={restoreQuote}
        onRestoreInvoice={restoreInvoice}
        onRestoreCustomer={restoreCustomer}
        onRestoreFile={restoreFile}
        onRestoreEmailThread={unarchiveEmailThread}
        onRestoreEmailTicket={restoreArchivedEmailTicket}
        onTrashJob={trashJob}
        onTrashQuote={trashQuote}
        onTrashInvoice={trashInvoice}
        onTrashCustomer={trashCustomer}
        onTrashFile={trashFile}
        onOpenJob={(jobId) => {
          activateView("Workflow");
          setSelectedJobId(jobId);
        }}
        onOpenCustomer={(customerId) => {
          setFocusedCustomerId(customerId);
          activateView("Customer Portal");
        }}
        authToken={authToken}
        aiLearningExamples={aiLearningExamples}
        onClearAiLearning={clearAiLearningExamples}
        nextJobNumber={nextPrefixedNumber(jobs.map((job) => job.jobNumber), "GP", 1052, numberingSettings.nextJobNumber)}
        numberingSettings={numberingSettings}
        onSetNextJobNumber={(nextJobNumber) => {
          const normalized = Math.max(1, Math.floor(nextJobNumber));
          const candidate = `GP-${normalized}`;
          if (jobs.some((job) => job.jobNumber.toLowerCase() === candidate.toLowerCase())) {
            setNotice(`${candidate} is already used. Choose another next job number.`);
            return false;
          }
          setNumberingSettings({ nextJobNumber: normalized, updatedAt: nowIso(), updatedBy: currentEmployee.name });
          setNotice(`Next job number set to ${candidate}.`);
          return true;
        }}
        onUseAutomaticJobNumbering={() => {
          setNumberingSettings({});
          setNotice("Job numbering returned to automatic highest-existing mode.");
        }}
      />
    );
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "collapsed"}`}>
      {sidebarOpen ? <button className="sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" /> : null}
      <aside className="sidebar">
        <nav className="sidebar-navigation sidebar-navigation-clean" aria-label="Main navigation">
          {groupedVisibleMenu.map((section) => (
            <div className="nav-group" key={section.group}>
              <span className="nav-group-label">{navGroupLabels[section.group]}</span>
              <div className="nav-group-items">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = displayView === item.view;
                  const label = item.label ?? viewLabel(item.view);
                  return (
                    <button
                      className={isActive ? "active" : ""}
                      type="button"
                      key={item.id ?? item.view}
                      onClick={() => navigateTo(item.view)}
                      title={label}
                    >
                      <span className="nav-icon"><Icon size={18} /></span>
                      <span className="nav-label">{label}</span>
                      {item.view === "Portal Requests" && portalActiveCount ? (
                        <b className="nav-count-badge">{portalActiveCount}</b>
                      ) : null}
                      {item.view === "Email Center" && unreadEmailCount ? (
                        <b className="nav-count-badge">{unreadEmailCount}</b>
                      ) : null}
                      {item.view === "Assigned Work" && activeAssignedWorkCount ? (
                        <b className="nav-count-badge">{activeAssignedWorkCount}</b>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-account">
          <ShieldCheck size={17} />
          <span>
            <strong>{authSession?.displayName ?? authSession?.email ?? (DEMO_MODE ? "Demo workspace" : currentEmployee.name)}</strong>
            <small>{DEMO_MODE ? "Demo mode" : authSession?.isOwner ? "Owner Administrator" : roleLabel(currentRole)}</small>
          </span>
        </div>
        <button className="collapse-button" type="button" onClick={() => setSidebarOpen((current) => !current)}>
          {sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={18} />}
          <span>{sidebarOpen ? "Collapse menu" : "Expand menu"}</span>
        </button>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="icon-only mobile-menu" type="button" onClick={() => setSidebarOpen((current) => !current)} aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}>
            <Menu size={19} />
          </button>

          <div className="topbar-identity">
            <span className="topbar-view-icon" aria-hidden="true"><ActiveViewIcon size={19} /></span>
            <div className="topbar-copy">
              <strong>{viewLabel(displayView)}</strong>
              <span>{demoStateHydrated ? notice : "Opening latest workspace…"}</span>
            </div>
          </div>

          <div className="global-search">
            <Search size={17} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
              placeholder="Search jobs, customers, quotes, invoices..."
            />
            {searchFocused && searchQuery.trim() ? (
              <div className="search-results">
                {searchResults.length ? (
                  searchResults.map((result) => (
                    <button type="button" key={result.id} onMouseDown={() => openSearchResult(result)}>
                      <span>{result.kind}</span>
                      <strong>{result.label}</strong>
                      <small>{result.meta}</small>
                    </button>
                  ))
                ) : (
                  <p>No matches found.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="topbar-actions">
            <NotificationCenter
              portalRequests={portalRequests}
              emailTickets={emailIntakeTickets}
              customers={customers}
              readEmailIds={readEmailNotificationIds}
              onOpenPortalRequest={openPortalRequest}
              onOpenEmailTicket={openEmailTicketNotification}
              onMarkPortalRead={(requestId) => void patchPortalNotification(requestId, true)}
              onMarkAllPortalRead={() => void markAllPortalNotificationsRead()}
              onMarkEmailRead={markEmailNotificationRead}
              onMarkAllEmailRead={() =>
                setReadEmailNotificationIds(emailIntakeTickets.map((ticket) => ticket.id))
              }
            />
            {DEMO_MODE ? (
              <label className="operator-select">
                <span>Demo operator</span>
                <select value={currentEmployeeId} onChange={(event) => setCurrentEmployeeId(event.target.value)}>
                  {employees.map((employee) => (
                    <option value={employee.id} key={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {authRequired ? (
              <span className={`cloud-save-chip ${cloudSaveState} sync-${dataSyncState}`}>
                {cloudSaveState === "saving"
                  ? "Saving…"
                  : cloudSaveState === "error" || dataSyncState === "error"
                    ? "Sync issue"
                    : dataSyncState === "checking"
                      ? "Checking updates…"
                      : dataSyncState === "offline"
                        ? "Connection offline"
                        : "Up to date"}
              </span>
            ) : DEMO_MODE ? (
              <span className={`cloud-save-chip demo ${cloudSaveState}`}>
                {cloudSaveState === "error" ? "Server save issue" : cloudSaveState === "saving" ? "Saving securely..." : "Saved on server"}
              </span>
            ) : null}
            {authRequired ? (
              <button className="auth-chip" type="button" onClick={() => setShowSignOutConfirm(true)}>
                <LogOut size={16} />
                <span>
                  <b>{authSession?.displayName ?? authSession?.email ?? "Signed in"}</b>
                  <small>{authSession?.isOwner ? "Owner Administrator" : roleLabel(currentRole)}</small>
                </span>
              </button>
            ) : null}
          </div>
        </header>
        {emailSafety.mode !== "live" ? (
          <div className={`email-safety-banner ${emailSafety.mode}`}>
            <ShieldCheck size={17} />
            <div>
              <strong>{emailSafety.mode === "shadow" ? "SHADOW MODE — real customer email is blocked" : "TEST MODE — only approved test recipients can receive email"}</strong>
              <span>Incoming mail, real jobs, AI, and learning stay active. Testing outbox records what the MIS tried to send.</span>
            </div>
            <button type="button" onClick={() => activateView("Settings")}>Email safety settings</button>
          </div>
        ) : (
          <div className="email-safety-banner live">
            <Mail size={17} />
            <div><strong>LIVE EMAIL MODE</strong><span>Real customer emails can be sent.</span></div>
          </div>
        )}
        {content}
      </div>

      {selectedJob ? (
        <JobDrawer
          job={selectedJob}
          customer={selectedCustomer}
          quote={selectedQuote}
          invoice={selectedInvoice}
          files={uploadedFiles.filter((file) => file.jobId === selectedJob.id)}
          paperStocks={paperStocks}
          productPresets={productPresets}
          statusEvents={statusEvents.filter((event) => event.jobId === selectedJob.id)}
          emailThreads={emailThreads}
          intakeTicket={selectedIntakeTicket}
          portalRequest={selectedPortalRequest}
          parentOrder={selectedParentOrder}
          onClose={() => setSelectedJobId(null)}
          onEdit={editJob}
          onMoveJob={moveJob}
          onArchive={archiveJob}
          onUpdateNote={updateJobNote}
          onUpdateCustomerEmailSettings={updateJobCustomerEmailSettings}
          onManualTime={setManualTime}
          onOpenFile={openUploadedFile}
          onDownloadEmailAttachment={(threadId, messageId, attachmentId) => void downloadEmailAttachment(threadId, messageId, attachmentId)}
          canEdit={currentRole === "admin"}
          canArchive={currentRole === "admin"}
          canViewPricing={currentRole === "admin" || currentRole === "front_desk"}
          canManageTime={true}
          canUpdateNotes={true}
        />
      ) : null}

      {completionPrompt ? (() => {
        const promptJob = jobs.find((job) => job.id === completionPrompt.jobId);
        const promptInvoice = invoices.find((invoice) => invoice.id === completionPrompt.invoiceId);
        if (!promptJob || !promptInvoice) return null;
        return (
          <div className="modal-backdrop">
            <section className="leave-dialog completion-invoice-dialog" role="dialog" aria-modal="true" aria-labelledby="completion-invoice-title">
              <button className="leave-dialog-close" type="button" onClick={() => setCompletionPrompt(undefined)} aria-label="Close">
                <X size={18} />
              </button>
              <span className="completion-dialog-chip"><Receipt size={15} /> Job ready</span>
              <h2 id="completion-invoice-title">Draft invoice prepared for {promptJob.jobNumber}</h2>
              <p>{promptInvoice.invoiceNumber} was created as a draft for {promptJob.customerName}. Review it before it is emailed.</p>
              <div className="completion-dialog-summary">
                <span><small>Job</small><strong>{promptJob.title}</strong></span>
                <span><small>Invoice total</small><strong>{formatMoney(promptInvoice.amount)}</strong></span>
                <span><small>Status</small><strong>{promptInvoice.status}</strong></span>
              </div>
              <div className="leave-dialog-actions completion-dialog-actions">
                <button className="text-button" type="button" onClick={() => setCompletionPrompt(undefined)}>
                  Keep draft
                </button>
                <button className="icon-button text-button" type="button" onClick={() => {
                  setFocusedInvoiceId(promptInvoice.id);
                  setCompletionPrompt(undefined);
                  activateView("Invoices");
                }}>
                  Review invoice
                </button>
                <button className="primary-button" type="button" onClick={() => void emailInvoice(promptInvoice.id)}>
                  Email invoice now
                </button>
              </div>
            </section>
          </div>
        );
      })() : null}

      {leavePrompt ? (
        <div className="modal-backdrop">
          <section className="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-dialog-title">
            <button className="leave-dialog-close" type="button" onClick={stayOnEstimate} aria-label="Close">
              <X size={18} />
            </button>
            <h2 id="leave-dialog-title">You have not saved this estimate yet</h2>
            <p>Saving keeps a local draft in this demo. Leaving without saving clears the draft and the work on this form.</p>
            <div className="leave-dialog-actions">
              <button className="text-button" type="button" onClick={stayOnEstimate}>
                Stay here
              </button>
              <button className="icon-button text-button" type="button" onClick={saveDraftAndLeave}>
                Save draft and leave
              </button>
              <button className="primary-button" type="button" onClick={leaveWithoutSaving}>
                Leave without saving
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showSignOutConfirm ? (
        <div className="modal-backdrop">
          <section className="leave-dialog signout-dialog" role="dialog" aria-modal="true" aria-labelledby="signout-dialog-title">
            <button className="leave-dialog-close" type="button" onClick={() => setShowSignOutConfirm(false)} aria-label="Close">
              <X size={18} />
            </button>
            <h2 id="signout-dialog-title">Sign out?</h2>
            <p>You will need to sign in again before the Gross Printing database loads on this browser.</p>
            <div className="leave-dialog-actions">
              <button className="text-button" type="button" onClick={() => setShowSignOutConfirm(false)}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={signOut}>
                Sign Out
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? (
        <div className="app-toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  );
}
