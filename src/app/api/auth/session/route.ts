import { NextRequest, NextResponse } from "next/server";
import {
  STAFF_ACCESS_COOKIE,
  STAFF_REFRESH_COOKIE,
  STAFF_REMEMBER_COOKIE,
  clearStaffCookies,
  noStoreJson,
  rejectCrossSiteMutation,
  rejectOversizedJson,
  serverConfigured,
  setStaffCookies,
  validateStaffRequest
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
  error_description?: string;
  message?: string;
  error?: string;
};

function tokenError(payload: TokenPayload, fallback: string) {
  return payload.error_description ?? payload.message ?? payload.error ?? fallback;
}

function sessionResponse(context: Awaited<ReturnType<typeof validateStaffRequest>>, expiresIn = 3600) {
  if (context instanceof NextResponse) return context;
  return noStoreJson({
    ok: true,
    session: {
      // Opaque browser sentinel: the real access/refresh tokens remain in HttpOnly cookies.
      accessToken: "server-cookie-session",
      expiresAt: Date.now() + Number(expiresIn) * 1000,
      userId: context.user.id,
      email: context.profile.email ?? context.user.email,
      displayName: context.profile.display_name ?? context.user.email,
      provider: context.user.app_metadata?.provider ?? context.user.app_metadata?.providers?.[0],
      role: context.profile.role,
      isActive: true,
      profileConfigured: true,
      isOwner: context.profile.is_owner === true
    }
  });
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  if (!serverConfigured()) return noStoreJson({ error: "Server security is not configured." }, { status: 503 });
  let body: {
    email?: string;
    password?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    rememberComputer?: boolean;
    rememberDays?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid secure-session request." }, { status: 400 });
  }

  let accessToken = body.accessToken;
  let refreshToken = body.refreshToken;
  let expiresIn = Number(body.expiresIn ?? 3600);
  if (body.email && body.password) {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return noStoreJson({ error: "Server authentication is not configured." }, { status: 503 });
    }
    const signInResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email.trim(), password: body.password }),
      cache: "no-store"
    });
    const signInPayload = (await signInResponse.json().catch(() => ({}))) as TokenPayload;
    if (!signInResponse.ok || !signInPayload.access_token || !signInPayload.refresh_token) {
      return noStoreJson({ error: tokenError(signInPayload, "Email or password is incorrect.") }, { status: 401 });
    }
    accessToken = signInPayload.access_token;
    refreshToken = signInPayload.refresh_token;
    expiresIn = Number(signInPayload.expires_in ?? 3600);
  }

  if (!accessToken || !refreshToken) {
    return noStoreJson({ error: "A complete secure session is required." }, { status: 400 });
  }

  const forwarded = new NextRequest(request.url, {
    headers: new Headers({ Authorization: `Bearer ${accessToken}` })
  });
  const context = await validateStaffRequest(forwarded);
  if (context instanceof NextResponse) return context;
  const response = sessionResponse(context, expiresIn);
  const requestedDays = Number(body.rememberDays ?? (body.rememberComputer ? 7 : 0));
  const rememberDays = requestedDays === 30 ? 30 : requestedDays === 7 ? 7 : 0;
  setStaffCookies(response, { accessToken, refreshToken, expiresIn }, {
    rememberUntil: rememberDays ? Date.now() + rememberDays * 24 * 60 * 60 * 1000 : undefined
  });
  return response;
}

export async function GET(request: NextRequest) {
  if (!serverConfigured()) return noStoreJson({ error: "Server security is not configured." }, { status: 503 });
  let accessToken = request.cookies.get(STAFF_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(STAFF_REFRESH_COOKIE)?.value;
  const rememberedUntil = Number(request.cookies.get(STAFF_REMEMBER_COOKIE)?.value ?? 0);
  const rememberUntil = Number.isFinite(rememberedUntil) && rememberedUntil > Date.now() ? rememberedUntil : undefined;
  let expiresIn = 3600;
  let refreshedToken: TokenPayload | undefined;

  if (accessToken) {
    const existing = await validateStaffRequest(request);
    if (!(existing instanceof NextResponse)) return sessionResponse(existing, expiresIn);
  }

  if (!refreshToken || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const response = noStoreJson({ error: "Sign in to continue." }, { status: 401 });
    clearStaffCookies(response);
    return response;
  }

  const refreshResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store"
  });
  refreshedToken = (await refreshResponse.json().catch(() => ({}))) as TokenPayload;
  if (!refreshResponse.ok || !refreshedToken.access_token) {
    // A remembered login is shared by every tab on this browser. At the hourly
    // access-token boundary two tabs can try to rotate the same refresh token at
    // once. Never let the losing request erase the good persistent cookies from
    // the winning request; the client retries once after the cookie settles.
    if (rememberUntil) {
      return noStoreJson({
        error: "Secure session refresh is being synchronized across open tabs.",
        retryable: true
      }, { status: 401 });
    }
    const response = noStoreJson({ error: tokenError(refreshedToken, "Your session expired. Sign in again.") }, { status: 401 });
    clearStaffCookies(response);
    return response;
  }

  accessToken = refreshedToken.access_token;
  expiresIn = Number(refreshedToken.expires_in ?? 3600);
  const forwarded = new NextRequest(request.url, {
    headers: new Headers({ Authorization: `Bearer ${accessToken}` })
  });
  const context = await validateStaffRequest(forwarded);
  if (context instanceof NextResponse) {
    clearStaffCookies(context);
    return context;
  }
  const response = sessionResponse(context, expiresIn);
  setStaffCookies(response, {
    accessToken,
    refreshToken: refreshedToken.refresh_token ?? refreshToken,
    expiresIn
  }, { rememberUntil });
  return response;
}

export async function DELETE(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const accessToken = request.cookies.get(STAFF_ACCESS_COOKIE)?.value;
  if (accessToken && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }).catch(() => undefined);
  }
  const response = noStoreJson({ ok: true });
  clearStaffCookies(response);
  return response;
}
