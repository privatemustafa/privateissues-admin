export const TZ = "Europe/Istanbul";

const tryFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

export function money(n: number, currency = "TRY") {
  const v = tryFmt.format(Math.round(n));
  return currency === "TRY" ? `${v} ₺` : `${v} ${currency}`;
}

export function compact(n: number) {
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function hoursSince(d: Date | string, now = Date.now()) {
  return (now - +new Date(d)) / 3_600_000;
}

/** "12 dk", "5 sa", "2 gün" */
export function ago(d: Date | string, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - +new Date(d)) / 60_000));
  if (m < 1) return "şimdi";
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  const days = Math.floor(h / 24);
  return `${days} gün`;
}

/** "40 dakikadır", "5 saattir", "2 gündür" */
export function waitedFor(d: Date | string, now = Date.now()) {
  const m = Math.max(1, Math.floor((now - +new Date(d)) / 60_000));
  if (m < 60) return `${m} dakikadır`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saattir`;
  return `${Math.floor(h / 24)} gündür`;
}

export function dateTime(d: Date | string) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

export function dayLabel(d: Date | string) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short" }).format(
    new Date(d),
  );
}

/** İstanbul saatine göre YYYY-MM-DD */
export function dayKey(d: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
}

/** İstanbul saati (0-23) */
export function istanbulHour(d = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d),
  );
}

/** İstanbul'da bugünün 00:00'ı (UTC Date olarak) — Türkiye UTC+3 sabit */
export function startOfTodayIstanbul(now = new Date()) {
  const key = dayKey(now);
  return new Date(`${key}T00:00:00+03:00`);
}

export function firstName(full: string | null | undefined) {
  if (!full) return "Müşteri";
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Kargo aciliyeti: hızlı kargo seçenlerde süreler yarıya iner */
export function isExpress(method: string | null | undefined) {
  return !!method && /hızlı|hizli|express|ekspres|aynı gün|ayni gun/i.test(method);
}

export type Urgency = "fresh" | "due" | "late" | "critical";

export function urgency(createdAt: Date | string, method?: string | null, now = Date.now()): Urgency {
  const h = hoursSince(createdAt, now) * (isExpress(method) ? 2 : 1);
  if (h < 24) return "fresh";
  if (h < 48) return "due";
  if (h < 72) return "late";
  return "critical";
}

export const urgencyLabel: Record<Urgency, string> = {
  fresh: "Yeni",
  due: "Bugün çıkmalı",
  late: "Gecikiyor",
  critical: "Kritik",
};

export function isRecent(d: Date | string | null | undefined, ms: number) {
  return !!d && Date.now() - +new Date(d) < ms;
}
