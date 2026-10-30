/* EGPP Service Worker — Web Push background notification handler */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: "EGPP", body: event.data.text() }; }

  const options = {
    body: payload.body || "New food deal nearby!",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.deal_id || "egpp",
    renotify: true,
    requireInteraction: false,
    data: { url: payload.deal_id ? `/deals/${payload.deal_id}` : "/" },
    actions: [{ action: "view", title: "View Deal" }],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "?? New Deal Near You!", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
