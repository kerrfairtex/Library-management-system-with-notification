import test from "node:test";
import assert from "node:assert/strict";
import {
  isUuid,
  missingAcademicFields,
  profileMissingFields,
  validateAcademicInput,
} from "./academic.ts";
import { isUserRole } from "./staff-rules.ts";

test("all six account roles are accepted", () => {
  for (const role of ["student", "faculty", "teacher", "community", "librarian", "admin"]) {
    assert.equal(isUserRole(role), true, role);
  }
});

test("unknown and missing roles are rejected", () => {
  for (const role of ["guest", undefined, null, 1, ""]) {
    assert.equal(isUserRole(role), false, String(role));
  }
});

test("student requires all five academic fields", () => {
  assert.deepEqual(
    missingAcademicFields({ memberType: "student" }),
    ["studentId", "departmentId", "courseId", "yearLevel", "section"]
  );
  assert.deepEqual(
    missingAcademicFields({
      memberType: "student",
      studentId: "S-1", departmentId: "00000000-0000-0000-0000-000000000001",
      courseId: "00000000-0000-0000-0000-000000000002", yearLevel: "1st Year", section: "A",
    }),
    []
  );
});

test("whitespace-only values count as missing", () => {
  assert.deepEqual(
    missingAcademicFields({
      memberType: "student", studentId: "   ", departmentId: null,
      courseId: "", yearLevel: "\t", section: undefined,
    }),
    ["studentId", "departmentId", "courseId", "yearLevel", "section"]
  );
});

test("non-students do not require academic fields", () => {
  for (const memberType of ["faculty", "teacher", "community", "staff"] as const) {
    assert.deepEqual(missingAcademicFields({ memberType }), [], memberType);
  }
});

test("reference IDs must be UUIDs", () => {
  assert.equal(isUuid("00000000-0000-0000-0000-000000000001"), true);
  assert.equal(isUuid("IAS"), false);
  const problems = validateAcademicInput({
    memberType: "student", studentId: "S-1", departmentId: "IAS",
    courseId: "BSIT", yearLevel: "1st Year", section: "A",
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /departmentId/);
  assert.match(problems[1], /courseId/);
});

test("completeness audit flags each missing field on legacy rows", () => {
  assert.deepEqual(
    profileMissingFields({ studentId: "S-1", departmentId: null, courseId: null, yearLevel: "", section: null }),
    ["departmentId", "courseId", "yearLevel", "section"]
  );
});
