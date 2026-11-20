import { NextResponse } from "next/server";
import { serverError } from "@/lib/server-error";
import { requireCapability } from "@/lib/authz";
import { getStudentCompletenessAudit } from "@/lib/store";

/** Read-only completeness audit. Includes a member id for correction links. */
export async function GET() {
  const { response } = await requireCapability(
    "members.read",
    "Only staff can view the student completeness audit."
  );
  if (response) return response;
  try {
    return NextResponse.json(await getStudentCompletenessAudit());
  } catch (error) {
    return serverError("GET /api/admin/student-completeness", error, { error: "Failed to load audit." }, 500);
  }
}
