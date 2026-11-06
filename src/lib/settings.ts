import "server-only";
import { kvGet, kvSet } from "@/db";

export type Settings = {
  /** Kargolanmamış sipariş hatırlatma eşikleri (saat) */
  overdueHours: number[];
  /** Bu adet ve altı "stok azaldı" sayılır */
  lowStock: number;
  /** 09:00 sabah özeti */
  morningDigest: boolean;
  /** 17:00 "kargo kapanmadan" hatırlatması */
  eveningReminder: boolean;
  /** 00:00–08:00 arası bildirimler sessiz gelsin */
  quietNights: boolean;
  /** Yeni siparişler depodan otomatik düşsün */
  warehouseAutoDeduct: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  overdueHours: [24, 48, 72],
  lowStock: 3,
  morningDigest: true,
  eveningReminder: true,
  quietNights: true,
  warehouseAutoDeduct: true,
};

export async function getSettings(): Promise<Settings> {
  const s = await kvGet<Partial<Settings>>("settings");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await getSettings();
  await kvSet("settings", { ...current, ...patch });
}
