"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  FolderOpen,
  History,
  Inbox,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  PackageCheck,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Repeat2,
  Send,
  ShieldCheck,
  Upload,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import {
  clearAuthLinkFromAddressBar,
  passwordChecks,
  readSupabaseEmailLinkFromBrowser,
  sendSupabasePasswordReset,
  updateSupabasePassword
} from "@/lib/supabase-auth-flow";
import { ProductMockup, productVisualFromName } from "@/components/website/ProductMockup";
import type {
  CustomerPortalData,
  CustomerPortalFile,
  CustomerPortalInvoice,
  CustomerPortalMessageThread,
  CustomerPortalOrder,
  CustomerPortalQuote,
  CustomerPortalProductType,
  CustomerPortalRequest,
  CustomerPortalRequestMetadata,
  CustomerPortalRequestPurpose,
  CustomerPortalRequestType
} from "@/lib/customer-portal-types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const DEMO_MODE = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const SESSION_KEY = "gross-printing-customer-portal-session-v1";
const PORTAL_CACHE_KEY = "gross-printing-customer-portal-cache-v1";
const DEMO_PORTAL_REQUESTS_KEY = "gross-printing-demo-portal-requests-v1";

type PortalSection = "overview" | "orders" | "updates" | "quotes" | "invoices" | "messages" | "files";

type PortalSession = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  displayName?: string;
  setupMode?: "invite" | "recovery";
};

function isPortalSessionExpired(session: PortalSession) {
  return Boolean(session.expiresAt && session.expiresAt < Date.now() + 60_000);
}

async function establishPortalServerSession(session: PortalSession): Promise<PortalSession> {
  if (!session.accessToken || !session.refreshToken) throw new Error("The secure Customer Portal session is incomplete.");
  const response = await fetch("/api/customer-portal/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: Math.max(60, Math.round(((session.expiresAt ?? Date.now() + 3600000) - Date.now()) / 1000))
    })
  });
  const payload = (await response.json().catch(() => ({}))) as { session?: PortalSession; error?: string };
  if (!response.ok || !payload.session) throw new Error(payload.error ?? "Secure Customer Portal sign-in could not be established.");
  return {
    ...payload.session,
    accessToken: session.setupMode ? session.accessToken : undefined,
    setupMode: session.setupMode
  };
}

async function readPortalServerSession(): Promise<PortalSession | null> {
  const response = await fetch("/api/customer-portal/session", {
    cache: "no-store",
    credentials: "same-origin"
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => ({}))) as { session?: PortalSession };
  return payload.session ?? null;
}

async function clearPortalServerSession() {
  await fetch("/api/customer-portal/session", {
    method: "DELETE",
    cache: "no-store",
    credentials: "same-origin"
  }).catch(() => undefined);
}

type ActionDialog = {
  type: CustomerPortalRequestType;
  title: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  order?: CustomerPortalOrder;
  noteLabel: string;
  notePlaceholder: string;
};

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "Unknown size";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024)).toLocaleString()} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function customerRequestStatus(request: CustomerPortalRequest) {
  if (request.status === "Missing Information" || request.status === "Waiting for Customer") {
    return "Waiting for information";
  }
  if (request.status === "Converted") {
    return request.conversionKind === "quote" ? "Quote ready" : "Order created";
  }
  if (["Closed", "Archived", "Completed"].includes(request.status)) return "Completed";
  if (["AI Reviewed", "Ready for Quote", "Ready for Job", "In Review"].includes(request.status)) {
    return "Under review";
  }
  return "Request received";
}

function safeText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character] ?? character));
}

function saveDemoPortalRequest(request: CustomerPortalRequest) {
  if (!DEMO_MODE || typeof window === "undefined") return;
  try {
    const current = JSON.parse(
      window.localStorage.getItem(DEMO_PORTAL_REQUESTS_KEY) ?? "[]"
    ) as unknown;
    const requests = Array.isArray(current)
      ? current.filter((item): item is CustomerPortalRequest => Boolean(item && typeof item === "object"))
      : [];
    window.localStorage.setItem(
      DEMO_PORTAL_REQUESTS_KEY,
      JSON.stringify([request, ...requests.filter((item) => item.id !== request.id)].slice(0, 100))
    );
  } catch {
    // The on-screen request history still updates when browser storage is unavailable.
  }
}

export function CustomerSelfServicePortal() {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "forgot" | "reset-sent" | "signup" | "signup-sent">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [authLinkProblem, setAuthLinkProblem] = useState(false);
  const [accessForm, setAccessForm] = useState({ companyName: "", contactName: "", email: "", phone: "", website: "" });
  const [data, setData] = useState<CustomerPortalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState<PortalSection>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [deepLinkedQuoteId, setDeepLinkedQuoteId] = useState<string>();
  const [deepLinkedInvoiceId, setDeepLinkedInvoiceId] = useState<string>();
  const [actionDialog, setActionDialog] = useState<ActionDialog>();
  const [actionNote, setActionNote] = useState("");
  const [reorderQuantity, setReorderQuantity] = useState<number | "">("");
  const [reorderDueDate, setReorderDueDate] = useState("");
  const [reorderSameArtwork, setReorderSameArtwork] = useState(true);
  const [reorderChanges, setReorderChanges] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [uploadMode, setUploadMode] = useState<"new_order" | "file_upload">("new_order");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [uploadJobId, setUploadJobId] = useState("");
  const [uploadFile, setUploadFile] = useState<File>();
  const [uploadMetadata, setUploadMetadata] = useState<CustomerPortalRequestMetadata>({
    requestPurpose: "quote",
    productType: "Business Cards",
    sides: 2,
    colorSpec: "4/4 full color",
    finishing: []
  });
  const [uploadBusy, setUploadBusy] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = useMemo(
    () =>
      session?.accessToken && !DEMO_MODE
        ? { Authorization: `Bearer ${session.accessToken}` }
        : undefined,
    [session?.accessToken]
  );

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (DEMO_MODE) {
      setSession({ email: "yossi@campahava.example" });
      setAuthReady(true);
      return;
    }
    // v0.6.7 removes persistent Customer Portal tokens and cached business data from browser storage.
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(PORTAL_CACHE_KEY);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (DEMO_MODE) {
      setSession({ email: "yossi@campahava.example" });
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    async function initializePortalAuth() {
      const linkResult = await readSupabaseEmailLinkFromBrowser();
      if (linkResult.error) {
        setAuthError(linkResult.error);
        setAuthLinkProblem(linkResult.hadAuthLink);
      }
      let nextSession: PortalSession | null = null;
      try {
        nextSession = linkResult.session
          ? await establishPortalServerSession({ ...linkResult.session })
          : await readPortalServerSession();
        if (nextSession && linkResult.hadAuthLink) {
          const cleanPath = !nextSession.setupMode && window.location.pathname.endsWith("/set-password") ? "/portal" : window.location.pathname;
          clearAuthLinkFromAddressBar(cleanPath);
        }
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "Secure Customer Portal sign-in could not be restored.");
        setAuthLinkProblem(linkResult.hadAuthLink);
      }
      const path = window.location.pathname;
      if (!nextSession && !linkResult.hadAuthLink && (path.endsWith("/reset-password") || path.endsWith("/set-password"))) {
        setAuthLinkProblem(true);
        setAuthError("Open the newest invitation or password-reset email. This page needs a valid secure link.");
      }
      if (cancelled) return;
      setSession(nextSession);
      if (path.endsWith("/forgot-password")) setAuthMode("forgot");
      else if (path.endsWith("/request-access") || path.endsWith("/signup")) setAuthMode("signup");
      else setAuthMode("signin");
      setAuthReady(true);
    }
    void initializePortalAuth();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!authReady || !session || session.setupMode) return;
    void loadPortalData();
  }, [authReady, session?.email, session?.setupMode]);

  useEffect(() => {
    if (!session || session.setupMode || DEMO_MODE) return;
    let refreshing = false;
    let stopped = false;
    const heartbeat = () => {
      if (refreshing) return;
      refreshing = true;
      void readPortalServerSession()
        .then((updated) => {
          if (stopped) return;
          if (!updated) {
            signOut(false);
            setAuthError("Your Customer Portal session expired. Sign in again.");
            return;
          }
          setSession((current) => current ? { ...current, ...updated } : updated);
        })
        .finally(() => {
          refreshing = false;
        });
    };
    void heartbeat();
    const timer = window.setInterval(heartbeat, 45_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session?.email, session?.setupMode]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (actionDialog?.type !== "reorder" || !actionDialog.order) return;
    setReorderQuantity(actionDialog.order.quantity);
    setReorderDueDate("");
    setReorderSameArtwork(true);
    setReorderChanges("");
    setActionNote("");
  }, [actionDialog?.type, actionDialog?.order?.id]);

  async function loadPortalData() {
    setLoading(true);
    setAuthError("");
    try {
      const response = await fetch("/api/customer-portal/data", {
        headers: authHeaders,
        credentials: "same-origin",
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as CustomerPortalData & { error?: string };
      if (!response.ok) {
        if (response.status === 401) signOut(false);
        throw new Error(payload.error || "Unable to load your Customer Portal.");
      }
      if (DEMO_MODE && typeof window !== "undefined") {
        try {
          const saved = JSON.parse(
            window.localStorage.getItem(DEMO_PORTAL_REQUESTS_KEY) ?? "[]"
          ) as unknown;
          if (Array.isArray(saved)) {
            const localRequests = saved.filter(
              (item): item is CustomerPortalRequest => Boolean(item && typeof item === "object")
            );
            payload.requests = [
              ...localRequests,
              ...payload.requests.filter(
                (request) => !localRequests.some((local) => local.id === request.id)
              )
            ];
          }
        } catch {
          window.localStorage.removeItem(DEMO_PORTAL_REQUESTS_KEY);
        }
      }
      payload.notifications = payload.notifications ?? [];
      setData(payload);
      let deepLinked = false;
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const jobId = params.get("job");
        const quoteId = params.get("quote");
        const invoiceId = params.get("invoice");
        if (jobId && payload.orders.some((order) => order.id === jobId)) {
          setSelectedOrderId(jobId);
          setDeepLinkedQuoteId(undefined);
          setDeepLinkedInvoiceId(undefined);
          setSection("orders");
          deepLinked = true;
        } else if (quoteId && payload.quotes.some((quote) => quote.id === quoteId)) {
          setDeepLinkedQuoteId(quoteId);
          setDeepLinkedInvoiceId(undefined);
          setSection("quotes");
          deepLinked = true;
        } else if (invoiceId && payload.invoices.some((invoice) => invoice.id === invoiceId)) {
          setDeepLinkedInvoiceId(invoiceId);
          setDeepLinkedQuoteId(undefined);
          setSection("invoices");
          deepLinked = true;
        }
      }
      if (!deepLinked) setSelectedOrderId((current) => current ?? payload.orders[0]?.id);
      setSelectedThreadId((current) => current ?? payload.messages[0]?.id);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to load your Customer Portal.");
    } finally {
      setLoading(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      setAuthError("Customer Portal authentication is not configured.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch("/api/customer-portal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      const payload = (await response.json().catch(() => ({}))) as { session?: PortalSession; error?: string };
      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "Email or password is incorrect.");
      }
      const nextSession = payload.session;
      setSession(nextSession);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function finishAccountSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.accessToken) {
      setAuthLinkProblem(true);
      setAuthError("This invitation or password-reset link is invalid or expired.");
      return;
    }
    const checks = passwordChecks(newPassword);
    if (!checks.length || !checks.letter || !checks.number) {
      setAuthError("Use at least 8 characters with a letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError("The passwords do not match.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await updateSupabasePassword(session.accessToken, newPassword);
      const nextSession = { ...session, accessToken: undefined, refreshToken: undefined, setupMode: undefined };
      setSession(nextSession);
      setNewPassword("");
      setConfirmPassword("");
      setAuthLinkProblem(false);
      setNotice(session.setupMode === "recovery" ? "Your password was changed successfully." : "Your Customer Portal account is ready.");
      window.history.replaceState({}, "", "/portal");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to complete account setup.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function sendPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setAuthError("Enter the email address used for your Customer Portal account.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await sendSupabasePasswordReset(normalized, `${window.location.origin}/portal/reset-password`);
      setAuthMode("reset-sent");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to send the password-reset email.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function createPortalAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessForm.companyName.trim() || !accessForm.contactName.trim() || !/^\S+@\S+\.\S+$/.test(accessForm.email.trim())) {
      setAuthError("Enter your business name, contact name, and a valid email address.");
      return;
    }
    const checks = passwordChecks(signupPassword);
    if (!checks.length || !checks.letter || !checks.number) {
      setAuthError("Use at least 8 characters with a letter and a number.");
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setAuthError("The passwords do not match.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch("/api/customer-portal/signup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...accessForm, password: signupPassword })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        session?: PortalSession;
        requiresEmailConfirmation?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to create the Customer Portal account.");
      if (payload.session) {
        const nextSession = payload.session.accessToken && payload.session.refreshToken
          ? await establishPortalServerSession(payload.session)
          : payload.session;
        setSession(nextSession);
        setEmail(accessForm.email.trim().toLowerCase());
        setSignupPassword("");
        setSignupConfirmPassword("");
        window.history.replaceState({}, "", "/portal");
        return;
      }
      setEmail(accessForm.email.trim().toLowerCase());
      setSignupPassword("");
      setSignupConfirmPassword("");
      setAuthMode("signup-sent");
      setAuthError("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to create the Customer Portal account.");
    } finally {
      setAuthBusy(false);
    }
  }

  function signOut(showNotice = true) {
    if (!DEMO_MODE) void clearPortalServerSession();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(PORTAL_CACHE_KEY);
    }
    setSession(null);
    setData(null);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setAuthMode("signin");
    setAuthLinkProblem(false);
    if (showNotice) setNotice("Signed out of the Customer Portal.");
  }

  async function submitAction() {
    if (!actionDialog || actionBusy) return;
    setActionBusy(true);
    try {
      const response = await fetch("/api/customer-portal/action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          type: actionDialog.type,
          title:
            actionDialog.type === "reorder" && actionDialog.order
              ? `Reorder ${actionDialog.order.jobNumber} — ${actionDialog.order.title}`
              : actionDialog.title,
          note:
            actionDialog.type === "reorder"
              ? reorderChanges.trim() || "Reorder requested with no additional changes."
              : actionNote,
          jobId: actionDialog.jobId,
          quoteId: actionDialog.quoteId,
          invoiceId: actionDialog.invoiceId,
          metadata:
            actionDialog.type === "reorder" && actionDialog.order
              ? {
                  requestPurpose: "reorder",
                  productType: actionDialog.order.productType ?? "Other",
                  sourceJobId: actionDialog.order.id,
                  sourceJobNumber: actionDialog.order.jobNumber,
                  sourceJobTitle: actionDialog.order.title,
                  previousQuantity: actionDialog.order.quantity,
                  quantity: typeof reorderQuantity === "number" ? reorderQuantity : actionDialog.order.quantity,
                  finishedWidth: Number(actionDialog.order.finishedSize.split(/[×x]/)[0]?.trim()) || undefined,
                  finishedHeight: Number(actionDialog.order.finishedSize.split(/[×x]/)[1]?.trim()) || undefined,
                  sides: actionDialog.order.sides,
                  colorSpec: actionDialog.order.colorSpec,
                  paperPreference: actionDialog.order.stockName,
                  finishing: actionDialog.order.finishing,
                  dueDate: reorderDueDate || undefined,
                  useSameArtwork: reorderSameArtwork,
                  changesRequested: reorderChanges.trim(),
                  originalArtworkName: actionDialog.order.artworkName
                }
              : undefined
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        request?: CustomerPortalRequest;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to submit this request.");
      setNotice(payload.message ?? "Request submitted.");
      if (payload.request && data) {
        saveDemoPortalRequest(payload.request);
        setData({ ...data, requests: [payload.request, ...data.requests] });
      } else {
        await loadPortalData();
      }
      setActionDialog(undefined);
      setActionNote("");
      setReorderQuantity("");
      setReorderDueDate("");
      setReorderSameArtwork(true);
      setReorderChanges("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to submit this request.");
    } finally {
      setActionBusy(false);
    }
  }

  async function uploadCustomerFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadBusy || (uploadMode === "file_upload" && !uploadFile)) return;
    setUploadBusy(true);
    try {
      const structuredMetadata = {
        ...uploadMetadata,
        requestPurpose: uploadMode === "file_upload"
          ? "existing_upload"
          : uploadMetadata.requestPurpose ?? "quote"
      };
      let response: Response;
      if (uploadFile) {
        const formData = new FormData();
        formData.set("file", uploadFile);
        formData.set("requestType", uploadMode);
        formData.set("title", uploadTitle.trim() || uploadFile.name);
        formData.set("note", uploadNote);
        formData.set("metadata", JSON.stringify(structuredMetadata));
        if (uploadJobId) formData.set("jobId", uploadJobId);
        response = await fetch("/api/customer-portal/upload", {
          method: "POST",
          credentials: "same-origin",
          headers: authHeaders,
          body: formData
        });
      } else {
        response = await fetch("/api/customer-portal/action", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            type: "new_order",
            title: uploadTitle.trim(),
            note: uploadNote,
            metadata: structuredMetadata
          })
        });
      }
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        request?: CustomerPortalRequest;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to upload this file.");
      setNotice(payload.message ?? "File uploaded.");
      setUploadFile(undefined);
      setUploadTitle("");
      setUploadNote("");
      setUploadJobId("");
      setUploadMetadata({
        requestPurpose: "quote",
        productType: "Business Cards",
        sides: 2,
        colorSpec: "4/4 full color",
        finishing: []
      });
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      if (payload.request && data) {
        saveDemoPortalRequest(payload.request);
        setData({ ...data, requests: [payload.request, ...data.requests] });
      }
      await loadPortalData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to upload this file.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function openFile(file: CustomerPortalFile, download = false) {
    const pending = window.open("about:blank", "_blank");
    try {
      const response = await fetch(
        `/api/customer-portal/file?id=${encodeURIComponent(file.id)}${download ? "&download=1" : ""}`,
        { headers: authHeaders, cache: "no-store" }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Unable to open this file.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (download) {
        pending?.close();
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } else if (pending) {
        pending.opener = null;
        pending.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      pending?.close();
      setNotice(error instanceof Error ? error.message : "Unable to open this file.");
    }
  }

  function printInvoice(invoice: CustomerPortalInvoice) {
    if (!data) return;
    const printWindow = window.open("", "_blank", "width=860,height=720");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>${safeText(invoice.invoiceNumber)}</title><style>
      body{font-family:Arial,sans-serif;margin:40px;color:#17212b}header{display:flex;justify-content:space-between;border-bottom:2px solid #9a6810;padding-bottom:18px}.amount{font-size:26px;font-weight:800;color:#79500b}.box{margin-top:24px;border:1px solid #d9e0e5;border-radius:10px;padding:18px}table{width:100%;border-collapse:collapse}td{padding:10px;border-bottom:1px solid #e3e8eb}td:first-child{color:#687580;width:34%}@media print{body{margin:20px}}</style></head><body>
      <header><div><h1>Gross Printing</h1><p>${safeText(invoice.invoiceNumber)}</p></div><div class="amount">${safeText(formatMoney(invoice.amount))}</div></header>
      <div class="box"><h2>${safeText(invoice.title)}</h2><table><tr><td>Customer</td><td>${safeText(data.profile.customerName)}</td></tr><tr><td>Invoice date</td><td>${safeText(formatDate(invoice.createdAt))}</td></tr><tr><td>Status</td><td>${safeText(invoice.status)}</td></tr><tr><td>Amount</td><td>${safeText(formatMoney(invoice.amount))}</td></tr></table></div>
      ${invoice.lineItems?.length ? `<div class="box"><h2>Order items</h2><table>${invoice.lineItems.map((line) => `<tr><td>${safeText(line.title)}<br><small>${safeText(`${line.quantity.toLocaleString()} pcs${line.description ? ` · ${line.description}` : ""}`)}</small></td><td>${safeText(formatMoney(line.amount))}</td></tr>`).join("")}</table></div>` : ""}
      <script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  }

  useEffect(() => {
    if (!authReady || session || authLinkProblem || authMode !== "signin" || typeof window === "undefined") return;
    if (window.location.pathname === "/portal" || window.location.pathname === "/portal/login") {
      window.location.replace("/login?next=portal");
    }
  }, [authReady, session, authLinkProblem, authMode]);

  const selectedOrder = data?.orders.find((order) => order.id === selectedOrderId);
  const selectedThread = data?.messages.find((thread) => thread.id === selectedThreadId);
  const proofsByJob = useMemo(() => {
    const map = new Map<string, CustomerPortalFile[]>();
    for (const file of data?.files ?? []) {
      if (!file.jobId || !file.canApproveProof) continue;
      const list = map.get(file.jobId) ?? [];
      list.push(file);
      map.set(file.jobId, list);
    }
    return map;
  }, [data?.files]);

  if (!authReady) {
    return (
      <div className="customer-portal-fast-start" aria-live="polite">
        <aside aria-hidden="true"><div /><span /><span /><span /></aside>
        <section><header><div /><div /></header><p><LoaderCircle className="spin" size={18} />Verifying your saved portal session…</p></section>
      </div>
    );
  }

  if (!session) {
    const redirectingToSharedLogin = typeof window !== "undefined" && authMode === "signin" && !authLinkProblem && (window.location.pathname === "/portal" || window.location.pathname === "/portal/login");
    if (redirectingToSharedLogin) {
      return (
        <div className="customer-portal-fast-start" aria-live="polite">
          <aside aria-hidden="true"><div /><span /><span /><span /></aside>
          <section><header><div /><div /></header><p><LoaderCircle className="spin" size={18} />Opening secure sign in…</p></section>
        </div>
      );
    }
    if (authLinkProblem) {
      return (
        <main className="customer-portal-auth-page">
          <section className="customer-portal-auth-card">
            <div className="customer-portal-brand"><img src="/brand/gross-printing-mark.png" alt="Gross Printing" /><div><strong>Gross Printing</strong><span>Customer Portal</span></div></div>
            <div className="customer-portal-auth-copy"><span className="portal-secure-chip"><AlertTriangle size={15} />Account link problem</span><h1>This link cannot be used</h1><p>{authError || "The invitation or password-reset link is invalid, expired, or was already used."}</p></div>
            <button className="portal-primary-button" type="button" onClick={() => { setAuthLinkProblem(false); setAuthMode("forgot"); setAuthError(""); }}>Send a new reset link</button>
            <button className="portal-text-button" type="button" onClick={() => { setAuthLinkProblem(false); setAuthMode("signin"); setAuthError(""); window.history.replaceState({}, "", "/portal/login"); }}>Back to sign in</button>
          </section>
        </main>
      );
    }

    return (
      <main className="customer-portal-auth-page">
        <section className="customer-portal-auth-card customer-portal-auth-card-wide">
          <div className="customer-portal-brand">
            <img src="/brand/gross-printing-mark.png" alt="Gross Printing" />
            <div><strong>Gross Printing</strong><span>Customer Portal</span></div>
          </div>

          {authMode === "signin" ? (
            <>
              <div className="customer-portal-auth-copy">
                <span className="portal-secure-chip"><ShieldCheck size={15} />Private customer access</span>
                <h1>Sign in to your orders</h1>
                <p>View your orders, quotes, invoices, proofs, messages, and uploaded files.</p>
              </div>
              <form className="customer-portal-auth-form" onSubmit={signIn}>
                <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
                <label>
                  <span className="portal-auth-label-row"><span>Password</span><button type="button" onClick={() => { setAuthMode("forgot"); setAuthError(""); }}>Forgot password?</button></span>
                  <span className="portal-auth-password-wrap">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                    <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </span>
                </label>
                {authError ? <div className="portal-error"><AlertTriangle size={16} />{authError}</div> : null}
                <button className="portal-primary-button" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{authBusy ? "Signing in..." : "Sign in"}</button>
              </form>
              <div className="portal-auth-secondary-actions">
                <button type="button" onClick={() => { setAuthMode("signup"); setAuthError(""); window.history.replaceState({}, "", "/portal/signup"); }}><Plus size={16} />Open a new account</button>
                <span>Already invited? Open the newest invitation email to create your password.</span>
              </div>
            </>
          ) : null}

          {authMode === "forgot" ? (
            <>
              <div className="customer-portal-auth-copy"><span className="portal-secure-chip"><ShieldCheck size={15} />Password recovery</span><h1>Reset your password</h1><p>We will email a secure link that opens the new-password page.</p></div>
              <form className="customer-portal-auth-form" onSubmit={sendPasswordReset}>
                <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus /></label>
                {authError ? <div className="portal-error"><AlertTriangle size={16} />{authError}</div> : null}
                <button className="portal-primary-button" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={17} /> : <Mail size={17} />}{authBusy ? "Sending..." : "Send reset link"}</button>
                <button className="portal-text-button" type="button" onClick={() => { setAuthMode("signin"); setAuthError(""); window.history.replaceState({}, "", "/portal/login"); }}>Back to sign in</button>
              </form>
            </>
          ) : null}

          {authMode === "reset-sent" ? (
            <div className="portal-auth-success">
              <CheckCircle2 size={28} />
              <h1>Check your email</h1>
              <p>Open the newest password-reset email for <strong>{email}</strong>. The link opens a page where you can enter and confirm a new password.</p>
              <button className="portal-primary-button" type="button" onClick={() => setAuthMode("forgot")}>Send another link</button>
              <button className="portal-text-button" type="button" onClick={() => { setAuthMode("signin"); window.history.replaceState({}, "", "/portal/login"); }}>Back to sign in</button>
            </div>
          ) : null}

          {authMode === "signup" ? (
            <>
              <div className="customer-portal-auth-copy"><span className="portal-secure-chip"><UserRound size={15} />New customer account</span><h1>Open your Customer Portal</h1><p>Create your own secure account. After your email is verified, Gross Printing will automatically create your customer record and private portal.</p></div>
              <form className="customer-portal-auth-form portal-access-request-form" onSubmit={createPortalAccount}>
                <div className="portal-auth-grid"><label>Business / customer name<input value={accessForm.companyName} onChange={(event) => setAccessForm({ ...accessForm, companyName: event.target.value })} autoComplete="organization" required /></label><label>Contact name<input value={accessForm.contactName} onChange={(event) => setAccessForm({ ...accessForm, contactName: event.target.value })} autoComplete="name" required /></label></div>
                <div className="portal-auth-grid"><label>Email<input type="email" value={accessForm.email} onChange={(event) => setAccessForm({ ...accessForm, email: event.target.value })} autoComplete="email" required /></label><label>Phone<input value={accessForm.phone} onChange={(event) => setAccessForm({ ...accessForm, phone: event.target.value })} autoComplete="tel" /></label></div>
                <label>Password<span className="portal-auth-password-wrap"><input type={showSignupPassword ? "text" : "password"} minLength={8} value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} autoComplete="new-password" required /><button type="button" onClick={() => setShowSignupPassword((current) => !current)} aria-label={showSignupPassword ? "Hide password" : "Show password"}>{showSignupPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
                <label>Confirm password<input type={showSignupPassword ? "text" : "password"} minLength={8} value={signupConfirmPassword} onChange={(event) => setSignupConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
                <div className="password-requirements portal-password-requirements"><span className={passwordChecks(signupPassword).length ? "met" : ""}>At least 8 characters</span><span className={passwordChecks(signupPassword).letter ? "met" : ""}>Contains a letter</span><span className={passwordChecks(signupPassword).number ? "met" : ""}>Contains a number</span><span className={signupPassword && signupPassword === signupConfirmPassword ? "met" : ""}>Passwords match</span></div>
                <label className="portal-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={accessForm.website} onChange={(event) => setAccessForm({ ...accessForm, website: event.target.value })} /></label>
                <div className="portal-form-note"><ShieldCheck size={15} /><span>Your portal starts with quote approval required and automatic pricing turned off. Gross Printing can enable special pricing for your account later.</span></div>
                {authError ? <div className="portal-error"><AlertTriangle size={16} />{authError}</div> : null}
                <button className="portal-primary-button" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={17} /> : <UserRound size={17} />}{authBusy ? "Creating account..." : "Create my account"}</button>
                <button className="portal-text-button" type="button" onClick={() => { setAuthMode("signin"); setAuthError(""); window.history.replaceState({}, "", "/portal/login"); }}>Already have an account? Sign in</button>
              </form>
            </>
          ) : null}

          {authMode === "signup-sent" ? (
            <div className="portal-auth-success">
              <CheckCircle2 size={28} />
              <h1>Check your email</h1>
              <p>We sent a confirmation link to <strong>{email}</strong>. Open it once to verify your email. Your Gross Printing customer record and portal will then be created automatically.</p>
              <button className="portal-primary-button" type="button" onClick={() => { setAuthMode("signin"); window.history.replaceState({}, "", "/portal/login"); }}>Return to sign in</button>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  if (session.setupMode) {
    const isRecovery = session.setupMode === "recovery";
    const checks = passwordChecks(newPassword);
    return (
      <main className="customer-portal-auth-page">
        <section className="customer-portal-auth-card">
          <div className="customer-portal-brand"><img src="/brand/gross-printing-mark.png" alt="Gross Printing" /><div><strong>Gross Printing</strong><span>Customer Portal</span></div></div>
          <div className="customer-portal-auth-copy"><span className="portal-secure-chip"><ShieldCheck size={15} />{isRecovery ? "Secure password reset" : "Secure account setup"}</span><h1>{isRecovery ? "Choose a new password" : "Create your password"}</h1><p>Enter the new password twice. This page is shown only after a valid invitation or reset link.</p></div>
          <form className="customer-portal-auth-form" onSubmit={finishAccountSetup}>
            <label>New password<span className="portal-auth-password-wrap"><input type={showNewPassword ? "text" : "password"} minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required autoFocus /><button type="button" onClick={() => setShowNewPassword((current) => !current)} aria-label={showNewPassword ? "Hide password" : "Show password"}>{showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
            <label>Confirm new password<input type={showNewPassword ? "text" : "password"} minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
            <div className="password-requirements portal-password-requirements"><span className={checks.length ? "met" : ""}>At least 8 characters</span><span className={checks.letter ? "met" : ""}>Contains a letter</span><span className={checks.number ? "met" : ""}>Contains a number</span><span className={newPassword && newPassword === confirmPassword ? "met" : ""}>Passwords match</span></div>
            {authError ? <div className="portal-error"><AlertTriangle size={16} />{authError}</div> : null}
            <button className="portal-primary-button" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}{authBusy ? "Saving..." : isRecovery ? "Save new password" : "Finish account setup"}</button>
          </form>
        </section>
      </main>
    );
  }

  if (loading && !data) {
    return (
      <div className="customer-portal-fast-start" aria-live="polite">
        <aside aria-hidden="true"><div /><span /><span /><span /></aside>
        <section><header><div /><div /></header><p><LoaderCircle className="spin" size={18} />Opening your saved orders…</p></section>
      </div>
    );
  }

  if (!data) {
    return (
      <main className="customer-portal-auth-page"><section className="customer-portal-auth-card"><div className="customer-portal-brand"><img src="/brand/gross-printing-mark.png" alt="Gross Printing" /><div><strong>Gross Printing</strong><span>Customer Portal</span></div></div><div className="portal-error"><AlertTriangle size={18} />{authError || "Unable to load your portal."}</div><button className="portal-primary-button" type="button" onClick={() => void loadPortalData()}><RefreshCw size={17} />Try again</button><button className="portal-text-button" type="button" onClick={() => signOut()}><LogOut size={16} />Sign out</button></section></main>
    );
  }

  const navItems: Array<{ id: PortalSection; label: string; icon: typeof Inbox; count?: number }> = [
    { id: "orders", label: "Order Status", icon: PackageCheck, count: data.orders.length },
    { id: "files", label: "Upload / New Request", icon: Upload, count: data.requests.length },
    { id: "quotes", label: "Quotes", icon: FileCheck2, count: data.summary.openQuotes },
    { id: "invoices", label: "Invoices", icon: ReceiptText, count: data.summary.openInvoices },
    { id: "messages", label: "Messages", icon: Mail, count: data.messages.length },
    { id: "updates", label: "Order Updates", icon: Bell, count: data.notifications.length }
  ];

  const portalProductNav: CustomerPortalProductType[] = [
    "Business Cards",
    "Flyers / Brochures",
    "Booklets",
    "Labels / Stickers",
    "Envelopes",
    "Invitations",
    "Signs / Banners",
    "Copies"
  ];

  const featuredOrder = data.orders.find((order) => !["Completed", "Cancelled"].includes(order.status)) ?? data.orders[0];
  const openNewPrintRequest = (productType?: CustomerPortalProductType) => {
    setUploadMode("new_order");
    if (productType) {
      setUploadMetadata((current) => ({ ...current, productType, finishing: [] }));
    }
    setSection("files");
    setAccountMenuOpen(false);
    setMobileMenu(false);
  };

  const orderGroups = Array.from(
    data.orders.reduce((groups, order) => {
      const key = order.parentOrderId || order.id;
      const current = groups.get(key) ?? [];
      current.push(order);
      groups.set(key, current);
      return groups;
    }, new Map<string, CustomerPortalOrder[]>()).values()
  ).sort((a, b) => new Date(b[0]?.updatedAt ?? 0).getTime() - new Date(a[0]?.updatedAt ?? 0).getTime());

  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const filteredOrderGroups = normalizedOrderSearch
    ? orderGroups.filter((group) => group.some((order) => [order.parentOrderNumber, order.jobNumber, order.title, order.status, order.artworkName].filter(Boolean).join(" ").toLowerCase().includes(normalizedOrderSearch)))
    : orderGroups;

  const customerImageFile = (order: CustomerPortalOrder) =>
    data.files.find((file) => file.jobId === order.id && file.type.toLowerCase().startsWith("image/"));

  return (
    <div className="customer-portal-storefront-shell">
      <header className="portal-store-header">
        <div className="portal-store-header-main">
          <button className="portal-menu-button storefront" type="button" onClick={() => setMobileMenu((current) => !current)} aria-label="Open navigation"><Menu size={20} /></button>
          <button className="portal-store-brand" type="button" onClick={() => { setSection("overview"); setAccountMenuOpen(false); }}>
            <img src="/brand/gross-printing-mark.png" alt="Gross Printing" />
            <span><strong>Gross Printing</strong><small>Customer Account</small></span>
          </button>
          <nav className={`portal-store-main-nav ${mobileMenu ? "open" : ""}`}>
            <button className={section === "overview" ? "active" : ""} type="button" onClick={() => { setSection("overview"); setMobileMenu(false); }}>All Products <ChevronDown size={13} /></button>
            <button className={section === "orders" ? "active" : ""} type="button" onClick={() => { setSection("orders"); setMobileMenu(false); }}>Orders</button>
            <button className={section === "files" ? "active" : ""} type="button" onClick={() => { setUploadMode("file_upload"); setSection("files"); setMobileMenu(false); }}>Upload</button>
            <button className={section === "quotes" ? "active" : ""} type="button" onClick={() => { setSection("quotes"); setMobileMenu(false); }}>Quotes</button>
            <button className={section === "invoices" ? "active" : ""} type="button" onClick={() => { setSection("invoices"); setMobileMenu(false); }}>Invoices</button>
          </nav>
          <div className="portal-store-header-actions">
            {data.demo ? <span className="portal-demo-chip">Demo portal</span> : null}
            <button className="portal-store-request-button" type="button" onClick={() => openNewPrintRequest()}><Plus size={16} />New order</button>
            <div className="portal-account-menu-wrap">
              <button className="portal-account-trigger" type="button" onClick={() => setAccountMenuOpen((current) => !current)}>
                <UserRound size={18} /><span>Welcome, <strong>{data.profile.displayName || data.profile.customerName}</strong></span><ChevronDown size={15} />
              </button>
              {accountMenuOpen ? (
                <div className="portal-account-popover">
                  <header><strong>{data.profile.displayName || data.profile.customerName}</strong><small>{data.profile.email}</small></header>
                  <div className="portal-account-link-grid">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      return <button type="button" key={item.id} onClick={() => { setSection(item.id); setAccountMenuOpen(false); }}><Icon size={15} /><span>{item.label}</span>{typeof item.count === "number" ? <b>{item.count}</b> : null}</button>;
                    })}
                  </div>
                  <button className="portal-account-signout" type="button" onClick={() => signOut()}><LogOut size={15} />Sign out</button>
                </div>
              ) : null}
            </div>
            <button className="portal-icon-button" type="button" onClick={() => void loadPortalData()} title="Refresh"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
          </div>
        </div>
        {section === "overview" ? (
          <nav className="portal-store-product-nav" aria-label="Print product categories">
            {portalProductNav.map((item) => <button type="button" key={item} onClick={() => openNewPrintRequest(item)}>{item}</button>)}
            <button type="button" onClick={() => openNewPrintRequest("Other")}>Other / Custom</button>
          </nav>
        ) : null}
      </header>

      <main className="customer-portal-store-main">
        {notice ? <div className="portal-notice"><CheckCircle2 size={17} /><span>{notice}</span><button type="button" onClick={() => setNotice("")}><X size={15} /></button></div> : null}

        {section === "overview" ? (
          <div className="portal-page portal-store-home">
            <section className="portal-order-status-heading">
              <div><p>Customer account</p><h1>Order Status</h1><span>Current work and previous orders, with customer-facing status only.</span></div>
              <div className="portal-order-search"><Search size={17} /><input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Search job #, order, artwork, or name..." /></div>
            </section>

            <section className="portal-store-order-stack">
              {filteredOrderGroups.slice(0, 6).map((group) => {
                const first = group[0];
                if (!first) return null;
                const groupNumber = first.parentOrderNumber || first.jobNumber;
                const completedCount = group.filter((item) => ["Ready for pickup", "Completed"].includes(item.status)).length;
                return (
                  <article className="portal-store-order-card" key={first.parentOrderId || first.id}>
                    <header>
                      <div><span>Order#</span><strong>{groupNumber}</strong><small>{formatDate(first.createdAt)}</small></div>
                      <div className="portal-order-card-header-actions"><span>{group.length > 1 ? `${completedCount} of ${group.length} items ready/completed` : first.status}</span><button type="button" onClick={() => { setSelectedOrderId(first.id); setSection("orders"); }}>Order Detail</button>{first.invoiceNumber ? <button type="button" onClick={() => setSection("invoices")}>Invoice</button> : null}</div>
                    </header>
                    <div className="portal-store-order-items">
                      {group.map((order) => {
                        const artworkFile = customerImageFile(order);
                        return (
                          <div className="portal-store-order-item" key={order.id}>
                            <button className="portal-order-artwork-button" type="button" onClick={() => { setSelectedOrderId(order.id); setSection("orders"); }}>
                              <ProductMockup compact title={order.title} visual={productVisualFromName(order.productType || order.title)} imageUrl={artworkFile ? `/api/customer-portal/file?id=${encodeURIComponent(artworkFile.id)}` : undefined} />
                            </button>
                            <div className="portal-store-order-job"><small>Job ID: {order.jobNumber}</small><strong>{order.title}</strong><span>{order.quantity.toLocaleString()} pcs{order.finishedSize ? ` · ${order.finishedSize}` : ""}</span>{order.artworkName ? <em>Artwork: {order.artworkName}</em> : null}</div>
                            <div className="portal-store-order-status-block"><span className={`portal-order-status ${statusClass(order.status)}`}><i />{order.status}</span><small>{order.statusDetail}</small>{order.dueDate ? <em>Due {formatDate(order.dueDate)}</em> : null}</div>
                            <div className="portal-store-order-item-actions"><button type="button" onClick={() => { setSelectedOrderId(order.id); setSection("orders"); }}>View order</button>{order.canReorder ? <button type="button" onClick={() => { setActionDialog({ type: "reorder", title: `Reorder ${order.jobNumber} — ${order.title}`, jobId: order.id, order, noteLabel: "Reorder instructions", notePlaceholder: "Enter the new quantity, due date, and any changes..." }); setActionNote(""); }}><Repeat2 size={14} />Reorder</button> : null}</div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
              {!filteredOrderGroups.length ? <div className="portal-store-empty-orders"><PackageCheck size={32} /><strong>No matching orders</strong><span>{data.orders.length ? "Try a different search." : "Your first order will appear here after Gross Printing creates it."}</span></div> : null}
              {filteredOrderGroups.length > 6 ? <button className="portal-store-view-all" type="button" onClick={() => setSection("orders")}>View all {data.orders.length} jobs <ArrowRight size={15} /></button> : null}
            </section>

            <section className="portal-store-product-browser">
              <aside>
                <strong>All Products</strong>
                {PORTAL_PRODUCTS.filter((item) => item !== "Other").map((item) => <button type="button" key={item} onClick={() => openNewPrintRequest(item)}>{item}<span>›</span></button>)}
                <button type="button" onClick={() => openNewPrintRequest("Other")}>Other / Custom<span>›</span></button>
              </aside>
              <div className="portal-store-products">
                <header><div><p>Print products</p><h2>Start your next order</h2><span>Temporary product graphics are shown until you replace them with your own images.</span></div><button className="portal-secondary-button" type="button" onClick={() => openNewPrintRequest()}><Plus size={16} />Custom request</button></header>
                <div className="portal-store-product-grid">
                  {PORTAL_PRODUCTS.filter((item) => item !== "Other").slice(0, 9).map((item) => (
                    <button type="button" key={item} onClick={() => openNewPrintRequest(item)}>
                      <ProductMockup title={item} visual={productVisualFromName(item)} />
                      <span><strong>{item}</strong><small>Request specifications & artwork</small></span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {section === "orders" ? (
          <div className="portal-page">
            <div className="portal-page-heading"><div><p>Orders</p><h2>Current and previous work</h2><span>Open any job for its specifications, proof, files, quote, invoice, or reorder.</span></div><button className="portal-primary-button" type="button" onClick={() => openNewPrintRequest()}><Plus size={17} />New order</button></div>
            <div className="portal-orders-layout storefront-orders-layout">
              <section className="portal-panel portal-order-list storefront-order-list">
                {data.orders.map(order => {
                  const artworkFile = customerImageFile(order);
                  return <button className={selectedOrder?.id === order.id ? "active" : ""} type="button" key={order.id} onClick={() => setSelectedOrderId(order.id)}><ProductMockup compact title={order.title} visual={productVisualFromName(order.productType || order.title)} imageUrl={artworkFile ? `/api/customer-portal/file?id=${encodeURIComponent(artworkFile.id)}` : undefined} /><span className="portal-order-copy"><strong>{order.parentOrderNumber ? `${order.parentOrderNumber} · ` : ""}{order.jobNumber}</strong><small>{order.title} · {order.quantity.toLocaleString()} pieces</small><span className={`portal-order-status ${statusClass(order.status)}`}><i />{order.status}</span></span><ArrowRight size={16} /></button>;
                })}
              </section>
              <section className="portal-panel portal-order-detail">
                {selectedOrder ? <OrderDetail order={selectedOrder} siblingItems={data.orders.filter((item) => Boolean(selectedOrder.parentOrderId) && item.parentOrderId === selectedOrder.parentOrderId)} proofFiles={proofsByJob.get(selectedOrder.id) ?? []} onOpenFile={openFile} onAction={(dialog) => { setActionDialog(dialog); setActionNote(""); }} onOpenQuote={() => setSection("quotes")} onOpenInvoice={() => setSection("invoices")} /> : <div className="portal-empty"><PackageCheck size={30} /><strong>Select an order</strong><span>Order details will open here.</span></div>}
              </section>
            </div>
          </div>
        ) : null}

        {section === "updates" ? <UpdatesPage notifications={data.notifications} onOpenOrder={(jobId) => { setSelectedOrderId(jobId); setSection("orders"); }} /> : null}
        {section === "quotes" ? <QuotesPage quotes={data.quotes} highlightId={deepLinkedQuoteId} onApprove={(quote) => { setActionDialog({ type: "quote_approval", title: `Approve ${quote.quoteNumber} — ${quote.title}`, quoteId: quote.id, jobId: quote.jobId, noteLabel: "Approval note (optional)", notePlaceholder: "Add any instruction that should accompany this approval..." }); setActionNote(""); }} /> : null}
        {section === "invoices" ? <InvoicesPage invoices={data.invoices} highlightId={deepLinkedInvoiceId} onPrint={printInvoice} /> : null}
        {section === "messages" ? <MessagesPage threads={data.messages} selectedId={selectedThreadId} onSelect={setSelectedThreadId} selected={selectedThread} onMessage={() => { setActionDialog({ type: "message", title: "Send a message to Gross Printing", noteLabel: "Message", notePlaceholder: "Write your question or order message..." }); setActionNote(""); }} /> : null}
        {section === "files" ? (
          <FilesPage
            files={data.files}
            orders={data.orders}
            requests={data.requests}
            uploadMode={uploadMode}
            setUploadMode={setUploadMode}
            uploadTitle={uploadTitle}
            setUploadTitle={setUploadTitle}
            uploadNote={uploadNote}
            setUploadNote={setUploadNote}
            uploadJobId={uploadJobId}
            setUploadJobId={setUploadJobId}
            uploadFile={uploadFile}
            setUploadFile={setUploadFile}
            uploadMetadata={uploadMetadata}
            setUploadMetadata={setUploadMetadata}
            uploadBusy={uploadBusy}
            uploadInputRef={uploadInputRef}
            onUpload={uploadCustomerFile}
            onOpenFile={openFile}
            onAction={(dialog) => { setActionDialog(dialog); setActionNote(""); }}
          />
        ) : null}
      </main>

      {actionDialog ? (
        <div className="portal-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setActionDialog(undefined)}>
          <section className="portal-action-modal" role="dialog" aria-modal="true">
            <header><div><p>Customer request</p><h2>{actionDialog.title}</h2></div><button type="button" onClick={() => setActionDialog(undefined)}><X size={19} /></button></header>
            {actionDialog.type === "reorder" && actionDialog.order ? (
              <div className="portal-reorder-form">
                <section className="portal-reorder-original">
                  <div><span>Previous order</span><strong>{actionDialog.order.jobNumber} · {actionDialog.order.title}</strong></div>
                  <div className="portal-reorder-spec-grid">
                    <div><span>Quantity</span><strong>{actionDialog.order.quantity.toLocaleString()}</strong></div>
                    <div><span>Finished size</span><strong>{actionDialog.order.finishedSize}</strong></div>
                    <div><span>Paper</span><strong>{actionDialog.order.stockName ?? "Not listed"}</strong></div>
                    <div><span>Print</span><strong>{actionDialog.order.colorSpec}</strong></div>
                    <div><span>Sides</span><strong>{actionDialog.order.sides}</strong></div>
                    <div><span>Finishing</span><strong>{actionDialog.order.finishing.join(", ") || "None"}</strong></div>
                  </div>
                </section>
                <div className="portal-reorder-fields">
                  <label>New quantity<input type="number" min="1" value={reorderQuantity} onChange={(event) => setReorderQuantity(event.target.value ? Number(event.target.value) : "")} /></label>
                  <label>Needed by<input type="date" value={reorderDueDate} onChange={(event) => setReorderDueDate(event.target.value)} /></label>
                </div>
                <label className="portal-reorder-artwork"><input type="checkbox" checked={reorderSameArtwork} onChange={(event) => setReorderSameArtwork(event.target.checked)} /><span><strong>Use the same artwork</strong><small>{actionDialog.order.artworkName ? `Previous artwork: ${actionDialog.order.artworkName}` : "Gross Printing will confirm the saved artwork."}</small></span></label>
                <label>What changed?<textarea value={reorderChanges} onChange={(event) => setReorderChanges(event.target.value)} placeholder="Leave blank when everything stays the same, or list every change clearly..." /></label>
              </div>
            ) : (
              <label>{actionDialog.noteLabel}<textarea value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder={actionDialog.notePlaceholder} /></label>
            )}
            <div className="portal-modal-actions"><button className="portal-text-button" type="button" onClick={() => setActionDialog(undefined)}>Cancel</button><button className="portal-primary-button" type="button" onClick={() => void submitAction()} disabled={actionBusy || (actionDialog.type === "reorder" && !reorderQuantity)}>{actionBusy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}{actionBusy ? "Submitting..." : "Submit to Gross Printing"}</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function portalProgressStep(status: CustomerPortalOrder["status"]) {
  if (status === "Cancelled") return -1;
  if (status === "Completed") return 4;
  if (status === "Ready for pickup") return 3;
  if (status === "In production" || status === "Artwork review") return 2;
  if (status === "Request received" || status === "Quote ready" || status === "Awaiting approval") return 1;
  return 0;
}

function OrderDetail({ order, siblingItems, proofFiles, onOpenFile, onAction, onOpenQuote, onOpenInvoice }: { order: CustomerPortalOrder; siblingItems: CustomerPortalOrder[]; proofFiles: CustomerPortalFile[]; onOpenFile: (file: CustomerPortalFile, download?: boolean) => void; onAction: (dialog: ActionDialog) => void; onOpenQuote: () => void; onOpenInvoice: () => void }) {
  const stages = ["Order received", "Confirmed", "In production", "Ready for pickup", "Completed"];
  const progress = portalProgressStep(order.status);
  return (
    <div className="portal-order-detail-content">
      <header><div><p>{order.parentOrderNumber ? `${order.parentOrderNumber} · Item ${order.orderItemPosition} of ${order.orderItemCount} · ` : ""}{order.jobNumber}</p><h2>{order.title}</h2><span className={`portal-order-status large ${statusClass(order.status)}`}><i />{order.status}</span></div>{order.canReorder ? <button className="portal-secondary-button" type="button" onClick={() => onAction({ type: "reorder", title: `Reorder ${order.jobNumber} — ${order.title}`, jobId: order.id, order, noteLabel: "Reorder instructions", notePlaceholder: "Enter the new quantity, due date, and any changes..." })}><Repeat2 size={16} />Reorder this job</button> : null}</header>
      <section className={`portal-order-tracker ${progress < 0 ? "cancelled" : ""}`}>
        {stages.map((stage, index) => (
          <div className={index < progress ? "complete" : index === progress ? "current" : "upcoming"} key={stage}>
            <span>{index < progress ? <CheckCircle2 size={14} /> : index + 1}</span>
            <strong>{stage}</strong>
          </div>
        ))}
      </section>
      <p className="portal-status-detail">{order.statusDetail}</p>
      {order.parentOrderNumber && siblingItems.length > 1 ? (
        <section className="portal-parent-order-summary">
          <div><span>Customer order</span><strong>{order.parentOrderNumber} — {order.parentOrderTitle}</strong><small>{order.parentOrderStatus} · {siblingItems.filter((item) => ["Ready for pickup", "Completed"].includes(item.status)).length} of {siblingItems.length} items ready or completed</small></div>
          <div>{siblingItems.map((item) => <span className={item.id === order.id ? "active" : ""} key={item.id}>{item.jobNumber} · {item.status}</span>)}</div>
        </section>
      ) : null}
      <div className="portal-order-spec-grid"><div><span>Quantity</span><strong>{order.quantity.toLocaleString()}</strong></div><div><span>Finished size</span><strong>{order.finishedSize}</strong></div><div><span>Paper</span><strong>{order.stockName ?? "Not listed"}</strong></div><div><span>Print</span><strong>{order.colorSpec}</strong></div><div><span>Sides</span><strong>{order.sides}</strong></div><div><span>Due</span><strong>{formatDate(order.dueDate)} · {order.dueTime}</strong></div><div><span>Finishing</span><strong>{order.finishing.join(", ") || "None listed"}</strong></div></div>
      {proofFiles.length ? <section className="portal-order-proofs"><div><h3>Proofs requiring review</h3><span>Open the proof before submitting approval or changes.</span></div>{proofFiles.map(file => <article key={file.id}><button type="button" onClick={() => void onOpenFile(file)}><FileText size={18} /><span><strong>{file.name}</strong><small>{formatDate(file.uploadedAt)}</small></span><ArrowRight size={15} /></button><div><button className="portal-secondary-button" type="button" onClick={() => onAction({ type: "proof_changes", title: `Request changes for ${file.name}`, jobId: order.id, noteLabel: "Changes needed", notePlaceholder: "Describe every change clearly..." })}>Request changes</button><button className="portal-primary-button" type="button" onClick={() => onAction({ type: "proof_approval", title: `Approve proof for ${order.jobNumber}`, jobId: order.id, noteLabel: "Approval note (optional)", notePlaceholder: "Add any final instruction..." })}><CheckCircle2 size={16} />Approve proof</button></div></article>)}</section> : null}
      <div className="portal-linked-records">{order.quoteNumber ? <button type="button" onClick={onOpenQuote}><FileCheck2 size={17} /><span><strong>{order.quoteNumber}</strong><small>{order.quoteStatus} · {formatMoney(order.quoteAmount ?? 0)}</small></span><ArrowRight size={15} /></button> : null}{order.invoiceNumber ? <button type="button" onClick={onOpenInvoice}><ReceiptText size={17} /><span><strong>{order.invoiceNumber}</strong><small>{order.invoiceStatus} · {formatMoney(order.invoiceAmount ?? 0)}</small></span><ArrowRight size={15} /></button> : null}</div>
    </div>
  );
}

function UpdatesPage({ notifications, onOpenOrder }: { notifications: CustomerPortalData["notifications"]; onOpenOrder: (jobId: string) => void }) {
  return (
    <div className="portal-page">
      <div className="portal-page-heading"><div><p>Order updates</p><h2>Production and pickup notifications</h2><span>Important changes from Gross Printing appear here and may also be sent by email.</span></div></div>
      <section className="portal-panel portal-update-list full">
        {notifications.map((notification) => (
          <button type="button" key={notification.id} onClick={() => notification.jobId && onOpenOrder(notification.jobId)}>
            <span className={`portal-update-icon ${notification.channel}`}><Bell size={17} /></span>
            <div><strong>{notification.title}</strong><p>{notification.message}</p><small>{formatDateTime(notification.createdAt)} · {notification.channel === "email" ? "Email" : "Customer Portal"}</small></div>
            {notification.jobNumber ? <b>{notification.jobNumber}</b> : null}
          </button>
        ))}
        {!notifications.length ? <div className="portal-empty"><Bell size={28} /><strong>No order updates yet</strong><span>Production, ready-for-pickup, and completion notices will appear here.</span></div> : null}
      </section>
    </div>
  );
}

function PortalFinancialLines({ lines }: { lines?: Array<{ id: string; title: string; quantity: number; amount: number; description?: string }> }) {
  if (!lines?.length) return null;
  return (
    <div className="portal-financial-lines">
      {lines.map((line) => (
        <div key={line.id}>
          <span>
            <strong>{line.title}</strong>
            <small>{line.quantity.toLocaleString()} pcs{line.description ? ` · ${line.description}` : ""}</small>
          </span>
          <b>{formatMoney(line.amount)}</b>
        </div>
      ))}
    </div>
  );
}

function QuotesPage({ quotes, highlightId, onApprove }: { quotes: CustomerPortalQuote[]; highlightId?: string; onApprove: (quote: CustomerPortalQuote) => void }) {
  const orderedQuotes = highlightId
    ? [...quotes].sort((a, b) => Number(b.id === highlightId) - Number(a.id === highlightId))
    : quotes;
  return (
    <div className="portal-page">
      <div className="portal-page-heading">
        <div><p>Quotes</p><h2>Review pricing sent to you</h2><span>Customer line items and totals are shown. Internal costs and markup remain private.</span></div>
      </div>
      <section className="portal-panel portal-financial-records">
        {orderedQuotes.map((quote) => (
          <article className={quote.id === highlightId ? "portal-deep-linked-record" : undefined} id={`portal-quote-${quote.id}`} key={quote.id}>
            <header>
              <div><span>Quote</span><strong>{quote.quoteNumber}</strong><small>{quote.title} · {formatDate(quote.sentAt ?? quote.createdAt)}</small></div>
              <div><span className={`portal-record-status ${statusClass(quote.status)}`}>{quote.status}</span><b>{formatMoney(quote.amount)}</b></div>
            </header>
            <PortalFinancialLines lines={quote.lineItems} />
            <footer>
              <span>{quote.lineItems?.length ? `${quote.lineItems.length} production items` : "One production item"}</span>
              {quote.canApprove ? <button className="portal-primary-button small" type="button" onClick={() => onApprove(quote)}><CheckCircle2 size={15} />Approve quote</button> : <span className="muted">No action needed</span>}
            </footer>
          </article>
        ))}
        {!quotes.length ? <div className="portal-empty"><FileCheck2 size={28} /><strong>No quotes available</strong><span>Quotes sent to this customer will appear here.</span></div> : null}
      </section>
    </div>
  );
}

function InvoicesPage({ invoices, highlightId, onPrint }: { invoices: CustomerPortalInvoice[]; highlightId?: string; onPrint: (invoice: CustomerPortalInvoice) => void }) {
  const orderedInvoices = highlightId
    ? [...invoices].sort((a, b) => Number(b.id === highlightId) - Number(a.id === highlightId))
    : invoices;
  return (
    <div className="portal-page">
      <div className="portal-page-heading"><div><p>Invoices</p><h2>Invoices and payment status</h2><span>Review each order item and print a clean customer copy.</span></div></div>
      <section className="portal-panel portal-financial-records">
        {orderedInvoices.map((invoice) => (
          <article className={invoice.id === highlightId ? "portal-deep-linked-record" : undefined} id={`portal-invoice-${invoice.id}`} key={invoice.id}>
            <header>
              <div><span>Invoice</span><strong>{invoice.invoiceNumber}</strong><small>{invoice.title} · {formatDate(invoice.createdAt)}</small></div>
              <div><span className={`portal-record-status ${statusClass(invoice.status)}`}>{invoice.status}</span><b>{formatMoney(invoice.amount)}</b></div>
            </header>
            <PortalFinancialLines lines={invoice.lineItems} />
            <footer><span>{invoice.lineItems?.length ? `${invoice.lineItems.length} production items` : "One production item"}</span><button className="portal-secondary-button small" type="button" onClick={() => onPrint(invoice)}><Printer size={15} />Print invoice</button></footer>
          </article>
        ))}
        {!invoices.length ? <div className="portal-empty"><ReceiptText size={28} /><strong>No invoices available</strong><span>Invoices will appear after Gross Printing prepares them.</span></div> : null}
      </section>
    </div>
  );
}

function MessagesPage({ threads, selectedId, onSelect, selected, onMessage }: { threads: CustomerPortalMessageThread[]; selectedId?: string; onSelect: (id: string) => void; selected?: CustomerPortalMessageThread; onMessage: () => void }) {
  return <div className="portal-page"><div className="portal-page-heading"><div><p>Messages</p><h2>Customer-facing email history</h2><span>Internal notes, forwards, employee-only messages, and private recipients are excluded.</span></div><button className="portal-primary-button" type="button" onClick={onMessage}><MessageSquareText size={17} />Send a message</button></div><div className="portal-messages-layout"><section className="portal-panel portal-thread-list">{threads.map(thread => <button className={selectedId === thread.id ? "active" : ""} type="button" key={thread.id} onClick={() => onSelect(thread.id)}><Mail size={17} /><span><strong>{thread.subject}</strong><small>{thread.messages.length} messages · {formatDate(thread.lastMessageAt)}</small></span></button>)}{!threads.length ? <div className="portal-empty"><Mail size={28} /><strong>No messages available</strong><span>Customer-facing email conversations will appear here.</span></div> : null}</section><section className="portal-panel portal-message-detail">{selected ? <><header><p>Email conversation</p><h2>{selected.subject}</h2></header><div className="portal-message-stack">{selected.messages.map(message => <article className={message.direction} key={message.id}><header><strong>{message.direction === "customer" ? "You" : "Gross Printing"}</strong><span>{formatDateTime(message.sentAt)}</span></header><p>{message.body}</p>{message.attachmentNames.length ? <small>Attachments: {message.attachmentNames.join(", ")}</small> : null}</article>)}</div></> : <div className="portal-empty"><MessageSquareText size={28} /><strong>Select a conversation</strong><span>Messages will open here.</span></div>}</section></div></div>;
}

const PORTAL_PRODUCTS: CustomerPortalProductType[] = [
  "Business Cards",
  "Flyers / Brochures",
  "Booklets",
  "Invitations",
  "Labels / Stickers",
  "Envelopes",
  "Posters",
  "Signs / Banners",
  "Copies",
  "Plans / Blueprints",
  "Tea Party Cards",
  "Receipt Books",
  "Stamps",
  "Simcha Bags",
  "Other"
];

function metadataNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

type PortalLivePrice = {
  enabled: boolean;
  requiresReview: boolean;
  total?: number;
  perUnit?: number;
  instantOrderEnabled?: boolean;
  quoteApprovalRequired?: boolean;
  message?: string;
};

function FilesPage({
  files,
  orders,
  requests,
  uploadMode,
  setUploadMode,
  uploadTitle,
  setUploadTitle,
  uploadNote,
  setUploadNote,
  uploadJobId,
  setUploadJobId,
  uploadFile,
  setUploadFile,
  uploadMetadata,
  setUploadMetadata,
  uploadBusy,
  uploadInputRef,
  onUpload,
  onOpenFile,
  onAction
}: {
  files: CustomerPortalFile[];
  orders: CustomerPortalOrder[];
  requests: CustomerPortalRequest[];
  uploadMode: "new_order" | "file_upload";
  setUploadMode: (value: "new_order" | "file_upload") => void;
  uploadTitle: string;
  setUploadTitle: (value: string) => void;
  uploadNote: string;
  setUploadNote: (value: string) => void;
  uploadJobId: string;
  setUploadJobId: (value: string) => void;
  uploadFile?: File;
  setUploadFile: (file?: File) => void;
  uploadMetadata: CustomerPortalRequestMetadata;
  setUploadMetadata: (value: CustomerPortalRequestMetadata) => void;
  uploadBusy: boolean;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  onUpload: (event: FormEvent<HTMLFormElement>) => void;
  onOpenFile: (file: CustomerPortalFile, download?: boolean) => void;
  onAction: (dialog: ActionDialog) => void;
}) {
  const product = uploadMetadata.productType ?? "Business Cards";
  const updateMetadata = (changes: Partial<CustomerPortalRequestMetadata>) =>
    setUploadMetadata({ ...uploadMetadata, ...changes });
  const finishing = uploadMetadata.finishing ?? [];
  const [livePrice, setLivePrice] = useState<PortalLivePrice>();
  const [priceBusy, setPriceBusy] = useState(false);
  const priceSpecKey = JSON.stringify({
    productType: uploadMetadata.productType,
    quantity: uploadMetadata.quantity,
    finishedWidth: uploadMetadata.finishedWidth,
    finishedHeight: uploadMetadata.finishedHeight,
    sides: uploadMetadata.sides,
    colorSpec: uploadMetadata.colorSpec,
    paperPreference: uploadMetadata.paperPreference,
    paperWeight: uploadMetadata.paperWeight,
    material: uploadMetadata.material,
    finishing: uploadMetadata.finishing,
    labelFormat: uploadMetadata.labelFormat,
    dueDate: uploadMetadata.dueDate
  });

  useEffect(() => {
    if (uploadMode !== "new_order" || !uploadMetadata.quantity || uploadMetadata.requestPurpose === "message") {
      setLivePrice(undefined);
      setPriceBusy(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPriceBusy(true);
      try {
        const response = await fetch("/api/customer-portal/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ metadata: uploadMetadata, title: uploadTitle })
        });
        const payload = (await response.json().catch(() => ({}))) as PortalLivePrice & { error?: string };
        if (!cancelled) {
          setLivePrice(response.ok ? payload : { enabled: false, requiresReview: true, message: payload.error || "Price requires review." });
        }
      } catch {
        if (!cancelled) setLivePrice({ enabled: false, requiresReview: true, message: "Price requires Gross Printing review." });
      } finally {
        if (!cancelled) setPriceBusy(false);
      }
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [uploadMode, priceSpecKey, uploadTitle, uploadMetadata]);

  function toggleFinishing(value: string) {
    updateMetadata({
      finishing: finishing.includes(value)
        ? finishing.filter((item) => item !== value)
        : [...finishing, value]
    });
  }

  const showSize = !["Envelopes", "Copies", "Other"].includes(product);
  const showPaper = !["Signs / Banners", "Plans / Blueprints"].includes(product);
  const isBooklet = product === "Booklets";
  const isLabel = product === "Labels / Stickers";
  const isSign = product === "Signs / Banners";

  return (
    <div className="portal-page">
      <div className="portal-page-heading">
        <div>
          <p>Print requests & files</p>
          <h2>Start a new job or send files for an existing order</h2>
          <span>New work starts here. Choose the product, add the specifications, and upload artwork when it is ready.</span>
        </div>
      </div>

      <div className="portal-files-layout">
        <section className="portal-panel">
          <div className="portal-panel-heading">
            <div>
              <h3>Files shared with you</h3>
              <span>Only files intentionally available to this customer are displayed.</span>
            </div>
          </div>
          <div className="portal-file-grid">
            {files.map((file) => (
              <article key={file.id}>
                <div className="portal-file-icon"><FileText size={22} /></div>
                <div>
                  <span>{file.folder}</span>
                  <strong>{file.name}</strong>
                  <small>{formatSize(file.size)} · {formatDate(file.uploadedAt)}</small>
                </div>
                <div className="portal-file-actions">
                  <button type="button" onClick={() => void onOpenFile(file)}><ArrowRight size={15} />Open</button>
                  <button type="button" onClick={() => void onOpenFile(file, true)}><Download size={15} />Download</button>
                  {file.canApproveProof && file.jobId ? (
                    <button
                      type="button"
                      onClick={() =>
                        onAction({
                          type: "proof_approval",
                          title: `Approve ${file.name}`,
                          jobId: file.jobId,
                          noteLabel: "Approval note (optional)",
                          notePlaceholder: "Add any final instruction..."
                        })
                      }
                    >
                      <CheckCircle2 size={15} />Approve
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {!files.length ? (
              <div className="portal-empty">
                <FolderOpen size={28} />
                <strong>No shared files</strong>
                <span>Proofs and customer-facing files will appear here.</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="portal-panel portal-upload-panel">
          <div className="portal-panel-heading">
            <div>
              <h3>Start a print request</h3>
              <span>Choose quote, order, reorder, or change request. Gross Printing reviews it before anything goes into production.</span>
            </div>
          </div>

          <div className="portal-upload-mode">
            <button
              className={uploadMode === "new_order" ? "active" : ""}
              type="button"
              onClick={() => setUploadMode("new_order")}
            >
              <Plus size={16} />New print request
            </button>
            <button
              className={uploadMode === "file_upload" ? "active" : ""}
              type="button"
              onClick={() => setUploadMode("file_upload")}
            >
              <Upload size={16} />Upload to existing order
            </button>
          </div>

          <form className="portal-structured-order-form" onSubmit={onUpload}>
            {uploadMode === "new_order" ? (
              <>
                <div className="portal-request-purpose">
                  <label>
                    What would you like to do?
                    <select
                      value={uploadMetadata.requestPurpose ?? "quote"}
                      onChange={(event) =>
                        updateMetadata({ requestPurpose: event.target.value as CustomerPortalRequestPurpose })
                      }
                    >
                      <option value="quote">Request a quote</option>
                      <option value="order">Place a new order</option>
                      <option value="reorder">Request a reorder</option>
                      <option value="change">Request a change</option>
                      <option value="message">Send general job information</option>
                    </select>
                  </label>
                  <label>
                    Product type
                    <select
                      value={product}
                      onChange={(event) =>
                        updateMetadata({
                          productType: event.target.value as CustomerPortalProductType,
                          finishing: []
                        })
                      }
                    >
                      {PORTAL_PRODUCTS.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </label>
                </div>

                <label>
                  Request name
                  <input
                    value={uploadTitle}
                    onChange={(event) => setUploadTitle(event.target.value)}
                    placeholder="Example: 5,000 summer postcards"
                    required
                  />
                </label>

                <div className="portal-spec-grid">
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="1"
                      value={uploadMetadata.quantity ?? ""}
                      onChange={(event) => updateMetadata({ quantity: metadataNumber(event.target.value) })}
                      required
                    />
                  </label>

                  {showSize ? (
                    <>
                      <label>
                        Finished width (inches)
                        <input
                          type="number"
                          min="0.1"
                          step="0.125"
                          value={uploadMetadata.finishedWidth ?? ""}
                          onChange={(event) => updateMetadata({ finishedWidth: metadataNumber(event.target.value) })}
                        />
                      </label>
                      <label>
                        Finished height (inches)
                        <input
                          type="number"
                          min="0.1"
                          step="0.125"
                          value={uploadMetadata.finishedHeight ?? ""}
                          onChange={(event) => updateMetadata({ finishedHeight: metadataNumber(event.target.value) })}
                        />
                      </label>
                    </>
                  ) : null}

                  <label>
                    Print sides
                    <select
                      value={uploadMetadata.sides ?? 2}
                      onChange={(event) => updateMetadata({ sides: event.target.value === "1" ? 1 : 2 })}
                    >
                      <option value="1">One-sided</option>
                      <option value="2">Two-sided</option>
                    </select>
                  </label>

                  <label>
                    Color
                    <select
                      value={uploadMetadata.colorSpec ?? "4/4 full color"}
                      onChange={(event) => updateMetadata({ colorSpec: event.target.value })}
                    >
                      <option value="4/4 full color">Full color front & back (4/4)</option>
                      <option value="4/0 full color">Full color front / blank back (4/0)</option>
                      <option value="4/1 full color black back">Full color front / black back (4/1)</option>
                      <option value="1/1 black">Black front & back (1/1)</option>
                      <option value="1/0 black">Black front / blank back (1/0)</option>
                      <option value="Spot color / custom ink">Spot color / custom ink — review required</option>
                      <option value="Not sure">Not sure — recommend for me</option>
                    </select>
                  </label>

                  {showPaper ? (
                    <>
                      <label>
                        Paper / stock
                        <input
                          value={uploadMetadata.paperPreference ?? ""}
                          onChange={(event) => updateMetadata({ paperPreference: event.target.value })}
                          placeholder="Gloss, matte, cover, text, or not sure"
                        />
                      </label>
                      <label>
                        Paper weight
                        <input
                          value={uploadMetadata.paperWeight ?? ""}
                          onChange={(event) => updateMetadata({ paperWeight: event.target.value })}
                          placeholder="20#, 60#, 80#, 100#, 14pt..."
                        />
                      </label>
                      <label>
                        Coating / finish
                        <select value={uploadMetadata.coating ?? ""} onChange={(event) => updateMetadata({ coating: event.target.value })}>
                          <option value="">None / not sure</option>
                          <option>Gloss</option>
                          <option>Matte</option>
                          <option>Silk</option>
                          <option>Uncoated</option>
                          <option>Gloss lamination</option>
                          <option>Matte lamination</option>
                        </select>
                      </label>
                    </>
                  ) : null}

                  <label>
                    Needed by
                    <input
                      type="date"
                      value={uploadMetadata.dueDate ?? ""}
                      onChange={(event) => updateMetadata({ dueDate: event.target.value })}
                    />
                  </label>

                  <label>
                    Purchase order / reference
                    <input
                      value={uploadMetadata.customerPo ?? ""}
                      onChange={(event) => updateMetadata({ customerPo: event.target.value })}
                    />
                  </label>
                  <label>
                    Delivery
                    <select value={uploadMetadata.deliveryMethod ?? "Pickup"} onChange={(event) => updateMetadata({ deliveryMethod: event.target.value as CustomerPortalRequestMetadata["deliveryMethod"] })}>
                      <option>Pickup</option>
                      <option>Delivery</option>
                      <option>Shipping</option>
                    </select>
                  </label>
                  <label className="portal-check-option portal-inline-check"><input type="checkbox" checked={uploadMetadata.bleed === true} onChange={(event) => updateMetadata({ bleed: event.target.checked })} />Artwork includes bleed</label>
                  <label className="portal-check-option portal-inline-check"><input type="checkbox" checked={uploadMetadata.proofRequired === true} onChange={(event) => updateMetadata({ proofRequired: event.target.checked })} />Proof requested before production</label>
                </div>

                {isBooklet ? (
                  <div className="portal-product-options">
                    <label>Number of pages<input type="number" min="4" step="4" value={uploadMetadata.pageCount ?? ""} onChange={(event) => updateMetadata({ pageCount: metadataNumber(event.target.value) })} /></label>
                    <label>Inside paper<input value={uploadMetadata.insidePaper ?? ""} onChange={(event) => updateMetadata({ insidePaper: event.target.value })} /></label>
                    <label>Cover preference<input value={uploadMetadata.coverPreference ?? ""} onChange={(event) => updateMetadata({ coverPreference: event.target.value })} /></label>
                    <label>Binding<select value={uploadMetadata.binding ?? ""} onChange={(event) => updateMetadata({ binding: event.target.value })}><option value="">Choose...</option><option>Fold and staple</option><option>Perfect bound</option><option>Spiral</option><option>Fold only</option></select></label>
                  </div>
                ) : null}

                {isLabel ? (
                  <div className="portal-product-options">
                    <label>Label format<select value={uploadMetadata.labelFormat ?? ""} onChange={(event) => updateMetadata({ labelFormat: event.target.value as "Sheet labels" | "Roll labels" })}><option value="">Choose...</option><option>Sheet labels</option><option>Roll labels</option></select></label>
                    <label>Shape<input value={uploadMetadata.shape ?? ""} onChange={(event) => updateMetadata({ shape: event.target.value })} placeholder="Round, square, custom..." /></label>
                    <label>Material<input value={uploadMetadata.material ?? ""} onChange={(event) => updateMetadata({ material: event.target.value })} placeholder="Paper, vinyl, clear..." /></label>
                    <label>Adhesive<input value={uploadMetadata.adhesive ?? ""} onChange={(event) => updateMetadata({ adhesive: event.target.value })} placeholder="Permanent or removable" /></label>
                  </div>
                ) : null}

                {isSign ? (
                  <div className="portal-product-options">
                    <label>Material<select value={uploadMetadata.material ?? ""} onChange={(event) => updateMetadata({ material: event.target.value })}><option value="">Choose...</option><option>Banner vinyl</option><option>Adhesive vinyl</option><option>Clear window vinyl</option><option>Foam board</option><option>Plastic board</option><option>Coroplast</option><option>Other</option></select></label>
                    <label>Use<select value={uploadMetadata.indoorOutdoor ?? ""} onChange={(event) => updateMetadata({ indoorOutdoor: event.target.value as "Indoor" | "Outdoor" | "Both" })}><option value="">Choose...</option><option>Indoor</option><option>Outdoor</option><option>Both</option></select></label>
                    <label className="portal-check-option"><input type="checkbox" checked={uploadMetadata.grommets === true} onChange={(event) => updateMetadata({ grommets: event.target.checked })} />Grommets</label>
                    <label className="portal-check-option"><input type="checkbox" checked={uploadMetadata.hemming === true} onChange={(event) => updateMetadata({ hemming: event.target.checked })} />Hemmed edges</label>
                    <label className="portal-check-option"><input type="checkbox" checked={uploadMetadata.installation === true} onChange={(event) => updateMetadata({ installation: event.target.checked })} />Installation needed</label>
                  </div>
                ) : null}

                {!isBooklet && !isLabel && !isSign ? (
                  <div className="portal-finishing-options">
                    {["Cut to size", "Fold", "Score", "Staple", "Laminate", "Round corners"].map((item) => (
                      <label className={finishing.includes(item) ? "active" : ""} key={item}>
                        <input type="checkbox" checked={finishing.includes(item)} onChange={() => toggleFinishing(item)} />
                        {item}
                      </label>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <label>
                  Upload title
                  <input
                    value={uploadTitle}
                    onChange={(event) => setUploadTitle(event.target.value)}
                    placeholder="Example: Corrected artwork"
                    required
                  />
                </label>
                <label>
                  Related order
                  <select value={uploadJobId} onChange={(event) => setUploadJobId(event.target.value)} required>
                    <option value="">Choose order...</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>{order.jobNumber} — {order.title}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {uploadMode === "new_order" ? (
              <section className={`portal-live-price ${livePrice?.enabled && !livePrice.requiresReview ? "available" : "review"}`}>
                <div>
                  <span>Private account pricing</span>
                  {priceBusy ? <strong><LoaderCircle className="spin" size={16} /> Calculating securely…</strong> : livePrice?.enabled && !livePrice.requiresReview && typeof livePrice.total === "number" ? (
                    <><strong>{formatMoney(livePrice.total)}</strong><small>{typeof livePrice.perUnit === "number" ? `${formatMoney(livePrice.perUnit)} each · ` : ""}Calculated for this signed-in business account.</small></>
                  ) : (
                    <><strong>Quote review</strong><small>{livePrice?.message || "Gross Printing will review the specifications and confirm the price."}</small></>
                  )}
                </div>
                <ShieldCheck size={22} />
              </section>
            ) : null}

            <label>
              Additional instructions
              <textarea
                value={uploadNote}
                onChange={(event) => setUploadNote(event.target.value)}
                placeholder="Changes, delivery details, questions, or anything else Gross Printing should know..."
              />
            </label>

            <label className="portal-upload-drop">
              <Upload size={25} />
              <strong>{uploadFile ? uploadFile.name : "Choose artwork or order file"}</strong>
              <span>PDF, JPG, PNG, WEBP, or ZIP · up to 100 MB</span>
              <input
                ref={uploadInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.zip,application/pdf,image/jpeg,image/png,image/webp,application/zip"
                onChange={(event) => setUploadFile(event.target.files?.[0])}
                required={uploadMode === "file_upload"}
              />
            </label>
            {uploadMode === "new_order" && !uploadFile ? (
              <small className="portal-upload-optional-note">Artwork is optional for a quote request and can be added later.</small>
            ) : null}

            <button
              className="portal-primary-button"
              type="submit"
              disabled={uploadBusy || (uploadMode === "file_upload" && !uploadFile) || !uploadTitle.trim()}
            >
              {uploadBusy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
              {uploadBusy ? "Sending request..." : "Send request to Gross Printing"}
            </button>
          </form>

          <div className="portal-request-history">
            <h4>Recent portal requests</h4>
            {requests.slice(0, 8).map((request) => (
              <div key={request.id}>
                <span className={`portal-record-status ${statusClass(customerRequestStatus(request))}`}>{customerRequestStatus(request)}</span>
                <span>
                  <strong>{request.requestNumber ? `${request.requestNumber} · ` : ""}{request.title}</strong>
                  <small>{request.type.replace(/_/g, " ")} · {formatDateTime(request.createdAt)}</small>
                  {typeof request.metadata?.staffReply === "string" && request.metadata.staffReply ? (
                    <em className="portal-staff-reply">Gross Printing: {request.metadata.staffReply}</em>
                  ) : null}
                </span>
              </div>
            ))}
            {!requests.length ? <p className="muted">No portal requests submitted yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
