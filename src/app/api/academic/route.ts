import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { listCourses, listDepartments } from "@/lib/store";

/** Database-backed master data for role-aware forms. No hardcoded lists. */
export async function GET() {
  const { response } = await requireSession();
  if (response) return response;
  try {
    const [departments, courses] = await Promise.all([
      listDepartments(),
      listCourses(),
    ]);
    return NextResponse.json({ departments, courses });
  } catch (error) {
    console.error("Failed to load academic master data:", error);
    return NextResponse.json({ error: "Failed to load academic master data." }, { status: 500 });
  }
}
