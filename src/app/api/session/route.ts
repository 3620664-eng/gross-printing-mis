import { NextRequest, NextResponse } from "next/server";
import {
  noStoreJson,
  rejectCrossSiteMutation,
  rejectOversizedJson,
  serviceFetch,
  validateStaffRequest
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type SessionRow = { id: string; user_id?: string; revoked_at?: string; signed_out_at?: string };

function browserLabel(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return "Google Chrome";
  if (/Firefox\//i.test(userAgent)) return "Mozilla Firefox";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  return "Browser";
}

function deviceLabel(userAgent: string) {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? "Android phone" : "Android tablet";
  if (/Windows/i.test(userAgent)) return "Windows computer";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac computer";
  if (/Linux/i.test(userAgent)) return "Linux computer";
  return "Unknown device";
}

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
}

async function logActivity(user: { id: string; email?: string }, action: string, details: Record<string, unknown> = {}) {
  await serviceFetch("/rest/v1/activity_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: user.id,
      actor_email: user.email,
      action,
      category: "session",
      details
    })
  }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  const auth = await validateStaffRequest(request);
  if (auth instanceof NextResponse) return auth;

  let body: { sessionId?: string; currentView?: string; event?: "heartbeat" | "sign_in" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid session update." }, { status: 400 });
  }
  const sessionId = body.sessionId?.trim();
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return noStoreJson({ error: "A valid session ID is required." }, { status: 400 });
  }

  const existingResponse = await serviceFetch(
    `/rest/v1/app_sessions?id=eq.${encodeURIComponent(sessionId)}&select=id,user_id,revoked_at,signed_out_at&limit=1`
  );
  if (!existingResponse.ok) return noStoreJson({ error: "Unable to verify this login session." }, { status: 502 });
  const existing = ((await existingResponse.json()) as SessionRow[])[0];
  if (existing?.user_id && existing.user_id !== auth.user.id) {
    return noStoreJson({ error: "That login session belongs to another user." }, { status: 403 });
  }
  if (existing?.revoked_at) return noStoreJson({ error: "This session was signed out by an administrator." }, { status: 401 });

  const userAgent = request.headers.get("user-agent") ?? "";
  const now = new Date().toISOString();
  const response = await serviceFetch("/rest/v1/app_sessions?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: sessionId,
      user_id: auth.user.id,
      email: auth.profile.email ?? auth.user.email,
      started_at: existing ? undefined : now,
      last_seen_at: now,
      signed_out_at: null,
      current_view: body.currentView?.slice(0, 80) ?? "Dashboard",
      user_agent: userAgent.slice(0, 1000),
      device_label: deviceLabel(userAgent),
      browser_label: browserLabel(userAgent),
      ip_address: requestIp(request)
    })
  });
  if (!response.ok) return noStoreJson({ error: "Unable to update this login session." }, { status: 502 });

  await serviceFetch(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(auth.user.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_activity_at: now })
  }).catch(() => undefined);

  if (!existing || body.event === "sign_in") {
    await logActivity(auth.user, "Signed in", {
      device: deviceLabel(userAgent),
      browser: browserLabel(userAgent),
      currentView: body.currentView ?? "Dashboard"
    });
  }

  return noStoreJson({
    ok: true,
    role: auth.profile.role,
    isOwner: auth.profile.is_owner === true,
    displayName: auth.profile.display_name,
    lastSeenAt: now
  });
}

export async function DELETE(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  const auth = await validateStaffRequest(request);
  if (auth instanceof NextResponse) return auth;
  let body: { sessionId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid sign-out request." }, { status: 400 });
  }
  const sessionId = body.sessionId?.trim();
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return noStoreJson({ error: "A valid session ID is required." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const response = await serviceFetch(
    `/rest/v1/app_sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(auth.user.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ signed_out_at: now, last_seen_at: now })
    }
  );
  if (!response.ok) return noStoreJson({ error: "Unable to close this login session." }, { status: 502 });
  await logActivity(auth.user, "Signed out");
  return noStoreJson({ ok: true });
}
