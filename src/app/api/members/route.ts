import { NextResponse } from "next/server";
import { createMember, getLibraryData } from "@/lib/store";

export async function GET() {
  const data = await getLibraryData();
  return NextResponse.json(data.members);
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
