"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canAccess, roleLabel } from "@/lib/permissions";
import type { Book, BookItem, PublicUser } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { EmptyState, ErrorBanner, Modal, PageHeader } from "@/components/ui";

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

export default function BooksPage() {
  const { data: me } = useApi<{ user: PublicUser }>("/api/auth/me");
  const { data, loading, error, reload } = useApi<Book[]>("/api/books");
  const { data: itemsData, reload: reloadItems } = useApi<{ bookItems: BookItem[] }>("/api/book-items");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [itemsTab, setItemsTab] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [itemBusy, setItemBusy] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const canManageBooks = canAccess(me?.user, "books.write");
  const canRequestBorrow = canAccess(me?.user, "loans.request");

  useEffect(() => {
    if (!canManageBooks) setOpen(false);
  }, [canManageBooks]);

  const books = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((b) => {
      if (!q) return true;
      return [b.title, b.author, b.isbn, b.genre, b.category, b.shelfLocation ?? "", b.callNumber ?? ""].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [data, query]);

  const bookItems = itemsData?.bookItems ?? [];

  function openCreate() {
    if (!canManageBooks) return;
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
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
    if (!window.confirm("Delete this book from the catalog?")) return;
    try {
      await apiJson(`/api/books/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed");
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
    if (!window.confirm("Delete this physical copy?")) return;
    try {
      await apiJson(`/api/book-items/${id}`, { method: "DELETE" });
      await reloadItems();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function getItemsForBook(bookId: string): BookItem[] {
    return bookItems.filter((item) => item.bookId === bookId);
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
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add book
            </button>
          ) : undefined
        }
      />

      <div className="panel p-4 md:p-5">
        <div className="mb-4">
          <input
            className="field max-w-md"
            placeholder="Search title, author, ISBN, or genre"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && <ErrorBanner message={error} />}
        {loading && <p className="text-sm">Loading catalog…</p>}

        {!loading && books.length === 0 ? (
          <EmptyState
            title="No books found"
            body="Add your first title or clear the search filter."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Category</th>
                  <th>Shelf / Call no.</th>
                  <th>Copies</th>
                  <th>Items</th>
                  <th>Year</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => {
                  const items = getItemsForBook(book.id);
                  const availableItems = items.filter((i) => i.status === "available").length;
                  const totalItems = items.length;
                  return (
                    <React.Fragment key={book.id}>
                      <tr>
                        <td>
                          <p className="font-semibold">{book.title}</p>
                          <p className="text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                            {book.isbn}
                          </p>
                        </td>
                        <td>{book.author}</td>
                        <td>
                          <span className="badge tone-info">{book.category}</span>
                          <p className="mt-1 text-xs text-[color-mix(in_srgb,var(--ink)_45%,transparent)]">
                            {book.genre}
                          </p>
                        </td>
                        <td>
                          <p>{book.shelfLocation || "—"}</p>
                          <p className="text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                            {book.callNumber || ""}
                          </p>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              book.availableCopies === 0 ? "tone-danger" : "tone-ok"
                            }`}
                          >
                            {book.availableCopies}/{book.totalCopies}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`btn btn-ghost ${itemsTab === book.id ? "btn-primary" : ""}`}
                            onClick={() => openItemsTab(book.id)}
                          >
                            {totalItems > 0 ? `${totalItems} items (${availableItems} avail)` : "No items"}
                          </button>
                        </td>
                        <td>{book.publishedYear}</td>
                        <td>
                          <div className="flex justify-end gap-2">
                            {canManageBooks && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => openEdit(book)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => onDelete(book.id)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {canRequestBorrow && !canManageBooks && (
                              <Link
                                href={`/borrow?isbn=${encodeURIComponent(book.isbn)}`}
                                className="btn btn-primary"
                              >
                                Request to Borrow
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                      {itemsTab === book.id && (
                        <tr className="bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]">
                          <td colSpan={8}>
                            <div className="p-4 border-t border-[var(--line)]">
                              <div className="flex items-center justify-between mb-3">
                                <h4>Physical copies for "{book.title}"</h4>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => {
                                    setItemForm({ ...emptyItemForm, bookId: book.id });
                                  }}
                                >
                                  Add copy
                                </button>
                              </div>
                              
                              {items.length === 0 ? (
                                <p className="text-sm text-[color-mix(in_srgb,var(--ink)_55%,transparent)]">
                                  No physical copies recorded yet.
                                </p>
                              ) : (
                                <div className="table-wrap" style={{ maxHeight: "200px", overflow: "auto" }}>
                                  <table className="data-table" style={{ minWidth: "600px" }}>
                                    <thead>
                                      <tr>
                                        <th>Barcode</th>
                                        <th>Status</th>
                                        <th>Call Number</th>
                                        <th>Shelf Location</th>
                                        <th>Home Branch</th>
                                        <th>Holding Branch</th>
                                        <th>Notes</th>
                                        <th></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map((item) => (
                                        <tr key={item.id}>
                                          <td className="font-mono">{item.barcode}</td>
                                          <td>
                                            <span className={`badge ${
                                              item.status === "available" ? "tone-ok" :
                                              item.status === "on_loan" ? "tone-info" :
                                              item.status === "lost" || item.status === "damaged" ? "tone-danger" :
                                              "tone-warn"
                                            }`}>
                                              {item.status.replace("_", " ")}
                                            </span>
                                          </td>
                                          <td>{item.callNumber || "—"}</td>
                                          <td>{item.shelfLocation || "—"}</td>
                                          <td>{item.homeBranch}</td>
                                          <td>{item.holdingBranch}</td>
                                          <td>{item.notes || "—"}</td>
                                          <td>
                                            <div className="flex gap-1">
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                  // Edit item - simplified
                                                }}
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                onClick={() => deleteItem(item.id)}
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <form onSubmit={createItem} className="mt-4 space-y-3">
                                {itemError && <ErrorBanner message={itemError} />}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <input type="hidden" name="bookId" value={itemForm.bookId} />
                                  <div>
                                    <label className="label" htmlFor="barcode">Barcode *</label>
                                    <input
                                      id="barcode"
                                      className="field"
                                      required
                                      value={itemForm.barcode}
                                      onChange={(e) => setItemForm((f) => ({ ...f, barcode: e.target.value }))}
                                      placeholder="Scan or enter barcode"
                                    />
                                  </div>
                                  <div>
                                    <label className="label" htmlFor="status">Status *</label>
                                    <select
                                      id="status"
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
                                    <label className="label" htmlFor="homeBranch">Home Branch *</label>
                                    <input
                                      id="homeBranch"
                                      className="field"
                                      required
                                      value={itemForm.homeBranch}
                                      onChange={(e) => setItemForm((f) => ({ ...f, homeBranch: e.target.value }))}
                                      placeholder="MAIN"
                                    />
                                  </div>
                                  <div>
                                    <label className="label" htmlFor="holdingBranch">Holding Branch *</label>
                                    <input
                                      id="holdingBranch"
                                      className="field"
                                      required
                                      value={itemForm.holdingBranch}
                                      onChange={(e) => setItemForm((f) => ({ ...f, holdingBranch: e.target.value }))}
                                      placeholder="MAIN"
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="label" htmlFor="callNumber">Call Number</label>
                                    <input
                                      id="callNumber"
                                      className="field"
                                      value={itemForm.callNumber}
                                      onChange={(e) => setItemForm((f) => ({ ...f, callNumber: e.target.value }))}
                                      placeholder="e.g. 630 S12i"
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="label" htmlFor="shelfLocation">Shelf Location</label>
                                    <input
                                      id="shelfLocation"
                                      className="field"
                                      value={itemForm.shelfLocation}
                                      onChange={(e) => setItemForm((f) => ({ ...f, shelfLocation: e.target.value }))}
                                      placeholder="e.g. Shelf A-3, Row 2"
                                    />
                                  </div>
                                  <div className="md:col-span-4">
                                    <label className="label" htmlFor="notes">Notes (staff only)</label>
                                    <input
                                      id="notes"
                                      className="field"
                                      value={itemForm.notes}
                                      onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                                      placeholder="Internal notes, condition details, etc."
                                    />
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                  <button type="button" className="btn btn-ghost" onClick={() => setItemsTab(null)}>
                                    Close
                                  </button>
                                  <button type="submit" className="btn btn-primary" disabled={itemBusy}>
                                    {itemBusy ? "Adding…" : "Add copy"}
                                  </button>
                                </div>
                              </form>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={open && canManageBooks}
        title={editing ? "Edit book" : "Add book"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          {formError && <ErrorBanner message={formError} />}
          {([
            ["title", "Title"],
            ["author", "Author"],
            ["isbn", "ISBN"],
            ["genre", "Genre"],
          ] as const).map(([key, label]) => (
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
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save book"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
