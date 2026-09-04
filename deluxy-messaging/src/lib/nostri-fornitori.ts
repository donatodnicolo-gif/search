import { db } from './db'
import { chiaveNome, type LavoroDato } from './cerca-fornitore'
import { mestierePerFornitore, type Mestiere } from './fornitori-zona'
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
  /**
   * I paesi (ISO 2 lettere) in cui ha consegnato per noi.
   * ⚠️⚠️ È il segnale che salva il filtro: la provincia si ricava solo dai
   * capoluoghi (12 ordini su 49), ma il PAESE è scritto su ogni ordine. Chi ha
   * lavorato solo in Francia e in Germania, su una consegna in Italia, è
   * «altrove» per certo — senza doverne indovinare la provincia.
   */
  paesi: string[]
  /** I negozi degli ordini che ha preparato (Cake, FLowers, Deluxy). */
  negozi: string[]
  /**
   * Che mestiere fa, dedotto dal suo nome e dai negozi. `null` = non si sa —
   * e chi non si sa non si scarta.
   */
  mestiere: Mestiere | null
  /** Il numero dell'ultimo ordine che gli abbiamo dato: porta alla scheda. */
  ultimoOrdine: string
  /**
   * 3 = ha consegnato in QUESTA città · 2 = in questa provincia · 1 = altrove
   * PER CERTO · 0 = non lo sappiamo.
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
      paese: true,
      negozioNome: true,
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
        paesi: [],
        negozi: [],
        mestiere: null,
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
    const paese = (o.paese ?? '').trim().toUpperCase()
    if (paese && !v.paesi.includes(paese)) v.paesi.push(paese)
    const negozio = (o.negozioNome ?? '').trim()
    if (negozio && !v.negozi.includes(negozio)) v.negozi.push(negozio)
    per.set(k, v)
  }
  // ⚠️ Il mestiere si decide alla fine, quando di quel fornitore si sono viste
  // TUTTE le righe: deciderlo sul primo ordine vorrebbe dire deciderlo su un
  // negozio solo, e chi ha lavorato per Cake e per Flowers risulterebbe l'uno
  // o l'altro a seconda di quale ordine è arrivato per primo.
  for (const v of per.values()) v.mestiere = mestierePerFornitore(v.nome, v.negozi)
  return [...per.values()]
}

/**
 * Le province che mancavano, aggiunte a ogni fornitore.
 *
 * ⚠️⚠️ NASCE DALLA SEGNALAZIONE DEL 04/09/2026 (ordine #2867, consegna a
 * Genova): sotto «non si sa dove consegnano» comparivano fornitori che avevano
 * consegnato a Marnate, Galliate, Cadrezzate con Osmate — cioè in provincia di
 * Varese e di Novara, scritto lì accanto nella stessa riga. Non era un testo
 * sbagliato: `siglaProvincia` risponde solo sui capoluoghi, quindi di quei
 * comuni la provincia non si ricavava e il fornitore restava «ignoto» — e
 * l'ignoto, giustamente, non si scarta.
 *
 * Qui la provincia arriva **chiesta** (vedi `src/lib/comuni.ts`), non dedotta:
 * `mappa` è `comune minuscolo → sigla`, un comune assente resta ignoto.
 *
 * ⚠️ Da questo momento il segnale può anche ESCLUDERE, al contrario dei comuni
 * del registro Anagrafiche che potevano solo includere. È giusto che sia così
 * solo perché la risposta è un fatto letto da Google e non un'inferenza: se
 * arrivasse vuota, il fornitore torna ignoto e resta nell'elenco.
 */
export function conProvinceRicavate(
  elenco: NostroFornitore[],
  mappa: Record<string, string>
): NostroFornitore[] {
  if (!Object.keys(mappa).length) return elenco
  return elenco.map((f) => {
    const province = [...f.province]
    for (const c of f.citta) {
      const sigla = mappa[(c ?? '').trim().toLowerCase()] ?? ''
      if (sigla && !province.includes(sigla)) province.push(sigla)
    }
    return province.length === f.province.length ? f : { ...f, province }
  })
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
  provinciaConsegna: string,
  paeseConsegna = '',
  comuniDellaProvincia: string[] = []
): NostroFornitore[] {
  return [...elenco]
    .map((f) => ({
      ...f,
      ...quantoCentra(f, cittaConsegna, provinciaConsegna, paeseConsegna, comuniDellaProvincia),
    }))
    .sort(
      (a, b) =>
        b.vicinanza - a.vicinanza ||
        b.lavoro.ordini - a.lavoro.ordini ||
        (b.lavoro.ultimoIl ?? '').localeCompare(a.lavoro.ultimoIl ?? '')
    )
}

/** Come è finito l'elenco dei nostri, diviso per quello che sappiamo di ognuno. */
export type NostriPerConsegna = {
  /** Da mostrare: ha già consegnato in questa città o in questa provincia. */
  inZona: NostroFornitore[]
  /**
   * Lavora con noi, il mestiere torna, ma **dove consegna non lo sappiamo**:
   * la città c'è e non è un capoluogo, quindi la provincia non si ricava.
   * ⚠️ Non stanno insieme ai primi (non risulta che siano di qui) e non si
   * buttano (non risulta nemmeno il contrario): si mostrano se uno li chiede.
   */
  senzaLuogo: NostroFornitore[]
  /** Quanti sono stati tolti perché consegnano per certo da un'altra parte. */
  altrove: number
  /**
   * E CHI sono. ⚠️ Aggiunto il 04/09/2026: da quando la provincia si chiede a
   * Google (`src/lib/comuni.ts`) questo gruppo non è più quasi vuoto — su una
   * consegna a Genova ci finiscono i fornitori di Varese, Novara, Sassari. Un
   * numero da solo non si controlla: se il filtro sbaglia una riga, chi lavora
   * deve poterlo vedere e telefonare lo stesso. Si aprono con un clic.
   */
  altroveChi: NostroFornitore[]
  /** Quanti sono stati tolti perché fanno l'altro mestiere. */
  altroMestiere: number
}

/**
 * I NOSTRI fornitori che c'entrano con QUESTA consegna — filtrati, non solo
 * ordinati.
 *
 * ⚠️⚠️ NASCE DALLA SEGNALAZIONE DELL'UTENTE DEL 29/08/2026, su un ordine di
 * cioccolatini a Roma: «qui devono apparire solo quelli collegati a quella
 * provincia», «Bliss Cake è su Milano», «e poi due sono legati ai fiori».
 * L'elenco mostrava sei righe: un pasticcere di Milano, quattro fiorai e un
 * negozio di palloncini — cioè sei telefonate sbagliate su sei.
 *
 * ⚠️ Fino a ieri qui si ORDINAVA soltanto, apposta: filtrare avrebbe svuotato
 * l'elenco, perché la provincia si ricava solo dai capoluoghi. Quello che rende
 * il filtro possibile adesso sono due dati che c'erano e non si guardavano — il
 * **paese** della consegna e il **negozio** dell'ordine — e una regola: chi non
 * si sa dov'è **non si scarta**, si mette da parte (`senzaLuogo`).
 *
 * ⚠️ Il mestiere si applica solo quando lo si sa da tutte e due le parti: un
 * fornitore senza mestiere noto resta, e su un ordine senza mestiere noto
 * restano tutti. Un filtro che non sa non toglie niente.
 */
export function perQuestaConsegna(
  elenco: NostroFornitore[],
  dove: {
    citta: string
    provincia: string
    paese?: string
    mestiere?: Mestiere | null
    /**
     * I comuni che in quella provincia ci sono davvero, presi dal registro
     * Anagrafiche nella STESSA richiesta. ⚠️ È il pezzo che fa funzionare il
     * filtro sui comuni non capoluogo: «Valmontone» non si riconosce da sola,
     * ma se in provincia di RM il registro ha un fornitore a Valmontone,
     * allora Valmontone è in provincia di RM — e lo sappiamo senza indovinare.
     */
    comuni?: string[]
  }
): NostriPerConsegna {
  const mestiereChiesto = dove.mestiere ?? null
  const giusti = elenco.filter((f) => !mestiereChiesto || !f.mestiere || f.mestiere === mestiereChiesto)
  const messi = ordinaPerConsegna(giusti, dove.citta, dove.provincia, dove.paese ?? '', dove.comuni ?? [])
  return {
    inZona: messi.filter((f) => (f.vicinanza ?? 0) >= 2),
    senzaLuogo: messi.filter((f) => (f.vicinanza ?? 0) === 0),
    altrove: messi.filter((f) => f.vicinanza === 1).length,
    altroveChi: messi.filter((f) => f.vicinanza === 1),
    altroMestiere: elenco.length - giusti.length,
  }
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
 * ⚠️⚠️ E c'è un limite da sapere: la provincia si RICAVA dalla città di consegna
 * con `siglaProvincia`, che risponde solo quando è certa — cioè in pratica sui
 * capoluoghi. Misurato il 29/08/2026 sui dati veri: la provincia si ricava da
 * **12 ordini su 49**, e l'indirizzo — che l'avrebbe detta — qui non c'è
 * (resta in Orders, per non tenerne due copie). Quindi «ha lavorato in questa
 * zona» è per forza **sottostimato**.
 *
 * ⚠️⚠️ **CORREZIONE DEL 29/08/2026, e non è un dettaglio.** Prima bastava avere
 * una città qualunque per essere dichiarato «altrove»:
 *
 *     if (f.province.length || f.citta.length) return 1   // ← diceva il falso
 *
 * Chi ha consegnato solo a **Valmontone** finiva «altrove» su un ordine a
 * **Roma**, e Valmontone è in provincia di Roma. Finché l'elenco ordinava
 * soltanto, la bugia costava una posizione; da quando **filtra**, costa la
 * riga. Adesso «altrove» si dice solo quando lo si sa davvero:
 *
 *  · si è ricavata almeno una sua provincia e nessuna è questa; oppure
 *  · ha consegnato **solo all'estero** e questa consegna è in un altro paese.
 *
 * Il paese è il dato che rende il filtro possibile: sta su ogni ordine, non
 * richiede di indovinare niente, e da solo riconosce i mezzi elenchi di
 * Cannes, Algiers, Toronto, Ludwigsburg, Budens.
 */
export function quantoCentra(
  f: NostroFornitore,
  cittaConsegna: string,
  provinciaConsegna: string,
  paeseConsegna = '',
  comuniDellaProvincia: string[] = []
): { vicinanza: 0 | 1 | 2 | 3; inZona: boolean } {
  const citta = (cittaConsegna ?? '').trim().toLowerCase()
  const sigla = siglaProvincia(provinciaConsegna || cittaConsegna)
  if (citta && f.citta.some((c) => c.toLowerCase() === citta)) return { vicinanza: 3, inZona: true }
  if (sigla && f.province.includes(sigla)) return { vicinanza: 2, inZona: true }
  // ⚠️⚠️ I comuni NON capoluogo, che `siglaProvincia` non sa riconoscere: se il
  // registro Anagrafiche ha un fornitore di questa provincia a Valmontone,
  // allora Valmontone è in questa provincia — è un fatto letto, non dedotto.
  // ⚠️ Vale solo per INCLUDERE: non trovare il comune nell'elenco del registro
  // non prova niente (il registro non è un elenco di comuni), quindi non fa mai
  // dire «altrove». Un segnale che può solo aggiungere non può nascondere.
  const comuni = new Set(comuniDellaProvincia.map((c) => (c ?? '').trim().toLowerCase()).filter(Boolean))
  if (comuni.size && f.citta.some((c) => comuni.has(c.trim().toLowerCase()))) {
    return { vicinanza: 2, inZona: true }
  }
  // ⚠️ 1 = «di lui sappiamo dove consegna, e NON è qui». Due prove sole.
  if (f.province.length) return { vicinanza: 1, inZona: false }
  const paese = (paeseConsegna ?? '').trim().toUpperCase()
  if (paese && f.paesi.length && !f.paesi.includes(paese)) return { vicinanza: 1, inZona: false }
  // ⚠️ 0 = «non lo sappiamo»: o non ha nessuna città sui suoi ordini, o le ha e
  // sono comuni di cui non si ricava la provincia. Non è «altrove», e trattarlo
  // come tale toglierebbe dall'elenco proprio il fornitore giusto.
  return { vicinanza: 0, inZona: false }
}
