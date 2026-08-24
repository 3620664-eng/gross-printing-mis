import type {
  CatalogPrice,
  Customer,
  Employee,
  EmailIntakeTicket,
  EmailLog,
  EmailTemplate,
  EmailThread,
  Invoice,
  Job,
  JobStatusEvent,
  Machine,
  PaperStock,
  Quote,
  UploadedFile
} from "./types";
import { importedCustomers, importedPaperStocks } from "./imported-demo-data";
import { priceListCatalogPrices } from "./price-list";

const sampleArtwork = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#fbfbf8"/>
  <rect x="40" y="40" width="720" height="420" rx="16" fill="#0f2d4a"/>
  <circle cx="660" cy="130" r="76" fill="#f4c542"/>
  <rect x="86" y="96" width="330" height="34" fill="#ffffff" opacity=".9"/>
  <rect x="86" y="158" width="505" height="18" fill="#d6e4ee"/>
  <rect x="86" y="198" width="430" height="18" fill="#d6e4ee"/>
  <rect x="86" y="330" width="184" height="62" rx="8" fill="#f04f3d"/>
  <text x="102" y="371" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#fff">SPRING SALE</text>
</svg>
`);

export const sampleArtworkDataUrl = `data:image/svg+xml;charset=utf-8,${sampleArtwork}`;

export const employees: Employee[] = [
  { id: "emp-chaim", name: "Chaim Gross", role: "Owner / CSR" },
  { id: "emp-prepress", name: "Prepress Desk", role: "Prepress" },
  { id: "emp-press", name: "Press Operator", role: "Printing" },
  { id: "emp-finish", name: "Finishing Team", role: "Finishing" }
];

export const paperStocks: PaperStock[] = [
  {
    id: "stock-gloss-cover-13x19",
    name: "100lb Gloss Cover - 13x19",
    kind: "cover",
    sheetWidth: 13,
    sheetHeight: 19,
    costPerSheet: 0.38,
    sellPerSheet: 0.88,
    inventorySheets: 6200,
    productCategories: ["Business Cards", "Invitations"]
  },
  {
    id: "stock-silk-cover-12x18",
    name: "130lb Silk Cover - 12x18",
    kind: "cover",
    sheetWidth: 12,
    sheetHeight: 18,
    costPerSheet: 0.56,
    sellPerSheet: 1.18,
    inventorySheets: 2800,
    productCategories: ["Business Cards", "Invitations"]
  },
  {
    id: "stock-text-12x18",
    name: "80lb Text - 12x18",
    kind: "text",
    sheetWidth: 12,
    sheetHeight: 18,
    costPerSheet: 0.12,
    sellPerSheet: 0.32,
    inventorySheets: 18000,
    productCategories: ["Flyers & Brochures", "Booklets & Books", "Copies"]
  },
  {
    id: "stock-uncoated-11x17",
    name: "70lb Uncoated Text - 11x17",
    kind: "text",
    sheetWidth: 11,
    sheetHeight: 17,
    costPerSheet: 0.08,
    sellPerSheet: 0.24,
    inventorySheets: 23000,
    productCategories: ["Flyers & Brochures", "Booklets & Books", "Copies"]
  },
  {
    id: "stock-vinyl-54-roll",
    name: "Matte Vinyl Roll - 54in",
    kind: "wide-format",
    sheetWidth: 54,
    sheetHeight: 120,
    costPerSheet: 8.75,
    sellPerSheet: 18.5,
    inventorySheets: 41,
    productCategories: ["Signs & Banners"]
  },
  {
    id: "stock-label-8511",
    name: "White Adhesive Label - 8.5x11",
    kind: "specialty",
    sheetWidth: 8.5,
    sheetHeight: 11,
    costPerSheet: 0.24,
    sellPerSheet: 0.72,
    inventorySheets: 3200,
    productCategories: ["Labels & Stickers"]
  },
  {
    id: "stock-label-1117",
    name: "White Adhesive Label - 11x17",
    kind: "specialty",
    sheetWidth: 11,
    sheetHeight: 17,
    costPerSheet: 0.42,
    sellPerSheet: 1.11,
    inventorySheets: 1800,
    productCategories: ["Labels & Stickers"]
  },
  {
    id: "stock-label-1218",
    name: "White Adhesive Label - 12x18",
    kind: "specialty",
    sheetWidth: 12,
    sheetHeight: 18,
    costPerSheet: 0.52,
    sellPerSheet: 1.42,
    inventorySheets: 1400,
    productCategories: ["Labels & Stickers"]
  },
  {
    id: "stock-env-10",
    name: "#10 White Envelope - 9.5x4.125",
    kind: "specialty",
    sheetWidth: 9.5,
    sheetHeight: 4.125,
    costPerSheet: 0.07,
    sellPerSheet: 0.18,
    inventorySheets: 4200,
    productCategories: ["Envelopes"]
  },
  {
    id: "stock-env-9",
    name: "#9 Reply Envelope - 8.875x3.875",
    kind: "specialty",
    sheetWidth: 8.875,
    sheetHeight: 3.875,
    costPerSheet: 0.065,
    sellPerSheet: 0.16,
    inventorySheets: 3600,
    productCategories: ["Envelopes"]
  },
  {
    id: "stock-env-a2",
    name: "A2 Announcement Envelope - 5.75x4.375",
    kind: "specialty",
    sheetWidth: 5.75,
    sheetHeight: 4.375,
    costPerSheet: 0.08,
    sellPerSheet: 0.2,
    inventorySheets: 1900,
    productCategories: ["Envelopes"]
  },
  {
    id: "stock-env-a7",
    name: "A7 Invitation Envelope - 7.25x5.25",
    kind: "specialty",
    sheetWidth: 7.25,
    sheetHeight: 5.25,
    costPerSheet: 0.1,
    sellPerSheet: 0.24,
    inventorySheets: 2400,
    productCategories: ["Envelopes"]
  },
  ...importedPaperStocks
];

export const customers: Customer[] = [
  {
    id: "cust-hudson",
    name: "Hudson Dental Group",
    contact: "Miriam Stern",
    email: "miriam@hudsondental.example",
    phone: "(718) 555-0142",
    companyType: "Healthcare",
    terms: "Net 15",
    lastOrder: "2026-05-28",
    totalSpend: 14840
  },
  {
    id: "cust-yeshiva",
    name: "Northside Yeshiva",
    contact: "Avi Klein",
    email: "avi@northsideyeshiva.example",
    phone: "(718) 555-0188",
    companyType: "School",
    terms: "Net 30",
    lastOrder: "2026-05-24",
    totalSpend: 22390
  },
  {
    id: "cust-market",
    name: "Parkview Market",
    contact: "Leah Gross",
    email: "leah@parkviewmarket.example",
    phone: "(718) 555-0199",
    companyType: "Retail",
    terms: "Due on receipt",
    lastOrder: "2026-05-31",
    totalSpend: 9215
  },
  {
    id: "cust-camp",
    name: "Camp Ahava",
    contact: "Yossi Adler",
    email: "yossi@campahava.example",
    phone: "(845) 555-0171",
    companyType: "Nonprofit",
    terms: "Net 15",
    lastOrder: "2026-05-20",
    totalSpend: 18730,
    portalPricingEnabled: true,
    pricingTier: "reseller",
    pricingAdjustmentPercent: -10,
    portalInstantOrderEnabled: false,
    portalQuoteApprovalRequired: true,
    contacts: [
      { id: "contact-camp-yossi", name: "Yossi Adler", email: "yossi@campahava.example", phone: "(845) 555-0171", department: "Purchasing", isPrimary: true },
      { id: "contact-camp-office", name: "Camp Ahava Office", email: "office@campahava.example", department: "Office" }
    ]
  },
  ...importedCustomers
];

export const jobs: Job[] = [
  {
    id: "job-1048",
    jobNumber: "GP-1048",
    title: "Summer Camp Postcards",
    customerId: "cust-camp",
    customerName: "Camp Ahava",
    status: "Prepress",
    quantity: 5000,
    pieceWidth: 4,
    pieceHeight: 6,
    dueDate: "2026-06-02",
    dueTime: "14:00",
    rush: true,
    stockId: "stock-gloss-cover-13x19",
    stockName: "100lb Gloss Cover - 13x19",
    colorSpec: "4/4 full color",
    sides: 2,
    bindery: ["Cut to size", "Box by 500"],
    artworkName: "camp-postcard.pdf",
    artworkPreview: sampleArtworkDataUrl,
    quoteId: "quote-2041",
    time: { prepress: 34, printingSetup: 0, printingRun: 0, finishing: 0 },
    pricing: { paper: 368, printing: 650, finishing: 60, cutting: 72, bookletCover: 0, total: 1150 },
    createdAt: "2026-05-31T10:20:00",
    updatedAt: "2026-06-01T09:12:00"
  },
  {
    id: "job-1049",
    jobNumber: "GP-1049",
    title: "Dental Recall Cards",
    customerId: "cust-hudson",
    customerName: "Hudson Dental Group",
    status: "Printing",
    quantity: 2500,
    pieceWidth: 5,
    pieceHeight: 7,
    dueDate: "2026-06-04",
    dueTime: "11:00",
    rush: false,
    stockId: "stock-silk-cover-12x18",
    stockName: "130lb Silk Cover - 12x18",
    colorSpec: "4/1 color",
    sides: 2,
    bindery: ["Cut", "Round corners"],
    artworkPreview: sampleArtworkDataUrl,
    time: { prepress: 22, printingSetup: 18, printingRun: 42, finishing: 0 },
    pricing: { paper: 296, printing: 325, finishing: 90, cutting: 56, bookletCover: 0, total: 767 },
    createdAt: "2026-05-30T13:18:00",
    updatedAt: "2026-06-01T10:44:00"
  },
  {
    id: "job-1050",
    jobNumber: "GP-1050",
    title: "School Dinner Journal",
    customerId: "cust-yeshiva",
    customerName: "Northside Yeshiva",
    status: "Quote",
    quantity: 750,
    pieceWidth: 8.5,
    pieceHeight: 11,
    dueDate: "2026-06-12",
    dueTime: "17:00",
    rush: false,
    stockId: "stock-text-12x18",
    stockName: "80lb Text - 12x18",
    colorSpec: "4/4 booklet",
    sides: 2,
    bindery: ["Fold", "Saddle stitch"],
    booklet: {
      enabled: true,
      insidePages: 48,
      coverPaperId: "stock-silk-cover-12x18",
      pageCount: 52,
      binding: "fold-staple",
      coverCost: 95
    },
    time: { prepress: 0, printingSetup: 0, printingRun: 0, finishing: 0 },
    pricing: { paper: 480, printing: 780, finishing: 210, cutting: 28, bookletCover: 134, total: 1632 },
    quoteId: "quote-2042",
    createdAt: "2026-06-01T08:04:00",
    updatedAt: "2026-06-01T08:04:00"
  },
  {
    id: "job-1051",
    jobNumber: "GP-1051",
    title: "Market Window Posters",
    customerId: "cust-market",
    customerName: "Parkview Market",
    status: "Ready",
    quantity: 20,
    pieceWidth: 18,
    pieceHeight: 24,
    dueDate: "2026-06-01",
    dueTime: "16:00",
    rush: true,
    stockId: "stock-vinyl-54-roll",
    stockName: "Matte Vinyl Roll - 54in",
    colorSpec: "Large format color",
    sides: 1,
    bindery: ["Trim", "Roll and label"],
    artworkPreview: sampleArtworkDataUrl,
    invoiceId: "inv-3008",
    time: { prepress: 12, printingSetup: 16, printingRun: 68, finishing: 24 },
    pricing: { paper: 185, printing: 520, finishing: 85, cutting: 24, bookletCover: 0, total: 814 },
    createdAt: "2026-05-31T15:42:00",
    updatedAt: "2026-06-01T11:05:00"
  }
];

export const statusEvents: JobStatusEvent[] = [
  {
    id: "hist-1048-1",
    jobId: "job-1048",
    fromStatus: "Quote",
    toStatus: "Approved",
    employeeId: "emp-chaim",
    employeeName: "Chaim Gross",
    movedAt: "2026-05-30T16:32:00",
    minutesInPreviousStatus: 372,
    note: "Customer approved quote."
  },
  {
    id: "hist-1048-2",
    jobId: "job-1048",
    fromStatus: "Approved",
    toStatus: "Prepress",
    employeeId: "emp-prepress",
    employeeName: "Prepress Desk",
    movedAt: "2026-06-01T09:12:00",
    minutesInPreviousStatus: 2440,
    note: "Released to prepress."
  },
  {
    id: "hist-1049-1",
    jobId: "job-1049",
    fromStatus: "Quote",
    toStatus: "Approved",
    employeeId: "emp-chaim",
    employeeName: "Chaim Gross",
    movedAt: "2026-05-30T14:04:00",
    minutesInPreviousStatus: 46
  },
  {
    id: "hist-1049-2",
    jobId: "job-1049",
    fromStatus: "Approved",
    toStatus: "Prepress",
    employeeId: "emp-prepress",
    employeeName: "Prepress Desk",
    movedAt: "2026-05-31T08:35:00",
    minutesInPreviousStatus: 1111
  },
  {
    id: "hist-1049-3",
    jobId: "job-1049",
    fromStatus: "Prepress",
    toStatus: "Printing",
    employeeId: "emp-press",
    employeeName: "Press Operator",
    movedAt: "2026-06-01T10:44:00",
    minutesInPreviousStatus: 1569
  },
  {
    id: "hist-1051-1",
    jobId: "job-1051",
    fromStatus: "Printing",
    toStatus: "Ready",
    employeeId: "emp-finish",
    employeeName: "Finishing Team",
    movedAt: "2026-06-01T11:05:00",
    minutesInPreviousStatus: 84,
    note: "Packed for pickup."
  }
];

export const quotes: Quote[] = [
  {
    id: "quote-2041",
    quoteNumber: "Q-2041",
    jobId: "job-1048",
    customerId: "cust-camp",
    customerName: "Camp Ahava",
    title: "Summer Camp Postcards",
    amount: 1150,
    status: "Approved",
    createdAt: "2026-05-30T16:25:00",
    sentAt: "2026-05-30T16:30:00"
  },
  {
    id: "quote-2042",
    quoteNumber: "Q-2042",
    jobId: "job-1050",
    customerId: "cust-yeshiva",
    customerName: "Northside Yeshiva",
    title: "School Dinner Journal",
    amount: 1632,
    status: "Draft",
    createdAt: "2026-06-01T08:04:00"
  }
];

export const invoices: Invoice[] = [
  {
    id: "inv-3008",
    invoiceNumber: "INV-3008",
    jobId: "job-1051",
    customerId: "cust-market",
    customerName: "Parkview Market",
    title: "Market Window Posters",
    amount: 814,
    status: "Ready",
    createdAt: "2026-06-01T11:05:00",
    updatedAt: "2026-06-01T11:05:00"
  }
];

export const emailLogs: EmailLog[] = [
  {
    id: "email-1",
    entityId: "quote-2041",
    entityType: "quote",
    to: "yossi@campahava.example",
    subject: "Quote Q-2041 from Gross Printing",
    body: "Your quote is ready for review.",
    createdAt: "2026-05-30T16:30:00"
  }
];

export const catalogPrices: CatalogPrice[] = [
  ...priceListCatalogPrices,
  { id: "cat-print-spec-44", category: "Printing", name: "4/4 full color - 2 sides", unit: "per finished piece", price: 0.13, notes: "Color front and color back. General fallback before product-specific tables." },
  { id: "cat-print-spec-41", category: "Printing", name: "4/1 color front / black back - 2 sides", unit: "per finished piece", price: 0.09, notes: "Color front with black back." },
  { id: "cat-print-spec-40", category: "Printing", name: "4/0 full color - 1 side", unit: "per finished piece", price: 0.07, notes: "Color one side only." },
  { id: "cat-print-spec-11", category: "Printing", name: "1/1 black - 2 sides", unit: "per finished piece", price: 0.036, notes: "Black front and black back." },
  { id: "cat-print-spec-10", category: "Printing", name: "1/0 black - 1 side", unit: "per finished piece", price: 0.018, notes: "Black one side only." },
  { id: "cat-print-color", category: "Printing", name: "Ricoh Pro C7200 color click", unit: "side", price: 0.065, notes: "Local demo rate for digital color" },
  { id: "cat-print-bw", category: "Printing", name: "Black click", unit: "side", price: 0.018, notes: "Text and booklet interiors" },
  { id: "cat-cut", category: "Cutting", name: "Cutting", unit: "actual cut", price: 2, notes: "Cuts x piles x $2" },
  { id: "cat-score", category: "Finishing", name: "Score / crease", unit: "piece", price: 0.035, notes: "DC-618 cutter/creaser" },
  { id: "cat-fold", category: "Finishing", name: "Fold", unit: "piece", price: 0.025, notes: "Folder/stapler/finishing" },
  { id: "cat-vinyl", category: "Vinyl/Signs", name: "Wide-format vinyl", unit: "sq ft", price: 8.5, notes: "Large format printer" },
  { id: "cat-booklet-cover", category: "Booklets", name: "Booklet cover setup", unit: "job", price: 95, notes: "Cover paper + setup + bindery rules" },
  { id: "cat-proof", category: "Proofing", name: "PDF proof and approval follow-up", unit: "job", price: 18, notes: "Proof approval workflow item" },
  { id: "cat-delivery", category: "Delivery", name: "Local delivery slip", unit: "stop", price: 22, notes: "Delivery note / box label handling" },
  { id: "cat-outsource", category: "Outsourcing", name: "Vendor quote request", unit: "job", price: 35, notes: "For outside trade work and specialty finishing" }
];

export const machines: Machine[] = [
  { id: "mach-ricoh", name: "Ricoh Pro C7200", type: "Digital press", hourlyRate: 140, notes: "Main color production press" },
  { id: "mach-large-format", name: "Large format printer", type: "Wide format", hourlyRate: 95, notes: "Posters, vinyl, banners" },
  { id: "mach-dc618", name: "DC-618 cutter/creaser", type: "Finishing", hourlyRate: 110, notes: "Slit, cut, crease, perforate" },
  { id: "mach-folder", name: "Folder/stapler/finishing", type: "Bindery", hourlyRate: 90, notes: "Booklets and folded work" }
];

export const uploadedFiles: UploadedFile[] = [
  {
    id: "file-1001",
    name: "camp-postcard-final.pdf",
    folder: "Active Artwork",
    customerId: "cust-camp",
    customerName: "Camp Ahava",
    jobId: "job-1048",
    jobNumber: "GP-1048",
    size: 1840000,
    type: "application/pdf",
    uploadedAt: "2026-06-01T09:10:00",
    status: "Linked",
    preview: sampleArtworkDataUrl,
    portalVisible: true
  },
  {
    id: "file-camp-proof",
    name: "camp-postcard-proof.pdf",
    folder: "Proofs",
    customerId: "cust-camp",
    customerName: "Camp Ahava",
    jobId: "job-1048",
    jobNumber: "GP-1048",
    size: 925000,
    type: "application/pdf",
    uploadedAt: "2026-08-04T12:15:00",
    status: "Needs Review",
    preview: sampleArtworkDataUrl,
    portalVisible: true
  },
  {
    id: "file-1002",
    name: "dental-recall-proof.pdf",
    folder: "Proofs",
    customerId: "cust-hudson",
    customerName: "Hudson Dental Group",
    jobId: "job-1049",
    jobNumber: "GP-1049",
    size: 980000,
    type: "application/pdf",
    uploadedAt: "2026-06-01T10:22:00",
    status: "Needs Review",
    preview: sampleArtworkDataUrl
  }
];

export const defaultEmailTemplates: EmailTemplate[] = [
  {
    id: "quote_ready",
    name: "Quote ready",
    description: "Send a completed quote to the customer.",
    subject: "Quote {{quote_number}} from Gross Printing",
    body: "Hi {{customer_name}},\n\nYour quote for {{job_name}} is ready. The total is {{amount}} and the requested due date is {{due_date}}.\n\nReview and approve the quote in your Customer Portal:\n{{portal_quote_link}}\n\nYou can also reply to this email with any changes.\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-04T09:00:00"
  },
  {
    id: "proof_approval",
    name: "Proof approval",
    description: "Ask the customer to approve artwork before production.",
    subject: "Proof approval needed for {{job_number}}",
    body: "Hi {{customer_name}},\n\nPlease review the attached proof for {{job_name}}. Reply APPROVED to release the job to production, or send the changes you need.\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-04T09:00:00"
  },
  {
    id: "changes_requested",
    name: "Changes requested",
    description: "Confirm that customer corrections were received.",
    subject: "Changes received for {{job_number}}",
    body: "Hi {{customer_name}},\n\nWe received your requested changes for {{job_name}}. We will prepare an updated proof and send it for approval.\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-04T09:00:00"
  },
  {
    id: "job_received",
    name: "Job received",
    description: "Confirm a new production job.",
    subject: "{{job_number}} received by Gross Printing",
    body: "Hi {{customer_name}},\n\nWe received {{job_name}} and added it to production. The current due date is {{due_date}}.\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-04T09:00:00"
  },
  {
    id: "job_in_production",
    name: "Job in production",
    description: "Tell the customer that production has started.",
    subject: "{{job_number}} is in production",
    body: "Hi {{customer_name}},\n\nYour job, {{job_name}}, is now in production. We will contact you when it is ready.\n\nView the current job details in your Customer Portal:\n{{portal_job_link}}\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-04T09:00:00"
  },
  {
    id: "ready_pickup",
    name: "Ready for pickup",
    description: "Pickup or delivery notification.",
    subject: "{{job_number}} is ready for pickup",
    body: "Hi {{customer_name}},\n\nYour {{job_name}} is ready for pickup at Gross Printing. The balance is {{amount}}.\n\nView the job and invoice details in your Customer Portal:\n{{portal_invoice_link}}\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-04T09:00:00"
  },
  {
    id: "job_completed",
    name: "Job completed",
    description: "Tell the customer that the order has been completed.",
    subject: "{{job_number}} has been completed",
    body: "Hi {{customer_name}},\n\nYour order, {{job_name}}, has been completed.\n\nReview the order and invoice in your Customer Portal:\n{{portal_link}}\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-05T18:00:00"
  },
  {
    id: "invoice",
    name: "Invoice",
    description: "Send an invoice and payment information.",
    subject: "Invoice {{invoice_number}} from Gross Printing",
    body: "Hi {{customer_name}},\n\nInvoice {{invoice_number}} for {{job_name}} is ready. The invoice total is {{amount}}.\n\nView the invoice in your Customer Portal:\n{{portal_invoice_link}}\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-04T09:00:00"
  },
  {
    id: "payment_reminder",
    name: "Payment reminder",
    description: "Remind the customer about an open balance.",
    subject: "Payment reminder for {{invoice_number}}",
    body: "Hi {{customer_name}},\n\nThis is a reminder that {{amount}} remains open on invoice {{invoice_number}} for {{job_name}}. Please reply if you need another copy of the invoice.\n\nThank you,\n{{company_contact}}\n{{company_name}}\n{{company_phone}} | {{company_email}}",
    isActive: true,
    updatedAt: "2026-08-04T09:00:00"
  }
];

export const emailThreads: EmailThread[] = [
  {
    id: "thread-camp-two-brochures",
    providerThreadId: "demo-thread-camp-two-brochures",
    subject: "Two brochures for the August program",
    participantEmails: ["yossi@campahava.example", "jobs@grossprinting.com"],
    snippet: "Please quote both attached brochures. They have different quantities and finishing.",
    lastMessageAt: "2026-08-05T18:35:00",
    unread: true,
    customerId: "cust-camp",
    messages: [
      {
        id: "message-camp-two-brochures-1",
        providerMessageId: "demo-message-camp-two-brochures-1",
        threadId: "thread-camp-two-brochures",
        direction: "inbound",
        from: "Yossi <yossi@campahava.example>",
        to: ["jobs@grossprinting.com"],
        subject: "Two brochures for the August program",
        bodyText: "Hi, please quote both attached brochures. Summer Program brochure: 1,000 copies, 8.5 x 11, full color both sides, tri-fold on gloss text. Registration brochure: 500 copies, 11 x 17, full color both sides, half-fold. We need both next Friday. Please keep them on one quote and one invoice, but they are two separate finished brochures.",
        sentAt: "2026-08-05T18:35:00",
        unread: true,
        customerId: "cust-camp",
        attachments: [
          {
            id: "attachment-camp-summer-brochure",
            filename: "summer-program-brochure-1000-trifold.pdf",
            mimeType: "application/pdf",
            size: 1142311,
            messageId: "demo-message-camp-two-brochures-1",
            providerAttachmentId: "demo-attachment-camp-summer-brochure"
          },
          {
            id: "attachment-camp-registration-brochure",
            filename: "registration-brochure-500-half-fold.pdf",
            mimeType: "application/pdf",
            size: 982144,
            messageId: "demo-message-camp-two-brochures-1",
            providerAttachmentId: "demo-attachment-camp-registration-brochure"
          },
          {
            id: "attachment-camp-delivery-note",
            filename: "delivery-instructions.txt",
            mimeType: "text/plain",
            size: 412,
            messageId: "demo-message-camp-two-brochures-1",
            providerAttachmentId: "demo-attachment-camp-delivery-note"
          }
        ]
      }
    ]
  },
  {
    id: "thread-camp-postcards",
    providerThreadId: "demo-thread-camp-postcards",
    subject: "Postcards for next week",
    participantEmails: ["yossi@campahava.example", "jobs@grossprinting.com"],
    snippet: "Please print 2,500 postcards, 4 x 6, full color both sides. Artwork is attached.",
    lastMessageAt: "2026-08-03T15:42:00",
    unread: true,
    customerId: "cust-camp",
    messages: [
      {
        id: "message-camp-postcards-1",
        providerMessageId: "demo-message-camp-postcards-1",
        threadId: "thread-camp-postcards",
        direction: "inbound",
        from: "Yossi <yossi@campahava.example>",
        to: ["jobs@grossprinting.com"],
        subject: "Postcards for next week",
        bodyText: "Hi, please print 2,500 postcards, 4 x 6, full color both sides. We need them next Tuesday. Artwork is attached. Please send a price before printing.",
        sentAt: "2026-08-03T15:42:00",
        unread: true,
        customerId: "cust-camp",
        attachments: [
          {
            id: "attachment-camp-postcards-artwork",
            filename: "camp-postcard-final.pdf",
            mimeType: "application/pdf",
            size: 842311,
            messageId: "demo-message-camp-postcards-1",
            providerAttachmentId: "demo-attachment-camp-postcards-artwork"
          }
        ]
      }
    ]
  },
  {
    id: "thread-northside-booklet",
    providerThreadId: "demo-thread-northside-booklet",
    subject: "Re: School dinner journal proof",
    participantEmails: ["office@northsideyeshiva.example", "jobs@grossprinting.com"],
    snippet: "The proof is approved. Please continue with printing.",
    lastMessageAt: "2026-08-03T12:18:00",
    unread: false,
    customerId: "cust-yeshiva",
    jobId: "job-1050",
    messages: [
      {
        id: "message-northside-proof-1",
        providerMessageId: "demo-message-northside-proof-1",
        threadId: "thread-northside-booklet",
        direction: "inbound",
        from: "Northside Office <office@northsideyeshiva.example>",
        to: ["jobs@grossprinting.com"],
        subject: "Re: School dinner journal proof",
        bodyText: "The proof is approved. Please continue with printing.",
        sentAt: "2026-08-03T12:18:00",
        unread: false,
        customerId: "cust-yeshiva",
        jobId: "job-1050",
        attachments: []
      }
    ]
  }
];

export const emailIntakeTickets: EmailIntakeTicket[] = [];
