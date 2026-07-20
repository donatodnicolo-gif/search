// Service worker minimale per il Web Push.
// Riceve i messaggi push (anche a scheda chiusa) e mostra la notifica di
// sistema; al click porta alla consegna collegata.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Deluxy', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Deluxy';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { entityType: data.entityType || null, entityId: data.entityId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { entityType, entityId } = event.notification.data || {};
  const target = entityType === 'delivery' && entityId ? `/deliveries/${entityId}` : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Se una scheda dell'app e' gia' aperta, la si riusa invece di aprirne una nuova.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
