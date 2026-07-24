import { NextResponse } from "next/server";
import { createMember, listMembers } from "@/lib/store";

export async function GET() {
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
  try {
    const body = await request.json();
    const { name, email, phone } = body;
    if (!name || !email || !phone) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const member = await createMember({
      name: String(name).trim(),
      email: String(email).trim(),
      phone: String(phone).trim(),
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create member." },
      { status: 500 }
    );
  }
}
