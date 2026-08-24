import { NextRequest, NextResponse } from "next/server";
import { allowPublicPortalSignup } from "@/lib/public-intake-security";
import { evaluateEmailSafety, loadEmailSafetySettings } from "@/lib/email-safety-server";
import { rejectCrossSiteMutation, rejectOversizedJson, serviceFetch } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type SignupPayload = {
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  password?: string;
  website?: string;
};

type AuthSignupResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
  error?: string;
  message?: string;
  msg?: string;
  error_description?: string;
};

function noStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function readableError(payload: AuthSignupResponse, fallback: string) {
  return payload.error_description ?? payload.message ?? payload.msg ?? payload.error ?? fallback;
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 32 * 1024);
  if (oversized) return oversized;

  let body: SignupPayload;
  try {
    body = (await request.json()) as SignupPayload;
  } catch {
    return noStore({ error: "Invalid account signup request." }, { status: 400 });
  }

  // Honeypot. Real users never see this field.
  if (clean(body.website, 200)) {
    return noStore({ ok: true, requiresEmailConfirmation: true }, { status: 201 });
  }

  const companyName = clean(body.companyName, 160);
  const contactName = clean(body.contactName, 160);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 80);
  const password = String(body.password ?? "");

  if (!companyName || !contactName || !/^\S+@\S+\.\S+$/.test(email)) {
    return noStore({ error: "Enter your business name, contact name, and a valid email address." }, { status: 400 });
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return noStore({ error: "Use at least 8 characters with a letter and a number." }, { status: 400 });
  }
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return noStore({ error: "Customer Portal signup is not configured on the server." }, { status: 503 });
  }

  const rate = await allowPublicPortalSignup(request);
  if (rate.setupError) {
    return noStore({ error: "Customer signup security is not configured yet." }, { status: 503 });
  }
  if (!rate.ok) {
    return noStore({ error: "Too many account attempts were submitted from this device. Please wait and try again." }, { status: 429 });
  }

  // Supabase signup may emit a customer confirmation/invitation email. During Shadow/Test
  // testing, block the signup before Auth can contact a real customer. Auth-link emails cannot
  // be safely redirected because the secure link belongs to the original account identity.
  const emailSafety = evaluateEmailSafety(await loadEmailSafetySettings(), [email]);
  if (emailSafety.action !== "send") {
    return noStore(
      { error: `${emailSafety.mode === "shadow" ? "Shadow Mode" : "Test Mode"} is blocking Customer Portal signup email for this address while Gross Printing is testing customer email.` },
      { status: 503 }
    );
  }

  // Never let a second auth identity silently claim an email already mapped to a portal account.
  const existingPortalResponse = await serviceFetch(
    `/rest/v1/customer_portal_accounts?email=ilike.${encodeURIComponent(email)}&select=user_id&limit=1`
  );
  if (existingPortalResponse.ok) {
    const existing = (await existingPortalResponse.json()) as Array<{ user_id?: string }>;
    if (existing.length) {
      return noStore(
        { error: "A Customer Portal account already exists for this email. Sign in or use Forgot password." },
        { status: 409 }
      );
    }
  }

  const customerId = `cust-${crypto.randomUUID()}`;
  const redirectTo = `${request.nextUrl.origin}/portal/set-password`;
  const signupResponse = await fetch(`${SUPABASE_URL}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      data: {
        customer_portal: "true",
        customer_portal_self_signup: "true",
        customer_id: customerId,
        company_name: companyName,
        contact_name: contactName,
        phone,
        display_name: contactName
      }
    }),
    cache: "no-store"
  });

  const payload = (await signupResponse.json().catch(() => ({}))) as AuthSignupResponse;
  if (!signupResponse.ok) {
    const message = readableError(payload, "Unable to create the Customer Portal account.");
    const existing = /already|registered|exists/i.test(message);
    return noStore(
      { error: existing ? "An account may already exist for this email. Try signing in or use Forgot password." : message },
      { status: existing ? 409 : signupResponse.status || 400 }
    );
  }

  // If email confirmation is disabled, Supabase can return a session immediately.
  if (payload.access_token && payload.refresh_token) {
    return noStore({
      ok: true,
      requiresEmailConfirmation: false,
      session: {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
        email,
        displayName: contactName
      }
    }, { status: 201 });
  }

  return noStore({
    ok: true,
    requiresEmailConfirmation: true,
    message: "Check your email and confirm your address to finish opening the Customer Portal account."
  }, { status: 201 });
}
