import { db } from './db'
import { triageLotto, sintetizzaPeriodo, type SchedaTriage } from './ai'
import { CHIAVI, leggiImpostazioni } from './impostazioni'
import { CODICI_PRIORITA } from './format'

export type Periodo = 'oggi' | 'settimana' | 'mese'

const TETTO: Record<Periodo, number> = { oggi: 100, settimana: 200, mese: 200 }
const PER_LOTTO = 20

export function periodoValido(p: string | undefined): Periodo {
  return p === 'settimana' || p === 'mese' ? p : 'oggi'
}

export function etichettaPeriodo(p: Periodo): string {
  return p === 'oggi' ? 'oggi' : p === 'settimana' ? 'questa settimana' : 'questo mese'
}

function inizioPeriodo(p: Periodo, ora: Date): Date {
  const d = new Date(ora)
  d.setHours(0, 0, 0, 0)
  if (p === 'settimana') d.setDate(d.getDate() - 6)
  if (p === 'mese') d.setDate(d.getDate() - 29)
  return d
}

function filtro(utenteId: string, p: Periodo, ora: Date) {
  return {
    utenteId,
    direzione: 'entrata',
    cestinato: false,
    archiviato: false,
    data: { gte: inizioPeriodo(p, ora) },
  }
}

export async function contaPeriodo(
  utenteId: string,
  p: Periodo,
  ora: Date
): Promise<{ totale: number; daLavorare: number }> {
  const totale = await db.messaggio.count({ where: filtro(utenteId, p, ora) })
  return { totale, daLavorare: Math.min(totale, TETTO[p]) }
}

export async function eseguiAssistente(
  utenteId: string,
  p: Periodo,
  ora: Date
): Promise<{ ok: boolean; messaggio: string; rapportoId?: string }> {
  const messaggi = await db.messaggio.findMany({
    where: filtro(utenteId, p, ora),
    orderBy: { data: 'desc' },
    take: TETTO[p],
    select: { id: true, mittente: true, mittenteNome: true, oggetto: true, corpoTesto: true },
  })

  if (messaggi.length === 0) {
    return { ok: false, messaggio: `Nessun messaggio da leggere ${etichettaPeriodo(p)}.` }
  }

  const totale = await db.messaggio.count({ where: filtro(utenteId, p, ora) })
  const impostazioni = await leggiImpostazioni()

  try {
    const schede: (SchedaTriage & { messaggioId: string })[] = []
    for (let i = 0; i < messaggi.length; i += PER_LOTTO) {
      const lotto = messaggi.slice(i, i + PER_LOTTO)
      const risultato = await triageLotto({
        messaggi: lotto.map((m, j) => ({
          n: j + 1,
          mittente: m.mittente,
          mittenteNome: m.mittenteNome,
          oggetto: m.oggetto,
          corpo: m.corpoTesto,
        })),
        contestoAzienda: impostazioni[CHIAVI.contestoAzienda],
        oggi: ora,
      })
      for (const s of risultato) {
        const m = lotto[s.n - 1]
        if (m) schede.push({ ...s, messaggioId: m.id })
      }
    }

    const conAzione = schede.filter((s) => s.azione).length
    const archiviabili = schede.filter((s) => s.archiviabile).length
    const riassunto = await sintetizzaPeriodo({
      periodo: etichettaPeriodo(p),
      righe: schede.map((s) => s.riga).filter(Boolean),
      conAzione,
      archiviabili,
      oggi: ora,
    })

    const rapporto = await db.rapportoAI.create({
      data: {
        utenteId,
        periodo: p,
        riassunto,
        messaggiVisti: messaggi.length,
        troncato: totale > messaggi.length,
        attivitaCreate: conAzione,
      },
    })

    for (const s of schede) {
      if (s.azione) {
        await db.attivita.create({
          data: {
            utenteId,
            messaggioId: s.messaggioId,
            rapportoId: rapporto.id,
            titolo: s.azione.titolo,
            dettaglio: s.azione.dettaglio || null,
            scadenza: s.azione.scadenza ? new Date(s.azione.scadenza) : null,
            priorita: CODICI_PRIORITA.includes(s.azione.priorita as never) ? s.azione.priorita : 'P2',
          },
        })
      }
      if (s.archiviabile) {
        await db.propostaArchivio.create({
          data: { rapportoId: rapporto.id, messaggioId: s.messaggioId, motivo: s.motivoArchivio || 'Non richiede attenzione' },
        })
      }
    }

    return { ok: true, messaggio: 'Fatto.', rapportoId: rapporto.id }
  } catch (e) {
    return {
      ok: false,
      messaggio:
        e instanceof Error && (e.message.includes('429') || e.message.includes('quota'))
          ? 'Credito OpenAI esaurito: caricalo e riprova.'
          : e instanceof Error
            ? e.message
            : 'Errore imprevisto',
    }
  }
}
