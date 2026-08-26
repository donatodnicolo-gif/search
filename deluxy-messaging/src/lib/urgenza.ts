// In che ordine mostrare gli ordini: i più urgenti in cima.
//
// ⚠️ NON BASTA «CONSEGNA PIÙ VECCHIA PRIMA». Misurato sui dati veri: fra gli
// ordini non gestiti, **578 hanno la consegna già passata** (si torna a due mesi
// indietro) mentre quelli di **oggi sono 8**. Il motivo è che `gestione` è
// recente e nessuno ha ancora spuntato gli ordini vecchi: quelle consegne sono
// avvenute, manca la spunta. Ordinando per data crescente, il lavoro di oggi
// finirebbe sotto 578 righe di archeologia — l'esatto contrario di «i più
// urgenti in primo piano».
//
// Perciò si ordina a FASCE, e dentro ogni fascia con il criterio che ha senso lì:
//
//   1. consegna OGGI          → per fascia oraria: prima chi va consegnato presto
//   2. consegna DOMANI e poi  → per data crescente
//   3. scadute DA POCO        → dalla più recente: forse è ancora lavoro aperto
//   4. senza data di consegna → dalle più recenti: non si può dire se urgano
//   5. scadute DA MOLTO       → per ultime: quasi sempre consegnate e non spuntate
//
// `GIORNI_ANCORA_CALDE` è il confine fra 3 e 5: una consegna mancata ieri è
// probabilmente ancora un problema, una di due mesi fa è storia.

export const GIORNI_ANCORA_CALDE = 3

/**
 * Mezzanotte di oggi **a Roma**: le date di consegna arrivano senza orario.
 *
 * ⚠️⚠️ NON `new Date()` + `setHours(0,0,0,0)`. Quel calcolo usa il fuso della
 * macchina che lo esegue, e questa app gira su Vercel, **in UTC**. Fra
 * mezzanotte e le due di Roma (una d'inverno) per il server è ancora **ieri**:
 * misurato in diretta alle 00:42 di Roma, la schermata «Oggi» mostrava le
 * consegne del giorno prima e **8 ordini in ritardo invece di 3**.
 *
 * ⚠️ Le date di consegna sono memorizzate a **mezzanotte UTC**, e quindi il
 * confine giusto da confrontare con loro è la mezzanotte del giorno di Roma
 * scritta in UTC: è quello che costruisce `Date.UTC(...)` qui sotto.
 *
 * Stessa cura che `ai-fuori-turno.ts` ha per i turni, e per lo stesso motivo:
 * chi legge questi numeri vive in Italia.
 */
export function inizioOggi(): Date {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const pezzo = (t: string) => Number(p.find((x) => x.type === t)?.value ?? '0')
  return new Date(Date.UTC(pezzo('year'), pezzo('month') - 1, pezzo('day')))
}

export function inizioDomani(): Date {
  return new Date(inizioOggi().getTime() + 86400000)
}

/** Il confine oltre il quale una consegna scaduta non è più "calda". */
export function limiteCalde(): Date {
  return new Date(inizioOggi().getTime() - GIORNI_ANCORA_CALDE * 86400000)
}

export const FASCE_URGENZA = [
  { chiave: 'oggi', nome: 'da consegnare oggi' },
  { chiave: 'prossime', nome: 'da consegnare nei prossimi giorni' },
  { chiave: 'scadute-recenti', nome: 'scadute da pochi giorni' },
  { chiave: 'senza-data', nome: 'senza data di consegna' },
  { chiave: 'scadute-vecchie', nome: 'scadute da tempo' },
] as const

export type ChiaveFasciaUrgenza = (typeof FASCE_URGENZA)[number]['chiave']
