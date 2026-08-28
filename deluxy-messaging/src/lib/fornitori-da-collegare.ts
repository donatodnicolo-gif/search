import { db } from './db'
import { chiaveNome } from './cerca-fornitore'
import { segnalaFornitorePagatoAlRegistro } from './registro-fornitori'

// I FORNITORI PAGATI CHE IL REGISTRO NON SA CHI SONO.
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «proponi alla riconciliazione». Il
// caso è questo: a ogni pagamento l'app chiede al registro Anagrafiche chi è
// quel fornitore. Quasi sempre lo aggancia. Ma qualche volta risponde
// **«somiglia a più anagrafiche»**, e allora noi **non scriviamo di proposito**
// — creare a caso vuol dire fabbricare un doppione dentro il golden record di
// tutte le app.
//
// ⚠️ Fin qui è giusto. Il difetto era che **da qui non lo sapeva nessuno**:
// l'esito di quella chiamata tornava al browser di chi stava salvando e finiva
// lì. Misurato il 27/08/2026 su 26 fornitori pagati: 24 in registro, 0
// mancanti, **2 ambigui e fermi** — Battistella fioreria srl e Paradis des
// fleurs — senza una riga, un conteggio o un posto dove andarli a cercare.
//
// ⚠️ Perché in Riconciliazione e non in una pagina sua: è la schermata che in
// quest'app **propone e fa confermare a una persona**. Un fornitore che il
// registro non riesce a riconoscere è esattamente quel tipo di lavoro.

export type FornitoreDaCollegare = {
  /** `chiaveNome` dell'intestatario: lo stesso nome scritto in modi diversi. */
  chiave: string
  nome: string
  /** Quanto gli abbiamo pagato in tutto, e su quanti pagamenti. */
  totale: number
  valuta: string
  pagamenti: number
  /** L'id di una sua richiesta: serve al ricontrollo. */
  richiestaId: string
  /** `ambiguo` · `errore` · `non-configurato` · `senza-nome` · '' = mai provato. */
  esito: string
  messaggio: string
  /** Quando si è provato l'ultima volta. */
  provatoIl: string | null
  /** I numeri d'ordine toccati: aiutano a riconoscerlo nella pagina Match. */
  ordini: string[]
}

/**
 * Quelli da proporre: chi non è finito nel registro, e chi non si è mai provato.
 *
 * ⚠️ Le righe più vecchie hanno `registroEsito` vuoto perché la colonna è nata
 * dopo di loro ([[trappola-correzione-non-retroattiva]]): non vuol dire «va
 * tutto bene», vuol dire «non lo sappiamo». Si mostrano come tali, con il
 * bottone per chiederlo — e non si finge che siano a posto.
 */
export async function fornitoriDaCollegare(): Promise<FornitoreDaCollegare[]> {
  const righe = await db.richiestaPagamento.findMany({
    where: {
      pagataIl: { not: null },
      intestatario: { not: '' },
      // ⚠️ Si escludono solo i due esiti che vogliono dire «è andata»: tutto il
      // resto — ambiguo, errore, mai provato — è roba che qualcuno deve
      // guardare, e metterli insieme sarebbe dire che sono la stessa cosa.
      registroEsito: { notIn: ['creato', 'aggiornato'] },
    },
    select: {
      id: true,
      intestatario: true,
      importo: true,
      valuta: true,
      ordineNumero: true,
      registroEsito: true,
      registroMessaggio: true,
      registroIl: true,
      pagataIl: true,
    },
    orderBy: { pagataIl: 'desc' },
    take: 200,
  })

  const per = new Map<string, FornitoreDaCollegare>()
  for (const r of righe) {
    const k = chiaveNome(r.intestatario)
    if (!k) continue
    const f =
      per.get(k) ??
      ({
        chiave: k,
        nome: r.intestatario.trim(),
        totale: 0,
        valuta: r.valuta || 'EUR',
        pagamenti: 0,
        richiestaId: r.id,
        esito: r.registroEsito,
        messaggio: r.registroMessaggio,
        provatoIl: r.registroIl?.toISOString() ?? null,
        ordini: [],
      } satisfies FornitoreDaCollegare)
    f.totale += r.importo ?? 0
    f.pagamenti++
    if (r.ordineNumero && !f.ordini.includes(r.ordineNumero)) f.ordini.push(r.ordineNumero)
    // ⚠️ Fra due righe dello stesso fornitore vince l'esito PIÙ RECENTE che
    // dice qualcosa: un «ambiguo» di ieri spiega più di un vuoto di oggi.
    if (!f.esito && r.registroEsito) {
      f.esito = r.registroEsito
      f.messaggio = r.registroMessaggio
      f.provatoIl = r.registroIl?.toISOString() ?? null
      f.richiestaId = r.id
    }
    per.set(k, f)
  }
  // I soldi più grossi davanti: è lì che un doppione in anagrafica costa di più.
  return [...per.values()].sort((a, b) => b.totale - a.totale)
}

/**
 * Richiede al registro chi è questo fornitore, adesso.
 *
 * ⚠️ Si passa dalla funzione di sempre (`segnalaFornitorePagatoAlRegistro`), che
 * chiede il match e scrive solo se è sicura: un «ricontrolla» che scrivesse con
 * regole sue sarebbe una seconda verità accanto alla prima.
 *
 * ⚠️ `pretendiPagata: false` non serve — queste righe sono tutte pagate — ma si
 * passa esplicito: la funzione ha quel parametro proprio perché il momento in
 * cui si chiede non è sempre lo stesso.
 */
export async function ricontrollaNelRegistro(richiestaId: string) {
  return segnalaFornitorePagatoAlRegistro(richiestaId, true, null)
}
