/** Shape returned by the public /api/shelf-availability endpoint.
 *  Used by the standalone 3D bookshelf companion site. */
export type ShelfBook = {
  id: string;
  isbn: string;
  title: string;
  author: string;
  genre: string;
  available_copies: number;
  total_copies: number;
};

export type UserRole = "student" | "librarian" | "admin";

/** Membership verification gate: self-sign-ups start 'pending' until an admin approves. */
export type UserStatus = "pending" | "active";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  authUserId: string | null;       // FK to auth.users
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: UserStatus;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  genre: string;
  category: string;
  shelfLocation: string | null;
  callNumber: string | null;
  totalCopies: number;
  availableCopies: number;
  publishedYear: number;
  createdAt: string;
};

export type BookItemStatus = 
  | "available" 
  | "on_loan" 
  | "not_for_loan" 
  | "damaged" 
  | "lost" 
  | "withdrawn" 
  | "in_transit";

export type BookItem = {
  id: string;
  bookId: string;
  barcode: string;
  status: BookItemStatus;
  callNumber: string | null;
  shelfLocation: string | null;
  homeBranch: string;
  holdingBranch: string;
  notes: string | null;            // private, staff-only via RPC
  createdAt: string;
};

export type MemberType = "student" | "staff" | "community";

export type Member = {
  id: string;
  name: string;
  email: string;
  phone: string;
  memberType: MemberType;
  /** School student ID — required when memberType is "student". */
  studentId: string | null;
  /** Class / grade level for students (e.g. "Grade 10", "Year 2"). */
  grade: string | null;
  joinedAt: string;
  active: boolean;
  userId: string | null;           // FK to users
};

export type LoanStatus = "active" | "returned" | "overdue";

export type Loan = {
  id: string;
  bookId: string;
  memberId: string;
  itemId: string | null;           // FK to book_items
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: LoanStatus;
  renewalsCount: number;           // number of times renewed
  issuedBy: string | null;         // staff user who checked out
};

export type Hold = {
  id: string;
  bookId: string;
  memberId: string;
  /** 'hold' = reservation; 'borrow_request' = student borrow request awaiting approval. */
  kind: "hold" | "borrow_request";
  status: "pending" | "ready" | "fulfilled" | "cancelled" | "expired" | "approved" | "rejected";
  priority: number;
  pickupBranch: string | null;
  placedAt: string;
  expiresAt: string | null;
  /** Loan created when this hold/request is checked out to the patron. */
  fulfilledLoanId: string | null;
  cancelledReason: string | null;
};

export type FineType = 
  | "overdue" 
  | "lost" 
  | "damaged" 
  | "manual_invoice" 
  | "credit" 
  | "forgive";

export type Fine = {
  id: string;
  memberId: string;
  loanId: string | null;
  type: FineType;
  amount: number;
  amountOutstanding: number;
  description: string | null;
  issuedBy: string | null;         // staff user who issued
  createdAt: string;
  paidAt: string | null;
};

export type CirculationRule = {
  id: string;
  memberType: MemberType;
  loanDays: number;
  renewalDays: number;
  maxRenewals: number;
  maxLoans: number;
  finePerDay: number;
};

export type NotificationType =
  | "overdue"
  | "hold_ready"
  | "pending_approval"
  | "due_soon"
  | "returned"
  | "renewed"
  | "checked_out"
  | "book_added"
  | "member_added"
  | "low_stock"
  | "borrow_request_submitted"
  | "borrow_request_approved"
  | "borrow_request_rejected";

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
  bookItems: BookItem[];
  members: Member[];
  loans: Loan[];
  holds: Hold[];
  fines: Fine[];
  circulationRules: CirculationRule[];
  notifications: Notification[];
};

export type DashboardStats = {
  outstandingFines: number;
  overdueFinesCount: number;
  totalBooks: number;
  availableBooks: number;
  totalMembers: number;
  activeLoans: number;
  overdueLoans: number;
  unreadNotifications: number;
};
