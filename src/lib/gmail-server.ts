import "server-only";

import { createHash, randomBytes } from "node:crypto";
import tls, { type TLSSocket } from "node:tls";
import { NextRequest, NextResponse } from "next/server";
import { validateStaffRequest } from "./server-auth";
import { evaluateEmailSafety, loadEmailSafetySettings } from "./email-safety-server";
import type { EmailAttachment, EmailMessage, EmailThread } from "./types";

const MAILBOX = process.env.GROSS_PRINTING_MAILBOX ?? process.env.GROSS_PRINTING_OWNER_EMAIL ?? "jobs@grossprinting.com";
const MAILBOX_PASSWORD = process.env.GROSS_PRINTING_MAILBOX_PASSWORD;
const IMAP_HOST = process.env.GROSS_PRINTING_IMAP_HOST ?? "secure.emailsrvr.com";
const IMAP_PORT = Number(process.env.GROSS_PRINTING_IMAP_PORT ?? "993");
const SMTP_HOST = process.env.GROSS_PRINTING_SMTP_HOST ?? "secure.emailsrvr.com";
const SMTP_PORT = Number(process.env.GROSS_PRINTING_SMTP_PORT ?? "465");
const CONNECTION_TIMEOUT_MS = 20_000;
const INBOX_SYNC_MAX_MESSAGES = 15;
const INBOX_PREVIEW_BYTES = 192 * 1024;
const SENT_PREVIEW_BYTES = 72 * 1024;
const MAIL_PARSER_VERSION = 3;

export type AppRole = "admin" | "front_desk" | "prepress" | "press" | "finishing";
export type MailboxFolderKind = "inbox" | "sent";

export type VerifiedAppUser = {
  id: string;
  email: string;
  role: AppRole;
};

type HeaderMap = Map<string, string>;
type ParsedAttachment = EmailAttachment & { bytes: Buffer };
type ParsedRawMessage = {
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: ParsedAttachment[];
  date?: string;
};
type FetchedMessage = {
  uid: string;
  flags: string[];
  internalDate?: string;
  raw: Buffer;
  mailboxName?: string;
  uidValidity?: string;
  fullyLoaded?: boolean;
};

type MailboxSelection = {
  mailboxName: string;
  uidValidity: string;
  uidNext?: string;
  highestModSeq?: string;
  exists?: number;
};

export function emailServerConfigured() {
  return Boolean(
    MAILBOX.trim() &&
      MAILBOX_PASSWORD &&
      IMAP_HOST.trim() &&
      Number.isFinite(IMAP_PORT) &&
      IMAP_PORT > 0 &&
      SMTP_HOST.trim() &&
      Number.isFinite(SMTP_PORT) &&
      SMTP_PORT > 0
  );
}

export function emailMailbox() {
  return MAILBOX;
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireActiveAppUser(request: NextRequest, roles?: AppRole[]): Promise<VerifiedAppUser | NextResponse> {
  const context = await validateStaffRequest(request, roles);
  if (context instanceof NextResponse) return context;
  return {
    id: context.user.id,
    email: context.profile.email ?? context.user.email ?? "",
    role: context.profile.role
  };
}

function requireMailboxConfiguration() {
  if (!emailServerConfigured()) {
    throw new Error("The Gross Printing mailbox is not fully configured on the server.");
  }
}

function quoteImap(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

class ImapSession {
  private socket: TLSSocket;
  private buffer = Buffer.alloc(0);
  private tagNumber = 0;
  private waiters: Array<() => void> = [];
  private closed = false;

  private constructor(socket: TLSSocket) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const current = this.waiters.splice(0);
      current.forEach((resolve) => resolve());
    });
    socket.on("close", () => {
      this.closed = true;
      const current = this.waiters.splice(0);
      current.forEach((resolve) => resolve());
    });
  }

  static async connect() {
    requireMailboxConfiguration();
    const socket = tls.connect({
      host: IMAP_HOST,
      port: IMAP_PORT,
      servername: IMAP_HOST,
      rejectUnauthorized: true
    });
    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.on("timeout", () => socket.destroy(new Error("Mailbox connection timed out.")));
    const session = new ImapSession(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Unable to connect to the mailbox.")), CONNECTION_TIMEOUT_MS);
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const greeting = (await session.readLine()).toString("utf8");
    if (!/^\*\s+(OK|PREAUTH)\b/i.test(greeting)) {
      session.close();
      throw new Error("The mail server did not accept the IMAP connection.");
    }
    const login = await session.command(`LOGIN ${quoteImap(MAILBOX)} ${quoteImap(MAILBOX_PASSWORD!)}`);
    if (!login.ok) {
      session.close();
      throw new Error("The mailbox login was rejected. Check the mailbox address and password in Vercel.");
    }
    return session;
  }

  private async waitForMore() {
    if (this.closed) throw new Error("The mail server closed the connection.");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(onData);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("Mailbox request timed out."));
      }, CONNECTION_TIMEOUT_MS);
      const onData = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(onData);
    });
  }

  private async readLine() {
    while (true) {
      const index = this.buffer.indexOf("\r\n");
      if (index >= 0) {
        const line = this.buffer.subarray(0, index + 2);
        this.buffer = this.buffer.subarray(index + 2);
        return line;
      }
      await this.waitForMore();
    }
  }

  private async readThroughTag(tag: string) {
    const pattern = new RegExp(`(?:^|\\r\\n)${tag}\\s+(OK|NO|BAD)\\b`, "i");
    while (true) {
      const text = this.buffer.toString("latin1");
      const match = pattern.exec(text);
      if (match) {
        const lineStart = match.index + (match[0].startsWith("\r\n") ? 2 : 0);
        const lineEnd = text.indexOf("\r\n", lineStart);
        if (lineEnd >= 0) {
          const end = lineEnd + 2;
          const response = this.buffer.subarray(0, end);
          this.buffer = this.buffer.subarray(end);
          return response;
        }
      }
      await this.waitForMore();
    }
  }

  async command(command: string, totalTimeoutMs = CONNECTION_TIMEOUT_MS) {
    const tag = `A${String(++this.tagNumber).padStart(4, "0")}`;
    this.socket.write(`${tag} ${command}\r\n`, "utf8");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        this.readThroughTag(tag),
        new Promise<Buffer>((_resolve, reject) => {
          timer = setTimeout(() => {
            this.close();
            reject(new Error("Mailbox request timed out."));
          }, Math.max(1_000, totalTimeoutMs));
        })
      ]);
      const text = response.toString("latin1");
      const completion = new RegExp(`(?:^|\\r\\n)${tag}\\s+(OK|NO|BAD)\\b`, "i").exec(text);
      return { ok: completion?.[1]?.toUpperCase() === "OK", response, text };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async searchUtf8Text(value: string) {
    const tag = `A${String(++this.tagNumber).padStart(4, "0")}`;
    const bytes = Buffer.from(value, "utf8");
    this.socket.write(`${tag} UID SEARCH CHARSET UTF-8 TEXT {${bytes.length}}\r\n`, "utf8");
    const continuation = (await this.readLine()).toString("latin1").trim();
    if (!continuation.startsWith("+")) {
      const ok = new RegExp(`^${tag}\\s+OK\\b`, "i").test(continuation);
      return { ok, response: Buffer.from(`${continuation}\r\n`, "latin1"), text: `${continuation}\r\n` };
    }
    this.socket.write(Buffer.concat([bytes, Buffer.from("\r\n", "utf8")]));
    const response = await this.readThroughTag(tag);
    const text = response.toString("latin1");
    const completion = new RegExp(`(?:^|\\r\\n)${tag}\\s+(OK|NO|BAD)\\b`, "i").exec(text);
    return { ok: completion?.[1]?.toUpperCase() === "OK", response, text };
  }

  async selectMailbox(mailbox: string): Promise<MailboxSelection> {
    const selected = await this.command(`SELECT ${quoteImap(mailbox)}`);
    if (!selected.ok) throw new Error(`Unable to open the mailbox folder: ${mailbox}.`);
    const uidValidity = /\[UIDVALIDITY\s+(\d+)\]/i.exec(selected.text)?.[1];
    if (!uidValidity) throw new Error(`The mail server did not return UIDVALIDITY for ${mailbox}.`);
    const uidNext = /\[UIDNEXT\s+(\d+)\]/i.exec(selected.text)?.[1];
    const highestModSeq = /\[HIGHESTMODSEQ\s+(\d+)\]/i.exec(selected.text)?.[1];
    const existsRaw = /(?:^|\r\n)\*\s+(\d+)\s+EXISTS\b/i.exec(selected.text)?.[1];
    return {
      mailboxName: mailbox,
      uidValidity,
      uidNext,
      highestModSeq,
      exists: existsRaw ? Number(existsRaw) : undefined
    };
  }

  async listMailboxes() {
    const listed = await this.command('LIST "" "*"');
    if (!listed.ok) throw new Error("Unable to list mailbox folders.");
    return listed.text;
  }

  async appendMessage(mailbox: string, message: string) {
    const tag = `A${String(++this.tagNumber).padStart(4, "0")}`;
    const bytes = Buffer.from(message.replace(/\r?\n/g, "\r\n"), "utf8");
    this.socket.write(`${tag} APPEND ${quoteImap(mailbox)} (\\Seen) {${bytes.length}}\r\n`, "utf8");
    const continuation = (await this.readLine()).toString("latin1").trim();
    if (!continuation.startsWith("+")) {
      if (new RegExp(`^${tag}\\s+(OK|NO|BAD)\\b`, "i").test(continuation)) {
        return /^A\d+\s+OK\b/i.test(continuation);
      }
      throw new Error("The mail server did not accept the Sent-folder copy.");
    }
    this.socket.write(Buffer.concat([bytes, Buffer.from("\r\n", "utf8")]));
    const response = await this.readThroughTag(tag);
    return new RegExp(`(?:^|\\r\\n)${tag}\\s+OK\\b`, "i").test(response.toString("latin1"));
  }

  async logout() {
    try {
      await this.command("LOGOUT");
    } catch {
      // The server is allowed to close immediately after LOGOUT.
    }
    this.close();
  }

  close() {
    if (!this.closed) this.socket.end();
  }
}

function imapDate(date: Date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

function parseSearchUids(text: string) {
  const match = /(?:^|\r\n)\* SEARCH([^\r\n]*)/i.exec(text);
  if (!match) return [];
  return match[1].trim().split(/\s+/).filter((value) => /^\d+$/.test(value));
}

function parseFetchUids(text: string) {
  const results: string[] = [];
  const pattern = /(?:^|\r\n)\*\s+\d+\s+FETCH\s+\([^\r\n]*?\bUID\s+(\d+)\b[^\r\n]*?\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) results.push(match[1]);
  return results;
}

type ListedMailbox = { name: string; flags: string[] };

function parseListedMailboxes(text: string): ListedMailbox[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const match = /^\* LIST \(([^)]*)\) (?:"(?:\\.|[^"])*"|NIL) (?:"((?:\\.|[^"])*)"|(.+))$/i.exec(line.trim());
      if (!match) return undefined;
      const rawName = (match[2] ?? match[3] ?? "").trim();
      const name = rawName.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const flags = match[1].split(/\s+/).filter(Boolean);
      return { name, flags };
    })
    .filter((item): item is ListedMailbox => Boolean(item?.name));
}

let cachedSentMailbox: string | undefined;

async function resolveMailboxName(session: ImapSession, folder: MailboxFolderKind) {
  if (folder === "inbox") return "INBOX";
  if (cachedSentMailbox) return cachedSentMailbox;
  const listed = parseListedMailboxes(await session.listMailboxes());
  const bySpecialUse = listed.find((item) => item.flags.some((flag) => flag.toLowerCase() === "\\sent"));
  const candidates = ["sent", "sent items", "sent messages", "sent mail", "sent-mail", "sentitems"];
  const byName = listed.find((item) => candidates.includes(item.name.trim().toLowerCase()));
  const fuzzy = listed.find((item) => /(^|[\/ ._-])sent($|[\/ ._-])/i.test(item.name) && !/trash|deleted|junk|spam/i.test(item.name));
  const found = bySpecialUse?.name ?? byName?.name ?? fuzzy?.name ?? "Sent";
  cachedSentMailbox = found;
  return found;
}

export type MailboxReadStateChange = {
  messageId: string;
  folder?: MailboxFolderKind;
  uidValidity?: string;
  unread: boolean;
};

export async function setMailboxReadState(changes: MailboxReadStateChange[]) {
  const safe = changes.filter((change) => /^\d+$/.test(change.messageId)).slice(0, 100);
  if (!safe.length) return { updated: 0 };
  const grouped = new Map<MailboxFolderKind, MailboxReadStateChange[]>();
  safe.forEach((change) => {
    const folder: MailboxFolderKind = change.folder === "sent" ? "sent" : "inbox";
    const current = grouped.get(folder) ?? [];
    current.push({ ...change, folder });
    grouped.set(folder, current);
  });
  let updated = 0;
  for (const [folder, folderChanges] of grouped.entries()) {
    const session = await ImapSession.connect();
    try {
      const mailbox = await resolveMailboxName(session, folder);
      const selected = await session.selectMailbox(mailbox);
      for (const change of folderChanges) {
        if (change.uidValidity && change.uidValidity !== selected.uidValidity) {
          throw new Error(`Mailbox identity changed before updating message ${change.messageId}. Refresh the Email Center and try again.`);
        }
        const command = change.unread
          ? `UID STORE ${change.messageId} -FLAGS.SILENT (\\Seen)`
          : `UID STORE ${change.messageId} +FLAGS.SILENT (\\Seen)`;
        const result = await session.command(command);
        if (!result.ok) throw new Error(`Unable to update read status for message ${change.messageId}.`);
        updated += 1;
      }
    } finally {
      await session.logout();
    }
  }
  return { updated };
}

function parseFetchedMessages(response: Buffer): FetchedMessage[] {
  const messages: FetchedMessage[] = [];
  let cursor = 0;
  const text = response.toString("latin1");
  while (cursor < response.length) {
    const slice = text.slice(cursor);
    const marker = /\*\s+\d+\s+FETCH\s+\(([\s\S]*?)\{(\d+)\}\r\n/i.exec(slice);
    if (!marker || marker.index < 0) break;
    const absoluteMarkerStart = cursor + marker.index;
    const literalStart = absoluteMarkerStart + marker[0].length;
    const literalLength = Number(marker[2]);
    if (!Number.isFinite(literalLength) || literalLength < 0 || literalStart + literalLength > response.length) break;
    const metadata = marker[1];
    const uid = /\bUID\s+(\d+)\b/i.exec(metadata)?.[1];
    if (uid) {
      const flagsText = /\bFLAGS\s+\(([^)]*)\)/i.exec(metadata)?.[1] ?? "";
      const flags = flagsText.split(/\s+/).filter(Boolean);
      const internalDate = /\bINTERNALDATE\s+"([^"]+)"/i.exec(metadata)?.[1];
      messages.push({
        uid,
        flags,
        internalDate,
        raw: response.subarray(literalStart, literalStart + literalLength)
      });
    }
    cursor = literalStart + literalLength;
  }
  return messages;
}

async function fetchMailboxPage(folder: MailboxFolderKind, maxResults: number, offset = 0, searchQuery = "") {
  const session = await ImapSession.connect();
  try {
    const mailboxName = await resolveMailboxName(session, folder);
    const selected = await session.selectMailbox(mailboxName);

    // For the normal inbox view, use SELECT's EXISTS count plus sequence-number
    // FETCH to discover just the UIDs for this page. This avoids SEARCH ALL on
    // every automatic refresh when the mailbox contains many years of mail.
    const requested = Number.isFinite(maxResults) ? Math.round(maxResults) : INBOX_SYNC_MAX_MESSAGES;
    const limit = Math.max(1, Math.min(INBOX_SYNC_MAX_MESSAGES, requested));
    const safeOffset = Math.max(0, Number.isFinite(offset) ? Math.round(offset) : 0);
    const searchText = searchQuery.trim().slice(0, 240);
    let limited: string[] = [];
    let total = selected.exists ?? 0;
    let hasMore = false;

    if (!searchText) {
      const endSequence = Math.max(0, total - safeOffset);
      const startSequence = Math.max(1, endSequence - limit + 1);
      if (endSequence > 0) {
        const uidPage = await session.command(`FETCH ${startSequence}:${endSequence} (UID)`);
        if (!uidPage.ok) throw new Error(`Unable to list the mailbox ${folder} page.`);
        limited = parseFetchUids(uidPage.text);
      }
      hasMore = startSequence > 1;
    } else {
      let searched;
      if (/^[\x20-\x7E]*$/.test(searchText)) {
        const searchTerms = searchText.split(/\s+/).filter(Boolean).slice(0, 6);
        const searchExpression = searchTerms.map((term) => `TEXT ${quoteImap(term.slice(0, 120))}`).join(" ");
        searched = await session.command(`UID SEARCH ${searchExpression}`);
      } else {
        // Non-ASCII search text is sent as a real UTF-8 IMAP literal so Hebrew/Yiddish
        // search does not depend on invalid 8-bit quoted strings.
        searched = await session.searchUtf8Text(searchText);
      }
      if (!searched.ok) throw new Error(`Unable to search the mailbox ${folder} folder.`);
      const allUids = parseSearchUids(searched.text);
      total = allUids.length;
      const endIndex = Math.max(0, allUids.length - safeOffset);
      const startIndex = Math.max(0, endIndex - limit);
      limited = allUids.slice(startIndex, endIndex);
      hasMore = startIndex > 0;
    }

    if (!limited.length) return { messages: [] as FetchedMessage[], hasMore, total, mailbox: selected };

    const previewBytes = folder === "sent" ? SENT_PREVIEW_BYTES : INBOX_PREVIEW_BYTES;
    const fetched = await session.command(
      `UID FETCH ${limited.join(",")} (UID FLAGS INTERNALDATE BODY.PEEK[]<0.${previewBytes}>)`
    );
    if (!fetched.ok) throw new Error(`Unable to download mailbox ${folder} messages.`);
    return {
      messages: parseFetchedMessages(fetched.response).map((message) => ({
        ...message,
        mailboxName: selected.mailboxName,
        uidValidity: selected.uidValidity,
        fullyLoaded: false
      })),
      hasMore,
      total,
      mailbox: selected
    };
  } finally {
    await session.logout();
  }
}

async function fetchMailboxMessage(folder: MailboxFolderKind, uid: string) {
  if (!/^\d+$/.test(uid)) throw new Error("Invalid mailbox message identifier.");
  const session = await ImapSession.connect();
  try {
    const mailboxName = await resolveMailboxName(session, folder);
    const selected = await session.selectMailbox(mailboxName);
    const fetched = await session.command(`UID FETCH ${uid} (UID FLAGS INTERNALDATE BODY.PEEK[])`, 25_000);
    if (!fetched.ok) throw new Error("Unable to download the mailbox message.");
    const messages = parseFetchedMessages(fetched.response);
    const message = messages.find((item) => item.uid === uid);
    if (!message) throw new Error("The mailbox message could not be found.");
    return { ...message, mailboxName: selected.mailboxName, uidValidity: selected.uidValidity, fullyLoaded: true };
  } finally {
    await session.logout();
  }
}

function unfoldHeaders(value: string) {
  return value.replace(/\r?\n[ \t]+/g, " ");
}

function decodeQuotedPrintableBytes(value: string) {
  const normalized = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(normalized.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function decodedTextPenalty(value: string) {
  const replacements = (value.match(/\uFFFD/g) ?? []).length;
  const controls = Array.from(value).filter((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  }).length;
  const mojibake = (value.match(/[ÃÂÐÑ]/g) ?? []).length;
  return replacements * 1000 + controls * 80 + mojibake * 4;
}

function decodeBytes(bytes: Buffer, charset: string | undefined) {
  const requested = (charset ?? "utf-8").trim().replace(/^['"]|['"]$/g, "");
  const aliases: Record<string, string> = {
    "utf8": "utf-8",
    "us-ascii": "windows-1252",
    "ascii": "windows-1252",
    "latin1": "windows-1252",
    "iso-8859-1": "windows-1252",
    "cp1252": "windows-1252",
    "cp1255": "windows-1255",
    "windows1255": "windows-1255",
    "iso8859-8": "iso-8859-8",
    "iso8859-8-i": "iso-8859-8-i"
  };
  const preferred = aliases[requested.toLowerCase()] ?? requested;
  const candidates = Array.from(new Set([
    preferred,
    "utf-8",
    "windows-1255",
    "iso-8859-8",
    "windows-1252"
  ]));
  let best = bytes.toString("latin1");
  let bestPenalty = Number.POSITIVE_INFINITY;
  candidates.forEach((label, index) => {
    try {
      const decoded = new TextDecoder(label, { fatal: false }).decode(bytes);
      // Prefer the declared charset when candidates are otherwise equally clean.
      const penalty = decodedTextPenalty(decoded) + index * 0.01;
      if (penalty < bestPenalty) {
        best = decoded;
        bestPenalty = penalty;
      }
    } catch {
      // Unsupported charset labels are ignored and the next candidate is tried.
    }
  });
  return best.normalize("NFC");
}

function decodeHeaderWord(match: string, charset: string, encoding: string, data: string) {
  try {
    const bytes = encoding.toLowerCase() === "b"
      ? Buffer.from(data, "base64")
      : decodeQuotedPrintableBytes(data.replace(/_/g, " "));
    return decodeBytes(bytes, charset);
  } catch {
    return match;
  }
}

function decodeHeader(value: string) {
  const decoded = value
    .replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, decodeHeaderWord);
  // RFC 6532 also permits raw UTF-8 headers. The header block is read as
  // latin1 first so IMAP framing stays byte-accurate; recover those bytes
  // here when no encoded-word decoder already changed them.
  if (decoded === value && /[\x80-\xff]/.test(value)) {
    const utf8 = decodeBytes(Buffer.from(value, "latin1"), "utf-8");
    if (!utf8.includes("�")) return utf8;
  }
  return decoded;
}

function parseHeaders(buffer: Buffer): HeaderMap {
  const headers = new Map<string, string>();
  const text = unfoldHeaders(buffer.toString("latin1"));
  text.split(/\r?\n/).forEach((line) => {
    const index = line.indexOf(":");
    if (index <= 0) return;
    const name = line.slice(0, index).trim().toLowerCase();
    const value = decodeHeader(line.slice(index + 1).trim());
    const existing = headers.get(name);
    headers.set(name, existing ? `${existing}, ${value}` : value);
  });
  return headers;
}

function splitHeaderBody(raw: Buffer) {
  let index = raw.indexOf("\r\n\r\n");
  let separatorLength = 4;
  if (index < 0) {
    index = raw.indexOf("\n\n");
    separatorLength = 2;
  }
  if (index < 0) return { headers: parseHeaders(raw), body: Buffer.alloc(0) };
  return {
    headers: parseHeaders(raw.subarray(0, index)),
    body: raw.subarray(index + separatorLength)
  };
}

function splitHeaderParameters(source: string) {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quoted) {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (char === ";" && !quoted) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  return parts;
}

function decodeRfc2231Value(value: string) {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value);
  const charset = match?.[1] || "utf-8";
  const encoded = match?.[2] ?? value;
  try {
    const bytes: number[] = [];
    for (let index = 0; index < encoded.length; index += 1) {
      if (encoded[index] === "%" && /^[0-9A-Fa-f]{2}$/.test(encoded.slice(index + 1, index + 3))) {
        bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
        index += 2;
      } else bytes.push(encoded.charCodeAt(index) & 0xff);
    }
    return decodeBytes(Buffer.from(bytes), charset);
  } catch {
    return encoded;
  }
}

function parseHeaderParameters(value: string | undefined) {
  const source = value ?? "";
  const parts = splitHeaderParameters(source);
  const main = (parts.shift() ?? "").trim().toLowerCase();
  const params = new Map<string, string>();
  const continuations = new Map<string, Array<{ index: number; encoded: boolean; value: string }>>();
  parts.forEach((part) => {
    const index = part.indexOf("=");
    if (index < 0) return;
    const rawKey = part.slice(0, index).trim().toLowerCase();
    let val = part.slice(index + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    const continuation = /^(.*)\*(\d+)(\*)?$/.exec(rawKey);
    if (continuation) {
      const key = continuation[1];
      const items = continuations.get(key) ?? [];
      items.push({ index: Number(continuation[2]), encoded: Boolean(continuation[3]), value: val });
      continuations.set(key, items);
      return;
    }
    if (rawKey.endsWith("*")) {
      params.set(rawKey.slice(0, -1), decodeRfc2231Value(val));
      return;
    }
    params.set(rawKey, decodeHeader(val));
  });
  continuations.forEach((items, key) => {
    const joined = items.sort((a, b) => a.index - b.index).map((item) => item.value).join("");
    params.set(key, items.some((item) => item.encoded) ? decodeRfc2231Value(joined) : decodeHeader(joined));
  });
  return { main, params };
}

function decodeTransfer(body: Buffer, encoding: string | undefined) {
  const lower = (encoding ?? "").trim().toLowerCase();
  if (lower === "base64") return Buffer.from(body.toString("ascii").replace(/\s+/g, ""), "base64");
  if (lower === "quoted-printable") return decodeQuotedPrintableBytes(body.toString("latin1"));
  return body;
}

function decodeText(bytes: Buffer, charset: string | undefined) {
  return decodeBytes(bytes, charset);
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SAFE_EMAIL_HTML_TAGS = new Set([
  "a", "b", "strong", "i", "em", "u", "s", "br", "p", "div", "span", "blockquote",
  "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "img", "hr", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6", "font"
]);
const VOID_EMAIL_HTML_TAGS = new Set(["br", "img", "hr"]);

function safeEmailCssColor(value: string) {
  const color = value.trim();
  if (!color || color.length > 64) return undefined;
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s+-]+\)$/i.test(color)) return color;
  if (/^[a-z]{3,24}$/i.test(color)) return color.toLowerCase();
  return undefined;
}

function sanitizeEmailStyle(raw: string) {
  if (!raw || raw.length > 4_000) return undefined;
  const safe: string[] = [];
  for (const declaration of raw.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator <= 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!value || /(?:url\s*\(|expression\s*\(|javascript:|data:)/i.test(value)) continue;

    if (property === "color" || property === "background-color") {
      const color = safeEmailCssColor(value);
      if (color) safe.push(`${property}:${color}`);
      continue;
    }
    if (property === "font-weight" && /^(?:normal|bold|[1-9]00)$/i.test(value)) {
      safe.push(`${property}:${value.toLowerCase()}`);
      continue;
    }
    if (property === "font-style" && /^(?:normal|italic|oblique)$/i.test(value)) {
      safe.push(`${property}:${value.toLowerCase()}`);
      continue;
    }
    if (property === "text-decoration" && /^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/i.test(value)) {
      safe.push(`${property}:${value.toLowerCase()}`);
      continue;
    }
    if (property === "text-align" && /^(?:left|right|center|justify|start|end)$/i.test(value)) {
      safe.push(`${property}:${value.toLowerCase()}`);
      continue;
    }
    if (property === "direction" && /^(?:ltr|rtl)$/i.test(value)) {
      safe.push(`${property}:${value.toLowerCase()}`);
      continue;
    }
    if (property === "font-size" && /^\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|rem|%)$/i.test(value)) {
      safe.push(`${property}:${value.toLowerCase()}`);
      continue;
    }
    if (property === "line-height" && /^(?:normal|\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|rem|%)?)$/i.test(value)) {
      safe.push(`${property}:${value.toLowerCase()}`);
      continue;
    }
    if (property === "font-family" && /^[a-z0-9 ,.'"_-]{1,160}$/i.test(value)) {
      safe.push(`${property}:${value}`);
      continue;
    }
    if (property === "white-space" && /^(?:normal|nowrap|pre|pre-wrap|pre-line)$/i.test(value)) {
      safe.push(`${property}:${value.toLowerCase()}`);
    }
  }
  return safe.length ? safe.join(";") : undefined;
}

function safeEmailUrl(raw: string, kind: "href" | "src") {
  const value = raw.trim().replace(/[\u0000-\u001f\u007f]+/g, "");
  if (kind === "src") {
    if (/^cid:/i.test(value)) return value;
    if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(value)) return value;
    return undefined;
  }
  if (/^(?:https?:|mailto:)/i.test(value)) return value;
  return undefined;
}

function sanitizeEmailHtml(value: string) {
  const withoutComments = value.replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  return withoutComments.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawTag: string, rawAttributes: string) => {
    const sourceTag = rawTag.toLowerCase();
    const tag = sourceTag === "body" || sourceTag === "html" ? "div" : sourceTag;
    if (!SAFE_EMAIL_HTML_TAGS.has(tag)) return "";
    if (full.startsWith("</")) return VOID_EMAIL_HTML_TAGS.has(tag) ? "" : `</${tag}>`;

    const attrs: string[] = [];
    const attributePattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(rawAttributes))) {
      const name = match[1].toLowerCase();
      const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
      if (name.startsWith("on") || name === "srcdoc") continue;
      if (name === "style") {
        const safeStyle = sanitizeEmailStyle(rawValue);
        if (safeStyle) attrs.push(`style="${safeStyle.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`);
        continue;
      }
      if (name === "dir" && /^(?:ltr|rtl|auto)$/i.test(rawValue)) {
        attrs.push(`dir="${rawValue.toLowerCase()}"`);
        continue;
      }
      if (name === "lang" && /^[a-zA-Z0-9-]{1,24}$/.test(rawValue)) {
        attrs.push(`lang="${rawValue}"`);
        continue;
      }
      if (tag === "a" && name === "href") {
        const safe = safeEmailUrl(rawValue, "href");
        if (safe) attrs.push(`href="${safe.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`, 'target="_blank"', 'rel="noopener noreferrer nofollow"');
        continue;
      }
      if (tag === "img" && name === "src") {
        const safe = safeEmailUrl(rawValue, "src");
        if (safe) attrs.push(`src="${safe.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`);
        else attrs.push('data-remote-image="blocked"');
        continue;
      }
      if (tag === "img" && ["alt", "title"].includes(name)) {
        attrs.push(`${name}="${rawValue.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`);
        continue;
      }
      if ((name === "color" && tag === "font") || (name === "bgcolor" && ["table", "tr", "td", "th", "div", "span"].includes(tag))) {
        const safeColor = safeEmailCssColor(rawValue);
        if (safeColor) attrs.push(`${name}="${safeColor}"`);
        continue;
      }
      if (tag === "font" && name === "face" && /^[a-z0-9 ,.'"_-]{1,160}$/i.test(rawValue)) {
        attrs.push(`face="${rawValue.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`);
        continue;
      }
      if (tag === "font" && name === "size" && /^[1-7]$/.test(rawValue)) {
        attrs.push(`size="${rawValue}"`);
        continue;
      }
      if (["img", "table", "td", "th"].includes(tag) && ["width", "height", "colspan", "rowspan"].includes(name) && /^\d{1,4}%?$/.test(rawValue)) {
        attrs.push(`${name}="${rawValue}"`);
      }
    }
    return `<${tag}${attrs.length ? ` ${Array.from(new Set(attrs)).join(" ")}` : ""}>`;
  });
}

function splitMultipart(body: Buffer, boundary: string) {
  const delimiter = `--${boundary}`;
  const source = body.toString("latin1");
  const pieces = source.split(delimiter);
  return pieces
    .slice(1)
    .filter((piece) => !piece.trimStart().startsWith("--"))
    .map((piece) => {
      let clean = piece;
      if (clean.startsWith("\r\n")) clean = clean.slice(2);
      else if (clean.startsWith("\n")) clean = clean.slice(1);
      clean = clean.replace(/\r?\n$/, "");
      return Buffer.from(clean, "latin1");
    });
}

function extensionForMime(mimeType: string) {
  const known: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp"
  };
  return known[mimeType.toLowerCase()] ?? "";
}

type ParsedMimeResult = { plain: string; htmlText: string; htmlRaw: string; attachments: ParsedAttachment[] };

function parseMimeEntity(headers: HeaderMap, body: Buffer, state: { nextAttachment: number }): ParsedMimeResult {
  const contentType = parseHeaderParameters(headers.get("content-type") ?? "text/plain; charset=utf-8");
  const disposition = parseHeaderParameters(headers.get("content-disposition"));
  const transferEncoding = headers.get("content-transfer-encoding");
  const filename = disposition.params.get("filename") ?? contentType.params.get("name");
  const contentId = headers.get("content-id")?.trim().replace(/^<|>$/g, "");

  if (contentType.main.startsWith("multipart/")) {
    const boundary = contentType.params.get("boundary");
    if (!boundary) return { plain: "", htmlText: "", htmlRaw: "", attachments: [] };
    const result: ParsedMimeResult = { plain: "", htmlText: "", htmlRaw: "", attachments: [] };
    for (const rawPart of splitMultipart(body, boundary)) {
      const part = splitHeaderBody(rawPart);
      const parsed = parseMimeEntity(part.headers, part.body, state);
      if (parsed.plain) result.plain += `${parsed.plain}\n`;
      if (parsed.htmlText) result.htmlText += `${parsed.htmlText}\n`;
      if (parsed.htmlRaw) result.htmlRaw += `${parsed.htmlRaw}\n`;
      result.attachments.push(...parsed.attachments);
    }
    return result;
  }

  const decoded = decodeTransfer(body, transferEncoding);
  const inline = disposition.main === "inline" || Boolean(contentId);
  const isAttachment = Boolean(filename) || disposition.main === "attachment" || (inline && !contentType.main.startsWith("text/"));
  if (isAttachment) {
    const attachmentNumber = state.nextAttachment++;
    const safeFilename = filename?.trim() || `inline-image-${attachmentNumber}${extensionForMime(contentType.main)}` || `attachment-${attachmentNumber}`;
    return {
      plain: "",
      htmlText: "",
      htmlRaw: "",
      attachments: [{
        id: `attachment-${attachmentNumber}`,
        filename: safeFilename,
        mimeType: contentType.main || "application/octet-stream",
        size: decoded.length,
        messageId: "",
        providerAttachmentId: `part-${attachmentNumber}`,
        inline,
        contentId,
        bytes: decoded
      } satisfies ParsedAttachment]
    };
  }

  if (contentType.main === "text/plain") {
    return { plain: decodeText(decoded, contentType.params.get("charset")).trim(), htmlText: "", htmlRaw: "", attachments: [] };
  }
  if (contentType.main === "text/html") {
    const html = decodeText(decoded, contentType.params.get("charset"));
    return { plain: "", htmlText: stripHtml(html), htmlRaw: sanitizeEmailHtml(html), attachments: [] };
  }
  return { plain: "", htmlText: "", htmlRaw: "", attachments: [] };
}

function parseRawMessage(raw: Buffer): ParsedRawMessage {
  const top = splitHeaderBody(raw);
  const state = { nextAttachment: 1 };
  const content = parseMimeEntity(top.headers, top.body, state);
  const messageId = top.headers.get("message-id")?.trim();
  const inReplyTo = top.headers.get("in-reply-to")?.trim();
  const references = top.headers.get("references")?.trim();
  return {
    messageId,
    inReplyTo,
    references,
    from: top.headers.get("from") ?? "",
    to: parseAddressList(top.headers.get("to")),
    cc: parseAddressList(top.headers.get("cc")),
    subject: top.headers.get("subject") || "No subject",
    bodyText: (content.plain.trim() || content.htmlText.trim()).trim(),
    bodyHtml: content.htmlRaw.trim() || undefined,
    attachments: content.attachments,
    date: top.headers.get("date")
  };
}

function parseAddressList(value: string | undefined) {
  if (!value) return [];
  const results: string[] = [];
  let current = "";
  let quoted = false;
  let angleDepth = 0;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "<") angleDepth += 1;
    if (!quoted && char === ">" && angleDepth > 0) angleDepth -= 1;
    if (char === "," && !quoted && angleDepth === 0) {
      if (current.trim()) results.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) results.push(current.trim());
  return results;
}

function extractEmailAddress(value: string) {
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(value)?.[1];
  if (angle) return angle.toLowerCase();
  const simple = /[^\s<>,;]+@[^\s<>,;]+/.exec(value)?.[0];
  return simple?.toLowerCase() ?? "";
}

function normalizeSubject(subject: string) {
  return subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim().toLowerCase();
}

function messageReferenceIds(value: string | undefined) {
  if (!value) return [] as string[];
  const matches = value.match(/<[^<>]+>/g);
  return (matches?.length ? matches : value.trim().split(/\s+/))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function standaloneThreadKey(message: ParsedRawMessage) {
  const correspondent = [message.from, ...message.to].map(extractEmailAddress).filter(Boolean).sort().join("|");
  const unique = createHash("sha256")
    .update(`${normalizeSubject(message.subject)}\0${correspondent}\0${message.date ?? ""}\0${message.bodyText.slice(0, 512)}`)
    .digest("hex")
    .slice(0, 24);
  return `single:${unique}`;
}

function threadProviderKey(message: ParsedRawMessage) {
  // This is only a per-message seed. Final grouping is built from the full
  // References/In-Reply-To graph in groupMessagesByReferenceGraph().
  const root = messageReferenceIds(message.references)[0]
    ?? messageReferenceIds(message.inReplyTo)[0]
    ?? messageReferenceIds(message.messageId)[0];
  return root ? `ref:${root}` : standaloneThreadKey(message);
}

function threadProviderIdFromKey(source: string) {
  return `rackspace-${createHash("sha256").update(source).digest("hex").slice(0, 24)}`;
}

function groupMessagesByReferenceGraph(messages: EmailMessage[]) {
  const parent = messages.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  const ownerByReference = new Map<string, number>();

  messages.forEach((message, index) => {
    const ids = new Set([
      ...messageReferenceIds(message.rfcMessageId),
      ...messageReferenceIds(message.references),
      ...messageReferenceIds(message.inReplyTo)
    ]);
    ids.forEach((id) => {
      const previous = ownerByReference.get(id);
      if (previous === undefined) ownerByReference.set(id, index);
      else union(index, previous);
    });
  });

  const grouped = new Map<number, EmailMessage[]>();
  messages.forEach((message, index) => {
    const root = find(index);
    const current = grouped.get(root) ?? [];
    current.push(message);
    grouped.set(root, current);
  });

  return Array.from(grouped.values()).map((group) => {
    const sorted = [...group].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    const knownMessageIds = new Set(sorted.flatMap((message) => messageReferenceIds(message.rfcMessageId)));
    const externalRoots = sorted.flatMap((message) => [
      ...messageReferenceIds(message.references),
      ...messageReferenceIds(message.inReplyTo)
    ]).filter((id) => !knownMessageIds.has(id));
    const stableReference = externalRoots[0]
      ?? messageReferenceIds(sorted[0]?.rfcMessageId)[0]
      ?? sorted[0]?.canonicalId
      ?? sorted[0]?.providerThreadKey
      ?? `single:${sorted[0]?.id ?? randomBytes(8).toString("hex")}`;
    const providerThreadKey = stableReference.startsWith("ref:") || stableReference.startsWith("single:")
      ? stableReference
      : `ref:${stableReference}`;
    const providerThreadId = threadProviderIdFromKey(providerThreadKey);
    const threadId = `mail-thread-${providerThreadId}`;
    return sorted.map((message) => ({ ...message, providerThreadKey, threadId }));
  });
}

function messageDate(parsed: ParsedRawMessage, internalDate: string | undefined) {
  const raw = parsed.date ?? internalDate;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeFetchedMessage(fetched: FetchedMessage, folder: MailboxFolderKind): EmailMessage {
  const parsed = parseRawMessage(fetched.raw);
  const providerThreadKey = threadProviderKey(parsed);
  const providerThreadId = threadProviderIdFromKey(providerThreadKey);
  const providerMessageId = fetched.uid;
  const mailboxName = fetched.mailboxName ?? (folder === "inbox" ? "INBOX" : "Sent");
  const uidValidity = fetched.uidValidity ?? "unknown";
  const canonicalId = `imap:${mailboxName.toLowerCase()}:${uidValidity}:${providerMessageId}`;
  const sentAt = messageDate(parsed, fetched.internalDate);
  const mailboxLower = MAILBOX.toLowerCase();
  const fromAddress = extractEmailAddress(parsed.from);
  const direction: EmailMessage["direction"] = folder === "sent" || fromAddress === mailboxLower ? "outbound" : "inbound";
  const idPrefix = folder === "sent" ? "mail-sent" : "mail";
  const attachments: EmailAttachment[] = parsed.attachments.map(({ bytes: _bytes, ...attachment }) => ({
    ...attachment,
    id: `${idPrefix}-${uidValidity}-${providerMessageId}-${attachment.providerAttachmentId}`,
    messageId: providerMessageId,
    mailboxName,
    uidValidity
  }));
  return {
    id: folder === "sent" ? `mail-message-sent-${uidValidity}-${providerMessageId}` : `mail-message-${uidValidity}-${providerMessageId}`,
    providerMessageId,
    mailboxFolder: folder,
    mailboxName,
    uidValidity,
    canonicalId,
    parserVersion: MAIL_PARSER_VERSION,
    fullyLoaded: Boolean(fetched.fullyLoaded),
    rfcMessageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references,
    providerThreadKey,
    threadId: `mail-thread-${providerThreadId}`,
    direction,
    from: parsed.from,
    to: parsed.to,
    cc: parsed.cc,
    subject: parsed.subject,
    bodyText: parsed.bodyText,
    bodyHtml: parsed.bodyHtml,
    sentAt,
    unread: folder === "inbox" && !fetched.flags.some((flag) => flag.toLowerCase() === "\\seen"),
    attachments
  };
}

function messageLooksDecodeDamaged(message: EmailMessage) {
  const values = [message.subject, message.from, message.bodyText, ...(message.to ?? []), ...(message.cc ?? []), ...message.attachments.map((attachment) => attachment.filename)];
  return values.some((value) => {
    if (!value) return false;
    const replacements = (value.match(/\uFFFD/g) ?? []).length;
    return replacements > 0 || /\?{4,}/.test(value) || /(?:Ã.|Â.|â€|â€™|â€œ|â€)/.test(value);
  });
}

async function repairDamagedPreviewMessages(messages: EmailMessage[], folder: MailboxFolderKind) {
  const repaired = [...messages];
  const candidates = repaired
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.providerMessageId && messageLooksDecodeDamaged(message))
    .slice(0, 5);
  for (const { message, index } of candidates) {
    try {
      const full = await fetchMailboxMessage(folder, message.providerMessageId!);
      const normalized = normalizeFetchedMessage(full, folder);
      if (normalized.uidValidity === message.uidValidity) repaired[index] = normalized;
    } catch {
      // Keep the safe client-side loading placeholder rather than failing the whole mailbox page.
    }
  }
  return repaired;
}

export async function loadMailboxThreads(
  folder: MailboxFolderKind,
  maxResults = INBOX_SYNC_MAX_MESSAGES,
  offset = 0,
  searchQuery = ""
): Promise<{ threads: EmailThread[]; hasMore: boolean; total: number }> {
  const fetched = await fetchMailboxPage(folder, maxResults, offset, searchQuery);
  const previewMessages = fetched.messages.map((message) => normalizeFetchedMessage(message, folder));
  const normalizedMessages = await repairDamagedPreviewMessages(previewMessages, folder);
  const groupedMessages = groupMessagesByReferenceGraph(normalizedMessages);

  const threads: EmailThread[] = [];
  for (const threadMessages of groupedMessages) {
    const sorted = threadMessages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    const threadId = sorted[0]?.threadId;
    if (!threadId) continue;
    const latest = sorted[sorted.length - 1];
    if (!latest) continue;
    const participants = new Set<string>();
    sorted.forEach((message) => {
      if (message.from) participants.add(message.from);
      message.to.forEach((recipient) => participants.add(recipient));
      message.cc?.forEach((recipient) => participants.add(recipient));
    });
    const providerThreadId = threadId.replace(/^mail-thread-/, "");
    threads.push({
      id: threadId,
      providerThreadId,
      providerThreadKey: latest.providerThreadKey,
      subject: latest.subject,
      participantEmails: Array.from(participants),
      snippet: latest.bodyText.slice(0, 240),
      lastMessageAt: latest.sentAt,
      unread: sorted.some((message) => message.unread),
      messages: sorted
    });
  }
  return {
    threads: threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()),
    hasMore: fetched.hasMore,
    total: fetched.total
  };
}

export async function loadMailboxMessageDetails(
  folder: MailboxFolderKind,
  messageId: string,
  expectedUidValidity?: string
): Promise<EmailMessage> {
  if (!/^\d+$/.test(messageId)) throw new Error("Invalid mailbox message identifier.");
  const fetched = await fetchMailboxMessage(folder, messageId);
  if (expectedUidValidity && fetched.uidValidity !== expectedUidValidity) {
    throw new Error("Mailbox identity changed. Refresh Email Center before opening this message.");
  }
  return normalizeFetchedMessage({ ...fetched, fullyLoaded: true }, folder);
}

export async function loadGmailThreads(maxResults = INBOX_SYNC_MAX_MESSAGES): Promise<EmailThread[]> {
  return (await loadMailboxThreads("inbox", maxResults, 0)).threads;
}

class SmtpSession {
  private socket: TLSSocket;
  private buffer = "";
  private waiters: Array<() => void> = [];
  private closed = false;

  private constructor(socket: TLSSocket) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      const current = this.waiters.splice(0);
      current.forEach((resolve) => resolve());
    });
    socket.on("close", () => {
      this.closed = true;
      const current = this.waiters.splice(0);
      current.forEach((resolve) => resolve());
    });
  }

  static async connect() {
    requireMailboxConfiguration();
    const socket = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, rejectUnauthorized: true });
    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.on("timeout", () => socket.destroy(new Error("SMTP connection timed out.")));
    const session = new SmtpSession(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Unable to connect to the outgoing mail server.")), CONNECTION_TIMEOUT_MS);
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const greeting = await session.readResponse();
    if (greeting.code !== 220) throw new Error("The outgoing mail server did not accept the connection.");
    const ehlo = await session.command("EHLO gross-printing.vercel.app");
    if (ehlo.code !== 250) throw new Error("The outgoing mail server rejected the EHLO request.");
    const auth = await session.command("AUTH LOGIN");
    if (auth.code !== 334) throw new Error("The outgoing mail server does not accept mailbox login.");
    const user = await session.command(Buffer.from(MAILBOX, "utf8").toString("base64"));
    if (user.code !== 334) throw new Error("The outgoing mail server rejected the mailbox address.");
    const password = await session.command(Buffer.from(MAILBOX_PASSWORD!, "utf8").toString("base64"));
    if (password.code !== 235) throw new Error("The mailbox password was rejected by the outgoing mail server.");
    return session;
  }

  private async waitForMore() {
    if (this.closed) throw new Error("The outgoing mail server closed the connection.");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(onData);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("Outgoing mail request timed out."));
      }, CONNECTION_TIMEOUT_MS);
      const onData = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(onData);
    });
  }

  private async readResponse() {
    while (true) {
      const lines = this.buffer.split("\r\n");
      for (let index = 0; index < lines.length - 1; index += 1) {
        const line = lines[index];
        const match = /^(\d{3})([ -])/.exec(line);
        if (!match || match[2] !== " ") continue;
        const consumedLines = lines.slice(0, index + 1);
        this.buffer = lines.slice(index + 1).join("\r\n");
        return { code: Number(match[1]), text: consumedLines.join("\r\n") };
      }
      await this.waitForMore();
    }
  }

  async command(command: string) {
    this.socket.write(`${command}\r\n`, "utf8");
    return this.readResponse();
  }

  async data(message: string) {
    const normalized = message.replace(/\r?\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");
    this.socket.write(`${normalized}\r\n.\r\n`, "utf8");
    return this.readResponse();
  }

  async quit() {
    try {
      await this.command("QUIT");
    } catch {
      // Ignore a server close after QUIT.
    }
    if (!this.closed) this.socket.end();
  }
}

function encodeHeader(value: string) {
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7E]*$/.test(cleaned) ? cleaned : `=?UTF-8?B?${Buffer.from(cleaned, "utf8").toString("base64")}?=`;
}

function asciiFilenameFallback(value: string) {
  const cleaned = value.replace(/[\r\n"\\]/g, "").trim();
  const ascii = cleaned.replace(/[^\x20-\x7E]/g, "_").replace(/[;=]/g, "_").slice(0, 120);
  return ascii || "attachment";
}

function rfc2231Filename(value: string) {
  const cleaned = value.replace(/[\r\n]/g, "").trim().slice(0, 180) || "attachment";
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return { fallback: asciiFilenameFallback(cleaned), extended: `UTF-8''${encoded}` };
}

function base64Lines(value: string) {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function cleanRfcReference(value: string | undefined) {
  return value?.replace(/[\r\n]+/g, " ").trim();
}

type OutgoingAttachment = {
  filename: string;
  mimeType: string;
  base64: string;
};

function splitRecipientValues(values: string[] | undefined) {
  return (values ?? [])
    .flatMap((value) => value.split(/[;,]/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function validRecipientAddresses(values: string[]) {
  return values.map((value) => {
    const address = extractEmailAddress(value) || value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      throw new Error(`Invalid recipient email address: ${value}`);
    }
    return { display: value.replace(/[\r\n]+/g, " "), address };
  });
}

function wrapExistingBase64(value: string) {
  const clean = value.replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
  return clean.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function buildOutgoingMime(input: {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  attachments?: OutgoingAttachment[];
}) {
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${input.messageId}`,
    `From: Gross Printing <${MAILBOX}>`,
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [`References: ${input.references}`] : []),
    "MIME-Version: 1.0"
  ];

  const attachments = input.attachments ?? [];
  if (!attachments.length) {
    return [
      ...headers,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(input.body)
    ].join("\r\n");
  }

  const boundary = `gross-printing-${randomBytes(12).toString("hex")}`;
  const body: string[] = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(input.body)
  ];
  attachments.forEach((attachment) => {
    const filename = rfc2231Filename(attachment.filename);
    const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(attachment.mimeType) ? attachment.mimeType : "application/octet-stream";
    body.push(
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="${filename.fallback}"; name*=${filename.extended}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename.fallback}"; filename*=${filename.extended}`,
      "",
      wrapExistingBase64(attachment.base64)
    );
  });
  body.push(`--${boundary}--`, "");
  return body.join("\r\n");
}

async function saveSentCopy(mime: string, messageId: string) {
  const imap = await ImapSession.connect();
  try {
    const sentMailbox = await resolveMailboxName(imap, "sent");
    await imap.selectMailbox(sentMailbox);
    const existing = await imap.command(`UID SEARCH HEADER Message-ID ${quoteImap(messageId)}`);
    if (existing.ok && parseSearchUids(existing.text).length) return;
    await imap.appendMessage(sentMailbox, mime);
  } finally {
    await imap.logout();
  }
}

export async function sendGmailMessage(input: {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: OutgoingAttachment[];
}) {
  requireMailboxConfiguration();
  const toValues = splitRecipientValues([input.to]);
  const ccValues = splitRecipientValues(input.cc);
  const bccValues = splitRecipientValues(input.bcc);
  let to = validRecipientAddresses(toValues);
  let cc = validRecipientAddresses(ccValues);
  let bcc = validRecipientAddresses(bccValues);
  if (!to.length) throw new Error("At least one recipient email address is required.");

  const safetySettings = await loadEmailSafetySettings();
  const safetyDecision = evaluateEmailSafety(
    safetySettings,
    [...to, ...cc, ...bcc].map((recipient) => recipient.address)
  );
  if (safetyDecision.action === "block") {
    return {
      id: `blocked-${Date.now()}-${randomBytes(4).toString("hex")}`,
      threadId: input.threadId,
      blocked: true as const,
      redirected: false as const,
      testDelivery: false as const,
      safetyMode: safetyDecision.mode,
      safetyReason: safetyDecision.reason,
      originalTo: safetyDecision.originalRecipients.join(", ")
    };
  }

  let effectiveSubject = input.subject;
  let effectiveBody = input.body;
  if (safetyDecision.action === "redirect" && safetyDecision.effectiveTo) {
    const redirected = validRecipientAddresses(splitRecipientValues([safetyDecision.effectiveTo]));
    if (!redirected.length) throw new Error("The configured test redirect recipient is invalid.");
    effectiveSubject = `[TEST REDIRECT — would send to ${safetyDecision.originalRecipients.join(", ")}] ${input.subject}`;
    effectiveBody = `TEST MODE — THIS MESSAGE WAS NOT SENT TO THE ORIGINAL CUSTOMER.\n\nOriginal recipient(s): ${safetyDecision.originalRecipients.join(", ")}\nReason: ${safetyDecision.reason}\n\n────────────────────────\n\n${input.body}`;
    to = redirected;
    cc = [];
    bcc = [];
  }

  const totalAttachmentBytes = (input.attachments ?? []).reduce((sum, item) => {
    const clean = item.base64.replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
    return sum + Math.floor(clean.length * 0.75);
  }, 0);
  if (totalAttachmentBytes > 20_000_000) {
    throw new Error("Forwarded email attachments are limited to about 20 MB total. Use Files & Paperwork for larger print files.");
  }

  const messageId = `<${Date.now()}.${randomBytes(8).toString("hex")}@grossprinting.com>`;
  const inReplyTo = safetyDecision.action === "redirect" ? "" : cleanRfcReference(input.inReplyTo);
  const referenceHeader = inReplyTo
    ? [cleanRfcReference(input.references), inReplyTo].filter(Boolean).join(" ")
    : cleanRfcReference(input.references);
  const mime = buildOutgoingMime({
    to: to.map((item) => item.display),
    cc: cc.map((item) => item.display),
    subject: effectiveSubject,
    body: effectiveBody,
    messageId,
    inReplyTo,
    references: referenceHeader,
    attachments: input.attachments
  });

  const smtp = await SmtpSession.connect();
  try {
    const from = await smtp.command(`MAIL FROM:<${MAILBOX}>`);
    if (from.code !== 250) throw new Error("The outgoing mail server rejected the sender address.");
    for (const recipient of [...to, ...cc, ...bcc]) {
      const rcpt = await smtp.command(`RCPT TO:<${recipient.address}>`);
      if (rcpt.code !== 250 && rcpt.code !== 251) {
        throw new Error(`The outgoing mail server rejected ${recipient.address}.`);
      }
    }
    const dataStart = await smtp.command("DATA");
    if (dataStart.code !== 354) throw new Error("The outgoing mail server refused the message body.");
    const sent = await smtp.data(mime);
    if (sent.code !== 250) throw new Error("The outgoing mail server did not accept the message.");
  } finally {
    await smtp.quit();
  }

  // SMTP sends the message but does not normally place a copy in IMAP Sent.
  // Save one so Thunderbird, Outlook, phones, and the MIS all see the same history.
  try {
    await saveSentCopy(mime, messageId);
  } catch {
    // Sending already succeeded. The MIS local sent log still records the message,
    // and a later mailbox refresh can continue without failing the send action.
  }

  return {
    id: messageId,
    threadId: input.threadId ?? `rackspace-${createHash("sha256").update(cleanRfcReference(referenceHeader) || messageId).digest("hex").slice(0, 24)}`,
    blocked: false as const,
    redirected: safetyDecision.action === "redirect",
    testDelivery: safetyDecision.mode === "test" && safetyDecision.action === "send" && safetyDecision.reason.includes("approved test list"),
    safetyMode: safetyDecision.mode,
    safetyReason: safetyDecision.reason,
    originalTo: safetyDecision.originalRecipients.join(", ")
  };
}


type ImapBodyValue = string | null | ImapBodyValue[];

type ImapAttachmentPart = {
  section: string;
  filename?: string;
  mimeType: string;
  transferEncoding?: string;
  inline: boolean;
  contentId?: string;
};

function parseImapBodyValue(source: string, startIndex: number): { value: ImapBodyValue; nextIndex: number } | undefined {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  if (index >= source.length) return undefined;

  if (source[index] === "(") {
    index += 1;
    const values: ImapBodyValue[] = [];
    while (index < source.length) {
      while (index < source.length && /\s/.test(source[index])) index += 1;
      if (source[index] === ")") return { value: values, nextIndex: index + 1 };
      const child = parseImapBodyValue(source, index);
      if (!child) return undefined;
      values.push(child.value);
      index = child.nextIndex;
    }
    return undefined;
  }

  if (source[index] === '"') {
    index += 1;
    let value = "";
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') return { value, nextIndex: index };
      if (char === "\\" && index < source.length) value += source[index++];
      else value += char;
    }
    return undefined;
  }

  if (source[index] === "{") {
    const match = /^\{(\d+)\}\r\n/.exec(source.slice(index));
    if (!match) return undefined;
    const length = Number(match[1]);
    const literalStart = index + match[0].length;
    const literalEnd = literalStart + length;
    if (!Number.isFinite(length) || literalEnd > source.length) return undefined;
    return { value: source.slice(literalStart, literalEnd), nextIndex: literalEnd };
  }

  const atomStart = index;
  while (index < source.length && !/[\s()]/.test(source[index])) index += 1;
  if (index <= atomStart) return undefined;
  const atom = source.slice(atomStart, index);
  return { value: atom.toUpperCase() === "NIL" ? null : atom, nextIndex: index };
}

function bodyStructureFromFetch(text: string) {
  const match = /\bBODYSTRUCTURE\b/i.exec(text);
  if (!match) return undefined;
  const parsed = parseImapBodyValue(text, match.index + match[0].length);
  return Array.isArray(parsed?.value) ? parsed.value : undefined;
}

function imapParamMap(value: ImapBodyValue | undefined) {
  const result = new Map<string, string>();
  if (!Array.isArray(value)) return result;
  for (let index = 0; index + 1 < value.length; index += 2) {
    const keyValue = value[index];
    const itemValue = value[index + 1];
    const key = typeof keyValue === "string" ? keyValue : undefined;
    const item = typeof itemValue === "string" ? itemValue : undefined;
    if (key && item) result.set(key.toLowerCase(), item);
  }
  return result;
}

function bodyStructureDisposition(node: ImapBodyValue[]) {
  for (let index = 7; index < node.length; index += 1) {
    const candidate = node[index];
    if (!Array.isArray(candidate)) continue;
    const disposition = typeof candidate[0] === "string" ? candidate[0].toLowerCase() : "";
    if (disposition === "attachment" || disposition === "inline") {
      return { disposition, params: imapParamMap(candidate[1]) };
    }
  }
  return { disposition: "", params: new Map<string, string>() };
}

function bodyStructureAttachmentParts(structure: ImapBodyValue[]) {
  const attachments: ImapAttachmentPart[] = [];

  const walk = (node: ImapBodyValue[], section: string) => {
    if (Array.isArray(node[0])) {
      let partNumber = 0;
      for (const child of node) {
        if (!Array.isArray(child)) break;
        partNumber += 1;
        walk(child, section ? `${section}.${partNumber}` : String(partNumber));
      }
      return;
    }

    const type = typeof node[0] === "string" ? node[0].toLowerCase() : "application";
    const subtype = typeof node[1] === "string" ? node[1].toLowerCase() : "octet-stream";
    const params = imapParamMap(node[2]);
    const contentId = typeof node[3] === "string" ? node[3].replace(/^<|>$/g, "") : undefined;
    const transferEncoding = typeof node[5] === "string" ? node[5] : undefined;
    const { disposition, params: dispositionParams } = bodyStructureDisposition(node);
    const rawFilename = dispositionParams.get("filename") ?? params.get("name");
    const filename = rawFilename ? decodeHeader(rawFilename).trim() : undefined;
    const inline = disposition === "inline";
    const isAttachment = Boolean(filename) || disposition === "attachment" || (inline && Boolean(contentId) && type !== "text");
    if (!isAttachment) return;
    attachments.push({
      section: section || "1",
      filename,
      mimeType: `${type}/${subtype}`,
      transferEncoding,
      inline,
      contentId
    });
  };

  walk(structure, "");
  return attachments;
}

async function loadMailboxAttachmentByPart(
  messageId: string,
  attachmentId: string,
  folder: MailboxFolderKind,
  expectedUidValidity?: string
): Promise<LoadedMailboxAttachment | undefined> {
  const partNumber = Number(/^part-(\d+)$/.exec(attachmentId)?.[1]);
  if (!Number.isInteger(partNumber) || partNumber < 1) return undefined;

  const session = await ImapSession.connect();
  try {
    const mailboxName = await resolveMailboxName(session, folder);
    const selected = await session.selectMailbox(mailboxName);
    if (expectedUidValidity && selected.uidValidity !== expectedUidValidity) {
      throw new Error("Mailbox identity changed. Refresh the Email Center before opening this attachment.");
    }

    // BODYSTRUCTURE is tiny compared with BODY.PEEK[]. It lets the MIS map its
    // stable part-N attachment id to the real IMAP MIME section without downloading
    // the full email (which may contain several large production files).
    const bodyStructureResponse = await session.command(`UID FETCH ${messageId} (UID BODYSTRUCTURE)`, 20_000);
    if (!bodyStructureResponse.ok) return undefined;
    const structure = bodyStructureFromFetch(bodyStructureResponse.text);
    if (!structure) return undefined;
    const attachment = bodyStructureAttachmentParts(structure)[partNumber - 1];
    if (!attachment?.section) return undefined;

    // Fetch only the requested MIME body. The untouched decoded bytes become the
    // high-resolution production source; thumbnails/previews are derived later.
    const partResponse = await session.command(
      `UID FETCH ${messageId} (UID BODY.PEEK[${attachment.section}])`,
      75_000
    );
    if (!partResponse.ok) throw new Error("Unable to download the requested mailbox attachment.");
    const fetchedPart = parseFetchedMessages(partResponse.response).find((item) => item.uid === messageId)
      ?? parseFetchedMessages(partResponse.response)[0];
    if (!fetchedPart) throw new Error("The requested mailbox attachment bytes were not returned.");
    const bytes = decodeTransfer(fetchedPart.raw, attachment.transferEncoding);
    return {
      bytes,
      filename: attachment.filename || `attachment-${partNumber}`,
      mimeType: attachment.mimeType || "application/octet-stream",
      size: bytes.length,
      inline: attachment.inline,
      contentId: attachment.contentId,
      mailboxName,
      uidValidity: selected.uidValidity
    };
  } finally {
    await session.logout();
  }
}

export type LoadedMailboxAttachment = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  size: number;
  inline: boolean;
  contentId?: string;
  mailboxName: string;
  uidValidity: string;
};

export async function loadMailboxAttachment(
  messageId: string,
  attachmentId: string,
  folder: MailboxFolderKind = "inbox",
  expectedUidValidity?: string
): Promise<LoadedMailboxAttachment> {
  const direct = await loadMailboxAttachmentByPart(messageId, attachmentId, folder, expectedUidValidity);
  if (direct) return direct;

  // Compatibility fallback for unusual MIME structures. This full-message path is
  // capped at 25 seconds, so it can no longer hold a Vercel request for five minutes.
  const fetched = await fetchMailboxMessage(folder, messageId);
  if (expectedUidValidity && fetched.uidValidity !== expectedUidValidity) {
    throw new Error("Mailbox identity changed. Refresh the Email Center before opening this attachment.");
  }
  const parsed = parseRawMessage(fetched.raw);
  const attachment = parsed.attachments.find((item) => item.providerAttachmentId === attachmentId);
  if (!attachment) throw new Error("The requested mailbox attachment could not be found.");
  return {
    bytes: attachment.bytes,
    filename: attachment.filename || "attachment",
    mimeType: attachment.mimeType || "application/octet-stream",
    size: attachment.bytes.length,
    inline: Boolean(attachment.inline),
    contentId: attachment.contentId,
    mailboxName: fetched.mailboxName ?? (folder === "inbox" ? "INBOX" : "Sent"),
    uidValidity: fetched.uidValidity ?? "unknown"
  };
}

export async function loadGmailAttachment(
  messageId: string,
  attachmentId: string,
  folder: MailboxFolderKind = "inbox",
  expectedUidValidity?: string
) {
  return (await loadMailboxAttachment(messageId, attachmentId, folder, expectedUidValidity)).bytes;
}
