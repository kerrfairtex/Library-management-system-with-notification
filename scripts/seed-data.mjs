#!/usr/bin/env node
/**
 * COMPLETE DEMO DATA SEEDING SCRIPT
 * Seeds: users, members, books, book_items, circulation_rules, holds (cleanup)
 */

import "./_polyfill.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes, scryptSync } from 'crypto';

const CONFIG = {
  URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
};

if (!CONFIG.URL || !CONFIG.KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(CONFIG.URL, CONFIG.KEY);

function hashPassword(password, salt = null) {
  if (!salt) salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEMO USERS (auth accounts)
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_USERS = [
  { name: "Demo Student",   email: "student@gmail.com",   password: "student123",   role: "student" },
  { name: "Demo Librarian", email: "librarian@gmail.com", password: "librarian123",  role: "librarian" },
  { name: "Demo Admin",     email: "admin@gmail.com",     password: "admin123",     role: "admin" },
  { name: "Admin User",     email: "admin@library.com",   password: "admin123",     role: "admin" },
  { name: "Librarian User", email: "librarian@library.com", password: "librarian123", role: "librarian" },
  { name: "Student User",   email: "student@library.com", password: "student123",   role: "student" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. MEMBERS (library patrons) - linked to users via userId
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_MEMBERS = [
  { name: "Demo Student",   email: "student@gmail.com",   phone: "09123456789", memberType: "student", studentId: "STU002", grade: "Grade 10", userEmail: "student@gmail.com" },
  { name: "Demo Librarian", email: "librarian@gmail.com", phone: "09123456789", memberType: "staff",   studentId: null,     grade: null,     userEmail: "librarian@gmail.com" },
  { name: "Demo Admin",     email: "admin@gmail.com",     phone: "09123456789", memberType: "staff",   studentId: null,     grade: null,     userEmail: "admin@gmail.com" },
  { name: "Student User",   email: "student@library.com", phone: "09123456789", memberType: "student", studentId: "STU001", grade: "Grade 10", userEmail: "student@library.com" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. SAMPLE BOOKS
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLE_BOOKS = [
  { title: "Crop Science and Production", author: "Department of Agriculture", genre: "agriculture", isbn: "SAMPLE-AGR-001", copies: 3, year: 2015 },
  { title: "Animal Science: Livestock and Poultry", author: "Department of Agriculture", genre: "agriculture", isbn: "SAMPLE-AGR-002", copies: 2, year: 2015 },
  { title: "Aquaculture and Fisheries Management", author: "Department of Agriculture", genre: "agriculture", isbn: "SAMPLE-AGR-003", copies: 2, year: 2015 },
  { title: "Soil Science and Conservation", author: "Department of Agriculture", genre: "agriculture", isbn: "SAMPLE-AGR-004", copies: 2, year: 2015 },
  { title: "Understanding the Self", author: "Commission on Higher Education", genre: "education", isbn: "SAMPLE-CHED-001", copies: 3, year: 2018 },
  { title: "Purposive Communication", author: "Commission on Higher Education", genre: "language", isbn: "SAMPLE-CHED-002", copies: 3, year: 2018 },
  { title: "Mathematics in the Modern World", author: "Commission on Higher Education", genre: "mathematics", isbn: "SAMPLE-CHED-003", copies: 3, year: 2018 },
  { title: "Readings in Philippine History", author: "Commission on Higher Education", genre: "history", isbn: "SAMPLE-CHED-004", copies: 3, year: 2018 },
  { title: "Noli Me Tangere", author: "José Rizal", genre: "literature", isbn: "SAMPLE-LIT-001", copies: 2, year: 1887 },
  { title: "El Filibusterismo", author: "José Rizal", genre: "literature", isbn: "SAMPLE-LIT-002", copies: 2, year: 1891 },
  { title: "Test Book", author: "Test Author", genre: "Fiction", isbn: "9781234567890", copies: 3, year: 2024 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. CIRCULATION RULES
// ─────────────────────────────────────────────────────────────────────────────
const CIRCULATION_RULES = [
  { member_type: "student", loan_days: 14, renewal_days: 7, max_renewals: 2, max_loans: 5, fine_per_day: 5 },
  { member_type: "staff",   loan_days: 30, renewal_days: 14, max_renewals: 3, max_loans: 10, fine_per_day: 2 },
  { member_type: "community", loan_days: 7, renewal_days: 7, max_renewals: 1, max_loans: 3, fine_per_day: 10 },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function upsertUser(u) {
  const passwordHash = hashPassword(u.password);
  const { data: existing } = await supabase.from("users").select("id").ilike("email", u.email).maybeSingle();
  if (existing) {
    await supabase.from("users").update({ name: u.name, password_hash: passwordHash, role: u.role, status: 'active' }).eq("id", existing.id);
    console.log(`✅ Updated user: ${u.email} (${u.role})`);
    return existing.id;
  } else {
    const id = randomUUID();
    await supabase.from("users").insert({ id, name: u.name, email: u.email, password_hash: passwordHash, role: u.role, status: 'active', created_at: new Date().toISOString() });
    console.log(`✅ Created user: ${u.email} (${u.role})`);
    return id;
  }
}

async function getUserId(email) {
  const { data } = await supabase.from("users").select("id").ilike("email", email).maybeSingle();
  return data?.id || null;
}

async function upsertMember(m, userId) {
  const { data: existing } = await supabase.from("members").select("id").ilike("email", m.email).maybeSingle();
  const row = {
    name: m.name,
    email: m.email,
    phone: m.phone,
    member_type: m.memberType,
    student_id: m.studentId,
    grade: m.grade,
    user_id: userId,
    active: true,
    joined_at: new Date().toISOString(),
  };
  if (existing) {
    await supabase.from("members").update(row).eq("id", existing.id);
    console.log(`✅ Updated member: ${m.email} (userId: ${userId})`);
    return existing.id;
  } else {
    const id = randomUUID();
    await supabase.from("members").insert({ id, ...row });
    console.log(`✅ Created member: ${m.email} (userId: ${userId})`);
    return id;
  }
}

async function upsertBook(b) {
  const { data: existing } = await supabase.from("books").select("id").eq("isbn", b.isbn).maybeSingle();
  const row = {
    title: b.title,
    author: b.author,
    genre: b.genre,
    total_copies: b.copies,
    available_copies: b.copies,
    published_year: b.year,
    category: "General",
  };
  if (existing) {
    await supabase.from("books").update(row).eq("id", existing.id);
    console.log(`✅ Updated book: ${b.title} (${b.isbn})`);
    return existing.id;
  } else {
    const id = randomUUID();
    await supabase.from("books").insert({ id, ...row, isbn: b.isbn, created_at: new Date().toISOString() });
    console.log(`✅ Created book: ${b.title} (${b.isbn})`);
    return id;
  }
}

async function createBookItems(bookId, totalCopies) {
  const statuses = ["available", "available", "available", "available", "available"]; // all available
  for (let i = 0; i < totalCopies; i++) {
    const barcode = `${bookId.slice(0,8).toUpperCase()}-${String(i+1).padStart(3,'0')}`;
    await supabase.from("book_items").insert({
      id: randomUUID(),
      book_id: bookId,
      barcode,
      status: "available",
      home_branch: "MAIN",
      holding_branch: "MAIN",
      created_at: new Date().toISOString(),
    });
  }
  console.log(`✅ Created ${totalCopies} book items for book ${bookId}`);
}

async function upsertCirculationRule(r) {
  const { data: existing } = await supabase.from("circulation_rules").select("id").eq("member_type", r.member_type).maybeSingle();
  const row = { ...r };
  if (existing) {
    await supabase.from("circulation_rules").update(row).eq("id", existing.id);
    console.log(`✅ Updated circulation rule: ${r.member_type}`);
  } else {
    await supabase.from("circulation_rules").insert({ id: randomUUID(), ...row });
    console.log(`✅ Created circulation rule: ${r.member_type}`);
  }
}

async function clearStaleBorrowRequests() {
  // Delete all borrow_request holds (stale test data)
  const { error } = await supabase.from("holds").delete().eq("kind", "borrow_request");
  if (error) console.error(`⚠️ Could not clear borrow requests: ${error.message}`);
  else console.log(`✅ Cleared all stale borrow_request holds`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log('🔧 Starting COMPLETE demo data seeding...\n');

  // 0. Clear stale borrow requests
  await clearStaleBorrowRequests();

  // 1. Seed users
  console.log('\n📋 Seeding users...');
  const userIds = {};
  for (const u of DEMO_USERS) {
    userIds[u.email] = await upsertUser(u);
  }

  // 2. Seed members (linked to users)
  console.log('\n📋 Seeding members...');
  for (const m of DEMO_MEMBERS) {
    const userId = userIds[m.userEmail];
    if (!userId) {
      console.error(`❌ No user found for ${m.userEmail}`);
      continue;
    }
    await upsertMember(m, userId);
  }

  // 3. Seed books + book items
  console.log('\n📋 Seeding books & book items...');
  for (const b of SAMPLE_BOOKS) {
    const bookId = await upsertBook(b);
    await createBookItems(bookId, b.copies);
  }

  // 4. Seed circulation rules
  console.log('\n📋 Seeding circulation rules...');
  for (const r of CIRCULATION_RULES) {
    await upsertCirculationRule(r);
  }

  console.log('\n✅ ALL DONE! Demo data seeded successfully.');
  console.log('\nLogin credentials:');
  DEMO_USERS.forEach(u => console.log(`  ${u.role.padEnd(10)} ${u.email} / ${u.password}`));
})().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
