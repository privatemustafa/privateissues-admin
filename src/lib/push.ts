import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  /** Bildirimdeki "Kargola" butonu için */
  shipUrl?: string;
  /** Büyük görsel (Android'de geniş önizleme) */
  image?: string | null;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
  actions?: { action: string; title: string }[];
  /** Uygulama ikonundaki rozet sayısı */
  badgeCount?: number;
  kind?: string;
};

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:sssh@privateissues.com", pub, priv);
  configured = true;
  return true;
}

export async function sendPush(payload: PushPayload) {
  if (!configure()) return { sent: 0, reason: "VAPID anahtarları yok" };
  const subs = await db().select().from(schema.pushSubscriptions);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: payload.silent ? "low" : "high" },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Abonelik ölmüş → sil
        if (code === 404 || code === 410) {
          await db().delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
        } else {
          console.error("push hata", code, err);
        }
      }
    }),
  );
  return { sent };
}
