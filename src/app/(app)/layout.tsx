import { Suspense } from "react";
import { Nav, NavView } from "@/components/nav";
import { LiveWatcher } from "@/components/live-watcher";
import { PullToRefresh } from "@/components/pull-refresh";
import { getPendingCount } from "@/lib/data";
import { requireSession } from "@/lib/auth";

async function PendingBadge() {
  await requireSession();
  const n = await getPendingCount();
  if (!n) return null;
  return (
    <span className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-late px-1 text-[10.5px] font-semibold text-white">
      {n}
    </span>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  const badge = (
    <Suspense fallback={null}>
      <PendingBadge />
    </Suspense>
  );
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<NavView badge={badge} path={null} />}>
        <Nav badge={badge} />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-28 md:px-6 md:pb-10 lg:px-8">
        {children}
      </main>
      <LiveWatcher />
      <PullToRefresh />
    </div>
  );
}
