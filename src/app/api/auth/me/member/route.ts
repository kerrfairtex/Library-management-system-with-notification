import { NextResponse } from "next/server";
import { serverError } from "@/lib/server-error";
import { requireSession } from "@/lib/authz";
import { isPatron } from "@/lib/permissions";
import { getMemberByUser } from "@/lib/store";

/**
 * GET /api/auth/me/member — the signed-in patron's OWN ID and academic
 * details for My profile. Read-only: there is no write method here. The
 * member is resolved from the session, never from the request; staff
 * accounts have no member record and get null.
 */
export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;
  if (!isPatron(user)) return NextResponse.json({ member: null });

  try {
    const own = await getMemberByUser(user);
    return NextResponse.json({
      member: own
        ? {
            memberType: own.memberType,
            studentId: own.studentId,
            departmentId: own.departmentId,
            courseId: own.courseId,
            yearLevel: own.yearLevel,
            section: own.section,
          }
        : null,
    });
  } catch (error) {
    return serverError("GET /api/auth/me/member", error, { error: "Failed to load your member details." }, 500);
  }
}
