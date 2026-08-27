import { db } from './db'
import { chiaveNome, type LavoroDato } from './cerca-fornitore'
import { siglaProvincia } from './province'

// CHI HA GIÀ PREPARATO ORDINI PER NOI — presi dai NOSTRI ordini, non dal registro.
//
// ⚠️⚠️ Nasce da una segnalazione dell'utente (25/08/2026) sull'ordine **#2798**:
// «non vedo passiflora tra i fornitori», mentre Passiflora quell'ordine
// l'aveva preparato davvero. Misurato, i motivi erano due e nessuno dei due si
// vedeva a schermo:
//
//  1. nel registro Anagrafiche Passiflora **non ha città né provincia** (come
//     tutti e 15 i fornitori entrati pagandoli), e l'elenco «fornitori in zona»
//     filtra per provincia: chi non ce l'ha è invisibile;
//  2. ha `categoria: ALTRO`, e quell'elenco tiene solo FIORISTA e PASTICCERIA —
//     dal nome dell'intestatario di un conto il mestiere non si deduce.
//
// Quindi la lista prometteva «prima quelli con cui lavoriamo già» e mostrava
// esattamente il contrario: i censiti sì, i nostri no.
//
// ⚠️ Qui non si scrive niente nel registro e non si deduce nessun indirizzo:
// si dice un fatto che è **nostro** — «questo fornitore ha preparato N ordini
// per noi, consegnati in queste città». Dove abbia il negozio resta una cosa che
// non sappiamo, e continua a non essere scritta da nessuna parte.

export type NostroFornitore = {
  nome: string
  lavoro: LavoroDato
  /** Le città in cui sono state consegnate le sue preparazioni (le nostre, non la sua). */
  citta: string[]
  /** Le sigle di provincia ricavate da quelle città, quando si ricavano. */
  province: string[]
  /** Il numero dell'ultimo ordine che gli abbiamo dato: porta alla scheda. */
  ultimoOrdine: string
  /**
   * 3 = ha consegnato in QUESTA città · 2 = in questa provincia · 1 = altrove
   * · 0 = non lo sappiamo (nessuna città sui suoi ordini).
   * ⚠️ Lo riempie `ordinaPerConsegna`: sull'elenco crudo non c'è, perché
   * dipende dalla consegna che si sta guardando.
   */
  vicinanza?: 0 | 1 | 2 | 3
  /** Ha già consegnato in questa zona? ⚠️ Sottostimato: vedi `quantoCentra`. */
  inZona?: boolean
}

/**
 * Tutti i fornitori che risultano dai nostri ordini.
 *
 * ⚠️ Una query sola. Il tetto è alto ma c'è: questo elenco finisce dentro la
 * scheda di un ordine, e una scheda che carica diecimila righe non si apre.
 */
export async function nostriFornitori(): Promise<NostroFornitore[]> {
  const ordini = await db.ordine.findMany({
    where: { fornitoreNome: { not: '' } },
    select: {
      numero: true,
      fornitoreNome: true,
      fornitoreCosto: true,
      fornitoreIl: true,
      citta: true,
      data: true,
    },
    orderBy: { data: 'desc' },
    take: 2000,
  })

  const per = new Map<string, NostroFornitore>()
  for (const o of ordini) {
    const k = chiaveNome(o.fornitoreNome)
    if (!k) continue
    const v =
      per.get(k) ??
      ({
        nome: o.fornitoreNome.trim(),
        lavoro: { ordini: 0, costo: 0, senzaCosto: 0, ultimoIl: null },
        citta: [],
        province: [],
        // Gli ordini arrivano dal più recente: il primo che si vede è l'ultimo.
        ultimoOrdine: o.numero,
      } satisfies NostroFornitore)
    v.lavoro.ordini++
    // ⚠️ Un ordine senza costo scritto NON vale zero: si conta a parte, come
    // ovunque nel resto dell'app.
    if (typeof o.fornitoreCosto === 'number') v.lavoro.costo += o.fornitoreCosto
    else v.lavoro.senzaCosto++
    const quando = (o.fornitoreIl ?? o.data)?.toISOString() ?? null
    if (quando && (!v.lavoro.ultimoIl || quando > v.lavoro.ultimoIl)) v.lavoro.ultimoIl = quando
    const citta = (o.citta ?? '').trim()
    if (citta && !v.citta.includes(citta)) v.citta.push(citta)
    const sigla = siglaProvincia(citta)
    if (sigla && !v.province.includes(sigla)) v.province.push(sigla)
    per.set(k, v)
  }
  return [...per.values()]
}

/**
 * I nostri fornitori, messi nell'ordine giusto per QUESTA consegna.
 *
 * ⚠️⚠️ L'ordine è la decisione: davanti a una consegna di domani si scrive ai
 * primi due o tre. Prima chi ha già preparato qualcosa **per quella città**, poi
 * chi l'ha fatto **in quella provincia**, poi chi ha lavorato di più con noi.
 *
 * ⚠️ Le città sono quelle di CONSEGNA, non l'indirizzo del fornitore: un fioraio
 * che ha consegnato due volte a Mijas quasi certamente lavora lì — ma
 * «quasi certamente» resta un fatto sui nostri ordini, e come tale si scrive a
 * schermo. Nel registro non finisce niente.
 */
export function ordinaPerConsegna(
  elenco: NostroFornitore[],
  cittaConsegna: string,
  provinciaConsegna: string
): NostroFornitore[] {
  return [...elenco]
    .map((f) => ({ ...f, ...quantoCentra(f, cittaConsegna, provinciaConsegna) }))
    .sort(
      (a, b) =>
        b.vicinanza - a.vicinanza ||
        b.lavoro.ordini - a.lavoro.ordini ||
        (b.lavoro.ultimoIl ?? '').localeCompare(a.lavoro.ultimoIl ?? '')
    )
}

/**
 * QUANTO C'ENTRA questo fornitore con la consegna che si sta guardando.
 *
 * ⚠️⚠️ NASCE DA UNA SEGNALAZIONE (27/08/2026): il pannello si intitola
 * «Fornitori in provincia di VI» e sotto elencava gente che consegna a Cannes,
 * Tricesimo, Bosa, Macerata Campania e Algiers. Non era un difetto del filtro:
 * **il filtro non c'è**. Questa lista non restringe alla provincia, **ordina** —
 * e quando nessuno ha lavorato in quella zona tutti pareggiano, quindi si vedono
 * i sei più recenti, che sono ovunque. Misurato: **zero su 22** ha mai preparato
 * una consegna in provincia di VI.
 *
 * ⚠️ Filtrare per davvero sarebbe peggio: l'elenco sarebbe **vuoto quasi
 * sempre**, e la cosa utile — «in quella zona non abbiamo nessuno, ma questi
 * lavorano con noi, prova a chiederglielo» — sparirebbe. La correzione giusta
 * non è togliere righe: è **dire la verità su ogni riga**, e dirlo prima
 * dell'elenco quando la verità è «nessuno».
 *
 * ⚠️⚠️ E c'è un limite da sapere: la provincia si RICAVA dalla città di consegna
 * con `siglaProvincia`, che risponde solo quando è certa — cioè in pratica sui
 * capoluoghi. Misurato: **18 fornitori su 22 non danno nessuna provincia**
 * (Cannes, Tricesimo, Mijas, Algiers, Toronto, Giarre…). Quindi «ha lavorato in
 * questa zona» è per forza **sottostimato**, e questa funzione lo dichiara con
 * `vicinanza: 0` invece di far finta che 1 voglia dire «altrove».
 */
export function quantoCentra(
  f: NostroFornitore,
  cittaConsegna: string,
  provinciaConsegna: string
): { vicinanza: 0 | 1 | 2 | 3; inZona: boolean } {
  const citta = (cittaConsegna ?? '').trim().toLowerCase()
  const sigla = siglaProvincia(provinciaConsegna || cittaConsegna)
  if (citta && f.citta.some((c) => c.toLowerCase() === citta)) return { vicinanza: 3, inZona: true }
  if (sigla && f.province.includes(sigla)) return { vicinanza: 2, inZona: true }
  // ⚠️ 1 = «di lui sappiamo dove ha consegnato, e non è qui».
  if (f.province.length || f.citta.length) return { vicinanza: 1, inZona: false }
  // ⚠️ 0 = «non lo sappiamo affatto»: nessuna città sui suoi ordini. Non è la
  // stessa cosa di «altrove», e metterli insieme direbbe una cosa non vera.
  return { vicinanza: 0, inZona: false }
}
