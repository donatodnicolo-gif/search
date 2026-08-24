// COME paghiamo un fornitore. Non sempre con un bonifico.
//
// ⚠️⚠️ Finché l'unica forma prevista era l'IBAN, tutto il resto **non si
// registrava affatto**: chi manda un link di pagamento, chi dà un indirizzo
// PayPal, chi si accorda a voce. Quelle spese restavano in una chat, e
// sull'ordine risultava che non avevamo pagato nessuno.
//
// ⚠️ Questo file NON importa `db`: lo usa la pagina Pagamenti, che è un
// componente client.

export type Metodo = 'iban' | 'link' | 'paypal' | 'altro'

export const METODI: { chiave: Metodo; nome: string; aiuto: string; segnaposto: string }[] = [
  {
    chiave: 'iban',
    nome: 'Bonifico (IBAN)',
    aiuto: 'L’unico che si può verificare col codice di controllo.',
    segnaposto: 'IT60X0542811101000000123456',
  },
  {
    chiave: 'link',
    nome: 'Link di pagamento',
    aiuto: 'Il link che ci ha mandato: si incolla qui e resta scritto sull’ordine.',
    segnaposto: 'https://…',
  },
  {
    chiave: 'paypal',
    nome: 'PayPal',
    aiuto: 'L’indirizzo del conto PayPal, o il suo @nome.',
    segnaposto: 'nome@esempio.it',
  },
  {
    chiave: 'altro',
    nome: 'Altro (scritto)',
    aiuto: 'Contanti alla consegna, compensazione, quello che è: scrivilo com’è.',
    segnaposto: 'contanti alla consegna, concordato al telefono',
  },
]

export function nomeMetodo(m: string): string {
  return METODI.find((x) => x.chiave === m)?.nome ?? m
}

export function metodoValido(m: string): m is Metodo {
  return METODI.some((x) => x.chiave === m)
}

/**
 * Che cosa deve esserci perché la richiesta abbia senso.
 *
 * ⚠️ Non è la stessa cosa per tutti i metodi, e fingere che lo sia porta a
 * salvare righe vuote: un bonifico senza IBAN non è pagabile, un «altro» senza
 * la frase non dice niente a nessuno. L'unica cosa che serve **sempre** è a chi
 * stiamo dando i soldi.
 */
export function cosaManca(d: {
  metodo: string
  iban: string
  riferimento: string
  intestatario: string
}): string {
  if (!d.intestatario.trim()) return 'Serve almeno il nome di chi va pagato.'
  if (d.metodo === 'iban' && !d.iban.trim()) return 'Serve l’IBAN.'
  if (d.metodo !== 'iban' && !d.riferimento.trim()) {
    return d.metodo === 'link'
      ? 'Serve il link di pagamento.'
      : d.metodo === 'paypal'
        ? 'Serve l’indirizzo PayPal.'
        : 'Scrivi come è stato concordato il pagamento.'
  }
  return ''
}

/**
 * Un link si vede se è un link. ⚠️ Solo `http`/`https`: un `javascript:` o un
 * `data:` incollati per sbaglio (o non per sbaglio) non devono diventare una
 * cosa cliccabile dentro l'app.
 */
export function linkSicuro(v: string): string {
  const t = (v ?? '').trim()
  if (!/^https?:\/\//i.test(t)) return ''
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : ''
  } catch {
    return ''
  }
}

// ── LA RICEVUTA ──

/**
 * ⚠️ Il tetto NON è una scelta di stile: il corpo di una funzione serverless
 * arriva a ~4,5 MB, e un file più grande non ci arriva nemmeno — muore prima
 * con un errore che non spiega niente. Meglio dirlo noi, e dirlo prima di far
 * aspettare il caricamento.
 */
export const TETTO_RICEVUTA = 1_500_000

/** Che cosa accettiamo come prova di un pagamento. */
export const TIPI_RICEVUTA = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]

export function ricevutaAccettabile(tipo: string, byte: number): string {
  if (!TIPI_RICEVUTA.includes(tipo)) {
    return 'Si può caricare un’immagine (PNG, JPG, WEBP, GIF) o un PDF.'
  }
  if (byte > TETTO_RICEVUTA) {
    return `Il file pesa ${(byte / 1_000_000).toFixed(1)} MB: il massimo è 1,5 MB. Ritaglia la schermata o riducila.`
  }
  return ''
}

/** Quanto pesa, scritto come si legge. */
export function pesoScritto(byte: number): string {
  if (byte < 1000) return `${byte} byte`
  if (byte < 1_000_000) return `${Math.round(byte / 1000)} KB`
  return `${(byte / 1_000_000).toFixed(1)} MB`
}
