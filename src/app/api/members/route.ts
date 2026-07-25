import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { createMember, listMembers } from "@/lib/store";
import type { MemberType } from "@/lib/types";

function parseMemberType(value: unknown): MemberType {
  if (value === "staff" || value === "community" || value === "student") {
    return value;
  }
  return "student";
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
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create member." },
      { status: 500 }
    );
  }
}
