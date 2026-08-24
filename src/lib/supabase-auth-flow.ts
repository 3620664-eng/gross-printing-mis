export type SupabaseEmailLinkType = "invite" | "recovery" | "signup" | "email" | "magiclink";

export type SupabaseLinkSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  setupMode?: "invite" | "recovery";
};

type SupabaseTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { email?: string };
  error_description?: string;
  message?: string;
  msg?: string;
  error?: string;
};

function configured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return { url, key };
}

function readableError(payload: SupabaseTokenResponse, fallback: string) {
  return payload.error_description ?? payload.message ?? payload.msg ?? payload.error ?? fallback;
}

function setupModeForType(type?: string | null): SupabaseLinkSession["setupMode"] {
  return type === "invite" ? "invite" : type === "recovery" ? "recovery" : undefined;
}

export function createLinkSession(payload: SupabaseTokenResponse, type?: string | null): SupabaseLinkSession | null {
  if (!payload.access_token) return null;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
    email: payload.user?.email,
    setupMode: setupModeForType(type)
  };
}

export async function readSupabaseEmailLinkFromBrowser(): Promise<{
  session: SupabaseLinkSession | null;
  error?: string;
  hadAuthLink: boolean;
}> {
  if (typeof window === "undefined") return { session: null, hadAuthLink: false };
  const { url, key } = configured();
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get("type") ?? query.get("type");
  const directError =
    hash.get("error_description") ??
    query.get("error_description") ??
    hash.get("error") ??
    query.get("error");
  const accessToken = hash.get("access_token") ?? query.get("access_token");
  if (accessToken) {
    const payload: SupabaseTokenResponse = {
      access_token: accessToken,
      refresh_token: hash.get("refresh_token") ?? query.get("refresh_token") ?? undefined,
      expires_in: Number(hash.get("expires_in") ?? query.get("expires_in") ?? 3600)
    };
    return { session: createLinkSession(payload, type), hadAuthLink: true };
  }

  const tokenHash = query.get("token_hash") ?? hash.get("token_hash");
  if (tokenHash && type) {
    if (!url || !key) {
      return {
        session: null,
        hadAuthLink: true,
        error: "The secure database connection is not configured."
      };
    }
    try {
      const response = await fetch(`${url}/auth/v1/verify`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type })
      });
      const payload = (await response.json().catch(() => ({}))) as SupabaseTokenResponse;
      if (!response.ok) {
        return {
          session: null,
          hadAuthLink: true,
          error: readableError(payload, "This account link is invalid or expired.")
        };
      }
      return { session: createLinkSession(payload, type), hadAuthLink: true };
    } catch {
      return {
        session: null,
        hadAuthLink: true,
        error: "The account link could not be verified. Check the connection and try again."
      };
    }
  }

  if (query.get("code")) {
    return {
      session: null,
      hadAuthLink: true,
      error: "This link could not be completed. Request a new password or invitation email."
    };
  }

  return {
    session: null,
    hadAuthLink: Boolean(directError),
    error: directError ? decodeURIComponent(directError.replace(/\+/g, " ")) : undefined
  };
}

export async function sendSupabasePasswordReset(email: string, redirectTo: string) {
  const redirectPath = new URL(redirectTo, typeof window !== "undefined" ? window.location.origin : "http://localhost").pathname;
  const response = await fetch("/api/auth/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), redirectPath })
  });
  const payload = (await response.json().catch(() => ({}))) as SupabaseTokenResponse;
  if (!response.ok) throw new Error(readableError(payload, "Could not send the password reset email."));
}

export async function updateSupabasePassword(accessToken: string, password: string) {
  const { url, key } = configured();
  if (!url || !key) throw new Error("The secure database connection is not configured.");
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });
  const payload = (await response.json().catch(() => ({}))) as SupabaseTokenResponse;
  if (!response.ok) throw new Error(readableError(payload, "Could not save the new password."));
}

export function clearAuthLinkFromAddressBar(pathname?: string) {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", pathname ?? window.location.pathname);
}

export function passwordChecks(password: string) {
  return {
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password)
  };
}
