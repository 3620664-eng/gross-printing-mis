import { NextRequest, NextResponse } from "next/server";
import { noStoreJson, serviceFetch, validateStaffRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const WORKSPACE_ID = "gross-printing";

type AuditRow = {
  id: number;
  actor_email?: string;
  actor_role?: string;
  action: string;
  category: string;
  details?: Record<string, unknown>;
  created_at: string;
};

type VersionRow = {
  id: number;
  collection: string;
  record_id: string;
  action: string;
  actor_user_id?: string;
  created_at: string;
};

type WorkspaceRow = { revision: number; updated_at?: string; migrated_from_legacy_at?: string };
type RecordRow = { collection: string; deleted_at?: string };

export async function GET(request: NextRequest) {
  const context = await validateStaffRequest(request, ["admin"]);
  if (context instanceof NextResponse) return context;

  const [auditResponse, versionsResponse, workspaceResponse, recordsResponse] = await Promise.all([
    serviceFetch("/rest/v1/security_audit_log?select=id,actor_email,actor_role,action,category,details,created_at&order=created_at.desc&limit=100"),
    serviceFetch(`/rest/v1/mis_record_versions?workspace_id=eq.${encodeURIComponent(WORKSPACE_ID)}&select=id,collection,record_id,action,actor_user_id,created_at&order=created_at.desc&limit=100`),
    serviceFetch(`/rest/v1/mis_workspaces?id=eq.${encodeURIComponent(WORKSPACE_ID)}&select=revision,updated_at,migrated_from_legacy_at&limit=1`),
    serviceFetch(`/rest/v1/mis_records?workspace_id=eq.${encodeURIComponent(WORKSPACE_ID)}&select=collection,deleted_at`)
  ]);

  if (!auditResponse.ok || !versionsResponse.ok || !workspaceResponse.ok || !recordsResponse.ok) {
    return noStoreJson({ error: "Unable to read the protected security overview." }, { status: 502 });
  }

  const audits = (await auditResponse.json()) as AuditRow[];
  const versions = (await versionsResponse.json()) as VersionRow[];
  const workspace = ((await workspaceResponse.json()) as WorkspaceRow[])[0];
  const records = (await recordsResponse.json()) as RecordRow[];
  const activeCounts: Record<string, number> = {};
  let softDeleted = 0;
  for (const row of records) {
    if (row.deleted_at) softDeleted += 1;
    else activeCounts[row.collection] = (activeCounts[row.collection] ?? 0) + 1;
  }

  return noStoreJson({
    ok: true,
    workspace: workspace ?? { revision: 0 },
    activeCounts,
    activeRecordCount: Object.values(activeCounts).reduce((sum, count) => sum + count, 0),
    softDeletedCount: softDeleted,
    versionCountShown: versions.length,
    audits,
    versions
  });
}
