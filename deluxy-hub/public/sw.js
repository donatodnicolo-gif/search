// Service worker minimo del Deluxy Hub.
//
// ⚠️ NON mette NIENTE in cache di proposito. Il Hub è un portale dietro login:
// una cache servirebbe una pagina di un altro utente, o una schermata da
// disconnesso a chi è dentro (e viceversa). Qui il service worker esiste solo
// per rendere l'app «installabile» (Android lo pretende) e passa ogni richiesta
// alla rete così com'è. Se un giorno serve una cache, dev'essere solo per gli
// asset statici, mai per le pagine HTML autenticate.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
