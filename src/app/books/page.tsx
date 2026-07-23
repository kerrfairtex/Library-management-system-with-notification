"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Book } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { EmptyState, ErrorBanner, Modal, PageHeader } from "@/components/ui";

const emptyForm = {
  title: "",
  author: "",
  isbn: "",
  genre: "",
  totalCopies: 1,
  publishedYear: new Date().getFullYear(),
};

export default function BooksPage() {
  const { data, loading, error, reload } = useApi<Book[]>("/api/books");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const books = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((b) => {
      if (!q) return true;
      return [b.title, b.author, b.isbn, b.genre].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [data, query]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(book: Book) {
    setEditing(book);
    setForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      genre: book.genre,
      totalCopies: book.totalCopies,
      publishedYear: book.publishedYear,
    });
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
    if (!window.confirm("Delete this book from the catalog?")) return;
    try {
      await apiJson(`/api/books/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Catalog"
        subtitle="Add titles, track available copies, and keep inventory ready for checkout."
        action={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Add book
          </button>
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
                  <th>Genre</th>
                  <th>Copies</th>
                  <th>Year</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => (
                  <tr key={book.id}>
                    <td>
                      <p className="font-semibold">{book.title}</p>
                      <p className="text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                        {book.isbn}
                      </p>
                    </td>
                    <td>{book.author}</td>
                    <td>{book.genre}</td>
                    <td>
                      <span
                        className={`badge ${
                          book.availableCopies === 0 ? "tone-danger" : "tone-ok"
                        }`}
                      >
                        {book.availableCopies}/{book.totalCopies}
                      </span>
                    </td>
                    <td>{book.publishedYear}</td>
                    <td>
                      <div className="flex justify-end gap-2">
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={open}
        title={editing ? "Edit book" : "Add book"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          {formError && <ErrorBanner message={formError} />}
          {(
            [
              ["title", "Title"],
              ["author", "Author"],
              ["isbn", "ISBN"],
              ["genre", "Genre"],
            ] as const
          ).map(([key, label]) => (
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
