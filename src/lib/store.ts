import { randomUUID } from "crypto";
import { supabase, db } from "./supabase";
import { hashPassword, toPublicUser, verifyPassword } from "./auth";
import { revokeAllSessions } from "./session-store";
import { getCirculationSettings } from "./settings";
import { deriveLoanStatus } from "./loan-status";
import { describeOpenLoansTypeChangeProblem } from "./staff-rules";
import { EMAILED_TYPES, buildNoticeEmail, emailConfig, isPlausibleEmail, sendEmail } from "./email";
import { PATRON_ROLES, type Course, type Department, type StudentCompletenessAudit, type UserStatistics } from "./types";
import {
  DEPARTMENT_MEMBER_TYPES,
  InputError,
  academicReferenceProblems,
  acceptsIdNumber,
  duplicateIdNumberMessage,
  missingAcademicFields,
  normalizeIdNumber,
  profileMissingFields,
  validateAcademicInput,
  type CourseRef,
  type DepartmentRef,
} from "./academic";
import type {
  Book,
  BookItem,
  BookItemStatus,
  CirculationRule,
  DashboardStats,
  Fine,
  FineType,
  LibraryData,
  Loan,
  LoanStatus,
  Member,
  MemberType,
  Notification,
  NotificationType,
  PublicUser,
  User,
  UserRole,
  UserStatus,
  Hold,
} from "./types";

type BookRow = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  genre: string;
  category?: string | null;
  shelf_location?: string | null;
  call_number?: string | null;
  total_copies: number;
  available_copies: number;
  published_year: number;
  created_at: string;
};

type MemberRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  member_type: MemberType | null;
  student_id: string | null;
  grade: string | null;
  department_id?: string | null;
  course_id?: string | null;
  year_level?: string | null;
  section?: string | null;
  joined_at: string;
  active: boolean;
  user_id: string | null;
};

type LoanRow = {
  id: string;
  book_id: string;
  member_id: string;
  item_id: string | null;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: LoanStatus;
  renewals_count: number;
  issued_by: string | null;
};

type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_id: string | null;
  read: boolean;
  created_at: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status?: string;
  created_at: string;
  auth_user_id: string | null;
};

function mapBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    genre: row.genre,
    category: row.category ?? "General",
    shelfLocation: row.shelf_location ?? null,
    callNumber: row.call_number ?? null,
    totalCopies: row.total_copies,
    availableCopies: row.available_copies,
    publishedYear: row.published_year,
    createdAt: row.created_at,
  };
}

function mapMember(row: MemberRow): Member {
  const memberType: MemberType = row.member_type as MemberType;
  if (memberType !== "student" && memberType !== "faculty" && memberType !== "teacher" && memberType !== "community" && memberType !== "staff") {
    console.error(`Unknown member type: ${row.member_type}`);
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    memberType,
    studentId: row.student_id ?? null,
    grade: row.grade ?? null,
    departmentId: row.department_id ?? null,
    courseId: row.course_id ?? null,
    yearLevel: row.year_level ?? null,
    section: row.section ?? null,
    joinedAt: row.joined_at,
    active: row.active,
    userId: row.user_id ?? null,
  };
}

function normalizeMemberType(value: unknown): MemberType {
  if (value === "staff" || value === "community" || value === "student" || value === "faculty" || value === "teacher") {
    return value;
  }
  return "student";
}

function assertMemberInput(input: {
  memberType: MemberType;
  studentId: string | null;
  grade: string | null;
  departmentId?: string | null;
  courseId?: string | null;
  yearLevel?: string | null;
  section?: string | null;
}) {
  const problems = validateAcademicInput({
    memberType: input.memberType,
    studentId: input.studentId,
    departmentId: input.departmentId,
    courseId: input.courseId,
    yearLevel: input.yearLevel,
    section: input.section,
  });
  if (problems.length > 0) throw new InputError(problems.join(" "));
}

/**
 * Database check of a student's department/course choice: both must exist,
 * be active (unless unchanged from the member's current value) and match
 * (course offered by that department). Throws InputError with every problem.
 */
async function assertAcademicReferences(
  chosen: { departmentId: string | null; courseId: string | null; yearLevel?: string | null },
  current: { departmentId: string | null; courseId: string | null } = { departmentId: null, courseId: null }
): Promise<void> {
  if (!chosen.departmentId && !chosen.courseId) return;
  const [deptRes, courseRes] = await Promise.all([
    chosen.departmentId
      ? db(supabase).from("departments").select("*").eq("id", chosen.departmentId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    chosen.courseId
      ? db(supabase).from("courses").select("*").eq("id", chosen.courseId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  throwIfError(deptRes.error, "Failed to check department.");
  throwIfError(courseRes.error, "Failed to check course.");
  const d = deptRes.data as { id: string; code: string; active: boolean } | null;
  const c = courseRes.data as {
    id: string; code: string; active: boolean; department_id?: string | null; program_years?: number | null;
  } | null;
  const department: DepartmentRef | null = d ? { id: d.id, code: d.code, active: d.active } : null;
  const course: CourseRef | null = c
    ? { id: c.id, code: c.code, active: c.active, departmentId: c.department_id ?? null, programYears: c.program_years ?? null }
    : null;

  let ownerCode: string | undefined;
  if (course?.departmentId && course.departmentId !== chosen.departmentId) {
    const { data: owner } = await db(supabase)
      .from("departments").select("code").eq("id", course.departmentId).maybeSingle();
    ownerCode = (owner as { code?: string } | null)?.code;
  }
  const problems = academicReferenceProblems(chosen, { department, course }, current, () => ownerCode);
  if (problems.length > 0) throw new InputError(problems.join(" "));
}

/**
 * ID numbers (members.student_id) are unique per member type, ignoring case
 * and surrounding spaces (DB index members_type_id_number_unique). Pre-check
 * for a clear 409 instead of a raw constraint error.
 */
async function assertIdNumberFree(
  memberType: MemberType,
  idNumber: string | null,
  exceptMemberId?: string
) {
  if (!idNumber) return;
  let query = db(supabase)
    .from("members")
    .select("id")
    .eq("member_type", memberType)
    .ilike("student_id", escapeLike(idNumber.trim()))
    .limit(1);
  if (exceptMemberId) query = query.neq("id", exceptMemberId);
  const { data, error } = await query;
  throwIfError(error, "Failed to check ID number.");
  if (data && data.length > 0) {
    throw new InputError(duplicateIdNumberMessage(memberType), 409);
  }
}

/** Loans not yet returned for one member. */
export async function countOpenLoansForMember(memberId: string): Promise<number> {
  const { count, error } = await db(supabase)
    .from("loans")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .neq("status", "returned");
  throwIfError(error, "Failed to count open loans.");
  return count ?? 0;
}

/** Open loans of the member linked to a login account (0 when none is linked). */
export async function countOpenLoansForUser(userId: string): Promise<number> {
  const { data, error } = await db(supabase).from("members").select("id").eq("user_id", userId).limit(1);
  throwIfError(error, "Failed to load member.");
  const memberId = (data as { id: string }[] | null)?.[0]?.id;
  return memberId ? countOpenLoansForMember(memberId) : 0;
}

/** Maps a unique violation on members to a readable 409 message. */
function memberUniqueViolationMessage(message: string | undefined, memberType: MemberType): string {
  return /student_id|id_number/i.test(message ?? "")
    ? duplicateIdNumberMessage(memberType)
    : "A member with this email already exists.";
}

function mapLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    bookId: row.book_id,
    memberId: row.member_id,
    itemId: row.item_id,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    status: deriveLoanStatus(row),
    renewalsCount: row.renewals_count ?? 0,
    issuedBy: row.issued_by,
  };
}

function mapNotification(row: NotificationRow): Notification {
  const extra = row as NotificationRow & {
    recipient_member_id?: string | null;
    audience?: string | null;
  };
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedId: row.related_id ?? undefined,
    read: row.read,
    createdAt: row.created_at,
    recipient_member_id: extra.recipient_member_id ?? undefined,
    audience: extra.audience === "member" || extra.audience === "staff" ? extra.audience : undefined,
  };
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    // Fail closed: only an explicit "active" is active. Any other value
    // (including legacy NULL) stays non-active and is blocked by authz.
    status: row.status === "active" ? "active" : "pending",
    createdAt: row.created_at,
    authUserId: row.auth_user_id,
  };
}

/**
 * PostgREST returns this when a table isn't visible to the API yet —
 * either the table genuinely doesn't exist, or it was just created and
 * PostgREST's schema cache hasn't picked it up. Both cases need the same
 * remedy, so give a single actionable message instead of a raw DB error.
 */
function isSchemaCacheMiss(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST205" || /schema cache/i.test(error.message ?? "");
}

export function describeSupabaseError(
  error: { code?: string; message?: string },
  fallback: string
): string {
  if (isSchemaCacheMiss(error)) {
    return (
      `${fallback} Supabase says: "${error.message}". Fix this by:\n` +
      "1. Running supabase/schema.sql in the Supabase SQL editor for THIS project " +
      "(Table Editor should show users/books/members/loans/notifications afterward).\n" +
      '2. Forcing PostgREST to refresh: run `select pg_notify(\'pgrst\', \'reload schema\');` ' +
      'in the SQL editor, or in the dashboard go to Settings → API and click "Reload schema".\n' +
      '3. Confirming "public" is listed under Settings → API → Exposed schemas.\n' +
      "4. Double-checking SUPABASE_URL points at this same project (a mismatched " +
      "project URL/key produces this exact error even when the table exists elsewhere).\n" +
      "Run `npm run db:check` locally to verify connectivity and see which tables are visible."
    );
  }
  return `${fallback} Supabase says: "${error.message ?? "unknown error"}".`;
}

/**
 * PostgREST returns at most `max-rows` (1,000 on Supabase) rows per request
 * and does not say it cut the list short. Every "whole table" read goes
 * through here: it asks for PAGE_SIZE rows at a time with range() until a
 * short page comes back. `build` must return a fresh, fully ordered query
 * each call; a unique tiebreaker column (id) keeps pages from overlapping.
 */
const PAGE_SIZE = 1000;

type PagedResult = { data: unknown[] | null; error: { code?: string; message?: string } | null };
type RangeQuery = { range(from: number, to: number): PromiseLike<PagedResult> };

export async function fetchAllRows<Row>(
  build: () => RangeQuery
): Promise<{ data: Row[]; error: PagedResult["error"] }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

function throwIfError(
  error: { code?: string; message?: string } | null,
  fallback: string
): void {
  if (error) throw new Error(describeSupabaseError(error, fallback));
}

async function insertNotification(
  type: NotificationType,
  title: string,
  message: string,
  relatedId?: string
): Promise<Notification> {
  const row = {
    id: randomUUID(),
    type,
    title,
    message,
    related_id: relatedId ?? null,
    read: false,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await db(supabase)
    .from("notifications")
    .insert(row)
    .select("*")
    .single();

  throwIfError(error, "Failed to create notification.");
  return mapNotification(data as NotificationRow);
}

export type LoanSweepResult = {
  markedOverdue: number;
  overdueAlerts: number;
  dueSoonAlerts: number;
};

/**
 * Stamps overdue loans and sends due-date reminders. Runs on a schedule (see
 * src/app/api/cron/refresh-loans/route.ts) rather than during page loads, so a
 * dashboard visit or a notification poll never writes to the database.
 *
 * Delegates to sweep_loan_statuses() on the database: a transaction-scoped
 * advisory lock serializes overlapping runs, the stamp re-checks due_at (a
 * renewed loan cannot be stamped), and the 4-day cooldown check plus each
 * notification insert share the transaction, so duplicate alerts are
 * impossible even if Vercel fires the cron twice.
 */
export async function sweepLoanStatuses(): Promise<LoanSweepResult> {
  const { due_soon_window_days, overdue_alert_cooldown_days } = await getCirculationSettings();
  let { data, error } = await db(supabase).rpc("sweep_loan_statuses", {
    p_due_soon_days: due_soon_window_days,
    p_cooldown_days: overdue_alert_cooldown_days,
  });
  // Before 20261123_circulation_rules_enforced.sql the function takes no
  // arguments (fixed 3-day window, 4-day cooldown). PostgREST answers
  // PGRST202 for "no function with these arguments"; fall back to it.
  if (error?.code === "PGRST202") {
    ({ data, error } = await db(supabase).rpc("sweep_loan_statuses"));
  }
  if (error) {
    throw new Error(error.message || "Loan sweep failed.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    markedOverdue: row?.marked_overdue ?? 0,
    overdueAlerts: row?.overdue_alerts ?? 0,
    dueSoonAlerts: row?.due_soon_alerts ?? 0,
  };
}

/**
 * Hold-shelf expiry (Koha "ExpireReservesMaxPickUpDelay", Evergreen "clear
 * holds shelf"). A hold marked ready gets a pickup window (expires_at); once
 * it passes, the hold is expired so the copy is released and the member can
 * request the title again (the one-active-hold index covers pending/ready).
 */
export async function expireStaleHolds(now = new Date()): Promise<number> {
  const { data, error } = await db(supabase)
    .from("holds")
    .update({ status: "expired" })
    .eq("status", "ready")
    .lt("expires_at", now.toISOString())
    .select("id, book_id, member_id");
  if (error) throw new Error(error.message || "Hold expiry failed.");
  const rows = (data ?? []) as { id: string; book_id: string; member_id: string }[];
  if (rows.length > 0) {
    const { error: notifyError } = await db(supabase).from("notifications").insert(
      rows.map((h) => ({
        type: "hold_expired",
        title: "Hold expired",
        message: "Your reserved book was not picked up in time and has been released. You can request it again.",
        related_id: h.book_id,
        recipient_member_id: h.member_id,
        audience: "member",
        read: false,
      }))
    );
    if (notifyError) throw new Error(notifyError.message || "Hold expiry notice failed.");
  }
  return rows.length;
}

export type EmailDispatchResult = { enabled: boolean; sent: number; failed: number; skipped: number };

/**
 * Sends e-mail copies of recent member notifications (see src/lib/email.ts).
 * Each row is claimed by stamping emailed_at with a conditional update before
 * sending, so concurrent or repeated sweeps never send a notice twice. Only
 * notices from the last 3 days are mailed, so a late opt-in or a long outage
 * cannot flood inboxes with stale reminders.
 */
export async function dispatchNotificationEmails(limit = 200): Promise<EmailDispatchResult> {
  const config = emailConfig(process.env);
  if (!config) return { enabled: false, sent: 0, failed: 0, skipped: 0 };

  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db(supabase)
    .from("notifications")
    .select("id, type, title, message, recipient_member_id")
    .is("emailed_at", null)
    .eq("audience", "member")
    .in("type", [...EMAILED_TYPES])
    .gte("created_at", since)
    .not("recipient_member_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message || "Failed to load notifications for e-mail.");

  const rows = (data ?? []) as {
    id: string; type: string; title: string; message: string; recipient_member_id: string;
  }[];
  if (rows.length === 0) return { enabled: true, sent: 0, failed: 0, skipped: 0 };

  const memberIds = [...new Set(rows.map((r) => r.recipient_member_id))];
  const { data: members, error: memberErr } = await db(supabase)
    .from("members")
    .select("id, name, email")
    .in("id", memberIds);
  if (memberErr) throw new Error(memberErr.message || "Failed to load members for e-mail.");
  const byId = new Map(
    ((members ?? []) as { id: string; name: string; email: string | null }[]).map((m) => [m.id, m])
  );

  const result: EmailDispatchResult = { enabled: true, sent: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    // Claim first: only the sweep whose update matches sends this notice.
    const { data: claimed, error: claimErr } = await db(supabase)
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("emailed_at", null)
      .select("id");
    if (claimErr) throw new Error(claimErr.message || "Failed to claim notification for e-mail.");
    if (!claimed || (claimed as unknown[]).length === 0) continue;

    const member = byId.get(row.recipient_member_id);
    if (!member || !isPlausibleEmail(member.email)) {
      result.skipped++;
      continue;
    }
    try {
      await sendEmail(config, member.email.trim(), buildNoticeEmail(row, member.name ?? "", config.siteUrl));
      result.sent++;
    } catch {
      // Release the claim so the next sweep retries this notice.
      await db(supabase).from("notifications").update({ emailed_at: null }).eq("id", row.id);
      result.failed++;
    }
  }
  return result;
}

/** Sum of a member's unpaid fines (amount_outstanding), in pesos. */
export async function getOutstandingFines(memberId: string): Promise<number> {
  const { data, error } = await db(supabase)
    .from("fines")
    .select("amount_outstanding")
    .eq("member_id", memberId)
    .gt("amount_outstanding", 0);
  if (error) throw new Error(error.message || "Failed to load fines.");
  return ((data ?? []) as { amount_outstanding: number | string }[]).reduce(
    (sum, f) => sum + Number(f.amount_outstanding),
    0
  );
}



export async function getDashboardStats(): Promise<DashboardStats> {
  const data = await getLibraryData();
  return computeDashboardStats(data);
}

/**
 * Lightweight table reads for endpoints that only need one entity type,
 * cutting per-request Supabase round trips for pages that don't need every
 * table just to list books or members.
 */
export async function listBooks(): Promise<Book[]> {
  const { data, error } = await fetchAllRows(() =>
    db(supabase).from("books").select("*").order("created_at", { ascending: false }).order("id")
  );
  throwIfError(error, "Failed to load books.");
  return ((data as BookRow[] | null) ?? []).map(mapBook);
}

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await fetchAllRows(() =>
    db(supabase).from("members").select("*").order("joined_at", { ascending: false }).order("id")
  );
  throwIfError(error, "Failed to load members.");
  return ((data as MemberRow[] | null) ?? []).map(mapMember);
}

export async function getLoansData(): Promise<{
  loans: Loan[];
  books: Book[];
  members: Member[];
}> {
  const [loansRes, booksRes, membersRes] = await Promise.all([
    fetchAllRows(() => db(supabase).from("loans").select("*").order("borrowed_at", { ascending: false }).order("id")),
    fetchAllRows(() => db(supabase).from("books").select("*").order("id")),
    fetchAllRows(() => db(supabase).from("members").select("*").order("id")),
  ]);
  throwIfError(loansRes.error, "Failed to load loans.");
  throwIfError(booksRes.error, "Failed to load books.");
  throwIfError(membersRes.error, "Failed to load members.");
  return {
    loans: ((loansRes.data as LoanRow[] | null) ?? []).map(mapLoan),
    books: ((booksRes.data as BookRow[] | null) ?? []).map(mapBook),
    members: ((membersRes.data as MemberRow[] | null) ?? []).map(mapMember),
  };
}

export type NotificationFilter =
  | { kind: "member"; memberId: string }
  | { kind: "staff" };

/**
 * Inbox read. The recipient filter runs in SQL so a member's inbox never
 * depends on how many notices other people have.
 */
export async function getNotificationsData(filter?: NotificationFilter): Promise<Notification[]> {
  const { data, error } = await fetchAllRows(() => {
    let query = db(supabase).from("notifications").select("*");
    if (filter?.kind === "member") {
      query = query.eq("audience", "member").eq("recipient_member_id", filter.memberId);
    } else if (filter?.kind === "staff") {
      // Staff-addressed alerts plus legacy rows with no recipient.
      query = query.or("audience.eq.staff,recipient_member_id.is.null");
    }
    return query.order("created_at", { ascending: false }).order("id");
  });
  throwIfError(error, "Failed to load notifications.");
  return ((data as NotificationRow[] | null) ?? []).map(mapNotification);
}

export async function createBook(
  input: Omit<Book, "id" | "availableCopies" | "createdAt">
): Promise<Book> {
  const row = {
    id: randomUUID(),
    title: input.title,
    author: input.author,
    isbn: input.isbn,
    genre: input.genre,
    category: input.category ?? "General",
    shelf_location: input.shelfLocation ?? null,
    call_number: input.callNumber ?? null,
    total_copies: input.totalCopies,
    available_copies: input.totalCopies,
    published_year: input.publishedYear,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await db(supabase).from("books").insert(row).select("*").single();
  throwIfError(error, "Failed to create book.");

  const book = mapBook(data as BookRow);
  await insertNotification(
    "book_added",
    "New book added",
    `"${book.title}" by ${book.author} was added to the catalog.`,
    book.id
  );
  return book;
}

export async function updateBook(
  id: string,
  updates: Partial<Omit<Book, "id" | "createdAt">>
): Promise<Book | null> {
  const { data: existing, error: fetchError } = await db(supabase)
    .from("books")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load book.");
  if (!existing) return null;

  const book = mapBook(existing as BookRow);
  const borrowed = book.totalCopies - book.availableCopies;
  const patch: Partial<BookRow> = {};

  if (updates.totalCopies !== undefined) {
    if (updates.totalCopies < borrowed) {
      throw new Error(`Cannot set total copies below ${borrowed} (currently borrowed).`);
    }
    patch.total_copies = updates.totalCopies;
    patch.available_copies = updates.totalCopies - borrowed;
  }
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.author !== undefined) patch.author = updates.author;
  if (updates.isbn !== undefined) patch.isbn = updates.isbn;
  if (updates.genre !== undefined) patch.genre = updates.genre;
  if (updates.category !== undefined) patch.category = updates.category || "General";
  if (updates.shelfLocation !== undefined)
    patch.shelf_location = updates.shelfLocation?.trim() || null;
  if (updates.callNumber !== undefined)
    patch.call_number = updates.callNumber?.trim() || null;
  if (updates.publishedYear !== undefined) patch.published_year = updates.publishedYear;

  const { data, error } = await db(supabase)
    .from("books")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to update book.");

  const updated = mapBook(data as BookRow);
  if (updated.availableCopies === 0) {
    await insertNotification(
      "low_stock",
      "No copies available",
      `"${updated.title}" has 0 available copies.`,
      updated.id
    );
  }
  return updated;
}

/**
 * Loans reference books and members with ON DELETE RESTRICT, so returned loans
 * block a delete just as active ones do. Checking both here keeps the failure
 * readable instead of surfacing a raw foreign-key violation.
 */
function assertNoLoanHistory(
  loans: Pick<LoanRow, "status">[] | null,
  subject: "book" | "member"
) {
  if (!loans || loans.length === 0) return;
  const active = loans.filter((loan) => loan.status !== "returned").length;
  if (active > 0) {
    throw new Error(`Cannot delete a ${subject} with active loans.`);
  }
  throw new Error(
    `Cannot delete a ${subject} with loan history. ` +
      `${loans.length} past loan${loans.length === 1 ? "" : "s"} reference${
        loans.length === 1 ? "s" : ""
      } it.`
  );
}

export async function deleteBook(id: string): Promise<boolean> {
  const { data: loans, error: loanError } = await db(supabase)
    .from("loans")
    .select("status")
    .eq("book_id", id);
  throwIfError(loanError, "Failed to check book loans.");
  assertNoLoanHistory(loans as Pick<LoanRow, "status">[] | null, "book");

  const { data, error } = await db(supabase).from("books").delete().eq("id", id).select("id");
  throwIfError(error, "Failed to delete book.");
  return Boolean(data && data.length > 0);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await db(supabase)
    .from("users")
    .select("id")
    .ilike("email", escapeLike(email.trim()))
    .limit(1)
    .maybeSingle();
  return data ? (data as { id: string }).id : null;
}

export async function createMember(
  input: Omit<Member, "id" | "joinedAt" | "active">
): Promise<Member> {
  const memberType = normalizeMemberType(input.memberType);
  // ID number (student/employee/presented ID) for every patron type.
  const studentId = acceptsIdNumber(memberType) ? normalizeIdNumber(input.studentId) : null;
  const grade =
    memberType === "student" ? (input.grade?.trim() || null) : null;
  // Students require a department; faculty/teachers may record one.
  const departmentId = DEPARTMENT_MEMBER_TYPES.includes(memberType)
    ? (input.departmentId?.trim() || null)
    : null;
  const courseId =
    memberType === "student" ? (input.courseId?.trim() || null) : null;
  const yearLevel =
    memberType === "student" ? (input.yearLevel?.trim() || null) : null;
  const section =
    memberType === "student" ? (input.section?.trim() || null) : null;
  assertMemberInput({
    memberType, studentId, grade, departmentId, courseId, yearLevel, section,
  });
  if (DEPARTMENT_MEMBER_TYPES.includes(memberType)) {
    await assertAcademicReferences({ departmentId, courseId, yearLevel });
  }
  await assertIdNumberFree(memberType, studentId);

  const row = {
    id: randomUUID(),
    name: input.name,
    email: input.email.trim().toLowerCase(),
    phone: input.phone,
    member_type: memberType,
    student_id: studentId,
    grade,
    department_id: departmentId,
    course_id: courseId,
    year_level: yearLevel,
    section,
    joined_at: new Date().toISOString(),
    active: true,
    user_id: await findUserIdByEmail(input.email),
  };

  const { data, error } = await db(supabase).from("members").insert(row).select("*").single();
  if (error && error.code === "23505") {
    throw new InputError(memberUniqueViolationMessage(error.message, memberType), 409);
  }
  throwIfError(error, "Failed to create member.");

  const member = mapMember(data as MemberRow);
  const label =
    member.memberType === "student"
      ? `Student ${member.name}${member.studentId ? ` (${member.studentId})` : ""}`
      : member.name;
  await insertNotification(
    "member_added",
    member.memberType === "student" ? "New student registered" : "New member registered",
    `${label} joined the library.`,
    member.id
  );
  return member;
}

export async function updateMember(
  id: string,
  updates: Partial<Omit<Member, "id" | "joinedAt">>
): Promise<Member | null> {
  const { data: existing, error: fetchError } = await db(supabase)
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load member.");
  if (!existing) return null;

  const current = mapMember(existing as MemberRow);
  const nextType = updates.memberType
    ? normalizeMemberType(updates.memberType)
    : current.memberType;
  const nextStudentId =
    updates.studentId !== undefined
      ? updates.studentId?.trim() || null
      : current.studentId;
  const nextGrade =
    updates.grade !== undefined ? updates.grade?.trim() || null : current.grade;
  const nextDepartmentId =
    updates.departmentId !== undefined
      ? updates.departmentId?.trim() || null
      : current.departmentId;
  const nextCourseId =
    updates.courseId !== undefined
      ? updates.courseId?.trim() || null
      : current.courseId;
  const nextYearLevel =
    updates.yearLevel !== undefined
      ? updates.yearLevel?.trim() || null
      : current.yearLevel;
  const nextSection =
    updates.section !== undefined
      ? updates.section?.trim() || null
      : current.section;

  const resolvedStudentId = acceptsIdNumber(nextType) ? normalizeIdNumber(nextStudentId) : null;
  const resolvedGrade = nextType === "student" ? nextGrade : null;
  const resolvedDepartmentId = DEPARTMENT_MEMBER_TYPES.includes(nextType) ? nextDepartmentId : null;
  const resolvedCourseId = nextType === "student" ? nextCourseId : null;
  const resolvedYearLevel = nextType === "student" ? nextYearLevel : null;
  const resolvedSection = nextType === "student" ? nextSection : null;

  // A member linked to a login account takes its category from the account
  // role (change_user_role keeps them in sync) and its email is the login
  // identity. Changing either here would desync them, so refuse.
  if (current.userId) {
    if (updates.memberType !== undefined && nextType !== current.memberType) {
      throw new InputError(
        "This member is linked to a login account. Change the account role in Administration instead.",
        409
      );
    }
    if (
      updates.email !== undefined &&
      updates.email.trim().toLowerCase() !== current.email.trim().toLowerCase()
    ) {
      throw new InputError(
        "This member is linked to a login account; its email is the sign-in address and cannot be changed here.",
        409
      );
    }
  }

  if (nextType !== current.memberType) {
    const problem = describeOpenLoansTypeChangeProblem(await countOpenLoansForMember(id));
    if (problem) throw new InputError(problem, 409);
  }

  const touchingIdentity =
    updates.memberType !== undefined ||
    updates.studentId !== undefined ||
    updates.grade !== undefined ||
    updates.departmentId !== undefined ||
    updates.courseId !== undefined ||
    updates.yearLevel !== undefined ||
    updates.section !== undefined;
  if (touchingIdentity || nextType === "student") {
    // Allow legacy rows missing student_id until staff edits them,
    // but require an ID whenever type/student fields are being saved as student.
    if (touchingIdentity) {
      assertMemberInput({
        memberType: nextType,
        studentId: resolvedStudentId,
        grade: resolvedGrade,
        departmentId: resolvedDepartmentId,
        courseId: resolvedCourseId,
        yearLevel: resolvedYearLevel,
        section: resolvedSection,
      });
      if (DEPARTMENT_MEMBER_TYPES.includes(nextType)) {
        await assertAcademicReferences(
          { departmentId: resolvedDepartmentId, courseId: resolvedCourseId, yearLevel: resolvedYearLevel },
          { departmentId: current.departmentId, courseId: current.courseId }
        );
      }
      if (resolvedStudentId !== current.studentId || nextType !== current.memberType) {
        await assertIdNumberFree(nextType, resolvedStudentId, id);
      }
    }
  }

  const patch: Partial<MemberRow> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.email !== undefined) patch.email = updates.email.trim().toLowerCase();
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.active !== undefined) patch.active = updates.active;
  if (updates.userId !== undefined) patch.user_id = updates.userId;
  if (touchingIdentity) {
    patch.member_type = nextType;
    patch.student_id = resolvedStudentId;
    patch.grade = resolvedGrade;
    patch.department_id = resolvedDepartmentId;
    patch.course_id = resolvedCourseId;
    patch.year_level = resolvedYearLevel;
    patch.section = resolvedSection;
  }

  const { data, error } = await db(supabase)
    .from("members")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error && error.code === "23505") {
    throw new InputError(memberUniqueViolationMessage(error.message, nextType), 409);
  }
  throwIfError(error, "Failed to update member.");
  return mapMember(data as MemberRow);
}

export async function deleteMember(id: string): Promise<boolean> {
  const { data: loans, error: loanError } = await db(supabase)
    .from("loans")
    .select("status")
    .eq("member_id", id);
  throwIfError(loanError, "Failed to check member loans.");
  assertNoLoanHistory(loans as Pick<LoanRow, "status">[] | null, "member");

  const { data, error } = await db(supabase).from("members").delete().eq("id", id).select("id");
  throwIfError(error, "Failed to delete member.");
  return Boolean(data && data.length > 0);
}

export async function checkoutBook(
  bookId: string,
  memberId: string,
  days = 7,
  issuedBy?: string
): Promise<Loan> {
  // Runs checkout_loan() on the database: one transaction that atomically
  // decrements availability (WHERE available_copies > 0), inserts the loan
  // (the loans_capacity trigger is the final authority on copies and the
  // 5-active-loan cap) and creates the notifications. Any failure rolls
  // back the whole checkout — no manual compensation write needed.
  const { data, error } = await db(supabase).rpc("checkout_loan", {
    p_book_id: bookId,
    p_member_id: memberId,
    p_days: days,
    p_issued_by: issuedBy ?? null,
  });
  if (error) {
    throw new Error(error.message || "Failed to checkout book.");
  }
  return mapLoan(data as LoanRow);
}

export async function returnBook(loanId: string): Promise<Loan> {
  // Runs return_loan() on the database: one transaction that conditionally
  // marks the loan returned (a duplicate return is rejected, not
  // double-incremented) and restores availability with an atomic capped
  // increment. The availability update can no longer fail silently.
  const { data, error } = await db(supabase).rpc("return_loan", {
    p_loan_id: loanId,
  });
  if (error) {
    throw new Error(error.message || "Failed to return book.");
  }
  return mapLoan(data as LoanRow);
}

export async function renewLoan(loanId: string, extraDays = 7): Promise<Loan> {
  // Runs renew_loan() on the database: one transaction that validates the
  // extension, refuses returned loans (a renew racing a return can no longer
  // resurrect it), checks the member is still active, extends the due date
  // monotonically, and creates the notification.
  const { data, error } = await db(supabase).rpc("renew_loan", {
    p_loan_id: loanId,
    p_extra_days: extraDays,
  });
  if (error) {
    throw new Error(error.message || "Failed to renew loan.");
  }
  return mapLoan(data as LoanRow);
}

export type NotificationScope =
  | { kind: "member"; memberId: string }
  | { kind: "staff" };

export async function markNotificationRead(id: string, scope: NotificationScope): Promise<Notification | null> {
  const base = db(supabase).from("notifications").update({ read: true }).eq("id", id);
  const scoped =
    scope.kind === "member"
      ? base.eq("recipient_member_id", scope.memberId).eq("audience", "member")
      : base.or("audience.eq.staff,recipient_member_id.is.null");
  const { data, error } = await scoped.select("*").maybeSingle();
  throwIfError(error, "Failed to mark notification read.");
  return data ? mapNotification(data as NotificationRow) : null;
}

export async function markAllNotificationsRead(scope: NotificationScope): Promise<number> {
  const base = db(supabase).from("notifications").update({ read: true }).eq("read", false);
  const scoped =
    scope.kind === "member"
      ? base.eq("recipient_member_id", scope.memberId).eq("audience", "member")
      : base.or("audience.eq.staff,recipient_member_id.is.null");
  const { data, error } = await scoped.select("id");
  throwIfError(error, "Failed to mark notifications read.");
  return (data ?? []).length;
}

/** True when the account exists but is still awaiting librarian approval. */
export async function isAccountPending(email: string): Promise<boolean> {
  const { data } = await db(supabase)
    .from("users")
    .select("status")
    .ilike("email", escapeLike(email.trim()))
    .maybeSingle();
  // Fail closed: only an explicitly ACTIVE account may proceed. NULL,
  // unknown, or pending statuses block sign-in (no silent activation).
  return (data as { status?: string } | null)?.status !== "active";
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const { data, error } = await db(supabase)
    .from("users")
    .select("*")
    .ilike("email", escapeLike(email.trim()))
    .maybeSingle();

  throwIfError(error, "Failed to look up user in Supabase.");
  if (!data) return null;
  const user = mapUser(data as UserRow);
  if (!verifyPassword(password, user.passwordHash)) return null;
  return toPublicUser(user);
}

export async function getUserById(id: string): Promise<User | null> {
  // Select safe columns only — password_hash excluded by RLS policy
  const { data, error } = await db(supabase)
    .from("users")
    .select("id,name,email,password_hash,role,status,created_at,auth_user_id")
    .eq("id", id)
    .maybeSingle();
  // Swallowed on purpose: this backs session validation on every request,
  // so a transient/config error here should look like "not signed in"
  // rather than crashing every page load.
  if (error || !data) return null;
  return mapUser(data as UserRow);
}

export async function getPublicUserById(id: string): Promise<PublicUser | null> {
  const user = await getUserById(id);
  return user ? toPublicUser(user) : null;
}

export async function listStaff(): Promise<PublicUser[]> {
  // Select safe columns only — password_hash excluded by RLS policy
  const { data, error } = await fetchAllRows(() =>
    db(supabase)
      .from("users")
      .select("id,name,email,password_hash,role,status,created_at,auth_user_id")
      .order("created_at", { ascending: true })
      .order("id")
  );
  throwIfError(error, "Failed to load staff accounts.");
  return ((data as UserRow[] | null) ?? []).map((row) => toPublicUser(mapUser(row)));
}

/** Counts ACTIVE admins only — inactive admins must not satisfy the last-admin guard. */
export async function countAdmins(): Promise<number> {
  const { data, error } = await db(supabase)
    .from("users").select("id").eq("role", "admin").eq("status", "active");
  throwIfError(error, "Failed to count active admins.");
  return data?.length ?? 0;
}

export async function createStaff(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  /** Optional; saved to members.phone for patron accounts. */
  phone?: string | null;
  academic?: {
    studentId?: string | null;
    departmentId?: string | null;
    courseId?: string | null;
    yearLevel?: string | null;
    section?: string | null;
  };
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const isPatronRole = PATRON_ROLES.includes(input.role);
  const isStudent = input.role === "student";
  const a = input.academic ?? {};
  const hasDepartment = DEPARTMENT_MEMBER_TYPES.includes(input.role as MemberType);
  const academic = {
    // ID number for every patron type (required for student/faculty/teacher).
    studentId: acceptsIdNumber(input.role as MemberType) ? normalizeIdNumber(a.studentId) : null,
    // Required for students, optional for faculty/teachers, none otherwise.
    departmentId: hasDepartment ? a.departmentId?.trim() || null : null,
    courseId: isStudent ? a.courseId?.trim() || null : null,
    yearLevel: isStudent ? a.yearLevel?.trim() || null : null,
    section: isStudent ? a.section?.trim() || null : null,
  };

  // ── Every check runs BEFORE anything is written, so a rejected request
  //    never leaves a half-created account behind. ──
  const { data: clash, error: clashError } = await db(supabase)
    .from("users")
    .select("id")
    .ilike("email", escapeLike(email))
    .maybeSingle();
  throwIfError(clashError, "Failed to check existing accounts.");
  if (clash) throw new InputError("An account with that email already exists.", 409);

  let existing: Member | null = null;
  if (isPatronRole) {
    if (isStudent) {
      const missing = missingAcademicFields({ memberType: "student", ...academic });
      if (missing.length > 0) {
        throw new InputError(`Missing required student fields: ${missing.join(", ")}.`);
      }
    }
    assertMemberInput({ memberType: input.role as MemberType, grade: null, ...academic });
    if (hasDepartment) await assertAcademicReferences(academic);
    existing = await getMemberByEmail(email);
    if (existing?.userId) {
      throw new InputError(
        "A library member with this email is already linked to another account.",
        409
      );
    }
    await assertIdNumberFree(input.role as MemberType, academic.studentId, existing?.id);
  }

  const row = {
    id: randomUUID(),
    name: input.name.trim(),
    email,
    password_hash: hashPassword(input.password),
    role: input.role,
    status: "active" as const,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await db(supabase).from("users").insert(row).select("*").single();
  if (error && error.code === "23505") {
    throw new InputError("An account with that email already exists.", 409);
  }
  throwIfError(error, "Failed to create staff account.");
  const created = toPublicUser(mapUser(data as UserRow));
  if (!isPatronRole) return created;

  // Library membership: the member category always follows the account role,
  // and a student's academic profile is written whether the member row is new
  // or pre-existing (e.g. registered at the desk before the account existed).
  const memberType = input.role as MemberType;
  const memberFields = {
    member_type: memberType,
    student_id: academic.studentId,
    department_id: academic.departmentId,
    course_id: academic.courseId,
    year_level: academic.yearLevel,
    section: academic.section,
    active: true,
    user_id: row.id,
    // Only set when entered, so linking never blanks a phone already on file.
    ...(input.phone ? { phone: input.phone } : {}),
  };
  let memberError: { code?: string; message?: string } | null = null;
  if (existing) {
    const { data: linked, error: linkError } = await db(supabase)
      .from("members")
      .update(memberFields)
      .eq("id", existing.id)
      .is("user_id", null)
      .select("id");
    memberError = linkError;
    if (!linkError && (!linked || linked.length === 0)) {
      memberError = { message: "member was linked concurrently" };
    }
  } else {
    const { error: insertError } = await db(supabase).from("members").insert({
      id: randomUUID(),
      name: row.name,
      email,
      phone: null,
      grade: null,
      joined_at: new Date().toISOString(),
      ...memberFields,
    });
    memberError = insertError;
  }
  if (memberError) {
    console.error("createStaff: membership step failed:", memberError.message);
    const { error: undoError } = await db(supabase).from("users").delete().eq("id", row.id);
    if (undoError) {
      throw new Error(
        "The account was created but its library membership could not be, and the account could not be removed. Delete it and try again."
      );
    }
    if (memberError.code === "23505") {
      throw new InputError(memberUniqueViolationMessage(memberError.message, memberType), 409);
    }
    throw new Error(`Could not create the library membership for this ${memberType}, so the account was not created.`);
  }
  return created;
}

export async function updateStaff(
  id: string,
  updates: { name?: string; role?: UserRole; password?: string; status?: UserStatus }
): Promise<PublicUser | null> {
  const patch: Partial<UserRow> = {};
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.role !== undefined) patch.role = updates.role;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.password !== undefined) {
    patch.password_hash = hashPassword(updates.password);
  }
  if (Object.keys(patch).length === 0) {
    return getPublicUserById(id);
  }

  const { data, error } = await db(supabase)
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  throwIfError(error, "Failed to update staff account.");
  if (!data) return null;
  // A changed password ends every session signed in with the old one.
  if (patch.password_hash !== undefined) await revokeAllSessions(id);
  return toPublicUser(mapUser(data as UserRow));
}

export async function deleteStaff(id: string): Promise<boolean> {
  const { data, error } = await db(supabase).from("users").delete().eq("id", id).select("id");
  throwIfError(error, "Failed to delete staff account.");
  return Boolean(data && data.length > 0);
}

/**
 * Allows a signed-in user to update their own name and/or password.
 * Role changes are intentionally excluded — only an admin can change roles.
 */
export async function updateOwnProfile(
  id: string,
  updates: { name?: string; password?: string }
): Promise<User | null> {
  const patch: Partial<UserRow> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.password !== undefined) {
    patch.password_hash = hashPassword(updates.password);
  }
  if (Object.keys(patch).length === 0) {
    return getUserById(id);
  }

  const { data, error } = await db(supabase)
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  throwIfError(error, "Failed to update profile.");
  if (!data) return null;
  return mapUser(data as UserRow);
}

// -- Borrow requests --
// Reuses the existing holds table, distinguished by kind = borrow_request.
// Lifecycle: pending -> ready (approved) -> fulfilled (loan created)
//           pending -> rejected | cancelled
// Students create requests for their own member record only; staff approve,
// reject, and complete checkout through the existing checkoutBook() path.

export type BorrowRequestStatus =
  | "pending"
  | "ready"
  | "fulfilled"
  | "cancelled"
  | "expired"
  | "approved"
  | "rejected";

export async function getMemberByEmail(email: string) {
  const { data, error } = await db(supabase)
    .from("members")
    .select("*")
    .ilike("email", escapeLike(email.trim()))
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapMember(data);
}

export async function getMemberByUser(user: { id: string; email: string }) {
  const { data: byUser } = await db(supabase)
    .from("members")
    .select("*")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (byUser) return mapMember(byUser);

  const byEmail = await getMemberByEmail(user.email);
  if (!byEmail) return null;
  // Heal older accounts: remember the link (best effort, never overwrites).
  await db(supabase)
    .from("members")
    .update({ user_id: user.id })
    .eq("id", byEmail.id)
    .is("user_id", null);
  return byEmail;
}

export async function getBorrowRequests(memberId?: string) {
  type BorrowRequestRow = HoldRow & {
    books?: { isbn?: string | null; title?: string | null; author?: string | null } | null;
    members?: { name?: string | null; email?: string | null } | null;
  };
  const { data, error } = await fetchAllRows<BorrowRequestRow>(() => {
    let query = db(supabase)
      .from("holds")
      .select("*, books!inner(id, isbn, title, author), members!inner(id, name, email)")
      .eq("kind", "borrow_request");
    query = memberId
      ? query.eq("member_id", memberId)
      : query.in("status", ["pending", "ready", "approved"]);
    return query.order("placed_at", { ascending: false }).order("id");
  });
  if (error) throw new Error(error.message);
  return data.map((h) => ({
    id: h.id,
    bookId: h.book_id,
    memberId: h.member_id,
    kind: h.kind,
    status: h.status,
    priority: h.priority,
    placedAt: h.placed_at,
    expiresAt: h.expires_at ?? null,
    fulfilledLoanId: h.fulfilled_loan_id ?? null,
    isbn: h.books?.isbn ?? null,
    bookTitle: h.books?.title ?? "Unknown title",
    bookAuthor: h.books?.author ?? null,
    memberName: h.members?.name ?? "Unknown",
    memberEmail: h.members?.email ?? null,
  }));
}

export async function getBorrowRequestById(id: string) {
  const { data, error } = await db(supabase)
    .from("holds")
    .select("*")
    .eq("id", id)
    .eq("kind", "borrow_request")
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function createBorrowRequest(bookId: string, memberId: string) {
  const open = await db(supabase)
    .from("holds")
    .select("id")
    .eq("book_id", bookId)
    .eq("member_id", memberId)
    .eq("kind", "borrow_request")
    .in("status", ["pending", "ready", "approved"])
    .maybeSingle();

  if (open?.data) {
    throw new Error("You already have a pending request for this book (found by SELECT).");
  }

  const { data, error } = await db(supabase)
    .from("holds")
    .insert({
      book_id: bookId,
      member_id: memberId,
      kind: "borrow_request",
      status: "pending",
      priority: 1,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("You already have a pending request for this book (unique constraint violation on insert).");
    }
    throw new Error(`Insert failed: ${error.code} - ${error.message}`);
  }

  return mapHold(data);
}

export async function approveBorrowRequest(id: string, reviewedBy: string) {
  const { pickup_window_days } = await getCirculationSettings();
  const pickupExpires = new Date(Date.now() + pickup_window_days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db(supabase)
    .from("holds")
    .update({ status: "ready", expires_at: pickupExpires })
    .eq("id", id)
    .eq("kind", "borrow_request")
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) throw new Error(error.message || "Failed to approve request.");
  const hold = mapHold(data);

  const [{ data: bookData, error: bookErr }, { data: memberData, error: memberErr }] = await Promise.all([
    db(supabase).from("books").select("title").eq("id", hold.bookId).maybeSingle(),
    db(supabase).from("members").select("name").eq("id", hold.memberId).maybeSingle(),
  ]);

  if (bookErr || memberErr) {
    throw new Error("Failed to load book or member info.");
  }

  const title = (bookData as { title?: string }).title ?? "your requested title";
  const memberName = (memberData as { name?: string }).name ?? "";

  await db(supabase).from("notifications").insert({
    type: "borrow_request_approved",
    title: "Borrow request approved",
    message: "Your book is approved, just go to the library",
    related_id: hold.id,
    recipient_member_id: hold.memberId,
    audience: "member",
    read: false,
  });

  return hold;
}

export async function rejectBorrowRequest(id: string, reviewedBy: string, reason?: string) {
  const { data, error } = await db(supabase)
    .from("holds")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("kind", "borrow_request")
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) throw new Error(error.message || "Failed to reject request.");
  const hold = mapHold(data);

  const [{ data: bookData, error: bookErr }, { data: memberData, error: memberErr }] = await Promise.all([
    db(supabase).from("books").select("title").eq("id", hold.bookId).maybeSingle(),
    db(supabase).from("members").select("name").eq("id", hold.memberId).maybeSingle(),
  ]);

  if (bookErr || memberErr) {
    throw new Error("Failed to load book or member info.");
  }

  const title = (bookData as { title?: string }).title ?? "your requested title";
  const memberName = (memberData as { name?: string }).name ?? "";

  await db(supabase).from("notifications").insert({
    type: "borrow_request_rejected",
    title: "Borrow request not approved",
    message: (memberName ? memberName + ": " : "") + "\"" + title + "\" request was not approved" + (reason ? ": " + reason : "."),
    related_id: hold.id,
    recipient_member_id: hold.memberId,
    audience: "member",
    read: false,
  });

  return hold;
}

export async function cancelBorrowRequest(id: string, memberId: string) {
  const { error } = await db(supabase)
    .from("holds")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("kind", "borrow_request")
    .eq("member_id", memberId)
    .in("status", ["pending", "ready"])
    .select("id")
    .single();

  if (error) throw new Error(error.message || "Failed to cancel request.");
  return true;
}

export async function checkoutFromBorrowRequest(id: string, days = 14, issuedBy?: string): Promise<Loan> {
  const { data: holdData, error: holdError } = await db(supabase)
    .from("holds")
    .select("*, books(*, isbn)")
    .eq("id", id)
    .eq("kind", "borrow_request")
    .eq("status", "ready")
    .maybeSingle();

  if (holdError || !holdData) {
    throw new Error("Approved borrow request not found.");
  }

  const hold = mapHold(holdData as HoldRow);

  const loan = await checkoutBook(hold.bookId, hold.memberId, days, issuedBy);

  const { error: updateError } = await db(supabase)
    .from("holds")
    .update({ status: "fulfilled", fulfilled_loan_id: loan.id })
    .eq("id", id)
    .eq("kind", "borrow_request")
    .eq("status", "ready")
    .select("id")
    .single();

  if (updateError) {
    console.error("Failed to mark borrow request fulfilled:", updateError.message);
  }

  return loan;
}

// -- Fines --
export type FineRow = {
  id: string;
  member_id: string;
  loan_id: string | null;
  type: string;
  amount: number;
  amount_outstanding: number;
  description: string | null;
  issued_by: string | null;
  created_at: string;
  paid_at: string | null;
};

function mapFine(row: FineRow): Fine {
  return {
    id: row.id,
    memberId: row.member_id,
    loanId: row.loan_id,
    type: row.type as FineType,
    amount: row.amount,
    amountOutstanding: row.amount_outstanding,
    description: row.description,
    issuedBy: row.issued_by,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

export async function listFines(memberId?: string): Promise<Fine[]> {
  const { data, error } = await fetchAllRows(() => {
    let query = db(supabase).from("fines").select("*");
    if (memberId) query = query.eq("member_id", memberId);
    return query.order("created_at", { ascending: false }).order("id");
  });
  throwIfError(error, "Failed to load fines.");
  return ((data as FineRow[] | null) ?? []).map(mapFine);
}

export async function getFinesData(): Promise<{ fines: Fine[]; members: Member[] }> {
  const [finesRes, membersRes] = await Promise.all([
    fetchAllRows(() => db(supabase).from("fines").select("*").order("created_at", { ascending: false }).order("id")),
    fetchAllRows(() => db(supabase).from("members").select("*").order("id")),
  ]);
  throwIfError(finesRes.error, "Failed to load fines.");
  throwIfError(membersRes.error, "Failed to load members.");
  return {
    fines: ((finesRes.data as FineRow[] | null) ?? []).map(mapFine),
    members: ((membersRes.data as MemberRow[] | null) ?? []).map(mapMember),
  };
}

export async function createFine(input: Omit<Fine, "id" | "createdAt" | "paidAt">): Promise<Fine> {
  const row = {
    id: randomUUID(),
    member_id: input.memberId,
    loan_id: input.loanId,
    type: input.type,
    amount: input.amount,
    amount_outstanding: input.amountOutstanding,
    description: input.description,
    issued_by: input.issuedBy,
    created_at: new Date().toISOString(),
    paid_at: null,
  };

  const { data, error } = await db(supabase).from("fines").insert(row).select("*").single();
  throwIfError(error, "Failed to create fine.");
  return mapFine(data as FineRow);
}

// -- Book Items --
export type BookItemRow = {
  id: string;
  book_id: string;
  barcode: string;
  status: BookItemStatus;
  call_number: string | null;
  shelf_location: string | null;
  home_branch: string;
  holding_branch: string;
  notes: string | null;
  created_at: string;
};

function mapBookItem(row: BookItemRow): BookItem {
  return {
    id: row.id,
    bookId: row.book_id,
    barcode: row.barcode,
    status: row.status,
    callNumber: row.call_number,
    shelfLocation: row.shelf_location,
    homeBranch: row.home_branch,
    holdingBranch: row.holding_branch,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/**
 * One page of one title's physical copies, plus that title's copy counts.
 * Counts use HEAD requests ({ count: "exact", head: true }): Postgres counts
 * and no rows travel. Sorted by barcode, then id, so pages are stable even
 * when many copies share a created_at (bulk-loaded copies do).
 */
export async function listBookItemsPage(
  bookId: string,
  range: { from: number; to: number }
): Promise<{ items: BookItem[]; total: number; available: number }> {
  const [pageRes, totalRes, availableRes] = await Promise.all([
    db(supabase)
      .from("book_items")
      .select("*")
      .eq("book_id", bookId)
      .order("barcode", { ascending: true })
      .order("id", { ascending: true })
      .range(range.from, range.to),
    db(supabase)
      .from("book_items")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId),
    db(supabase)
      .from("book_items")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId)
      .eq("status", "available"),
  ]);
  // A page past the end (e.g. after deleting the last copy on the last page)
  // is PGRST103 "Requested range not satisfiable": treat it as empty.
  const pastEnd = pageRes.error?.code === "PGRST103";
  if (!pastEnd) throwIfError(pageRes.error, "Failed to load book items.");
  throwIfError(totalRes.error, "Failed to count book items.");
  throwIfError(availableRes.error, "Failed to count available book items.");
  return {
    items: pastEnd ? [] : ((pageRes.data as BookItemRow[] | null) ?? []).map(mapBookItem),
    total: totalRes.count ?? 0,
    available: availableRes.count ?? 0,
  };
}

// ── Public title page (/catalog/[id]) ─────────────────────────────────────

export async function getBookById(id: string): Promise<Book | null> {
  const { data, error } = await db(supabase).from("books").select("*").eq("id", id).maybeSingle();
  throwIfError(error, "Failed to load the title.");
  return data ? mapBook(data as BookRow) : null;
}

/**
 * One page of a title's copies for the public table: withdrawn copies are
 * left out, available copies come first (status sorts "available" first),
 * then by barcode. For copies on loan, the open loan's due date is attached;
 * nothing about the borrower is read.
 */
export async function listPublicCopiesPage(
  bookId: string,
  range: { from: number; to: number },
  hiddenStatuses: readonly string[]
): Promise<{ items: BookItem[]; total: number; dueByItem: Record<string, string> }> {
  const hidden = `(${hiddenStatuses.map((s) => `"${s}"`).join(",")})`;
  const [pageRes, totalRes] = await Promise.all([
    db(supabase)
      .from("book_items")
      .select("*")
      .eq("book_id", bookId)
      .not("status", "in", hidden)
      .order("status", { ascending: true })
      .order("barcode", { ascending: true })
      .order("id", { ascending: true })
      .range(range.from, range.to),
    db(supabase)
      .from("book_items")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId)
      .not("status", "in", hidden),
  ]);
  const pastEnd = pageRes.error?.code === "PGRST103";
  if (!pastEnd) throwIfError(pageRes.error, "Failed to load copies.");
  throwIfError(totalRes.error, "Failed to count copies.");
  const items = pastEnd ? [] : ((pageRes.data as BookItemRow[] | null) ?? []).map(mapBookItem);

  const dueByItem: Record<string, string> = {};
  const onLoan = items.filter((i) => i.status === "on_loan").map((i) => i.id);
  if (onLoan.length > 0) {
    const { data, error } = await db(supabase)
      .from("loans")
      .select("item_id, due_at")
      .in("item_id", onLoan)
      .neq("status", "returned");
    throwIfError(error, "Failed to load due dates.");
    for (const row of (data ?? []) as { item_id: string; due_at: string }[]) {
      dueByItem[row.item_id] = row.due_at;
    }
  }
  return { items, total: totalRes.count ?? 0, dueByItem };
}

/** Members waiting in the hold queue for a title (not borrow requests). */
export async function countWaitingHolds(bookId: string): Promise<number> {
  const { count, error } = await db(supabase)
    .from("holds")
    .select("id", { count: "exact", head: true })
    .eq("book_id", bookId)
    .eq("kind", "hold")
    .eq("status", "pending");
  throwIfError(error, "Failed to count holds.");
  return count ?? 0;
}

/**
 * "While you wait" / "More like this": other titles in the same category,
 * ones on the shelf first.
 */
export async function listRelatedBooks(book: Book, limit: number): Promise<Book[]> {
  if (!book.category) return [];
  const { data, error } = await db(supabase)
    .from("books")
    .select("*")
    .eq("category", book.category)
    .neq("id", book.id)
    .order("available_copies", { ascending: false })
    .order("title", { ascending: true })
    .limit(limit);
  throwIfError(error, "Failed to load related titles.");
  return ((data as BookRow[] | null) ?? []).map(mapBook);
}

export async function getBookItemsByBookId(bookId: string): Promise<BookItem[]> {
  const { data, error } = await db(supabase)
    .from("book_items")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });
  throwIfError(error, "Failed to load book items.");
  return ((data as BookItemRow[] | null) ?? []).map(mapBookItem);
}

export async function createBookItem(input: Omit<BookItem, "id" | "createdAt">): Promise<BookItem> {
  const row = {
    id: randomUUID(),
    book_id: input.bookId,
    barcode: input.barcode,
    status: input.status,
    call_number: input.callNumber,
    shelf_location: input.shelfLocation,
    home_branch: input.homeBranch,
    holding_branch: input.holdingBranch,
    notes: input.notes,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await db(supabase).from("book_items").insert(row).select("*").single();
  throwIfError(error, "Failed to create book item.");
  return mapBookItem(data as BookItemRow);
}

export async function deleteBookItem(id: string): Promise<boolean> {
  const { data, error } = await db(supabase).from("book_items").delete().eq("id", id).select("id");
  throwIfError(error, "Failed to delete book item.");
  return Boolean(data && data.length > 0);
}

// -- Holds --
export type HoldRow = {
  id: string;
  book_id: string;
  member_id: string;
  kind: string;
  status: string;
  priority: number;
  pickup_branch: string | null;
  placed_at: string;
  expires_at: string | null;
  fulfilled_loan_id: string | null;
  cancelled_reason: string | null;
};

function mapHold(row: HoldRow): Hold {
  return {
    id: row.id,
    bookId: row.book_id,
    memberId: row.member_id,
    kind: row.kind as Hold["kind"],
    status: row.status as Hold["status"],
    priority: row.priority,
    pickupBranch: row.pickup_branch ?? null,
    placedAt: row.placed_at,
    expiresAt: row.expires_at ?? null,
    fulfilledLoanId: row.fulfilled_loan_id ?? null,
    cancelledReason: row.cancelled_reason ?? null,
  };
}

export async function listHolds(): Promise<Hold[]> {
  const { data, error } = await fetchAllRows(() =>
    db(supabase).from("holds").select("*").order("placed_at", { ascending: false }).order("id")
  );
  throwIfError(error, "Failed to load holds.");
  return ((data as HoldRow[] | null) ?? []).map(mapHold);
}

export async function createHold(input: Omit<Hold, "id" | "placedAt">): Promise<Hold> {
  const row = {
    id: randomUUID(),
    book_id: input.bookId,
    member_id: input.memberId,
    kind: input.kind,
    status: input.status,
    priority: input.priority,
    pickup_branch: input.pickupBranch,
    placed_at: new Date().toISOString(),
    expires_at: input.expiresAt,
    fulfilled_loan_id: input.fulfilledLoanId,
    cancelled_reason: input.cancelledReason,
  };

  const { data, error } = await db(supabase).from("holds").insert(row).select("*").single();
  throwIfError(error, "Failed to create hold.");
  return mapHold(data as HoldRow);
}

// -- Circulation Rules --
export type CirculationRuleRow = {
  id: string;
  member_type: MemberType;
  loan_days: number;
  renewal_days: number;
  max_renewals: number;
  max_loans: number;
  fine_per_day: number;
};

function mapCirculationRule(row: CirculationRuleRow): CirculationRule {
  return {
    id: row.id,
    memberType: row.member_type,
    loanDays: row.loan_days,
    renewalDays: row.renewal_days,
    maxRenewals: row.max_renewals,
    maxLoans: row.max_loans,
    finePerDay: row.fine_per_day,
  };
}

/**
 * Loan limit for one member type, or null when no rule exists (the loans
 * trigger then falls back to 3; see DEFAULT_MAX_LOANS in dashboard-stats.ts).
 */
export async function getMaxLoansForMemberType(memberType: MemberType): Promise<number | null> {
  const { data, error } = await db(supabase)
    .from("circulation_rules")
    .select("max_loans")
    .eq("member_type", memberType)
    .maybeSingle();
  if (error) return null; // table absent on older installs: same fallback as the trigger
  const max = (data as { max_loans?: number } | null)?.max_loans;
  return typeof max === "number" ? max : null;
}

export async function listCirculationRules(): Promise<CirculationRule[]> {
  const { data, error } = await fetchAllRows(() =>
    db(supabase).from("circulation_rules").select("*").order("member_type", { ascending: true }).order("id")
  );
  throwIfError(error, "Failed to load circulation rules.");
  return ((data as CirculationRuleRow[] | null) ?? []).map(mapCirculationRule);
}

// Update getLibraryData to include new entities
export async function getLibraryData(): Promise<LibraryData> {
  const [booksRes, membersRes, loansRes, notificationsRes, usersRes, bookItemsRes, holdsRes, finesRes, rulesRes] =
    await Promise.all([
      fetchAllRows(() => db(supabase).from("books").select("*").order("created_at", { ascending: false }).order("id")),
      fetchAllRows(() => db(supabase).from("members").select("*").order("joined_at", { ascending: false }).order("id")),
      fetchAllRows(() => db(supabase).from("loans").select("*").order("borrowed_at", { ascending: false }).order("id")),
      fetchAllRows(() => db(supabase).from("notifications").select("*").order("created_at", { ascending: false }).order("id")),
      fetchAllRows(() => db(supabase).from("users").select("*").order("created_at", { ascending: false }).order("id")),
      fetchAllRows(() => db(supabase).from("book_items").select("*").order("created_at", { ascending: false }).order("id")),
      fetchAllRows(() => db(supabase).from("holds").select("*").order("placed_at", { ascending: false }).order("id")),
      fetchAllRows(() => db(supabase).from("fines").select("*").order("created_at", { ascending: false }).order("id")),
      fetchAllRows(() => db(supabase).from("circulation_rules").select("*").order("member_type", { ascending: true }).order("id")),
    ]);

  throwIfError(booksRes.error, "Failed to load books.");
  throwIfError(membersRes.error, "Failed to load members.");
  throwIfError(loansRes.error, "Failed to load loans.");
  throwIfError(notificationsRes.error, "Failed to load notifications.");
  // users table is optional for deployments that only store library data
  const users =
    usersRes.error
      ? []
      : ((usersRes.data as UserRow[] | null) ?? []).map(mapUser);
  const bookItems =
    bookItemsRes.error
      ? []
      : ((bookItemsRes.data as BookItemRow[] | null) ?? []).map(mapBookItem);
  const holds =
    holdsRes.error
      ? []
      : ((holdsRes.data as HoldRow[] | null) ?? []).map(mapHold);
  const fines =
    finesRes.error
      ? []
      : ((finesRes.data as FineRow[] | null) ?? []).map(mapFine);
  const circulationRules =
    rulesRes.error
      ? []
      : ((rulesRes.data as CirculationRuleRow[] | null) ?? []).map(mapCirculationRule);

  return {
    users,
    books: ((booksRes.data as BookRow[] | null) ?? []).map(mapBook),
    bookItems,
    members: ((membersRes.data as MemberRow[] | null) ?? []).map(mapMember),
    loans: ((loansRes.data as LoanRow[] | null) ?? []).map(mapLoan),
    holds,
    fines,
    circulationRules,
    notifications: ((notificationsRes.data as NotificationRow[] | null) ?? []).map(
      mapNotification
    ),
  };
}

/** Master data — database-backed dropdown sources. Active-only by default. */
/**
 * Rows count as active unless the row says otherwise. Filtering here (not in
 * SQL) keeps the read working on a database whose table predates a column
 * (`active`, `department_id`, `program_years`): the same rows come back on
 * an up-to-date schema, and a missing column no longer turns into a 500.
 */
function isActiveRow(row: { active?: boolean | null }): boolean {
  return row.active !== false;
}

export async function listDepartments(includeInactive = false): Promise<Department[]> {
  const { data, error } = await db(supabase).from("departments").select("*")
    .order("code", { ascending: true });
  throwIfError(error, "Failed to load departments.");
  return ((data ?? []) as (Omit<Department, "active"> & { active?: boolean | null })[])
    .filter((d) => includeInactive || isActiveRow(d))
    .map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name ?? d.code,
      active: isActiveRow(d),
    }));
}

export async function listCourses(includeInactive = false): Promise<Course[]> {
  // select("*") so this keeps working before migration 20261120 adds
  // courses.department_id (departmentId is then null = unmapped).
  const { data, error } = await db(supabase).from("courses").select("*")
    .order("code", { ascending: true });
  throwIfError(error, "Failed to load courses.");
  return ((data ?? []) as Parameters<typeof mapCourseRow>[0][])
    .filter((c) => includeInactive || isActiveRow(c))
    .map(mapCourseRow);
}

// ── Academic master data administration (admin only; see /api/academic) ──

function masterDataError(error: { code?: string; message?: string } | null, what: string) {
  if (!error) return;
  if (error.code === "23505") throw new InputError(`A ${what} with that code already exists.`, 409);
  if (error.code === "42703") {
    throw new InputError(
      "Course department / program length need migration 20261120_course_department.sql. Apply it and retry."
    );
  }
  throwIfError(error, `Failed to save ${what}.`);
}

export async function createDepartment(input: { code: string; name: string }): Promise<Department> {
  const { data, error } = await db(supabase)
    .from("departments")
    .insert({ code: input.code, name: input.name, active: true })
    .select("id,code,name,active")
    .single();
  masterDataError(error, "department");
  return data as Department;
}

export async function updateDepartment(
  id: string,
  updates: { code?: string; name?: string; active?: boolean }
): Promise<Department | null> {
  const { data, error } = await db(supabase)
    .from("departments").update(updates).eq("id", id)
    .select("id,code,name,active").maybeSingle();
  masterDataError(error, "department");
  return (data as Department | null) ?? null;
}

async function assertDepartmentExists(departmentId: string | null | undefined) {
  if (!departmentId) return;
  const { data, error } = await db(supabase).from("departments").select("id").eq("id", departmentId).maybeSingle();
  throwIfError(error, "Failed to check department.");
  if (!data) throw new InputError("Selected department does not exist.");
}

function mapCourseRow(row: {
  id: string; code: string; name: string; active?: boolean | null; department_id?: string | null; program_years?: number | null;
}): Course {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active !== false,
    departmentId: row.department_id ?? null,
    programYears: row.program_years ?? null,
  };
}

export async function createCourse(input: {
  code: string; name: string; departmentId?: string | null; programYears?: number | null;
}): Promise<Course> {
  await assertDepartmentExists(input.departmentId);
  const row: Record<string, unknown> = { code: input.code, name: input.name, active: true };
  if (input.departmentId !== undefined) row.department_id = input.departmentId;
  if (input.programYears !== undefined) row.program_years = input.programYears;
  const { data, error } = await db(supabase).from("courses").insert(row).select("*").single();
  masterDataError(error, "course");
  return mapCourseRow(data as Parameters<typeof mapCourseRow>[0]);
}

export async function updateCourse(
  id: string,
  updates: { code?: string; name?: string; active?: boolean; departmentId?: string | null; programYears?: number | null }
): Promise<Course | null> {
  await assertDepartmentExists(updates.departmentId);
  const patch: Record<string, unknown> = {};
  if (updates.code !== undefined) patch.code = updates.code;
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.active !== undefined) patch.active = updates.active;
  if (updates.departmentId !== undefined) patch.department_id = updates.departmentId;
  if (updates.programYears !== undefined) patch.program_years = updates.programYears;
  const { data, error } = await db(supabase).from("courses").update(patch).eq("id", id).select("*").maybeSingle();
  masterDataError(error, "course");
  return data ? mapCourseRow(data as Parameters<typeof mapCourseRow>[0]) : null;
}

/**
 * Students whose course is mapped to a different department than the one on
 * their record — surfaced to admins after a course is (re)assigned.
 */
export async function countDepartmentCourseMismatches(): Promise<number> {
  const [{ data: members, error: mErr }, courses] = await Promise.all([
    db(supabase).from("members").select("department_id,course_id").eq("member_type", "student"),
    listCourses(true),
  ]);
  throwIfError(mErr, "Failed to load members.");
  const owner = new Map(courses.map((c) => [c.id, c.departmentId]));
  return ((members ?? []) as { department_id: string | null; course_id: string | null }[]).filter((m) => {
    const dept = m.course_id ? owner.get(m.course_id) : null;
    return Boolean(dept && m.department_id && dept !== m.department_id);
  }).length;
}

/**
 * Server-side account statistics. The users table is authoritative;
 * members are counted separately and linked rows never become extra accounts.
 * Aggregation is performed in SQL, not in the browser.
 */
export async function getUserStatistics(): Promise<UserStatistics> {
  const [usersRes, membersRes, incompleteRes] = await Promise.all([
    db(supabase).from("users").select("role,status"),
    db(supabase).from("members").select("id", { count: "exact", head: true }),
    db(supabase).rpc("count_incomplete_student_profiles"),
  ]);
  throwIfError(usersRes.error, "Failed to aggregate account statistics.");
  throwIfError(membersRes.error, "Failed to count member profiles.");
  throwIfError(incompleteRes.error, "Failed to count incomplete student profiles.");

  const users = (usersRes.data ?? []) as { role: string; status: string | null }[];
  const count = (predicate: (u: { role: string; status: string | null }) => boolean) =>
    users.filter(predicate).length;

  return {
    totalAccounts: users.length,
    activeAccounts: count((u) => u.status === "active"),
    pendingAccounts: count((u) => u.status === "pending"),
    students: count((u) => u.role === "student"),
    faculty: count((u) => u.role === "faculty"),
    teachers: count((u) => u.role === "teacher"),
    community: count((u) => u.role === "community"),
    librarians: count((u) => u.role === "librarian"),
    admins: count((u) => u.role === "admin"),
    totalMemberProfiles: membersRes.count ?? 0,
    incompleteStudentProfiles: Number(incompleteRes.data ?? 0),
  };
}

/**
 * Filtered account statistics. Counts still come from users/members; filters
 * narrow the member cohort by academic fields via a joined RPC when available.
 */
export async function getFilteredUserStatistics(filters: {
  role?: string | null;
  status?: string | null;
  department?: string | null;
  course?: string | null;
  yearLevel?: string | null;
  section?: string | null;
}): Promise<UserStatistics> {
  const base = await getUserStatistics();
  const hasAcademicFilter =
    filters.department || filters.course || filters.yearLevel || filters.section;
  if (!hasAcademicFilter) {
    // Role/status filters are applied to the authoritative users table.
    const query = db(supabase).from("users").select("role,status");
    if (filters.role) query.eq("role", filters.role);
    if (filters.status) query.eq("status", filters.status);
    const { data, error } = await query;
    throwIfError(error, "Failed to aggregate filtered accounts.");
    const users = (data ?? []) as { role: string; status: string | null }[];
    const count = (predicate: (u: { role: string; status: string | null }) => boolean) =>
      users.filter(predicate).length;
    return {
      ...base,
      totalAccounts: users.length,
      activeAccounts: count((u) => u.status === "active"),
      pendingAccounts: count((u) => u.status === "pending"),
      students: count((u) => u.role === "student"),
      faculty: count((u) => u.role === "faculty"),
      teachers: count((u) => u.role === "teacher"),
      community: count((u) => u.role === "community"),
      librarians: count((u) => u.role === "librarian"),
      admins: count((u) => u.role === "admin"),
    };
  }
  const { data, error } = await db(supabase).rpc("filtered_user_statistics", {
    p_role: filters.role ?? null,
    p_status: filters.status ?? null,
    p_department: filters.department ?? null,
    p_course: filters.course ?? null,
    p_year_level: filters.yearLevel ?? null,
    p_section: filters.section ?? null,
  });
  throwIfError(error, "Failed to aggregate filtered account statistics.");
  return (data as UserStatistics) ?? base;
}

/** Existing-record completeness audit for students. Read-only. */
export async function getStudentCompletenessAudit(): Promise<StudentCompletenessAudit> {
  const [membersRes, usersRes] = await Promise.all([
    db(supabase).from("members").select("*").eq("member_type", "student"),
    db(supabase).from("users").select("id,role,status").eq("role", "student"),
  ]);
  throwIfError(membersRes.error, "Failed to load student members.");
  throwIfError(usersRes.error, "Failed to load student accounts.");

  const studentMembers = ((membersRes.data ?? []) as MemberRow[]).map(mapMember);
  const studentUsers = (usersRes.data ?? []) as { id: string; role: string; status: string | null }[];
  const linkedIds = new Set(
    studentMembers.map((m) => m.userId).filter((id): id is string => Boolean(id))
  );
  const breakdown: Record<string, number> = {};
  const incomplete = studentMembers.filter((m) => {
    const missing = profileMissingFields(m);
    for (const field of missing) breakdown[field] = (breakdown[field] ?? 0) + 1;
    return missing.length > 0;
  });
  const counts = new Map<string, number>();
  for (const m of studentMembers) {
    if (m.studentId) counts.set(m.studentId, (counts.get(m.studentId) ?? 0) + 1);
  }
  const duplicateStudentIds = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id)
    .sort();

  return {
    totalStudentAccounts: studentUsers.length,
    totalStudentMembers: studentMembers.length,
    linkedStudentAccounts: studentUsers.filter((u) => linkedIds.has(u.id)).length,
    unlinkedStudentRecords: studentMembers.filter((m) => !m.userId).length,
    completeStudentProfiles: studentMembers.length - incomplete.length,
    incompleteStudentProfiles: incomplete.length,
    missingFieldBreakdown: breakdown,
    duplicateStudentIds,
    recordsRequiringReview: incomplete.map((m) => ({
      memberId: m.id,
      userId: m.userId,
      name: m.name,
      email: m.email,
      studentId: m.studentId,
      missingFields: profileMissingFields(m),
    })),
  };
}

export function computeDashboardStats(data: LibraryData): DashboardStats {
  const outstandingFines = data.fines
    .filter((f) => f.amountOutstanding > 0)
    .reduce((sum, f) => sum + f.amountOutstanding, 0);
  const overdueFinesCount = data.fines.filter((f) => f.type === "overdue" && f.amountOutstanding > 0).length;

  return {
    totalBooks: data.books.reduce((sum, b) => sum + b.totalCopies, 0),
    availableBooks: data.books.reduce((sum, b) => sum + b.availableCopies, 0),
    totalMembers: data.members.filter((m) => m.active).length,
    activeLoans: data.loans.filter((l) => l.status !== "returned").length,
    overdueLoans: data.loans.filter((l) => l.status === "overdue").length,
    unreadNotifications: data.notifications.filter((n) => !n.read).length,
    outstandingFines,
    overdueFinesCount,
  };
}


// -- Book Items -- (additions)

export async function updateBookItem(
  id: string,
  updates: Partial<Omit<BookItem, "id" | "createdAt">>
): Promise<BookItem | null> {
  const { data: existing, error: fetchError } = await db(supabase)
    .from("book_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load book item.");
  if (!existing) return null;

  const patch: Partial<BookItemRow> = {};
  if (updates.barcode !== undefined) patch.barcode = updates.barcode;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.callNumber !== undefined) patch.call_number = updates.callNumber;
  if (updates.shelfLocation !== undefined) patch.shelf_location = updates.shelfLocation;
  if (updates.homeBranch !== undefined) patch.home_branch = updates.homeBranch;
  if (updates.holdingBranch !== undefined) patch.holding_branch = updates.holdingBranch;
  if (updates.notes !== undefined) patch.notes = updates.notes;

  const { data, error } = await db(supabase)
    .from("book_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to update book item.");
  return mapBookItem(data as BookItemRow);
}

export async function getBookItemNotes(barcode: string): Promise<string | null> {
  const { data, error } = await db(supabase)
    .from("book_items")
    .select("notes")
    .eq("barcode", barcode)
    .maybeSingle();
  throwIfError(error, "Failed to load book item notes.");
  return data?.notes ?? null;
}

// -- Circulation Rules -- (additions)

export async function upsertCirculationRule(
  input: Omit<CirculationRule, "id">
): Promise<CirculationRule> {
  const { data: existing, error: fetchError } = await db(supabase)
    .from("circulation_rules")
    .select("*")
    .eq("member_type", input.memberType)
    .maybeSingle();
  throwIfError(fetchError, "Failed to check existing circulation rule.");

  const row = {
    member_type: input.memberType,
    loan_days: input.loanDays,
    renewal_days: input.renewalDays,
    max_renewals: input.maxRenewals,
    max_loans: input.maxLoans,
    fine_per_day: input.finePerDay,
  };

  if (existing) {
    const { data, error } = await db(supabase)
      .from("circulation_rules")
      .update(row)
      .eq("member_type", input.memberType)
      .select("*")
      .single();
    throwIfError(error, "Failed to update circulation rule.");
    return mapCirculationRule(data as CirculationRuleRow);
  } else {
    const { data, error } = await db(supabase)
      .from("circulation_rules")
      .insert(row)
      .select("*")
      .single();
    throwIfError(error, "Failed to create circulation rule.");
    return mapCirculationRule(data as CirculationRuleRow);
  }
}

export async function deleteCirculationRule(memberType: MemberType): Promise<boolean> {
  const { data, error } = await db(supabase)
    .from("circulation_rules")
    .delete()
    .eq("member_type", memberType)
    .select("id");
  throwIfError(error, "Failed to delete circulation rule.");
  return Boolean(data && data.length > 0);
}

// -- Fines -- (additions)

export async function updateFine(
  id: string,
  updates: Partial<Omit<Fine, "id" | "createdAt">>
): Promise<Fine | null> {
  const { data: existing, error: fetchError } = await db(supabase)
    .from("fines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load fine.");
  if (!existing) return null;

  const patch: Partial<FineRow> = {};
  if (updates.type !== undefined) patch.type = updates.type;
  if (updates.amount !== undefined) patch.amount = updates.amount;
  if (updates.amountOutstanding !== undefined) patch.amount_outstanding = updates.amountOutstanding;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.issuedBy !== undefined) patch.issued_by = updates.issuedBy;
  if (updates.paidAt !== undefined) patch.paid_at = updates.paidAt;

  const { data, error } = await db(supabase)
    .from("fines")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to update fine.");
  return mapFine(data as FineRow);
}

export async function payFine(id: string, amount: number): Promise<Fine | null> {
  const { data: existing, error: fetchError } = await db(supabase)
    .from("fines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load fine.");
  if (!existing) return null;

  const newOutstanding = Math.max(0, (existing as FineRow).amount_outstanding - amount);
  const paidAt = newOutstanding === 0 ? new Date().toISOString() : null;

  const { data, error } = await db(supabase)
    .from("fines")
    .update({ amount_outstanding: newOutstanding, paid_at: paidAt })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to pay fine.");
  return mapFine(data as FineRow);
}

export async function forgiveFine(id: string): Promise<Fine | null> {
  const { data: existing, error: fetchError } = await db(supabase)
    .from("fines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load fine.");
  if (!existing) return null;

  const { data, error } = await db(supabase)
    .from("fines")
    .update({ amount_outstanding: 0, paid_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to forgive fine.");
  return mapFine(data as FineRow);
}

export async function deleteFine(id: string): Promise<boolean> {
  const { data, error } = await db(supabase)
    .from("fines")
    .delete()
    .eq("id", id)
    .select("id");
  throwIfError(error, "Failed to delete fine.");
  return Boolean(data && data.length > 0);
}
