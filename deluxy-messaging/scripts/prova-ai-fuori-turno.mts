// Prova del giro «fuori turno risponde l'AI», sui dati veri.
//
// ⚠️⚠️ Questa è l'unica funzione dell'app che scrive ai clienti senza che una
// persona abbia premuto: la prova gira SEMPRE in modalità `prova`, cioè fa tutto
// il ragionamento e non manda niente a nessuno. Se un domani qualcuno la
// cambiasse per farla mandare davvero, se ne accorgerebbe leggendo questa riga.
//
//   npx tsx scripts/prova-ai-fuori-turno.mts
import 'dotenv/config'
import { db } from '../src/lib/db'
import { adessoARoma, chiEInTurno, giroAiFuoriTurno } from '../src/lib/ai-fuori-turno'
import { leggiImpostazioni } from '../src/lib/impostazioni'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

console.log('══ L ORA CHE CONTA È QUELLA DI ROMA ══')
{
  // ⚠️⚠️ Il caso vero che questa prova esiste per fermare: su Vercel il cron gira
  // in UTC. D'estate le 09:30 italiane sono le 07:30 UTC — cioè, leggendo l'ora
  // del server, l'app direbbe «non c'è nessuno in turno» mentre il turno è
  // appena cominciato, e si metterebbe a rispondere sopra a chi lavora.
  const mattina = new Date('2026-08-25T07:30:00Z') // martedì 25/08, 09:30 a Roma (ora legale)
  const r = adessoARoma(mattina)
  prova('le 07:30 UTC sono le 09:30 a Roma', r.minuti === 9 * 60 + 30, `${r.minuti} minuti`)
  prova('ed è martedì (giorno 2)', r.settimana === 2, String(r.settimana))
  prova('la data romana è il 25/08', r.giorno === '2026-08-25', r.giorno)
}
{
  // ⚠️ E l'altro lato: a mezzanotte e mezza italiana in UTC è ancora il giorno
  // prima. Chiedendo i turni col giorno sbagliato si guarderebbe la griglia di
  // domenica per un lunedì.
  const notte = new Date('2026-08-24T22:30:00Z') // 00:30 di martedì 25 a Roma (in UTC è ancora lunedì 24)
  const r = adessoARoma(notte)
  prova('le 22:30 UTC di lunedì sono le 00:30 di martedì a Roma', r.minuti === 30, `${r.minuti}`)
  // ⚠️ Il punto: in UTC è ancora il 24 (lunedì). Leggendo l'ora del server si
  // guarderebbe la griglia del giorno prima.
  prova('e il giorno è già il 25, martedì', r.settimana === 2 && r.giorno === '2026-08-25', `${r.giorno} · ${r.settimana}`)
}

console.log('\n══ COM È MESSA ADESSO, DAVVERO ══')
const conf = await leggiImpostazioni(['aiFuoriTurnoAttivo'])
console.log(`   interruttore: ${conf.aiFuoriTurnoAttivo === 'si' ? 'ACCESO' : 'spento'}`)
const inTurno = await chiEInTurno()
console.log(`   in turno adesso: ${inTurno.length ? inTurno.join(', ') : 'nessuno'}`)
console.log(`   turni scritti in griglia: ${await db.turnoSettimanale.count()}`)
console.log(`   risposte pronte attive: ${await db.script.count({ where: { attivo: true } })}`)

console.log('\n══ IL GIRO, SENZA MANDARE NIENTE ══')
const esito = await giroAiFuoriTurno({ prova: true })
console.log(`   fermo: ${esito.fermo || '(no, è partito)'}`)
console.log(`   risponderebbe a ${esito.risposte} · chiederebbe aiuto per ${esito.domande} · salta ${esito.saltate}`)
for (const r of esito.righe) console.log(`   · ${r}`)

// ⚠️ La prova NON pretende che il giro faccia qualcosa: dipende da chi è in
// turno e da cosa c'è in inbox in questo momento. Pretende che sia COERENTE.
prova(
  'se c è qualcuno in turno, il giro non parte',
  inTurno.length === 0 || (esito.risposte === 0 && esito.domande === 0),
  inTurno.length ? `in turno: ${inTurno.join(', ')}` : 'non c è nessuno'
)
prova(
  'spento = non fa niente',
  conf.aiFuoriTurnoAttivo === 'si' || (esito.risposte === 0 && esito.domande === 0)
)

console.log('\n══ IL NUMERO A CUI CHIEDE ══')
const c = await leggiImpostazioni(['aiutoWhatsApp'])
const numero = (c.aiutoWhatsApp || '393498853209').replace(/\D/g, '')
prova('è il numero chiesto dall utente', numero === '393498853209', `+${numero}`)

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
