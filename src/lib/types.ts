export type UserRole = "librarian" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  genre: string;
  totalCopies: number;
  availableCopies: number;
  publishedYear: number;
  createdAt: string;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  phone: string;
  joinedAt: string;
  active: boolean;
};

export type LoanStatus = "active" | "returned" | "overdue";

export type Loan = {
  id: string;
  bookId: string;
  memberId: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: LoanStatus;
};

export type NotificationType =
  | "overdue"
  | "due_soon"
  | "returned"
  | "checked_out"
  | "book_added"
  | "member_added"
  | "low_stock";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: string;
  read: boolean;
  createdAt: string;
};

export type LibraryData = {
  users: User[];
  books: Book[];
  members: Member[];
  loans: Loan[];
  notifications: Notification[];
};

export type DashboardStats = {
  totalBooks: number;
  availableBooks: number;
  totalMembers: number;
  activeLoans: number;
  overdueLoans: number;
  unreadNotifications: number;
};
