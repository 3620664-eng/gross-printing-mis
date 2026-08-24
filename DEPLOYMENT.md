# Gross Printing MIS v0.7.0.41 Deployment

1. Extract the ZIP.
2. Run `CHECK_BEFORE_UPLOAD.bat`.
3. Deploy the clean project to Vercel.
4. Test Email Center with a real inbound PDF/image. Click the attachment and confirm it opens in the in-page preview instead of navigating away.
5. While a slow attachment is opening, click the preview X. The window should close immediately; reopening/Retry should be available without leaving Email Center.
6. Open the same attachment again and then send it to Job Setup. The exact original high-resolution file should be reused; production output must remain full resolution.
7. Go to Settings → Numbering, set a test **Next Job Number**, create a test job, and confirm the next number advances. Restore the desired production number afterward if needed.
8. Test an email sender formatted as `Customer Name <customer@example.com>` and confirm existing-customer matching uses the email address while customer/contact creation uses a sensible name.

No new SQL or database migration is required. No new environment variable is required.
