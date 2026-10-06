import { randomUUID } from "crypto";
import { supabase, db } from "./supabase";
import { hashPassword, toPublicUser, verifyPassword } from "./auth";
import { deriveLoanStatus } from "./loan-status";
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
  const memberType: MemberType =
    row.member_type === "staff" || row.member_type === "community"
      ? row.member_type
      : "student";
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    memberType,
    studentId: row.student_id ?? null,
    grade: row.grade ?? null,
    joinedAt: row.joined_at,
    active: row.active,
    userId: row.user_id ?? null,
  };
}

function normalizeMemberType(value: unknown): MemberType {
  if (value === "staff" || value === "community" || value === "student") {
    return value;
  }
  return "student";
}

function assertMemberInput(input: {
  memberType: MemberType;
  studentId: string | null;
  grade: string | null;
}) {
  if (input.memberType === "student") {
    if (!input.studentId?.trim()) {
      throw new Error("Student ID is required for student members.");
    }
  }
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
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedId: row.related_id ?? undefined,
    read: row.read,
    createdAt: row.created_at,
  };
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status === "pending" ? "pending" : "active",
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
  const { data, error } = await db(supabase).rpc("sweep_loan_statuses");
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
  const { data, error } = await db(supabase)
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });
  throwIfError(error, "Failed to load books.");
  return ((data as BookRow[] | null) ?? []).map(mapBook);
}

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await db(supabase)
    .from("members")
    .select("*")
    .order("joined_at", { ascending: false });
  throwIfError(error, "Failed to load members.");
  return ((data as MemberRow[] | null) ?? []).map(mapMember);
}

export async function getLoansData(): Promise<{
  loans: Loan[];
  books: Book[];
  members: Member[];
}> {
  const [loansRes, booksRes, membersRes] = await Promise.all([
    db(supabase).from("loans").select("*").order("borrowed_at", { ascending: false }),
    db(supabase).from("books").select("*"),
    db(supabase).from("members").select("*"),
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

export async function getNotificationsData(): Promise<Notification[]> {
  const { data, error } = await db(supabase)
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false });
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

export async function createMember(
  input: Omit<Member, "id" | "joinedAt" | "active">
): Promise<Member> {
  const memberType = normalizeMemberType(input.memberType);
  const studentId =
    memberType === "student" ? (input.studentId?.trim() || null) : null;
  const grade =
    memberType === "student" ? (input.grade?.trim() || null) : null;
  assertMemberInput({ memberType, studentId, grade });

  const row = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    phone: input.phone,
    member_type: memberType,
    student_id: studentId,
    grade,
    joined_at: new Date().toISOString(),
    active: true,
  };

  const { data, error } = await db(supabase).from("members").insert(row).select("*").single();
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

  const resolvedStudentId = nextType === "student" ? nextStudentId : null;
  const resolvedGrade = nextType === "student" ? nextGrade : null;

  const touchingIdentity =
    updates.memberType !== undefined ||
    updates.studentId !== undefined ||
    updates.grade !== undefined;
  if (touchingIdentity || nextType === "student") {
    // Allow legacy rows missing student_id until staff edits them,
    // but require an ID whenever type/student fields are being saved as student.
    if (touchingIdentity) {
      assertMemberInput({
        memberType: nextType,
        studentId: resolvedStudentId,
        grade: resolvedGrade,
      });
    }
  }

  const patch: Partial<MemberRow> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.active !== undefined) patch.active = updates.active;
  if (updates.userId !== undefined) patch.user_id = updates.userId;
  if (touchingIdentity) {
    patch.member_type = nextType;
    patch.student_id = resolvedStudentId;
    patch.grade = resolvedGrade;
  }

  const { data, error } = await db(supabase)
    .from("members")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
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

export async function markNotificationRead(id: string): Promise<Notification | null> {
  const { data: existing, error: fetchError } = await db(supabase)
    .from("notifications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load notification.");
  if (!existing) return null;

  const { data, error } = await db(supabase)
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to mark notification read.");
  return mapNotification(data as NotificationRow);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data: unread, error: fetchError } = await db(supabase)
    .from("notifications")
    .select("id")
    .eq("read", false);
  throwIfError(fetchError, "Failed to load unread notifications.");

  const ids = (unread ?? []).map((n) => n.id as string);
  if (ids.length === 0) return 0;

  const { error } = await db(supabase)
    .from("notifications")
    .update({ read: true })
    .in("id", ids);
  throwIfError(error, "Failed to mark notifications read.");
  return ids.length;
}

/** True when the account exists but is still awaiting librarian approval. */
export async function isAccountPending(email: string): Promise<boolean> {
  const { data } = await db(supabase)
    .from("users")
    .select("status")
    .ilike("email", email.trim())
    .maybeSingle();
  return (data as { status?: string } | null)?.status === "pending";
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const { data, error } = await db(supabase)
    .from("users")
    .select("*")
    .ilike("email", email.trim())
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
  const { data, error } = await db(supabase)
    .from("users")
    .select("id,name,email,password_hash,role,status,created_at,auth_user_id")
    .order("created_at", { ascending: true });
  throwIfError(error, "Failed to load staff accounts.");
  return ((data as UserRow[] | null) ?? []).map((row) => toPublicUser(mapUser(row)));
}

export async function countAdmins(): Promise<number> {
  const { data, error } = await db(supabase).from("users").select("id").eq("role", "admin");
  throwIfError(error, "Failed to count admins.");
  return data?.length ?? 0;
}

export async function createStaff(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();

  const { data: clash, error: clashError } = await db(supabase)
    .from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  throwIfError(clashError, "Failed to check existing accounts.");
  if (clash) throw new Error("An account with that email already exists.");

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
  throwIfError(error, "Failed to create staff account.");
  return toPublicUser(mapUser(data as UserRow));
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
    .ilike("email", email.trim())
    .maybeSingle();
  if (error || !data) return null;
  return mapMember(data);
}

export async function getBorrowRequests(memberId?: string) {
  let query = db(supabase)
    .from("holds")
    .select("*")
    .eq("kind", "borrow_request")
    .order("placed_at", { ascending: false });

  if (memberId) {
    query = query.eq("member_id", memberId);
  } else {
    query = query.in("status", ["pending", "ready", "approved"]);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []);
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

  if (open) {
    throw new Error("You already have a pending request for this book.");
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
      throw new Error("You already have a pending request for this book.");
    }
    throw new Error(error.message || "Failed to create borrow request.");
  }

  return mapHold(data);
}

export async function approveBorrowRequest(id: string, reviewedBy: string) {
  const pickupExpires = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

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
    message: (memberName ? memberName + ": " : "") + "\"" + title + "\" has been approved. Please pick it up at the library desk within 3 days (by " + new Date(pickupExpires).toLocaleDateString("en-PH") + ").",
    related_id: hold.id,
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
  let query = db(supabase).from("fines").select("*").order("created_at", { ascending: false });
  if (memberId) {
    query = query.eq("member_id", memberId);
  }
  const { data, error } = await query;
  throwIfError(error, "Failed to load fines.");
  return ((data as FineRow[] | null) ?? []).map(mapFine);
}

export async function getFinesData(): Promise<{ fines: Fine[]; members: Member[] }> {
  const [finesRes, membersRes] = await Promise.all([
    db(supabase).from("fines").select("*").order("created_at", { ascending: false }),
    db(supabase).from("members").select("*"),
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

export async function listBookItems(): Promise<BookItem[]> {
  const { data, error } = await db(supabase)
    .from("book_items")
    .select("*")
    .order("created_at", { ascending: false });
  throwIfError(error, "Failed to load book items.");
  return ((data as BookItemRow[] | null) ?? []).map(mapBookItem);
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
  const { data, error } = await db(supabase)
    .from("holds")
    .select("*")
    .order("placed_at", { ascending: false });
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

export async function listCirculationRules(): Promise<CirculationRule[]> {
  const { data, error } = await db(supabase)
    .from("circulation_rules")
    .select("*")
    .order("member_type", { ascending: true });
  throwIfError(error, "Failed to load circulation rules.");
  return ((data as CirculationRuleRow[] | null) ?? []).map(mapCirculationRule);
}

// Update getLibraryData to include new entities
export async function getLibraryData(): Promise<LibraryData> {
  const [booksRes, membersRes, loansRes, notificationsRes, usersRes, bookItemsRes, holdsRes, finesRes, rulesRes] =
    await Promise.all([
      db(supabase).from("books").select("*").order("created_at", { ascending: false }),
      db(supabase).from("members").select("*").order("joined_at", { ascending: false }),
      db(supabase).from("loans").select("*").order("borrowed_at", { ascending: false }),
      db(supabase).from("notifications").select("*").order("created_at", { ascending: false }),
      db(supabase).from("users").select("*").order("created_at", { ascending: false }),
      db(supabase).from("book_items").select("*").order("created_at", { ascending: false }),
      db(supabase).from("holds").select("*").order("placed_at", { ascending: false }),
      db(supabase).from("fines").select("*").order("created_at", { ascending: false }),
      db(supabase).from("circulation_rules").select("*").order("member_type", { ascending: true }),
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
