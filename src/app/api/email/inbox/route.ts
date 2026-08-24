import { NextRequest, NextResponse } from "next/server";
import {
  emailMailbox,
  emailServerConfigured,
  errorResponse,
  loadMailboxThreads,
  requireActiveAppUser,
  type MailboxFolderKind
} from "@/lib/gmail-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActiveAppUser(request, ["admin", "front_desk"]);
  if (auth instanceof NextResponse) return auth;
  if (!emailServerConfigured()) {
    return NextResponse.json({
      configured: false,
      mailbox: emailMailbox(),
      folder: "inbox",
      threads: [],
      hasMore: false,
      message: "The Gross Printing mailbox variables are not configured."
    });
  }
  try {
    const url = new URL(request.url);
    const maxResults = Number(url.searchParams.get("maxResults") ?? 15);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const requestedFolder = url.searchParams.get("folder")?.toLowerCase();
    const folder: MailboxFolderKind = requestedFolder === "sent" ? "sent" : "inbox";
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 240);
    const page = await loadMailboxThreads(folder, maxResults, offset, query);
    return NextResponse.json({
      configured: true,
      mailbox: emailMailbox(),
      folder,
      threads: page.threads,
      hasMore: page.hasMore,
      total: page.total,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to synchronize the mailbox.", 502);
  }
}
