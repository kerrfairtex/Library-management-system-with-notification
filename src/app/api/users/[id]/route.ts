import { NextResponse } from "next/server";
import { assertPrivilegedRoleAssignment, requireAdmin, requireCapability } from "@/lib/authz";
import { changeUserRoleAtomically } from "@/lib/role-transition";
import {
  approveStudentAtomically,
  changeUserStatusAtomically,
  deleteUserGuarded,
} from "@/lib/admin-guards";
import { supabase } from "@/lib/supabase";
import { applyUserPatch } from "@/lib/user-patch";
import type { PublicUser } from "@/lib/types";
import {
  countAdmins,
  getPublicUserById,
  updateStaff,
} from "@/lib/store";
import {
  describeAccountManagementProblem,
  describeDeleteProblem,
  isUserRole,
} from "@/lib/staff-rules";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  // Librarians may edit patron accounts only (checked below once the target
  // is loaded); admins may edit any account. Delete stays admin-only.
  const { user: actor, response } = await requireCapability(
    "members.write",
    "Only librarians and admins can manage accounts."
  );
  if (!actor) return response;

  try {
    const { id } = await params;
    const target = await getPublicUserById(id);
    if (!target) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;

    const scopeProblem = describeAccountManagementProblem({
      actorRole: actor.role,
      targetRole: target.role,
      nextRole: isUserRole(body.role) ? body.role : undefined,
    });
    if (scopeProblem) {
      return NextResponse.json({ error: scopeProblem }, { status: 403 });
    }
    // Setting another person's password stays admin-only, like reset-password.
    if (body.password !== undefined && actor.role !== "admin") {
      return NextResponse.json(
        { error: "Only an admin can set a password for another account." },
        { status: 403 }
      );
    }

    const result = await applyUserPatch({
      actor,
      target,
      body,
      countAdmins,
      privilegedAssignmentDenied: (actorRole, nextRole) =>
        assertPrivilegedRoleAssignment(actorRole, nextRole) !== null,
      mutateProfile: async (updates) => updateStaff(id, updates),
      mutateStatus: async (nextStatus, studentActivation) => {
        const rpc = studentActivation
          ? await approveStudentAtomically(supabase, { userId: id, actorId: actor.id })
          : await changeUserStatusAtomically(supabase, {
              userId: id, nextStatus, actorId: actor.id,
            });
        return rpc.ok ? { ok: true, data: rpc.data } : { ok: false, error: rpc.error };
      },
      mutateRole: async (nextRole, idNumber) => {
        const rpc = await changeUserRoleAtomically(supabase, {
          userId: id, nextRole, actorId: actor.id, idNumber,
        });
        return rpc.error
          ? { ok: false, error: rpc.error.message }
          : { ok: true, data: rpc.data as PublicUser };
      },
    });

    if (result.kind === "error") {
      if (result.log) console.error(result.log);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    // Log diagnostics server-side only; never return raw DB error text.
    console.error("PATCH /api/users/[id] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Failed to update staff." }, { status: 400 });
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

    const removed = await deleteUserGuarded(supabase, id, actor.id);
    if (!removed.ok) {
      console.error("Guarded deletion rejected:", removed.error);
      return NextResponse.json({ error: removed.error }, { status: 409 });
    }
    if (!removed.data) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/users/[id] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Failed to delete staff." }, { status: 400 });
  }
}
