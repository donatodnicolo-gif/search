// L'INDIRIZZO DI UN'APP SORELLA, e perché non è un campo di testo qualunque.
//
// ⚠️⚠️ `ordersUrl`, `anagraficheUrl`, `partnerUrl`, `searchUrl`,
// `piattaformaUrl` non sono segreti — ma **la chiave viaggia verso di loro**:
// ogni ponte fa `fetch(`${base}/api/v1/…`, { headers: { 'x-api-key': chiave } })`.
// Cambiare l'indirizzo vuol dire farsi consegnare la chiave al primo giro, senza
// mai averla vista e senza che nessuno se ne accorga.
//
// ⚠️ Verificato il 27/08/2026: in produzione le variabili d'ambiente che
// avrebbero la precedenza (`ORDERS_URL`, `ANAGRAFICHE_API_KEY`…) **non sono
// impostate** — ce ne sono cinque in tutto e nessuna è di queste — quindi la
// configurazione viva è proprio quella scrivibile dal modulo Impostazioni. E
// due ponti (Partner e Search) dall'ambiente non leggono affatto, per
// costruzione: «basta mettere le env su Vercel» sarebbe una correzione parziale
// che sembra totale.
//
// ⚠️ Il controllo di ruolo su quella pagina chiude l'operatore, ma non basta:
// resta l'amministratore distratto, o il suo account in mano a qualcun altro.
// Un cancello che guarda CHI passa e uno che guarda COSA passa sono due cose
// diverse, e questo è il secondo.
//
// ⚠️ Questo file non importa niente: è una regola, e si prova
// (`scripts/prova-indirizzi-app.mts`) senza database e senza rete.

/** I campi delle Impostazioni che sono l'indirizzo di un'app sorella. */
export const CAMPI_INDIRIZZO = new Set([
  'ordersUrl',
  'searchUrl',
  'partnerUrl',
  'anagraficheUrl',
  'piattaformaUrl',
  // 04/09/2026: anche verso Merchandising parte una chiave nell'header.
  'merchandisingUrl',
])

/**
 * Si può salvare questo indirizzo?
 *
 * ⚠️ Solo `https:` e solo gli host dell'ecosistema. Se un giorno un'app cambia
 * dominio si aggiunge una riga qui: costa dieci secondi e si legge nel diff,
 * che è esattamente quello che deve succedere quando cambia dove va una chiave.
 */
export function indirizzoAmmesso(v: string): boolean {
  const t = (v ?? '').trim()
  // ⚠️ Vuoto SÌ: è il modo di scollegare un'app, e vietarlo vorrebbe dire non
  // poter più togliere un indirizzo sbagliato.
  if (!t) return true
  let u: URL
  try {
    u = new URL(t)
  } catch {
    return false
  }
  // ⚠️ `http:` no, nemmeno in prova: la chiave andrebbe in chiaro sulla rete.
  if (u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  return (
    h === 'deluxy.it' ||
    h.endsWith('.deluxy.it') ||
    // ⚠️ `.vercel.app` è largo — ci sta dentro il progetto di chiunque — ma è
    // dove vivono davvero tutte le app Deluxy, e restringerlo ai nomi esatti
    // vorrebbe dire rompere l'app al prossimo rinomino di un progetto. Il
    // cancello stretto è il ruolo; questo toglie il caso «un dominio qualunque».
    h.endsWith('.vercel.app')
  )
}
