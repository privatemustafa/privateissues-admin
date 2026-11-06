@AGENTS.md

# privateissues.admin

Private Issues (Istanbul streetwear brand) için tek kullanıcılı admin paneli. Sahibi Mustafa; Samsung Galaxy Z Fold 8 Ultra'da PWA olarak kullanıyor. Arayüz dili **Türkçe**, kısa ve sade.

## Stack
- Next.js 16 (App Router, **Cache Components açık**, `proxy.ts` = eski middleware), React 19, TypeScript
- Tailwind v4 (`src/app/globals.css` içindeki `@theme` token'ları)
- Postgres + Drizzle (`src/db/schema.ts`, `npm run db:push`)
- Shopify Admin GraphQL `2026-10` — Dev Dashboard app, **client credentials grant** (token 24 saatte bir yenilenir, `kv` tablosunda cache)
- Web Push (VAPID, `web-push`), service worker `public/sw.js`
- Instagram verisi Metricool API'den (`src/lib/metricool.ts`)

## Kurallar
- Cache Components: request-time veri okuyan her bileşen `<Suspense>` içinde olmalı ve başında `await requireSession()` çağırmalı (hem auth hem `connection()` yapar). Bunu atlarsan build "blocking-prerender" hatası verir.
- Route handler GET'lerinde `await connection()` ile başla.
- Server action'lar `src/app/(app)/actions.ts`; sonunda `refresh()` (next/cache).
- Shopify sorgularını `src/lib/shopify/queries.ts`'e ekle; yeni alanları önce gerçek mağazada doğrula.
- Bildirimler `src/lib/notify.ts` → `once(kind, ref, payload)` ile gönder (aynı bildirim iki kez gitmez).
- Para birimi TRY, saat dilimi Europe/Istanbul — `src/lib/format.ts` yardımcılarını kullan.
- `uppercase` + Türkçe: marka/İngilizce metinlerde `lang="en"` ver (yoksa i → İ olur).

## Depo
`src/lib/warehouse.ts`. Tablolar `warehouse_items` + `stock_moves` (her değişiklik bir hareket; `dedupe` ile aynı sipariş iki kez düşmez). Sipariş → `applyOrdersToWarehouse` (webhook + senkron çağırır; sadece `warehouse_started_at` sonrası siparişler). Eşleşme: önce `shopifyVariantId`, sonra normalize ürün+beden(+renk) adı. İptal → `revertOrder`. Elle değişiklik → `moveStock`.

## Görseller
Ürünlerin vitrin medyası 3D model; onun önizlemesi gri. Her zaman `media(query: "media_type:IMAGE")` ile gerçek fotoğrafı al (`LineItem.images`). Görseller `SmartImg` ile gösterilir (yüklenemezse baş harfler).

## Tasarım
Beyaz/krem (`paper #f6f3ec`, `card #fff`, `line #e2dccf`), siyah mürekkep, ince çizgiler, büyük rakamlar (`num` utility). Font yığını: Helvetica Neue → Inter Tight. Aciliyet renkleri: fresh (yeşil) → due (hardal) → late (pas) → critical (bordo). Dark mode yok.

Breakpoint'ler: telefon / Fold kapalı < 768px (alt sekme çubuğu); Fold açık `md` (ikon rayı + iki sütun); masaüstü `lg` (etiketli ray).

## Klasörler
- `src/app/(app)/` — korumalı sayfalar: panel, orders (liste + detay, Fold'da yan yana), pack (paketleme, raf sırasıyla), depo (kendi stok + /depo/import), stock (Shopify stoğu, düzenlenebilir), instagram, settings
- `src/app/api/` — `webhooks/shopify` (HMAC doğrulamalı), `cron` (15 dk'da bir), `push/subscribe`, `live`
- `src/lib/` — shopify, notify, push, metricool, data (DB okumaları), format, settings

## Yol haritası (sıradaki)
1. Drop planlayıcı: lansman tarihi, teaser takvimi, Shopify indirim kodu oluşturma
2. İade/değişim akışı + iade nedeni raporu
3. Kargo firması API'si ile "teslim edildi" durumu
4. Finans özeti (ciro − reklam − kargo − iade)
5. Müşteri listesi (tekrar alanlar, beden geçmişi)
