(() => {
  const scope = self.registration.scope;
  const cacheName = 'moi-idei-push:' + scope;
  const bindingKey = new URL('__ideas_push__/binding', scope).href;
  const seenKey = new URL('__ideas_push__/seen', scope).href;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  let queue = Promise.resolve();

  async function read(key) {
    const item = await caches.match(key, { cacheName });
    return item ? item.json() : null;
  }

  self.addEventListener('message', (event) => {
    if (event.data === 'ideas-push:version') event.ports[0]?.postMessage(1);
  });

  self.addEventListener('push', (event) => {
    async function notify() {
      let message;
      try { message = event.data?.json(); } catch { return; }
      if (message?.v !== 1 || !uuid.test(message.event) || !uuid.test(message.device)
        || !['personal', 'digest'].includes(message.kind)) return;
      const binding = await read(bindingKey);
      if (binding?.device !== message.device) return;
      const seen = await read(seenKey);
      const ids = seen?.device === message.device && Array.isArray(seen.ids) ? seen.ids : [];
      if (ids.includes(message.event) || (await read(bindingKey))?.device !== message.device) return;
      const tag = 'ideas-push:' + message.event;
      await self.registration.showNotification('Мои идеи', {
        body: message.kind === 'digest' ? 'Утренний обзор готов. Открой приложение, чтобы посмотреть.' : 'Есть новое напоминание. Открой приложение, чтобы посмотреть.',
        icon: new URL('icons/app-192.png', scope).href,
        tag, data: { device: message.device },
      });
      if ((await read(bindingKey))?.device !== message.device) {
        (await self.registration.getNotifications({ tag })).forEach((notification) => notification.close());
        return;
      }
      const cache = await caches.open(cacheName);
      await cache.put(seenKey, new Response(JSON.stringify({ device: message.device, ids: [...ids.slice(-63), message.event] })));
    }
    queue = queue.then(notify, notify).catch(() => {});
    event.waitUntil(queue);
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil((async () => {
      if (!event.notification.tag.startsWith('ideas-push:') ||
        (await read(bindingKey))?.device !== event.notification.data?.device) return;
      const target = new URL('#/reminders', scope);
      const app = new URL(scope);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        const url = new URL(client.url);
        if (url.origin !== app.origin || (url.pathname !== app.pathname && url.pathname !== app.pathname + 'index.html')) continue;
        try {
          const opened = await client.navigate(target.href);
          if (opened) { await opened.focus(); return; }
        } catch { /* An old window may close while the notification is opening. */ }
      }
      await self.clients.openWindow(target.href);
    })().catch(() => {}));
  });
})();
