import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import {
  countAdmins,
  deleteStaff,
  getPublicUserById,
  updateStaff,
} from "@/lib/store";
import {
  describeDeleteProblem,
  describePasswordProblem,
  describeRoleChangeProblem,
  describeStatusChangeProblem,
  isUserRole,
  isUserStatus,
} from "@/lib/staff-rules";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user: actor, response } = await requireAdmin();
  if (!actor) return response;

  try {
    const { id } = await params;
    const target = await getPublicUserById(id);
    if (!target) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    const body = await request.json();
    const updates: Parameters<typeof updateStaff>[1] = {};

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

    if (body.role !== undefined) {
      if (!isUserRole(body.role)) {
        return NextResponse.json(
          { error: "Role must be student, librarian, or admin." },
          { status: 400 }
        );
      }
      const problem = describeRoleChangeProblem({
        actorId: actor.id,
        target,
        nextRole: body.role,
        adminCount: await countAdmins(),
      });
      if (problem) return NextResponse.json({ error: problem }, { status: 409 });
      updates.role = body.role;
    }

    if (body.status !== undefined) {
      if (!isUserStatus(body.status)) {
        return NextResponse.json(
          { error: "Status must be pending or active." },
          { status: 400 }
        );
      }
      const problem = describeStatusChangeProblem({ actorId: actor.id, target });
      if (problem) return NextResponse.json({ error: problem }, { status: 409 });
      updates.status = body.status;
    }

    const updated = await updateStaff(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update staff." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user: actor, response } = await requireAdmin();
  if (!actor) return response;

  try {
    const { id } = await params;
    const target = await getPublicUserById(id);
    if (!target) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    const problem = describeDeleteProblem({
      actorId: actor.id,
      target,
      adminCount: await countAdmins(),
    });
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });

    const removed = await deleteStaff(id);
    if (!removed) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete staff." },
      { status: 400 }
    );
  }
}
