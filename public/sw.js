/* Minimal service worker for Web Push reminders */
self.addEventListener("push", (event) => {
  let title = "Garage Genius";
  let body = "You have a maintenance reminder.";
  try {
    const data = event.data ? event.data.json() : null;
    if (data?.title) title = data.title;
    if (data?.body) body = data.body;
  } catch {
    try {
      body = event.data?.text() || body;
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      data: { url: "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(clients.openWindow(url));
});
