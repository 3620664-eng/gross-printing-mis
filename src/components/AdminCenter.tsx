"use client";

import {
  Activity,
  Ban,
  CheckCircle2,
  Clock3,
  KeyRound,
  Laptop,
  MailPlus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  Wifi,
  WifiOff
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ManagedRole = "admin" | "front_desk" | "prepress" | "press" | "finishing";
type AdminTab = "overview" | "users" | "sessions" | "activity";

interface ManagedUser {
  userId: string;
  email: string;
  displayName: string;
  role: ManagedRole;
  isActive: boolean;
  isOwner: boolean;
  title?: string;
  department?: string;
  createdAt?: string;
  invitedAt?: string;
  emailConfirmedAt?: string;
  lastSignInAt?: string;
  lastActivityAt?: string;
  isCurrentUser?: boolean;
  isOnline?: boolean;
  activeSessionCount?: number;
  currentView?: string;
  deviceLabel?: string;
  browserLabel?: string;
}

interface PortalPresence {
  userId: string;
  customerId: string;
  email: string;
  displayName: string;
  lastSeenAt?: string;
  currentView?: string;
}

interface ManagedSession {
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
  isOnline?: boolean;
}

interface ActivityItem {
  id: number;
  user_id?: string;
  actor_email?: string;
  action: string;
  category: string;
  target_user_id?: string;
  target_email?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

interface AdminSummary {
  totalUsers: number;
  activeUsers: number;
  onlineUsers: number;
  onlineStaffUsers?: number;
  onlineCustomers?: number;
  pendingUsers: number;
  blockedUsers: number;
}

interface AdminPayload {
  ownerEmail?: string;
  users?: ManagedUser[];
  sessions?: ManagedSession[];
  portalPresence?: PortalPresence[];
  activity?: ActivityItem[];
  summary?: AdminSummary;
  error?: string;
}

interface AdminCenterProps {
  authToken?: string;
  authEnabled: boolean;
  currentUserId?: string;
  currentUserEmail?: string;
}

const roleOptions: Array<{ value: ManagedRole; label: string; description: string }> = [
  { value: "admin", label: "Administrator", description: "Full backend, customers, pricing, users, and settings" },
  { value: "front_desk", label: "Office / Estimator", description: "Workflow, new quotes, and quote records" },
  { value: "prepress", label: "Prepress Worker", description: "Workflow, job files, notes, and production movement" },
  { value: "press", label: "Press Worker", description: "Workflow, job instructions, notes, and production movement" },
  { value: "finishing", label: "Finishing Worker", description: "Workflow, finishing notes, and production movement" }
];

function roleLabel(role: ManagedRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

function dateTime(value?: string) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function relativeTime(value?: string) {
  if (!value) return "Never";
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return "Unknown";
  const minutes = Math.max(0, Math.round(milliseconds / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function activityDetails(item: ActivityItem) {
  const target = item.target_email ? ` · ${item.target_email}` : "";
  const device = typeof item.details?.device === "string" ? ` · ${item.details.device}` : "";
  return `${item.actor_email ?? "System"}${target}${device}`;
}

export function AdminCenter({ authToken, authEnabled, currentUserId, currentUserEmail }: AdminCenterProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [portalPresence, setPortalPresence] = useState<PortalPresence[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [summary, setSummary] = useState<AdminSummary>({ totalUsers: 0, activeUsers: 0, onlineUsers: 0, pendingUsers: 0, blockedUsers: 0 });
  const [ownerEmail, setOwnerEmail] = useState("jobs@grossprinting.com");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState<string>();
  const [actionUserId, setActionUserId] = useState<string>();
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTitle, setInviteTitle] = useState("");
  const [inviteDepartment, setInviteDepartment] = useState("");
  const [inviteRole, setInviteRole] = useState<ManagedRole>("front_desk");

  const onlineSessions = useMemo(() => sessions.filter((session) => session.isOnline), [sessions]);
  const recentSessions = useMemo(() => sessions.filter((session) => !session.isOnline).slice(0, 40), [sessions]);

  async function loadAdmin(quiet = false) {
    if (!authEnabled || !authToken) return;
    if (!quiet) {
      setLoading(true);
      setMessage("");
    }
    try {
      const response = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: "no-store"
      });
      const payload = (await response.json()) as AdminPayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load Owner Admin.");
      setUsers(payload.users ?? []);
      setSessions(payload.sessions ?? []);
      setPortalPresence(payload.portalPresence ?? []);
      setActivity(payload.activity ?? []);
      setSummary(payload.summary ?? { totalUsers: 0, activeUsers: 0, onlineUsers: 0, pendingUsers: 0, blockedUsers: 0 });
      setOwnerEmail(payload.ownerEmail ?? "jobs@grossprinting.com");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Owner Admin.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    if (!authEnabled || !authToken) return;
    void loadAdmin();
    const intervalId = window.setInterval(() => void loadAdmin(true), 30_000);
    return () => window.clearInterval(intervalId);
  }, [authEnabled, authToken]);

  function updateUserDraft(userId: string, changes: Partial<ManagedUser>) {
    setUsers((current) => current.map((user) => (user.userId === userId ? { ...user, ...changes } : user)));
  }

  async function saveUser(user: ManagedUser) {
    if (!authToken) return;
    setSavingUserId(user.userId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          displayName: user.displayName,
          role: user.role,
          isActive: user.isActive,
          title: user.title,
          department: user.department
        })
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save staff access.");
      setMessage(payload.message ?? "Staff access saved.");
      await loadAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save staff access.");
    } finally {
      setSavingUserId(undefined);
    }
  }

  async function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken) return;
    setInviteBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          email: inviteEmail,
          displayName: inviteName,
          role: inviteRole,
          title: inviteTitle,
          department: inviteDepartment,
          isActive: true
        })
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to invite this employee.");
      setMessage(payload.message ?? "Invitation sent.");
      setInviteName("");
      setInviteEmail("");
      setInviteTitle("");
      setInviteDepartment("");
      setInviteRole("front_desk");
      await loadAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite this employee.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function runUserAction(user: ManagedUser, action: "send_access_email" | "sign_out_sessions") {
    if (!authToken) return;
    setActionUserId(user.userId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId: user.userId, email: user.email })
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to complete this action.");
      setMessage(payload.message ?? "Action completed.");
      await loadAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete this action.");
    } finally {
      setActionUserId(undefined);
    }
  }

  if (!authEnabled) {
    return (
      <main className="page-content admin-center-page">
        <section className="admin-hero">
          <div>
            <span className="admin-eyebrow"><ShieldCheck size={16} /> Owner Admin preview</span>
            <h1>Real staff control is ready for the hosted system.</h1>
            <p>Demo mode cannot show real Supabase users or login sessions. After the included Supabase SQL is connected, this page will show staff, online devices, access roles, invitations, and activity.</p>
          </div>
          <div className="owner-lock-card">
            <ShieldCheck size={28} />
            <strong>Permanent Owner Administrator</strong>
            <span>{currentUserEmail ?? "jobs@grossprinting.com"}</span>
          </div>
        </section>
        <section className="admin-role-preview">
          {roleOptions.map((role) => (
            <article key={role.value}>
              <UserCog size={22} />
              <strong>{role.label}</strong>
              <span>{role.description}</span>
            </article>
          ))}
        </section>
        <section className="admin-setup-card">
          <h2>To activate this page</h2>
          <p>Run <code>supabase/GROSS_PRINTING_MIS_V044_SETUP.sql</code>, add the Supabase keys to Vercel, and set <code>NEXT_PUBLIC_DEMO_MODE=false</code>.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-content admin-center-page">
      <section className="admin-hero">
        <div>
          <span className="admin-eyebrow"><ShieldCheck size={16} /> Owner-only backend</span>
          <h1>Staff access, live sessions, and account history.</h1>
          <p>The original owner remains protected. Employees only receive the sections assigned to their role.</p>
        </div>
        <div className="owner-lock-card">
          <ShieldCheck size={28} />
          <strong>Permanent Owner Administrator</strong>
          <span>{ownerEmail}</span>
          <small>{currentUserId ? "Owner protection active" : "Checking owner account"}</small>
        </div>
      </section>

      <section className="admin-summary-grid">
        <article><Users size={22} /><div><strong>{summary.totalUsers}</strong><span>Total staff</span></div></article>
        <article><UserCheck size={22} /><div><strong>{summary.activeUsers}</strong><span>Active accounts</span></div></article>
        <article><Wifi size={22} /><div><strong>{summary.onlineUsers}</strong><span>Online now</span></div></article>
        <article><Clock3 size={22} /><div><strong>{summary.pendingUsers}</strong><span>Pending setup</span></div></article>
        <article><Ban size={22} /><div><strong>{summary.blockedUsers}</strong><span>Blocked</span></div></article>
      </section>

      <div className="admin-toolbar">
        <div className="admin-tabs" role="tablist" aria-label="Owner Admin sections">
          <button className={activeTab === "overview" ? "active" : ""} type="button" onClick={() => setActiveTab("overview")}><ShieldCheck size={16} />Overview</button>
          <button className={activeTab === "users" ? "active" : ""} type="button" onClick={() => setActiveTab("users")}><Users size={16} />Users</button>
          <button className={activeTab === "sessions" ? "active" : ""} type="button" onClick={() => setActiveTab("sessions")}><Laptop size={16} />Sessions</button>
          <button className={activeTab === "activity" ? "active" : ""} type="button" onClick={() => setActiveTab("activity")}><Activity size={16} />Activity</button>
        </div>
        <button className="icon-button text-button" type="button" onClick={() => void loadAdmin()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />{loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {message ? <div className="admin-message">{message}</div> : null}

      {activeTab === "overview" ? (
        <div className="admin-overview-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><h2>Who is online</h2><p>Staff and Customer Portal visitors, updated by secure heartbeat.</p></div><Wifi size={20} /></div>
            <div className="online-user-list">
              {users.filter((user) => user.isOnline).map((user) => (
                <article key={`staff-${user.userId}`}>
                  <span className="online-dot" />
                  <div><strong>{user.displayName}</strong><span>{user.currentView ?? "Inside MIS"} · {user.deviceLabel ?? "Device"} · {user.browserLabel ?? "Browser"}</span></div>
                  <small>Staff · {user.activeSessionCount ?? 1} active</small>
                </article>
              ))}
              {portalPresence.map((visitor) => (
                <article key={`customer-${visitor.userId}`}>
                  <span className="online-dot" />
                  <div><strong>{visitor.displayName}</strong><span>Customer Portal · {visitor.email}</span></div>
                  <small>Customer · {relativeTime(visitor.lastSeenAt)}</small>
                </article>
              ))}
              {!users.some((user) => user.isOnline) && !portalPresence.length ? <div className="admin-empty"><WifiOff size={25} /><span>Nobody is online right now.</span></div> : null}
            </div>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><h2>Recent account activity</h2><p>Sign-ins and administrator changes.</p></div><Activity size={20} /></div>
            <div className="admin-activity-list compact">
              {activity.slice(0, 8).map((item) => (
                <article key={item.id}><span className="activity-icon"><Activity size={15} /></span><div><strong>{item.action}</strong><span>{activityDetails(item)}</span></div><small>{relativeTime(item.created_at)}</small></article>
              ))}
              {!activity.length ? <div className="admin-empty"><Activity size={25} /><span>No activity has been recorded yet.</span></div> : null}
            </div>
          </section>
          <section className="admin-panel admin-role-access">
            <div className="admin-panel-heading"><div><h2>Role access</h2><p>Navigation and backend access are enforced by account role.</p></div><UserCog size={20} /></div>
            {roleOptions.map((role) => <article key={role.value}><strong>{role.label}</strong><span>{role.description}</span></article>)}
          </section>
        </div>
      ) : null}

      {activeTab === "users" ? (
        <div className="admin-users-layout">
          <form className="admin-invite-card" onSubmit={inviteUser}>
            <div className="admin-panel-heading"><div><h2>Invite employee</h2><p>Send a private setup email and choose the correct work access.</p></div><MailPlus size={21} /></div>
            <label><span>Employee name</span><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Full name" /></label>
            <label><span>Email address</span><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="employee@example.com" /></label>
            <label><span>Role</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as ManagedRole)}>{roleOptions.filter((role) => role.value !== "admin").map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}</select></label>
            <div className="admin-invite-split">
              <label><span>Job title</span><input value={inviteTitle} onChange={(event) => setInviteTitle(event.target.value)} placeholder="Optional" /></label>
              <label><span>Department</span><input value={inviteDepartment} onChange={(event) => setInviteDepartment(event.target.value)} placeholder="Optional" /></label>
            </div>
            <button className="primary-button" type="submit" disabled={inviteBusy || !inviteEmail.trim()}>{inviteBusy ? "Sending..." : "Send invitation"}<MailPlus size={16} /></button>
          </form>

          <section className="admin-user-list-panel">
            <div className="admin-panel-heading"><div><h2>Staff accounts</h2><p>Owner access is permanent. Other staff can be changed or blocked.</p></div><Users size={21} /></div>
            <div className="admin-user-list">
              {users.map((user) => (
                <article className={`admin-user-card ${user.isActive ? "" : "blocked"}`} key={user.userId}>
                  <div className="admin-user-main">
                    <span className={`user-presence ${user.isOnline ? "online" : ""}`} />
                    <div>
                      <div className="admin-user-name-row"><strong>{user.displayName || user.email}</strong>{user.isOwner ? <span className="owner-badge"><ShieldCheck size={13} />Owner</span> : null}{user.isCurrentUser ? <span className="self-badge">You</span> : null}</div>
                      <span>{user.email}</span>
                      <small>{user.isOnline ? `Online · ${user.currentView ?? "MIS"}` : `Last activity ${relativeTime(user.lastActivityAt ?? user.lastSignInAt)}`}</small>
                    </div>
                  </div>
                  <div className="admin-user-fields">
                    <label><span>Display name</span><input value={user.displayName} onChange={(event) => updateUserDraft(user.userId, { displayName: event.target.value })} /></label>
                    <label><span>Role</span><select value={user.role} disabled={user.isOwner || user.isCurrentUser} onChange={(event) => updateUserDraft(user.userId, { role: event.target.value as ManagedRole })}>{roleOptions.map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}</select></label>
                    <label><span>Title</span><input value={user.title ?? ""} onChange={(event) => updateUserDraft(user.userId, { title: event.target.value })} /></label>
                    <label><span>Department</span><input value={user.department ?? ""} onChange={(event) => updateUserDraft(user.userId, { department: event.target.value })} /></label>
                  </div>
                  <div className="admin-user-meta">
                    <span><b>Status:</b> {user.isActive ? "Active" : "Blocked"}</span>
                    <span><b>Email:</b> {user.emailConfirmedAt ? "Confirmed" : "Setup pending"}</span>
                    <span><b>Last sign-in:</b> {dateTime(user.lastSignInAt)}</span>
                    <span><b>Device:</b> {user.deviceLabel ?? "Not recorded"}</span>
                  </div>
                  <div className="admin-user-actions">
                    <label className="admin-active-toggle"><input type="checkbox" checked={user.isActive} disabled={user.isOwner || user.isCurrentUser} onChange={(event) => updateUserDraft(user.userId, { isActive: event.target.checked })} /><span>{user.isActive ? "Active" : "Blocked"}</span></label>
                    <button className="icon-button text-button" type="button" disabled={actionUserId === user.userId} onClick={() => void runUserAction(user, "send_access_email")}><KeyRound size={15} />Send setup/reset</button>
                    {!user.isOwner && !user.isCurrentUser ? <button className="icon-button text-button danger-text" type="button" disabled={actionUserId === user.userId || !user.activeSessionCount} onClick={() => void runUserAction(user, "sign_out_sessions")}><Ban size={15} />Sign out devices</button> : null}
                    <button className="primary-button" type="button" disabled={savingUserId === user.userId} onClick={() => void saveUser(user)}><Save size={15} />{savingUserId === user.userId ? "Saving..." : "Save access"}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "sessions" ? (
        <section className="admin-panel admin-sessions-panel">
          <div className="admin-panel-heading"><div><h2>Login sessions</h2><p>Active devices appear first. Historical sessions remain available for review.</p></div><Laptop size={21} /></div>
          <div className="admin-session-section">
            <h3>Online now</h3>
            <div className="admin-session-table-wrap"><table className="admin-session-table"><thead><tr><th>Status</th><th>Employee</th><th>Device</th><th>Current page</th><th>Last seen</th><th>IP</th></tr></thead><tbody>{onlineSessions.map((session) => <tr key={session.id}><td><span className="session-status online"><Wifi size={14} />Online</span></td><td>{session.email ?? "Staff"}</td><td>{session.device_label ?? "Device"}<small>{session.browser_label ?? ""}</small></td><td>{session.current_view ?? "MIS"}</td><td>{relativeTime(session.last_seen_at)}</td><td>{session.ip_address ?? "—"}</td></tr>)}</tbody></table></div>
            {!onlineSessions.length ? <div className="admin-empty"><WifiOff size={25} /><span>No active sessions.</span></div> : null}
          </div>
          <div className="admin-session-section">
            <h3>Recent sessions</h3>
            <div className="admin-session-table-wrap"><table className="admin-session-table"><thead><tr><th>Status</th><th>Employee</th><th>Device</th><th>Last page</th><th>Last seen</th><th>Started</th></tr></thead><tbody>{recentSessions.map((session) => <tr key={session.id}><td><span className={`session-status ${session.revoked_at ? "revoked" : "offline"}`}>{session.revoked_at ? "Admin sign-out" : "Offline"}</span></td><td>{session.email ?? "Staff"}</td><td>{session.device_label ?? "Device"}<small>{session.browser_label ?? ""}</small></td><td>{session.current_view ?? "MIS"}</td><td>{dateTime(session.last_seen_at)}</td><td>{dateTime(session.started_at)}</td></tr>)}</tbody></table></div>
          </div>
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><h2>Account activity</h2><p>Sign-ins, sign-outs, invitations, access changes, and administrator actions.</p></div><Activity size={21} /></div>
          <div className="admin-activity-list">
            {activity.map((item) => (
              <article key={item.id}>
                <span className="activity-icon"><CheckCircle2 size={16} /></span>
                <div><strong>{item.action}</strong><span>{activityDetails(item)}</span><small>{item.category}</small></div>
                <time>{dateTime(item.created_at)}</time>
              </article>
            ))}
            {!activity.length ? <div className="admin-empty"><Activity size={25} /><span>No account activity has been recorded yet.</span></div> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
