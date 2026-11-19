import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, filterMembers, membersToCsv, NO_FILTERS } from "./member-export.ts";
import type { Member } from "./types.ts";

const member = (o: Partial<Member>): Member => ({
  id: "m", name: "Ana Cruz", email: "ana@x.edu", phone: "0917", memberType: "student",
  studentId: "2026-00125", grade: null, departmentId: "d1", courseId: "c1", yearLevel: "1st Year",
  section: "A", joinedAt: "2026-01-01", active: true, userId: null, ...o,
});

test("csvCell quotes commas, quotes and newlines", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("Cruz, Ana"), '"Cruz, Ana"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell(null), "");
});

test("csvCell neutralises formula injection", () => {
  for (const evil of ["=HYPERLINK(\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) {
    assert.ok(csvCell(evil).replace(/^"/, "").startsWith("'"), evil);
  }
  assert.equal(csvCell("=1,2"), `"'=1,2"`);
  assert.equal(csvCell("2026-00125"), "2026-00125", "IDs with inner dashes untouched");
});

test("membersToCsv writes the header, codes and yes/no, keeping leading zeros", () => {
  const csv = membersToCsv(
    [member({ studentId: "00125" }), member({ name: "Ben", memberType: "community", studentId: null, departmentId: null, courseId: null, yearLevel: null, section: null, active: false })],
    { departments: [{ id: "d1", code: "ICS" }], courses: [{ id: "c1", code: "BSIT" }] }
  );
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines[0], "Name,Email,Phone,Type,ID number,Department,Course,Year level,Section,Active");
  assert.equal(lines[1], "Ana Cruz,ana@x.edu,0917,student,00125,ICS,BSIT,1st Year,A,yes");
  assert.equal(lines[2], "Ben,ana@x.edu,0917,community,,,,,,no");
});

test("filterMembers combines type, department, course, year and text (incl. ID)", () => {
  const rows = [
    member({ id: "1" }),
    member({ id: "2", courseId: "c2" }),
    member({ id: "3", yearLevel: "2nd Year" }),
    member({ id: "4", memberType: "faculty", studentId: "EMP-77", courseId: null, yearLevel: null }),
  ];
  const ids = (f: Partial<typeof NO_FILTERS>) => filterMembers(rows, { ...NO_FILTERS, ...f }).map((m) => m.id);
  assert.deepEqual(ids({}), ["1", "2", "3", "4"]);
  assert.deepEqual(ids({ courseId: "c1" }), ["1", "3"]);
  assert.deepEqual(ids({ courseId: "c1", yearLevel: "1st Year" }), ["1"]);
  assert.deepEqual(ids({ departmentId: "d9" }), []);
  assert.deepEqual(ids({ type: "faculty" }), ["4"]);
  assert.deepEqual(ids({ query: "emp-77" }), ["4"]);
});
