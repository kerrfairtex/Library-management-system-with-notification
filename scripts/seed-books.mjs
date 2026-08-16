#!/usr/bin/env node
// Seeds SAMPLE educational books into the catalog so the student-facing
// shelves have content. Titles follow DepEd / CHED general-education and
// agricultural-science material used in Philippine schools and colleges.
//
// These are sample rows — librarians and admins can edit or delete every
// entry from the Catalog page (books.write). ISBNs use the SAMPLE- prefix so
// they can never collide with real catalog entries.
//
// Usage:
//   node --env-file=.env.local scripts/seed-books.mjs
//
// Requires SUPABASE_URL and a server-side key (SUPABASE_SECRET_KEY or
// SUPABASE_SERVICE_ROLE_KEY) — the same variables the app's API routes use.
// Safe to re-run: books are matched by ISBN and updated in place.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY).\n" +
      "Run this with your env file loaded, e.g.:\n" +
      "  node --env-file=.env.local scripts/seed-books.mjs"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// genre values map onto the shelf order in src/components/AcademicShelves.tsx
const sampleBooks = [
  // ── Agricultural sciences (TRAC's core) ────────────────────────────────
  { title: "Crop Science and Production", author: "Department of Agriculture", genre: "agriculture", isbn: "SAMPLE-AGR-001", copies: 3, year: 2015 },
  { title: "Animal Science: Livestock and Poultry", author: "Department of Agriculture", genre: "agriculture", isbn: "SAMPLE-AGR-002", copies: 2, year: 2015 },
  { title: "Aquaculture and Fisheries Management", author: "Department of Agriculture", genre: "agriculture", isbn: "SAMPLE-AGR-003", copies: 2, year: 2015 },
  { title: "Soil Science and Conservation", author: "Department of Agriculture", genre: "agriculture", isbn: "SAMPLE-AGR-004", copies: 2, year: 2015 },
  { title: "Agricultural Engineering and Farm Machinery", author: "Department of Agriculture", genre: "engineering", isbn: "SAMPLE-ENG-001", copies: 2, year: 2015 },
  // ── CHED general education (college core curriculum) ───────────────────
  { title: "Understanding the Self", author: "Commission on Higher Education", genre: "education", isbn: "SAMPLE-CHED-001", copies: 3, year: 2018 },
  { title: "Purposive Communication", author: "Commission on Higher Education", genre: "language", isbn: "SAMPLE-CHED-002", copies: 3, year: 2018 },
  { title: "Mathematics in the Modern World", author: "Commission on Higher Education", genre: "mathematics", isbn: "SAMPLE-CHED-003", copies: 3, year: 2018 },
  { title: "Readings in Philippine History", author: "Commission on Higher Education", genre: "history", isbn: "SAMPLE-CHED-004", copies: 3, year: 2018 },
  { title: "Art Appreciation", author: "Commission on Higher Education", genre: "arts", isbn: "SAMPLE-CHED-005", copies: 3, year: 2018 },
  { title: "Ethics", author: "Commission on Higher Education", genre: "philosophy", isbn: "SAMPLE-CHED-006", copies: 3, year: 2018 },
  { title: "Science, Technology and Society", author: "Commission on Higher Education", genre: "science", isbn: "SAMPLE-CHED-007", copies: 3, year: 2018 },
  { title: "The Contemporary World", author: "Commission on Higher Education", genre: "social", isbn: "SAMPLE-CHED-008", copies: 3, year: 2018 },
  { title: "Rizal: Life and Works", author: "Commission on Higher Education", genre: "history", isbn: "SAMPLE-CHED-009", copies: 3, year: 2018 },
  { title: "Introduction to Information Technology", author: "Commission on Higher Education", genre: "computer", isbn: "SAMPLE-CHED-010", copies: 3, year: 2018 },
  // ── DepEd senior high school ───────────────────────────────────────────
  { title: "21st Century Literature from the Philippines and the World", author: "Department of Education", genre: "literature", isbn: "SAMPLE-DEPED-001", copies: 4, year: 2016 },
  { title: "General Mathematics", author: "Department of Education", genre: "mathematics", isbn: "SAMPLE-DEPED-002", copies: 4, year: 2016 },
  { title: "Earth and Life Science", author: "Department of Education", genre: "science", isbn: "SAMPLE-DEPED-003", copies: 4, year: 2016 },
  { title: "Understanding Culture, Society and Politics", author: "Department of Education", genre: "social", isbn: "SAMPLE-DEPED-004", copies: 4, year: 2016 },
  { title: "Personal Development", author: "Department of Education", genre: "education", isbn: "SAMPLE-DEPED-005", copies: 4, year: 2016 },
  { title: "Entrepreneurship", author: "Department of Education", genre: "business", isbn: "SAMPLE-DEPED-006", copies: 4, year: 2016 },
  { title: "Contemporary Philippine Arts from the Regions", author: "Department of Education", genre: "arts", isbn: "SAMPLE-DEPED-007", copies: 3, year: 2016 },
  { title: "Environmental Science", author: "Department of Education", genre: "science", isbn: "SAMPLE-DEPED-008", copies: 3, year: 2016 },
  { title: "General Biology", author: "Department of Education", genre: "science", isbn: "SAMPLE-DEPED-009", copies: 3, year: 2016 },
  { title: "General Chemistry", author: "Department of Education", genre: "science", isbn: "SAMPLE-DEPED-010", copies: 3, year: 2016 },
  { title: "Fundamentals of Physics", author: "Department of Education", genre: "science", isbn: "SAMPLE-DEPED-011", copies: 3, year: 2016 },
  // ── Philippine literature classics ─────────────────────────────────────
  { title: "Noli Me Tangere", author: "José Rizal", genre: "literature", isbn: "SAMPLE-LIT-001", copies: 2, year: 1887 },
  { title: "El Filibusterismo", author: "José Rizal", genre: "literature", isbn: "SAMPLE-LIT-002", copies: 2, year: 1891 },
  { title: "Florante at Laura", author: "Francisco Balagtas", genre: "literature", isbn: "SAMPLE-LIT-003", copies: 2, year: 1838 },
  // ── Reference ──────────────────────────────────────────────────────────
  { title: "UP Diksiyonaryong Filipino", author: "Virgilio S. Almario", genre: "reference", isbn: "SAMPLE-REF-001", copies: 2, year: 2010 },
];

let created = 0;
let updated = 0;
let hadError = false;

for (const book of sampleBooks) {
  const { data: existing, error: findError } = await supabase
    .from("books")
    .select("id")
    .eq("isbn", book.isbn)
    .maybeSingle();

  if (findError) {
    hadError = true;
    console.error(`✗ Could not check ${book.isbn}: ${findError.message}`);
    continue;
  }

  const row = {
    title: book.title,
    author: book.author,
    genre: book.genre,
    total_copies: book.copies,
    available_copies: book.copies,
    published_year: book.year,
  };

  if (existing) {
    const { error: updateError } = await supabase
      .from("books")
      .update(row)
      .eq("id", existing.id);
    if (updateError) {
      hadError = true;
      console.error(`✗ Failed to update ${book.isbn}: ${updateError.message}`);
    } else {
      updated += 1;
    }
    continue;
  }

  const { error: insertError } = await supabase.from("books").insert({
    ...row,
    isbn: book.isbn,
    created_at: new Date().toISOString(),
  });
  if (insertError) {
    hadError = true;
    console.error(`✗ Failed to create ${book.isbn}: ${insertError.message}`);
  } else {
    created += 1;
  }
}

if (hadError) process.exit(1);

console.log(`✓ Seeded ${sampleBooks.length} sample books (${created} created, ${updated} updated).`);
console.log("These are sample rows: edit or delete any of them from the Catalog page.");
