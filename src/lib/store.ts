import { randomUUID } from "crypto";
import { supabase } from "./supabase";
import { toPublicUser, verifyPassword } from "./auth";
import type {
  Book,
  DashboardStats,
  LibraryData,
  Loan,
  LoanStatus,
  Member,
  Notification,
  NotificationType,
  PublicUser,
  User,
  UserRole,
} from "./types";

type BookRow = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  genre: string;
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
  created_at: string;
};

function mapBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    genre: row.genre,
    totalCopies: row.total_copies,
    availableCopies: row.available_copies,
    publishedYear: row.published_year,
    createdAt: row.created_at,
  };
}

function mapMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    joinedAt: row.joined_at,
    active: row.active,
  };
}

function mapLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    bookId: row.book_id,
    memberId: row.member_id,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    status: row.status,
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

  const { data, error } = await supabase
    .from("notifications")
    .insert(row)
    .select("*")
    .single();

  throwIfError(error, "Failed to create notification.");
  return mapNotification(data as NotificationRow);
}

async function refreshLoanStatuses(): Promise<void> {
  const nowIso = new Date().toISOString();

  const { data: overdueCandidates, error: overdueError } = await supabase
    .from("loans")
    .select("*")
    .neq("status", "returned")
    .lt("due_at", nowIso);

  throwIfError(overdueError, "Failed to load overdue loans.");

  for (const row of (overdueCandidates as LoanRow[] | null) ?? []) {
    if (row.status === "overdue") continue;

    const { error: updateError } = await supabase
      .from("loans")
      .update({ status: "overdue" })
      .eq("id", row.id);
    throwIfError(updateError, "Failed to mark loan overdue.");

    const [{ data: book }, { data: member }, { data: existing }] = await Promise.all([
      supabase.from("books").select("*").eq("id", row.book_id).maybeSingle(),
      supabase.from("members").select("*").eq("id", row.member_id).maybeSingle(),
      supabase
        .from("notifications")
        .select("id, created_at")
        .eq("type", "overdue")
        .eq("related_id", row.id)
        .eq("read", false)
        .gte("created_at", new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString())
        .limit(1),
    ]);

    if ((!existing || existing.length === 0) && book && member) {
      await insertNotification(
        "overdue",
        "Overdue loan",
        `"${(book as BookRow).title}" borrowed by ${(member as MemberRow).name} is overdue.`,
        row.id
      );
    }
  }

  const threeDaysAhead = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString();
  const { data: dueSoonCandidates, error: dueSoonError } = await supabase
    .from("loans")
    .select("*")
    .eq("status", "active")
    .gt("due_at", nowIso)
    .lte("due_at", threeDaysAhead);

  throwIfError(dueSoonError, "Failed to load due-soon loans.");

  for (const row of (dueSoonCandidates as LoanRow[] | null) ?? []) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "due_soon")
      .eq("related_id", row.id)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const [{ data: book }, { data: member }] = await Promise.all([
      supabase.from("books").select("*").eq("id", row.book_id).maybeSingle(),
      supabase.from("members").select("*").eq("id", row.member_id).maybeSingle(),
    ]);

    if (!book || !member) continue;

    const remaining = new Date(row.due_at).getTime() - Date.now();
    const days = Math.max(1, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
    await insertNotification(
      "due_soon",
      "Due soon",
      `"${(book as BookRow).title}" borrowed by ${(member as MemberRow).name} is due in ${days} day${
        days === 1 ? "" : "s"
      }.`,
      row.id
    );
  }
}

export async function getLibraryData(): Promise<LibraryData> {
  await refreshLoanStatuses();

  const [booksRes, membersRes, loansRes, notificationsRes, usersRes] =
    await Promise.all([
      supabase.from("books").select("*").order("created_at", { ascending: false }),
      supabase.from("members").select("*").order("joined_at", { ascending: false }),
      supabase.from("loans").select("*").order("borrowed_at", { ascending: false }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      supabase.from("users").select("*").order("created_at", { ascending: false }),
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
 * Lightweight table reads for endpoints that only need one entity type.
 * Unlike getLibraryData(), these skip refreshLoanStatuses() and the other
 * four tables — cutting per-request Supabase round trips (and the odds of
 * concurrent overdue/due-soon notification checks racing each other) for
 * pages that don't need a full sync just to list books or members.
 */
export async function listBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });
  throwIfError(error, "Failed to load books.");
  return ((data as BookRow[] | null) ?? []).map(mapBook);
}

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await supabase
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
  await refreshLoanStatuses();
  const [loansRes, booksRes, membersRes] = await Promise.all([
    supabase.from("loans").select("*").order("borrowed_at", { ascending: false }),
    supabase.from("books").select("*"),
    supabase.from("members").select("*"),
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
  await refreshLoanStatuses();
  const { data, error } = await supabase
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
    total_copies: input.totalCopies,
    available_copies: input.totalCopies,
    published_year: input.publishedYear,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("books").insert(row).select("*").single();
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
  const { data: existing, error: fetchError } = await supabase
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
  if (updates.publishedYear !== undefined) patch.published_year = updates.publishedYear;

  const { data, error } = await supabase
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

export async function deleteBook(id: string): Promise<boolean> {
  const { data: activeLoans, error: loanError } = await supabase
    .from("loans")
    .select("id")
    .eq("book_id", id)
    .neq("status", "returned")
    .limit(1);
  throwIfError(loanError, "Failed to check book loans.");
  if (activeLoans && activeLoans.length > 0) {
    throw new Error("Cannot delete a book with active loans.");
  }

  const { data, error } = await supabase.from("books").delete().eq("id", id).select("id");
  throwIfError(error, "Failed to delete book.");
  return Boolean(data && data.length > 0);
}

export async function createMember(
  input: Omit<Member, "id" | "joinedAt" | "active">
): Promise<Member> {
  const row = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    phone: input.phone,
    joined_at: new Date().toISOString(),
    active: true,
  };

  const { data, error } = await supabase.from("members").insert(row).select("*").single();
  throwIfError(error, "Failed to create member.");

  const member = mapMember(data as MemberRow);
  await insertNotification(
    "member_added",
    "New member registered",
    `${member.name} joined the library.`,
    member.id
  );
  return member;
}

export async function updateMember(
  id: string,
  updates: Partial<Omit<Member, "id" | "joinedAt">>
): Promise<Member | null> {
  const { data: existing, error: fetchError } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load member.");
  if (!existing) return null;

  const patch: Partial<MemberRow> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.active !== undefined) patch.active = updates.active;

  const { data, error } = await supabase
    .from("members")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to update member.");
  return mapMember(data as MemberRow);
}

export async function deleteMember(id: string): Promise<boolean> {
  const { data: activeLoans, error: loanError } = await supabase
    .from("loans")
    .select("id")
    .eq("member_id", id)
    .neq("status", "returned")
    .limit(1);
  throwIfError(loanError, "Failed to check member loans.");
  if (activeLoans && activeLoans.length > 0) {
    throw new Error("Cannot delete a member with active loans.");
  }

  const { data, error } = await supabase.from("members").delete().eq("id", id).select("id");
  throwIfError(error, "Failed to delete member.");
  return Boolean(data && data.length > 0);
}

export async function checkoutBook(bookId: string, memberId: string, days = 14): Promise<Loan> {
  const [{ data: bookRow, error: bookError }, { data: memberRow, error: memberError }] =
    await Promise.all([
      supabase.from("books").select("*").eq("id", bookId).maybeSingle(),
      supabase.from("members").select("*").eq("id", memberId).maybeSingle(),
    ]);

  throwIfError(bookError, "Failed to load book.");
  throwIfError(memberError, "Failed to load member.");
  if (!bookRow) throw new Error("Book not found.");
  if (!memberRow) throw new Error("Member not found.");

  const book = mapBook(bookRow as BookRow);
  const member = mapMember(memberRow as MemberRow);

  if (!member.active) throw new Error("Member is inactive.");
  if (book.availableCopies < 1) throw new Error("No copies available.");

  const { data: activeLoans, error: activeError } = await supabase
    .from("loans")
    .select("id")
    .eq("member_id", memberId)
    .neq("status", "returned");
  throwIfError(activeError, "Failed to check member loans.");
  if ((activeLoans?.length ?? 0) >= 5) {
    throw new Error("Member already has the maximum of 5 active loans.");
  }

  const due = new Date();
  due.setDate(due.getDate() + days);
  const loanRow = {
    id: randomUUID(),
    book_id: bookId,
    member_id: memberId,
    borrowed_at: new Date().toISOString(),
    due_at: due.toISOString(),
    returned_at: null,
    status: "active" as const,
  };

  const nextAvailable = book.availableCopies - 1;
  const { error: bookUpdateError } = await supabase
    .from("books")
    .update({ available_copies: nextAvailable })
    .eq("id", bookId);
  throwIfError(bookUpdateError, "Failed to update book availability.");

  const { data, error } = await supabase.from("loans").insert(loanRow).select("*").single();
  if (error) {
    await supabase
      .from("books")
      .update({ available_copies: book.availableCopies })
      .eq("id", bookId);
    throw new Error(error.message || "Failed to checkout book.");
  }

  const loan = mapLoan(data as LoanRow);
  await insertNotification(
    "checked_out",
    "Book checked out",
    `${member.name} checked out "${book.title}". Due ${due.toLocaleDateString()}.`,
    loan.id
  );
  if (nextAvailable === 0) {
    await insertNotification(
      "low_stock",
      "No copies available",
      `"${book.title}" has 0 available copies.`,
      book.id
    );
  }
  return loan;
}

export async function returnBook(loanId: string): Promise<Loan> {
  const { data: loanRow, error: loanError } = await supabase
    .from("loans")
    .select("*")
    .eq("id", loanId)
    .maybeSingle();
  throwIfError(loanError, "Failed to load loan.");
  if (!loanRow) throw new Error("Loan not found.");

  const loan = mapLoan(loanRow as LoanRow);
  if (loan.status === "returned") throw new Error("Loan already returned.");

  const [{ data: bookRow }, { data: memberRow }] = await Promise.all([
    supabase.from("books").select("*").eq("id", loan.bookId).maybeSingle(),
    supabase.from("members").select("*").eq("id", loan.memberId).maybeSingle(),
  ]);

  const returnedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("loans")
    .update({ status: "returned", returned_at: returnedAt })
    .eq("id", loanId)
    .select("*")
    .single();
  throwIfError(error, "Failed to return book.");

  if (bookRow) {
    const book = mapBook(bookRow as BookRow);
    await supabase
      .from("books")
      .update({
        available_copies: Math.min(book.totalCopies, book.availableCopies + 1),
      })
      .eq("id", book.id);
  }

  const bookTitle = bookRow ? (bookRow as BookRow).title : "a book";
  const memberName = memberRow ? (memberRow as MemberRow).name : "Member";
  await insertNotification(
    "returned",
    "Book returned",
    `${memberName} returned "${bookTitle}".`,
    loanId
  );

  return mapLoan(data as LoanRow);
}

export async function renewLoan(loanId: string, extraDays = 14): Promise<Loan> {
  const { data: loanRow, error: loanError } = await supabase
    .from("loans")
    .select("*")
    .eq("id", loanId)
    .maybeSingle();
  throwIfError(loanError, "Failed to load loan.");
  if (!loanRow) throw new Error("Loan not found.");

  const loan = mapLoan(loanRow as LoanRow);
  if (loan.status === "returned") throw new Error("Cannot renew a returned loan.");

  const base = Math.max(Date.now(), new Date(loan.dueAt).getTime());
  const next = new Date(base);
  next.setDate(next.getDate() + extraDays);

  const { data, error } = await supabase
    .from("loans")
    .update({ due_at: next.toISOString(), status: "active" })
    .eq("id", loanId)
    .select("*")
    .single();
  throwIfError(error, "Failed to renew loan.");

  const [{ data: bookRow }, { data: memberRow }] = await Promise.all([
    supabase.from("books").select("title").eq("id", loan.bookId).maybeSingle(),
    supabase.from("members").select("name").eq("id", loan.memberId).maybeSingle(),
  ]);

  await insertNotification(
    "due_soon",
    "Loan renewed",
    `"${bookRow?.title ?? "Book"}" for ${memberRow?.name ?? "member"} is now due ${next.toLocaleDateString()}.`,
    loanId
  );

  return mapLoan(data as LoanRow);
}

export async function markNotificationRead(id: string): Promise<Notification | null> {
  const { data: existing, error: fetchError } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(fetchError, "Failed to load notification.");
  if (!existing) return null;

  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to mark notification read.");
  return mapNotification(data as NotificationRow);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data: unread, error: fetchError } = await supabase
    .from("notifications")
    .select("id")
    .eq("read", false);
  throwIfError(fetchError, "Failed to load unread notifications.");

  const ids = (unread ?? []).map((n) => n.id as string);
  if (ids.length === 0) return 0;

  const { error } = await supabase
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
  const { data, error } = await supabase
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
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
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
