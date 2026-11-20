"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { canAccess, roleLabel } from "@/lib/permissions";
import type { Book, BookItem, PublicUser } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { Badge, Button, buttonClass, ErrorState, Modal, PageHeader, Table, useDialogs } from "@/components/ui";
import { statusLabel, statusTone } from "@/lib/status-tone";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

const emptyForm = {
  title: "",
  author: "",
  isbn: "",
  genre: "",
  category: "General",
  shelfLocation: "",
  callNumber: "",
  totalCopies: 1,
  publishedYear: new Date().getFullYear(),
};

const emptyItemForm = {
  bookId: "",
  barcode: "",
  status: "available",
  callNumber: "",
  shelfLocation: "",
  homeBranch: "MAIN",
  holdingBranch: "MAIN",
  notes: "",
};

type BookItemsPage = {
  bookId: string;
  bookItems: BookItem[];
  total: number;
  available: number;
  page: number;
  pages: number;
  pageSize: number;
};

export default function BooksPage() {
  const { session: me } = useDeskSession();
  // GET /api/books returns { books }.
  const { data, loading, error, reload } = useApi<{ books: Book[] }>("/api/books");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogs = useDialogs();

  // Copy-cataloging: fill empty fields from Open Library by ISBN. Never
  // overwrites what the librarian already typed.
  async function lookupIsbn() {
    if (!form.isbn.trim()) {
      setFormError("Enter an ISBN first.");
      return;
    }
    setLookupBusy(true);
    setFormError(null);
    setLookupNote(null);
    try {
      const meta = await apiJson<{
        isbn: string;
        title: string;
        author: string;
        publishedYear: number | null;
        genre: string;
        publisher: string | null;
      }>(`/api/isbn-lookup?isbn=${encodeURIComponent(form.isbn)}`);
      setForm((f) => ({
        ...f,
        isbn: meta.isbn,
        title: f.title.trim() ? f.title : meta.title,
        author: f.author.trim() ? f.author : meta.author,
        genre: f.genre.trim() ? f.genre : meta.genre,
        publishedYear: meta.publishedYear ?? f.publishedYear,
      }));
      setLookupNote(`Filled from Open Library${meta.publisher ? ` (${meta.publisher})` : ""}. Check before saving.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ISBN lookup failed.");
    } finally {
      setLookupBusy(false);
    }
  }
  const [itemsTab, setItemsTab] = useState<string | null>(null);
  const [itemsPage, setItemsPage] = useState(1);
  // Physical copies (barcodes, branches, staff notes) are for catalog
  // editors only; patrons see availability from the book row. Fetched for
  // the open title only, one page at a time.
  const {
    data: itemsData,
    loading: itemsLoading,
    error: itemsError,
    reload: reloadItems,
  } = useApi<BookItemsPage>(
    canAccess(me?.user, "books.write") && itemsTab
      ? `/api/book-items?bookId=${encodeURIComponent(itemsTab)}&page=${itemsPage}`
      : null
  );
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [itemBusy, setItemBusy] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const canManageBooks = canAccess(me?.user, "books.write");
  const canRequestBorrow = canAccess(me?.user, "loans.request");

  // Deep link from "Fast cataloging" buttons: /books?add=1
  useEffect(() => {
    if (typeof window === "undefined" || !canManageBooks) return;
    if (new URLSearchParams(window.location.search).get("add") !== "1") return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setEditing(null);
      setForm(emptyForm);
      setFormError(null);
      setOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    });
    return () => { cancelled = true; };
  }, [canManageBooks]);



  const books = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.books ?? []).filter((b) => {
      if (!q) return true;
      return [b.title, b.author, b.isbn, b.genre, b.category, b.shelfLocation ?? "", b.callNumber ?? ""].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [data, query]);

  // Ignore a response still showing a previously opened title.
  const itemsPageData = itemsData && itemsData.bookId === itemsTab ? itemsData : null;
  const bookItems = itemsPageData?.bookItems ?? [];

  function openCreate() {
    if (!canManageBooks) return;
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setLookupNote(null);
    setOpen(true);
  }

  function openEdit(book: Book) {
    if (!canManageBooks) return;
    setEditing(book);
    setForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      genre: book.genre,
      category: book.category ?? "General",
      shelfLocation: book.shelfLocation ?? "",
      callNumber: book.callNumber ?? "",
      totalCopies: book.totalCopies,
      publishedYear: book.publishedYear,
    });
    setFormError(null);
    setOpen(true);
  }

  function openItemsTab(bookId: string) {
    setItemsTab(itemsTab === bookId ? null : bookId);
    setItemsPage(1);
    if (itemsTab !== bookId) {
      setItemForm({ ...emptyItemForm, bookId });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManageBooks) return;
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await apiJson(`/api/books/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await apiJson("/api/books", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      setOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!canManageBooks) return;
    const ok = await dialogs.confirm({
      title: "Delete this book?",
      message: "It is removed from the catalog. This can’t be undone.",
      confirmLabel: "Delete book",
      danger: true,
    });
    if (!ok) return;
    setActionError(null);
    try {
      await apiJson(`/api/books/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The book wasn’t deleted. Try again.");
    }
  }

  async function createItem(e: FormEvent) {
    e.preventDefault();
    if (!canManageBooks) return;
    setItemBusy(true);
    setItemError(null);
    try {
      await apiJson("/api/book-items", {
        method: "POST",
        body: JSON.stringify(itemForm),
      });
      setItemForm({ ...emptyItemForm, bookId: itemForm.bookId });
      await reloadItems();
    } catch (err) {
      setItemError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setItemBusy(false);
    }
  }

  async function deleteItem(id: string) {
    if (!canManageBooks) return;
    const ok = await dialogs.confirm({
      title: "Delete this copy?",
      message: "The physical copy is removed from the record. This can’t be undone.",
      confirmLabel: "Delete copy",
      danger: true,
    });
    if (!ok) return;
    setItemError(null);
    try {
      await apiJson(`/api/book-items/${id}`, { method: "DELETE" });
      // Deleting the only copy on a later page would leave it empty: step
      // back a page (the new URL refetches). Otherwise reload this page.
      if (bookItems.length === 1 && itemsPage > 1) setItemsPage(itemsPage - 1);
      else await reloadItems();
    } catch (err) {
      setItemError(err instanceof Error ? err.message : "The copy wasn’t deleted. Try again.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Catalog"
        subtitle={
          canManageBooks
            ? "Add titles, track available copies, and keep inventory ready for checkout."
            : me?.user
              ? `Signed in as ${roleLabel(me.user.role)}. You can browse the catalog but only librarians and admins can change it.`
              : "You can browse the catalog here. Only librarians and admins can change it."
        }
        action={
          canManageBooks ? (
            <Button variant="primary" onClick={openCreate}>
              Add book
            </Button>
          ) : undefined
        }
      />

      <div className="panel p-4 md:p-5">
        <div className="mb-4">
          <input
            type="search"
            aria-label="Search the catalog"
            className="field max-w-md"
            placeholder="Search title, author, ISBN, or genre"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {actionError && <ErrorState message={actionError} />}

        <Table
          caption="Catalog"
          columns={[
            "Title",
            "Author",
            "Category",
            "Shelf / call no.",
            "Copies",
            ...(canManageBooks ? ["Items"] : []),
            "Year",
            { label: "Actions", hideLabel: true },
          ]}
          loading={loading}
          error={error}
          onRetry={reload}
          isEmpty={books.length === 0}
          empty={{
            title: query ? "No books match your search" : "No books yet",
            body: query ? "Try a shorter search or check the spelling." : canManageBooks ? "Add your first title with Add book." : "The catalog is empty for now.",
          }}
        >
                {books.map((book) => {
                  const items = itemsTab === book.id ? bookItems : [];
                  return (
                    <React.Fragment key={book.id}>
                      <tr>
                        <td>
                          <p className="font-semibold">{book.title}</p>
                          <p className="text-xs text-muted">
                            {book.isbn}
                          </p>
                        </td>
                        <td>{book.author}</td>
                        <td>
                          <Badge tone="info">{book.category}</Badge>
                          <p className="mt-1 text-xs text-muted">
                            {book.genre}
                          </p>
                        </td>
                        <td>
                          <p>{book.shelfLocation || "—"}</p>
                          <p className="text-xs text-muted">
                            {book.callNumber || ""}
                          </p>
                        </td>
                        <td>
                          <Badge tone={book.availableCopies === 0 ? "danger" : "ok"}>
                            {book.availableCopies}/{book.totalCopies}
                          </Badge>
                        </td>
                        {canManageBooks && (
                          <td>
                            <button
                              type="button"
                              className={buttonClass(itemsTab === book.id ? "primary" : "ghost")}
                              aria-expanded={itemsTab === book.id}
                              onClick={() => openItemsTab(book.id)}
                            >
                              Copies
                            </button>
                          </td>
                        )}
                        <td>{book.publishedYear}</td>
                        <td>
                          <div className="flex justify-end gap-2">
                            {canManageBooks && (
                              <>
                                <Button variant="ghost" onClick={() => openEdit(book)}>
                                  Edit
                                </Button>
                                <Button variant="danger" onClick={() => onDelete(book.id)}>
                                  Delete
                                </Button>
                              </>
                            )}
                            {canRequestBorrow && !canManageBooks && (
                              <Link
                                href={`/borrow?isbn=${encodeURIComponent(book.isbn)}`}
                                className="btn btn-primary"
                              >
                                Request to borrow
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                      {canManageBooks && itemsTab === book.id && (
                        <tr>
                          <td colSpan={8}>
                            <div className="border-t border-[var(--line)] py-4">
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h2 className="text-lg font-semibold">Physical copies of {"\u201c"}{book.title}{"\u201d"}</h2>
                                  {itemsPageData && (
                                    <p className="text-muted text-sm">
                                      {itemsPageData.total} {itemsPageData.total === 1 ? "copy" : "copies"} · {itemsPageData.available} available
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="primary"
                                  onClick={() => {
                                    setItemForm({ ...emptyItemForm, bookId: book.id });
                                  }}
                                >
                                  Add copy
                                </Button>
                              </div>

                              {itemsError ? (
                                <ErrorState message={itemsError} onRetry={() => void reloadItems()} />
                              ) : !itemsPageData ? (
                                <p className="text-muted text-sm" role="status">{itemsLoading ? "Loading copies…" : ""}</p>
                              ) : items.length === 0 ? (
                                <p className="text-muted text-sm">No physical copies recorded yet.</p>
                              ) : (
                                <>
                                <Table
                                  caption={`Physical copies of ${book.title}, page ${itemsPageData.page} of ${itemsPageData.pages}`}
                                  columns={["Barcode", "Status", "Call number", "Shelf location", "Home branch", "Holding branch", "Notes", { label: "Actions", hideLabel: true }]}
                                >
                                      {items.map((item) => (
                                        <tr key={item.id}>
                                          <td className="font-mono">{item.barcode}</td>
                                          <td>
                                            <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                                          </td>
                                          <td>{item.callNumber || "—"}</td>
                                          <td>{item.shelfLocation || "—"}</td>
                                          <td>{item.homeBranch}</td>
                                          <td>{item.holdingBranch}</td>
                                          <td>{item.notes || "—"}</td>
                                          <td>
                                            <div className="flex justify-end gap-2">
                                              <Button variant="danger" onClick={() => deleteItem(item.id)}>
                                                Delete
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                </Table>
                                {itemsPageData.pages > 1 && (
                                  <nav aria-label="Copy pages" className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-muted text-sm" aria-live="polite">
                                      {(itemsPageData.page - 1) * itemsPageData.pageSize + 1}–
                                      {Math.min(itemsPageData.page * itemsPageData.pageSize, itemsPageData.total)} of {itemsPageData.total}
                                    </p>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="ghost"
                                        disabled={itemsPageData.page <= 1 || itemsLoading}
                                        onClick={() => setItemsPage(itemsPageData.page - 1)}
                                      >
                                        Previous page
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        disabled={itemsPageData.page >= itemsPageData.pages || itemsLoading}
                                        onClick={() => setItemsPage(itemsPageData.page + 1)}
                                      >
                                        Next page
                                      </Button>
                                    </div>
                                  </nav>
                                )}
                                </>
                              )}

                              <form onSubmit={createItem} className="mt-4 space-y-3">
                                {itemError && <ErrorState message={itemError} />}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <input type="hidden" name="bookId" value={itemForm.bookId} />
                                  <div>
                                    <label className="label" htmlFor="item-barcode">Barcode *</label>
                                    <input
                                      id="item-barcode"
                                      className="field"
                                      required
                                      value={itemForm.barcode}
                                      onChange={(e) => setItemForm((f) => ({ ...f, barcode: e.target.value }))}
                                      placeholder="Scan or enter barcode"
                                    />
                                  </div>
                                  <div>
                                    <label className="label" htmlFor="item-status">Status *</label>
                                    <select
                                      id="item-status"
                                      className="field"
                                      value={itemForm.status}
                                      onChange={(e) => setItemForm((f) => ({ ...f, status: e.target.value }))}
                                    >
                                      <option value="available">Available</option>
                                      <option value="on_loan">On Loan</option>
                                      <option value="not_for_loan">Not for Loan</option>
                                      <option value="damaged">Damaged</option>
                                      <option value="lost">Lost</option>
                                      <option value="withdrawn">Withdrawn</option>
                                      <option value="in_transit">In Transit</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="label" htmlFor="item-homeBranch">Home Branch *</label>
                                    <input
                                      id="item-homeBranch"
                                      className="field"
                                      required
                                      value={itemForm.homeBranch}
                                      onChange={(e) => setItemForm((f) => ({ ...f, homeBranch: e.target.value }))}
                                      placeholder="MAIN"
                                    />
                                  </div>
                                  <div>
                                    <label className="label" htmlFor="item-holdingBranch">Holding Branch *</label>
                                    <input
                                      id="item-holdingBranch"
                                      className="field"
                                      required
                                      value={itemForm.holdingBranch}
                                      onChange={(e) => setItemForm((f) => ({ ...f, holdingBranch: e.target.value }))}
                                      placeholder="MAIN"
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="label" htmlFor="item-callNumber">Call Number</label>
                                    <input
                                      id="item-callNumber"
                                      className="field"
                                      value={itemForm.callNumber}
                                      onChange={(e) => setItemForm((f) => ({ ...f, callNumber: e.target.value }))}
                                      placeholder="e.g. 630 S12i"
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="label" htmlFor="item-shelfLocation">Shelf Location</label>
                                    <input
                                      id="item-shelfLocation"
                                      className="field"
                                      value={itemForm.shelfLocation}
                                      onChange={(e) => setItemForm((f) => ({ ...f, shelfLocation: e.target.value }))}
                                      placeholder="e.g. Shelf A-3, Row 2"
                                    />
                                  </div>
                                  <div className="md:col-span-4">
                                    <label className="label" htmlFor="item-notes">Notes (staff only)</label>
                                    <input
                                      id="item-notes"
                                      className="field"
                                      value={itemForm.notes}
                                      onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                                      placeholder="Internal notes, condition details, etc."
                                    />
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                  <Button variant="ghost" onClick={() => setItemsTab(null)}>
                                    Close
                                  </Button>
                                  <Button type="submit" variant="primary" busy={itemBusy} busyLabel="Adding…">
                                    Add copy
                                  </Button>
                                </div>
                              </form>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
        </Table>
      </div>

      <Modal
        open={open && canManageBooks}
        title={editing ? "Edit book" : "Add book"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          {formError && <ErrorState message={formError} />}
          {!editing && (
            <div>
              <label className="label" htmlFor="isbn-lookup">
                Quick add by ISBN
              </label>
              <div className="flex gap-2">
                <input
                  id="isbn-lookup"
                  className="field"
                  required
                  inputMode="numeric"
                  placeholder="Scan or type ISBN, then Look up"
                  value={form.isbn}
                  onChange={(e) => setForm((f) => ({ ...f, isbn: e.target.value }))}
                  onKeyDown={(e) => {
                    // Barcode scanners send Enter after the digits.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void lookupIsbn();
                    }
                  }}
                />
                <Button variant="ghost" className="shrink-0" onClick={lookupIsbn} busy={lookupBusy} busyLabel="Looking up…">
                  Look up
                </Button>
              </div>
              {lookupNote && (
                <p role="status" className="field-hint text-[var(--ok)]">{lookupNote}</p>
              )}
            </div>
          )}
          {([
            ["title", "Title"],
            ["author", "Author"],
            ["isbn", "ISBN"],
            ["genre", "Genre"],
          ] as const)
            // When adding, the ISBN is entered in the quick-add box above.
            .filter(([key]) => editing || key !== "isbn")
            .map(([key, label]) => (
            <div key={key}>
              <label className="label" htmlFor={key}>
                {label}
              </label>
              <input
                id={key}
                className="field"
                required
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="category">
                Category
              </label>
              <input
                id="category"
                className="field"
                list="category-options"
                placeholder="e.g. Agriculture"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
              <datalist id="category-options">
                {[
                  "Agriculture",
                  "Science",
                  "Technology",
                  "Computer / ICT",
                  "Engineering",
                  "Education",
                  "Mathematics",
                  "Language",
                  "Literature",
                  "History",
                  "Religion",
                  "Arts",
                  "Health",
                  "Reference",
                  "General",
                ].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="shelfLocation">
                Shelf location
              </label>
              <input
                id="shelfLocation"
                className="field"
                placeholder="e.g. Shelf A-3, Row 2"
                value={form.shelfLocation}
                onChange={(e) => setForm((f) => ({ ...f, shelfLocation: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="callNumber">
                Call number
              </label>
              <input
                id="callNumber"
                className="field"
                placeholder='e.g. 630 S12i (spine label)'
                value={form.callNumber}
                onChange={(e) => setForm((f) => ({ ...f, callNumber: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="totalCopies">
                Total copies
              </label>
              <input
                id="totalCopies"
                className="field"
                type="number"
                min={1}
                required
                value={form.totalCopies}
                onChange={(e) =>
                  setForm((f) => ({ ...f, totalCopies: Number(e.target.value) }))
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="publishedYear">
                Year
              </label>
              <input
                id="publishedYear"
                className="field"
                type="number"
                min={1000}
                max={2100}
                required
                value={form.publishedYear}
                onChange={(e) =>
                  setForm((f) => ({ ...f, publishedYear: Number(e.target.value) }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">
              Save book
            </Button>
          </div>
        </form>
      </Modal>
      {dialogs.element}
    </div>
  );
}
