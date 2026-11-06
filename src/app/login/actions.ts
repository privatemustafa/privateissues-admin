"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { timingSafeEqual } from "node:crypto";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const expected = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) return { error: "ADMIN_PASSWORD / SESSION_SECRET ayarlı değil." };

  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700));
    return { error: "Şifre yanlış." };
  }

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
