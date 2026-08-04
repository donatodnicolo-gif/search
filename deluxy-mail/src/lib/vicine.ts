import { db } from './db'
import { accountAttivoId } from './accountAttivo'

/** La mail prima e quella dopo, nell'elenco da cui sei arrivato. */
export type Vicine = { precedente: string | null; successivo: string | null }

type Corrente = {
  id: string
  data: Date
  direzione: string
  sezioneId: string | null
  archiviato: boolean
  cestinato: boolean
}

/**
 * Le due mail confinanti: **precedente** è quella SOPRA nell'elenco (più
 * recente), **successiva** quella SOTTO (più vecchia) — l'elenco è ordinato per
 * data decrescente.
 *
 * ⚠️ Si resta nella stessa lista in cui si stava: stessa direzione (in arrivo /
 * inviata), stessa sezione, stesso stato di archiviazione o cestino della mail
 * aperta, e stessa casella se ne stai guardando una sola. Aprire una mail
 * archiviata e finire nella posta in arrivo sarebbe un salto senza ritorno: si
 * perde il segno di dove si era.
 *
 * ⚠️ Si cammina fra i MESSAGGI, non fra le conversazioni: due mail dello stesso
 * scambio sono due passi. È la stessa regola che vale già dopo `Canc` in
 * `smaltisciEProssimo` — sono lo stesso movimento, e due regole diverse per
 * «la prossima» sarebbero peggio di una imperfetta.
 */
export async function mailVicine(utenteId: string, m: Corrente): Promise<Vicine> {
  const attivo = await accountAttivoId(utenteId)
  // Fuori da una sezione si esclude lo SPAM, come fa la posta in arrivo:
  // altrimenti scorrendo si finisce nella posta indesiderata senza volerlo.
  const spam = m.sezioneId
    ? null
    : await db.sezione.findFirst({ where: { utenteId, nome: 'SPAM' }, select: { id: true } })

  const stessaLista = {
    utenteId,
    direzione: m.direzione,
    archiviato: m.archiviato,
    cestinato: m.cestinato,
    id: { not: m.id },
    ...(attivo ? { accountId: attivo } : {}),
    ...(m.sezioneId
      ? { sezioneId: m.sezioneId }
      : spam
        ? { OR: [{ sezioneId: null }, { sezioneId: { not: spam.id } }] }
        : {}),
  }

  const [precedente, successivo] = await Promise.all([
    db.messaggio.findFirst({
      where: { ...stessaLista, data: { gt: m.data } },
      orderBy: { data: 'asc' },
      select: { id: true },
    }),
    db.messaggio.findFirst({
      where: { ...stessaLista, data: { lt: m.data } },
      orderBy: { data: 'desc' },
      select: { id: true },
    }),
  ])

  return { precedente: precedente?.id ?? null, successivo: successivo?.id ?? null }
}
