import { NextRequest, NextResponse } from "next/server";
import { noStoreJson, serviceFetch, validateStaffRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type StaffDirectoryRow = {
  user_id?: string;
  email?: string;
  display_name?: string;
  role?: "admin" | "front_desk" | "prepress" | "press" | "finishing";
  is_active?: boolean;
  is_owner?: boolean;
  department?: string;
  title?: string;
};

export async function GET(request: NextRequest) {
  const context = await validateStaffRequest(request);
  if (context instanceof NextResponse) return context;

  const response = await serviceFetch(
    "/rest/v1/profiles?select=user_id,email,display_name,role,is_active,is_owner,department,title&is_active=eq.true&order=display_name.asc,email.asc"
  );
  if (!response.ok) return noStoreJson({ error: "Unable to load the staff directory." }, { status: 502 });

  const rows = (await response.json()) as StaffDirectoryRow[];
  return noStoreJson({
    ok: true,
    staff: rows
      .filter((row) => row.user_id && row.role && ["admin", "front_desk", "prepress", "press", "finishing"].includes(row.role))
      .map((row) => ({
        userId: row.user_id!,
        email: row.email ?? "",
        name: row.display_name?.trim() || row.email?.trim() || "Staff",
        role: row.role!,
        department: row.department?.trim() || "",
        title: row.title?.trim() || "",
        isOwner: Boolean(row.is_owner)
      }))
  });
}
