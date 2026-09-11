import { db } from './db'
import { leggiOrario, type OrarioNegozioDati } from './orari-regole'

// ⭐ ORARI NEGOZI — la parte che legge e scrive la tabella (10/09/2026).
// Le regole (validazione, «questa data si può scegliere?») stanno in
// orari-regole.ts, che non importa il server: qui solo il database.

export type OrarioDiNegozio = {
  negozio: { id: string; nome: string; dominio: string; attivo: boolean }
  orario: OrarioNegozioDati
  /** C'è una riga scritta da qualcuno, o vale il predefinito? */
  configurato: boolean
  modificatoDa: string | null
  aggiornatoIl: Date | null
}

/** Tutti i negozi, ognuno col suo orario (o il predefinito, e lo si dice). */
export async function orariDeiNegozi(): Promise<OrarioDiNegozio[]> {
  const negozi = await db.negozioShopify.findMany({
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, dominio: true, attivo: true, orario: true },
  })
  return negozi.map((n) => ({
    negozio: { id: n.id, nome: n.nome, dominio: n.dominio, attivo: n.attivo },
    orario: leggiOrario(n.orario),
    configurato: Boolean(n.orario),
    modificatoDa: n.orario?.modificatoDa ?? null,
    aggiornatoIl: n.orario?.aggiornatoIl ?? null,
  }))
}

/**
 * L'orario di UN negozio. Il negozio senza riga usa il predefinito: chi chiama
 * non deve distinguere i due casi per decidere se una data va bene.
 */
export async function orarioDelNegozio(negozioId: string): Promise<OrarioNegozioDati> {
  const riga = await db.orarioNegozio.findUnique({ where: { negozioId } })
  return leggiOrario(riga)
}

/**
 * L'orario SCRITTO per un negozio, o null se nessuno l'ha ancora impostato.
 *
 * ⚠️ È questa che usa chi deve DECIDERE (creaOrdine): senza riga non c'è nessuna
 * regola da applicare, e una data non si rifiuta in nome di un default.
 */
export async function orarioConfigurato(negozioId: string): Promise<OrarioNegozioDati | null> {
  const riga = await db.orarioNegozio.findUnique({ where: { negozioId } })
  return riga ? leggiOrario(riga) : null
}

/** Scrive (o riscrive) l'orario di un negozio: i dati arrivano già validati da `validaOrario`. */
export async function salvaOrario(negozioId: string, dati: OrarioNegozioDati, chi: string | null) {
  const campi = {
    giorniApertura: dati.giorniApertura.join(','),
    regole: JSON.stringify(dati.regole),
    giorniChiusura: JSON.stringify(dati.giorniChiusura),
    // ⭐ I giorni con fasce speciali (11/09/2026) vivono nella colonna `fasce`,
    // libera dal 10/09 sera: senza `testo`, che è solo del modulo.
    fasce: JSON.stringify((dati.giorniSpeciali ?? []).map((g) => ({ data: g.data, ogniAnno: g.ogniAnno, fasce: g.fasce }))),
    nota: dati.nota,
    modificatoDa: chi,
  }
  return db.orarioNegozio.upsert({
    where: { negozioId },
    create: { negozioId, ...campi },
    update: campi,
  })
}

/** Torna al predefinito: la riga si cancella (non si scrive una copia del predefinito). */
export async function azzeraOrario(negozioId: string) {
  await db.orarioNegozio.deleteMany({ where: { negozioId } })
}
