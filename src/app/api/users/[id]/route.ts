import { NextResponse } from "next/server";
import { assertPrivilegedRoleAssignment, requireAdmin } from "@/lib/authz";
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
  describeDeleteProblem,
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
    const body = (await request.json()) as Record<string, unknown>;

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
      mutateRole: async (nextRole) => {
        const rpc = await changeUserRoleAtomically(supabase, {
          userId: id, nextRole, actorId: actor.id,
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
