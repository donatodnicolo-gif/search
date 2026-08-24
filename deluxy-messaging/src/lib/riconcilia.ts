import { db } from './db'
import { comunicaCostoAOrders } from './orders'
import { decidi, type Verdetto } from './riconciliazione'

// PORTARE SULL'ORDINE QUELLO CHE IL PAGAMENTO SA GIÀ.
//
// ⚠️⚠️ Questa funzione ha DUE chiamanti e deve restare una sola: quando il
// pagamento nasce qui dentro parte **da sola** (si preme «Pagata» e l'ordine
// impara chi l'ha preparato e quanto è costato), e dalla pagina Riconciliazione
// parte a mano, per i pagamenti vecchi o per quelli su cui serve una decisione.
// Se le due strade avessero due copie della stessa logica, il giorno che si
// corregge un controllo se ne correggerebbe una sola — e il buco resterebbe
// aperto proprio sulla strada automatica, che è quella che nessuno guarda.
//
// ⚠️⚠️ AUTOMATICO NON VUOL DIRE «SEMPRE». I controlli di `decidi()` valgono
// identici sulle due strade: un pagamento che assomiglia a un rimborso al
// cliente, un fornitore diverso già scritto sull'ordine, un costo che non
// torna — non si toccano, né a mano né da soli. Sulla strada automatica anzi
// contano di più: a mano c'è una persona che legge la frase e si accorge, qui
// no. Quello che non passa finisce nella pagina Riconciliazione, che diventa
// **l'elenco delle eccezioni** invece della coda di tutto il lavoro.

export type EsitoRiconciliazione = {
  /** Se l'ordine è stato aggiornato davvero. */
  fatto: boolean
  verdetto: Verdetto | 'senza-richiesta' | 'non-pagata' | 'ordine-non-trovato'
  /** Una riga da mostrare a chi ha appena premuto il bottone. */
  messaggio: string
  /** L'esito della proposta a Orders, quando si è arrivati a farla. */
  orders?: { ok: boolean; messaggio?: string }
}

/**
 * Registra sull'ordine il fornitore e il costo che un pagamento già fatto
 * dimostra. Non lancia mai: chi la chiama sta facendo altro (segnare pagata una
 * riga) e non deve fallire per colpa di questo.
 */
export async function riconciliaDaPagamento(
  richiestaId: string,
  io: { id: string; nome: string },
  /**
   * `auto` quando parte da sola dopo un «Pagata» fatto qui dentro. Cambia solo
   * come si SCRIVE la provenienza sull'ordine: fra sei mesi la differenza fra
   * «l'ha detto chi ha telefonato» e «l'ho ricavato da un pagamento» è
   * esattamente ciò che serve per sapere quanto fidarsi.
   */
  come: 'auto' | 'a-mano' = 'a-mano'
): Promise<EsitoRiconciliazione> {
  const r = await db.richiestaPagamento.findUnique({
    where: { id: richiestaId },
    select: {
      intestatario: true,
      importo: true,
      ordineNumero: true,
      pagataIl: true,
      metodo: true,
    },
  })
  if (!r) {
    return { fatto: false, verdetto: 'senza-richiesta', messaggio: 'Richiesta non trovata.' }
  }
  if (!r.pagataIl) {
    return {
      fatto: false,
      verdetto: 'non-pagata',
      // ⚠️ Una richiesta preparata e non pagata NON dimostra chi ha preparato
      // l'ordine: il fornitore può ancora dire di no.
      messaggio: 'Questa richiesta non risulta pagata: non dimostra chi ha preparato l’ordine.',
    }
  }
  if (!r.ordineNumero) {
    return {
      fatto: false,
      verdetto: 'senza-ordine',
      messaggio: 'Il pagamento non è collegato a nessun ordine, quindi non so su quale registrarlo.',
    }
  }

  const numero = r.ordineNumero.replace('#', '')
  const ordine = await db.ordine.findFirst({
    where: { numero: { in: [numero, `#${numero}`] } },
    select: {
      id: true,
      numero: true,
      shopifyId: true,
      clienteNome: true,
      gestione: true,
      annullatoIl: true,
      fornitoreNome: true,
      fornitoreCosto: true,
      fornitoreTelefono: true,
      fornitoreEmail: true,
      totale: true,
      valuta: true,
      negozioNome: true,
    },
  })
  if (!ordine) {
    return {
      fatto: false,
      verdetto: 'ordine-non-trovato',
      messaggio: `L’ordine ${r.ordineNumero} non è fra quelli che teniamo qui (60 giorni).`,
    }
  }

  // ⚠️ Le condizioni si ricontrollano SEMPRE qui, anche quando la chiamata
  // arriva da una schermata che le aveva già viste: quella pagina può essere
  // vecchia di dieci minuti, e nel frattempo un collega può aver registrato un
  // altro fornitore o annullato l'ordine.
  const g = decidi({
    richiestaId,
    intestatario: r.intestatario,
    iban: '',
    importo: r.importo,
    metodo: r.metodo,
    pagataIl: r.pagataIl.toISOString(),
    ordine: {
      id: ordine.id,
      numero: ordine.numero,
      negozioNome: ordine.negozioNome,
      clienteNome: ordine.clienteNome,
      totale: ordine.totale,
      valuta: ordine.valuta,
      gestione: ordine.gestione,
      annullato: !!ordine.annullatoIl,
      fornitoreNome: ordine.fornitoreNome,
      fornitoreCosto: ordine.fornitoreCosto,
    },
    registro: null,
  })
  if (g.verdetto !== 'da-registrare') {
    return { fatto: false, verdetto: g.verdetto, messaggio: g.frase }
  }

  await db.ordine.update({
    where: { id: ordine.id },
    data: {
      fornitoreNome: ordine.fornitoreNome || r.intestatario,
      fornitoreCosto: r.importo,
      // ⚠️⚠️ I RECAPITI NON ARRIVANO DA QUI: una richiesta di pagamento non li
      // ha (ha un IBAN, non un telefono). Per questo l'avviso al fornitore, che
      // legge telefono ed email **dall'ordine**, resterà «non avvisato» finché
      // qualcuno non li scrive a mano. È giusto che sia così — inventarli
      // sarebbe peggio — ma va detto, o si crede che la catena sia completa.
      fornitoreNota:
        come === 'auto'
          ? `Ricavato dal pagamento registrato qui il ${r.pagataIl.toLocaleDateString('it-IT')}.`
          : ordine.fornitoreNome
            ? 'Costo ricavato dal pagamento già fatto.'
            : `Ricavato dal pagamento già fatto a ${r.intestatario}.`,
      fornitoreDaId: io.id,
      fornitoreDaNome: io.nome,
      fornitoreIl: new Date(),
    },
  })

  // ⚠️ Un fallimento verso Orders NON annulla la registrazione: il fatto è
  // nostro e vale comunque. Si RESTITUISCE, e chi ci ha chiamato lo mostra —
  // una proposta che rimbalza in silenzio lascerebbe il margine vuoto senza che
  // nessuno capisca perché.
  const versoOrders = await comunicaCostoAOrders(
    ordine.numero,
    ordine.shopifyId,
    r.importo,
    ordine.fornitoreNome || r.intestatario
  )

  return {
    fatto: true,
    verdetto: 'da-registrare',
    messaggio: `${ordine.numero}: ora risulta preparato da ${ordine.fornitoreNome || r.intestatario}, costo ${r.importo.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}.`,
    orders: versoOrders.ok ? { ok: true } : { ok: false, messaggio: versoOrders.messaggio },
  }
}
