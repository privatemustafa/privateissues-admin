// Edge/Node uyumlu (Web Crypto) — proxy.ts de bunu kullanır.
export const SESSION_COOKIE = "pi_session";
export const SESSION_DAYS = 180;

const enc = new TextEncoder();

async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSessionToken(secret: string) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${exp}.${await hmac(String(exp), secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined) {
  if (!token || !secret) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp, secret));
}
