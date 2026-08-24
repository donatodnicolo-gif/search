// Prova quello che la pagina Pagamenti sa fare adesso.
//   npx tsx scripts/prova-pagamenti.mts
//
// Le cose che contano, in ordine di quanto farebbero male sbagliate:
//  1. ⚠️⚠️ **un metodo che non è un bonifico non risulta «da controllare»**: il
//     codice di controllo esiste solo per gli IBAN, e un allarme rosso su un
//     link di pagamento è un allarme su una riga che sta benissimo — dopo tre
//     di quelli non si guarda più nemmeno quello vero;
//  2. ⚠️⚠️ **la riga si scrive solo se ha quello che serve**, e serve una cosa
//     diversa per ogni metodo: un bonifico senza IBAN non è pagabile, un
//     «altro» senza la frase non dice niente a nessuno;
//  3. **l'ordine si collega davvero**: il campo esisteva ed era sempre vuoto;
//  4. **la ricevuta si conserva** e la sua misura viene rifiutata quando è
//     troppo grande — non arriverebbe nemmeno alla funzione.
//
// ⚠️ Scrive righe di prova e se le ricancella per id.
import { db } from '../src/lib/db'
import { cosaManca, linkSicuro, ricevutaAccettabile, TETTO_RICEVUTA } from '../src/lib/metodo-pagamento'
import { verificaIban } from '../src/lib/iban'

let falliti = 0
function verifica(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) falliti++
  console.log(`  ${ok ? 'OK  ' : 'NO  '} ${nome}${dettaglio ? ' — ' + dettaglio : ''}`)
}

console.log('\n── Che cosa serve, per ogni metodo ──')
const chi = 'Pasticceria Rossi'
verifica('bonifico senza IBAN: si ferma', !!cosaManca({ metodo: 'iban', iban: '', riferimento: '', intestatario: chi }))
verifica(
  'bonifico con IBAN: passa',
  !cosaManca({ metodo: 'iban', iban: 'IT60X0542811101000000123456', riferimento: '', intestatario: chi })
)
verifica('link senza link: si ferma', !!cosaManca({ metodo: 'link', iban: '', riferimento: '', intestatario: chi }))
verifica(
  'link col link: passa, e NON serve l’IBAN',
  !cosaManca({ metodo: 'link', iban: '', riferimento: 'https://pay.me/x', intestatario: chi })
)
verifica(
  'paypal con l’indirizzo: passa',
  !cosaManca({ metodo: 'paypal', iban: '', riferimento: 'rossi@esempio.it', intestatario: chi })
)
verifica(
  '«altro» con la frase: passa',
  !cosaManca({ metodo: 'altro', iban: '', riferimento: 'contanti alla consegna', intestatario: chi })
)
verifica(
  'senza il nome di chi va pagato: si ferma sempre',
  !!cosaManca({ metodo: 'altro', iban: '', riferimento: 'contanti', intestatario: '' })
)

console.log('\n── ⚠️ Un link è un link solo se è http(s) ──')
verifica('https passa', linkSicuro('https://pay.me/x') !== '')
verifica('http passa', linkSicuro('http://pay.me/x') !== '')
verifica('javascript: NON passa', linkSicuro('javascript:alert(1)') === '')
verifica('data: NON passa', linkSicuro('data:text/html,<script>') === '')
verifica('testo qualunque non diventa cliccabile', linkSicuro('pagami su paypal') === '')

console.log('\n── La ricevuta ──')
verifica('un PDF si accetta', ricevutaAccettabile('application/pdf', 200_000) === '')
verifica('una foto si accetta', ricevutaAccettabile('image/jpeg', 900_000) === '')
verifica('un video no', ricevutaAccettabile('video/mp4', 1000) !== '')
verifica(
  'sopra il tetto no, e si dice quanto pesa',
  ricevutaAccettabile('image/jpeg', TETTO_RICEVUTA + 1).includes('MB')
)

console.log('\n── Sul database ──')
const righe: string[] = []
try {
  // Un pagamento che NON è un bonifico.
  const link = await db.richiestaPagamento.create({
    data: {
      metodo: 'link',
      iban: '',
      riferimentoPagamento: 'https://pay.esempio.it/abc',
      intestatario: 'PROVA — si cancella da sola',
      importo: 80,
      causale: 'Ordine #2785',
      ordineNumero: '#2785',
      ibanValido: false,
      origine: 'manuale',
    },
  })
  righe.push(link.id)
  verifica('un pagamento con link si salva senza IBAN', link.metodo === 'link' && link.iban === '')
  verifica("l'ordine resta collegato", link.ordineNumero === '#2785')
  // ⚠️ Il punto 1: `ibanValido: false` su un link NON vuol dire «sbagliato».
  verifica(
    'e non porta un IBAN finto',
    link.riferimentoPagamento.startsWith('https://') && link.ibanValido === false
  )

  // Un bonifico vero, con la ricevuta.
  const iban = 'IT60X0542811101000000123456'
  const esito = verificaIban(iban)
  const bonifico = await db.richiestaPagamento.create({
    data: {
      metodo: 'iban',
      iban: esito.normalizzato,
      intestatario: 'PROVA — si cancella da sola 2',
      importo: 130.5,
      causale: 'Ordine #2786',
      ordineNumero: '#2786',
      ibanValido: esito.valido,
      ibanPaese: esito.paese,
      origine: 'manuale',
    },
  })
  righe.push(bonifico.id)
  verifica('un bonifico si verifica col codice di controllo', bonifico.ibanValido, esito.motivo || 'valido')

  const finto = 'data:application/pdf;base64,' + 'A'.repeat(500)
  const pagata = await db.richiestaPagamento.update({
    where: { id: bonifico.id },
    data: {
      pagataIl: new Date(),
      pagataDaNome: 'prova',
      ricevutaDati: finto,
      ricevutaNome: 'ricevuta.pdf',
      ricevutaTipo: 'application/pdf',
    },
  })
  verifica('si segna pagata, con chi e quando', !!pagata.pagataIl && pagata.pagataDaNome === 'prova')
  verifica('la ricevuta si conserva', pagata.ricevutaDati.length > 100 && pagata.ricevutaNome === 'ricevuta.pdf')

  // ⚠️ Togliere il segno NON butta la ricevuta: è un documento.
  const disfatta = await db.richiestaPagamento.update({
    where: { id: bonifico.id },
    data: { pagataIl: null, pagataDaNome: '' },
  })
  verifica('togliendo «pagata» la ricevuta RESTA', disfatta.pagataIl === null && !!disfatta.ricevutaDati)

  // ── Il controllo che protegge la pagina: l'elenco non porta i byte ──
  const elenco = await db.richiestaPagamento.findMany({
    orderBy: { creatoIl: 'desc' },
    take: 5,
    select: { id: true, ricevutaNome: true, ricevutaTipo: true },
  })
  verifica(
    "l'elenco può dire che la ricevuta c'è senza portarsela dietro",
    elenco.some((r) => r.id === bonifico.id) &&
      !Object.keys(elenco[0]).includes('ricevutaDati')
  )
} finally {
  for (const id of righe) await db.richiestaPagamento.delete({ where: { id } })
  const resta = await db.richiestaPagamento.count({ where: { id: { in: righe } } })
  verifica('le righe di prova sono state cancellate', resta === 0)
}

console.log(falliti === 0 ? '\nTutto torna.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
