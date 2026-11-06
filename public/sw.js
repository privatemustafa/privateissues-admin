/* privateissues.admin — service worker (bildirimler) */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "Private Issues", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(d.title || "Private Issues", {
        body: d.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        image: d.image || undefined,
        tag: d.tag,
        renotify: !!d.renotify && !!d.tag,
        requireInteraction: !!d.requireInteraction,
        silent: !!d.silent,
        vibrate: d.silent ? undefined : [70, 40, 70, 40, 140],
        actions: d.actions || [],
        timestamp: Date.now(),
        data: { url: d.url || "/", shipUrl: d.shipUrl, kind: d.kind },
      });

      // İkon rozeti: bekleyen paket sayısı
      if (typeof d.badgeCount === "number" && "setAppBadge" in navigator) {
        try {
          d.badgeCount > 0 ? await navigator.setAppBadge(d.badgeCount) : await navigator.clearAppBadge();
        } catch {}
      }

      // Açık sekme varsa canlı güncelle
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: "push", payload: d });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = event.action === "ship" && data.shipUrl ? data.shipUrl : data.url || "/";

  event.waitUntil(
    (async () => {
      const url = new URL(target, self.location.origin).href;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) return w.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
