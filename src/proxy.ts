import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const ok = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.SESSION_SECRET,
  );
  if (ok) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // webhook, cron, login, service worker, manifest ve ikonlar herkese açık
  matcher: [
    "/((?!login|api/webhooks|api/cron|_next/static|_next/image|sw\\.js|manifest\\.webmanifest|icons/|favicon\\.ico).*)",
  ],
};
