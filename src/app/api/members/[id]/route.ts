import { NextResponse } from "next/server";
import { deleteMember, updateMember } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const member = await updateMember(id, body);
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
