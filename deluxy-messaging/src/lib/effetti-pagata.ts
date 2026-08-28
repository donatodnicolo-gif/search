import { db } from './db'
import { comunicaStatoAOrders } from './orders'
import { riconciliaDaPagamento, type EsitoRiconciliazione } from './riconcilia'
import { STATI_DA_SPOSTARE_SE_PAGATO } from './riconciliazione'
import { avvisaFornitorePagato } from './avvisa-pagamento'
import { segnalaFornitorePagatoAlRegistro, type EsitoRegistroFornitore } from './registro-fornitori'

// Gli EFFETTI del «pagata»: l'ordine esce da «in pagamento», l'ordine impara il
// fornitore (riconciliazione), il fornitore viene avvisato, il registro
// anagrafiche lo impara. Erano il corpo del PATCH /api/pagamenti/[id]; da
// quando l'esito può arrivare anche dal webhook di Deluxy Transactions
// (28/08/2026) la strada è UNA, questa — il bottone e il webhook la chiamano
// identica, così i controlli non possono divergere.
//
// Tutti gli effetti sono best-effort: nessuno può far fallire la registrazione
// del pagamento (il denaro è uscito comunque), e ognuno restituisce il suo
// esito perché chi ha premuto — o chi legge la riga — lo veda.

export type EsitoEffettiPagata = {
  statoOrdine: '' | 'attesa_consegna' | 'numero-ambiguo'
  versoOrders: string
  avviso: { canale: string; errore: string }
  riconciliato: EsitoRiconciliazione | null
  registro: EsitoRegistroFornitore | null
}

export async function effettiPagata(
  id: string,
  attore: { id: string; nome: string }
): Promise<EsitoEffettiPagata> {
  const pagata = await db.richiestaPagamento.findUnique({ where: { id } })

  let statoOrdine: '' | 'attesa_consegna' | 'numero-ambiguo' = ''
  let versoOrders = ''

  // ── L'ORDINE ESCE DA «IN PAGAMENTO» ──
  // (Tutte le ragioni e i casi reali: vedi la storia di questo blocco nel
  // PATCH /api/pagamenti/[id] fino al 28/08. In breve: si spostano SOLO gli
  // stati in STATI_DA_SPOSTARE_SE_PAGATO; numero ripetuto su più ordini = non
  // si tocca niente ma lo si dice; il filtro di stato sta anche nella
  // scrittura, per la finestra fra lettura e scrittura; e Orders viene
  // avvisata solo se la riga è stata toccata davvero.)
  if (pagata?.ordineNumero) {
    try {
      const nudo = pagata.ordineNumero.replace('#', '')
      const daSpostare = await db.ordine.findMany({
        where: {
          numero: { in: [nudo, `#${nudo}`] },
          gestione: { in: STATI_DA_SPOSTARE_SE_PAGATO },
        },
        select: { id: true, numero: true, shopifyId: true },
      })
      const ordiniPerNumero = await db.ordine.count({
        where: { numero: { in: [nudo, `#${nudo}`] } },
      })
      const quando = new Date()
      if (ordiniPerNumero > 1) {
        statoOrdine = 'numero-ambiguo'
      } else if (daSpostare.length) {
        const spostati = await db.ordine.updateMany({
          where: {
            id: { in: daSpostare.map((o) => o.id) },
            gestione: { in: STATI_DA_SPOSTARE_SE_PAGATO },
          },
          data: {
            gestione: 'attesa_consegna',
            gestioneIl: quando,
            gestioneDaId: attore.id,
            gestioneDaNome: attore.nome,
          },
        })
        if (spostati.count > 0) {
          for (const o of daSpostare) {
            const e = await comunicaStatoAOrders(o.numero, o.shopifyId, 'attesa_consegna', attore.nome, quando)
            if (!e.ok) versoOrders = e.messaggio
          }
          statoOrdine = 'attesa_consegna'
        }
      }
    } catch {
      // lo stato è un contorno: il pagamento resta registrato
    }
  }

  // ── L'ORDINE IMPARA CHI L'HA PREPARATO ── stessa funzione del bottone a
  // mano, stessi rifiuti; quello che non passa resta nella Riconciliazione.
  let riconciliato: EsitoRiconciliazione | null = null
  try {
    riconciliato = await riconciliaDaPagamento(id, { id: attore.id, nome: attore.nome }, 'auto')
  } catch {
    riconciliato = null
  }

  // ── L'AVVISO AL FORNITORE ── il suo esito si scrive sulla riga.
  let avviso: { canale: string; errore: string } = { canale: '', errore: '' }
  try {
    avviso = await avvisaFornitorePagato(id)
  } catch (e) {
    avviso = { canale: '', errore: e instanceof Error ? e.message : 'errore' }
  }
  await db.richiestaPagamento.update({
    where: { id },
    data: { avvisoIl: new Date(), avvisoCanale: avviso.canale, avvisoEsito: avviso.errore },
  })

  // ── IL FORNITORE ENTRA NEL REGISTRO ── mai per un rimborso al cliente.
  let registro: EsitoRegistroFornitore | null = null
  if (riconciliato?.verdetto === 'rimborso-al-cliente') {
    registro = {
      ok: false,
      esito: 'rimborso',
      messaggio: 'Sembra un rimborso al cliente: non è un fornitore, il registro non si tocca.',
    }
  } else {
    try {
      registro = await segnalaFornitorePagatoAlRegistro(id)
    } catch (e) {
      registro = { ok: false, esito: 'errore', messaggio: e instanceof Error ? e.message : 'errore' }
    }
  }

  return { statoOrdine, versoOrders, avviso, riconciliato, registro }
}
