import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
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
  const { user, response } = await requireCapability(
    "members.write",
    "Only admins can update members."
  );
  if (!user) return response;

  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Parameters<typeof updateMember>[1] = {};

    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.email !== undefined) updates.email = String(body.email).trim();
    if (body.phone !== undefined) updates.phone = String(body.phone).trim();
    // Strict boolean parse: Boolean("false") === true, so a stringified
    // "false" would silently ACTIVATE a member. Accept real booleans only.
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json(
          { error: "active must be a boolean (true or false)." },
          { status: 400 }
        );
      }
      updates.active = body.active;
    }

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
  const { user, response } = await requireCapability(
    "members.write",
    "Only admins can delete members."
  );
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
