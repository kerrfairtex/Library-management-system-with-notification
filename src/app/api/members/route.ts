import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { createMember, listMembers } from "@/lib/store";
import type { MemberType } from "@/lib/types";
import { validateAcademicInput } from "@/lib/academic";

function parseMemberType(value: unknown): MemberType {
  if (value === "staff" || value === "community" || value === "student" || value === "faculty" || value === "teacher") {
    return value;
  }
  throw new Error("Invalid member category.");
}

export async function GET() {
  const { user, response } = await requireCapability(
    "members.read",
    "Only librarians and admins can view members."
  );
  if (!user) return response;

  try {
    const members = await listMembers();
    return NextResponse.json(members);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load members." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireCapability(
    "members.write",
    "Only admins can add members."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const { name, email, phone, memberType, studentId, grade } = body;
    if (!name || !email || !phone) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const type = parseMemberType(memberType);
    const academicProblems = validateAcademicInput({
      memberType: type,
      studentId, departmentId: body.departmentId, courseId: body.courseId,
      yearLevel: body.yearLevel, section: body.section,
    });
    if (academicProblems.length > 0) {
      return NextResponse.json({ error: academicProblems.join(" ") }, { status: 400 });
    }
    const member = await createMember({
      name: String(name).trim(),
      email: String(email).trim(),
      phone: String(phone).trim(),
      memberType: type,
      studentId:
        studentId === undefined || studentId === null
          ? null
          : String(studentId).trim() || null,
      grade:
        grade === undefined || grade === null ? null : String(grade).trim() || null,
      departmentId:
        body.departmentId === undefined || body.departmentId === null
          ? null : String(body.departmentId).trim() || null,
      courseId:
        body.courseId === undefined || body.courseId === null
          ? null : String(body.courseId).trim() || null,
      yearLevel:
        body.yearLevel === undefined || body.yearLevel === null
          ? null : String(body.yearLevel).trim() || null,
      section:
        body.section === undefined || body.section === null
          ? null : String(body.section).trim() || null,
      userId: null,
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create member.";
    if (message === "Invalid member category." || message.includes("required")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("createMember failed:", error);
    return NextResponse.json({ error: "Failed to create member." }, { status: 500 });
  }
}
