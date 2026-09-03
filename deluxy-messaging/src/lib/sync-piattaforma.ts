import { db } from './db'
import { leggiImpostazioni, salvaImpostazione } from './impostazioni'
import { eInApp, nomeStatoVendita, venditeAggiornate, type VoceInApp } from './piattaforma'
import { CHIUSURA } from './gestione'

// TENERE ALLINEATA LA COLONNA «IN APP».
//
// ⚠️⚠️ Il problema che risolve, detto com'è: quando la piattaforma consegne
// propone un ordine a un partner in automatico, qui non si sapeva. Si cercava un
// fioraio a mano su un ordine che era già stato proposto a qualcuno — due
// persone sullo stesso lavoro, e nessuna delle due in grado di accorgersene.
//
// ⚠️ Si legge con UNA chiamata a giro (`/app/vendite?aggiornateDa=`), non una
// per ordine: la piattaforma è un'altra app, non un nostro database.
//
// ⚠️⚠️ E si scrive **solo la nostra** `gestione`, con tre regole che tengono
// insieme le due app senza che nessuna comandi sull'altra:
//
//  1. un ordine **chiuso da noi** (`gestito`) non si tocca: se l'abbiamo
//     finito, che la piattaforma stia ancora lavorando è affar suo;
//  2. un ordine **interrotto a mano** non torna «In App» da solo, o la decisione
//     di una persona durerebbe fino al giro dopo;
//  3. quando la proposta **decade** (non accettata, annullata), l'ordine TORNA
//     dov'era prima — non a «Da iniziare», che farebbe ricominciare da capo un
//     lavoro già a metà.

/** L'ultima volta che abbiamo chiesto: si riparte da lì. */
const CHIAVE_ULTIMO = 'piattaformaSyncUltimo'
const CHIAVE_ESITO = 'piattaformaSyncEsito'

export type EsitoSync = {
  lette: number
  passateInApp: number
  tornateANoi: number
  aggiornate: number
  saltate: number
  righe: string[]
  errore: string
}

/**
 * Allinea gli ordini con quello che dice la piattaforma.
 *
 * ⚠️ `prova: true` non scrive: serve a guardare cosa cambierebbe.
 */
export async function sincronizzaConPiattaforma(opz: { prova?: boolean } = {}): Promise<EsitoSync> {
  const esito: EsitoSync = {
    lette: 0,
    passateInApp: 0,
    tornateANoi: 0,
    aggiornate: 0,
    saltate: 0,
    righe: [],
    errore: '',
  }

  const c = await leggiImpostazioni([CHIAVE_ULTIMO])
  // ⚠️ Si torna indietro di un'ora rispetto all'ultimo giro: se una scrittura
  // di là e la nostra lettura si incrociano al secondo, senza margine quella
  // vendita non la vedremmo mai più.
  const da = c[CHIAVE_ULTIMO] ? new Date(new Date(c[CHIAVE_ULTIMO]).getTime() - 3600 * 1000) : null

  // ── SI LEGGE A PAGINE, E IL SEGNAPOSTO SEGUE QUELLO CHE SI È LETTO ──
  //
  // ⚠️⚠️ Prima si chiedeva **una pagina sola da 200** e poi si scriveva il
  // segnaposto ad `adesso`. Se le vendite cambiate erano di più, dalla 201ª in
  // poi **non si leggevano mai più**: il giro dopo ripartiva da adesso, e quelle
  // restavano indietro per sempre. Il caso peggiore era il **primo giro**
  // (`da = null`): la piattaforma ordina per `aggiornataIl` crescente, quindi
  // tornava le 200 **più vecchie** e tutto il resto spariva.
  //
  // ⚠️ Non serve un `offset`: la piattaforma accetta `aggiornateDa` e ordina per
  // data, quindi si continua **dall'ultima letta** — che è anche il modo giusto
  // di non saltare niente se qualcosa cambia mentre si legge.
  //
  // ⚠️⚠️ E il segnaposto diventa **l'ultima data DAVVERO LETTA**, non `adesso`:
  // così, se il giro si interrompe a metà, quello dopo riprende da lì invece di
  // saltare in avanti.
  const PAGINE_MAX = 20
  let cursore = da
  let ultimaLetta: string = ''
  let troncato = false

  for (let pagina = 0; pagina < PAGINE_MAX; pagina++) {
    const risposta = await venditeAggiornate(cursore)
    if (risposta.stato === 'non-configurato') {
      esito.errore = 'Piattaforma consegne non collegata: manca la chiave in Impostazioni.'
      return esito
    }
    if (risposta.stato === 'errore') {
      esito.errore = risposta.messaggio
      break
    }
    if (risposta.stato === 'non-trovato') {
      esito.errore = 'La rotta delle vendite non risponde: controlla l’indirizzo della piattaforma.'
      return esito
    }

    const vendite = risposta.dati.vendite ?? []
    if (!vendite.length) break
    esito.lette += vendite.length

    for (const v of vendite) {
      const riga = await allineaUno(v, opz.prova === true)
      if (riga.esito === 'in-app') esito.passateInApp++
      else if (riga.esito === 'tornato') esito.tornateANoi++
      else if (riga.esito === 'aggiornato') esito.aggiornate++
      else esito.saltate++
      if (riga.testo) esito.righe.push(riga.testo)
      if (v.vendita.aggiornataIl > ultimaLetta) ultimaLetta = v.vendita.aggiornataIl
    }

    // Pagina non piena: non c'è altro da leggere.
    if (vendite.length < 200) break

    const prossimo = ultimaLetta ? new Date(ultimaLetta) : null
    // ⚠️ Se il cursore non avanza — tutte le vendite della pagina con la stessa
    // data al millisecondo — si smette invece di girare a vuoto per sempre.
    if (!prossimo || (cursore && prossimo.getTime() <= cursore.getTime())) {
      troncato = true
      break
    }
    cursore = prossimo
    if (pagina === PAGINE_MAX - 1) troncato = true
  }

  // ⚠️ Se si è dovuto smettere prima della fine, LO SI DICE: un elenco troncato
  // letto come completo trasforma «non c'è» in un fatto.
  if (troncato) {
    esito.righe.push(
      `⚠️ Lette ${esito.lette} vendite e non è finita: il segnaposto resta all'ultima letta, il giro dopo riprende da lì.`
    )
  }

  if (!opz.prova) {
    // ⚠️⚠️ L'ULTIMA DATA LETTA, non `adesso`. Con `adesso` tutto ciò che non si
    // è fatto in tempo a leggere restava indietro per sempre.
    await salvaImpostazione(CHIAVE_ULTIMO, ultimaLetta || new Date().toISOString())
    // ⚠️⚠️ L'esito si SCRIVE. Un giro notturno di cui nessuno vede il risultato
    // non è misurato, è ricordato: qui resta una riga leggibile da Impostazioni.
    await salvaImpostazione(
      CHIAVE_ESITO,
      `${new Date().toISOString()} · lette ${esito.lette}${troncato ? '+ (troncato)' : ''} · in app ${esito.passateInApp} · tornate ${esito.tornateANoi}${esito.errore ? ' · ' + esito.errore : ''}`
    )
  }
  return esito
}

type RigaEsito = { esito: 'in-app' | 'tornato' | 'aggiornato' | 'saltato'; testo: string }

async function allineaUno(v: VoceInApp, prova: boolean): Promise<RigaEsito> {
  const idOrders = v.vendita.riferimentoEsterno ?? ''
  if (!idOrders) return { esito: 'saltato', testo: '' }

  // ⚠️⚠️ IL PONTE FRA LE DUE APP È L'ID DI ORDERS, e qui non ce l'abbiamo su
  // ogni riga: la nostra copia dell'ordine porta il numero e l'id Shopify. Si
  // cerca per `ordersId` quando c'è; altrimenti la vendita non è agganciabile e
  // NON si inventa un abbinamento per importo o per data — un ordine sbagliato
  // marcato «In App» fermerebbe il lavoro su quello giusto.
  const ordine = await db.ordine.findFirst({
    where: { ordersId: idOrders },
    select: {
      id: true,
      numero: true,
      gestione: true,
      appStato: true,
      appVenditaId: true,
      appPartner: true,
      appCostoPartner: true,
      appGestionePrima: true,
      appInterrottoIl: true,
    },
  })
  if (!ordine) return { esito: 'saltato', testo: '' }

  const stato = v.vendita.stato
  const nelleSueMani = eInApp(stato)
  const partner = v.vendita.partner?.insegna ?? ''

  const dati: Record<string, unknown> = {
    appVenditaId: v.vendita.id,
    appStato: stato,
    appPartner: partner,
    appCostoPartner: v.vendita.costoPartner,
    appAggiornatoIl: new Date(),
  }

  // ── 1. L'ordine passa in app ──
  if (nelleSueMani && ordine.gestione !== CHIUSURA && !ordine.appInterrottoIl) {
    if (ordine.gestione !== 'in_app') {
      dati.appGestionePrima = ordine.gestione
      dati.gestione = 'in_app'
      if (!prova) await db.ordine.update({ where: { id: ordine.id }, data: dati })
      return {
        esito: 'in-app',
        testo: `${ordine.numero}: ${nomeStatoVendita(stato)}${partner ? ` (${partner})` : ''}`,
      }
    }
    if (!prova) await db.ordine.update({ where: { id: ordine.id }, data: dati })
    return { esito: 'aggiornato', testo: '' }
  }

  // ── 2. La proposta decade: l'ordine torna a noi ──
  //
  // ⚠️⚠️ È il momento che non si può perdere. Se «non accettata» restasse
  // marcata «In App», quell'ordine non lo lavorerebbe più nessuno: noi lo
  // crediamo dell'app, l'app l'ha lasciato andare.
  if (!nelleSueMani && ordine.gestione === 'in_app') {
    dati.gestione = ordine.appGestionePrima || 'da_gestire'
    dati.appGestionePrima = ''
    if (!prova) await db.ordine.update({ where: { id: ordine.id }, data: dati })
    return {
      esito: 'tornato',
      testo: `${ordine.numero}: torna a noi — ${nomeStatoVendita(stato)}`,
    }
  }

  // ── 3. Nient'altro da spostare: si aggiorna solo la copia ──
  //
  // ⚠️ 03/09 (regola utente: «la modifica di una vendita deve andare anche
  // qui»): il confronto guarda anche partner e costo. Prima guardava solo
  // stato e id — una vendita MODIFICATA di là (importo, partner) a parità di
  // stato veniva saltata, e la nostra copia restava vecchia per sempre.
  if (
    ordine.appStato !== stato ||
    ordine.appVenditaId !== v.vendita.id ||
    (ordine.appPartner ?? '') !== partner ||
    (ordine.appCostoPartner ?? null) !== (v.vendita.costoPartner ?? null)
  ) {
    if (!prova) await db.ordine.update({ where: { id: ordine.id }, data: dati })
    return { esito: 'aggiornato', testo: '' }
  }
  return { esito: 'saltato', testo: '' }
}

/**
 * «Questo lo facciamo noi»: l'ordine esce dalle mani dell'app.
 *
 * Fa due cose, e la seconda è quella che conta:
 *  1. rimette la lavorazione dov'era prima (o «Da iniziare»), e segna che una
 *     persona ha deciso — così la sincronizzazione non lo rimette «In App»;
 *  2. dice a Deluxy Orders di **non smistarlo più in automatico**, altrimenti
 *     al giro dopo la piattaforma se lo riprenderebbe e saremmo punto a capo.
 *
 * ⚠️⚠️ Quello che NON può fare: annullare una proposta già aperta dentro la
 * piattaforma. Il suo canale app-to-app è di sola lettura, e inventarsi qui una
 * scrittura sul suo database sarebbe esattamente ciò che lo Standard vieta. Se
 * un partner sta guardando quella proposta, va annullata di là — e chi
 * interrompe deve leggerlo, non scoprirlo.
 */
export async function interrompiGestioneApp(
  ordineId: string
): Promise<{ ok: boolean; messaggio: string; propostaAperta: boolean }> {
  const ordine = await db.ordine.findUnique({
    where: { id: ordineId },
    select: {
      id: true,
      numero: true,
      shopifyId: true,
      gestione: true,
      appStato: true,
      appPartner: true,
      appGestionePrima: true,
    },
  })
  if (!ordine) return { ok: false, messaggio: 'Ordine non trovato.', propostaAperta: false }

  await db.ordine.update({
    where: { id: ordine.id },
    data: {
      gestione: ordine.gestione === 'in_app' ? ordine.appGestionePrima || 'da_gestire' : ordine.gestione,
      appGestionePrima: '',
      appInterrottoIl: new Date(),
    },
  })

  // ⚠️ Il no allo smistamento automatico si dice a ORDERS, che è chi decide se
  // mandarlo in piattaforma. Un fallimento qui non annulla l'interruzione da
  // parte nostra: si dice, e si può ripetere.
  const { comunicaSmistamentoAOrders } = await import('./orders')
  const detto = await comunicaSmistamentoAOrders(ordine.numero, ordine.shopifyId, 'manuale')

  const propostaAperta = ordine.appStato === 'proposta' || ordine.appStato === 'accettata'
  const pezzi = [
    `${ordine.numero} torna a noi.`,
    detto.ok
      ? 'Deluxy Orders non lo smisterà più in automatico.'
      : `⚠️ Non sono riuscito a dirlo a Orders: ${detto.messaggio} Finché non glielo si dice, potrebbe tornare in app.`,
    propostaAperta
      ? `⚠️⚠️ Nella piattaforma la proposta${ordine.appPartner ? ` a ${ordine.appPartner}` : ''} risulta ancora aperta: va annullata di là, da qui non si può.`
      : '',
  ].filter(Boolean)

  return { ok: true, messaggio: pezzi.join(' '), propostaAperta }
}
