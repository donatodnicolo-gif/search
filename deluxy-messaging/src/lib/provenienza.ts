// Da dove arriva chi apre la chat sul sito.
//
// Chi scrive dopo aver cliccato un annuncio non è chi arriva dal passaparola:
// cambia l'urgenza, cambia il tono e cambia cosa vale la pena proporgli. In
// Inbox erano tutti «Visitatore sito».
//
// ⚠️ QUI NON SI INDOVINA. Si classifica solo con quello che il browser dichiara:
// i parametri `utm_*` che mettiamo noi nelle campagne, il `gclid` che aggiunge
// Google Ads, il sito che ha mandato il visitatore. Se non c'è nessuno di questi
// segnali la risposta è **«diretto»**, che vuol dire «non lo sappiamo», non «è
// arrivato da solo»: senza cookie né storia salvata, chi ha cliccato l'annuncio
// ieri e scrive oggi è indistinguibile da chi ha digitato l'indirizzo a mano.
// Meglio un'etichetta onesta che una statistica inventata.

export type Provenienza = {
  /** google-ads | google | meta-ads | social | referral | diretto */
  origine: string
  /** La campagna, o il sito che ha mandato: quello che serve per riconoscerla. */
  dettaglio: string
  /** La pagina da cui ha aperto la chat, senza query. */
  pagina: string
}

/** I nomi leggibili, per l'inbox. */
export const NOMI_ORIGINE: Record<string, string> = {
  'google-ads': 'Google Ads',
  google: 'Ricerca Google',
  'meta-ads': 'Meta Ads',
  social: 'Social',
  referral: 'Da un altro sito',
  diretto: 'Diretto',
}

const SOCIAL = ['instagram', 'facebook', 'tiktok', 'pinterest', 'youtube', 'linkedin', 'twitter', 'x.com']
const MOTORI = ['google', 'bing', 'duckduckgo', 'ecosia', 'yahoo', 'yandex']

function pulisci(v: string | null | undefined, tetto = 60): string {
  return (v ?? '').trim().toLowerCase().slice(0, tetto)
}

export function classificaProvenienza(p: {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  gclid?: string | null
  fbclid?: string | null
  rif?: string | null
  pagina?: string | null
}): Provenienza {
  const fonte = pulisci(p.utm_source)
  const mezzo = pulisci(p.utm_medium)
  const campagna = pulisci(p.utm_campaign, 80)
  const rif = pulisci(p.rif, 80)
  const pagina = (p.pagina ?? '').slice(0, 120)

  // 1. Il clic da annuncio si riconosce dal suo identificatore, che lo mette la
  //    piattaforma: è il segnale più affidabile che abbiamo.
  if (p.gclid) return { origine: 'google-ads', dettaglio: campagna || 'gclid', pagina }
  if (p.fbclid) return { origine: 'meta-ads', dettaglio: campagna || 'fbclid', pagina }

  // 2. Poi le utm, che mettiamo noi: `cpc`/`paid` vuol dire campagna a pagamento.
  if (mezzo.includes('cpc') || mezzo.includes('ppc') || mezzo.includes('paid')) {
    if (fonte.includes('google')) return { origine: 'google-ads', dettaglio: campagna || fonte, pagina }
    if (fonte.includes('facebook') || fonte.includes('instagram') || fonte.includes('meta'))
      return { origine: 'meta-ads', dettaglio: campagna || fonte, pagina }
    return { origine: 'social', dettaglio: campagna || fonte, pagina }
  }
  if (fonte) {
    if (MOTORI.some((m) => fonte.includes(m))) return { origine: 'google', dettaglio: campagna || fonte, pagina }
    if (SOCIAL.some((s) => fonte.includes(s))) return { origine: 'social', dettaglio: campagna || fonte, pagina }
    return { origine: 'referral', dettaglio: campagna || fonte, pagina }
  }

  // 3. Infine chi lo ha mandato, quando non ci sono utm.
  if (rif) {
    if (MOTORI.some((m) => rif.includes(m))) return { origine: 'google', dettaglio: rif, pagina }
    if (SOCIAL.some((s) => rif.includes(s))) return { origine: 'social', dettaglio: rif, pagina }
    return { origine: 'referral', dettaglio: rif, pagina }
  }

  return { origine: 'diretto', dettaglio: '', pagina }
}
