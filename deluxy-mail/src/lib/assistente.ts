import { db } from './db'
import { triageLotto, sintetizzaPeriodo, type SchedaTriage } from './ai'
import { CHIAVI, leggiImpostazioni } from './impostazioni'
import { CODICI_PRIORITA } from './format'

export type Periodo = 'oggi' | 'settimana' | 'mese'

// Il tetto scelto: fino a ~200 messaggi più recenti per giro. Oggi non ci
// arriva quasi mai; il mese, se pesante, lo lavori in più passate.
const TETTO: Record<Periodo, number> = { oggi: 100, settimana: 200, mese: 200 }

// Quante mail per chiamata di triage: 20 mail corte stanno larghe in una
// richiesta, e trasformano 200 messaggi in ~10 chiamate invece di 200.
const PER_LOTTO = 20

export function periodoValido(p: string | undefined): Periodo {
  return p === 'settimana' || p === 'mese' ? p : 'oggi'
}

export function etichettaPeriodo(p: Periodo): string {
  return p === 'oggi' ? 'oggi' : p === 'settimana' ? 'questa settimana' : 'questo mese'
}

/** L'inizio del periodo: mezzanotte di oggi, 7 giorni fa, 30 giorni fa. */
function inizioPeriodo(p: Periodo, ora: Date): Date {
  const d = new Date(ora)
  d.setHours(0, 0, 0, 0)
  if (p === 'settimana') d.setDate(d.getDate() - 6)
  if (p === 'mese') d.setDate(d.getDate() - 29)
  return d
}

/** I messaggi che l'Assistente guarderebbe: posta ricevuta del periodo, non
 *  ancora archiviata né cestinata. */
function filtro(p: Periodo, ora: Date) {
  return {
    direzione: 'entrata',
    cestinato: false,
    archiviato: false,
    data: { gte: inizioPeriodo(p, ora) },
  }
}

/** Quanti messaggi ci sono nel periodo, per la conferma prima di spendere. */
export async function contaPeriodo(p: Periodo, ora: Date): Promise<{ totale: number; daLavorare: number }> {
  const totale = await db.messaggio.count({ where: filtro(p, ora) })
  return { totale, daLavorare: Math.min(totale, TETTO[p]) }
}

/**
 * Un giro dell'Assistente su un periodo.
 *
 * map-reduce: triage a lotti (ogni mail classificata in poche parole) →
 * sintesi (il quadro del periodo dalle classificazioni). Da qui nascono le
 * attività, con il link alla mail così "Esegui" sa a chi rispondere, e le
 * proposte di archiviazione, che restano da spuntare — niente si archivia da
 * solo.
 */
export async function eseguiAssistente(
  p: Periodo,
  ora: Date
): Promise<{ ok: boolean; messaggio: string; rapportoId?: string }> {
  const messaggi = await db.messaggio.findMany({
    where: filtro(p, ora),
    orderBy: { data: 'desc' },
    take: TETTO[p],
    select: { id: true, mittente: true, mittenteNome: true, oggetto: true, corpoTesto: true },
  })

  if (messaggi.length === 0) {
    return { ok: false, messaggio: `Nessun messaggio da leggere ${etichettaPeriodo(p)}.` }
  }

  const totale = await db.messaggio.count({ where: filtro(p, ora) })
  const impostazioni = await leggiImpostazioni()

  try {
    // --- Fase 1: triage a lotti ---
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
      // La scheda n=1 è il primo messaggio del lotto, e così via: si riaggancia
      // per posizione, non fidandosi che il modello inventi un id.
      for (const s of risultato) {
        const m = lotto[s.n - 1]
        if (m) schede.push({ ...s, messaggioId: m.id })
      }
    }

    // --- Fase 2: sintesi ---
    const conAzione = schede.filter((s) => s.azione).length
    const archiviabili = schede.filter((s) => s.archiviabile).length
    const riassunto = await sintetizzaPeriodo({
      periodo: etichettaPeriodo(p),
      righe: schede.map((s) => s.riga).filter(Boolean),
      conAzione,
      archiviabili,
      oggi: ora,
    })

    // --- Salvataggio ---
    const rapporto = await db.rapportoAI.create({
      data: {
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
          data: {
            rapportoId: rapporto.id,
            messaggioId: s.messaggioId,
            motivo: s.motivoArchivio || 'Non richiede attenzione',
          },
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
