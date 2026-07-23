import { randomUUID } from "crypto";
import type { LibraryData } from "./types";
import { hashPassword } from "./auth";

const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const daysAgo = (days: number) => daysFromNow(-days);

export function createSeedUsers() {
  return [
    {
      id: randomUUID(),
      name: "Alex Rivera",
      email: "librarian@shelfwalk.app",
      passwordHash: hashPassword("librarian123"),
      role: "librarian" as const,
      createdAt: daysAgo(90),
    },
    {
      id: randomUUID(),
      name: "Morgan Ellis",
      email: "admin@shelfwalk.app",
      passwordHash: hashPassword("admin123"),
      role: "admin" as const,
      createdAt: daysAgo(90),
    },
  ];
}

export function createSeedData(): LibraryData {
  const bookIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const memberIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const loanIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const users = createSeedUsers();

  const books = [
    {
      id: bookIds[0],
      title: "The Midnight Library",
      author: "Matt Haig",
      isbn: "978-0525559474",
      genre: "Fiction",
      totalCopies: 4,
      availableCopies: 2,
      publishedYear: 2020,
      createdAt: daysAgo(40),
    },
    {
      id: bookIds[1],
      title: "Atomic Habits",
      author: "James Clear",
      isbn: "978-0735211292",
      genre: "Self-Help",
      totalCopies: 5,
      availableCopies: 3,
      publishedYear: 2018,
      createdAt: daysAgo(35),
    },
    {
      id: bookIds[2],
      title: "Project Hail Mary",
      author: "Andy Weir",
      isbn: "978-0593135204",
      genre: "Science Fiction",
      totalCopies: 3,
      availableCopies: 1,
      publishedYear: 2021,
      createdAt: daysAgo(30),
    },
    {
      id: bookIds[3],
      title: "Educated",
      author: "Tara Westover",
      isbn: "978-0399590504",
      genre: "Memoir",
      totalCopies: 2,
      availableCopies: 0,
      publishedYear: 2018,
      createdAt: daysAgo(25),
    },
    {
      id: bookIds[4],
      title: "The Design of Everyday Things",
      author: "Don Norman",
      isbn: "978-0465050659",
      genre: "Design",
      totalCopies: 3,
      availableCopies: 3,
      publishedYear: 2013,
      createdAt: daysAgo(20),
    },
    {
      id: bookIds[5],
      title: "Sapiens",
      author: "Yuval Noah Harari",
      isbn: "978-0062316097",
      genre: "History",
      totalCopies: 4,
      availableCopies: 2,
      publishedYear: 2015,
      createdAt: daysAgo(15),
    },
  ];

  const members = [
    {
      id: memberIds[0],
      name: "Ava Chen",
      email: "ava.chen@example.com",
      phone: "555-0101",
      joinedAt: daysAgo(60),
      active: true,
    },
    {
      id: memberIds[1],
      name: "Marcus Rivera",
      email: "marcus.r@example.com",
      phone: "555-0102",
      joinedAt: daysAgo(45),
      active: true,
    },
    {
      id: memberIds[2],
      name: "Priya Nair",
      email: "priya.nair@example.com",
      phone: "555-0103",
      joinedAt: daysAgo(30),
      active: true,
    },
    {
      id: memberIds[3],
      name: "Jordan Blake",
      email: "jordan.blake@example.com",
      phone: "555-0104",
      joinedAt: daysAgo(12),
      active: true,
    },
  ];

  const loans = [
    {
      id: loanIds[0],
      bookId: bookIds[0],
      memberId: memberIds[0],
      borrowedAt: daysAgo(10),
      dueAt: daysFromNow(4),
      returnedAt: null,
      status: "active" as const,
    },
    {
      id: loanIds[1],
      bookId: bookIds[1],
      memberId: memberIds[1],
      borrowedAt: daysAgo(18),
      dueAt: daysAgo(4),
      returnedAt: null,
      status: "overdue" as const,
    },
    {
      id: loanIds[2],
      bookId: bookIds[2],
      memberId: memberIds[2],
      borrowedAt: daysAgo(5),
      dueAt: daysFromNow(2),
      returnedAt: null,
      status: "active" as const,
    },
    {
      id: loanIds[3],
      bookId: bookIds[3],
      memberId: memberIds[3],
      borrowedAt: daysAgo(20),
      dueAt: daysAgo(6),
      returnedAt: null,
      status: "overdue" as const,
    },
  ];

  const notifications = [
    {
      id: randomUUID(),
      type: "overdue" as const,
      title: "Overdue loan",
      message: `"Atomic Habits" borrowed by Marcus Rivera is 4 days overdue.`,
      relatedId: loanIds[1],
      read: false,
      createdAt: daysAgo(1),
    },
    {
      id: randomUUID(),
      type: "overdue" as const,
      title: "Overdue loan",
      message: `"Educated" borrowed by Jordan Blake is 6 days overdue.`,
      relatedId: loanIds[3],
      read: false,
      createdAt: daysAgo(1),
    },
    {
      id: randomUUID(),
      type: "due_soon" as const,
      title: "Due soon",
      message: `"Project Hail Mary" borrowed by Priya Nair is due in 2 days.`,
      relatedId: loanIds[2],
      read: false,
      createdAt: daysAgo(0),
    },
    {
      id: randomUUID(),
      type: "low_stock" as const,
      title: "No copies available",
      message: `"Educated" has 0 available copies.`,
      relatedId: bookIds[3],
      read: true,
      createdAt: daysAgo(3),
    },
    {
      id: randomUUID(),
      type: "book_added" as const,
      title: "New book added",
      message: `"Sapiens" by Yuval Noah Harari was added to the catalog.`,
      relatedId: bookIds[5],
      read: true,
      createdAt: daysAgo(15),
    },
  ];

  return { users, books, members, loans, notifications };
}
