# privateissues.admin

Private Issues'ın tek yerden yönetildiği panel: Shopify siparişleri, kargo, stok, Instagram ve bildirimler. Z Fold'da uygulama gibi çalışır (PWA).

## Ne yapıyor

- **Yeni sipariş bildirimi** — ürün görseliyle, müşteri/şehir, ilk mi tekrar mı, hızlı kargo mu, bugünün kaçıncı siparişi. Bildirimden direkt **Kargola**.
- **Kargolanmayan siparişler** — 24 / 48 / 72 saatte hatırlatma (hızlı kargoda yarı sürede), 48 saatten sonra bildirim ekranda kalır. 3+ paket birikirse tek toplu bildirim.
- **Sabah özeti 09:00**, **"kargo kapanmadan" 16:00**, gece 00–08 sessiz.
- **Stok uyarısı** — bir beden eşiğin altına düşünce / tükenince.
- **Kargola** — firma + takip no gir, Shopify'da fulfill olur, müşteriye e-posta gider.
- Panel: bekleyen paketler (aciliyet çubuğu), bugün / 7 gün / 30 gün ciro, en çok satanlar.
- Instagram: takipçi, erişim, içerik bazında **paylaşım sonrası 48 saatte gelen sipariş**.
- Uygulama açıkken yeni sipariş üstten kayarak gelir, ikon rozetinde bekleyen paket sayısı.

## Kurulum (bir kere, ~30 dk)

### 1. Hesaplar
- **GitHub** — bu klasörü private repo olarak yükle.
- **Neon** (neon.tech, ücretsiz) — proje aç, connection string'i al.
- **Vercel** (ücretsiz) — GitHub reposunu import et.

### 2. Anahtarlar
`.env.example`'ı `.env.local` olarak kopyala ve doldur:

| Değişken | Nereden |
|---|---|
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | dev.shopify.com → Apps → privateissues-admin → Settings |
| `DATABASE_URL` | Neon → Connection string |
| `ADMIN_PASSWORD` | Kendin belirle |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 24` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npm run vapid` |
| `METRICOOL_TOKEN` | Metricool → Hesap ayarları → API |

### 3. Yerelde dene
```bash
npm install
npm run db:push     # tabloları oluşturur
npm run dev         # http://localhost:3000
```
Ayarlar → **Tüm geçmişi çek** ile siparişler gelir.

### 4. Canlıya al
1. Vercel → Project → Settings → Environment Variables: `.env.local`'daki her şeyi ekle, `APP_URL=https://admin.privateissues.com`.
2. Vercel → Domains → `admin.privateissues.com` ekle, söylediği CNAME'i DNS'e gir.
3. Deploy bittikten sonra siteye gir → Ayarlar → **Webhook'ları kur**.
4. **cron-job.org** (ücretsiz): her 15 dakikada bir şu adresi çağıran bir iş oluştur:
   `https://admin.privateissues.com/api/cron?key=CRON_SECRET_DEĞERİN`
   (Vercel ücretsiz planı günde 1 cron'a izin veriyor; hatırlatmalar için 15 dk gerekli.)

### 5. Telefona kur (Z Fold)
1. Chrome'da `admin.privateissues.com` → giriş yap.
2. ⋮ menü → **Ana ekrana ekle / Uygulamayı yükle**.
3. Ana ekrandaki ikondan aç → Ayarlar → **Bildirimler**'i aç → **Test bildirimi gönder**.
4. Android ayarlarında uygulamanın bildirim kanalını "Öncelikli / Pop-up" yaparsan kilit ekranında görselli gelir.

## Geliştirme

Claude Code veya T3 Code ile bu klasörü aç; `CLAUDE.md` tüm kuralları ve yol haritasını içeriyor.

```bash
npm run typecheck
npm run lint
npm run build
npm run db:studio   # veritabanını tarayıcıda gör
```
