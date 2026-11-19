import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { canAccess, isPatron } from "./permissions.ts";
import {
  InputError,
  YEAR_LEVELS,
  academicReferenceProblems,
  coursesForDepartment,
  validateAcademicInput,
} from "./academic.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// run-tests.mjs rewrites quoted "*.ts" to ".js"; map back (see deploy-readiness.test.ts).
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");
function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
  });
}

// ── Roles ───────────────────────────────────────────────────────────────────
const PATRONS = ["student", "faculty", "teacher", "community"] as const;

test("every patron role is a patron; staff roles are not", () => {
  for (const r of PATRONS) assert.equal(isPatron(r), true, r);
  assert.equal(isPatron("librarian"), false);
  assert.equal(isPatron("admin"), false);
  assert.equal(isPatron(null), false);
  assert.equal(isPatron({ role: "faculty" }), true);
});

test("patron roles share self-service capabilities and nothing more", () => {
  for (const r of PATRONS) {
    assert.equal(canAccess(r, "holds.place"), true, `${r} holds.place`);
    assert.equal(canAccess(r, "loans.request"), true, `${r} loans.request`);
    assert.equal(canAccess(r, "loans.manage"), false, `${r} loans.manage`);
    assert.equal(canAccess(r, "members.read"), false, `${r} members.read`);
  }
});

test("no API route scopes patrons with role === 'student' (faculty/teacher/community leak)", () => {
  for (const file of walk("src/app/api")) {
    const text = read(file);
    assert.equal(
      /user\.role\s*(===|!==)\s*"student"/.test(text),
      false,
      `${file} must use isPatron(user) instead of a student-only check`
    );
  }
});

test("holds: patrons are pinned to their own member; non-staff non-patrons are refused", () => {
  const holds = read("src/app/api/holds/route.ts");
  assert.match(holds, /if \(isPatron\(user\)\)[\s\S]*?query\.eq\("member_id"/);
  assert.match(holds, /else if \(!canAccess\(user, "loans\.manage"\)\)/);
  // POST: a patron's memberId comes from the session, never the body.
  const post = holds.slice(holds.indexOf("export async function POST"), holds.indexOf("export async function PATCH"));
  assert.match(post, /if \(patron\) \{[\s\S]*?memberId = me\.id;/);
  assert.match(post, /!patron && !canAccess\(user, "loans\.manage"\)/);
});

test("fines, borrow requests, nav and home use the patron check", () => {
  assert.match(read("src/app/api/fines/route.ts"), /if \(isPatron\(user\)\)[\s\S]*getMemberByUser\(user\)/);
  const br = read("src/app/api/borrow-requests/route.ts");
  assert.match(br, /if \(!isPatron\(user\)\)/);
  assert.match(read("src/components/KohaShell.tsx"), /const isStudent = isPatron\(user\)/);
  assert.match(read("src/app/(desk)/page.tsx"), /const isStudent = isPatron\(user\)/);
});

// ── Academic validation ─────────────────────────────────────────────────────
const D1 = "11111111-1111-4111-8111-111111111111";
const D2 = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";

const goodStudent = {
  memberType: "student" as const,
  studentId: "2024-00123",
  departmentId: D1,
  courseId: C1,
  yearLevel: "1st Year",
  section: "A",
};

test("valid student passes; non-students skip academic rules", () => {
  assert.deepEqual(validateAcademicInput(goodStudent), []);
  assert.deepEqual(validateAcademicInput({ memberType: "faculty", yearLevel: "nope" }), []);
});

test("student fields are validated server-side", () => {
  const p = (o: Partial<typeof goodStudent>) => validateAcademicInput({ ...goodStudent, ...o }).join(" ");
  assert.match(p({ yearLevel: "9th Year" }), /yearLevel must be one of/);
  assert.match(p({ section: "<script>" }), /section must be a short code/);
  assert.match(p({ studentId: "x" }), /Student ID Number must be 3-30/);
  assert.match(p({ studentId: "bad id with spaces" }), /Student ID Number must be 3-30/);
  assert.match(p({ departmentId: "ICS" }), /valid department ID/);
  assert.match(p({ courseId: "" }), /courseId is required/);
  for (const y of YEAR_LEVELS) assert.equal(p({ yearLevel: y }), "");
  assert.equal(p({ section: "BSIT-1A" }), "");
});

const dept = (id: string, code: string, active = true) => ({ id, code, active });
const course = (departmentId: string | null, active = true) => ({ id: C1, code: "BSIT", active, departmentId });

test("course must belong to the chosen department when it has one", () => {
  const chosen = { departmentId: D1, courseId: C1 };
  assert.deepEqual(academicReferenceProblems(chosen, { department: dept(D1, "ICS"), course: course(D1) }), []);
  assert.deepEqual(academicReferenceProblems(chosen, { department: dept(D1, "ICS"), course: course(null) }), [], "unmapped course is shared");
  assert.deepEqual(
    academicReferenceProblems(chosen, { department: dept(D1, "IAS"), course: course(D2) }, undefined, () => "ICS"),
    ["Course BSIT belongs to department ICS, not IAS."]
  );
});

test("missing or newly-chosen inactive references are rejected; unchanged inactive is allowed", () => {
  const chosen = { departmentId: D1, courseId: C1 };
  assert.deepEqual(academicReferenceProblems(chosen, { department: null, course: null }), [
    "Selected department does not exist.",
    "Selected course does not exist.",
  ]);
  assert.deepEqual(
    academicReferenceProblems(chosen, { department: dept(D1, "ICS", false), course: course(D1, false) }),
    ["Department ICS is inactive.", "Course BSIT is inactive."]
  );
  assert.deepEqual(
    academicReferenceProblems(chosen, { department: dept(D1, "ICS", false), course: course(D1, false) }, chosen),
    [],
    "editing a historical record must not force a new department/course"
  );
});

test("forms only offer courses of the chosen department (plus shared ones)", () => {
  const courses = [
    { id: "a", departmentId: D1 },
    { id: "b", departmentId: D2 },
    { id: "c", departmentId: null },
  ];
  assert.deepEqual(coursesForDepartment(courses, D1).map((c) => c.id), ["a", "c"]);
  assert.deepEqual(coursesForDepartment(courses, "").map((c) => c.id), ["a", "b", "c"]);
});

test("InputError carries an HTTP status", () => {
  assert.equal(new InputError("x").status, 400);
  assert.equal(new InputError("x", 409).status, 409);
});

// ── Admin adds a student ────────────────────────────────────────────────────
test("POST /api/users validates a student's academic fields (was skipped)", () => {
  const route = read("src/app/api/users/route.ts");
  assert.match(route, /memberType: role === "librarian" \|\| role === "admin" \? "staff" : role/);
  assert.match(route, /error instanceof InputError/);
});

test("createStaff checks everything before writing the account", () => {
  const store = read("src/lib/store.ts");
  const fn = store.slice(store.indexOf("export async function createStaff"), store.indexOf("export async function updateStaff"));
  const insertAt = fn.indexOf('.from("users").insert(row)');
  for (const check of ["assertAcademicReferences(academic)", "assertStudentIdFree(", "already linked to another account"]) {
    const at = fn.indexOf(check);
    assert.ok(at > 0 && at < insertAt, `${check} must run before the users insert`);
  }
  // An existing desk-registered member gets the role's category and the academic profile.
  assert.match(fn, /\.update\(memberFields\)[\s\S]*?\.is\("user_id", null\)/);
  assert.match(fn, /member_type: memberType/);
});

test("member edits cannot desync a linked login account", () => {
  const store = read("src/lib/store.ts");
  const fn = store.slice(store.indexOf("export async function updateMember"), store.indexOf("export async function deleteMember"));
  assert.match(fn, /if \(current\.userId\)[\s\S]*Change the account role in Administration/);
  assert.match(fn, /cannot be changed here/);
  assert.match(fn, /assertAcademicReferences\(/);
});

test("admin master-data API is admin-only for writes and never deletes", () => {
  const api = read("src/app/api/academic/route.ts");
  assert.equal((api.match(/requireAdmin\(\)/g) ?? []).length, 2, "POST and PATCH require admin");
  assert.equal(/export async function DELETE/.test(api), false);
  assert.match(read("supabase/migrations/20261120_course_department.sql"), /add column if not exists department_id uuid/);
});

test("published demo and common passwords are refused everywhere a password is set", async () => {
  const { describePasswordProblem } = await import("./staff-rules.ts");
  for (const pw of ["admin123", "Admin123", "student123", "librarian123", "password123", "aaaaaaaa"]) {
    assert.match(describePasswordProblem(pw) ?? "", /too common|publicly known/, pw);
  }
  assert.match(describePasswordProblem("short") ?? "", /at least 8/);
  assert.equal(describePasswordProblem("Tr4c-Library-2026"), null);
  assert.match(read("src/app/api/auth/reset-password/route.ts"), /describePasswordProblem\(newPassword\)/);
});

// ── Structured academic form (department → course → year level) ─────────────
test("year levels follow the program length; Irregular/Graduate Student always offered", async () => {
  const { yearLevelsForProgram, isValidProgramYears } = await import("./academic.ts");
  assert.deepEqual(yearLevelsForProgram(4), ["1st Year", "2nd Year", "3rd Year", "4th Year", "Irregular", "Graduate Student"]);
  assert.equal(yearLevelsForProgram(5).includes("5th Year"), true);
  assert.equal(yearLevelsForProgram(5).includes("6th Year"), false);
  assert.equal(yearLevelsForProgram(null).includes("6th Year"), true, "length not set → all years");
  assert.equal(yearLevelsForProgram(99).length, 8, "invalid length falls back to all");
  assert.equal(isValidProgramYears(4), true);
  assert.equal(isValidProgramYears(null), true);
  for (const bad of [0, 7, 4.5, "4"]) assert.equal(isValidProgramYears(bad), false, String(bad));
});

test("server rejects a year level beyond the course's program length", () => {
  const c = { id: C1, code: "BSIT", active: true, departmentId: D1, programYears: 4 };
  const d = { id: D1, code: "CIT", active: true };
  assert.deepEqual(academicReferenceProblems({ departmentId: D1, courseId: C1, yearLevel: "4th Year" }, { department: d, course: c }), []);
  assert.deepEqual(academicReferenceProblems({ departmentId: D1, courseId: C1, yearLevel: "Irregular" }, { department: d, course: c }), []);
  assert.deepEqual(
    academicReferenceProblems({ departmentId: D1, courseId: C1, yearLevel: "5th Year" }, { department: d, course: c }),
    ["BSIT is a 4-year program; 5th Year is not available."]
  );
});

test("student year levels: 1st-6th, Irregular, Graduate Student", () => {
  const p = (yearLevel: string) => validateAcademicInput({ ...goodStudent, yearLevel }).join(" ");
  for (const y of ["6th Year", "Irregular", "Graduate Student"]) assert.equal(p(y), "", y);
  assert.match(p("Not Applicable"), /yearLevel must be one of/, "students always have a year level");
});

test("faculty and teachers may record a department; it is shape-checked", () => {
  assert.deepEqual(validateAcademicInput({ memberType: "faculty", departmentId: D1 }), []);
  assert.deepEqual(validateAcademicInput({ memberType: "faculty" }), [], "department optional for faculty");
  assert.match(validateAcademicInput({ memberType: "teacher", departmentId: "CIT" }).join(), /valid department ID/);
  assert.deepEqual(validateAcademicInput({ memberType: "community", departmentId: "junk" }), [], "community carries none");
  const store = read("src/lib/store.ts");
  assert.match(store, /const hasDepartment = DEPARTMENT_MEMBER_TYPES\.includes/);
});

test("faculty is a valid account role in fresh installs and in the migration", () => {
  const six = /check \(role in \('student', ?'faculty', ?'teacher', ?'community', ?'librarian', ?'admin'\)\)/;
  assert.match(read("supabase/schema.sql"), six);
  assert.match(read("supabase/migrations/20261117_academic_user_management_up.sql"), six);
});

test("suggested catalog seed is optional, inactive and never overwrites", () => {
  const seed = read("supabase/seeds/suggested_academic_catalog.sql");
  assert.equal(/,\s*true\)/.test(seed), false, "no row may be inserted active");
  assert.equal((seed.match(/on conflict \(code\) do nothing/g) ?? []).length, 2);
  assert.equal(/\bupdate\b|\bdelete\b/i.test(seed.replace(/--.*$/gm, "")), false);
  assert.match(read("supabase/migrations/20261120_course_department.sql"), /program_years between 1 and 6/);
});

test("both admin forms use the shared cascading academic fields", () => {
  for (const page of ["src/app/(desk)/staff/page.tsx", "src/app/(desk)/members/page.tsx"]) {
    const text = read(page);
    assert.match(text, /<AcademicFields mode="student"/, page);
    assert.match(text, /<AcademicFields mode="department"/, page);
    assert.match(text, /<StudentIdField/, page);
  }
  const fields = read("src/components/AcademicFields.tsx");
  assert.match(fields, /disabled=\{!value\.departmentId\}/);
  assert.match(fields, /yearLevelsForProgram\(course\?\.programYears\)/);
});
