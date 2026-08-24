import { NextRequest, NextResponse } from "next/server";
import { privilegedSupabaseHeaders, rejectCrossSiteMutation, rejectOversizedJson, validateStaffRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type AppRole = "admin" | "front_desk" | "prepress" | "press" | "finishing";

type AuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  invited_at?: string;
  confirmation_sent_at?: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
  banned_until?: string;
  user_metadata?: {
    display_name?: string;
    full_name?: string;
    name?: string;
  };
};

type ProfileRow = {
  user_id: string;
  email?: string;
  display_name?: string;
  role?: AppRole;
  is_active?: boolean;
  is_owner?: boolean;
  title?: string;
  department?: string;
  last_activity_at?: string;
  created_at?: string;
  updated_at?: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  email?: string;
  started_at?: string;
  last_seen_at?: string;
  signed_out_at?: string;
  revoked_at?: string;
  current_view?: string;
  device_label?: string;
  browser_label?: string;
  ip_address?: string;
};

type PortalPresenceRow = {
  user_id: string;
  customer_id: string;
  email?: string;
  display_name?: string;
  is_active?: boolean;
  last_sign_in_at?: string;
};

type ActivityRow = {
  id: number;
  user_id?: string;
  actor_email?: string;
  action: string;
  category: string;
  target_user_id?: string;
  target_email?: string;
  details?: Record<string, unknown>;
  created_at: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const OWNER_EMAIL = (process.env.GROSS_PRINTING_OWNER_EMAIL ?? "jobs@grossprinting.com").trim().toLowerCase();
const VALID_ROLES = new Set<AppRole>(["admin", "front_desk", "prepress", "press", "finishing"]);

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function serverConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SERVICE_KEY);
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string; msg?: string; error?: string; error_description?: string };
    return payload.message ?? payload.msg ?? payload.error_description ?? payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

function serviceHeaders(extra?: Record<string, string>) {
  return privilegedSupabaseHeaders(SUPABASE_SERVICE_KEY!, extra ?? {});
}

async function serviceFetch(path: string, init?: RequestInit) {
  const headers = new Headers(serviceHeaders());
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
}

async function requireActiveAdmin(request: NextRequest): Promise<{ user: AuthUser; profile: ProfileRow } | NextResponse> {
  if (!serverConfigured()) return errorResponse("Owner Admin is not configured on the server.", 503);
  const context = await validateStaffRequest(request, ["admin"]);
  if (context instanceof NextResponse) return context;
  return {
    user: context.user as AuthUser,
    profile: context.profile as ProfileRow
  };
}

async function fetchProfiles() {
  const response = await serviceFetch(
    "/rest/v1/profiles?select=user_id,email,display_name,role,is_active,is_owner,title,department,last_activity_at,created_at,updated_at&order=created_at.asc"
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to read staff profiles."));
  return (await response.json()) as ProfileRow[];
}

async function fetchSessions() {
  const response = await serviceFetch(
    "/rest/v1/app_sessions?select=id,user_id,email,started_at,last_seen_at,signed_out_at,revoked_at,current_view,device_label,browser_label,ip_address&order=last_seen_at.desc&limit=300"
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to read staff sessions."));
  return (await response.json()) as SessionRow[];
}

async function fetchPortalPresence() {
  const response = await serviceFetch(
    "/rest/v1/customer_portal_accounts?select=user_id,customer_id,email,display_name,is_active,last_sign_in_at&is_active=eq.true&last_sign_in_at=not.is.null&order=last_sign_in_at.desc&limit=300"
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to read customer portal presence."));
  return (await response.json()) as PortalPresenceRow[];
}

async function fetchActivity() {
  const response = await serviceFetch(
    "/rest/v1/activity_logs?select=id,user_id,actor_email,action,category,target_user_id,target_email,details,created_at&order=created_at.desc&limit=200"
  );
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to read activity history."));
  return (await response.json()) as ActivityRow[];
}

async function logActivity(input: {
  actor: AuthUser;
  action: string;
  category?: string;
  targetUserId?: string;
  targetEmail?: string;
  details?: Record<string, unknown>;
}) {
  await serviceFetch("/rest/v1/activity_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: input.actor.id,
      actor_email: input.actor.email,
      action: input.action,
      category: input.category ?? "admin",
      target_user_id: input.targetUserId,
      target_email: input.targetEmail,
      details: input.details ?? {}
    })
  }).catch(() => undefined);
}

function isOnline(session: SessionRow) {
  if (session.signed_out_at || session.revoked_at || !session.last_seen_at) return false;
  return Date.now() - new Date(session.last_seen_at).getTime() < 2 * 60 * 1000;
}

function isPortalOnline(account: PortalPresenceRow) {
  if (!account.is_active || !account.last_sign_in_at) return false;
  const lastSeen = new Date(account.last_sign_in_at).getTime();
  return Number.isFinite(lastSeen) && Date.now() - lastSeen < 2 * 60 * 1000;
}

export async function GET(request: NextRequest) {
  const auth = await requireActiveAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const [usersResponse, profiles, sessions, activity, portalAccounts] = await Promise.all([
      serviceFetch("/auth/v1/admin/users?page=1&per_page=200"),
      fetchProfiles(),
      fetchSessions(),
      fetchActivity(),
      fetchPortalPresence()
    ]);
    if (!usersResponse.ok) return errorResponse(await responseMessage(usersResponse, "Unable to load staff accounts."), 502);
    const payload = (await usersResponse.json()) as { users?: AuthUser[] } | AuthUser[];
    const authUsers = Array.isArray(payload) ? payload : payload.users ?? [];
    const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const sessionsByUser = new Map<string, SessionRow[]>();
    for (const session of sessions) {
      const list = sessionsByUser.get(session.user_id) ?? [];
      list.push(session);
      sessionsByUser.set(session.user_id, list);
    }

    const users = authUsers.map((user) => {
      const profile = profileMap.get(user.id);
      const userSessions = sessionsByUser.get(user.id) ?? [];
      const latestSession = userSessions[0];
      const owner = profile?.is_owner === true || user.email?.toLowerCase() === OWNER_EMAIL;
      return {
        userId: user.id,
        email: profile?.email ?? user.email ?? "",
        displayName:
          profile?.display_name ??
          user.user_metadata?.display_name ??
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email?.split("@")[0] ??
          "Staff user",
        role: owner ? "admin" : profile?.role ?? "front_desk",
        isActive: owner ? true : profile?.is_active ?? false,
        isOwner: owner,
        title: profile?.title ?? (owner ? "Owner Administrator" : ""),
        department: profile?.department ?? (owner ? "Administration" : ""),
        createdAt: profile?.created_at ?? user.created_at,
        invitedAt: user.invited_at ?? user.confirmation_sent_at,
        emailConfirmedAt: user.email_confirmed_at,
        lastSignInAt: user.last_sign_in_at,
        lastActivityAt: profile?.last_activity_at ?? latestSession?.last_seen_at,
        isCurrentUser: user.id === auth.user.id,
        isOnline: userSessions.some(isOnline),
        activeSessionCount: userSessions.filter(isOnline).length,
        currentView: userSessions.find(isOnline)?.current_view ?? latestSession?.current_view,
        deviceLabel: userSessions.find(isOnline)?.device_label ?? latestSession?.device_label,
        browserLabel: userSessions.find(isOnline)?.browser_label ?? latestSession?.browser_label
      };
    });

    const portalPresence = portalAccounts.filter(isPortalOnline).map((account) => ({
      userId: account.user_id,
      customerId: account.customer_id,
      email: account.email ?? "",
      displayName: account.display_name ?? account.email?.split("@")[0] ?? "Customer",
      lastSeenAt: account.last_sign_in_at,
      currentView: "Customer Portal"
    }));

    return NextResponse.json({
      ownerEmail: OWNER_EMAIL,
      users,
      sessions: sessions.map((session) => ({ ...session, isOnline: isOnline(session) })),
      portalPresence,
      activity,
      summary: {
        totalUsers: users.length,
        activeUsers: users.filter((user) => user.isActive).length,
        onlineUsers: users.filter((user) => user.isOnline).length + portalPresence.length,
        onlineStaffUsers: users.filter((user) => user.isOnline).length,
        onlineCustomers: portalPresence.length,
        pendingUsers: users.filter((user) => !user.emailConfirmedAt).length,
        blockedUsers: users.filter((user) => !user.isActive).length
      }
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to load Owner Admin.", 500);
  }
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 256 * 1024);
  if (oversized) return oversized;
  const auth = await requireActiveAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: {
    action?: "invite" | "send_access_email" | "sign_out_sessions";
    userId?: string;
    email?: string;
    displayName?: string;
    role?: AppRole;
    isActive?: boolean;
    title?: string;
    department?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid Owner Admin request.");
  }

  const action = body.action ?? "invite";
  try {
    if (action === "sign_out_sessions") {
      const userId = body.userId?.trim();
      if (!userId) return errorResponse("A user ID is required.");
      if (userId === auth.user.id) return errorResponse("Use the normal Sign Out button for your own session.");
      const targetProfiles = await serviceFetch(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=email,is_owner&limit=1`);
      const target = ((await targetProfiles.json()) as ProfileRow[])[0];
      if (target?.is_owner) return errorResponse("The permanent owner sessions cannot be revoked from another account.", 403);
      const response = await serviceFetch(`/rest/v1/app_sessions?user_id=eq.${encodeURIComponent(userId)}&signed_out_at=is.null&revoked_at=is.null`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ revoked_at: new Date().toISOString() })
      });
      if (!response.ok) return errorResponse(await responseMessage(response, "Unable to sign out this user."), 502);
      await logActivity({ actor: auth.user, action: "Signed out all staff sessions", targetUserId: userId, targetEmail: target?.email });
      return NextResponse.json({ message: "All active sessions were signed out." });
    }

    if (action === "send_access_email") {
      const email = body.email?.trim().toLowerCase() ?? "";
      if (!/^\S+@\S+\.\S+$/.test(email)) return errorResponse("Enter a valid email address.");
      const redirectTo = `${request.nextUrl.origin}/reset-password`;
      const response = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store"
      });
      if (!response.ok) return errorResponse(await responseMessage(response, "Unable to send the access email."), response.status);
      await logActivity({ actor: auth.user, action: "Sent password/setup email", targetEmail: email });
      return NextResponse.json({ message: `A secure setup/reset email was sent to ${email}.` });
    }

    const email = body.email?.trim().toLowerCase() ?? "";
    const displayName = body.displayName?.trim() ?? "";
    const role = body.role ?? "front_desk";
    const isActive = body.isActive !== false;
    if (!/^\S+@\S+\.\S+$/.test(email)) return errorResponse("Enter a valid email address.");
    if (!VALID_ROLES.has(role)) return errorResponse("Select a valid role.");
    if (email === OWNER_EMAIL) return errorResponse("The permanent owner account must be created by signing in with the owner email.");

    const redirectTo = `${request.nextUrl.origin}/set-password`;
    const inviteResponse = await serviceFetch(`/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      body: JSON.stringify({
        email,
        data: displayName ? { display_name: displayName, full_name: displayName } : undefined
      })
    });
    if (!inviteResponse.ok) return errorResponse(await responseMessage(inviteResponse, "Unable to send invitation."), inviteResponse.status);
    const invitedUser = (await inviteResponse.json()) as AuthUser;
    if (!invitedUser.id) return errorResponse("Supabase did not return the invited user.", 502);

    const profileResponse = await serviceFetch("/rest/v1/profiles?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: invitedUser.id,
        email,
        display_name: displayName || email.split("@")[0],
        role,
        is_active: isActive,
        is_owner: false,
        title: body.title?.trim() || null,
        department: body.department?.trim() || null
      })
    });
    if (!profileResponse.ok) return errorResponse(await responseMessage(profileResponse, "Invitation sent, but the profile could not be saved."), 502);
    await logActivity({ actor: auth.user, action: "Invited staff member", targetUserId: invitedUser.id, targetEmail: email, details: { role } });
    return NextResponse.json({ message: `Invitation sent to ${email}.`, userId: invitedUser.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to complete the Owner Admin action.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 256 * 1024);
  if (oversized) return oversized;
  const auth = await requireActiveAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: {
    userId?: string;
    displayName?: string;
    role?: AppRole;
    isActive?: boolean;
    title?: string;
    department?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid user update.");
  }

  const userId = body.userId?.trim() ?? "";
  if (!userId) return errorResponse("A user ID is required.");
  if (body.role && !VALID_ROLES.has(body.role)) return errorResponse("Select a valid role.");

  try {
    const currentResponse = await serviceFetch(
      `/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email,display_name,role,is_active,is_owner,title,department&limit=1`
    );
    const current = ((await currentResponse.json()) as ProfileRow[])[0];
    if (!current) return errorResponse("The staff profile was not found.", 404);
    const owner = current.is_owner === true || current.email?.toLowerCase() === OWNER_EMAIL;
    if (owner && (body.isActive === false || (body.role && body.role !== "admin"))) {
      return errorResponse("The permanent Owner Administrator cannot be blocked or demoted.", 403);
    }
    if (userId === auth.user.id && (body.isActive === false || (body.role && body.role !== "admin"))) {
      return errorResponse("You cannot deactivate or remove your own administrator access.");
    }

    const changes: Record<string, string | boolean | null> = {};
    if (typeof body.displayName === "string") changes.display_name = body.displayName.trim();
    if (body.role) changes.role = owner ? "admin" : body.role;
    if (typeof body.isActive === "boolean") changes.is_active = owner ? true : body.isActive;
    if (typeof body.title === "string") changes.title = body.title.trim() || null;
    if (typeof body.department === "string") changes.department = body.department.trim() || null;
    if (!Object.keys(changes).length) return errorResponse("No changes were supplied.");

    const profileResponse = await serviceFetch(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(changes)
    });
    if (!profileResponse.ok) return errorResponse(await responseMessage(profileResponse, "Unable to update this user."), 502);
    const rows = (await profileResponse.json()) as ProfileRow[];
    if (!rows.length) return errorResponse("The user profile was not found.", 404);
    await logActivity({
      actor: auth.user,
      action: "Updated staff access",
      targetUserId: userId,
      targetEmail: current.email,
      details: { role: changes.role ?? current.role, isActive: changes.is_active ?? current.is_active }
    });
    return NextResponse.json({ message: owner ? "Owner profile updated. Owner access remains protected." : "Staff access updated." });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to update this user.", 500);
  }
}
