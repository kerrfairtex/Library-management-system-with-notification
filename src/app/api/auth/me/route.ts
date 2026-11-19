import { NextResponse } from "next/server";
import { getUserById, updateOwnProfile } from "@/lib/store";
import { requireSession } from "@/lib/authz";
import { toPublicUser } from "@/lib/auth";
import { describePasswordProblem } from "@/lib/staff-rules";

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;
  const full = await getUserById(user.id);
  if (!full) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user: { ...toPublicUser(full), createdAt: full.createdAt } });
}

export async function PATCH(request: Request) {
  const { user: sessionUser, response } = await requireSession();
  if (!sessionUser) return response;
  const userId = sessionUser.id;

  try {
    const body = await request.json();
    const updates: { name?: string; password?: string } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.password !== undefined) {
      const password = String(body.password);
      const problem = describePasswordProblem(password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      updates.password = password;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const updated = await updateOwnProfile(userId, updates);
    if (!updated) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    return NextResponse.json({
      user: { ...toPublicUser(updated), createdAt: updated.createdAt },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed." },
      { status: 400 }
    );
  }
}
