import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { getUserStatistics } from "@/lib/store";

/** Administrator-only account statistics derived from users/members tables. */
export async function GET(request: Request) {
  const { response } = await requireCapability(
    "staff.manage",
    "Only an admin can view account statistics."
  );
  if (response) return response;

  const url = new URL(request.url);
  const role = url.searchParams.get("role");
  const status = url.searchParams.get("status");
  const department = url.searchParams.get("departmentId");
  const course = url.searchParams.get("courseId");
  const yearLevel = url.searchParams.get("yearLevel");
  const section = url.searchParams.get("section");

  // Filter parameters are accepted for forward compatibility; aggregate
  // counts remain server-side and never expose private user records.
  if (
    role || status || department || course || yearLevel || section
  ) {
    const { getFilteredUserStatistics } = await import("@/lib/store");
    return getFilteredUserStatistics({
      role, status, department, course, yearLevel, section,
    })
      .then((stats) => NextResponse.json(stats))
      .catch((error) => {
        console.error("Failed to aggregate filtered statistics:", error);
        return NextResponse.json({ error: "Failed to load statistics." }, { status: 500 });
      });
  }

  try {
    return NextResponse.json(await getUserStatistics());
  } catch (error) {
    console.error("Failed to aggregate account statistics:", error);
    return NextResponse.json({ error: "Failed to load statistics." }, { status: 500 });
  }
}
