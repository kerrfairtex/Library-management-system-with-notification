import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { profileDetailRows } from "./profile-details.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const master = {
  departments: [{ id: "d1", code: "ICS", name: "Institute of Computing Studies" }],
  courses: [{ id: "c1", code: "BSIT" }],
};
const base = { studentId: "00125", departmentId: "d1", courseId: "c1", yearLevel: "2nd Year", section: "A" };

test("students see ID, department, course, year and section", () => {
  assert.deepEqual(profileDetailRows({ memberType: "student", ...base }, master), [
    { label: "Student ID", value: "00125" },
    { label: "Department", value: "Institute of Computing Studies (ICS)" },
    { label: "Course", value: "BSIT" },
    { label: "Year level", value: "2nd Year" },
    { label: "Section", value: "A" },
  ]);
});

test("faculty see their Employee/Faculty ID and department only", () => {
  const rows = profileDetailRows({ memberType: "faculty", ...base, departmentId: null }, master);
  assert.deepEqual(rows, [
    { label: "Employee/Faculty ID", value: "00125" },
    { label: "Department", value: "Not set" },
  ]);
});

test("community see only the ID presented; staff and no member see nothing", () => {
  assert.deepEqual(profileDetailRows({ memberType: "community", ...base, studentId: null }, master), [
    { label: "ID presented", value: "Not set" },
  ]);
  assert.deepEqual(profileDetailRows({ memberType: "staff", ...base }, master), []);
  assert.deepEqual(profileDetailRows(null, master), []);
});

test("an inactive or unknown department shows as unavailable, not as a raw ID", () => {
  const rows = profileDetailRows({ memberType: "student", ...base, departmentId: "gone" }, master);
  assert.equal(rows[1].value, "Unavailable");
});

test("/api/auth/me/member returns only the caller's own member, read-only", () => {
  const route = read("src/app/api/auth/me/member/route.ts");
  assert.match(route, /requireSession\(\)/);
  assert.match(route, /getMemberByUser\(user\)/);
  assert.equal(/searchParams|request\.json/.test(route), false, "no client-chosen member");
  assert.equal(/export async function (POST|PATCH|PUT|DELETE)/.test(route), false, "read-only");
  assert.equal(/phone|email/.test(route.slice(route.indexOf("member: own"))), false, "only ID/academic fields");
});

test("the admin dashboard no longer shows a recent role changes panel", () => {
  assert.equal(/Recent role changes/.test(read("src/components/dashboard/AdminPanels.tsx")), false);
});
