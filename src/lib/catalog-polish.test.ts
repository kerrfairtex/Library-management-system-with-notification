import test from "node:test";
import assert from "node:assert/strict";
import {
  activeFilterChips,
  catalogHref,
  decadeOf,
  pageNumbers,
  parseSort,
  searchCatalog,
  type CatalogParams,
  type PublicCatalogEntry,
} from "./catalog-search.ts";

const book = (p: Partial<PublicCatalogEntry>): PublicCatalogEntry => ({
  id: p.title ?? "x",
  title: "Untitled",
  author: "Anon",
  isbn: "9780000000000",
  genre: "",
  category: "General",
  callNumber: null,
  shelfLocation: null,
  publishedYear: 2020,
  availableCopies: 1,
  totalCopies: 1,
  ...p,
});

const books = [
  book({ title: "Soil Basics", author: "Garcia", category: "Agriculture", publishedYear: 2015, availableCopies: 3 }),
  book({ title: "Crop Science", author: "Garcia", category: "Agriculture", publishedYear: 2021, availableCopies: 0 }),
  book({ title: "Algorithms", author: "Knuth", category: "Computer / ICT", publishedYear: 1997, availableCopies: 1 }),
  book({ title: "Networks", author: "Tanenbaum", category: "Computer / ICT", publishedYear: 2011, availableCopies: 5 }),
];

const base: CatalogParams = { q: "", category: "", author: "", decade: "", available: false, sort: "relevance" };

test("sort options", () => {
  const titles = (sort: Parameters<typeof parseSort>[0]) =>
    searchCatalog(books, { sort: parseSort(sort) }).results.map((b) => b.title);
  assert.deepEqual(titles("title"), ["Algorithms", "Crop Science", "Networks", "Soil Basics"]);
  assert.deepEqual(titles("newest"), ["Crop Science", "Soil Basics", "Networks", "Algorithms"]);
  assert.deepEqual(titles("oldest")[0], "Algorithms");
  assert.deepEqual(titles("available")[0], "Networks");
  assert.deepEqual(titles("author"), ["Crop Science", "Soil Basics", "Algorithms", "Networks"]);
  assert.equal(parseSort("drop table"), "relevance");
});

test("facets count matches and ignore their own filter", () => {
  const { facets, total } = searchCatalog(books, { category: "Agriculture" });
  assert.equal(total, 2);
  // Picking a category still shows the other categories' counts.
  assert.deepEqual(facets.categories, [
    { value: "Agriculture", count: 2 },
    { value: "Computer / ICT", count: 2 },
  ]);
  // Other facets are narrowed by the category.
  assert.deepEqual(facets.authors, [{ value: "Garcia", count: 2 }]);
  assert.deepEqual(facets.decades.map((d) => d.value), ["2020s", "2010s"]);
  assert.equal(facets.onShelf, 1);
});

test("author and decade filters", () => {
  assert.equal(searchCatalog(books, { author: "Garcia" }).total, 2);
  assert.deepEqual(searchCatalog(books, { decade: "1990s" }).results.map((b) => b.title), ["Algorithms"]);
  assert.equal(decadeOf(2014), "2010s");
  assert.equal(decadeOf(0), "");
});

test("filters combine with the search words", () => {
  const r = searchCatalog(books, { q: "science", category: "Agriculture", availableOnly: true });
  assert.equal(r.total, 0);
  assert.equal(r.facets.onShelf, 0);
});

test("catalog links keep every filter and drop defaults", () => {
  const p = { ...base, q: "soil", category: "Agriculture", available: true, sort: "newest" as const };
  assert.equal(catalogHref(p), "/catalog?q=soil&category=Agriculture&available=1&sort=newest");
  assert.equal(catalogHref(p, { page: 2 }), "/catalog?q=soil&category=Agriculture&available=1&sort=newest&page=2");
  assert.equal(catalogHref(base), "/catalog");
  assert.equal(catalogHref(base, { page: 1 }), "/catalog");
});

test("each chip removes only its own filter", () => {
  const p = { ...base, q: "soil", author: "Garcia", available: true };
  const chips = activeFilterChips(p);
  assert.deepEqual(chips.map((c) => c.label), ["“soil”", "Garcia", "On shelf now"]);
  assert.equal(chips[1].href, "/catalog?q=soil&available=1");
  assert.deepEqual(activeFilterChips(base), []);
});

test("page numbers keep first, last and neighbours", () => {
  assert.deepEqual(pageNumbers(1, 1), [1]);
  assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(pageNumbers(5, 20), [1, "…", 4, 5, 6, "…", 20]);
  assert.deepEqual(pageNumbers(3, 20), [1, 2, 3, 4, "…", 20]);
  assert.deepEqual(pageNumbers(20, 20), [1, "…", 19, 20]);
});
