export type CustomerPortalOrderStatus =
  | "Request received"
  | "Waiting for information"
  | "Quote ready"
  | "Awaiting approval"
  | "Artwork review"
  | "In production"
  | "Ready for pickup"
  | "Completed"
  | "Cancelled";

export type CustomerPortalRequestType =
  | "quote_approval"
  | "proof_approval"
  | "proof_changes"
  | "reorder"
  | "new_order"
  | "file_upload"
  | "message";

export type CustomerPortalRequestStatus =
  | "New"
  | "AI Reviewed"
  | "Missing Information"
  | "Waiting for Customer"
  | "Ready for Quote"
  | "Ready for Job"
  | "Converted"
  | "Closed"
  | "Archived"
  // Legacy v0.6.0 values remain readable.
  | "In Review"
  | "Completed";

export interface CustomerPortalProfile {
  customerId: string;
  customerName: string;
  contactName: string;
  email: string;
  phone?: string;
  terms?: string;
  openBalance: number;
  displayName: string;
}

export interface CustomerPortalOrder {
  id: string;
  jobNumber: string;
  parentOrderId?: string;
  parentOrderNumber?: string;
  parentOrderTitle?: string;
  parentOrderStatus?: string;
  orderItemPosition?: number;
  orderItemCount?: number;
  title: string;
  status: CustomerPortalOrderStatus;
  statusDetail: string;
  quantity: number;
  finishedSize: string;
  colorSpec: string;
  sides: 1 | 2;
  finishing: string[];
  stockName?: string;
  artworkName?: string;
  productType?: CustomerPortalProductType;
  dueDate: string;
  dueTime: string;
  createdAt: string;
  updatedAt: string;
  quoteId?: string;
  quoteNumber?: string;
  quoteAmount?: number;
  quoteStatus?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  invoiceStatus?: string;
  canReorder: boolean;
}

export interface CustomerPortalQuote {
  id: string;
  quoteNumber: string;
  jobId: string;
  title: string;
  amount: number;
  status: string;
  createdAt: string;
  sentAt?: string;
  lineItems?: Array<{ id: string; title: string; quantity: number; amount: number; description?: string }>;
  canApprove: boolean;
}

export interface CustomerPortalInvoice {
  id: string;
  invoiceNumber: string;
  jobId: string;
  title: string;
  amount: number;
  status: string;
  lineItems?: Array<{ id: string; title: string; quantity: number; amount: number; description?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPortalFile {
  id: string;
  name: string;
  folder: string;
  jobId?: string;
  jobNumber?: string;
  size: number;
  type: string;
  uploadedAt: string;
  status: string;
  canApproveProof: boolean;
  preview?: string;
}

export interface CustomerPortalMessage {
  id: string;
  direction: "customer" | "gross_printing";
  subject: string;
  body: string;
  sentAt: string;
  attachmentNames: string[];
}

export interface CustomerPortalMessageThread {
  id: string;
  subject: string;
  jobId?: string;
  lastMessageAt: string;
  messages: CustomerPortalMessage[];
}

export interface CustomerPortalRequest {
  id: string;
  requestNumber?: string;
  customerId: string;
  userId?: string;
  type: CustomerPortalRequestType;
  status: CustomerPortalRequestStatus;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  title: string;
  note: string;
  fileName?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
  notificationReadAt?: string;
  notificationReadBy?: string;
  convertedAt?: string;
  convertedBy?: string;
  convertedRecordNumber?: string;
  conversionKind?: "quote" | "job" | "existing_job";
  createdAt: string;
  updatedAt: string;
}


export interface CustomerPortalNotification {
  id: string;
  jobId?: string;
  jobNumber?: string;
  title: string;
  message: string;
  status?: CustomerPortalOrderStatus;
  createdAt: string;
  channel: "portal" | "email";
}

export interface CustomerPortalData {
  demo: boolean;
  profile: CustomerPortalProfile;
  orders: CustomerPortalOrder[];
  quotes: CustomerPortalQuote[];
  invoices: CustomerPortalInvoice[];
  files: CustomerPortalFile[];
  messages: CustomerPortalMessageThread[];
  notifications: CustomerPortalNotification[];
  requests: CustomerPortalRequest[];
  summary: {
    activeOrders: number;
    readyForPickup: number;
    openQuotes: number;
    openInvoices: number;
    openBalance: number;
  };
}

export interface CustomerPortalAdminAccount {
  userId: string;
  customerId: string;
  email: string;
  displayName: string;
  isActive: boolean;
  invitedAt?: string;
  lastSignInAt?: string;
}

export interface CustomerPortalAdminData {
  configured: boolean;
  demo: boolean;
  accounts: CustomerPortalAdminAccount[];
  requests: CustomerPortalRequest[];
}


export type CustomerPortalProductType =
  | "Business Cards"
  | "Flyers / Brochures"
  | "Booklets"
  | "Invitations"
  | "Labels / Stickers"
  | "Envelopes"
  | "Posters"
  | "Signs / Banners"
  | "Copies"
  | "Plans / Blueprints"
  | "Tea Party Cards"
  | "Receipt Books"
  | "Stamps"
  | "Simcha Bags"
  | "Other";

export type CustomerPortalRequestPurpose =
  | "quote"
  | "order"
  | "reorder"
  | "existing_upload"
  | "change"
  | "message";

export interface CustomerPortalRequestMetadata extends Record<string, unknown> {
  requestPurpose?: CustomerPortalRequestPurpose;
  productType?: CustomerPortalProductType;
  quantity?: number;
  finishedWidth?: number;
  finishedHeight?: number;
  flatWidth?: number;
  flatHeight?: number;
  sides?: 1 | 2;
  colorSpec?: string;
  paperPreference?: string;
  paperWeight?: string;
  coating?: string;
  bleed?: boolean;
  proofRequired?: boolean;
  deliveryMethod?: "Pickup" | "Delivery" | "Shipping";
  material?: string;
  indoorOutdoor?: "Indoor" | "Outdoor" | "Both";
  finishing?: string[];
  folds?: string;
  pageCount?: number;
  insidePaper?: string;
  coverPreference?: string;
  binding?: string;
  labelFormat?: "Sheet labels" | "Roll labels";
  shape?: string;
  adhesive?: string;
  grommets?: boolean;
  hemming?: boolean;
  installation?: boolean;
  dueDate?: string;
  customerPo?: string;
  sourceJobId?: string;
  sourceJobNumber?: string;
  sourceJobTitle?: string;
  previousQuantity?: number;
  useSameArtwork?: boolean;
  changesRequested?: string;
  staffNote?: string;
  staffReply?: string;
  staffRepliedAt?: string;
  approvedSellingPrice?: number;
  approvedPriceAt?: string;
  approvedPriceBy?: string;
  previousJobId?: string;
  previousJobNumber?: string;
  customerMatchKind?: "exact_email" | "contact_email" | "company_domain" | "company_name" | "unmatched";
  customerMatchNote?: string;
  aiSummary?: string;
  aiModel?: string;
  aiConfidence?: number;
  aiMissingInformation?: string[];
}

export type CustomerPortalAccessRequestStatus =
  | "Pending"
  | "Reviewed"
  | "Invited"
  | "Declined"
  | "Archived";

export interface CustomerPortalAccessRequest {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  existingCustomer?: string;
  note?: string;
  status: CustomerPortalAccessRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}
