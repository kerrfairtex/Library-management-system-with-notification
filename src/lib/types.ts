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

export type UserRole =
  | "student"
  | "faculty"
  | "teacher"
  | "community"
  | "librarian"
  | "admin";

/** Patron roles need a linked members row; staff roles do not. */
export const PATRON_ROLES: readonly UserRole[] = ["student", "faculty", "teacher", "community"];
export const PRIVILEGED_ROLES: readonly UserRole[] = ["librarian", "admin"];

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

export type MemberType = "student" | "faculty" | "teacher" | "community" | "staff";

export type Member = {
  id: string;
  name: string;
  email: string;
  phone: string;
  memberType: MemberType;
  /** School student ID — required when memberType is "student". */
  studentId: string | null;
  /** Legacy class/grade text. Kept for compatibility; NOT the year level. */
  grade: string | null;
  /** Master-data references. Nullable for legacy records only. */
  departmentId: string | null;
  courseId: string | null;
  yearLevel: string | null;
  section: string | null;
  joinedAt: string;
  active: boolean;
  userId: string | null;           // FK to users
};

export type Department = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type Course = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  /** Owning department; null = offered across departments / not yet mapped. */
  departmentId: string | null;
  /** Program length in years (1-6); limits the year levels offered. null = not set. */
  programYears: number | null;
};

/** Database-backed administrator statistics (users = authoritative source). */
export type UserStatistics = {
  totalAccounts: number;
  activeAccounts: number;
  pendingAccounts: number;
  students: number;
  faculty: number;
  teachers: number;
  community: number;
  librarians: number;
  admins: number;
  totalMemberProfiles: number;
  incompleteStudentProfiles: number;
};

export type StudentCompletenessIssue = {
  memberId: string;
  userId: string | null;
  name: string;
  email: string;
  studentId: string | null;
  missingFields: string[];
};

export type StudentCompletenessAudit = {
  totalStudentAccounts: number;
  totalStudentMembers: number;
  linkedStudentAccounts: number;
  unlinkedStudentRecords: number;
  completeStudentProfiles: number;
  incompleteStudentProfiles: number;
  missingFieldBreakdown: Record<string, number>;
  duplicateStudentIds: string[];
  recordsRequiringReview: StudentCompletenessIssue[];
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
  | "hold_expired"
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
  recipient_member_id?: string;
  audience?: "member" | "staff";
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
