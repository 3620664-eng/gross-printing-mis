import type { EmailAttachment, EmailMessage, EmailThread } from "./types";

/**
 * Some mail clients mark real customer image files as Content-Disposition: inline.
 * Do not hide those just because they are inline. We only suppress the anonymous
 * MIME parts that our parser had to name inline-image-N.ext; those are normally
 * signature/logo assets referenced from the HTML body.
 */
export function isGeneratedInlineEmailAsset(attachment: EmailAttachment) {
  return Boolean(
    attachment.inline &&
    attachment.contentId &&
    /^inline-image-\d+(?:\.[a-z0-9]+)?$/i.test(attachment.filename.trim())
  );
}

export function userVisibleEmailAttachments(message: Pick<EmailMessage, "attachments">) {
  return message.attachments.filter((attachment) => !isGeneratedInlineEmailAsset(attachment));
}

/**
 * A Job Ticket represents the whole customer conversation, not just whichever
 * message happens to be selected when staff clicks Job Ticket. Keep every real
 * attachment from the thread so a multi-file order cannot silently lose artwork.
 * IDs are authoritative, so same-named revised files remain separate.
 */
export function userVisibleThreadAttachments(thread: Pick<EmailThread, "messages">) {
  const seen = new Set<string>();
  return thread.messages.flatMap((message) =>
    userVisibleEmailAttachments(message).flatMap((attachment) => {
      if (seen.has(attachment.id)) return [];
      seen.add(attachment.id);
      return [{ message, attachment }];
    })
  );
}
