import { connection } from "next/server";
import { syncOrders } from "@/lib/shopify/sync";
import { runDailyDigests, runOverdueChecks } from "@/lib/notify";
import { kvSet } from "@/db";
import { refreshIgTokenIfNeeded } from "@/lib/instagram";
import { snapshotStories } from "@/lib/ig-store";
import { scanAllPr } from "@/lib/pr";

/**
 * Her 15 dakikada bir çağrılır (cron-job.org veya Vercel Cron).
 * 1) Webhook kaçırdıysa diye siparişleri senkronlar
 * 2) Kargolanmamış sipariş hatırlatmaları
 * 3) Sabah özeti / akşam hatırlatması / pazartesi haftalık rapor
 * 4) Instagram story arşivi (story verisi 24 saatte kalkar)
 * 5) PR: gönderilen kişilerin paylaşımlarını tara, hatırlat
 */
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const qs = new URL(request.url).searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && qs !== secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  const out: Record<string, unknown> = {};
  try {
    out.sync = await syncOrders();
  } catch (e) {
    out.syncError = String(e);
  }
  out.overdue = await runOverdueChecks();
  out.instagram = await refreshIgTokenIfNeeded().catch((e) => String(e));
  out.stories = await snapshotStories().catch((e) => String(e));
  out.pr = await scanAllPr().catch((e) => String(e));
  await runDailyDigests();
  await kvSet("cron_last_run", new Date().toISOString());
  return Response.json({ ok: true, ...out });
}
