import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { deleteMember, updateMember } from "@/lib/store";
import type { MemberType } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

function parseMemberType(value: unknown): MemberType | undefined {
  if (value === undefined) return undefined;
  if (value === "staff" || value === "community" || value === "student") {
    return value;
  }
  return "student";
}

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Parameters<typeof updateMember>[1] = {};

    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.email !== undefined) updates.email = String(body.email).trim();
    if (body.phone !== undefined) updates.phone = String(body.phone).trim();
    if (body.active !== undefined) updates.active = Boolean(body.active);

    const memberType = parseMemberType(body.memberType);
    if (memberType !== undefined) updates.memberType = memberType;

    if (body.studentId !== undefined) {
      updates.studentId =
        body.studentId === null ? null : String(body.studentId).trim() || null;
    }
    if (body.grade !== undefined) {
      updates.grade = body.grade === null ? null : String(body.grade).trim() || null;
    }

    const member = await updateMember(id, updates);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    return NextResponse.json(member);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update member." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const { id } = await params;
    const ok = await deleteMember(id);
    if (!ok) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete member." },
      { status: 400 }
    );
  }
}
