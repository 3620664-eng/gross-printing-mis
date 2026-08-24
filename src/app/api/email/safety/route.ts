import { NextRequest, NextResponse } from "next/server";
import {
  loadEmailSafetySettings,
  normalizeEmailSafetySettings
} from "@/lib/email-safety-server";
import type { EmailSafetySettings } from "@/lib/types";
import {
  logSecurityEvent,
  noStoreJson,
  rejectCrossSiteMutation,
  rejectOversizedJson,
  serviceFetch,
  validateStaffRequest
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const WORKSPACE_ID = "gross-printing";

async function currentWorkspaceRevision() {
  const response = await serviceFetch(
    `/rest/v1/mis_workspaces?id=eq.${encodeURIComponent(WORKSPACE_ID)}&select=revision&limit=1`
  );
  if (!response.ok) throw new Error("Unable to read the protected MIS revision.");
  const rows = (await response.json()) as Array<{ revision?: number }>;
  const revision = Number(rows[0]?.revision ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("The protected MIS revision is invalid.");
  return revision;
}

async function saveSafetySetting(settings: EmailSafetySettings, actorUserId: string) {
  // Use the same revision-checked transaction as the main protected MIS save. This keeps the
  // kill switch immediate without allowing a queued whole-state save to silently win a race.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const revision = await currentWorkspaceRevision();
    const response = await serviceFetch("/rest/v1/rpc/save_mis_records", {
      method: "POST",
      body: JSON.stringify({
        p_workspace_id: WORKSPACE_ID,
        p_expected_revision: revision,
        p_actor_user_id: actorUserId,
        p_rows: [{
          collection: "emailSafetySettings",
          record_id: "primary",
          record_value: settings,
          sort_order: 0
        }],
        p_collections: ["emailSafetySettings"],
        p_soft_delete_missing: true
      })
    });
    if (!response.ok) throw new Error("Unable to save customer email safety mode.");
    const claimed = await response.json().catch(() => null) as number | null;
    if (Number.isSafeInteger(claimed)) return Number(claimed);
  }
  throw new Error("Another protected save kept changing the MIS. Try the email safety change again.");
}

export async function GET(request: NextRequest) {
  const context = await validateStaffRequest(request);
  if (context instanceof NextResponse) return context;
  if (context.profile.role !== "admin" || context.profile.is_owner !== true) {
    return noStoreJson({ error: "Only the Owner can read customer email safety controls." }, { status: 403 });
  }
  return noStoreJson({ settings: await loadEmailSafetySettings() });
}

export async function PUT(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 32 * 1024);
  if (oversized) return oversized;
  const context = await validateStaffRequest(request);
  if (context instanceof NextResponse) return context;
  if (context.profile.role !== "admin" || context.profile.is_owner !== true) {
    await logSecurityEvent(context, "Blocked customer email safety change", "email_safety", { reason: "owner_required" }).catch(() => undefined);
    return noStoreJson({ error: "Only the Owner can change customer email safety settings." }, { status: 403 });
  }

  let body: { settings?: Partial<EmailSafetySettings>; confirmLive?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid customer email safety request." }, { status: 400 });
  }

  const current = await loadEmailSafetySettings();
  const next = normalizeEmailSafetySettings({
    ...current,
    ...(body.settings ?? {}),
    id: "primary",
    updatedAt: new Date().toISOString(),
    updatedBy: context.profile.display_name ?? context.profile.email ?? context.user.email ?? "Owner"
  });

  if (next.mode === "live" && current.mode !== "live" && body.confirmLive !== true) {
    return noStoreJson({ error: "Live Mode requires an explicit Owner confirmation." }, { status: 400 });
  }

  try {
    const serverRevision = await saveSafetySetting(next, context.user.id);
    await logSecurityEvent(context, "Changed customer email safety mode", "email_safety", {
      fromMode: current.mode,
      toMode: next.mode,
      testRecipientCount: next.testRecipients.length,
      redirectEnabled: Boolean(next.redirectBlockedEnabled)
    });
    return noStoreJson({ ok: true, settings: next, serverRevision });
  } catch (error) {
    await logSecurityEvent(context, "Customer email safety change failed", "email_safety_failed", {
      fromMode: current.mode,
      toMode: next.mode,
      error: error instanceof Error ? error.message : "Unknown error"
    }).catch(() => undefined);
    return noStoreJson({ error: error instanceof Error ? error.message : "Unable to save customer email safety mode." }, { status: 409 });
  }
}
