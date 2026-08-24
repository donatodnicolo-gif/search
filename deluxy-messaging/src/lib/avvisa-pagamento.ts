import { db } from './db'
import { inviaWhatsApp } from './meta'
import { tokenPerNumero } from './numeri-whatsapp'
import { caselleAttive, inviaEmail } from './email'
import { messaggioPagato } from './metodo-pagamento'

// AVVISARE IL FORNITORE CHE È STATO PAGATO, da soli.
//
// ⚠️ Chiesto esplicitamente dall'utente («l'avviso del pagamento è
// automatico»), dopo che l'avevo fatto a mano apposta. La sua ragione è buona:
// un fornitore che non sa di essere stato pagato richiama, e quella telefonata
// costa più di un messaggio.
//
// ⚠️⚠️ Ma parte solo perché **una persona ha premuto «Pagata»**: non c'è nessun
// automatismo che scrive a qualcuno senza che un operatore abbia deciso che quel
// pagamento è uscito. È la differenza fra «automatico» e «da solo».
//
// ⚠️⚠️ E **non sempre riesce**. La ragione più frequente non è un guasto: su
// WhatsApp si può scrivere in testo libero solo entro 24 ore dall'ultimo
// messaggio di quella persona (Meta, errore 131047). Un fornitore che non ci
// scrive da ieri **non è raggiungibile**. Per questo l'esito si scrive e si
// mostra: un avviso automatico di cui non si vede l'esito fa credere che il
// fornitore sappia — e quello richiama lo stesso, tre giorni dopo.

export type EsitoAvviso = {
  canale: string
  /** Vuoto = riuscito. */
  errore: string
}

/** Il numero come lo vuole Meta: solo cifre, senza «+». */
function soloCifre(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}

/**
 * Recapiti del fornitore di quell'ordine.
 *
 * ⚠️ Si prendono dall'ORDINE e non dalla richiesta di pagamento: la richiesta
 * porta l'intestatario del conto — che è una ragione sociale, non un contatto —
 * mentre chi ha preparato l'ordine ha telefono e mail scritti quando è stato
 * registrato. Sono due cose diverse e confonderle vorrebbe dire scrivere a
 * qualcun altro.
 */
async function recapiti(ordineNumero: string): Promise<{ telefono: string; email: string; nome: string }> {
  if (!ordineNumero) return { telefono: '', email: '', nome: '' }
  const o = await db.ordine.findFirst({
    where: { numero: ordineNumero, fornitoreNome: { not: '' } },
    orderBy: { fornitoreIl: 'desc' },
    select: { fornitoreNome: true, fornitoreTelefono: true, fornitoreEmail: true },
  })
  return {
    telefono: o?.fornitoreTelefono ?? '',
    email: o?.fornitoreEmail ?? '',
    nome: o?.fornitoreNome ?? '',
  }
}

export async function avvisaFornitorePagato(richiestaId: string): Promise<EsitoAvviso> {
  const r = await db.richiestaPagamento.findUnique({ where: { id: richiestaId } })
  if (!r) return { canale: '', errore: 'Richiesta non trovata.' }

  const c = await recapiti(r.ordineNumero)
  const testo = messaggioPagato({
    chi: c.nome || r.intestatario,
    importo: r.importo,
    ordine: r.ordineNumero,
    quando: r.pagataIl ?? new Date(),
  })

  // ── WhatsApp, se abbiamo un numero ──
  const numero = soloCifre(c.telefono)
  if (numero.length >= 8) {
    try {
      const token = await tokenPerNumero('')
      const n = await db.numeroWhatsApp.findFirst({
        where: { attivo: true },
        orderBy: { creatoIl: 'asc' },
        select: { phoneNumberId: true },
      })
      if (token && n?.phoneNumberId) {
        const esito = await inviaWhatsApp(token, n.phoneNumberId, numero, testo)
        if (esito.ok) return { canale: 'whatsapp', errore: '' }
        // ⚠️ L'errore di Meta si riporta COM'È, non tradotto in «non riuscito»:
        // 131047 vuol dire «sono passate più di 24 ore», che è una cosa da
        // sapere e non un guasto — e chi legge deve poter decidere se
        // telefonare invece di riprovare.
        return {
          canale: 'whatsapp',
          errore:
            esito.errore +
            (esito.errore.includes('131047') || esito.errore.toLowerCase().includes('24')
              ? ' — è la finestra di 24 ore di WhatsApp: scrivigli tu, o chiamalo.'
              : ''),
        }
      }
    } catch (e) {
      return { canale: 'whatsapp', errore: e instanceof Error ? e.message : 'errore' }
    }
  }

  // ── Email, se abbiamo un indirizzo ──
  if (c.email.includes('@')) {
    try {
      const caselle = await caselleAttive()
      if (caselle.length) {
        await inviaEmail(
          caselle[0],
          c.email,
          `Pagamento${r.ordineNumero ? ` — ordine ${r.ordineNumero}` : ''}`,
          testo
        )
        return { canale: 'email', errore: '' }
      }
      return { canale: 'email', errore: 'Nessuna casella di posta configurata.' }
    } catch (e) {
      return { canale: 'email', errore: e instanceof Error ? e.message : 'errore' }
    }
  }

  // ⚠️ Nessun recapito: si dice PERCHÉ, e si dice dove metterlo. «Non riuscito»
  // e basta manderebbe a cercare un guasto che non c'è.
  return {
    canale: '',
    errore: r.ordineNumero
      ? `Su ${r.ordineNumero} il fornitore non ha né telefono né email: aggiungili dalla scheda dell’ordine.`
      : 'Questa richiesta non è collegata a un ordine, quindi non so a chi scrivere.',
  }
}
