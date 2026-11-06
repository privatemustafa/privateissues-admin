import { Suspense } from "react";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { PageHeader, Skeleton } from "@/components/ui";
import { DepoImport } from "@/components/depo-import";

export const metadata = { title: "Depoya aktar" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/depo" className="inline-block pt-2 text-[14px] text-mute">
        ← Depo
      </Link>
      <PageHeader title="Depoya aktar" />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireSession();
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.warehouseItems);
  return <DepoImport hasItems={(r?.n ?? 0) > 0} />;
}
