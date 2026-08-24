export type AppView =
  | "Dashboard"
  | "Workflow"
  | "Assigned Work"
  | "Orders"
  | "New Estimate / Job"
  | "Quotes"
  | "Invoices"
  | "Email Center"
  | "Portal Requests"
  | "Customer Portal"
  | "Files"
  | "Catalog"
  | "Time Learning"
  | "Settings"
  | "Back Office"
  | "Owner Operations"
  | "Admin";


export type PrintOrderStatus =
  | "Draft"
  | "Quote"
  | "Approved"
  | "In production"
  | "Partially ready"
  | "Ready"
  | "Delivered"
  | "Cancelled";

export interface OrderLineItem {
  id: string;
  jobId?: string;
  title: string;
  quantity: number;
  amount: number;
  description?: string;
}

export interface OrderAttachmentInsight {
  attachmentId: string;
  filename: string;
  inspected: boolean;
  contentKind?: string;
  detectedTitle?: string;
  likelyProduct?: string;
  relationshipHint?: string;
  artworkWidth?: number;
  artworkHeight?: number;
  pageCount?: number;
  summary?: string;
  warnings: string[];
  confidence: number;
}

export interface OrderItemSuggestion {
  id: string;
  title: string;
  attachmentIds: string[];
  productCategory?: string;
  productName?: string;
  quantity?: number;
  finishedWidth?: number;
  finishedHeight?: number;
  sides?: 1 | 2;
  colorSpec?: string;
  paperHint?: string;
  stockId?: string;
  stockConfirmed?: boolean;
  stockRecommendationReason?: string;
  finishing: string[];
  dueDate?: string;
  dueTime?: string;
  notes?: string;
  missingInformation: string[];
  warnings: string[];
  confidence: number;
}

export interface AiOrderSplitResult {
  id: string;
  source: "email" | "manual";
  model: string;
  configured: boolean;
  demo: boolean;
  createdAt: string;
  summary: string;
  recommendedMode: "single_job" | "multiple_jobs" | "multipart_job";
  items: OrderItemSuggestion[];
  attachmentInsights?: OrderAttachmentInsight[];
  generalAttachmentIds: string[];
  missingInformation: string[];
  warnings: string[];
  confidence: number;
  decisionSource?: "shop_memory" | "shop_memory_plus_ai" | "openai" | "staff";
  learning?: AiLearningRecommendation;
}

export type CustomerNotificationPath = "quote_then_status" | "direct_job" | "manual";

export type ArtworkPreflightSeverity = "ok" | "minor" | "warning" | "unsupported";

export interface ArtworkPreflightResult {
  attachmentId: string;
  filename: string;
  mimeType: string;
  severity: ArtworkPreflightSeverity;
  message: string;
  requestedWidth?: number;
  requestedHeight?: number;
  artworkWidth?: number;
  artworkHeight?: number;
  artworkWidthPixels?: number;
  artworkHeightPixels?: number;
  dpi?: number;
  pageCount?: number;
  aspectMismatchPercent?: number;
  rotationSuggested?: boolean;
  proportionalWidthOption?: { width: number; height: number };
  proportionalHeightOption?: { width: number; height: number };
  questions: string[];
  approved?: boolean;
  approvedAt?: string;
}

export interface PrintOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  title: string;
  status: PrintOrderStatus;
  source: "Email" | "Customer Portal" | "Office" | "Reorder";
  sourceEmailThreadId?: string;
  intakeTicketId?: string;
  portalRequestId?: string;
  customerReference?: string;
  dueDate?: string;
  dueTime?: string;
  deliveryNotes?: string;
  jobIds: string[];
  quoteId?: string;
  invoiceId?: string;
  overallNote?: string;
  customerProductionNotifiedAt?: string;
  customerReadyNotifiedAt?: string;
  customerCompletedNotifiedAt?: string;
  customerEmailNotificationsEnabled?: boolean;
  customerNotificationPath?: CustomerNotificationPath;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  deletedAt?: string;
}

export type JobStatus =
  | "Quote"
  | "Approved"
  | "Prepress"
  | "Printing"
  | "Finishing"
  | "Ready"
  | "Delivered"
  | "Cancelled";

export type PaperKind = "cover" | "text" | "wide-format" | "specialty";

export type TimeCategory =
  | "prepress"
  | "printingSetup"
  | "printingRun"
  | "finishing";

export type EstimateIntent = "saveQuote" | "sendQuote" | "createJob" | "createJobEmail";

export type AiAnalysisMode = "auto" | "basic" | "advanced";
export type AiAnalysisSource = "manual" | "email" | "artwork" | "email_artwork";

export interface AiJobSpecification {
  summary: string;
  customerName?: string;
  productCategory?: string;
  productName?: string;
  quantity?: number;
  finishedWidth?: number;
  finishedHeight?: number;
  sides?: 1 | 2;
  colorSpec?: string;
  paperHint?: string;
  finishing: string[];
  dueDate?: string;
  dueTime?: string;
  customerReference?: string;
  missingInformation: string[];
  warnings: string[];
  confidence: number;
  complexity: "simple" | "moderate" | "complex";
}

export interface AiAnalysisResult {
  id: string;
  source: AiAnalysisSource;
  requestedMode: AiAnalysisMode;
  usedMode: "basic" | "advanced";
  model: string;
  configured: boolean;
  demo: boolean;
  createdAt: string;
  specification: AiJobSpecification;
}

export type AiLearningSourceKind =
  | "ai_review"
  | "approved_job"
  | "approved_multi_item"
  | "job_update"
  | "historical_job";

export interface AiLearningExample {
  id: string;
  analysisId: string;
  source: AiAnalysisSource;
  model: string;
  createdAt: string;
  createdBy?: string;
  sourceKind?: AiLearningSourceKind;
  customerId?: string;
  customerName?: string;
  jobId?: string;
  jobNumber?: string;
  orderId?: string;
  productCategory?: string;
  productName?: string;
  sourceAttachmentNames?: string[];
  inputSummary: string;
  suggested: AiJobSpecification;
  finalForm: Partial<EstimateFormData>;
  corrections: string[];
  outcome: "accepted" | "corrected";
}

export interface AiLearningRecommendation {
  confidence: number;
  repeatCount: number;
  customerSpecificCount: number;
  safeToReuse: boolean;
  productCategory?: string;
  productName?: string;
  finalForm: Partial<EstimateFormData>;
  sourceJobNumbers: string[];
  matchExampleIds: string[];
  conflicts: string[];
  explanation: string;
}

export type EntityKind =
  | "customers"
  | "jobs"
  | "quotes"
  | "invoices"
  | "files"
  | "paperInventory"
  | "catalogPricing";

export interface Employee {
  id: string;
  name: string;
  role: string;
}

export type CustomerPricingTier = "standard" | "wholesale" | "reseller" | "custom";

export interface CustomerContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  title?: string;
  isPrimary?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  companyType: string;
  terms: string;
  lastOrder: string;
  totalSpend: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  attachments?: number;
  openBalance?: number;
  importedFrom?: string;
  archived?: boolean;
  deletedAt?: string;
  contacts?: CustomerContact[];
  portalPricingEnabled?: boolean;
  pricingTier?: CustomerPricingTier;
  pricingAdjustmentPercent?: number;
  productPricingAdjustments?: Record<string, number>;
  portalInstantOrderEnabled?: boolean;
  portalQuoteApprovalRequired?: boolean;
}

export interface PaperStock {
  id: string;
  name: string;
  kind: PaperKind;
  sheetWidth: number;
  sheetHeight: number;
  costPerSheet: number;
  sellPerSheet: number;
  inventorySheets: number;
  inventoryCategory?: string;
  supplier?: string;
  invoiceNumber?: string;
  sourcePage?: string;
  lastOrderedQty?: string;
  unit?: string;
  lastOrderedDate?: string;
  importedFrom?: string;
  productCategories?: string[];
}

export interface UploadedFile {
  id: string;
  name: string;
  folder: "Active Artwork" | "Proofs" | "Invoices" | "Customer Files" | "Archive";
  customerId?: string;
  customerName?: string;
  jobId?: string;
  jobNumber?: string;
  orderId?: string;
  orderNumber?: string;
  size: number;
  type: string;
  uploadedAt: string;
  status: "Active" | "Linked" | "Needs Review" | "Archived";
  preview?: string;
  storagePath?: string;
  storageBucket?: string;
  sourceProvider?: "gmail" | "customer_portal";
  portalVisible?: boolean;
  sourceEmailThreadId?: string;
  sourceEmailMessageId?: string;
  sourceEmailAttachmentId?: string;
  sourceEmailMailbox?: string;
  sourceEmailUidValidity?: string;
  checksumSha256?: string;
  persistedFromEmailAt?: string;
  sourcePortalRequestId?: string;
  deletedAt?: string;
}

export interface Machine {
  id: string;
  name: string;
  type: string;
  hourlyRate: number;
  notes: string;
}

export interface BookletSetup {
  enabled: boolean;
  insidePages: number;
  coverPaperId: string;
  pageCount: number;
  binding: "fold-staple" | "glue" | "spiral" | "fold-only";
  readingDirection?: "ltr" | "rtl";
  coverCost: number;
}

export interface TimeTotals {
  prepress: number;
  printingSetup: number;
  printingRun: number;
  finishing: number;
}

export interface TimeEntry {
  id: string;
  jobId: string;
  category: TimeCategory;
  minutes: number;
  note: string;
  createdAt: string;
}

export interface JobStatusEvent {
  id: string;
  jobId: string;
  fromStatus?: JobStatus;
  toStatus: JobStatus;
  employeeId: string;
  employeeName: string;
  movedAt: string;
  minutesInPreviousStatus: number;
  note?: string;
}

export interface JobPricing {
  paper: number;
  printing: number;
  finishing: number;
  cutting: number;
  bookletCover: number;
  total: number;
}

export interface Job {
  id: string;
  jobNumber: string;
  title: string;
  customerId: string;
  customerName: string;
  status: JobStatus;
  workflowOrder?: number;
  quantity: number;
  pieceWidth: number;
  pieceHeight: number;
  dueDate: string;
  dueTime: string;
  rush: boolean;
  stockId: string;
  stockName: string;
  colorSpec: string;
  sides: 1 | 2;
  bindery: string[];
  orderSource?: string;
  customerReference?: string;
  customerEmailNotificationsEnabled?: boolean;
  customerNotificationPath?: CustomerNotificationPath;
  sourceEmailThreadId?: string;
  sourceEmailMessageId?: string;
  emailThreadIds?: string[];
  intakeTicketId?: string;
  portalRequestId?: string;
  orderId?: string;
  cuttingMode?: "auto" | "include" | "exclude";
  notes?: string;
  artworkName?: string;
  artworkPreview?: string;
  quoteId?: string;
  invoiceId?: string;
  invoiceCreatedAt?: string;
  invoiceReviewedAt?: string;
  invoiceReviewedBy?: string;
  invoiceSentAt?: string;
  customerProductionNotifiedAt?: string;
  customerReadyNotifiedAt?: string;
  customerCompletedNotifiedAt?: string;
  booklet?: BookletSetup;
  time: TimeTotals;
  pricing: JobPricing;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  deletedAt?: string;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  jobId: string;
  orderId?: string;
  jobIds?: string[];
  lineItems?: OrderLineItem[];
  customerId: string;
  customerName: string;
  title: string;
  amount: number;
  status: "Draft" | "Sent" | "Approved" | "Archived";
  createdAt: string;
  sentAt?: string;
  archived?: boolean;
  deletedAt?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobId: string;
  orderId?: string;
  jobIds?: string[];
  lineItems?: OrderLineItem[];
  customerId: string;
  customerName: string;
  title: string;
  amount: number;
  status: "Draft" | "Ready" | "Sent" | "Paid" | "Archived";
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  deletedAt?: string;
}

export type EmailTemplateKey =
  | "quote_ready"
  | "proof_approval"
  | "changes_requested"
  | "job_received"
  | "job_in_production"
  | "ready_pickup"
  | "job_completed"
  | "invoice"
  | "payment_reminder";

export interface EmailTemplate {
  id: EmailTemplateKey;
  name: string;
  description: string;
  subject: string;
  body: string;
  isActive: boolean;
  updatedAt: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  messageId: string;
  providerAttachmentId?: string;
  inline?: boolean;
  contentId?: string;
  /** Authoritative IMAP mailbox identity for this attachment's parent message. */
  mailboxName?: string;
  uidValidity?: string;
}

export interface EmailSourceAttachmentRef {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  messageId: string;
  providerMessageId?: string;
  providerAttachmentId?: string;
  mailboxFolder?: "inbox" | "sent";
  mailboxName?: string;
  uidValidity?: string;
}

export type EmailBusinessCategory =
  | "customer_job"
  | "customer_existing_job"
  | "vendor_quote"
  | "vendor_bill"
  | "vendor_order"
  | "proof"
  | "shipping"
  | "delivery_failure"
  | "newsletter"
  | "junk"
  | "general"
  | "needs_review";

export type EmailBusinessPartyType = "customer" | "vendor" | "other";

export interface EmailBusinessRule {
  id: string;
  matchType: "email" | "domain";
  matchValue: string;
  partyType: EmailBusinessPartyType;
  partyName?: string;
  defaultCategory?: EmailBusinessCategory;
  createdAt: string;
  updatedAt: string;
}

export interface EmailMessage {
  id: string;
  providerMessageId?: string;
  mailboxFolder?: "inbox" | "sent";
  mailboxName?: string;
  uidValidity?: string;
  canonicalId?: string;
  parserVersion?: number;
  /** True after the server loaded the complete RFC message instead of an Inbox preview slice. */
  fullyLoaded?: boolean;
  rfcMessageId?: string;
  inReplyTo?: string;
  references?: string;
  providerThreadKey?: string;
  /** Optional staff override that survives mailbox re-sync. */
  manualConversationId?: string;
  manualConversationMode?: "combined" | "separate";
  threadId: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  sentAt: string;
  unread?: boolean;
  attachments: EmailAttachment[];
  customerId?: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  /** Staff-approved business routing override. Rule-based routing is recalculated from the live message. */
  businessCategory?: EmailBusinessCategory;
  businessCategoryConfidence?: number;
  businessCategoryReason?: string;
  businessCategorySource?: "staff" | "rule";
  businessPartyName?: string;
  /** Staff mailbox organization metadata; preserved across mailbox refreshes. */
  starred?: boolean;
  tags?: string[];
}


export interface EmailThread {
  id: string;
  providerThreadId?: string;
  providerThreadKey?: string;
  subject: string;
  participantEmails: string[];
  snippet: string;
  lastMessageAt: string;
  unread: boolean;
  archived?: boolean;
  customerId?: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  messages: EmailMessage[];
}

export interface EmailIntakeEvent {
  id: string;
  status: EmailIntakeStatus;
  createdAt: string;
  employeeName?: string;
  note: string;
}

export type EmailWorkPath = "job" | "estimate" | "design" | "calculation" | "existing_job";

export type EmailRouteDestination =
  | "job_setup"
  | "estimate"
  | "design"
  | "production"
  | "finishing"
  | "billing"
  | "existing_job";

export type EmailIntakeStatus =
  | "New"
  | "AI Reviewed"
  | "Missing Information"
  | "Ready for Quote"
  | "Ready for Job"
  | "Waiting for Customer"
  | "Converted"
  | "Ignored"
  | "Archived"
  // Legacy values are accepted so v0.4.8/v0.5.0 browser backups still load.
  | "Draft"
  | "In Review";

export interface EmailIntakeTicket {
  id: string;
  ticketNumber?: string;
  /**
   * Job Tickets are an explicit staff action queue. Legacy automatic tickets are
   * retained for history but are not allowed to repopulate active work.
   */
  origin?: "staff" | "legacy_auto";
  threadId: string;
  messageId: string;
  status: EmailIntakeStatus;
  subject: string;
  summary: string;
  customerId?: string;
  customerName?: string;
  productHint?: string;
  productCategory?: string;
  productName?: string;
  quantity?: number;
  pieceWidth?: number;
  pieceHeight?: number;
  sides?: 1 | 2;
  colorSpec?: string;
  paperHint?: string;
  finishing?: string[];
  dueDate?: string;
  dueTime?: string;
  notes: string;
  attachmentIds: string[];
  sourceAttachments?: EmailSourceAttachmentRef[];
  sourceAttachmentFileIds?: string[];
  preferredConversion?: "quote" | "job";
  /** Staff/AI-selected next path for this email-derived Job Ticket. */
  workPath?: EmailWorkPath;
  workPathReason?: string;
  workPathConfirmed?: boolean;
  /**
   * v0.7.0.23 routing fields. A Job Ticket remains in Email Center only until
   * staff takes an action. Once routed, it appears in the recipient's work
   * queue instead of lingering in the email action list.
   */
  routeDestination?: EmailRouteDestination;
  routedAt?: string;
  routedBy?: string;
  assignedToUserId?: string;
  assignedToName?: string;
  assignedRole?: "admin" | "front_desk" | "prepress" | "press" | "finishing";
  assignedDepartment?: string;
  routingNote?: string;
  actionDueAt?: string;
  routeCompletedAt?: string;
  routeCompletedBy?: string;
  customerReplyDraft?: string;
  waitingSince?: string;
  lastCustomerReplyAt?: string;
  createdAt: string;
  updatedAt: string;
  jobId?: string;
  quoteId?: string;
  convertedAt?: string;
  convertedBy?: string;
  conversionKind?: "quote" | "job";
  convertedRecordNumber?: string;
  orderId?: string;
  splitAnalysis?: AiOrderSplitResult;
  conversionStartedAt?: string;
  history?: EmailIntakeEvent[];
  aiAnalysisId?: string;
  aiConfidence?: number;
  aiModel?: string;
  aiUsedMode?: "basic" | "advanced";
  aiMissingInformation?: string[];
  aiSpecification?: AiJobSpecification;
  customerMatchKind?: "exact_email" | "contact_email" | "company_domain" | "company_name" | "unmatched";
  customerMatchConfidence?: number;
  customerMatchReason?: string;
  suggestedCustomerIds?: string[];
  businessCategory?: EmailBusinessCategory;
  businessCategoryReason?: string;
  artworkPreflight?: ArtworkPreflightResult[];
  preflightReviewedAt?: string;
}



export type EmailSafetyMode = "shadow" | "test" | "live";

export interface EmailSafetySettings {
  id: "primary";
  mode: EmailSafetyMode;
  testRecipients: string[];
  redirectBlockedTo?: string;
  redirectBlockedEnabled?: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface EmailLog {
  id: string;
  entityId: string;
  entityType: "job" | "quote" | "invoice" | "customer" | "thread";
  to: string;
  from?: string;
  subject: string;
  body: string;
  createdAt: string;
  status?: "Pending" | "Sent" | "Failed" | "Demo" | "Blocked" | "Test Sent" | "Redirected";
  templateId?: EmailTemplateKey;
  customerId?: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  threadId?: string;
  providerMessageId?: string;
  sentBy?: string;
  error?: string;
  safetyMode?: EmailSafetyMode;
  safetyReason?: string;
  originalTo?: string;
}


export type OperationalActivityCategory =
  | "job"
  | "quote"
  | "invoice"
  | "customer"
  | "file"
  | "email"
  | "portal"
  | "system";

export interface OperationalActivity {
  id: string;
  category: OperationalActivityCategory;
  action: string;
  description: string;
  employeeId: string;
  employeeName: string;
  createdAt: string;
  customerId?: string;
  customerName?: string;
  jobId?: string;
  jobNumber?: string;
  quoteId?: string;
  quoteNumber?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  fromValue?: string;
  toValue?: string;
  details?: Record<string, string | number | boolean | undefined>;
}

export interface CatalogPrice {
  id: string;
  category: string;
  name: string;
  unit: string;
  price: number;
  notes: string;
}

export type UpPreset = "auto" | "custom";

export type FitMode = "contain" | "cover" | "stretch";

export type ImpositionMode = "step-repeat" | "repeat-all-pages" | "join-pages" | "booklet";

export type ArtworkBoxMode = "full-page" | "trim-marks";

export type BleedType = "color" | "mirror" | "duplication";

export type RotationMode = "auto" | "0" | "90" | "180" | "270" | "360";

export interface ImpositionSettings {
  mode: ImpositionMode;
  preset: UpPreset;
  rotate: boolean;
  rotationMode: RotationMode;
  fitMode: FitMode;
  artworkBoxMode: ArtworkBoxMode;
  artworkCrop: number;
  imageBleedEnabled: boolean;
  bleedType: BleedType;
  bleedColor: string;
  bleedLinked: boolean;
  trimLinked: boolean;
  bleedTop: number;
  bleedRight: number;
  bleedBottom: number;
  bleedLeft: number;
  trimTop: number;
  trimRight: number;
  trimBottom: number;
  trimLeft: number;
  keepBleedMargins: boolean;
  customColumns: number;
  customRows: number;
  margin: number;
  gutter: number;
  bleed: number;
  cropMarkLength: number;
  cropMarkOffset: number;
  showBleedGuide: boolean;
  showRegistrationMarks: boolean;
  showFoldMarks: boolean;
  showCornerMarks: boolean;
  duplexMirror: boolean;
  /** Source PDF page count used for saddle-stitch booklet calculations. */
  bookletPageCount?: number;
  /** Reading/binding direction for saddle-stitch page order. English is LTR; Hebrew/Yiddish is RTL. */
  bookletReadingDirection?: "ltr" | "rtl";
}

export interface ImpositionResult {
  columns: number;
  rows: number;
  piecesPerSheet: number;
  artworkRotated: boolean;
  artworkRotation: number;
  sheetWidth: number;
  sheetHeight: number;
  sheetRotated: boolean;
  pieceWidth: number;
  pieceHeight: number;
  layoutLeft: number;
  layoutTop: number;
  layoutWidth: number;
  layoutHeight: number;
  sheetsNeeded: number;
  piles: number;
  cutsPerPile: number;
  cuttingCharge: number;
  wastePercent: number;
  estimatedMinutes: number;
  instructions: string;
}

export interface EstimateFormData {
  customerId: string;
  title: string;
  quantity: number;
  pieceWidth: number;
  pieceHeight: number;
  dueDate: string;
  dueTime: string;
  stockId: string;
  colorSpec: string;
  sides: 1 | 2;
  bindery: string[];
  orderSource?: string;
  customerReference?: string;
  sourceEmailThreadId?: string;
  sourceEmailMessageId?: string;
  intakeTicketId?: string;
  portalRequestId?: string;
  orderId?: string;
  reservedJobNumber?: string;
  cuttingMode?: "auto" | "include" | "exclude";
  artworkName?: string;
  artworkPreview?: string;
  booklet: BookletSetup;
}
