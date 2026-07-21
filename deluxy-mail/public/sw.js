/* Service worker di AI Mail: riceve le notifiche push e le mostra. */

self.addEventListener('push', (event) => {
  let dati = {}
  try {
    dati = event.data ? event.data.json() : {}
  } catch (e) {
    dati = {}
  }
  const titolo = dati.titolo || 'AI Mail'
  event.waitUntil(
    self.registration.showNotification(titolo, {
      body: dati.corpo || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: dati.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
      for (const f of finestre) {
        if ('focus' in f) return f.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
