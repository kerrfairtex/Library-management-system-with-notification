import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { createStaff, listStaff } from "@/lib/store";
import { describePasswordProblem, isUserRole } from "@/lib/staff-rules";

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
        { error: "Role must be either librarian or admin." },
        { status: 400 }
      );
    }
    const passwordProblem = describePasswordProblem(password);
    if (passwordProblem) {
      return NextResponse.json({ error: passwordProblem }, { status: 400 });
    }

    const created = await createStaff({ name, email, password, role });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create staff." },
      { status: 400 }
    );
  }
}
