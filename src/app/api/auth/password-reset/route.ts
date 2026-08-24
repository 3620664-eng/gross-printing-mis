import { NextRequest } from "next/server";
import { noStoreJson, rejectCrossSiteMutation, rejectOversizedJson, serviceFetch } from "@/lib/server-auth";
import { evaluateEmailSafety, loadEmailSafetySettings } from "@/lib/email-safety-server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ALLOWED_RESET_PATHS = new Set(["/reset-password", "/portal/reset-password", "auto"]);

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 32 * 1024);
  if (oversized) return oversized;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return noStoreJson({ error: "Password reset is not configured." }, { status: 503 });
  }

  let body: { email?: string; redirectPath?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid password-reset request." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const requestedRedirectPath = String(body.redirectPath ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || !ALLOWED_RESET_PATHS.has(requestedRedirectPath)) {
    return noStoreJson({ error: "Enter a valid email address." }, { status: 400 });
  }

  let redirectPath = requestedRedirectPath;
  if (requestedRedirectPath === "auto") {
    // Shared sign-in password recovery: choose the correct setup page server-side
    // without exposing whether the email belongs to staff or a customer.
    try {
      const staffResponse = await serviceFetch(`/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=user_id&limit=1`);
      const staffRows = staffResponse.ok ? ((await staffResponse.json().catch(() => [])) as Array<{ user_id?: string }>) : [];
      if (staffRows[0]?.user_id) {
        redirectPath = "/reset-password";
      } else {
        const portalResponse = await serviceFetch(`/rest/v1/customer_portal_accounts?email=ilike.${encodeURIComponent(email)}&select=user_id&limit=1`);
        const portalRows = portalResponse.ok ? ((await portalResponse.json().catch(() => [])) as Array<{ user_id?: string }>) : [];
        redirectPath = portalRows[0]?.user_id ? "/portal/reset-password" : "/reset-password";
      }
    } catch {
      redirectPath = "/reset-password";
    }
  }

  if (redirectPath === "/portal/reset-password") {
    const emailSafety = evaluateEmailSafety(await loadEmailSafetySettings(), [email]);
    if (emailSafety.action !== "send") {
      // This is mode-wide, not account-specific, so it does not reveal whether the address exists.
      return noStoreJson(
        { error: "Customer Portal email is temporarily disabled while Gross Printing is testing customer email.", blockedByEmailSafety: true, safetyMode: emailSafety.mode },
        { status: 503 }
      );
    }
  }

  const redirectTo = `${request.nextUrl.origin}${redirectPath}`;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store"
      }
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error_description?: string;
      message?: string;
      msg?: string;
      error?: string;
    };
    if (!response.ok) {
      return noStoreJson(
        { error: payload.error_description ?? payload.message ?? payload.msg ?? payload.error ?? "Could not send the password reset email." },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
      );
    }
    // Do not reveal whether an email is registered.
    return noStoreJson({ ok: true });
  } catch {
    return noStoreJson({ error: "Could not reach the password reset service." }, { status: 502 });
  }
}
