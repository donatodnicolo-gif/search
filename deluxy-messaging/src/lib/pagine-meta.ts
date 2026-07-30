// Le Pagine Facebook e gli account Instagram collegati: quale marchio
// rappresentano e con quale token si risponde da ciascuno.
//
// È il gemello di `numeri-whatsapp.ts` per gli altri due canali Meta. Il webhook
// dice sempre a quale nostro account ha scritto il cliente
// (`entry[].messaging[].recipient.id`): qui quell'id si traduce nel nome del
// marchio, che è ciò che serve a chi risponde.
//
// ⚠️ Il collegamento account → marchio lo dichiara una persona: non si indovina.
// Un id numerico di quindici cifre non dice di chi è.

import { db } from './db'
import { decifra } from './crypto'
import { leggiImpostazioni } from './impostazioni'

export type CanaleMeta = 'messenger' | 'instagram'

export type PaginaCollegata = {
  id: string
  canale: string
  idPagina: string
  nome: string
  riferimento: string
  negozioId: string | null
  brand: string
  attivo: boolean
  /** Ha un token suo, o ripiega su quello generale delle Impostazioni? */
  tokenProprio: boolean
  /** Quando scade il token, se scade: i token dell API Instagram durano 60 giorni. */
  tokenScadeIl: Date | null
  /** Com e andato l ultimo rinnovo: vuoto = mai provato. */
  tokenEsito: string
}

/** Tutte le pagine e gli account collegati, col nome del marchio già risolto. */
export async function pagineCollegate(): Promise<PaginaCollegata[]> {
  const righe = await db.paginaMeta.findMany({
    include: { negozio: { select: { nome: true } } },
    orderBy: [{ canale: 'asc' }, { attivo: 'desc' }, { nome: 'asc' }],
  })
  return righe.map((p) => ({
    id: p.id,
    canale: p.canale,
    idPagina: p.idPagina,
    nome: p.nome,
    riferimento: p.riferimento,
    negozioId: p.negozioId,
    brand: p.negozio?.nome ?? '',
    attivo: p.attivo,
    tokenProprio: Boolean(p.token),
    tokenScadeIl: p.tokenScadeIl,
    tokenEsito: p.tokenEsito,
  }))
}

/**
 * Mappa `id account` → nome da mostrare in Inbox.
 *
 * La chiave è il solo id, non `canale:id`: si unisce senza attriti alla mappa
 * dei numeri WhatsApp, e gli id di Meta non si sovrappongono nei fatti. Si
 * preferisce il marchio all'etichetta: a chi risponde interessa sapere che
 * hanno scritto a «Cake Design», non che l'account si chiama «pagina 2».
 */
export async function brandPerPagina(): Promise<Map<string, string>> {
  const righe = await db.paginaMeta.findMany({
    include: { negozio: { select: { nome: true } } },
  })
  return new Map(
    righe.map((p) => [p.idPagina, p.negozio?.nome || p.nome || p.riferimento || p.idPagina])
  )
}

/**
 * Il token con cui rispondere da una certa pagina.
 *
 * ⚠️ Diversamente da WhatsApp, qui il ripiego sul token generale è davvero un
 * ripiego: ogni Pagina Facebook ha il suo Page Access Token, e quello di
 * un'altra pagina non fa partire il messaggio dalla pagina giusta. Resta perché
 * con UNA sola pagina collegata il token nelle Impostazioni basta e non ha senso
 * farlo riscrivere; con più pagine, ognuna deve avere il suo.
 */
export async function tokenPerPagina(canale: string, idPagina: string): Promise<string> {
  if (idPagina) {
    const p = await db.paginaMeta.findUnique({
      where: { canale_idPagina: { canale, idPagina } },
    })
    if (p?.token) {
      try {
        return decifra(p.token)
      } catch {
        // Token illeggibile (APP_SECRET cambiato): si prova col generale invece
        // di far fallire l'invio con un errore che non spiega niente.
      }
    }
  }
  const c = await leggiImpostazioni(['fbPageToken', 'igToken'])
  return (canale === 'instagram' ? c.igToken : c.fbPageToken) ?? ''
}
