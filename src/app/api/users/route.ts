import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { createStaff, listStaff } from "@/lib/store";
import {
  describeAccountManagementProblem,
  describePasswordProblem,
  describePhoneProblem,
  isUserRole,
  normalizePhone,
} from "@/lib/staff-rules";
import { InputError, missingAcademicFields, validateAcademicInput } from "@/lib/academic";

// Librarians and admins (members.write). Librarians are limited to patron
// accounts by describeAccountManagementProblem below.
const ACCOUNTS_DENIED = "Only librarians and admins can manage accounts.";

export async function GET() {
  const { user, response } = await requireCapability("members.write", ACCOUNTS_DENIED);
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
  const { user, response } = await requireCapability("members.write", ACCOUNTS_DENIED);
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!isUserRole(role)) {
      return NextResponse.json(
        { error: "Role must be student, faculty, teacher, community, librarian, or admin." },
        { status: 400 }
      );
    }
    const scopeProblem = describeAccountManagementProblem({ actorRole: user.role, nextRole: role });
    if (scopeProblem) {
      return NextResponse.json({ error: scopeProblem }, { status: 403 });
    }
    const passwordProblem = describePasswordProblem(password);
    if (passwordProblem) {
      return NextResponse.json({ error: passwordProblem }, { status: 400 });
    }
    const phoneProblem = describePhoneProblem(body.phone);
    if (phoneProblem) {
      return NextResponse.json({ error: phoneProblem }, { status: 400 });
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
    // Validate with the member category the role maps to. (Previously a
    // student mapped to "staff", which skipped every academic check.)
    const invalid = validateAcademicInput({
      memberType: role === "librarian" || role === "admin" ? "staff" : role,
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
        phone: normalizePhone(body.phone),
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
      if (error instanceof InputError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
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
