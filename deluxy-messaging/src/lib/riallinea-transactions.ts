import { db } from './db'
import {
  richiesteApertePerNoi,
  segnaPagataFuoriTransactions,
  transactionsConfigurata,
} from './transactions'

/**
 * ⭐ 12/09/2026 — L'ARRETRATO DELLA CODA DI TRANSACTIONS.
 *
 * Chiesto dall'utente («chiudi tutto»), dopo la segnalazione di una sessione di
 * Transactions: nella loro coda stavano **41 richieste del Customer Service per
 * 3.638,00 €**, e tutte e 41 erano **già pagate qui** per un'altra strada.
 *
 * ⚠️⚠️ PERCHÉ NON SI POTEVA FARE DA UN COMANDO LOCALE: le credenziali di
 * Transactions vivono SOLO nell'ambiente del server (sono quelle che muovono
 * denaro, e il database è condiviso con altre tredici app). Dal computer di casa
 * non c'è nessuna chiave, quindi il riallineamento deve girare **in produzione**:
 * per questo è una rotta cron e non uno script in `scripts/`.
 *
 * Che cosa fa, e che cosa NON fa:
 * · chiude di là, come «pagata fuori dall'app», le richieste che qui hanno una
 *   data di pagamento e che di là risultano ancora in attesa;
 * · **non muove un euro**: quei soldi sono già usciti. Toglie doppioni dalla
 *   coda di chi autorizza, che è il posto dove un doppione fa danno.
 * · **non tocca** una richiesta che qui non è pagata: quella è lavoro vero.
 *
 * ⚠️ Ogni riga si chiude **una per una** e l'esito si scrive sulla riga: se di
 * là una chiamata fallisce, la nostra riga porta il motivo invece di passare per
 * chiusa. Alla fine si RICHIEDE a Transactions che cosa resta aperto per noi —
 * l'unico modo onesto di dire «è finito», e anche di scoprire le righe che di
 * là esistono e qui no.
 */

export type EsitoRiga = {
  riferimento: string
  fornitore: string
  importo: number
  chiusa: boolean
  messaggio: string
}

export type EsitoRiallineo = {
  configurata: boolean
  /** Le righe candidate: pagate qui, ancora in attesa di là. */
  candidate: number
  importoCandidate: number
  chiuse: number
  fallite: number
  righe: EsitoRiga[]
  /** Che cosa Transactions dice di avere ancora aperto per noi, DOPO il giro. */
  aperteDiLa: { riferimentoEsterno: string; stato: string; importo: number | null; nostra: boolean }[] | null
  apertePerche: string
}

/**
 * ⚠️⚠️ TRANSACTIONS ACCETTA **DIECI CHIAMATE AL MINUTO** — misurato il 12/09/2026
 * al primo giro vero: 10 chiuse e **31 respinte con 429**, «Troppe richieste:
 * massimo 10 al minuto». Non è un guasto, è la loro difesa, e va rispettata da
 * questa parte: un 429 non chiude niente e lascia un errore scritto su una riga
 * che non aveva nessun problema.
 *
 * Quindi: **nove per giro** (la decima chiamata del minuto serve per chiedere a
 * loro che cosa resta aperto, in fondo), con una pausa fra una e l'altra. Il
 * resto si prende al giro dopo: un arretrato non ha fretta, e chi lo lancia
 * vede il conto scendere.
 */
const TETTO = 9
const PAUSA_MS = 6_500

export async function riallineaCodaTransactions(
  opzioni: { esegui?: boolean } = {}
): Promise<EsitoRiallineo> {
  const vuoto: EsitoRiallineo = {
    configurata: transactionsConfigurata(),
    candidate: 0,
    importoCandidate: 0,
    chiuse: 0,
    fallite: 0,
    righe: [],
    aperteDiLa: null,
    apertePerche: '',
  }
  if (!vuoto.configurata) {
    return { ...vuoto, apertePerche: 'Transactions non è configurata qui: mancano le credenziali nell’ambiente.' }
  }

  // ⚠️ `pagataIl` non nullo È la condizione: senza, si chiuderebbe di là una
  // richiesta che qui aspetta ancora dei soldi.
  const candidate = await db.richiestaPagamento.findMany({
    where: {
      canale: 'transactions',
      NOT: [{ inviataIl: null }, { pagataIl: null }],
      partnerStato: { not: 'pagata' },
    },
    orderBy: { inviataIl: 'asc' },
    take: TETTO,
    select: { id: true, riferimento: true, fornitore: true, importo: true, pagataIl: true, pagatoCon: true },
  })

  const righe: EsitoRiga[] = []
  let chiuse = 0
  let fallite = 0

  let prima = true
  for (const r of candidate) {
    // ⚠️ La pausa sta PRIMA della chiamata e non dopo l'ultima: aspettare per
    // niente allunga il giro e basta.
    if (opzioni.esegui && !prima) await new Promise((r) => setTimeout(r, PAUSA_MS))
    prima = false
    if (!opzioni.esegui) {
      righe.push({
        riferimento: r.riferimento,
        fornitore: r.fornitore,
        importo: r.importo,
        chiusa: false,
        messaggio: 'prova a secco: non ho chiamato Transactions',
      })
      continue
    }
    const t = await segnaPagataFuoriTransactions({
      riferimento: r.riferimento,
      pagatoCon: r.pagatoCon || '',
      pagataIl: r.pagataIl!,
      // ⚠️ Chi ha chiuso resta scritto di là, e deve dire la verità: non è stata
      // una persona a premere «Pagata», è il riallineamento dell'arretrato.
      pagataDa: 'riallineamento arretrato (Customer Service)',
    })
    if (t.ok) {
      chiuse++
      await db.richiestaPagamento.update({
        where: { id: r.id },
        data: { partnerStato: 'pagata', esitoInvio: '' },
      })
    } else {
      fallite++
      await db.richiestaPagamento.update({
        where: { id: r.id },
        data: {
          esitoInvio: `Riallineamento del ${new Date().toLocaleDateString('it-IT')}: NON chiusa su Transactions — ${t.errore}`,
        },
      })
    }
    righe.push({
      riferimento: r.riferimento,
      fornitore: r.fornitore,
      importo: r.importo,
      chiusa: t.ok,
      messaggio: t.ok ? t.messaggio : t.errore,
    })
  }

  // ── E ADESSO SI CHIEDE A LORO ──
  // ⚠️⚠️ Non si dichiara «finito» guardando la propria tabella: la coda è la
  // loro, e la domanda dell'utente («qual è la 42 che rimane?») si risponde solo
  // di là. Le righe che di là risultano nostre e qui non esistono sono
  // esattamente quelle che nessun conto fatto da questa parte può trovare.
  const nostri = new Set(
    (
      await db.richiestaPagamento.findMany({
        where: { canale: 'transactions' },
        select: { riferimento: true },
      })
    ).map((x) => `cs-${x.riferimento}`)
  )
  const diLa = await richiesteApertePerNoi()
  return {
    configurata: true,
    candidate: candidate.length,
    importoCandidate: candidate.reduce((s, r) => s + r.importo, 0),
    chiuse,
    fallite,
    righe,
    aperteDiLa: diLa.ok
      ? diLa.righe.map((x) => ({ ...x, nostra: nostri.has(x.riferimentoEsterno) }))
      : null,
    apertePerche: diLa.ok ? '' : diLa.errore,
  }
}
