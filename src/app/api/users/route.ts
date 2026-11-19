import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { createStaff, listStaff } from "@/lib/store";
import { describePasswordProblem, isUserRole } from "@/lib/staff-rules";
import { missingAcademicFields, validateAcademicInput } from "@/lib/academic";

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  try {
    return NextResponse.json(await listStaff());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load staff." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role;

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    if (!isUserRole(role)) {
      return NextResponse.json(
        { error: "Role must be student, faculty, teacher, community, librarian, or admin." },
        { status: 400 }
      );
    }
    const passwordProblem = describePasswordProblem(password);
    if (passwordProblem) {
      return NextResponse.json({ error: passwordProblem }, { status: 400 });
    }
    if (role === "student") {
      const missing = missingAcademicFields({
        memberType: "student",
        studentId: body.studentId,
        departmentId: body.departmentId,
        courseId: body.courseId,
        yearLevel: body.yearLevel,
        section: body.section,
      });
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Missing required student fields: ${missing.join(", ")}.` },
          { status: 400 }
        );
      }
    }
    const invalid = validateAcademicInput({
      memberType: role === "faculty" || role === "teacher" || role === "community"
        ? role : "staff",
      studentId: body.studentId,
      departmentId: body.departmentId,
      courseId: body.courseId,
      yearLevel: body.yearLevel,
      section: body.section,
    });
    if (invalid.length > 0) {
      return NextResponse.json({ error: invalid.join(" ") }, { status: 400 });
    }

    try {
      const created = await createStaff({
        name, email, password, role,
        academic: {
          studentId: body.studentId,
          departmentId: body.departmentId,
          courseId: body.courseId,
          yearLevel: body.yearLevel,
          section: body.section,
        },
      });
      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create account.";
      if (/already exists/i.test(message)) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse request." },
      { status: 400 }
    );
  }
}
