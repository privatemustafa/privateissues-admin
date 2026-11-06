import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exchangeCode } from "@/lib/instagram";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  const store = await cookies();
  const expected = store.get("ig_state")?.value;
  store.delete("ig_state");

  if (err) redirect(`/instagram?err=${encodeURIComponent(err)}`);
  if (!code || !state || state !== expected) redirect("/instagram?err=state");

  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  try {
    await exchangeCode(code.replace(/#_$/, ""), appUrl);
  } catch (e) {
    redirect(`/instagram?err=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  redirect("/instagram?ok=1");
}
