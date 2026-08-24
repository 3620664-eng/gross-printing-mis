import "server-only";

import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { serviceFetch } from "@/lib/server-auth";

function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "unknown";
}

function fingerprint(request: NextRequest, purpose: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Server security is not configured.");
  const raw = [purpose, clientAddress(request), request.headers.get("user-agent") ?? "unknown"].join("|");
  return createHmac("sha256", secret).update(raw).digest("hex");
}

export async function allowPublicQuoteSubmission(request: NextRequest) {
  const key = fingerprint(request, "public-quote-submit-v1");
  const response = await serviceFetch("/rest/v1/rpc/check_public_quote_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_key: key, p_window_seconds: 900, p_limit: 5 })
  });
  if (!response.ok) {
    return { ok: false as const, setupError: true as const };
  }
  const result = await response.json();
  const allowed = Array.isArray(result) ? Boolean(result[0]) : Boolean(result);
  return { ok: allowed as boolean, setupError: false as const };
}

export async function allowPublicPortalSignup(request: NextRequest) {
  const key = fingerprint(request, "customer-portal-self-signup-v1");
  const response = await serviceFetch("/rest/v1/rpc/check_public_quote_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_key: key, p_window_seconds: 3600, p_limit: 5 })
  });
  if (!response.ok) {
    return { ok: false as const, setupError: true as const };
  }
  const result = await response.json();
  const allowed = Array.isArray(result) ? Boolean(result[0]) : Boolean(result);
  return { ok: allowed as boolean, setupError: false as const };
}
