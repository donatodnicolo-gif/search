import { db } from './db'
import { leggiImpostazioni } from './impostazioni'
import { agganciaAffidabile } from './aggancio-fornitore'

// IL FORNITORE PAGATO ENTRA NEL REGISTRO (24/08/2026, richiesta dell'utente).
//
// Un pagamento fatto dimostra che quell'azienda ci ha fornito davvero: se non
// è nel registro delle anagrafiche va aggiunta, se c'è va marcata fornitore.
// Il registro resta il proprietario del dato (qui nessuna copia): si manda un
// upsert-merge a POST /api/v1/partners e decide lui — i campi curati dal team
// non si toccano, e un fornitore «da evitare» NON torna buono solo perché
// l'abbiamo pagato (guardia nel merge del registro).
//
// ⚠️ PRIMA DI SCRIVERE SI CHIEDE /partners/match: il POST aggancia per
// nome+città ESATTI, e noi la città del fornitore non la sappiamo (quella
// sull'ordine è la città di CONSEGNA: dedurla scriverebbe un dato inventato).
// Senza il match, «Ketty Flowers» pagata oggi diventerebbe un DOPPIONE di
// «Ketty Flowers · PORTO CERVO» già in registro. Con il match:
//   agganciata → si rimanda nome+città DEL REGISTRO, e il merge colpisce giusto;
//   candidati  → NON si scrive (creare a caso = doppione): la richiesta resta
//                nella pagina /match del registro, la risolve una persona;
//   nessuna    → si crea, senza città: meglio «non indicato» che sbagliato.
//
// Best-effort per contratto: chi ci chiama ha appena registrato un'uscita di
// denaro, e quel fatto non deve fallire per colpa di un contorno.

const BASE_DEFAULT = 'https://deluxy-anagrafiche.vercel.app'

export type EsitoRegistroFornitore = {
  /** true = il registro ora conosce questo fornitore (creato o aggiornato). */
  ok: boolean
  esito:
    | 'creato'
    | 'aggiornato'
    | 'non-configurato'
    | 'senza-nome'
    | 'ambiguo'
    | 'rimborso'
    | 'errore'
  /** Una riga da mostrare o da scrivere nei log. */
  messaggio: string
}

export async function segnalaFornitorePagatoAlRegistro(
  richiestaId: string
): Promise<EsitoRegistroFornitore> {
  const r = await db.richiestaPagamento.findUnique({
    where: { id: richiestaId },
    select: {
      intestatario: true,
      iban: true,
      ibanValido: true,
      metodo: true,
      ordineNumero: true,
      pagataIl: true,
    },
  })
  if (!r?.pagataIl) {
    return { ok: false, esito: 'errore', messaggio: 'Richiesta non trovata o non pagata.' }
  }

  // Il nome migliore che abbiamo: il fornitore scritto sull'ordine (se c'è),
  // altrimenti l'intestatario del conto. Sono spesso la stessa cosa dopo la
  // riconciliazione, ma quando differiscono l'ordine è più affidabile:
  // l'intestatario può essere la persona, non l'insegna.
  let ordine: { fornitoreNome: string; fornitoreTelefono: string; fornitoreEmail: string } | null =
    null
  if (r.ordineNumero) {
    const numero = r.ordineNumero.replace('#', '')
    ordine = await db.ordine.findFirst({
      where: { numero: { in: [numero, `#${numero}`] } },
      select: { fornitoreNome: true, fornitoreTelefono: true, fornitoreEmail: true },
    })
  }
  const nome = (ordine?.fornitoreNome || r.intestatario || '').trim()
  if (!nome) {
    return { ok: false, esito: 'senza-nome', messaggio: 'Il pagamento non dice a chi è andato.' }
  }

  // Stessa configurazione della lettura (src/lib/anagrafiche.ts): prima le
  // env, poi le Impostazioni. La chiave `deluxy-messaging` dal 24/08/2026 ha
  // lo scope «driver di prima parte» (solo POST /partners, niente cancellazioni).
  const envUrl = (process.env.ANAGRAFICHE_URL ?? '').trim()
  const envChiave = (process.env.ANAGRAFICHE_API_KEY ?? '').trim()
  const config: { anagraficheUrl?: string; anagraficheApiKey?: string } = envChiave
    ? {}
    : await leggiImpostazioni(['anagraficheUrl', 'anagraficheApiKey'])
  const chiave = envChiave || config.anagraficheApiKey
  if (!chiave) return { ok: false, esito: 'non-configurato', messaggio: 'Chiave del registro non configurata.' }
  const base = (envUrl || config.anagraficheUrl || BASE_DEFAULT).replace(/\/+$/, '')

  try {
    // 1) Chi è, per il registro?
    const qm = new URLSearchParams({ nome, sistema: 'customer-service' })
    const resMatch = await fetch(`${base}/api/v1/partners/match?${qm.toString()}`, {
      headers: { 'x-api-key': chiave },
      cache: 'no-store',
    })
    if (!resMatch.ok) {
      return { ok: false, esito: 'errore', messaggio: `Il registro ha risposto ${resMatch.status} al match.` }
    }
    const match = (await resMatch.json()) as {
      esito?: 'agganciata' | 'candidati' | 'nessuna'
      match?: { nome?: string; citta?: string | null } | null
    }
    if (match.esito === 'candidati') {
      return {
        ok: false,
        esito: 'ambiguo',
        messaggio: `«${nome}» somiglia a più anagrafiche: la richiesta è nella pagina Match del registro, da risolvere a mano.`,
      }
    }

    // ⚠️⚠️ E un «agganciata» NON si prende sulla parola: il 25/08/2026 il
    // registro ha agganciato «Paradis des fleurs» a «Contatti senza azienda
    // (HubSpot)» — un contenitore con 288 contatti dentro, in cui le tre parole
    // comparivano sparse — e noi ci abbiamo scritto sopra «fornitore abituale».
    // Il fornitore vero è rimasto fuori dall'anagrafica.
    // Perché succede e come si controlla: src/lib/aggancio-fornitore.ts.
    if (match.esito === 'agganciata') {
      const suo = (match.match?.nome ?? '').trim()
      if (!agganciaAffidabile(nome, suo)) {
        return {
          ok: false,
          esito: 'ambiguo',
          messaggio: `Il registro ha agganciato «${nome}» a «${suo}», che è un'altra azienda: non ho scritto niente. Da collegare a mano dalla pagina Match del registro.`,
        }
      }
    }

    // 2) L'upsert-merge. Con l'aggancio si rimandano nome e città COME LI HA
    //    IL REGISTRO, così il merge colpisce quel record e non ne crea un altro.
    const corpo: Record<string, unknown> = {
      nome: match.esito === 'agganciata' && match.match?.nome ? match.match.nome : nome,
      sistema: 'customer-service',
      asOf: new Date().toISOString(),
      // L'abbiamo pagato: è un fornitore del nostro giro. «abituale» è il
      // valore vero fra quelli del catalogo; se il team l'ha bocciato
      // («da evitare») il registro ignora questa riga, per sua regola.
      statoFornitore: 'abituale',
    }
    if (match.esito === 'agganciata' && match.match?.citta) corpo.citta = match.match.citta
    if (ordine?.fornitoreTelefono?.trim()) corpo.telefono = ordine.fornitoreTelefono.trim()
    if (ordine?.fornitoreEmail?.trim()) corpo.email = ordine.fornitoreEmail.trim()
    // L'IBAN entra solo verificato (checksum ok): nel golden record un IBAN
    // sbagliato costa un bonifico rifiutato. L'intestatario viaggia con lui.
    if (r.metodo === 'iban' && r.ibanValido && r.iban.trim()) {
      corpo.iban = r.iban.trim()
      corpo.intestatarioConto = r.intestatario.trim() || undefined
    }

    const resPost = await fetch(`${base}/api/v1/partners`, {
      method: 'POST',
      headers: { 'x-api-key': chiave, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      cache: 'no-store',
    })
    const dati = (await resPost.json().catch(() => ({}))) as { esito?: string; errore?: string }
    if (!resPost.ok) {
      return { ok: false, esito: 'errore', messaggio: dati.errore || `Il registro ha risposto ${resPost.status}.` }
    }
    const creato = dati.esito === 'creato'
    return {
      ok: true,
      esito: creato ? 'creato' : 'aggiornato',
      messaggio: creato
        ? `«${corpo.nome}» non era in anagrafica: creato come fornitore abituale.`
        : `«${corpo.nome}» aggiornato nel registro come fornitore abituale.`,
    }
  } catch (e) {
    return {
      ok: false,
      esito: 'errore',
      messaggio: `Registro non raggiungibile: ${e instanceof Error ? e.message : 'errore'}`,
    }
  }
}
