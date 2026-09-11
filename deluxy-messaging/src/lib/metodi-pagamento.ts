import { db } from '@/lib/db'
import { comeNasceValido, quandoValido, type Metodo } from '@/lib/metodi-regole'

/**
 * ⭐ 11/09/2026 — I METODI DI PAGAMENTO, letti dal database.
 *
 * Le REGOLE (che cos'è una specifica, come si valida, come si racconta) stanno
 * in `metodi-regole.ts`, che non tocca il database perché lo importa anche la
 * schermata. Qui c'è solo la lettura.
 */

type RigaDb = {
  id: string
  nome: string
  attivo: boolean
  posizione: number
  negozioId: string | null
  comeNasce: string
  quandoDovuto: string
  istruzioni: string
  notaConsegna: string
  attributo: string
}

function daRiga(r: RigaDb): Metodo {
  return { ...r, comeNasce: comeNasceValido(r.comeNasce), quandoDovuto: quandoValido(r.quandoDovuto) }
}

const SELECT = {
  id: true,
  nome: true,
  attivo: true,
  posizione: true,
  negozioId: true,
  comeNasce: true,
  quandoDovuto: true,
  istruzioni: true,
  notaConsegna: true,
  attributo: true,
} as const

/**
 * I metodi che si possono scegliere ADESSO su questo negozio: gli accesi, più
 * quelli che valgono per tutti (`negozioId` vuoto).
 *
 * ⚠️ Senza negozio si torna tutto l'acceso: serve alle altre app, che chiedono
 * prima di sapere su quale negozio nascerà l'ordine.
 */
export async function metodiDisponibili(negozioId?: string): Promise<Metodo[]> {
  const righe = await db.metodoPagamento.findMany({
    where: {
      attivo: true,
      ...(negozioId ? { OR: [{ negozioId: null }, { negozioId }] } : {}),
    },
    orderBy: [{ posizione: 'asc' }, { nome: 'asc' }],
    select: SELECT,
  })
  return righe.map(daRiga)
}

/** Tutti, spenti compresi: è l'elenco di Impostazioni. */
export async function metodiTutti(): Promise<Metodo[]> {
  const righe = await db.metodoPagamento.findMany({
    orderBy: [{ posizione: 'asc' }, { nome: 'asc' }],
    select: SELECT,
  })
  return righe.map(daRiga)
}

/**
 * Il metodo scelto per un ordine, riletto dal database.
 *
 * ⚠️⚠️ Si RILEGGE, non si prende dal modulo: le specifiche decidono se l'ordine
 * nasce pagato, e una specifica che arriva dal browser è una specifica che
 * chiunque può riscrivere. Dal browser arriva solo l'id.
 * ⚠️ Uno spento non si serve più: se qualcuno teneva la pagina aperta da
 * stamattina, l'ordine non deve nascere con una regola ritirata.
 */
export async function metodoPerOrdine(id: string): Promise<Metodo | null> {
  if (!id.trim()) return null
  const r = await db.metodoPagamento.findFirst({ where: { id: id.trim(), attivo: true }, select: SELECT })
  return r ? daRiga(r) : null
}
