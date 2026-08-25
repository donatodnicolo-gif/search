import { db } from './db'
import { chiaveNome, type LavoroDato } from './cerca-fornitore'

// QUANTO LAVORO ABBIAMO GIÀ DATO A UN FORNITORE.
//
// ⚠️⚠️ Il dato c'era e non si vedeva: il costo concordato sta sull'ordine
// (`Ordine.fornitoreCosto`) da quando esiste il riquadro «chi prepara
// quest'ordine», ma nessuna schermata lo sommava. Alla domanda «quanto lavoro
// diamo a questo fornitore?» — che è quella che si fa scegliendo a chi
// telefonare, e quella con cui si tratta un prezzo — non si poteva rispondere.
//
// ⚠️ Si conta SUGLI ORDINI e non sui pagamenti: l'ordine è il lavoro dato, il
// pagamento è la sua conseguenza (e può arrivare giorni dopo, o non arrivare).
// L'economia dell'ordine resta di Deluxy Orders: qui non si ricopia niente, si
// somma quello che questa app già possiede — chi prepara e a quanto.
//
// ⚠️ Una sola query aggregata, non una per fornitore: la lista dei fornitori in
// zona ne mostra decine, e venti giri sul database per venti righe si vedono.

/**
 * Quanto lavoro abbiamo dato, per ogni fornitore che conosciamo.
 *
 * La chiave della mappa è `chiaveNome(nome)`: lo stesso fornitore è scritto in
 * modi diversi su ordini diversi («SO'FLEUR» e «So Fleur») e contarli come due
 * direbbe metà del vero.
 */
export async function lavoroPerFornitore(): Promise<Map<string, LavoroDato>> {
  const righe = await db.ordine.groupBy({
    by: ['fornitoreNome'],
    where: { fornitoreNome: { not: '' } },
    // `_all` = tutti gli ordini; `fornitoreCosto` = solo quelli che un costo ce
    // l'hanno. La differenza è il numero di ordini di cui non sappiamo il
    // valore, e va DETTA: vedi sotto.
    _count: { _all: true, fornitoreCosto: true },
    _sum: { fornitoreCosto: true },
    _max: { fornitoreIl: true },
  })

  const per = new Map<string, LavoroDato>()
  for (const r of righe) {
    const k = chiaveNome(r.fornitoreNome)
    if (!k) continue
    const prec = per.get(k)
    const v: LavoroDato = {
      ordini: (prec?.ordini ?? 0) + r._count._all,
      // ⚠️⚠️ Il totale è la somma dei costi SCRITTI. Un ordine senza costo non
      // vale zero: vale «non lo so», e sommarlo come zero farebbe leggere
      // «gli abbiamo dato 210 €» a chi ne ha ricevuti molti di più. Per questo
      // gli ordini muti si contano a parte e si dicono.
      costo: (prec?.costo ?? 0) + (r._sum.fornitoreCosto ?? 0),
      senzaCosto: (prec?.senzaCosto ?? 0) + (r._count._all - r._count.fornitoreCosto),
      ultimoIl: piuRecente(prec?.ultimoIl ?? null, r._max.fornitoreIl?.toISOString() ?? null),
    }
    per.set(k, v)
  }
  return per
}

function piuRecente(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}
