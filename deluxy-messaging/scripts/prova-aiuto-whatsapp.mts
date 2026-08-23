// Prova dell'avviso su WhatsApp.
//   npx tsx scripts/prova-aiuto-whatsapp.mts
//
// ⚠️ MANDA UN MESSAGGIO VERO al numero dell'amministratore, e crea una domanda
// finta che poi cancella per id. Serve a vedere l'unica cosa che conta davvero:
// se la finestra di 24 ore di WhatsApp lascia passare l'avviso.
import { avvisaAmministratore, codiceDa, numeroAmministratore } from '../src/lib/aiuto-whatsapp'
import { db } from '../src/lib/db'

const numero = await numeroAmministratore()
console.log('avviso diretto a: +' + numero)

const d = await db.domandaAiuto.create({
  data: {
    testo: 'Prova dell’avviso: se lo leggi, il canale funziona. Puoi ignorarlo.',
    pagina: '/prova',
    ordineNumero: '',
    utenteId: 'prova',
    utenteNome: 'Prova tecnica',
  },
})
await db.domandaAiuto.updateMany({ where: { id: d.id }, data: { codice: codiceDa(d.id) } })

await avvisaAmministratore(d.id)

const dopo = await db.domandaAiuto.findUnique({ where: { id: d.id } })
console.log('codice:', dopo?.codice)
console.log('esito :', dopo?.avvisoEsito || '(vuoto)')
console.log('wamid :', dopo?.avvisoWaId || '(nessuno)')

// ⚠️ Si cancella per id: mai un deleteMany senza filtro su questo database.
await db.domandaAiuto.deleteMany({ where: { id: d.id } })
console.log('\nriga di prova cancellata.')
await db.$disconnect()
