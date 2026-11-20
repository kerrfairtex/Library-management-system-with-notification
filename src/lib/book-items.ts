/**
 * What a caller may see of the physical-copy records. Staff notes are
 * private: only roles that can edit the catalog (books.write) receive
 * them; everyone else gets each copy without a `notes` field at all.
 * Pure, so the rule is tested directly.
 */
import { canAccess } from "./permissions";
import type { BookItem, PublicUser, UserRole } from "./types";

export type VisibleBookItem = Omit<BookItem, "notes"> & { notes?: string | null };

export function bookItemsFor(
  viewer: UserRole | Pick<PublicUser, "role"> | null | undefined,
  items: BookItem[]
): VisibleBookItem[] {
  if (canAccess(viewer, "books.write")) return items;
  return items.map((item) => {
    const copy: VisibleBookItem = { ...item };
    delete copy.notes;
    return copy;
  });
}
