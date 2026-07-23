import type { Book, Loan, Member, Notification, NotificationType } from "./types";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function notificationTone(type: NotificationType): string {
  switch (type) {
    case "overdue":
      return "tone-danger";
    case "due_soon":
    case "low_stock":
      return "tone-warn";
    case "returned":
    case "book_added":
    case "member_added":
      return "tone-ok";
    default:
      return "tone-info";
  }
}

export type EnrichedLoan = Loan & {
  book?: Book;
  member?: Member;
};

export function enrichLoans(
  loans: Loan[],
  books: Book[],
  members: Member[]
): EnrichedLoan[] {
  return loans.map((loan) => ({
    ...loan,
    book: books.find((b) => b.id === loan.bookId),
    member: members.find((m) => m.id === loan.memberId),
  }));
}

export function sortNotifications(notifications: Notification[]): Notification[] {
  return [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
