import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { NoteItem } from "@/db/schema";

const N = schema.notes;

export async function listNotes(archived = false) {
  const rows = await db().select().from(N).where(eq(N.archived, archived)).orderBy(desc(N.pinned), desc(N.updatedAt));
  return rows;
}

export async function createNote(input: { title: string; body?: string | null; items: string[]; by?: string | null }) {
  const items: NoteItem[] = input.items.filter((t) => t.trim()).map((text) => ({ id: crypto.randomUUID(), text: text.trim(), done: false }));
  const [row] = await db()
    .insert(N)
    .values({ title: input.title.trim() || "Not", body: input.body?.trim() || null, items, createdBy: input.by || null })
    .returning();
  return row;
}

export async function updateNote(
  id: number,
  patch: Partial<{ title: string; body: string | null; pinned: boolean; archived: boolean; color: string | null; items: NoteItem[] }>,
) {
  await db()
    .update(N)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(N.id, id));
}

export async function deleteNote(id: number) {
  await db().delete(N).where(eq(N.id, id));
}

/** Tek bir maddeyi işaretle / kaldır. */
export async function toggleItem(noteId: number, itemId: string, done: boolean, by?: string | null) {
  const [n] = await db().select().from(N).where(eq(N.id, noteId));
  if (!n) return;
  const items = n.items.map((i) =>
    i.id === itemId ? { ...i, done, doneAt: done ? new Date().toISOString() : null, doneBy: done ? by || null : null } : i,
  );
  await updateNote(noteId, { items });
}

export async function addItem(noteId: number, text: string) {
  const [n] = await db().select().from(N).where(eq(N.id, noteId));
  if (!n || !text.trim()) return;
  await updateNote(noteId, { items: [...n.items, { id: crypto.randomUUID(), text: text.trim(), done: false }] });
}

export async function removeItem(noteId: number, itemId: string) {
  const [n] = await db().select().from(N).where(eq(N.id, noteId));
  if (!n) return;
  await updateNote(noteId, { items: n.items.filter((i) => i.id !== itemId) });
}

export async function editItem(noteId: number, itemId: string, text: string) {
  const [n] = await db().select().from(N).where(eq(N.id, noteId));
  if (!n) return;
  await updateNote(noteId, { items: n.items.map((i) => (i.id === itemId ? { ...i, text: text.trim() || i.text } : i)) });
}
