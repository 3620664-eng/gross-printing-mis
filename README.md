# Gross Printing MIS v0.7.0.41

Clean deploy package based directly on v0.7.0.40.

Main changes:
- Email attachments now use a faster MIME-part fetch instead of re-downloading the entire mailbox message whenever possible.
- The exact original high-resolution attachment is cached privately in the existing `mis-files` bucket and reused by Email Center, Job Setup, artwork preservation, AI review, and downloads.
- PDF/image previews stay inside Email Center. The preview X can cancel the current browser request immediately, and failed/slow previews can be retried without leaving the page.
- Settings → Numbering now lets an authorized staff user set the next GP job number manually and later return to automatic numbering. A saved manual sequence advances after each new production job.
- Customer matching now normalizes sender headers such as `Name <email@example.com>` before matching and uses a cleaner sender name when staff creates/adds a customer from email.

The production artwork is never downsampled. Only thumbnail/on-screen preview rendering is optimized.

No new SQL or environment variable is required.
