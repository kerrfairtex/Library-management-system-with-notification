import { NextResponse } from "next/server";
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
    console.error("Failed to build completeness audit:", error);
    return NextResponse.json({ error: "Failed to load audit." }, { status: 500 });
  }
}
