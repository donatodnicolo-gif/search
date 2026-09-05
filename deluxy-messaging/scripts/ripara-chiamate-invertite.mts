// Ripara le chiamate registrate con i numeri INVERTITI (01/09 → 05/09/2026).
//
// ⚠️⚠️ Cos'era successo: la prima notifica vera (GlooboBiz) non aveva nessuna
// etichetta che il parser conoscesse, e il ripiego «primo numero» prendeva il
// NOSTRO numero virtuale come chiamante e il cliente come «chiamato». Un ordine
// (#12359) ha il nostro numero come telefono del cliente, quindi 15 telefonate
// di 12 persone diverse risultavano tutte di «Sharaya Romero».
//
// Cosa fa, per ogni chiamata il cui `numero` è uno dei nostri (cioè compare
// come «Numero Virtuale» nel testo della notifica):
//   1. rilegge la notifica col parser corretto;
//   2. scambia numero ↔ numeroChiamato, ricalcola le cifre;
//   3. rifà il riconoscimento (ordine locale → archivio Orders → sconosciuto);
//   4. riscrive il promemoria «Richiamare …» collegato.
//
// ⚠️ NON tocca `richiamataIl`: chi ha spuntato «richiamato» l'ha fatto, anche se
// sulla riga sbagliata. Resettarlo è una decisione di chi lavora, non dello
// script — e si può fare dalla pagina.
//
// Senza argomenti MOSTRA cosa cambierebbe; con `--applica` scrive.
//
//   npx tsx scripts/ripara-chiamate-invertite.mts
//   npx tsx scripts/ripara-chiamate-invertite.mts --applica
import { db } from '../src/lib/db'
import { numeriDaNotifica, riconosciChiamante, nostriNumeri } from '../src/lib/chiamate'
import { cifreTelefono } from '../src/lib/scheda-cliente'

const applica = process.argv.includes('--applica')

const tutte = await db.chiamata.findMany({
  orderBy: { quando: 'asc' },
  select: {
    id: true,
    quando: true,
    numero: true,
    numeroChiamato: true,
    oggetto: true,
    testo: true,
    esito: true,
    clienteNome: true,
    ordineNumero: true,
    attivitaId: true,
    negozioId: true,
    casellaId: true,
  },
})
const nostri = await nostriNumeri()
console.log(`chiamate in tabella: ${tutte.length} · nostri numeri noti: ${nostri.join(', ') || '(nessuno sui negozi)'}`)

let daRiparare = 0
let riparate = 0
for (const c of tutte) {
  const nuovi = numeriDaNotifica(c.oggetto, c.testo, nostri)
  const invertita =
    nuovi.chiamante &&
    cifreTelefono(nuovi.chiamante) !== cifreTelefono(c.numero) &&
    cifreTelefono(nuovi.chiamato) === cifreTelefono(c.numero)
  if (!invertita) {
    console.log(`ok    ${c.quando.toISOString().slice(0, 16)} ${c.numero} → ${c.esito} ${c.clienteNome}`)
    continue
  }
  daRiparare++
  const r = await riconosciChiamante(nuovi.chiamante)
  console.log(
    `INV   ${c.quando.toISOString().slice(0, 16)} era «${c.numero}» (${c.esito} ${c.clienteNome || '—'}) → chiamante «${nuovi.chiamante}», nostro «${nuovi.chiamato}» → ${r.esito} ${r.clienteNome || '—'} ${r.ordineNumero}`
  )
  if (!applica) continue

  const casella = await db.casellaEmail.findUnique({ where: { id: c.casellaId }, select: { negozioId: true } })
  await db.chiamata.update({
    where: { id: c.id },
    data: {
      numero: nuovi.chiamante,
      cifre: cifreTelefono(nuovi.chiamante),
      numeroChiamato: nuovi.chiamato,
      chiamante: r.clienteNome,
      esito: r.esito,
      ordineId: r.ordineId,
      ordineNumero: r.ordineNumero,
      clienteNome: r.clienteNome,
      email: r.email,
      negozioId: r.negozioId ?? casella?.negozioId ?? null,
    },
  })
  if (c.attivitaId) {
    const chi = r.clienteNome || nuovi.chiamante
    const testo =
      r.esito === 'ordine'
        ? `Richiamare ${chi} — ha chiamato per l'ordine ${r.ordineNumero}`
        : r.esito === 'cliente'
          ? `Richiamare ${chi} — cliente, ultimo ordine ${r.ordineNumero}`
          : `Richiamare ${nuovi.chiamante} — NON risulta nostro cliente`
    await db.attivita
      .update({
        where: { id: c.attivitaId },
        data: { testo, ordineId: r.ordineId, riferimento: r.ordineNumero ? `ordine ${r.ordineNumero}` : nuovi.chiamante },
      })
      .catch(() => console.log(`      (promemoria ${c.attivitaId} non trovato, salto)`))
  }
  riparate++
}
console.log(
  applica
    ? `\nRIPARATE ${riparate} chiamate su ${daRiparare} invertite.`
    : `\n${daRiparare} chiamate da riparare su ${tutte.length}. Niente scritto: rilancia con --applica.`
)
await db.$disconnect()
