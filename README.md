# privateissues.admin

Private Issues'ın tek yerden yönetildiği panel: Shopify siparişleri, kargo, stok, Instagram ve bildirimler. Z Fold'da uygulama gibi çalışır (PWA).

## Ne yapıyor

- **Yeni sipariş bildirimi** — ürün görseliyle, müşteri/şehir, ilk mi tekrar mı, hızlı kargo mu, bugünün kaçıncı siparişi. Bildirimden direkt **Kargola**.
- **Kargolanmayan siparişler** — 24 / 48 / 72 saatte hatırlatma (hızlı kargoda yarı sürede), 48 saatten sonra bildirim ekranda kalır. 3+ paket birikirse tek toplu bildirim.
- **Sabah özeti 09:00**, **"kargo kapanmadan" 16:00**, gece 00–08 sessiz.
- **Stok uyarısı** — bir beden eşiğin altına düşünce / tükenince.
- **Kargola** — firma + takip no gir, Shopify'da fulfill olur, müşteriye e-posta gider.
- **Depo** — kendi stok kaydın (Shopify'dan ayrı). Her sipariş otomatik düşer, iptal olursa geri eklenir, aynı sipariş iki kez düşmez. Bedene dokun → Giriş / Çıkış / Sayım / İade / Bilgi (raf, kod, maliyet, uyarı eşiği). Hareket geçmişi, stok değeri, azalınca bildirim, Shopify adediyle karşılaştırma. Depoda karşılığı olmayan sipariş satırları listelenir, bir kez eşleştirince sonra otomatik.
- **Stok bekleniyor** — koleksiyonda olup stoğu henüz gelmeyen ürünler listede görünür ama uyarı vermez; "Stok geldi" ile bedenleri girersin.
- **Depoya aktar** — Excel / Sheets'ten kopyala-yapıştır veya CSV (Ürün, Beden, Adet + istersen Renk, Raf, Kod, Maliyet, Min). Önizleyip "Güncelle" ya da "Sıfırdan kur". Ya da tek tuşla Shopify stoğundan başlat. CSV indir (Excel uyumlu).
- **Paketleme modu** — toplama listesi (aynı ürün+beden birleşik, raftan ne alınacak) → paket paket tik at → Kargola.
- **Kargola paneli** — panelden, listeden, paketlemeden sayfa değiştirmeden alttan açılır. Son seçtiğin kargo firmasını hatırlar. Kargo etiketindeki **barkodu kamerayla okut**, takip no kendiliğinden dolar. Bittiğinde müşteriye **WhatsApp'tan hazır mesaj**.
- **Ürün fotoğrafları** — 3D model önizlemesi yerine gerçek ürün fotoğrafları; dokununca tam ekran galeri (paketlerken doğru baskıyı kontrol etmek için).
- **Stok düzenleme** — bedene dokun, −/+ ile adedi değiştir, Shopify'a yazar. Kaç günlük stok kaldığını gösterir.
- **Etkileşimli ciro grafiği** — 7/30/90 gün, ciro/sipariş; parmağını çubukların üstünde gezdir, o günün rakamı çıkar.
- **Aşağı çek → yenile**, bağlantı koparsa Türkçe "Tekrar dene" ekranı.
- Panel: bekleyen paketler (aciliyet çubuğu), bugün / 7 gün ciro, en çok satanlar.
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
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_CONFIG_ID` | Aşağıdaki "Instagram bağlantısı" bölümü (ücretsiz) |
| `METRICOOL_TOKEN` | Alternatif; sadece Metricool Advanced planda var |

### 3. Yerelde dene
```bash
npm install
npm run db:push     # tabloları oluşturur (Vercel her yayında bunu kendisi yapar)
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

## Instagram bağlantısı (ücretsiz, bir kere)

Instagram hesabı **Profesyonel** olmalı (İşletme ya da İçerik üreticisi). Facebook sayfası gerekmez.
Ekim 2026'dan sonra açılan Meta uygulamalarında eski "Instagram login" yok; **Unified login** kullanılıyor.
Bu yolla alınan token'ın süresi dolmaz.

Uygulama: `privateissues-admin` (App ID 1441805594044571), Private Issues işletme portföyüne bağlı.

1. developers.facebook.com → uygulama → **Use cases → Instagram API → Customize → API setup with Unified login**.
2. **Create new configuration** → izinler: en azından `instagram_basic` + `instagram_manage_insights`
   (şablonda insights yoksa **Facebook Login for Business → Configurations**'dan düzenle). Token: System-user, süresiz.
   Varlık: Instagram hesabı.
3. Aynı sayfada **Redirect URL**: `https://admin.privateissues.com/api/instagram/callback` → Save.
4. Vercel → Environment Variables:
   - `INSTAGRAM_APP_ID` = Meta uygulama kimliği (1441805594044571)
   - `INSTAGRAM_APP_SECRET` = App settings → Basic → **App secret**
   - `INSTAGRAM_CONFIG_ID` = Facebook Login for Business → Configurations → yapılandırmanın kimliği
   → Redeploy.
5. Uygulamada **Instagram** sayfası → **Instagram ile bağlan** → privateissues.wrld'ü seç → izin ver. Bitti.

Elle alternatif: dashboard'dan alınan kalıcı token'ı `INSTAGRAM_TOKEN`, hesap kimliğini `INSTAGRAM_USER_ID` olarak gir.

## Geliştirme

Claude Code veya T3 Code ile bu klasörü aç; `CLAUDE.md` tüm kuralları ve yol haritasını içeriyor.

```bash
npm run typecheck
npm run lint
npm run build
npm run db:studio   # veritabanını tarayıcıda gör
```
