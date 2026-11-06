import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getRecentNotifications, getSystemStatus } from "@/lib/data";
import { getAccessScopes, listWebhooks, WEBHOOK_TOPICS } from "@/lib/shopify/actions";
import { igSource } from "@/lib/ig";
import { ago, dateTime, isRecent } from "@/lib/format";
import { Card, Eyebrow, PageHeader, Skeleton, cx } from "@/components/ui";
import { PushToggle } from "@/components/push-toggle";
import { SettingsForm } from "@/components/settings-form";
import { ActionButton } from "@/components/small";
import { registerWebhooksAction, syncNowAction } from "../actions";
import { logout } from "@/app/login/actions";

export const metadata = { title: "Ayarlar" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Ayarlar" />
      <div className="space-y-4">
        <Suspense fallback={<Skeleton className="h-24" />}>
          <Push />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-80" />}>
          <Prefs />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-72" />}>
          <System />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-48" />}>
          <Log />
        </Suspense>
        <form action={logout} className="pt-2 text-center">
          <button className="text-[14px] text-mute">Çıkış yap</button>
        </form>
      </div>
    </div>
  );
}

async function Push() {
  await requireSession();
  return (
    <Card className="p-5">
      <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
    </Card>
  );
}

async function Prefs() {
  await requireSession();
  const s = await getSettings();
  return (
    <Card className="px-5 pt-3 pb-5">
      <Eyebrow className="pt-2">Bildirim kuralları</Eyebrow>
      <SettingsForm settings={s} />
    </Card>
  );
}

async function System() {
  await requireSession();
  const [status, hooks, ig, scopes] = await Promise.all([
    getSystemStatus(),
    listWebhooks().catch((e: unknown) => e as Error),
    igSource(),
    getAccessScopes().catch(() => null),
  ]);
  const allOrders = !!scopes?.includes("read_all_orders");
  const hookHost = Array.isArray(hooks) && hooks[0] ? new URL(hooks[0].uri).host : null;
  const hookOk = Array.isArray(hooks) && WEBHOOK_TOPICS.every((t) => hooks.some((h) => h.topic === t));

  const rows: { k: string; v: string; ok: boolean }[] = [
    {
      k: "Shopify bağlantısı",
      v: hooks instanceof Error
        ? hooks.message.slice(0, 80)
        : allOrders
          ? "Bağlı · tüm sipariş geçmişi"
          : "Bağlı · sadece son 60 gün (read_all_orders onayı yok)",
      ok: !(hooks instanceof Error) && allOrders,
    },
    {
      k: "Webhook'lar",
      v: Array.isArray(hooks) ? `${hooks.length}/${WEBHOOK_TOPICS.length} kurulu${hookHost ? ` · ${hookHost}` : ""}` : "—",
      ok: hookOk,
    },
    {
      k: "Son webhook",
      v: status.lastWebhook ? `${status.lastWebhook.title} · ${ago(status.lastWebhook.sentAt)} önce` : "Henüz gelmedi",
      ok: !!status.lastWebhook,
    },
    { k: "Son senkron", v: status.lastSync ? `${ago(status.lastSync)} önce` : "Hiç", ok: !!status.lastSync },
    {
      k: "Zamanlayıcı (cron)",
      v: status.lastCron ? `${ago(status.lastCron)} önce` : "Hiç çalışmadı",
      ok: isRecent(status.lastCron, 60 * 60_000),
    },
    { k: "Bildirim alan cihaz", v: String(status.devices), ok: status.devices > 0 },
    { k: "Instagram", v: ig === "instagram" ? "Bağlı (Instagram)" : ig === "metricool" ? "Bağlı (Metricool)" : "Bağlı değil", ok: !!ig },
  ];

  return (
    <Card className="p-5">
      <Eyebrow>Sistem</Eyebrow>
      <dl className="mt-3 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between gap-4 py-2.5 text-[14px]">
            <dt className="flex items-center gap-2">
              <span className={cx("size-1.5 rounded-full", r.ok ? "bg-fresh" : "bg-due")} />
              {r.k}
            </dt>
            <dd className="text-right text-mute">{r.v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-3">
        <ActionButton action={syncNowAction.bind(null, false)}>Senkronize et</ActionButton>
        <ActionButton action={syncNowAction.bind(null, true)}>Tüm geçmişi çek</ActionButton>
        <ActionButton action={registerWebhooksAction} variant={hookOk ? "ghost" : "solid"}>
          {hookOk ? "Webhook'ları yenile" : "Webhook'ları kur"}
        </ActionButton>
      </div>
    </Card>
  );
}

async function Log() {
  await requireSession();
  const items = await getRecentNotifications(12);
  if (!items.length) return null;
  return (
    <Card className="p-5">
      <Eyebrow>Son bildirimler</Eyebrow>
      <ul className="mt-2 divide-y divide-line">
        {items.map((n) => (
          <li key={n.id} className="py-2.5">
            <div className="flex justify-between gap-3">
              <p className="text-[14px] font-medium">{n.title}</p>
              <span className="shrink-0 text-[12px] text-faint">{dateTime(n.sentAt)}</span>
            </div>
            {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] whitespace-pre-line text-mute">{n.body}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
