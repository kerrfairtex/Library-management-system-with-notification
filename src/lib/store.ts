import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Book,
  DashboardStats,
  LibraryData,
  Loan,
  Member,
  Notification,
  NotificationType,
} from "./types";
import { createSeedData } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "library.json");

let writeQueue: Promise<void> = Promise.resolve();

async function ensureDataFile(): Promise<LibraryData> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as LibraryData;
  } catch {
    const seed = createSeedData();
    await fs.writeFile(DATA_FILE, JSON.stringify(seed, null, 2), "utf-8");
    return seed;
  }
}

async function readData(): Promise<LibraryData> {
  return ensureDataFile();
}

async function writeData(data: LibraryData): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  });
  await writeQueue;
}

function pushNotification(
  data: LibraryData,
  type: NotificationType,
  title: string,
  message: string,
  relatedId?: string
) {
  const notification: Notification = {
    id: randomUUID(),
    type,
    title,
    message,
    relatedId,
    read: false,
    createdAt: new Date().toISOString(),
  };
  data.notifications.unshift(notification);
  return notification;
}

function refreshLoanStatuses(data: LibraryData) {
  const now = Date.now();
  for (const loan of data.loans) {
    if (loan.status === "returned") continue;
    const due = new Date(loan.dueAt).getTime();
    const nextStatus = due < now ? "overdue" : "active";
    if (loan.status !== nextStatus) {
      loan.status = nextStatus;
      if (nextStatus === "overdue") {
        const book = data.books.find((b) => b.id === loan.bookId);
        const member = data.members.find((m) => m.id === loan.memberId);
        const exists = data.notifications.some(
          (n) =>
            n.type === "overdue" &&
            n.relatedId === loan.id &&
            !n.read &&
            Date.now() - new Date(n.createdAt).getTime() < 1000 * 60 * 60 * 24
        );
        if (!exists && book && member) {
          pushNotification(
            data,
            "overdue",
            "Overdue loan",
            `"${book.title}" borrowed by ${member.name} is overdue.`,
            loan.id
          );
        }
      }
    }
  }
}

function ensureDueSoonNotifications(data: LibraryData) {
  const now = Date.now();
  const threeDays = 1000 * 60 * 60 * 24 * 3;
  for (const loan of data.loans) {
    if (loan.status !== "active") continue;
    const due = new Date(loan.dueAt).getTime();
    const remaining = due - now;
    if (remaining <= threeDays && remaining > 0) {
      const exists = data.notifications.some(
        (n) => n.type === "due_soon" && n.relatedId === loan.id
      );
      if (!exists) {
        const book = data.books.find((b) => b.id === loan.bookId);
        const member = data.members.find((m) => m.id === loan.memberId);
        if (book && member) {
          const days = Math.max(1, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
          pushNotification(
            data,
            "due_soon",
            "Due soon",
            `"${book.title}" borrowed by ${member.name} is due in ${days} day${days === 1 ? "" : "s"}.`,
            loan.id
          );
        }
      }
    }
  }
}

export async function getLibraryData(): Promise<LibraryData> {
  const data = await readData();
  refreshLoanStatuses(data);
  ensureDueSoonNotifications(data);
  await writeData(data);
  return data;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const data = await getLibraryData();
  return {
    totalBooks: data.books.reduce((sum, b) => sum + b.totalCopies, 0),
    availableBooks: data.books.reduce((sum, b) => sum + b.availableCopies, 0),
    totalMembers: data.members.filter((m) => m.active).length,
    activeLoans: data.loans.filter((l) => l.status !== "returned").length,
    overdueLoans: data.loans.filter((l) => l.status === "overdue").length,
    unreadNotifications: data.notifications.filter((n) => !n.read).length,
  };
}

export async function createBook(
  input: Omit<Book, "id" | "availableCopies" | "createdAt">
): Promise<Book> {
  const data = await getLibraryData();
  const book: Book = {
    ...input,
    id: randomUUID(),
    availableCopies: input.totalCopies,
    createdAt: new Date().toISOString(),
  };
  data.books.unshift(book);
  pushNotification(
    data,
    "book_added",
    "New book added",
    `"${book.title}" by ${book.author} was added to the catalog.`,
    book.id
  );
  await writeData(data);
  return book;
}

export async function updateBook(
  id: string,
  updates: Partial<Omit<Book, "id" | "createdAt">>
): Promise<Book | null> {
  const data = await getLibraryData();
  const book = data.books.find((b) => b.id === id);
  if (!book) return null;

  const borrowed = book.totalCopies - book.availableCopies;
  if (updates.totalCopies !== undefined) {
    if (updates.totalCopies < borrowed) {
      throw new Error(`Cannot set total copies below ${borrowed} (currently borrowed).`);
    }
    book.availableCopies = updates.totalCopies - borrowed;
    book.totalCopies = updates.totalCopies;
  }
  if (updates.title !== undefined) book.title = updates.title;
  if (updates.author !== undefined) book.author = updates.author;
  if (updates.isbn !== undefined) book.isbn = updates.isbn;
  if (updates.genre !== undefined) book.genre = updates.genre;
  if (updates.publishedYear !== undefined) book.publishedYear = updates.publishedYear;

  if (book.availableCopies === 0) {
    pushNotification(
      data,
      "low_stock",
      "No copies available",
      `"${book.title}" has 0 available copies.`,
      book.id
    );
  }

  await writeData(data);
  return book;
}

export async function deleteBook(id: string): Promise<boolean> {
  const data = await getLibraryData();
  const activeLoan = data.loans.find((l) => l.bookId === id && l.status !== "returned");
  if (activeLoan) {
    throw new Error("Cannot delete a book with active loans.");
  }
  const before = data.books.length;
  data.books = data.books.filter((b) => b.id !== id);
  if (data.books.length === before) return false;
  await writeData(data);
  return true;
}

export async function createMember(
  input: Omit<Member, "id" | "joinedAt" | "active">
): Promise<Member> {
  const data = await getLibraryData();
  const member: Member = {
    ...input,
    id: randomUUID(),
    joinedAt: new Date().toISOString(),
    active: true,
  };
  data.members.unshift(member);
  pushNotification(
    data,
    "member_added",
    "New member registered",
    `${member.name} joined the library.`,
    member.id
  );
  await writeData(data);
  return member;
}

export async function updateMember(
  id: string,
  updates: Partial<Omit<Member, "id" | "joinedAt">>
): Promise<Member | null> {
  const data = await getLibraryData();
  const member = data.members.find((m) => m.id === id);
  if (!member) return null;
  Object.assign(member, updates);
  await writeData(data);
  return member;
}

export async function deleteMember(id: string): Promise<boolean> {
  const data = await getLibraryData();
  const activeLoan = data.loans.find((l) => l.memberId === id && l.status !== "returned");
  if (activeLoan) {
    throw new Error("Cannot delete a member with active loans.");
  }
  const before = data.members.length;
  data.members = data.members.filter((m) => m.id !== id);
  if (data.members.length === before) return false;
  await writeData(data);
  return true;
}

export async function checkoutBook(bookId: string, memberId: string, days = 14): Promise<Loan> {
  const data = await getLibraryData();
  const book = data.books.find((b) => b.id === bookId);
  const member = data.members.find((m) => m.id === memberId);
  if (!book) throw new Error("Book not found.");
  if (!member) throw new Error("Member not found.");
  if (!member.active) throw new Error("Member is inactive.");
  if (book.availableCopies < 1) throw new Error("No copies available.");

  const memberActiveLoans = data.loans.filter(
    (l) => l.memberId === memberId && l.status !== "returned"
  );
  if (memberActiveLoans.length >= 5) {
    throw new Error("Member already has the maximum of 5 active loans.");
  }

  book.availableCopies -= 1;
  const due = new Date();
  due.setDate(due.getDate() + days);
  const loan: Loan = {
    id: randomUUID(),
    bookId,
    memberId,
    borrowedAt: new Date().toISOString(),
    dueAt: due.toISOString(),
    returnedAt: null,
    status: "active",
  };
  data.loans.unshift(loan);
  pushNotification(
    data,
    "checked_out",
    "Book checked out",
    `${member.name} checked out "${book.title}". Due ${due.toLocaleDateString()}.`,
    loan.id
  );
  if (book.availableCopies === 0) {
    pushNotification(
      data,
      "low_stock",
      "No copies available",
      `"${book.title}" has 0 available copies.`,
      book.id
    );
  }
  await writeData(data);
  return loan;
}

export async function returnBook(loanId: string): Promise<Loan> {
  const data = await getLibraryData();
  const loan = data.loans.find((l) => l.id === loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "returned") throw new Error("Loan already returned.");

  const book = data.books.find((b) => b.id === loan.bookId);
  const member = data.members.find((m) => m.id === loan.memberId);
  loan.status = "returned";
  loan.returnedAt = new Date().toISOString();
  if (book) {
    book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
  }
  pushNotification(
    data,
    "returned",
    "Book returned",
    `${member?.name ?? "Member"} returned "${book?.title ?? "a book"}".`,
    loan.id
  );
  await writeData(data);
  return loan;
}

export async function renewLoan(loanId: string, extraDays = 14): Promise<Loan> {
  const data = await getLibraryData();
  const loan = data.loans.find((l) => l.id === loanId);
  if (!loan) throw new Error("Loan not found.");
  if (loan.status === "returned") throw new Error("Cannot renew a returned loan.");

  const base = Math.max(Date.now(), new Date(loan.dueAt).getTime());
  const next = new Date(base);
  next.setDate(next.getDate() + extraDays);
  loan.dueAt = next.toISOString();
  loan.status = "active";

  const book = data.books.find((b) => b.id === loan.bookId);
  const member = data.members.find((m) => m.id === loan.memberId);
  pushNotification(
    data,
    "due_soon",
    "Loan renewed",
    `"${book?.title ?? "Book"}" for ${member?.name ?? "member"} is now due ${next.toLocaleDateString()}.`,
    loan.id
  );
  await writeData(data);
  return loan;
}

export async function markNotificationRead(id: string): Promise<Notification | null> {
  const data = await getLibraryData();
  const notification = data.notifications.find((n) => n.id === id);
  if (!notification) return null;
  notification.read = true;
  await writeData(data);
  return notification;
}

export async function markAllNotificationsRead(): Promise<number> {
  const data = await getLibraryData();
  let count = 0;
  for (const n of data.notifications) {
    if (!n.read) {
      n.read = true;
      count += 1;
    }
  }
  await writeData(data);
  return count;
}

export async function resetLibraryData(): Promise<LibraryData> {
  const seed = createSeedData();
  await writeData(seed);
  return seed;
}
