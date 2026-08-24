import { NextRequest, NextResponse } from "next/server";
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

type VersionRow = {
  id: number;
  workspace_id: string;
  collection: string;
  record_id: string;
  previous_record?: unknown;
  new_record?: unknown;
};

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  const context = await validateStaffRequest(request, ["admin"]);
  if (context instanceof NextResponse) return context;

  let body: { versionId?: number; restore?: "previous" | "recorded" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid restore request." }, { status: 400 });
  }
  const versionId = Number(body.versionId);
  if (!Number.isSafeInteger(versionId) || versionId <= 0) {
    return noStoreJson({ error: "Select a valid protected record version." }, { status: 400 });
  }

  const versionResponse = await serviceFetch(
    `/rest/v1/mis_record_versions?id=eq.${versionId}&workspace_id=eq.${encodeURIComponent(WORKSPACE_ID)}&select=id,workspace_id,collection,record_id,previous_record,new_record&limit=1`
  );
  if (!versionResponse.ok) return noStoreJson({ error: "Unable to read that protected version." }, { status: 502 });
  const version = ((await versionResponse.json()) as VersionRow[])[0];
  if (!version) return noStoreJson({ error: "That protected version was not found." }, { status: 404 });

  const record = body.restore === "recorded" ? version.new_record ?? version.previous_record : version.previous_record ?? version.new_record;
  if (record === undefined || record === null) {
    return noStoreJson({ error: "This version does not contain a recoverable record." }, { status: 409 });
  }

  const workspaceResponse = await serviceFetch(
    `/rest/v1/mis_workspaces?id=eq.${encodeURIComponent(WORKSPACE_ID)}&select=revision&limit=1`
  );
  const workspace = ((await workspaceResponse.json().catch(() => [])) as Array<{ revision?: number }>)[0];
  if (!workspaceResponse.ok || !workspace) return noStoreJson({ error: "Unable to lock the protected workspace." }, { status: 502 });
  const currentRevision = Number(workspace.revision ?? 0);
  const claimResponse = await serviceFetch("/rest/v1/rpc/claim_mis_revision", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_id: WORKSPACE_ID,
      p_expected_revision: currentRevision,
      p_actor_user_id: context.user.id
    })
  });
  const claimedRevision = claimResponse.ok ? await claimResponse.json().catch(() => null) as number | null : null;
  if (!Number.isSafeInteger(claimedRevision)) {
    return noStoreJson({ error: "Another protected change was saved first. Refresh and try the restore again." }, { status: 409 });
  }
  const nextRevision = Number(claimedRevision);
  const now = new Date().toISOString();

  const restoreResponse = await serviceFetch("/rest/v1/mis_records?on_conflict=workspace_id,collection,record_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      workspace_id: WORKSPACE_ID,
      collection: version.collection,
      record_id: version.record_id,
      record,
      deleted_at: null,
      updated_at: now,
      updated_by: context.user.id
    })
  });
  if (!restoreResponse.ok) return noStoreJson({ error: "The protected record could not be restored." }, { status: 502 });

  await logSecurityEvent(context, "Restored protected record version", "data_recovery", {
    versionId,
    collection: version.collection,
    recordId: version.record_id,
    revision: nextRevision
  });
  return noStoreJson({ ok: true, message: `${version.collection} record restored.`, serverRevision: nextRevision });
}
