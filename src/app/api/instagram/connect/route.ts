import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authorizeUrl, instagramAppConfigured } from "@/lib/instagram";

export async function GET() {
  await connection();
  if (!instagramAppConfigured()) return new Response("INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET eksik", { status: 400 });
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  const state = crypto.randomUUID();
  (await cookies()).set("ig_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  redirect(authorizeUrl(appUrl, state));
}
