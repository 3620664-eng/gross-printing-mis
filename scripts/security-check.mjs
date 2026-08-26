import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const serverAuth = read("src/lib/server-auth.ts");
const shopData = read("src/app/api/shop-data/route.ts");
const authSession = read("src/app/api/auth/session/route.ts");
const misApp = read("src/components/MISApp.tsx");
const newEstimateJob = read("src/components/NewEstimateJob.tsx");
const impositionStudio = read("src/components/ImpositionStudio.tsx");
const customerPortal = read("src/components/CustomerPortal.tsx");
const nextConfig = read("next.config.mjs");
const migration = read("supabase/GROSS_PRINTING_MIS_V067_SERVER_SECURITY.sql");
const portalServer = read("src/lib/customer-portal-server.ts");
const fileUpload = read("src/app/api/files/upload/route.ts");
const portalClient = read("src/components/CustomerSelfServicePortal.tsx");
const portalSession = read("src/app/api/customer-portal/session/route.ts");
const portalAction = read("src/app/api/customer-portal/action/route.ts");
const sessionTracking = read("src/app/api/session/route.ts");
const portalAdmin = read("src/app/api/customer-portal/admin/route.ts");
const portalSignup = read("src/app/api/customer-portal/signup/route.ts");
const passwordReset = read("src/app/api/auth/password-reset/route.ts");
const emailSend = read("src/app/api/email/send/route.ts");
const emailSafetyRoute = read("src/app/api/email/safety/route.ts");
const publicQuoteRequest = read("src/app/api/public/quote-request/route.ts");
const publicQuoteForm = read("src/components/website/PublicQuoteForm.tsx");
const publicQuoteMigration = read("supabase/GROSS_PRINTING_MIS_V0671_PUBLIC_QUOTE_INTAKE.sql");
const b2bMigration = read("supabase/GROSS_PRINTING_MIS_V0674_B2B_SMART_QUOTES.sql");
const customerPriceRoute = read("src/app/api/customer-portal/price/route.ts");
const customerPriceServer = read("src/lib/customer-pricing-server.ts");
const customerMatch = read("src/lib/customer-match.ts");
const gmailServer = read("src/lib/gmail-server.ts");
const emailAttachment = read("src/app/api/email/attachment/route.ts");
const emailMessageDetails = read("src/app/api/email/message/route.ts");
const emailInline = read("src/app/api/email/inline/route.ts");
const emailArtwork = read("src/app/api/email/artwork/route.ts");
const emailReadState = read("src/app/api/email/read-state/route.ts");
const emailCenter = read("src/components/EmailCenter.tsx");
const portalRequests = read("src/components/PortalRequests.tsx");
const workflow = read("src/components/Workflow.tsx");
const settings = read("src/components/Settings.tsx");
const staffDirectory = read("src/app/api/staff-directory/route.ts");
const aiPricingServer = read("src/lib/ai-pricing-server.ts");
const impositionPdf = read("src/lib/imposition-pdf.ts");
const aiSplitServer = read("src/lib/ai-order-split-server.ts");
const emailBusinessClassifier = read("src/lib/email-business-classifier.ts");
const multiItemOrderReview = read("src/components/MultiItemOrderReview.tsx");
const learningEngine = read("src/lib/learning-engine.ts");
const communicationLearning = read("src/lib/communication-learning.ts");
const communicationRoute = read("src/app/api/ai/communication/route.ts");
const emailSafetyServer = read("src/lib/email-safety-server.ts");
const filesWorkspace = read("src/components/FilesWorkspace.tsx");
const emailAttachmentThumbnail = read("src/components/EmailAttachmentThumbnail.tsx");
const aiEstimateAssistant = read("src/components/AiEstimateAssistant.tsx");

check(exists("src/app/api/files/upload/route.ts"), "Protected file upload route is missing.");
check(exists("src/app/api/files/sign/route.ts"), "Protected file signing route is missing.");
check(exists("src/app/api/security/overview/route.ts"), "Owner security overview route is missing.");
check(exists("src/app/api/security/restore/route.ts"), "Protected record restore route is missing.");
check(fileUpload.includes("ALLOWED_EXTENSIONS") && fileUpload.includes("signatureMatches"), "Protected staff file validation is incomplete.");
check(fileUpload.includes('"html"') && fileUpload.includes('"svg"') && fileUpload.includes('"wasm"'), "Active web file blocking is incomplete.");
check(serverAuth.includes("process.env.NODE_ENV !== \"production\""), "Production demo-mode guard is missing.");
check(serverAuth.includes("httpOnly: true") && serverAuth.includes('sameSite: "strict"'), "HttpOnly strict staff cookies are missing.");
check(authSession.includes("setStaffCookies") && authSession.includes("clearStaffCookies"), "Server staff session exchange is incomplete.");
check(authSession.includes('accessToken: "server-cookie-session"') && authSession.includes('grant_type=password'), "Staff login still returns real Supabase session tokens to normal browser state.");
check(!misApp.includes('auth/v1/token?grant_type=password'), "Normal staff password sign-in still happens directly in the browser.");
check(portalSession.includes("httpOnly: true") && portalSession.includes('sameSite: "strict"'), "Secure Customer Portal cookies are missing.");
check(portalSession.includes('grant_type=password') && !portalClient.includes('auth/v1/token?grant_type=password'), "Normal Customer Portal password sign-in still exposes Supabase session tokens to browser code.");
check(portalClient.includes("removeItem(SESSION_KEY)") && !portalClient.includes("setItem(SESSION_KEY"), "Customer Portal session is still persisted in localStorage.");
check(portalClient.includes("removeItem(PORTAL_CACHE_KEY)") && !portalClient.includes("setItem(PORTAL_CACHE_KEY"), "Customer Portal business-data cache is still persisted in production code.");
check(portalAction.includes("rejectCrossSiteMutation"), "Customer Portal cookie mutation CSRF protection is missing.");
check(sessionTracking.includes("validateStaffRequest") && sessionTracking.includes("existing.user_id !== auth.user.id"), "Login-session ownership enforcement is incomplete.");
check(sessionTracking.includes("rejectCrossSiteMutation") && sessionTracking.includes("rejectOversizedJson"), "Login-session mutation guards are incomplete.");
check(portalAdmin.includes("rejectCrossSiteMutation") && portalAdmin.includes("rejectOversizedJson"), "Customer Portal administration mutation guards are incomplete.");
check(emailSend.includes("rejectCrossSiteMutation") && emailSend.includes("rejectOversizedJson"), "Email mutation guards are incomplete.");
check(shopData.includes("validateStaffRequest") && shopData.includes("stateForRole"), "Protected role-filtered shop-data gateway is incomplete.");
check(misApp.includes('{ view: "Invoices", icon: Receipt, roles: OFFICE_ROLES'), "Office invoice navigation is not connected to the protected role model.");
check(misApp.includes('{ view: "Customer Portal", icon: Users, roles: OFFICE_ROLES'), "Customers navigation is not available to normal office staff.");
check(misApp.includes('canManagePortal={currentRole === "admin"}') && misApp.includes('canBulkManage={currentRole === "admin"}'), "Front Desk can reach owner-only Customer Portal or bulk customer controls.");
check(newEstimateJob.includes('onAddCustomer?:') && newEstimateJob.includes('Save & use customer') && newEstimateJob.includes('COMMON_FINISHED_SIZES'), "Fast customer creation or finished-size presets are missing from Job Setup.");
check(impositionStudio.includes('onDrop={(event) =>') && impositionStudio.includes('Finished size set automatically from artwork'), "Artwork drag/drop or automatic PDF-size application is missing.");
check(customerPortal.includes('canManagePortal ? <CustomerPortalAdminPanel') && customerPortal.includes('canBulkManage ?'), "Customer administration role separation is incomplete.");
check(shopData.includes('return { ...state, operationalActivities: [] }'), "Owner-wide operational activity is still sent to Office.");
const frontDeskWriteBlock = shopData.slice(shopData.indexOf("function frontDeskAllowedState"), shopData.indexOf("function stateForRole"));
check(!frontDeskWriteBlock.match(/const writable[\s\S]*catalogPrices/), "Office can rewrite owner-managed pricing references.");
check(shopData.includes('PRODUCTION_JOB_FIELDS') && shopData.includes('sanitizeJobForProduction'), "Production field filtering is incomplete.");
check(shopData.includes('copy.customerName = "Restricted customer"') && shopData.includes('copy.customerId = ""') && shopData.includes('delete copy.customerReference'), "Production job payloads still expose customer identity fields.");
check(shopData.includes("save_mis_records"), "Atomic protected workspace transaction is missing.");
check(shopData.includes("destructiveChangeDetected") && shopData.includes("confirmBulkChange"), "Bulk-deletion protection is missing.");
check(!shopData.includes("/rest/v1/app_data"), "Shop-data route still reads the legacy app_data record.");
check(!misApp.includes("/rest/v1/app_data"), "Browser code still reads or writes app_data directly.");
check(misApp.includes("return null;\n}\n\nfunction storeAuthSession"), "Persistent browser staff-session storage has not been disabled.");
check(portalServer.includes("/rest/v1/mis_records"), "Customer Portal is not reading the protected record store.");
check(portalServer.includes("customerUploadSignatureMatches"), "Customer Portal file-signature validation is missing.");
check(nextConfig.includes("Content-Security-Policy") && nextConfig.includes("frame-ancestors 'none'"), "Production security headers are incomplete.");
check(nextConfig.includes("poweredByHeader: false"), "X-Powered-By suppression is missing.");
check(migration.includes("revoke all on public.app_data from anon, authenticated"), "Legacy app_data browser access is not revoked.");
check(migration.includes("revoke all on public.mis_records from anon, authenticated"), "Protected records remain browser-readable.");
check(migration.includes("claim_mis_revision") && migration.includes("save_mis_records"), "Atomic revision or protected-save SQL function is missing.");
check(migration.includes("revoke all on function public.claim_mis_revision") && migration.includes("grant execute on function public.claim_mis_revision") && migration.includes("revoke all on function public.save_mis_records") && migration.includes("grant execute on function public.save_mis_records") && migration.includes("to service_role"), "Protected transaction function permissions are incomplete.");
check(migration.includes('drop policy if exists "Active staff can read MIS files"'), "Direct staff file policy is not removed.");
check(migration.includes('drop policy if exists "Portal users can read own uploaded files"'), "Direct Customer Portal storage access is not removed.");
check(migration.includes('drop policy if exists "Portal users can read own account"') && migration.includes('drop policy if exists "Portal users can read own requests"'), "Legacy Customer Portal table policies are not removed.");
check(migration.includes("revoke all on public.customer_portal_accounts from anon, authenticated") && migration.includes("revoke all on public.customer_portal_requests from anon, authenticated"), "Customer Portal tables remain directly browser-readable or writable.");
check(migration.includes("mis_record_versions") && migration.includes("security_audit_log"), "Version history or security audit tables are missing.");
check(publicQuoteRequest.includes("calculatePublicEstimate") && !publicQuoteRequest.includes("estimatedTotal?:"), "Public quote request still trusts browser-supplied pricing.");
check(publicQuoteRequest.indexOf("saveQuoteRequest") < publicQuoteRequest.indexOf("sendGmailMessage"), "Public quote email can be sent before durable database storage.");
check(publicQuoteRequest.includes("allowPublicQuoteSubmission") && publicQuoteRequest.includes("rejectCrossSiteMutation"), "Public quote anti-abuse protection is incomplete.");
check(!exists("src/app/api/public/quote-estimate/route.ts"), "Public pricing endpoint is still exposed to website visitors.");
check(!publicQuoteForm.includes("BUSINESS_CARD_COLOR") && !publicQuoteForm.includes("flyerRate") && !publicQuoteForm.includes("/api/public/quote-estimate") && !publicQuoteForm.includes("gp-price-total"), "Public quote UI still exposes pricing or price-table logic.");
check(!publicQuoteRequest.includes("Estimate:    ${formatMoney") && publicQuoteRequest.includes("Gross Printing will review the project and confirm exact pricing"), "Customer quote confirmation still exposes a website estimate.");
check(publicQuoteMigration.includes("public_quote_requests") && publicQuoteMigration.includes("check_public_quote_rate_limit"), "Public quote persistence/rate-limit migration is missing.");
check(publicQuoteMigration.includes("revoke all on public.public_quote_requests from anon, authenticated"), "Public quote records remain directly browser-accessible.");
check(customerPriceRoute.includes("requireCustomerPortalUser") && customerPriceRoute.includes("rejectCrossSiteMutation") && customerPriceRoute.includes("rejectOversizedJson"), "Private customer-pricing route is missing server authentication or mutation guards.");
check(customerPriceRoute.includes("item.id === portalUser.customerId") && !customerPriceRoute.includes("body.customerId"), "Private customer pricing can be calculated for a browser-selected customer id.");
check(customerPriceServer.includes("portalPricingEnabled") && customerPriceServer.includes("productPricingAdjustments") && customerPriceServer.includes("pricingAdjustmentPercent"), "Customer-specific B2B pricing controls are incomplete.");
check(customerMatch.includes("exact_email") && customerMatch.includes("contact_email") && customerMatch.includes("company_domain") && customerMatch.includes("company_name"), "Customer/contact recognition logic is incomplete.");
check(publicQuoteRequest.includes("matchCustomerCandidates") && publicQuoteRequest.includes("STAFF CONFIRMATION REQUIRED"), "Public quote intake does not protect uncertain customer matches from automatic linking.");
check(b2bMigration.includes("add column if not exists") && !b2bMigration.toLowerCase().includes("drop table") && !b2bMigration.toLowerCase().includes("truncate"), "v0.6.7.4 migration is not safely additive.");
check(b2bMigration.includes("revoke all on public.public_quote_requests from anon, authenticated"), "v0.6.7.4 public quote fields are not kept service-role only.");
check(exists("tsconfig.json"), "tsconfig.json is missing.");

// v0.7.0.30 Google Drive in-app preview gates.
check(nextConfig.includes("frame-src 'self' https://drive.google.com https://docs.google.com"), "Google Drive/Docs preview frame policy is missing or too broad.");
check(emailCenter.includes("googleDriveLinks") && emailCenter.includes("email-drive-link-card") && emailCenter.includes("Google Drive preview"), "Email Center Google Drive link cards or in-app preview are missing.");

// v0.7.0.8 mail-correctness / AI-rate-limit / email-artwork safety gates.
check(gmailServer.includes("UIDVALIDITY") && gmailServer.includes("canonicalId"), "UIDVALIDITY-aware mailbox identity is missing.");
check(!gmailServer.includes("UID SEARCH ALL"), "Normal mailbox refresh still contains UID SEARCH ALL.");
check(gmailServer.includes("loadMailboxAttachment") && gmailServer.includes("expectedUidValidity"), "Authoritative UIDVALIDITY-checked attachment loading is missing.");
check(emailReadState.includes("uidValidity") && emailReadState.includes("setMailboxReadState"), "Read/unread mutation does not require mailbox identity.");
check(emailAttachment.includes("loadMailboxAttachment") && emailAttachment.includes("X-Content-Type-Options") && emailAttachment.includes("uidValidity"), "Attachment download boundary is not server-authoritative or UIDVALIDITY-checked.");
check(emailInline.includes("attachment.inline") && emailInline.includes("uidValidity") && emailInline.includes("attachment.mimeType"), "Inline image endpoint does not verify an authoritative inline image part.");
check(emailArtwork.includes("validateStaffRequest") && emailArtwork.includes("checksumSha256") && emailArtwork.includes("mis-files") && emailArtwork.includes("signatureMatches"), "Durable email artwork preservation/security is incomplete.");
check(emailArtwork.includes('"x-upsert": "false"') && emailArtwork.includes("loadMailboxAttachment"), "Email artwork upload is not immutable/server-authoritative.");
check(emailMessageDetails.includes("loadMailboxMessageDetails") && emailMessageDetails.includes("uidValidity") && gmailServer.includes("fullyLoaded: true"), "Complete selected-message hydration is missing or not UIDVALIDITY-aware.");
check(misApp.includes("hydrateInboundThreadForJobTicket") && misApp.includes("reopenedFullMessageByThread") && emailCenter.includes("onHydrateMessage"), "Multi-attachment email hydration is incomplete for Job Tickets or opened messages.");
check(emailCenter.includes("onCombineThreads") && emailCenter.includes("onSeparateMessage"), "Manual conversation repair controls are missing.");
check(emailCenter.includes('role="separator"') && emailCenter.includes("aria-valuenow") && emailCenter.includes("recipientSuggestionIndex"), "Email Center keyboard accessibility gates are incomplete.");
check(aiPricingServer.includes('?? "gpt-5-mini"') && aiPricingServer.includes('?? "gpt-5.6"'), "AI model fallbacks are not using the supported Basic/Advanced defaults.");
check(aiPricingServer.includes("OpenAiRequestError") && aiPricingServer.includes("retryAfterMs") && aiPricingServer.includes("maxAttempts = 3"), "AI rate-limit retry handling is incomplete.");
check(aiPricingServer.includes("Never treat a phone number") && aiPricingServer.includes("quantityHasSourceEvidence"), "AI quantity/reference-number guardrails are incomplete.");
check(aiSplitServer.includes("maxAttempts = 3") && aiSplitServer.includes("gpt-5-mini") && aiSplitServer.includes("Never use phone numbers"), "Multi-item AI rate-limit/quantity guardrails are incomplete.");
// Opening a Job Ticket must measure the artwork and identify the sender without
// waiting on AI, then run the AI pass reusing that measurement. Rate-limit
// handling and the manual retry control must both survive.
check(emailCenter.includes("instantTicketReview") && emailCenter.includes("runTicketAnalysis") && emailCenter.includes("AiRateLimitClientError") && emailCenter.includes("Re-check AI"), "Automatic Job Ticket AI review / retry UI is incomplete.");
check(emailCenter.includes("reviewIntake") && emailCenter.includes("preflightQuestion(item, sizeUnit)"), "Email intake no longer reads the customer's stated finished size before the AI pass.");

// Printability findings are advice, not a gate. `severity` alone decides whether
// a ticket is blocked from converting; if a finding level ever feeds into it, a
// missing bleed or an RGB file would wedge jobs that used to go straight
// through. The route must keep the two apart.
const preflightRoute = read("src/app/api/email/preflight/route.ts");
const artworkPreflight = read("src/lib/artwork-preflight.ts");
check(
  preflightRoute.includes("buildArtworkFindings") &&
  artworkPreflight.includes("REQUIRED_BLEED_INCHES") &&
  !/severity\s*[:=][^;\n]*finding/i.test(preflightRoute),
  "Artwork findings are missing, or a finding level now feeds the blocking severity."
);
check(preflightRoute.includes("measureBleed") && preflightRoute.includes('PDFName.of("TrimBox")'), "Bleed is no longer measured from the PDF's declared trim box.");
check(misApp.includes("function inferEmailQuantity") && misApp.includes("[phone number]") && !misApp.includes('(?:qty|quantity|print|need|order)?\\s*(\\d{2,7})'), "Deterministic email quantity parser is still accepting bare numbers.");

// v0.7.0.9 business-routing / intake-identity / remembered-session gates.
check(serverAuth.includes("STAFF_REMEMBER_COOKIE") && serverAuth.includes("rememberUntil"), "Seven-day remembered staff-session cookie support is missing.");
check(authSession.includes("rememberDays") && authSession.includes("rememberUntil") && authSession.includes("rememberDays * 24 * 60 * 60 * 1000"), "Remember-this-computer is not connected to the server session exchange.");
check(shopData.includes('"emailBusinessRules"'), "Business sender/domain rules are not persisted in the protected record store.");
check(emailBusinessClassifier.includes("classifyBusinessEmail") && emailBusinessClassifier.includes("shouldAutoCreateIntake") && emailBusinessClassifier.includes("delivery_failure") && emailBusinessClassifier.includes("vendor_bill"), "Business email routing classifier is incomplete.");
check(!misApp.includes("shouldAutoCreateIntake(businessClassification)") && misApp.includes('origin: "staff"') && misApp.includes("Job Tickets are deliberately manual"), "Mailbox sync can still create active Job Tickets without an explicit staff action.");
check(emailCenter.includes("email-business-tabs") && emailCenter.includes("Route this email as") && emailCenter.includes("email-ticket-row-identity"), "Email routing queues or customer/sender-first intake rows are missing.");


// v0.7.0.10 automatic job-setup / attachment inspection gates.
check(aiSplitServer.includes("loadMailboxAttachment") && aiSplitServer.includes("PDFDocument") && aiSplitServer.includes("sharp"), "Automatic job setup is not inspecting authoritative mailbox attachments on the server.");
check(aiSplitServer.includes('type: "input_file"') && aiSplitServer.includes('type: "input_image"') && aiSplitServer.includes("attachmentInsights"), "Automatic job setup is not using supported PDF/image inspection inputs.");
check(aiSplitServer.includes("NEVER assume one attachment equals one job") && aiSplitServer.includes("multipart_job") && aiSplitServer.includes("generalAttachmentIds"), "Automatic job grouping guardrails are incomplete.");
check(aiSplitServer.includes("stockRecommendationReason") && aiSplitServer.includes("validStockIds") && aiSplitServer.includes("Do not silently invent exact stock"), "Automatic stock recommendation/confirmation guardrails are incomplete.");
check(emailCenter.includes("Prepare job setup") && emailCenter.includes("paperStocks={paperStocks}"), "Email Center does not expose the general automatic job-setup review.");
check(multiItemOrderReview.includes("Preparing job setup") && multiItemOrderReview.includes("Mark resolved") && multiItemOrderReview.includes("Choose / confirm stock"), "Automatic job-setup staff review controls are incomplete.");
check(misApp.includes("!item.stockId") && misApp.includes("!item.stockConfirmed") && misApp.includes("item.missingInformation.length > 0") && misApp.includes('analysis.recommendedMode === "single_job"'), "Production conversion can bypass confirmed stock/issues or flatten multipart setup incorrectly.");

// v0.7.0.11 Gross Printing Learning Engine gates.
check(learningEngine.includes("sanitizeLearningText") && learningEngine.includes("historicalJobLearningExample") && learningEngine.includes("buildLearningRecommendation"), "Learning Engine core memory/similarity functions are missing.");
check(learningEngine.includes("safeToReuse") && learningEngine.includes("repeatCount >= 3") && learningEngine.includes("Boolean(explicit.quantity)"), "Memory-first reuse does not require repeated approved evidence plus current-request quantity evidence.");
check(learningEngine.includes("[phone]") && learningEngine.includes("[email]") && learningEngine.includes("[reference]"), "Learning memory does not sanitize contact/reference data before saving/matching.");
check(aiSplitServer.includes("Gross Printing Learning Engine") && aiSplitServer.includes("deterministicAttachmentInsights") && aiSplitServer.includes("shop_memory_plus_ai"), "Automatic job setup is not using memory-first/fallback AI routing.");
check(multiItemOrderReview.includes("Gross Printing memory") && multiItemOrderReview.includes("learningRecommendation"), "Automatic job review does not show/use approved shop memory.");
check(misApp.includes("approvedJobLearningExample") && misApp.includes("learnApprovedJob") && misApp.includes("approved_multi_item"), "Staff-approved jobs are not being promoted into learning memory.");

// v0.7.0.12 email command-center / communication-learning gates.
check(emailBusinessClassifier.includes("isPublicEmailDomain") && emailBusinessClassifier.includes("safeBusinessRules") && emailBusinessClassifier.includes("gmail.com"), "Public mailbox domains can still be mislearned as one customer/vendor.");
check(emailBusinessClassifier.includes('category: "newsletter"') && emailBusinessClassifier.includes('category: "junk"') && emailBusinessClassifier.includes('category: "customer_existing_job"'), "Newsletter/junk/existing-job follow-up routing is incomplete.");
check(misApp.includes("safeBusinessRules") && misApp.includes("!isPublicEmailDomain(domain)"), "Saved public-domain routing rules are not cleaned or future-safe.");
check(misApp.includes("learnedFixedCategory") && misApp.includes("defaultCategory: learnedFixedCategory ? category : undefined"), "Newsletter/junk staff routing is not learned safely by exact sender.");
check(misApp.includes("rule.defaultCategory === \"newsletter\"") && misApp.includes("rule.defaultCategory === \"junk\""), "Correcting a Newsletter/Junk sender does not clear the old fixed routing rule.");
check(misApp.includes("starred: existingMessage.starred") && misApp.includes("tags: existingMessage.tags"), "Star/tag metadata can be lost during mailbox refresh.");
check(misApp.includes('navigator.locks?.request') && misApp.includes('gross-printing-auth-refresh') && authSession.includes("retryable: true"), "Remember-this-computer multi-tab refresh protection is incomplete.");
check(authSession.includes("rememberDays") && authSession.includes("requestedDays === 30") && misApp.includes("setRememberDays") && misApp.includes("event.target.checked ? 30 : 0"), "Remembered staff-session control is incomplete.");
check(misApp.includes("const refreshed = await readServerAuthSession()") && misApp.includes("The short-lived Supabase access token can expire"), "Heartbeat can still clear a valid remembered session before refresh.");
check(portalSession.includes("CUSTOMER_PORTAL_REMEMBER_COOKIE") && portalSession.includes("rememberDays"), "Customer Portal does not preserve the shared-login remember duration.");
check(misApp.includes("/api/customer-portal/session") && misApp.includes('window.location.assign("/portal")'), "Shared login does not route valid customer accounts to the Customer Portal.");
check(communicationLearning.includes("buildCommunicationRecommendation") && communicationLearning.includes("trusted_business_fact") && communicationLearning.includes("previously sent"), "Communication Learning Engine memory/recommendation logic is missing.");
check(communicationLearning.includes("[secret]") && learningEngine.includes("[secret]") && communicationRoute.includes("[secret]"), "Learning/communication text is not redacting password/token-style secrets.");
check(communicationRoute.includes("requireAiUser") && communicationRoute.includes("rejectCrossSiteMutation") && communicationRoute.includes("store: false") && communicationRoute.includes("Never send anything"), "Communication AI drafting route is not sufficiently protected or draft-only.");
check(emailCenter.includes("Suggest reply") && emailCenter.includes("Approve & send reply") && emailCenter.includes("Communication Learning Engine"), "Communication Learning Engine is not exposed as staff-approved reply drafting.");
check(emailCenter.includes("email-quick-filter-bar") && emailCenter.includes("Starred") && emailCenter.includes("composeDrafts") && emailCenter.includes("email-open-tabs"), "Email command-center quick filters/star/drafts/open tabs are incomplete.");
check(emailCenter.includes("Newsletter / promotional") && emailCenter.includes("Junk / spam") && emailCenter.includes("Existing job follow-ups"), "Email command-center business queues are incomplete.");


// v0.7.0.23 action-routing / assigned-work security and workflow gates.
check(staffDirectory.includes("validateStaffRequest") && staffDirectory.includes("serviceFetch") && staffDirectory.includes("is_active=eq.true"), "Authenticated active-staff assignment directory is missing or unprotected.");
check(emailCenter.includes("Route Job Ticket") && emailCenter.includes("Assign it to someone") && emailCenter.includes("Send to next step"), "Centered Job Ticket route/assignment workflow is incomplete.");
check(emailCenter.includes('["design", "Graphics / Prepress"') && emailCenter.includes('["production", "Printing / Production"') && emailCenter.includes('["billing", "Billing / Accounting"'), "Job Ticket destination routing options are incomplete.");
check(emailCenter.includes("!ticket.routedAt") && emailCenter.includes("Action needed") && !emailCenter.includes('setSection("archive")'), "Routed Job Tickets or Email Center archive can remain in the active action UI.");
check(workflow.includes("My assigned work") && workflow.includes("ticket.assignedToUserId === currentUserId") && workflow.includes('currentRole === "admin"'), "Assigned Work is not limited to each staff member with Admin-wide visibility.");
check(shopData.includes("assignedUserId === context.user.id") && shopData.includes("assignedRole === role") && shopData.includes("mergeProductionTicket"), "Server-side production assignment filtering/completion enforcement is incomplete.");
check(settings.includes("Email & Job Tickets") && settings.includes("archivedEmailThreads") && settings.includes("archivedEmailTickets"), "Email and Job Ticket archive was not moved into Settings with restore support.");

// v0.7.0.25 active-queue and unread-count correctness gates.
check(misApp.includes("const unreadEmailCount = emailThreads") && misApp.includes('item.view === "Email Center" && unreadEmailCount'), "Email Center navigation badge is not based on real unread inbound email messages.");
check(emailCenter.includes('message.direction === "inbound" && message.unread'), "Email Center unread state is not tied to inbound mailbox messages.");
check(portalRequests.includes("handedOffPublicQuoteIds") && portalRequests.includes("activePublicQuoteRequests") && portalRequests.includes("sourcePublicQuoteId"), "Handled public website quotes can remain in the active Portal Requests quote inbox.");
check(publicQuoteRequest.includes('status: "quoted"') && publicQuoteRequest.includes("sourcePublicQuoteId: body.id"), "Public website quote handoff does not persist a handled source state.");
check(workflow.includes("workflow-assigned-empty") && workflow.includes("Currently with:"), "Assigned Work is not permanently discoverable or does not show the current assignee.");
check(workflow.includes("Recently completed assignments") && workflow.includes("Completed by") && workflow.includes("View ticket"), "Completed assignment history is not visible or cannot reopen the source Job Ticket.");
check(misApp.includes('view: "Assigned Work"') && misApp.includes('activeAssignedWorkCount') && misApp.includes('"Assigned Work": "/assigned-work"'), "Dedicated Assigned Work navigation/badge is missing.");
check(misApp.includes('displayView === "Assigned Work"') && workflow.includes('mode === "assigned"') && !misApp.includes('/workflow?section=assigned'), "Assigned Work is not separated from the production Workflow page.");


// v0.7.0.31 booklet-imposition and AI artwork-preview gates.
check(impositionStudio.includes('Booklet / saddle stitch') && impositionStudio.includes('booklet-side-navigator') && impositionStudio.includes('bookletSourcePageIndex'), "Booklet imposition setup/preview navigation is missing.");
check(impositionPdf.includes('createBookletImposedPdf') && impositionPdf.includes('paddedPageCount') && impositionPdf.includes('signatureCount'), "Booklet imposed-PDF page sequencing is missing.");
check(newEstimateJob.includes('mode: "booklet"') && newEstimateJob.includes('Booklet / saddle stitch'), "Multi-page artwork does not expose the booklet setup action.");
check(aiPricingServer.includes('dataUrlMime') && aiPricingServer.includes('Trust the actual data URL payload first'), "AI artwork analysis can still mis-send rendered JPEG previews as PDF input files.");

// v0.7.0.32 customer/job-flow and booklet-direction gates.
check(impositionStudio.includes('English — left to right') && impositionStudio.includes('Hebrew / Yiddish — right to left') && impositionStudio.includes('bookletReadingDirection'), "Booklet reading-direction selector is missing.");
check(impositionPdf.includes('bookletReadingDirection') && impositionPdf.includes('direction === "rtl"'), "RTL booklet order is not applied to imposed-PDF export.");
check(customerPortal.includes('Overview') && customerPortal.includes('Jobs & quotes') && customerPortal.includes('PDFs & files') && customerPortal.includes('Account & contacts'), "Customer four-section command center is incomplete.");
check(customerPortal.includes('New job') && customerPortal.includes('New quote') && customerPortal.includes('onOpenFile?.(file.id)'), "Customer job/quote/file shortcuts are missing.");
check(emailCenter.includes('Job command center') && emailCenter.includes('Review artwork') && emailCenter.includes('Make quote') && emailCenter.includes('Route / assign'), "Email-to-press Job command center is incomplete.");
check(emailCenter.includes('Size mismatch') && emailCenter.includes('Ask customer') && newEstimateJob.includes('Artwork size mismatch') && newEstimateJob.includes('Use PDF size'), "Artwork size mismatch review path is incomplete.");
check(misApp.includes('estimateCustomerId') && misApp.includes('initialCustomerId={estimateCustomerId}') && misApp.includes('uploadFiles([artworkFile], "Active Artwork"'), "Customer-preselected Job Setup or manual-artwork customer history is missing.");

// v0.7.0.33 worker-first Quick Job Setup gates.
check(newEstimateJob.includes('currentRole?: "admin"') && newEstimateJob.includes('Admin details') && newEstimateJob.includes('Quick Job Setup'), "Worker-first Job Setup role/detail separation is missing.");
check(newEstimateJob.includes('QUICK_UP_TARGETS') && newEstimateJob.includes('Step & repeat') && newEstimateJob.includes('quick-sheet-preview'), "Quick press-sheet Step & Repeat controls are missing.");
check(emailCenter.includes('Set up job') && misApp.includes('quickStartJobFromEmail') && misApp.includes('Opened directly from Email Center in Quick Job Setup'), "Direct Email attachment to Quick Job Setup flow is missing.");
check(customerPortal.includes('Last activity') && customerPortal.includes('recentActivity') && customerPortal.includes('slice(0, 5)'), "Customer overview was not reduced to a compact recent-activity snapshot.");


// v0.7.0.34 copier-ready production filename gates.
check(impositionStudio.includes('downloadFileBaseName') && impositionStudio.includes('safeProductionFileBaseName'), "Imposed PDF download no longer accepts a copier-ready production filename.");
check(newEstimateJob.includes('plannedJobNumber') && newEstimateJob.includes('reservedJobNumber') && newEstimateJob.includes('downloadFileBaseName={`${editingJob?.jobNumber || plannedJobNumber'), "Job Setup no longer carries the planned/saved GP number into imposed PDF naming.");
check(misApp.includes('const reservedJobNumber = data.reservedJobNumber?.trim()') && misApp.includes('? reservedJobNumber'), "Created production jobs no longer honor the planned GP number used by the press PDF.");

// v0.7.0.35 Files Option 1 + email-preview cleanup gates.
check(filesWorkspace.includes('files-card-toolbar') && filesWorkspace.includes('typeFilter') && filesWorkspace.includes('sortMode'), "Files Option 1 search/filter/sort controls are missing.");
check(filesWorkspace.includes('file-preview-clean') && filesWorkspace.includes('file-card-clean'), "Files Option 1 clean-card preview layout is missing.");
check(emailCenter.includes('data-remote-image') && emailCenter.includes('getEmailAttachmentBlob'), "Blocked-image cleanup or cached email attachment preview is missing.");
check(emailAttachmentThumbnail.includes('attachmentBlobCache') && emailAttachmentThumbnail.includes('getEmailAttachmentBlob'), "Shared email attachment blob cache is missing.");

// v0.7.0.36 Email artwork hydration + AI/manual setup + Option 1 sitewide UI gates.
// v0.7.0.37 Consolidated artwork workbench + modal advanced press tools + clean deploy package gates.
check(newEstimateJob.includes('getEmailSourceAttachmentBlob(authToken, source)') && emailAttachmentThumbnail.includes('uidValidity: source.uidValidity') && newEstimateJob.includes('emailAttachmentLooksLikeArtwork'), "Email artwork hydration can lose the verified mailbox UIDVALIDITY/source file identity.");
check(newEstimateJob.includes('AI Setup') && newEstimateJob.includes('Manual Setup') && newEstimateJob.includes('Customer file') && newEstimateJob.includes('PDF / page size'), "AI/manual Job Setup or customer file-size facts are missing.");
check(newEstimateJob.includes('positiveQuantity') && newEstimateJob.includes('presetForSize('), "Job Setup no longer guards zero quantity or size-based product inference.");
check(misApp.includes('freshById') && misApp.includes('Stored Job Tickets can outlive the mailbox refresh'), "Saved Job Tickets do not merge refreshed mailbox attachment locators.");
// The release-named stylesheets (v063 through v0736) were merged into
// workspace-refinements.css in their original cascade order. The rules this
// guard protects are unchanged; only the file that carries them moved.
const workspaceRefinements = read("src/app/workspace-refinements.css");
const rootLayout = read("src/app/layout.tsx");
check(rootLayout.includes('workspace-refinements.css') && workspaceRefinements.includes('.job-setup-mode-tabs') && workspaceRefinements.includes('.app-shell .panel'), "Option 1 internal MIS visual layer is missing.");
check(rootLayout.includes('design-system.css') && read("src/app/design-system.css").includes('--gp-gold'), "The design system token layer is missing or is no longer loaded last.");
check(newEstimateJob.includes('artwork-workbench') && newEstimateJob.includes('production-setup-modal') && newEstimateJob.includes('More press controls'), "v0.7.0.37 consolidated artwork workbench or modal press-tools launcher is missing.");
check(impositionStudio.includes('variant?: "full" | "upload" | "production"') && impositionStudio.includes('No re-upload needed. This is the same file loaded in Job Setup.'), "Advanced press tools can regress to a duplicate artwork uploader.");

// v0.7.0.38 direct email-artwork + clarification loop gates.
check(newEstimateJob.includes('hasLinkedEmailArtwork') && newEstimateJob.includes('Loading artwork from the email'), "Email-origin Job Setup can regress to a second upload task.");
check(misApp.includes('gross-printing-estimate-draft-v2') && misApp.includes('Opened directly from the customer email in Quick Job Setup'), "Email Quick Start does not clear stale Job Setup drafts before handoff.");
check(emailAttachmentThumbnail.includes('getEmailSourceAttachmentBlob') && emailAttachmentThumbnail.includes('attachmentBlobCache'), "Email artwork does not reuse the already-fetched attachment blob across Email Center and Job Setup.");
check(aiEstimateAssistant.includes('Re-analyze with my answers') && aiEstimateAssistant.includes('Staff clarification'), "AI clarification questions cannot be answered and re-analyzed in place.");
check(newEstimateJob.includes('autoRunKey=') && newEstimateJob.includes('queueMicrotask(() => applyAiSpecification'), "AI Setup no longer auto-runs/applies clear email-artwork jobs.");


// v0.7.0.40 fast high-resolution email-artwork handoff gates.
check(emailCenter.includes('openAttachmentInQuickJob') && emailCenter.includes('handoffArtworkFile') && emailCenter.includes('Preparing file'), "Email Center no longer prepares the original attachment before Quick Job Setup handoff.");
check(misApp.includes('estimateHandoffArtworkFile') && misApp.includes('initialArtworkFile={estimateHandoffArtworkFile}'), "The exact email artwork File is not carried into Job Setup state.");
check(newEstimateJob.includes('initialArtworkFile') && newEstimateJob.includes('firstPageOnly: true') && newEstimateJob.includes('untouched high-resolution source'), "Job Setup no longer uses the direct high-resolution handoff with a lightweight first-page preview.");
check(impositionStudio.includes('options: { firstPageOnly?: boolean }') && impositionStudio.includes('previewPageCount'), "Progressive PDF preview rendering is missing.");

// v0.7.0.41 persistent attachment cache + cancellable preview + numbering/customer gates.
check(emailAttachment.includes('CACHE_PREFIX = "email-cache/v1"') && emailAttachment.includes('X-GP-Attachment-Source') && emailAttachment.includes('after(async () =>'), "Private persistent email attachment cache is missing.");
check(gmailServer.includes('BODYSTRUCTURE') && gmailServer.includes('BODY.PEEK[') && gmailServer.includes('Mailbox request timed out.'), "Fast MIME-part attachment retrieval or mailbox timeout protection is missing.");
check(emailAttachmentThumbnail.includes('20_000') && emailAttachmentThumbnail.includes('externalSignal') && emailCenter.includes('attachmentPreviewAbortRef') && emailCenter.includes('Retry attachment'), "Attachment preview cannot be cancelled/retried quickly in place.");
check(emailArtwork.includes('readCachedEmailAttachment') && emailArtwork.includes('writeCachedEmailAttachment'), "Email-to-job artwork preservation does not reuse/seed the private original-file cache.");
check(settings.includes('Next Job Number') && settings.includes('Save next job number') && settings.includes('Use automatic numbering'), "Editable next job numbering controls are missing.");
check(misApp.includes('numberingSettings.nextJobNumber') && misApp.includes('nextNumberAfter') && misApp.includes('is already used. Choose another next job number.'), "Manual GP numbering is not enforced/advanced safely.");
check(customerMatch.includes('normalizeCustomerEmail') && misApp.includes('ticketNameLooksUsable') && misApp.includes('displayNameFromEmailHeader'), "Sender email/name normalization can regress to duplicate or funny customer names.");

// v0.7.0.13 safe live-data testing / outbound-email kill-switch gates.
check(shopData.includes('"emailSafetySettings"'), "Email safety mode is not persisted in the protected MIS record store.");
check(shopData.includes('context.profile.is_owner !== true') && shopData.includes('result.emailSafetySettings = current.emailSafetySettings'), "Non-Owner admins can alter the production email safety kill switch server-side.");
check(emailSafetyRoute.includes('context.profile.is_owner !== true') && emailSafetyRoute.includes('save_mis_records') && emailSafetyRoute.includes('confirmLive') && emailSafetyRoute.includes('serverRevision'), "Immediate Owner-only email safety persistence is missing or can race queued protected saves.");
check(misApp.includes('fetch("/api/email/safety"') && misApp.includes('pendingCloudState.current = null') && misApp.includes('Math.max(serverRevisionRef.current, payload.serverRevision)'), "Client email safety changes are not synchronously confirmed before the UI treats the new mode as active.");
check(emailSafetyServer.includes('mode: "shadow"') && emailSafetyServer.includes('Fail closed') && emailSafetyServer.includes('evaluateEmailSafety'), "Email safety server does not default/fail closed to Shadow Mode.");
check(emailSafetyServer.includes('isInternalGrossPrintingRecipient') && emailSafetyServer.includes('testRecipients'), "Internal/test-recipient safety evaluation is incomplete.");
check(gmailServer.includes('loadEmailSafetySettings') && gmailServer.includes('safetyDecision.action === "block"') && gmailServer.includes('safetyDecision.action === "redirect"'), "SMTP send path can bypass Shadow/Test email safety.");
check(emailSend.includes('delivery') && emailSend.includes('safetyMode') && emailSend.includes('originalTo'), "Manual Email Center send route does not report email-safety results.");
check(shopData.includes('deliveryStatus === "Blocked"') && shopData.includes('if (sent)') && shopData.includes('customer_status_notification_blocked_test_mode'), "Automatic job-status customer mail can falsely mark blocked testing messages as delivered.");
check(publicQuoteRequest.includes('customerDelivery.blocked') && publicQuoteRequest.includes('customerDelivery.redirected'), "Public quote confirmation email is not protected by testing mode.");
check(portalServer.includes('evaluateEmailSafety(await loadEmailSafetySettings()') && portalServer.includes('blocked the Customer Portal invitation') && portalServer.includes('blocked the Customer Portal access email'), "Customer Portal admin invitation/access emails can bypass Shadow/Test mode.");
check(portalSignup.includes('evaluateEmailSafety(await loadEmailSafetySettings()') && portalSignup.includes('block the signup before Auth can contact a real customer'), "Customer Portal public signup can cause an Auth email outside Shadow/Test protection.");
check(passwordReset.includes('redirectPath === "/portal/reset-password"') && passwordReset.includes('blockedByEmailSafety'), "Customer Portal password-reset email can bypass Shadow/Test protection.");
check(misApp.includes('SHADOW MODE — real customer email is blocked') && misApp.includes('Only the Owner can change customer email safety settings.'), "Persistent safety banner or Owner-only customer-email safety controls are missing.");
check(emailCenter.includes('Testing outbox') && emailCenter.includes('log.status === "Blocked"') && emailCenter.includes('log.status === "Redirected"'), "Testing outbox does not show blocked/redirected mail attempts.");
check(communicationLearning.includes('log.status === "Sent" || log.status === "Test Sent"'), "Communication Learning can learn from blocked/unapproved simulated mail.");

const clientFiles = [
  "src/components/MISApp.tsx",
  "src/components/AdminCenter.tsx",
  "src/components/CustomerSelfServicePortal.tsx",
  "src/components/NewEstimateJob.tsx"
];
for (const file of clientFiles) {
  const contents = read(file);
  check(!contents.includes("SUPABASE_SECRET_KEY") && !contents.includes("SUPABASE_SERVICE_ROLE_KEY"), `${file} references a server secret.`);
}

if (failures.length) {
  console.error("Gross Printing MIS security checks failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Gross Printing MIS v0.7.0.41 security checks passed.");
console.log("- Browser access to the legacy all-in-one record is removed.");
console.log("- Staff data reads and writes go through server role checks.");
console.log("- Staff sessions use HttpOnly server cookies instead of localStorage.");
console.log("- Protected saves use an atomic server/database transaction with record history and recovery.");
console.log("- Direct staff access to private MIS files is removed.");
console.log("- Email attachment access is UIDVALIDITY-aware and server-authoritative.");
console.log("- Email-to-job artwork is copied into private storage with checksum provenance.");
console.log("- Job Ticket AI review starts automatically on first open, surfaces rate-limit errors, and keeps a manual re-check path.");
console.log("- Staff can use a simplified secure remember-me control without saving the password; existing 7-day sessions remain valid and new remembered sessions use 30 days.");
console.log("- Incoming mail never creates an active Job Ticket automatically; Job Tickets require an explicit staff action.");
console.log("- Automatic job setup inspects supported source artwork, groups files, and requires staff-confirmed stock/issues before conversion.");
console.log("- Gross Printing Learning Engine reuses only staff-approved memory; strong simple repeats can bypass OpenAI setup while conflicts still require AI/staff review.");
console.log("- Public Gmail/Yahoo/Outlook-style domains cannot be learned as one customer/vendor identity.");
console.log("- Remembered staff sessions serialize refresh across browser tabs and preserve the chosen 7/30-day cookie across access-token refreshes.");
console.log("- Communication Learning uses only sent replies/trusted MIS facts; AI drafts remain staff-approved and secrets are redacted.");
console.log("- Email Center keeps mailbox controls secondary, uses a modal composer, preserves Inbox visibility, and carries all real conversation attachments into manual Job Tickets.");
console.log("- Job Setup keeps customer creation operational, applies detected artwork size, and keeps owner-only customer administration restricted.");

console.log("- Shadow/Test/Live email safety is enforced server-side at the SMTP path; blocked mail is recorded without marking customers notified.");
