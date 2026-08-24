import { NextRequest, NextResponse } from "next/server";
import {
  CUSTOMER_PORTAL_ACCESS_COOKIE,
  CUSTOMER_PORTAL_REFRESH_COOKIE,
  customerPortalError,
  requireCustomerPortalUser
} from "@/lib/customer-portal-server";
import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const CUSTOMER_PORTAL_REMEMBER_COOKIE = "gp_customer_portal_remember";

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { email?: string };
  error_description?: string;
  message?: string;
  error?: string;
};

function noStorePortalJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function setPortalCookies(
  response: NextResponse,
  session: { accessToken: string; refreshToken?: string; expiresIn?: number },
  rememberDays = 30
) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(CUSTOMER_PORTAL_ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: Math.max(60, Number(session.expiresIn ?? 3600))
  });
  if (session.refreshToken) {
    const refreshCookie = {
      httpOnly: true,
      secure,
      sameSite: "strict" as const,
      path: "/"
    };
    if (rememberDays === 7 || rememberDays === 30) {
      response.cookies.set(CUSTOMER_PORTAL_REFRESH_COOKIE, session.refreshToken, { ...refreshCookie, maxAge: 60 * 60 * 24 * rememberDays });
      response.cookies.set(CUSTOMER_PORTAL_REMEMBER_COOKIE, String(rememberDays), { ...refreshCookie, maxAge: 60 * 60 * 24 * rememberDays });
    } else {
      response.cookies.set(CUSTOMER_PORTAL_REFRESH_COOKIE, session.refreshToken, refreshCookie);
      response.cookies.set(CUSTOMER_PORTAL_REMEMBER_COOKIE, "0", refreshCookie);
    }
  }
}

function clearPortalCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(CUSTOMER_PORTAL_ACCESS_COOKIE, "", { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 });
  response.cookies.set(CUSTOMER_PORTAL_REFRESH_COOKIE, "", { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 });
  response.cookies.set(CUSTOMER_PORTAL_REMEMBER_COOKIE, "", { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 });
}

function sessionPayload(user: { email: string; displayName: string }, expiresIn = 3600) {
  return {
    ok: true,
    session: {
      expiresAt: Date.now() + Number(expiresIn) * 1000,
      email: user.email,
      displayName: user.displayName
    }
  };
}

function forwardedWithToken(request: NextRequest, accessToken: string) {
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return new NextRequest(request.url, { headers });
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  let body: {
    email?: string;
    password?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    rememberDays?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerPortalError("Invalid secure Customer Portal session request.", 400);
  }

  let accessToken = body.accessToken;
  let refreshToken = body.refreshToken;
  let expiresIn = Number(body.expiresIn ?? 3600);
  if (body.email && body.password) {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return customerPortalError("Customer Portal authentication is not configured.", 503);
    }
    const signInResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email.trim().toLowerCase(), password: body.password }),
      cache: "no-store"
    });
    const signInPayload = (await signInResponse.json().catch(() => ({}))) as TokenPayload;
    if (!signInResponse.ok || !signInPayload.access_token || !signInPayload.refresh_token) {
      return customerPortalError(
        signInPayload.error_description ?? signInPayload.message ?? signInPayload.error ?? "Email or password is incorrect.",
        401
      );
    }
    accessToken = signInPayload.access_token;
    refreshToken = signInPayload.refresh_token;
    expiresIn = Number(signInPayload.expires_in ?? 3600);
  }

  if (!accessToken || !refreshToken) {
    return customerPortalError("A complete secure Customer Portal session is required.", 400);
  }
  const user = await requireCustomerPortalUser(forwardedWithToken(request, accessToken));
  if (user instanceof NextResponse) return user;
  const response = noStorePortalJson(sessionPayload(user, expiresIn));
  const requestedDays = Number(body.rememberDays ?? 30);
  const rememberDays = requestedDays === 30 ? 30 : requestedDays === 7 ? 7 : 0;
  setPortalCookies(response, { accessToken, refreshToken, expiresIn }, rememberDays);
  return response;
}

export async function GET(request: NextRequest) {
  let accessToken = request.cookies.get(CUSTOMER_PORTAL_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(CUSTOMER_PORTAL_REFRESH_COOKIE)?.value;
  const storedRememberDays = Number(request.cookies.get(CUSTOMER_PORTAL_REMEMBER_COOKIE)?.value ?? 0);
  const rememberDays = storedRememberDays === 30 ? 30 : storedRememberDays === 7 ? 7 : 0;
  if (accessToken) {
    const user = await requireCustomerPortalUser(request);
    if (!(user instanceof NextResponse)) return noStorePortalJson(sessionPayload(user));
  }
  if (!refreshToken || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const response = customerPortalError("Sign in to open the Customer Portal.", 401);
    clearPortalCookies(response);
    return response;
  }
  const refreshResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store"
  });
  const payload = (await refreshResponse.json().catch(() => ({}))) as TokenPayload;
  if (!refreshResponse.ok || !payload.access_token) {
    const response = customerPortalError(payload.error_description ?? payload.message ?? payload.error ?? "Your Customer Portal session expired.", 401);
    clearPortalCookies(response);
    return response;
  }
  accessToken = payload.access_token;
  const user = await requireCustomerPortalUser(forwardedWithToken(request, accessToken));
  if (user instanceof NextResponse) {
    clearPortalCookies(user);
    return user;
  }
  const response = noStorePortalJson(sessionPayload(user, payload.expires_in));
  setPortalCookies(response, {
    accessToken,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresIn: payload.expires_in
  }, rememberDays);
  return response;
}

export async function DELETE(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const accessToken = request.cookies.get(CUSTOMER_PORTAL_ACCESS_COOKIE)?.value;
  if (accessToken && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }).catch(() => undefined);
  }
  const response = noStorePortalJson({ ok: true });
  clearPortalCookies(response);
  return response;
}
