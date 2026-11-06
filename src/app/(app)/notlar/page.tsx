import { Suspense } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listNotes } from "@/lib/notes";
import { Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { NoteCard, NoteForm, WhoAmI } from "@/components/notes";

export const metadata = { title: "Notlar" };

export default function NotesPage({ searchParams }: PageProps<"/notlar">) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Notlar" sub="Ortak not defteri · yapılacaklar" right={<WhoAmI />} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content searchParams={searchParams as Promise<{ arsiv?: string }>} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Promise<{ arsiv?: string }> }) {
  await requireSession();
  const { arsiv } = await searchParams;
  const archived = arsiv === "1";
  const notes = await listNotes(archived);
  const open = notes.filter((n) => n.items.length === 0 || n.items.some((i) => !i.done));
  const finished = notes.filter((n) => n.items.length > 0 && n.items.every((i) => i.done));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!archived && <NoteForm />}
        <div className="flex gap-1.5">
          {[
            { href: "/notlar", label: "Aktif", on: !archived },
            { href: "/notlar?arsiv=1", label: "Arşiv", on: archived },
          ].map((t) => (
            <Link key={t.href} href={t.href} className={cx("h-9 rounded-full px-4 text-[13.5px] leading-9", t.on ? "bg-ink text-paper" : "border border-line bg-card text-ink-2")}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {notes.length === 0 && (
        <Card className="p-6">
          <p className="text-[16px] font-medium">{archived ? "Arşiv boş." : "Henüz not yok."}</p>
          {!archived && (
            <p className="mt-1 text-[14px] text-mute">
              Her not bir checklist. Maddeleri tamamlandıkça işaretle; kimin ne zaman işaretlediği görünür. Panele giren herkes görür.
            </p>
          )}
        </Card>
      )}

      {open.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {open.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
      {finished.length > 0 && (
        <>
          <p className="px-1 pt-2 text-[11.5px] tracking-[0.14em] text-mute uppercase">Tamamlananlar</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {finished.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
