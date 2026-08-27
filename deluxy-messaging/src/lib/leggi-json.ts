// LEGGERE UNA RISPOSTA DELL'APP SENZA CREDERE A UNA PAGINA DI LOGIN.
//
// ⚠️⚠️ NASCE DA UNA SEGNALAZIONE (27/08/2026): «nel creare un nuovo ordine non
// vede quali sono i negozi». Il modulo li chiede a `/api/ordini`, e la lettura
// era scritta così:
//
//     fetch('/api/ordini?gestione=gestito')
//       .then((r) => (r.ok ? r.json() : { negozi: [] }))
//       .catch(() => setNegozi([]))
//
// Cioè **qualunque** cosa vada storta diventa «non ci sono negozi»: una tendina
// con dentro solo «Scegli…», e nessun messaggio da nessuna parte. Chi la guarda
// non ha modo di sapere se i negozi non ci sono o se l'app non è riuscita a
// chiederli.
//
// ⚠️⚠️ E la cosa peggiore è il caso che capita davvero. **Senza sessione il
// middleware NON risponde 401: fa un 307 verso `/login`**, che `fetch` segue di
// suo restituendo la PAGINA DI LOGIN con stato 200. Quindi `r.ok` è **vero**,
// `r.json()` fallisce (è HTML) o non trova il campo, e si finisce nel ramo
// «lista vuota». Succede in pieno alla persona che aveva l'app aperta in una
// scheda mentre la sessione le è scaduta — o mentre un rilascio l'ha
// invalidata: la pagina non si ricarica, quindi non viene mai mandata al login,
// e da quel momento **ogni elenco dell'app si svuota in silenzio**.
//
// ⚠️ Il controllo era già scritto in cinque componenti, ognuno a modo suo. Qui
// c'è una volta sola, così chi ne aggiunge uno nuovo non deve ricordarselo.

export type EsitoLettura<T> =
  | { stato: 'ok'; dati: T }
  | { stato: 'sessione-scaduta' }
  | { stato: 'errore'; messaggio: string }

/**
 * Legge il JSON di una risposta, distinguendo i tre casi che contano.
 *
 * ⚠️ Non restituisce mai un valore «vuoto ma plausibile»: chi chiama deve
 * decidere cosa mostrare, e per farlo deve sapere che cosa è successo.
 */
export async function leggiJson<T>(res: Response): Promise<EsitoLettura<T>> {
  // ⚠️ `res.redirected` è vero quando `fetch` ha seguito il 307 del middleware.
  // Il tipo del contenuto è la seconda rete: certi percorsi rispondono la
  // pagina di login senza che `redirected` risulti (una risposta servita dalla
  // cache, un rewrite invece di un redirect).
  const tipo = res.headers.get('content-type') ?? ''
  if (res.redirected || !tipo.includes('json') || res.status === 401) {
    // ⚠️⚠️ SI DICE A TUTTA L'APP, non solo a chi ha chiamato. Chi guarda il
    // diario vede il messaggio del diario, chi sta facendo un ordine vede una
    // tendina vuota: sono la stessa cosa e nessuna delle due lo dice. La fascia
    // in cima (`SessioneScaduta`) lo dice una volta per tutte le schermate.
    avvisaSessioneScaduta()
    return { stato: 'sessione-scaduta' }
  }

  let corpo: unknown
  try {
    corpo = await res.json()
  } catch {
    return { stato: 'errore', messaggio: 'La risposta dell’app non si è capita.' }
  }
  if (!res.ok) {
    const e = (corpo as { errore?: string })?.errore
    return { stato: 'errore', messaggio: e || `L’app ha risposto ${res.status}.` }
  }
  return { stato: 'ok', dati: corpo as T }
}

/**
 * La stessa cosa partendo dall'indirizzo, con la rete già gestita.
 *
 * ⚠️ «Rete assente» è un terzo caso ancora, e va detto com'è: chi è sul
 * telefono in giro deve sapere che deve riprovare, non che i negozi sono finiti.
 */
export async function chiediJson<T>(url: string, init?: RequestInit): Promise<EsitoLettura<T>> {
  try {
    return await leggiJson<T>(await fetch(url, init))
  } catch {
    return { stato: 'errore', messaggio: 'Rete assente: riprova fra un attimo.' }
  }
}

/**
 * Fa comparire la fascia «la sessione è scaduta» in cima all'app.
 *
 * ⚠️ Un evento e non un import diretto del componente: questo file lo usano
 * anche pezzi che girano sul server, e tirarsi dietro un componente React
 * romperebbe la build. L'evento invece semplicemente non parte.
 */
export function avvisaSessioneScaduta(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('deluxy:sessione-scaduta'))
}

/** La frase da mostrare, uguale in tutta l'app. */
export function frasePerEsito(e: EsitoLettura<unknown>): string {
  if (e.stato === 'ok') return ''
  if (e.stato === 'sessione-scaduta') {
    return 'La sessione è scaduta: ricarica la pagina e rientra. (Finché non lo fai, gli elenchi restano vuoti.)'
  }
  return e.messaggio
}
