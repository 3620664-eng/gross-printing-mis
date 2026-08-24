import "server-only";

import { NextRequest, NextResponse } from "next/server";

export type StaffRole = "admin" | "front_desk" | "prepress" | "press" | "finishing";

export type StaffProfile = {
  user_id: string;
  email?: string;
  display_name?: string;
  role: StaffRole;
  is_active: boolean;
  is_owner?: boolean;
  department?: string;
  title?: string;
};

export type StaffUser = {
  id: string;
  email?: string;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: { display_name?: string; full_name?: string; name?: string };
};

export type StaffContext = {
  user: StaffUser;
  profile: StaffProfile;
  accessToken: string;
};

export const STAFF_ACCESS_COOKIE = "gp_staff_access";
export const STAFF_REFRESH_COOKIE = "gp_staff_refresh";
export const STAFF_REMEMBER_COOKIE = "gp_staff_remember";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

export function serverConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SERVICE_KEY);
}

export function safeDemoMode() {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function privilegedSupabaseHeaders(
  key: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    ...extra
  };
  // Supabase's new sb_secret_* keys are opaque API keys, not JWTs.
  // Legacy service_role keys are JWTs and may still be sent as Bearer tokens.
  if (!key.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export function serviceHeaders(extra?: Record<string, string>) {
  return privilegedSupabaseHeaders(SUPABASE_SERVICE_KEY!, extra ?? {});
}

export async function serviceFetch(path: string, init?: RequestInit) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Secure database connection is not configured.");
  const headers = new Headers(serviceHeaders());
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
}

function normalizeRole(value?: string): StaffRole | undefined {
  if (value === "admin" || value === "front_desk" || value === "prepress" || value === "press" || value === "finishing") {
    return value;
  }
  return undefined;
}

function requestAccessToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (token && token !== "server-cookie-session") return token;
  }
  return request.cookies.get(STAFF_ACCESS_COOKIE)?.value;
}

export async function validateStaffRequest(
  request: NextRequest,
  allowedRoles?: StaffRole[]
): Promise<StaffContext | NextResponse> {
  if (safeDemoMode()) {
    const profile: StaffProfile = {
      user_id: "demo-owner",
      email: "jobs@grossprinting.com",
      display_name: "Demo Owner",
      role: "admin",
      is_active: true,
      is_owner: true,
      department: "Administration",
      title: "Owner Administrator"
    };
    return { user: { id: profile.user_id, email: profile.email }, profile, accessToken: "demo" };
  }

  if (!serverConfigured()) {
    return NextResponse.json({ error: "Server security is not configured." }, { status: 503 });
  }

  const accessToken = requestAccessToken(request);
  if (!accessToken) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY!,
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  if (!userResponse.ok) {
    return NextResponse.json({ error: "Your sign-in session expired." }, { status: 401 });
  }
  const user = (await userResponse.json()) as StaffUser;
  if (!user.id) return NextResponse.json({ error: "Your sign-in session is invalid." }, { status: 401 });

  const profileResponse = await serviceFetch(
    `/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,email,display_name,role,is_active,is_owner,department,title&limit=1`
  );
  if (!profileResponse.ok) return NextResponse.json({ error: "Unable to verify staff access." }, { status: 502 });
  const rows = (await profileResponse.json()) as Array<Partial<StaffProfile>>;
  const row = rows[0];
  if (!row?.user_id) return NextResponse.json({ error: "This account is not approved for Gross Printing MIS." }, { status: 403 });

  const verifiedRole = normalizeRole(row.role);
  if (!verifiedRole) {
    return NextResponse.json({ error: "This account has an invalid server role and was denied." }, { status: 403 });
  }
  const profile: StaffProfile = {
    user_id: row.user_id,
    email: row.email ?? user.email,
    display_name: row.display_name,
    role: verifiedRole,
    is_active: row.is_active === true,
    is_owner: row.is_owner === true,
    department: row.department,
    title: row.title
  };
  if (!profile.is_active) {
    return NextResponse.json({ error: "This account is disabled or waiting for approval." }, { status: 403 });
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return NextResponse.json({ error: "You do not have permission for this action." }, { status: 403 });
  }

  return { user, profile, accessToken };
}

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function rejectCrossSiteMutation(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return noStoreJson({ error: "Cross-site request blocked." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (!origin) return undefined;
  try {
    const originUrl = new URL(origin);
    const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    if (originUrl.host !== expectedHost) {
      return noStoreJson({ error: "Cross-site request blocked." }, { status: 403 });
    }
  } catch {
    return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  return undefined;
}

export function rejectOversizedJson(request: NextRequest, maxBytes = 25 * 1024 * 1024) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maxBytes) {
    return noStoreJson({ error: "The protected request is too large." }, { status: 413 });
  }
  return undefined;
}

export function setStaffCookies(
  response: NextResponse,
  session: { accessToken: string; refreshToken?: string; expiresIn?: number },
  options: { rememberUntil?: number } = {}
) {
  const secure = process.env.NODE_ENV === "production";
  const rememberUntil = Number(options.rememberUntil ?? 0);
  const rememberSeconds = Number.isFinite(rememberUntil) && rememberUntil > Date.now()
    ? Math.max(60, Math.floor((rememberUntil - Date.now()) / 1000))
    : 0;
  response.cookies.set(STAFF_ACCESS_COOKIE, session.accessToken, {
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
    if (rememberSeconds > 0) {
      response.cookies.set(STAFF_REFRESH_COOKIE, session.refreshToken, { ...refreshCookie, maxAge: rememberSeconds });
      response.cookies.set(STAFF_REMEMBER_COOKIE, String(rememberUntil), { ...refreshCookie, maxAge: rememberSeconds });
    } else {
      // Session cookie: closes with the browser unless the browser itself restores the session.
      response.cookies.set(STAFF_REFRESH_COOKIE, session.refreshToken, refreshCookie);
      response.cookies.set(STAFF_REMEMBER_COOKIE, "", { ...refreshCookie, maxAge: 0 });
    }
  }
}

export function clearStaffCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(STAFF_ACCESS_COOKIE, "", { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 });
  response.cookies.set(STAFF_REFRESH_COOKIE, "", { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 });
  response.cookies.set(STAFF_REMEMBER_COOKIE, "", { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 });
}

export async function logSecurityEvent(
  context: StaffContext,
  action: string,
  category: string,
  details: Record<string, unknown> = {}
) {
  await serviceFetch("/rest/v1/security_audit_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      actor_user_id: context.user.id,
      actor_email: context.profile.email ?? context.user.email,
      actor_role: context.profile.role,
      action,
      category,
      details
    })
  }).catch(() => undefined);
}
