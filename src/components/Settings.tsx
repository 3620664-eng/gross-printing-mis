"use client";

import { AlertTriangle, Archive, ArchiveRestore, Bell, BrainCircuit, Building2, CheckCircle2, FolderOpen, Hash, MailCheck, PlugZap, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { AiLearningExample, Customer, EmailIntakeTicket, EmailLog, EmailSafetySettings, EmailTemplate, EmailTemplateKey, EmailThread, Invoice, Job, Quote, UploadedFile } from "@/lib/types";

interface SettingsProps {
  emailLogs: EmailLog[];
  emailTemplates: EmailTemplate[];
  emailConnectionLabel: string;
  onUpdateEmailTemplate: (templateId: EmailTemplateKey, changes: Partial<EmailTemplate>) => void;
  onResetEmailTemplates: () => void;
  emailSafetySettings: EmailSafetySettings;
  onUpdateEmailSafetySettings: (changes: Partial<EmailSafetySettings>) => void;
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  customers: Customer[];
  files: UploadedFile[];
  emailThreads: EmailThread[];
  emailIntakeTickets: EmailIntakeTicket[];
  onRestoreJob: (jobId: string) => void;
  onRestoreQuote: (quoteId: string) => void;
  onRestoreInvoice: (invoiceId: string) => void;
  onRestoreCustomer: (customerId: string) => void;
  onRestoreFile: (fileId: string) => void;
  onRestoreEmailThread: (threadId: string) => void;
  onRestoreEmailTicket: (ticketId: string) => void;
  onTrashJob: (jobId: string) => void;
  onTrashQuote: (quoteId: string) => void;
  onTrashInvoice: (invoiceId: string) => void;
  onTrashCustomer: (customerId: string) => void;
  onTrashFile: (fileId: string) => void;
  onOpenJob: (jobId: string) => void;
  onOpenCustomer: (customerId: string) => void;
  authToken?: string;
  aiLearningExamples: AiLearningExample[];
  onClearAiLearning: () => void;
  nextJobNumber: string;
  numberingSettings: { nextJobNumber?: number; updatedAt?: string; updatedBy?: string };
  onSetNextJobNumber: (nextJobNumber: number) => boolean;
  onUseAutomaticJobNumbering: () => void;
}




const roleRows = [
  ["Owner Admin", "All pages, customers, pricing, users, settings, archives, and integrations"],
  ["Office / Estimator", "Workflow, new quotes, and quote records"],
  ["Prepress Worker", "Workflow, job files, production notes, and stage movement"],
  ["Press Worker", "Workflow, job tickets, production notes, and stage movement"],
  ["Finishing Worker", "Workflow, finishing notes, and stage movement"]
];



const settingsSections = [
  { id: "company", label: "Company", description: "Profile and shop identity", icon: Building2 },
  { id: "users", label: "Access rules", description: "Role reference only", icon: Users },
  { id: "email", label: "Email", description: "Templates and sent log", icon: MailCheck },
  { id: "ai", label: "AI assistant", description: "Models, guardrails, and training", icon: BrainCircuit },
  { id: "notifications", label: "Notifications", description: "Portal, email, approvals, and uploads", icon: Bell },
  { id: "numbering", label: "Numbering", description: "Job, quote, invoice series", icon: Hash },
  { id: "archive", label: "Archive", description: "Restore records safely", icon: ArchiveRestore },
  { id: "integrations", label: "Integrations", description: "Supabase and services", icon: PlugZap }
] as const;

type SettingsSection = (typeof settingsSections)[number]["id"];
type EmailDisplayDensity = "compact" | "normal" | "comfortable";
type EmailDisplayFont = "small" | "standard" | "large" | "extra";
type EmailDisplayPane = "right" | "bottom";
type ArchiveFilter = "all" | "jobs" | "quotes" | "invoices" | "customers" | "files" | "email" | "trash";

interface ArchiveRecord {
  id: string;
  kind: Exclude<ArchiveFilter, "all" | "trash">;
  label: string;
  title: string;
  description: string;
  date: string;
  amount?: string;
  trashed?: boolean;
  onRestore: () => void;
  onTrash?: () => void;
  onView?: () => void;
}


const emailPreviewValues: Record<string, string> = {
  customer_name: "Camp Ahava",
  quote_number: "Q-2045",
  job_number: "GP-1055",
  job_name: "5,000 Postcards",
  invoice_number: "INV-3010",
  amount: "$1,150.00",
  due_date: "August 7, 2026",
  pickup_address: "Gross Printing, 6 Jackson Ave, Spring Valley, NY 10977",
  company_contact: "Shulem Gross",
  company_name: "Gross Printing",
  company_phone: "845-362-0664",
  company_email: "jobs@grossprinting.com",
  portal_link: "https://gross-printing.vercel.app/portal?job=job-example",
  portal_job_link: "https://gross-printing.vercel.app/portal?job=job-example",
  portal_quote_link: "https://gross-printing.vercel.app/portal?quote=quote-example",
  portal_invoice_link: "https://gross-printing.vercel.app/portal?invoice=invoice-example"
};

function previewEmailTemplate(value: string) {
  return Object.entries(emailPreviewValues).reduce(
    (result, [key, replacement]) => result.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), replacement),
    value
  );
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : "No date";
}

export function Settings({
  emailLogs,
  emailTemplates,
  emailConnectionLabel,
  onUpdateEmailTemplate,
  onResetEmailTemplates,
  emailSafetySettings,
  onUpdateEmailSafetySettings,
  jobs,
  quotes,
  invoices,
  customers,
  files,
  emailThreads,
  emailIntakeTickets,
  onRestoreJob,
  onRestoreQuote,
  onRestoreInvoice,
  onRestoreCustomer,
  onRestoreFile,
  onRestoreEmailThread,
  onRestoreEmailTicket,
  onTrashJob,
  onTrashQuote,
  onTrashInvoice,
  onTrashCustomer,
  onTrashFile,
  onOpenJob,
  onOpenCustomer,
  authToken,
  aiLearningExamples,
  onClearAiLearning,
  nextJobNumber,
  numberingSettings,
  onSetNextJobNumber,
  onUseAutomaticJobNumbering
}: SettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("archive");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<EmailTemplateKey>(emailTemplates[0]?.id ?? "quote_ready");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateActive, setTemplateActive] = useState(true);
  const [testRecipientText, setTestRecipientText] = useState(emailSafetySettings.testRecipients.join("\n"));
  const [redirectRecipientText, setRedirectRecipientText] = useState(emailSafetySettings.redirectBlockedTo ?? "");
  const [emailDisplayDensity, setEmailDisplayDensity] = useState<EmailDisplayDensity>("normal");
  const [emailDisplayFont, setEmailDisplayFont] = useState<EmailDisplayFont>("standard");
  const [emailDisplayPane, setEmailDisplayPane] = useState<EmailDisplayPane>("right");
  const [emailDisplayWidth, setEmailDisplayWidth] = useState(430);
  const [emailDisplayMessage, setEmailDisplayMessage] = useState("");
  const [nextJobNumberDraft, setNextJobNumberDraft] = useState(() => nextJobNumber.replace(/^GP-/i, ""));
  const [numberingMessage, setNumberingMessage] = useState("");
  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    demoMode: boolean;
    basicModel: string;
    advancedModel: string;
    pricingAuthority: string;
    storesResponses: boolean;
  } | undefined>();
  const [aiStatusError, setAiStatusError] = useState("");
  const approvedMemoryJobIds = new Set(
    jobs.filter((job) => !job.archived && !job.deletedAt && job.status !== "Quote" && job.status !== "Cancelled").map((job) => job.id)
  );
  const learningMemoryCount = approvedMemoryJobIds.size + aiLearningExamples.filter((example) => !example.jobId || !approvedMemoryJobIds.has(example.jobId)).length;
  const communicationMemoryCount = emailLogs.filter((log) => (log.status === "Sent" || log.status === "Test Sent") && Boolean(log.body?.trim())).length;
  const [notificationSettings, setNotificationSettings] = useState({
    portalRequests: true,
    emailTickets: true,
    customerUploads: true,
    quoteApprovals: true,
    proofChanges: true,
    reorders: true,
    customerMessages: true,
    emailOwner: false
  });
  const selectedEmailTemplate = emailTemplates.find((template) => template.id === selectedTemplateId) ?? emailTemplates[0];

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem("gross-printing-notification-settings-v1") ?? "null") as unknown;
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        setNotificationSettings((current) => ({ ...current, ...(saved as Partial<typeof current>) }));
      }
    } catch {
      window.localStorage.removeItem("gross-printing-notification-settings-v1");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "gross-printing-notification-settings-v1",
      JSON.stringify(notificationSettings)
    );
    window.dispatchEvent(new Event("gross-printing-notification-settings-change"));
  }, [notificationSettings]);

  useEffect(() => {
    setNextJobNumberDraft(nextJobNumber.replace(/^GP-/i, ""));
  }, [nextJobNumber]);

  useEffect(() => {
    if (!selectedEmailTemplate) return;
    setTemplateSubject(selectedEmailTemplate.subject);
    setTemplateBody(selectedEmailTemplate.body);
    setTemplateActive(selectedEmailTemplate.isActive);
  }, [selectedEmailTemplate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const density = window.localStorage.getItem("gross-email-density") as EmailDisplayDensity | null;
    const font = window.localStorage.getItem("gross-email-font-size") as EmailDisplayFont | null;
    const pane = window.localStorage.getItem("gross-email-pane-layout") as EmailDisplayPane | null;
    const width = Number(window.localStorage.getItem("gross-email-list-width"));
    if (density === "compact" || density === "normal" || density === "comfortable") setEmailDisplayDensity(density);
    if (font === "small" || font === "standard" || font === "large" || font === "extra") setEmailDisplayFont(font);
    if (pane === "right" || pane === "bottom") setEmailDisplayPane(pane);
    if (Number.isFinite(width) && width >= 160 && width <= 1200) setEmailDisplayWidth(width);
  }, []);

  useEffect(() => {
    setTestRecipientText(emailSafetySettings.testRecipients.join("\n"));
    setRedirectRecipientText(emailSafetySettings.redirectBlockedTo ?? "");
  }, [emailSafetySettings.testRecipients, emailSafetySettings.redirectBlockedTo]);

  function parsedTestRecipients(): string[] {
    return [...new Set(testRecipientText.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  }

  useEffect(() => {
    let cancelled = false;
    async function loadAiStatus() {
      try {
        const response = await fetch("/api/ai/status", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => ({}))) as {
          configured?: boolean;
          demoMode?: boolean;
          basicModel?: string;
          advancedModel?: string;
          pricingAuthority?: string;
          storesResponses?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Unable to read AI settings.");
        if (!cancelled) {
          setAiStatus({
            configured: Boolean(payload.configured),
            demoMode: Boolean(payload.demoMode),
            basicModel: payload.basicModel || "Not configured",
            advancedModel: payload.advancedModel || "Not configured",
            pricingAuthority: payload.pricingAuthority || "Gross Printing pricing engine",
            storesResponses: Boolean(payload.storesResponses)
          });
          setAiStatusError("");
        }
      } catch (error) {
        if (!cancelled) setAiStatusError(error instanceof Error ? error.message : "Unable to read AI settings.");
      }
    }
    void loadAiStatus();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const archivedJobs = jobs.filter((job) => job.archived && !job.deletedAt);
  const trashedJobs = jobs.filter((job) => job.deletedAt);
  const archivedQuotes = quotes.filter((quote) => quote.archived && !quote.deletedAt);
  const trashedQuotes = quotes.filter((quote) => quote.deletedAt);
  const archivedInvoices = invoices.filter((invoice) => invoice.archived && !invoice.deletedAt);
  const trashedInvoices = invoices.filter((invoice) => invoice.deletedAt);
  const archivedCustomers = customers.filter((customer) => customer.archived && !customer.deletedAt);
  const trashedCustomers = customers.filter((customer) => customer.deletedAt);
  const archivedFiles = files.filter((file) => (file.status === "Archived" || file.folder === "Archive") && !file.deletedAt);
  const trashedFiles = files.filter((file) => file.deletedAt);
  const archivedEmailThreads = emailThreads.filter((thread) => thread.archived);
  const archivedEmailTickets = emailIntakeTickets.filter((ticket) => ticket.status === "Archived" || ticket.status === "Ignored");
  const activeJobs = jobs.filter((job) => !job.archived && !job.deletedAt);
  const openQuotes = quotes.filter((quote) => !quote.archived && !quote.deletedAt && quote.status !== "Approved");
  const unpaidInvoices = invoices.filter((invoice) => !invoice.archived && !invoice.deletedAt && invoice.status !== "Paid");
  const trashCount = trashedJobs.length + trashedQuotes.length + trashedInvoices.length + trashedCustomers.length + trashedFiles.length;
  const archiveCount = archivedJobs.length + archivedQuotes.length + archivedInvoices.length + archivedCustomers.length + archivedFiles.length + archivedEmailThreads.length + archivedEmailTickets.length;

  const archiveRecords = useMemo<ArchiveRecord[]>(() => {
    const archived: ArchiveRecord[] = [
      ...archivedJobs.map((job) => ({
        id: job.id,
        kind: "jobs" as const,
        label: job.jobNumber,
        title: job.title,
        description: `${job.customerName} / ${job.status} / ${job.quantity.toLocaleString()} pcs`,
        date: formatDateTime(job.updatedAt),
        amount: formatMoney(job.pricing.total),
        onRestore: () => onRestoreJob(job.id),
        onTrash: () => onTrashJob(job.id),
        onView: () => onOpenJob(job.id)
      })),
      ...archivedQuotes.map((quote) => ({
        id: quote.id,
        kind: "quotes" as const,
        label: quote.quoteNumber,
        title: quote.title,
        description: `${quote.customerName} / ${quote.status}`,
        date: formatDateTime(quote.sentAt ?? quote.createdAt),
        amount: formatMoney(quote.amount),
        onRestore: () => onRestoreQuote(quote.id),
        onTrash: () => onTrashQuote(quote.id),
        onView: () => onOpenJob(quote.jobId)
      })),
      ...archivedInvoices.map((invoice) => ({
        id: invoice.id,
        kind: "invoices" as const,
        label: invoice.invoiceNumber,
        title: invoice.title,
        description: `${invoice.customerName} / ${invoice.status}`,
        date: formatDateTime(invoice.updatedAt ?? invoice.createdAt),
        amount: formatMoney(invoice.amount),
        onRestore: () => onRestoreInvoice(invoice.id),
        onTrash: () => onTrashInvoice(invoice.id),
        onView: () => onOpenJob(invoice.jobId)
      })),
      ...archivedCustomers.map((customer) => ({
        id: customer.id,
        kind: "customers" as const,
        label: customer.terms,
        title: customer.name,
        description: `${customer.contact} / ${customer.email || "No email"}`,
        date: customer.lastOrder ? `Last order ${customer.lastOrder}` : "No last order",
        amount: formatMoney(customer.openBalance ?? customer.totalSpend),
        onRestore: () => onRestoreCustomer(customer.id),
        onTrash: () => onTrashCustomer(customer.id),
        onView: () => onOpenCustomer(customer.id)
      })),
      ...archivedFiles.map((file) => ({
        id: file.id,
        kind: "files" as const,
        label: file.folder,
        title: file.name,
        description: `${file.customerName ?? "Unassigned"} ${file.jobNumber ? `/ ${file.jobNumber}` : ""}`,
        date: formatDateTime(file.uploadedAt),
        onRestore: () => onRestoreFile(file.id),
        onTrash: () => onTrashFile(file.id)
      })),
      ...archivedEmailThreads.map((thread) => ({
        id: thread.id,
        kind: "email" as const,
        label: "Email",
        title: thread.subject || "No subject",
        description: `${thread.participantEmails.join(", ") || "No participants"} / ${thread.messages.length} message${thread.messages.length === 1 ? "" : "s"}`,
        date: formatDateTime(thread.lastMessageAt),
        onRestore: () => onRestoreEmailThread(thread.id)
      })),
      ...archivedEmailTickets.map((ticket) => ({
        id: ticket.id,
        kind: "email" as const,
        label: ticket.ticketNumber ?? "Job Ticket",
        title: ticket.subject || "No subject",
        description: `${ticket.status} / ${ticket.customerName || "Unmatched customer"}`,
        date: formatDateTime(ticket.updatedAt),
        onRestore: () => onRestoreEmailTicket(ticket.id)
      }))
    ];

    const trashed: ArchiveRecord[] = [
      ...trashedJobs.map((job) => ({
        id: job.id,
        kind: "jobs" as const,
        label: job.jobNumber,
        title: job.title,
        description: `${job.customerName} / deleted job`,
        date: `Deleted ${formatDateTime(job.deletedAt)}`,
        amount: formatMoney(job.pricing.total),
        trashed: true,
        onRestore: () => onRestoreJob(job.id)
      })),
      ...trashedQuotes.map((quote) => ({
        id: quote.id,
        kind: "quotes" as const,
        label: quote.quoteNumber,
        title: quote.title,
        description: `${quote.customerName} / deleted quote`,
        date: `Deleted ${formatDateTime(quote.deletedAt)}`,
        amount: formatMoney(quote.amount),
        trashed: true,
        onRestore: () => onRestoreQuote(quote.id)
      })),
      ...trashedInvoices.map((invoice) => ({
        id: invoice.id,
        kind: "invoices" as const,
        label: invoice.invoiceNumber,
        title: invoice.title,
        description: `${invoice.customerName} / deleted invoice`,
        date: `Deleted ${formatDateTime(invoice.deletedAt)}`,
        amount: formatMoney(invoice.amount),
        trashed: true,
        onRestore: () => onRestoreInvoice(invoice.id)
      })),
      ...trashedCustomers.map((customer) => ({
        id: customer.id,
        kind: "customers" as const,
        label: customer.terms,
        title: customer.name,
        description: `${customer.contact} / deleted customer`,
        date: `Deleted ${formatDateTime(customer.deletedAt)}`,
        amount: formatMoney(customer.openBalance ?? customer.totalSpend),
        trashed: true,
        onRestore: () => onRestoreCustomer(customer.id)
      })),
      ...trashedFiles.map((file) => ({
        id: file.id,
        kind: "files" as const,
        label: file.folder,
        title: file.name,
        description: `${file.customerName ?? "Unassigned"} / deleted file`,
        date: `Deleted ${formatDateTime(file.deletedAt)}`,
        trashed: true,
        onRestore: () => onRestoreFile(file.id)
      }))
    ];

    return [...archived, ...trashed];
  }, [
    archivedCustomers,
    archivedFiles,
    archivedInvoices,
    archivedJobs,
    archivedQuotes,
    archivedEmailThreads,
    archivedEmailTickets,
    onOpenCustomer,
    onOpenJob,
    onRestoreCustomer,
    onRestoreFile,
    onRestoreEmailThread,
    onRestoreEmailTicket,
    onTrashCustomer,
    onTrashFile,
    onTrashInvoice,
    onTrashJob,
    onTrashQuote,
    onRestoreInvoice,
    onRestoreJob,
    onRestoreQuote,
    trashedCustomers,
    trashedInvoices,
    trashedJobs,
    trashedQuotes,
    trashedFiles
  ]);

  const visibleArchiveRecords = archiveRecords.filter((record) => {
    const matchesFilter =
      archiveFilter === "all" ||
      (archiveFilter === "trash" ? record.trashed : !record.trashed && record.kind === archiveFilter);
    const query = archiveSearch.trim().toLowerCase();
    const matchesSearch = !query || `${record.label} ${record.title} ${record.description}`.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  function saveEmailDisplaySettings() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gross-email-density", emailDisplayDensity);
    window.localStorage.setItem("gross-email-font-size", emailDisplayFont);
    window.localStorage.setItem("gross-email-pane-layout", emailDisplayPane);
    window.localStorage.setItem("gross-email-list-width", String(emailDisplayWidth));
    setEmailDisplayMessage("Email Center display saved. It will apply when you return to Email Center.");
  }

  const sectionMeta = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];
  const SectionIcon = sectionMeta.icon;

  return (
    <main className="page-view">
      <div className="section-heading">
        <div>
          <p>Settings</p>
          <h1>Company profile, communications, AI, archive, and integrations</h1>
        </div>
      </div>

      <div className="settings-admin-layout">
        <nav className="settings-section-nav" aria-label="Settings sections">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            return (
              <button className={activeSection === section.id ? "active" : ""} type="button" key={section.id} onClick={() => setActiveSection(section.id)}>
                <Icon size={18} />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="panel settings-section-panel">
          <div className="panel-heading">
            <div>
              <h2>{sectionMeta.label}</h2>
              <span>{sectionMeta.description}</span>
            </div>
            <SectionIcon size={18} />
          </div>

          {activeSection === "company" ? (
            <div className="settings-grid">
              <section className="settings-card">
                <Building2 size={18} />
                <strong>Gross Printing</strong>
                <span>6 Jackson Ave, Spring Valley, NY 10977</span>
              </section>
              <section className="settings-card">
                <MailCheck size={18} />
                <strong>jobs@grossprinting.com</strong>
                <span>845-362-0664</span>
              </section>
              <section className="settings-card">
                <ShieldCheck size={18} />
                <strong>Branding</strong>
                <span>Logo appears on invoices, job tickets, and outgoing emails.</span>
              </section>
            </div>
          ) : null}

          {activeSection === "users" ? (
            <div className="user-admin">
              <div className="settings-callout">
                <ShieldCheck size={20} />
                <div>
                  <strong>Staff accounts are managed in the Owner Admin page.</strong>
                  <span>Settings keeps only the access reference so user controls are not duplicated in two places.</span>
                </div>
              </div>
              <section className="role-reference">
                <h3>Role access reference</h3>
                <div className="integration-list">
                  {roleRows.map(([role, description]) => (
                    <div key={role}><strong>{role}</strong><span>{description}</span></div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {activeSection === "email" ? (
            <div className="email-template-settings">
              <div className="settings-callout">
                <MailCheck size={20} />
                <div>
                  <strong>{emailConnectionLabel}</strong>
                  <span>Incoming messages stay live in every mode. Outgoing customer email is controlled separately below.</span>
                </div>
              </div>

              <section className="settings-card email-display-settings-card">
                <div>
                  <strong>Email Center display</strong>
                  <span>Keep these layout controls out of the daily mailbox. Set them here once and drag the divider anytime in Email Center.</span>
                </div>
                <div className="email-display-settings-grid">
                  <label><span>Reading pane</span><select value={emailDisplayPane} onChange={(event) => setEmailDisplayPane(event.target.value as EmailDisplayPane)}><option value="right">Right side</option><option value="bottom">Below inbox</option></select></label>
                  <label><span>Spacing</span><select value={emailDisplayDensity} onChange={(event) => setEmailDisplayDensity(event.target.value as EmailDisplayDensity)}><option value="compact">Compact</option><option value="normal">Normal</option><option value="comfortable">Comfortable</option></select></label>
                  <label><span>Text size</span><select value={emailDisplayFont} onChange={(event) => setEmailDisplayFont(event.target.value as EmailDisplayFont)}><option value="small">Small</option><option value="standard">Standard</option><option value="large">Large</option><option value="extra">Extra large</option></select></label>
                  <label className="email-display-width-setting"><span>Inbox width</span><input type="range" min="160" max="1200" step="10" value={emailDisplayWidth} onChange={(event) => setEmailDisplayWidth(Number(event.target.value))} /><b>{emailDisplayWidth}px</b></label>
                </div>
                <div className="email-display-settings-actions"><button type="button" className="primary-button" onClick={saveEmailDisplaySettings}>Save display</button>{emailDisplayMessage ? <small>{emailDisplayMessage}</small> : null}</div>
              </section>

              <section className={`email-safety-settings-card mode-${emailSafetySettings.mode}`}>
                <div className="email-safety-heading">
                  <div>
                    <p>Customer email safety</p>
                    <h3>{emailSafetySettings.mode === "shadow" ? "Shadow Mode" : emailSafetySettings.mode === "test" ? "Test Mode" : "Live Mode"}</h3>
                    <span>Use real jobs and incoming mail without accidentally contacting real customers while the MIS is still being tested.</span>
                  </div>
                  <ShieldCheck size={22} />
                </div>

                <div className="email-safety-mode-grid">
                  <button type="button" className={emailSafetySettings.mode === "shadow" ? "active" : ""} onClick={() => onUpdateEmailSafetySettings({ mode: "shadow" })}>
                    <strong>Shadow</strong>
                    <span>No external customer email leaves the MIS. Gross Printing internal mail still works.</span>
                  </button>
                  <button type="button" className={emailSafetySettings.mode === "test" ? "active" : ""} onClick={() => onUpdateEmailSafetySettings({ mode: "test" })}>
                    <strong>Test</strong>
                    <span>Only exact addresses on the test-recipient list may receive external email.</span>
                  </button>
                  <button type="button" className={emailSafetySettings.mode === "live" ? "active danger" : "danger"} onClick={() => onUpdateEmailSafetySettings({ mode: "live" })}>
                    <strong>Live</strong>
                    <span>Real customer email can be sent. Owner confirmation is required.</span>
                  </button>
                </div>

                <div className="email-safety-form-grid">
                  <label>
                    <span>Approved test recipients</span>
                    <textarea value={testRecipientText} onChange={(event) => setTestRecipientText(event.target.value)} placeholder="your-second-email@gmail.com\nanother-test@example.com" />
                    <small>One per line, or separate with commas. Matching is exact; public domains are never trusted as a whole.</small>
                  </label>
                  <label>
                    <span>Optional redirect inbox</span>
                    <input value={redirectRecipientText} onChange={(event) => setRedirectRecipientText(event.target.value)} placeholder="your-test-inbox@gmail.com" />
                    <small>When enabled, blocked customer messages are sent only to this approved test/internal inbox with the original recipient clearly labeled.</small>
                  </label>
                </div>

                <div className="email-safety-actions">
                  <label className="template-active-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(emailSafetySettings.redirectBlockedEnabled)}
                      onChange={(event) => onUpdateEmailSafetySettings({ redirectBlockedEnabled: event.target.checked, redirectBlockedTo: redirectRecipientText.trim().toLowerCase(), testRecipients: parsedTestRecipients() })}
                    />
                    <span>Redirect blocked messages to test inbox</span>
                  </label>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => onUpdateEmailSafetySettings({
                      testRecipients: parsedTestRecipients(),
                      redirectBlockedTo: redirectRecipientText.trim().toLowerCase()
                    })}
                  >
                    <ShieldCheck size={16} />
                    Save testing addresses
                  </button>
                </div>
              </section>

              <div className="email-template-workspace">
                <nav className="email-template-list" aria-label="Email templates">
                  {emailTemplates.map((template) => (
                    <button className={selectedEmailTemplate?.id === template.id ? "active" : ""} type="button" key={template.id} onClick={() => setSelectedTemplateId(template.id)}>
                      <span><strong>{template.name}</strong><small>{template.description}</small></span>
                      <b>{template.isActive ? "Active" : "Off"}</b>
                    </button>
                  ))}
                </nav>

                {selectedEmailTemplate ? (
                  <section className="email-template-editor">
                    <header>
                      <div><p>Email template</p><h3>{selectedEmailTemplate.name}</h3></div>
                      <label className="template-active-toggle"><input type="checkbox" checked={templateActive} onChange={(event) => setTemplateActive(event.target.checked)} /><span>Active</span></label>
                    </header>
                    <label><span>Subject</span><input value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} /></label>
                    <label><span>Message</span><textarea value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} /></label>
                    <div className="template-variable-list">
                      <span>Available fields:</span>
                      {["{{customer_name}}", "{{job_number}}", "{{job_name}}", "{{quote_number}}", "{{invoice_number}}", "{{amount}}", "{{due_date}}", "{{pickup_address}}", "{{company_contact}}", "{{company_name}}", "{{company_phone}}", "{{company_email}}", "{{portal_link}}", "{{portal_job_link}}", "{{portal_quote_link}}", "{{portal_invoice_link}}"].map((variable) => <code key={variable}>{variable}</code>)}
                    </div>
                    <div className="email-template-preview">
                      <strong>Preview</strong>
                      <b>{previewEmailTemplate(templateSubject)}</b>
                      <p>{previewEmailTemplate(templateBody)}</p>
                    </div>
                    <div className="email-template-actions">
                      <button className="secondary-button" type="button" onClick={onResetEmailTemplates}><RotateCcw size={16} />Restore all defaults</button>
                      <button className="primary-button" type="button" onClick={() => onUpdateEmailTemplate(selectedEmailTemplate.id, { subject: templateSubject, body: templateBody, isActive: templateActive })}><MailCheck size={16} />Save template</button>
                    </div>
                  </section>
                ) : null}
              </div>

              <section className="email-settings-log">
                <h3>Recent outgoing email / testing outbox</h3>
                <div className="log-list">
                  {emailLogs.slice(0, 12).map((log) => (
                    <div className="log-row" key={log.id}>
                      <strong>{log.subject}</strong>
                      <span>To {log.originalTo || log.to} / {formatDateTime(log.createdAt)} / {log.status ?? "Sent"}{log.safetyMode ? ` / ${log.safetyMode}` : ""}</span>
                      <p>{log.body}</p>{log.safetyReason ? <small>{log.safetyReason}</small> : null}
                    </div>
                  ))}
                  {!emailLogs.length ? <p>No system emails have been logged yet.</p> : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeSection === "ai" ? (
            <div className="ai-settings-page">
              <div className={`settings-callout ${aiStatus?.configured ? "success" : "warning"}`}>
                {aiStatus?.configured ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                <div>
                  <strong>{aiStatus?.configured ? "OpenAI is configured on the server" : aiStatus?.demoMode ? "Demo analyzer is active" : "OpenAI is not configured yet"}</strong>
                  <span>
                    {aiStatus?.configured
                      ? "The key stays on the server. Staff can analyze email wording and artwork previews without exposing the key in the browser."
                      : aiStatus?.demoMode
                        ? "Demo mode uses local extraction rules so the workflow can be tested without API charges."
                        : "Add OPENAI_API_KEY in Vercel before using live AI analysis."}
                  </span>
                </div>
              </div>

              {aiStatusError ? <div className="ai-settings-error"><AlertTriangle size={17} />{aiStatusError}</div> : null}

              <div className="ai-model-grid">
                <section className="ai-model-card">
                  <Sparkles size={20} />
                  <span>Basic model</span>
                  <strong>{aiStatus?.basicModel ?? "Checking..."}</strong>
                  <p>Used for clear, ordinary requests and all controlled batch reviews to reduce cost and rate-limit pressure.</p>
                  <code>OPENAI_BASIC_MODEL</code>
                </section>
                <section className="ai-model-card">
                  <BrainCircuit size={20} />
                  <span>Advanced model</span>
                  <strong>{aiStatus?.advancedModel ?? "Checking..."}</strong>
                  <p>Used for deeper manual re-analysis and for automatic escalation on a single unclear or complex request.</p>
                  <code>OPENAI_ADVANCED_MODEL</code>
                </section>
                <section className="ai-model-card authority">
                  <ShieldCheck size={20} />
                  <span>Price authority</span>
                  <strong>{aiStatus?.pricingAuthority ?? "Gross Printing pricing engine"}</strong>
                  <p>AI extracts specifications and questions. It cannot set the selling price or approve production.</p>
                  <code>store: false</code>
                </section>
              </div>

              <section className="ai-guardrail-list">
                <h3>Required guardrails</h3>
                <div><CheckCircle2 size={17} /><span><strong>Human confirmation</strong> Nothing is applied until a staff member presses Apply supported fields.</span></div>
                <div><CheckCircle2 size={17} /><span><strong>Deterministic pricing</strong> Paper, clicks, cutting, finishing, minimums, and markup remain in the MIS pricing engine.</span></div>
                <div><CheckCircle2 size={17} /><span><strong>Controlled model use</strong> Batch review stays on the basic model. A single-ticket review may escalate only when the job is unclear or complex, and Analyze again uses the advanced model.</span></div>
                <div><CheckCircle2 size={17} /><span><strong>Rate-limit protection</strong> AI requests run sequentially, pause between tickets, and wait/retry automatically when OpenAI asks the app to slow down.</span></div>
                <div><CheckCircle2 size={17} /><span><strong>Number validation</strong> Phone numbers, invoice/job numbers, ZIP codes, dates, links, and dollar amounts are not accepted as print quantities without quantity wording.</span></div>
                <div><CheckCircle2 size={17} /><span><strong>Private server key</strong> OPENAI_API_KEY must never use NEXT_PUBLIC_ and must never be placed in .env.local files that are shared.</span></div>
              </section>


              <section className="ai-guardrail-list">
                <h3>Communication Learning Engine</h3>
                <div><MailCheck size={17} /><span><strong>{communicationMemoryCount} sent reply{communicationMemoryCount === 1 ? "" : "ies"} available as communication memory.</strong> The MIS learns from replies that staff actually sent, never from an unapproved draft.</span></div>
                <div><CheckCircle2 size={17} /><span><strong>Existing-job context</strong> Pickup, delivery, status, invoice, artwork, and proof questions can use the linked/recent job plus the conversation before AI is asked.</span></div>
                <div><ShieldCheck size={17} /><span><strong>Secrets stay out of memory</strong> Passwords, passcodes, API keys, secrets, access/refresh tokens, email addresses, phone numbers, and links are redacted from learned text examples.</span></div>
              </section>

              <section className="ai-training-library">
                <div className="ai-training-heading">
                  <div>
                    <p>Gross Printing Learning Engine</p>
                    <h3>{learningMemoryCount} approved memory source{learningMemoryCount === 1 ? "" : "s"}</h3>
                    <span>The MIS learns only from staff-approved/corrected setups and production history. Strong repeated patterns are tried before OpenAI; uncertain or conflicting work still goes to AI/staff review.</span>
                  </div>
                  <button className="secondary-button danger" type="button" onClick={onClearAiLearning} disabled={!aiLearningExamples.length}>
                    <Trash2 size={16} />
                    Clear saved corrections
                  </button>
                </div>
                <div className="ai-training-list">
                  {aiLearningExamples.slice(0, 30).map((example) => (
                    <article key={example.id}>
                      <div>
                        <span className={`soft-chip ${example.outcome}`}>{example.outcome}</span>
                        <strong>{example.suggested.productName || example.suggested.productCategory || "Print request"} · {example.model}</strong>
                        <small>{formatDateTime(example.createdAt)} · {example.source}</small>
                        <p>{example.inputSummary}</p>
                      </div>
                      <div className="ai-training-corrections">
                        <b>{example.corrections.length} correction{example.corrections.length === 1 ? "" : "s"}</b>
                        {example.corrections.slice(0, 4).map((correction) => <span key={correction}>{correction}</span>)}
                        {!example.corrections.length ? <span>Staff accepted the extracted fields without a recorded correction.</span> : null}
                      </div>
                    </article>
                  ))}
                  {!aiLearningExamples.length ? (
                    <div className="empty-state compact">
                      <BrainCircuit size={28} />
                      <strong>No saved correction examples yet</strong>
                      <span>Approved production jobs still act as read-only shop memory. New corrected AI/job setups will also be stored here.</span>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeSection === "notifications" ? (
            <div className="notification-settings-page">
              <div className="settings-callout success">
                <Bell size={20} />
                <div>
                  <strong>In-app Notification Center</strong>
                  <span>The bell appears on every staff page. Portal requests and important email intake tickets open the exact related record.</span>
                </div>
              </div>
              <section className="notification-setting-card">
                <div>
                  <h3>Events that create staff notifications</h3>
                  <span>Turn off events that do not need immediate attention in this browser.</span>
                </div>
                {[
                  ["portalRequests", "New customer portal request"],
                  ["emailTickets", "New email intake ticket or customer reply"],
                  ["customerUploads", "Customer uploaded artwork or corrected files"],
                  ["quoteApprovals", "Customer approved a quote"],
                  ["proofChanges", "Proof approved or changes requested"],
                  ["reorders", "Customer submitted a reorder"],
                  ["customerMessages", "Customer sent a portal message"]
                ].map(([key, label]) => (
                  <label className="notification-setting-row" key={key}>
                    <span><strong>{label}</strong><small>Show in the top notification bell and related work queue.</small></span>
                    <input
                      type="checkbox"
                      checked={notificationSettings[key as keyof typeof notificationSettings]}
                      onChange={(event) =>
                        setNotificationSettings((current) => ({ ...current, [key]: event.target.checked }))
                      }
                    />
                  </label>
                ))}
              </section>
              <section className="notification-setting-card">
                <div>
                  <h3>Email notification to Gross Printing</h3>
                  <span>This preference is saved now. Automated outgoing alerts will use the configured Gross Printing mailbox after live deployment.</span>
                </div>
                <label className="notification-setting-row">
                  <span><strong>Email the owner for new portal requests</strong><small>In-app notifications remain active regardless of this email option.</small></span>
                  <input
                    type="checkbox"
                    checked={notificationSettings.emailOwner}
                    onChange={(event) =>
                      setNotificationSettings((current) => ({ ...current, emailOwner: event.target.checked }))
                    }
                  />
                </label>
              </section>
            </div>
          ) : null}

          {activeSection === "numbering" ? (
            <div className="settings-two-column numbering-settings-layout">
              <section className="numbering-control-card">
                <div className="section-heading compact">
                  <div>
                    <p>Job numbering</p>
                    <h3>Next Job Number</h3>
                    <span>Set the exact number the next new production job should use.</span>
                  </div>
                  <span className="soft-chip">Current next: {nextJobNumber}</span>
                </div>
                <label className="numbering-next-input">
                  <span>Next GP number</span>
                  <div><b>GP-</b><input inputMode="numeric" pattern="[0-9]*" value={nextJobNumberDraft} onChange={(event) => { setNextJobNumberDraft(event.target.value.replace(/\D+/g, "")); setNumberingMessage(""); }} /></div>
                </label>
                <div className="numbering-actions">
                  <button className="primary-button" type="button" onClick={() => {
                    const parsed = Number(nextJobNumberDraft);
                    if (!Number.isInteger(parsed) || parsed < 1) { setNumberingMessage("Enter a valid positive job number."); return; }
                    const saved = onSetNextJobNumber(parsed);
                    setNumberingMessage(saved ? `Next production job will use GP-${parsed}.` : `GP-${parsed} is already used. Choose another number.`);
                  }}><Hash size={16} /> Save next job number</button>
                  {numberingSettings.nextJobNumber ? <button className="secondary-button" type="button" onClick={() => { onUseAutomaticJobNumbering(); setNumberingMessage("Automatic numbering restored."); }}>Use automatic numbering</button> : null}
                </div>
                {numberingMessage ? <p className="settings-inline-message">{numberingMessage}</p> : null}
                <div className="numbering-note">
                  <strong>{numberingSettings.nextJobNumber ? "Manual sequence is active" : "Automatic sequence is active"}</strong>
                  <span>{numberingSettings.nextJobNumber
                    ? `You can start a new range at any unused number, for example GP-2000 at the beginning of a year. After each job, the counter advances automatically.`
                    : "The system uses the next number after the highest existing GP job."}</span>
                  {numberingSettings.updatedAt ? <small>Last changed {formatDateTime(numberingSettings.updatedAt)}{numberingSettings.updatedBy ? ` by ${numberingSettings.updatedBy}` : ""}</small> : null}
                </div>
              </section>
              <section>
                <h3>Other record series</h3>
                <div className="settings-grid compact-numbering-grid">
                  <section className="settings-card"><strong>Q-</strong><span>Quotes continue automatically from saved quote records.</span></section>
                  <section className="settings-card"><strong>INV-</strong><span>Invoices continue automatically from saved invoice records.</span></section>
                  <section className="settings-card"><strong>OR-</strong><span>Parent orders continue automatically from saved order records.</span></section>
                </div>
                <p className="muted">Changing the next GP number never renumbers old jobs. The MIS also refuses to reuse an existing GP number.</p>
              </section>
            </div>
          ) : null}

          {activeSection === "archive" ? (
            <div className="archive-admin">
              <div className="archive-counts">
                <div><strong>{archiveCount}</strong><span>Archived records</span></div>
                <div><strong>{trashCount}</strong><span>Recycle bin</span></div>
                <div><strong>{activeJobs.length}</strong><span>Active jobs</span></div>
                <div><strong>{openQuotes.length}</strong><span>Open quotes</span></div>
                <div><strong>{unpaidInvoices.length}</strong><span>Unpaid invoices</span></div>
              </div>

              <div className="archive-toolbar">
                <div className="archive-filter-buttons">
                  {(["all", "jobs", "quotes", "invoices", "customers", "files", "email", "trash"] as ArchiveFilter[]).map((filter) => (
                    <button className={archiveFilter === filter ? "active" : ""} type="button" key={filter} onClick={() => setArchiveFilter(filter)}>
                      {filter === "all" ? "All" : filter === "trash" ? "Recycle bin" : filter === "email" ? "Email & Job Tickets" : filter[0].toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
                <label className="search-inline">
                  <Search size={16} />
                  <input value={archiveSearch} onChange={(event) => setArchiveSearch(event.target.value)} placeholder="Search archive..." />
                </label>
              </div>

              <p className="muted">Archive hides records from normal work. Recycle bin keeps deleted records for 30 days. Permanent delete is not exposed for normal use.</p>

              <div className="archive-record-list">
                {visibleArchiveRecords.map((record) => (
                  <article className={`archive-record ${record.trashed ? "trashed" : ""}`} key={`${record.kind}-${record.id}`}>
                    <div>
                      <span className="soft-chip">{record.trashed ? "Trash" : record.kind}</span>
                      <strong>{record.label} / {record.title}</strong>
                      <small>{record.description}</small>
                      <small>{record.date}</small>
                    </div>
                    <div className="archive-record-actions">
                      {record.amount ? <b>{record.amount}</b> : null}
                      {record.onView ? (
                        <button className="icon-button text-button" type="button" onClick={record.onView}>
                          <FolderOpen size={16} />
                          View
                        </button>
                      ) : null}
                      {record.onTrash && !record.trashed ? (
                        <button className="icon-button text-button danger" type="button" onClick={record.onTrash}>
                          <Trash2 size={16} />
                          Recycle bin
                        </button>
                      ) : null}
                      <button className="primary-button" type="button" onClick={record.onRestore}>
                        <RotateCcw size={16} />
                        Restore
                      </button>
                    </div>
                  </article>
                ))}
                {!visibleArchiveRecords.length ? (
                  <div className="empty-state compact">
                    <Archive size={28} />
                    <strong>No matching records</strong>
                    <span>Archived and trashed records will appear here when they exist.</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeSection === "integrations" ? (
            <div className="settings-two-column">
              <section>
                <h3>Connections</h3>
                <div className="integration-list">
                  <div><strong>Email provider</strong><span>{emailConnectionLabel}. Rackspace IMAP/SMTP sync, replies, Sent history, and outgoing templates run through protected server routes.</span></div>
                  <div><strong>OpenAI</strong><span>{aiStatus?.configured ? `${aiStatus.basicModel} basic / ${aiStatus.advancedModel} advanced. Server key configured.` : aiStatus?.demoMode ? "Demo extraction rules active." : "Server key not configured."}</span></div>
                  <div><strong>Supabase</strong><span>Ready for customers, jobs, quotes, invoices, files, pricing, and AI correction examples.</span></div>
                  <div><strong>PDF engine</strong><span>Imposition can later connect to a production PDF tool.</span></div>
                </div>
              </section>
              <section>
                <h3>Supabase-ready data shape</h3>
                <div className="integration-list">
                  <div><strong>customers</strong><span>Customer master, history, terms, contacts, and reorder links</span></div>
                  <div><strong>jobs</strong><span>Single workflow record with quote, production, invoice, file, and timing links</span></div>
                  <div><strong>quotes / invoices</strong><span>Sales and finance status, PDF/email events, archive state</span></div>
                  <div><strong>uploaded_files</strong><span>Artwork, proofs, imposed PDFs, customer files, and job attachments</span></div>
                  <div><strong>catalog</strong><span>Products, product price tables, paper inventory, click rates, finishing, machines</span></div>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
