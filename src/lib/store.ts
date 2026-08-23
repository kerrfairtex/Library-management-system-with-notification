import { randomUUID } from "crypto";
import { supabase, db } from "./supabase";
import { hashPassword, toPublicUser, verifyPassword } from "./auth";
import { deriveLoanStatus } from "./loan-status";
import type {
  Book,
  DashboardStats,
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
};

type LoanRow = {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: LoanStatus;
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
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    status: deriveLoanStatus(row),
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

export async function getLibraryData(): Promise<LibraryData> {
  const [booksRes, membersRes, loansRes, notificationsRes, usersRes] =
    await Promise.all([
      db(supabase).from("books").select("*").order("created_at", { ascending: false }),
      db(supabase).from("members").select("*").order("joined_at", { ascending: false }),
      db(supabase).from("loans").select("*").order("borrowed_at", { ascending: false }),
      db(supabase).from("notifications").select("*").order("created_at", { ascending: false }),
      db(supabase).from("users").select("*").order("created_at", { ascending: false }),
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

  return {
    users,
    books: ((booksRes.data as BookRow[] | null) ?? []).map(mapBook),
    members: ((membersRes.data as MemberRow[] | null) ?? []).map(mapMember),
    loans: ((loansRes.data as LoanRow[] | null) ?? []).map(mapLoan),
    notifications: ((notificationsRes.data as NotificationRow[] | null) ?? []).map(
      mapNotification
    ),
  };
}

export function computeDashboardStats(data: LibraryData): DashboardStats {
  return {
    totalBooks: data.books.reduce((sum, b) => sum + b.totalCopies, 0),
    availableBooks: data.books.reduce((sum, b) => sum + b.availableCopies, 0),
    totalMembers: data.members.filter((m) => m.active).length,
    activeLoans: data.loans.filter((l) => l.status !== "returned").length,
    overdueLoans: data.loans.filter((l) => l.status === "overdue").length,
    unreadNotifications: data.notifications.filter((n) => !n.read).length,
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
  days = 7
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
  const { data, error } = await db(supabase).from("users").select("*").eq("id", id).maybeSingle();
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
  const { data, error } = await db(supabase)
    .from("users")
    .select("*")
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
