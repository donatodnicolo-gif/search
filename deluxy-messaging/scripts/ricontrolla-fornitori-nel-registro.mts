// L'ESITO DEL REGISTRO SULLE RICHIESTE GIÀ PAGATE.
//
// ⚠️⚠️ Correggere il codice non corregge quello che il codice ha già scritto. Le
// colonne `registroEsito`/`registroMessaggio` sono nate il 27/08/2026: tutte le
// richieste precedenti le hanno vuote, e «vuoto» vuol dire «non lo sappiamo» —
// non «va bene». Senza questo giro, la sezione «Il registro non sa chi sono»
// della Riconciliazione elencherebbe **tutti e 28** i fornitori pagati, e i due
// che hanno davvero un problema annegherebbero in mezzo agli altri ventisei che
// stanno benissimo. Un elenco che non distingue è un elenco che non si guarda.
//
// ⚠️ Si passa dalla funzione di sempre (`segnalaFornitorePagatoAlRegistro`), che
// chiede il match e scrive **solo se è sicura**. È un upsert-merge idempotente:
// rifarlo su un fornitore già in registro non duplica niente e non sovrascrive i
// campi curati dal team — lo dice la guardia nel merge del registro.
//
// ⚠️ UNA richiesta per fornitore, non tutte: l'esito è del FORNITORE, e chiedere
// tre volte la stessa cosa per tre pagamenti dello stesso nome vuol dire tre
// chiamate al registro per una risposta sola.
//
// ⚠️ Con `--scrivi` esegue. Senza, dice soltanto cosa farebbe.
//
//   npx tsx scripts/ricontrolla-fornitori-nel-registro.mts [--scrivi]
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { chiaveNome } from '../src/lib/cerca-fornitore'
import { segnalaFornitorePagatoAlRegistro } from '../src/lib/registro-fornitori'

const scrivi = process.argv.includes('--scrivi')
const db = new PrismaClient()

const righe = await db.richiestaPagamento.findMany({
  where: { pagataIl: { not: null }, intestatario: { not: '' }, registroEsito: '' },
  select: { id: true, intestatario: true, importo: true },
  orderBy: { pagataIl: 'desc' },
})

// Una sola richiesta per fornitore: la più recente.
const per = new Map<string, { id: string; nome: string; quante: number }>()
for (const r of righe) {
  const k = chiaveNome(r.intestatario)
  if (!k) continue
  const g = per.get(k)
  if (g) g.quante++
  else per.set(k, { id: r.id, nome: r.intestatario.trim(), quante: 1 })
}

console.log(`richieste pagate senza esito: ${righe.length} · fornitori distinti: ${per.size}\n`)
if (!scrivi) {
  for (const v of per.values()) console.log(`  ${v.nome.slice(0, 46).padEnd(47)} (${v.quante} pagamenti)`)
  console.log(`\nPROVA — rilancia con --scrivi per chiedere al registro ${per.size} volte.`)
  await db.$disconnect()
  process.exit(0)
}

const conta = new Map<string, number>()
for (const v of per.values()) {
  const e = await segnalaFornitorePagatoAlRegistro(v.id, true, null)
  conta.set(e.esito, (conta.get(e.esito) ?? 0) + 1)
  const segno = e.esito === 'creato' || e.esito === 'aggiornato' ? '·' : '⚠️'
  console.log(`  ${segno} ${v.nome.slice(0, 42).padEnd(43)} ${e.esito.padEnd(16)} ${e.messaggio.slice(0, 70)}`)
  // ⚠️⚠️ L'esito si scrive su TUTTE le richieste di quel fornitore, non solo su
  // quella interrogata: la sezione della Riconciliazione raggruppa per nome, e
  // lasciare le sorelle vuote le farebbe ricomparire come «mai provato».
  const stesse = righe.filter((r) => chiaveNome(r.intestatario) === chiaveNome(v.nome))
  await db.richiestaPagamento.updateMany({
    where: { id: { in: stesse.map((r) => r.id) } },
    data: { registroEsito: e.esito, registroMessaggio: e.messaggio, registroIl: new Date() },
  })
}
console.log(`\nesiti: ${[...conta.entries()].map(([k, n]) => `${k} ${n}`).join(' · ')}`)
await db.$disconnect()
