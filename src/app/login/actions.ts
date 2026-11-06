"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { timingSafeEqual } from "node:crypto";

export async function login(_: { error?: string } | undefined, form: FormData) {
  // Klavyeler "ö" gibi harfleri farklı kodlayabilir → NFC ile eşitle
  const password = String(form.get("password") ?? "").normalize("NFC");
  const user = String(form.get("user") ?? "").trim().toLocaleLowerCase("tr");
  const next = String(form.get("next") ?? "/");
  const expected = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) return { error: "ADMIN_PASSWORD / SESSION_SECRET ayarlı değil." };

  const expectedUser = (process.env.ADMIN_USER ?? "").trim().toLocaleLowerCase("tr");
  const a = Buffer.from(password);
  const b = Buffer.from(expected.normalize("NFC"));
  const passOk = a.length === b.length && timingSafeEqual(a, b);
  const userOk = !expectedUser || user === expectedUser;
  if (!passOk || !userOk) {
    await new Promise((r) => setTimeout(r, 700));
    return { error: expectedUser ? "Kullanıcı adı ya da şifre yanlış." : "Şifre yanlış." };
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
