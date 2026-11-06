import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Her veri bileşeninin başında çağrılır: hem yetki kontrolü yapar,
 * hem de cookies() okuduğu için bileşeni request-time (dinamik) yapar.
 */
export async function requireSession() {
  // connection(): bu noktadan sonrası her istekte taze çalışır (Date.now, DB vb. serbest)
  await connection();
  const store = await cookies();
  const ok = await verifySessionToken(store.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  if (!ok) redirect("/login");
}
