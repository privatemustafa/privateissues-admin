import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function POST(request: Request) {
  const sub = (await request.json()) as Sub;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json({ error: "geçersiz abonelik" }, { status: 400 });
  }
  const values = {
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    userAgent: request.headers.get("user-agent"),
  };
  await db()
    .insert(schema.pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: values });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { endpoint } = (await request.json()) as { endpoint?: string };
  if (endpoint) {
    await db().delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
  }
  return Response.json({ ok: true });
}
