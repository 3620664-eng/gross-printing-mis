# v0.7.0.41 Deployment Build Fix

- Fixed the Vercel/Next.js TypeScript build failure in the private email attachment cache routes.
- Node `Buffer`/`Uint8Array` payloads are now copied to a standards-compatible `ArrayBuffer` before being passed to `fetch`/`NextResponse`.
- Fixed all three affected BodyInit call sites: email cache upload, artwork cache upload, and attachment response.
- Runtime behavior, original high-resolution artwork bytes, private cache behavior, numbering, customer matching, and database behavior are unchanged.

# Gross Printing MIS v0.7.0.41

## Email attachments open faster and stay in Email Center
- Email Center now asks the mail server for only the requested MIME attachment part whenever the mailbox exposes a usable BODYSTRUCTURE, instead of downloading the entire email again for every PDF/image open.
- Mailbox requests have bounded server timeouts so a stuck IMAP read cannot hold the interface indefinitely.
- PDF/image preview remains inside the Email Center overlay. It no longer needs to navigate staff away from the page.
- The preview X cancels the active browser-side attachment request immediately. Slow/failed previews can be retried in place.
- Background thumbnails share attachment requests so the same file is not fetched repeatedly at the same time.

## Private original-file cache
- The exact original attachment bytes are cached privately in the existing `mis-files` Supabase Storage bucket after the first successful mailbox read.
- The cache is keyed from mailbox folder + UIDVALIDITY + message UID + MIME part, so stale mailbox identities cannot silently reuse the wrong file.
- Email Center preview, download, Job Setup handoff, AI/artwork inspection, and permanent job-artwork preservation can reuse the same original bytes.
- The original production artwork is never resized or recompressed. Only thumbnail/on-screen preview rendering is reduced for speed.
- Existing 100 MB file limits remain in place. No public storage bucket was added.

## Editable next GP job number
- Settings → Numbering now includes **Next Job Number**.
- Staff can set a manual next number such as `GP-2000` when starting a new yearly sequence.
- The system blocks a manually selected number that already exists.
- After a production job is created, the saved manual sequence advances automatically to the next GP number.
- **Use automatic numbering** returns the MIS to the previous highest-existing-number behavior.
- The setting is stored with the normal protected MIS state; no new database table or migration is required.

## Cleaner customer matching from email
- Sender headers such as `Customer Name <customer@example.com>` are normalized to the real email address before exact customer/contact matching.
- Creating a customer or adding a sender as a contact uses the sender display name when available instead of storing the full header or a strange mailbox/domain-derived label.
- Existing matching remains conservative: an exact email/contact match links the ticket instead of creating a duplicate customer.

## Preserved behavior
- v0.7.0.40 artwork-first AI analysis and high-resolution email-to-job handoff remain intact.
- Existing Supabase production data, private file security, staff roles, email safety controls, pricing, imposition, jobs, quotes, invoices, and workflow behavior are preserved.
- No new SQL migration and no new environment variable.
