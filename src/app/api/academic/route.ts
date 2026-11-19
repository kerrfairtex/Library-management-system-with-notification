import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/authz";
import { canAccess } from "@/lib/permissions";
import { InputError, MAX_PROGRAM_YEARS, isUuid, isValidProgramYears } from "@/lib/academic";
import {
  countDepartmentCourseMismatches,
  createCourse,
  createDepartment,
  listCourses,
  listDepartments,
  updateCourse,
  updateDepartment,
} from "@/lib/store";

/**
 * Academic master data (departments, courses).
 *   GET                       any signed-in user: active rows for forms.
 *   GET ?all=1                admin: include inactive rows + mismatch count.
 *   POST  {kind, code, name, departmentId?, programYears?}                admin: create.
 *   PATCH {kind, id, code?, name?, active?, departmentId?, programYears?} admin: update.
 * programYears (courses only): 1-6 or null; limits the year levels offered.
 * Rows are deactivated, never deleted, so historical member records stay valid.
 */
export async function GET(request: Request) {
  const { user, response } = await requireSession();
  if (!user) return response;
  const all = new URL(request.url).searchParams.get("all") === "1" && canAccess(user, "staff.manage");
  try {
    const [departments, courses] = await Promise.all([listDepartments(all), listCourses(all)]);
    if (!all) return NextResponse.json({ departments, courses });
    const mismatchedStudents = await countDepartmentCourseMismatches();
    return NextResponse.json({ departments, courses, mismatchedStudents });
  } catch (error) {
    console.error("Failed to load academic master data:", error);
    return NextResponse.json({ error: "Failed to load academic master data." }, { status: 500 });
  }
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9 .&-]{0,29}$/;

function cleanCode(value: unknown): string {
  const code = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!CODE.test(code)) throw new InputError("Code must be 1-30 letters, digits, spaces, '.', '&' or '-'.");
  return code;
}

function cleanName(value: unknown): string {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 120) throw new InputError("Name must be 1-120 characters.");
  return name;
}

function cleanDepartmentId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!isUuid(value)) throw new InputError("departmentId must be a valid department ID.");
  return String(value).trim();
}

function cleanProgramYears(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  const v = value === "" || value === null ? null : Number(value);
  if (!isValidProgramYears(v)) throw new InputError(`programYears must be 1-${MAX_PROGRAM_YEARS} or empty.`);
  return v;
}

function kindOf(value: unknown): "department" | "course" {
  if (value === "department" || value === "course") return value;
  throw new InputError("kind must be 'department' or 'course'.");
}

function fail(error: unknown, fallback: string) {
  if (error instanceof InputError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const kind = kindOf(body.kind);
    const code = cleanCode(body.code);
    const name = body.name === undefined || body.name === "" ? code : cleanName(body.name);
    const created =
      kind === "department"
        ? await createDepartment({ code, name })
        : await createCourse({
            code,
            name,
            departmentId: cleanDepartmentId(body.departmentId) ?? null,
            programYears: cleanProgramYears(body.programYears) ?? null,
          });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return fail(error, "Failed to create academic record.");
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const kind = kindOf(body.kind);
    if (!isUuid(body.id)) throw new InputError("id must be a valid ID.");
    const id = String(body.id).trim();
    const updates: {
      code?: string; name?: string; active?: boolean; departmentId?: string | null; programYears?: number | null;
    } = {};
    if (body.code !== undefined) updates.code = cleanCode(body.code);
    if (body.name !== undefined) updates.name = cleanName(body.name);
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw new InputError("active must be true or false.");
      updates.active = body.active;
    }
    if (kind === "course") {
      updates.departmentId = cleanDepartmentId(body.departmentId);
      updates.programYears = cleanProgramYears(body.programYears);
    } else if (body.departmentId !== undefined || body.programYears !== undefined) {
      throw new InputError("Departments have no departmentId or programYears.");
    }
    if (Object.values(updates).every((v) => v === undefined)) throw new InputError("Nothing to update.");

    const updated =
      kind === "department" ? await updateDepartment(id, updates) : await updateCourse(id, updates);
    if (!updated) return NextResponse.json({ error: `${kind} not found.` }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return fail(error, "Failed to update academic record.");
  }
}
