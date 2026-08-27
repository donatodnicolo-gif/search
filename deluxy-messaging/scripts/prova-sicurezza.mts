// LE REGOLE DI SICUREZZA CHE SI POSSONO PROVARE SENZA RETE.
//
//   npx tsx scripts/prova-sicurezza.mts
//
// ⚠️ Tre famiglie: l'indirizzo di un'app sorella, il tipo con cui si serve un
// allegato, e il cookie di sessione con la generazione dentro. Sono le tre
// correzioni del 27/08/2026 che hanno una regola pura da provare — il resto
// (chi può aprire una pagina, chi può chiamare un'azione) si prova sull'app.
import { indirizzoAmmesso, CAMPI_INDIRIZZO } from '../src/lib/indirizzi-app'

let fatte = 0
let rotte = 0
function prova(nome: string, avuto: unknown, atteso: unknown) {
  fatte++
  if (JSON.stringify(avuto) !== JSON.stringify(atteso)) {
    rotte++
    console.log(`  ✗ ${nome}\n      atteso: ${JSON.stringify(atteso)}\n      avuto:  ${JSON.stringify(avuto)}`)
  } else {
    console.log(`  ✓ ${nome}`)
  }
}

console.log('\n— dove può puntare un ponte verso un\'app sorella —')
prova('un\'app Deluxy su Vercel', indirizzoAmmesso('https://deluxy-anagrafiche.vercel.app'), true)
prova('la piattaforma', indirizzoAmmesso('https://app.deluxy.it'), true)
prova('un sottodominio Deluxy', indirizzoAmmesso('https://api.deluxy.it/v1'), true)
prova('vuoto = scollega, e si può fare', indirizzoAmmesso(''), true)
prova('solo spazi', indirizzoAmmesso('   '), true)

console.log('\n— e dove NON può —')
prova('⚠️ il server di un estraneo', indirizzoAmmesso('https://mio-server.example'), false)
prova('⚠️ http: la chiave andrebbe in chiaro', indirizzoAmmesso('http://deluxy-orders.vercel.app'), false)
prova('⚠️ un dominio che FINISCE per deluxy.it senza punto', indirizzoAmmesso('https://fintodeluxy.it'), false)
prova('⚠️ deluxy.it come SOTTODOMINIO di un altro', indirizzoAmmesso('https://deluxy.it.attaccante.com'), false)
prova('⚠️ vercel.app come pezzo di un altro host', indirizzoAmmesso('https://vercel.app.attaccante.com'), false)
prova('non è nemmeno un indirizzo', indirizzoAmmesso('ciao'), false)
prova('⚠️ javascript:', indirizzoAmmesso('javascript:alert(1)'), false)
prova('⚠️ un indirizzo con le credenziali dentro', indirizzoAmmesso('https://x:y@mio-server.example'), false)

console.log('\n— i campi a cui la regola si applica —')
prova('sono cinque', CAMPI_INDIRIZZO.size, 5)
for (const c of ['ordersUrl', 'searchUrl', 'partnerUrl', 'anagraficheUrl', 'piattaformaUrl']) {
  prova(`c'è ${c}`, CAMPI_INDIRIZZO.has(c), true)
}

// ── Il tipo con cui si serve un allegato ──
//
// ⚠️ La funzione sta dentro la rotta e non si importa (importare un `route.ts`
// tira dentro Prisma e le intestazioni di Next). Si riprova qui la REGOLA, che
// è la cosa che conta, e si controlla che la rotta la contenga davvero.
import fs from 'node:fs'
const rotta = fs.readFileSync('src/app/api/media/[id]/route.ts', 'utf8')

console.log('\n— l\'allegato non può dichiarare di essere una pagina —')
prova('la lista bianca c\'è', rotta.includes('const APRIBILI = new Set(['), true)
prova('⚠️ text/html NON è in lista', /APRIBILI[\s\S]*?\]\)/.exec(rotta)?.[0].includes('text/html') ?? true, false)
prova('⚠️ image/svg+xml NON è in lista', /APRIBILI[\s\S]*?\]\)/.exec(rotta)?.[0].includes('svg') ?? true, false)
prova('image/jpeg sì (126 messaggi veri)', /APRIBILI[\s\S]*?\]\)/.exec(rotta)?.[0].includes("'image/jpeg'") ?? false, true)
prova('audio/ogg sì (3 messaggi veri)', /APRIBILI[\s\S]*?\]\)/.exec(rotta)?.[0].includes("'audio/ogg'") ?? false, true)
prova('nosniff c\'è', rotta.includes("'X-Content-Type-Options': 'nosniff'"), true)
prova('quello che non è in lista si SCARICA', rotta.includes("ok ? 'inline' : 'attachment'"), true)
prova('e diventa octet-stream', rotta.includes("ok ? tipo : 'application/octet-stream'"), true)
prova(
  '⚠️ il tipo NON arriva più crudo dall\'intestazione di Meta',
  rotta.includes("'Content-Type':\n          file.headers.get('content-type')"),
  false
)

// ── Il cookie di sessione ──
console.log('\n— il cookie porta la generazione, ed è dentro la firma —')
const auth = fs.readFileSync('src/lib/auth.ts', 'utf8')
prova('creaSessione vuole anche la generazione', /creaSessione\(userId: string, generazione: number\)/.test(auth), true)
prova('la firma copre id E generazione', auth.includes('const corpo = `${userId}.${generazione}`'), true)
prova('il confronto resta a tempo costante', auth.includes('diff |= dato.charCodeAt(i) ^ atteso.charCodeAt(i)'), true)
const sess = fs.readFileSync('src/lib/sessione.ts', 'utf8')
prova('⚠️ e la generazione si CONFRONTA col database', sess.includes('utente.generazione !== sessione.generazione'), true)
const utenti = fs.readFileSync('src/app/(app)/utenti/actions.ts', 'utf8')
prova('cambiare la password la fa salire', utenti.includes('generazione: { increment: 1 }'), true)

// ── I cancelli ──
console.log('\n— la configurazione è dell\'amministratore —')
for (const c of ['impostazioni', 'caselle', 'negozi', 'numeri-whatsapp', 'account-meta', 'aspetto-widget']) {
  const azioni = fs.readFileSync(`src/app/(app)/${c}/actions.ts`, 'utf8')
  const quante = (azioni.match(/^export async function /gm) ?? []).length
  const protette = (azioni.match(/await soloAmministratore\(\)/g) ?? []).length
  prova(`${c}: tutte e ${quante} le azioni hanno il cancello`, protette, quante)
  const pagina = fs.readFileSync(`src/app/(app)/${c}/page.tsx`, 'utf8')
  prova(`${c}: e la pagina pure`, pagina.includes('await soloAmministratore()'), true)
}
const barra = fs.readFileSync('src/components/Sidebar.tsx', 'utf8')
prova('⚠️ e il menu non le mostra più a tutti', /\.\.\.\(amministratore[\s\S]{0,900}\/impostazioni/.test(barra), true)

console.log('\n— le eccezioni del middleware sono ANCORATE, e widget.js è fra loro —')
const mw = fs.readFileSync('src/middleware.ts', 'utf8')
const matcher = /matcher: \[\s*'([^']+)'/.exec(mw)?.[1] ?? ''
prova("il matcher c'è", matcher.length > 0, true)
// ⚠️⚠️ `widget.js` È LO SCRIPT CHE I SITI DEI CLIENTI CARICANO col tag
// `<script src="…/widget.js">`. Ancorando le eccezioni ha smesso di combaciare
// con «widget» (che prima valeva per PREFISSO) ed è finito dietro al cancello:
// 307 verso /login, e la chat spariva da tutti e tre i siti. Nessun errore da
// nessuna parte — solo uno script che non si carica. Da qui in poi lo dice una
// prova, invece di doverselo ricordare.
//
// ⚠️ La stringa nel file è già una regex: qui si legge com'è e si applica ai
// percorsi veri, invece di riscriverne una somigliante — riscriverla vorrebbe
// dire provare la copia e non l'originale.
// ⚠️ Nel file il matcher è un LETTERALE JS: `\\.` sono due caratteri nel
// sorgente e uno solo a runtime. Senza questo `replace` si proverebbe una regex
// diversa da quella che gira davvero — e una prova che non prova l'originale è
// peggio di nessuna prova ([[trappola-confronto-con-il-proprio-specchio]]).
const cancello = new RegExp('^' + matcher.replace(/\\\\/g, '\\') + '$')
const protetto = (p: string) => cancello.test(p)
prova('⚠️ /widget.js resta PUBBLICO', protetto('/widget.js'), false)
prova('/widget resta pubblico', protetto('/widget'), false)
prova('/login resta pubblico', protetto('/login'), false)
prova('/registrati resta pubblico', protetto('/registrati'), false)
prova('/chat/abc resta pubblico', protetto('/chat/abc'), false)
prova('/api/health resta pubblico', protetto('/api/health'), false)
prova('/api/widget/messaggi resta pubblico', protetto('/api/widget/messaggi'), false)
prova('/favicon.ico resta pubblico', protetto('/favicon.ico'), false)
prova('⚠️ /loginX è PROTETTO', protetto('/loginX'), true)
prova('⚠️ /widget-statistiche è PROTETTO', protetto('/widget-statistiche'), true)
prova('⚠️ /chat-interna è PROTETTO', protetto('/chat-interna'), true)
prova('⚠️ /api/cronologia è PROTETTO', protetto('/api/cronologia'), true)
prova('/impostazioni è protetto', protetto('/impostazioni'), true)
prova('/api/clienti è protetto', protetto('/api/clienti'), true)

console.log('\n— le intestazioni di sicurezza non spengono il widget —')
const cfg = fs.readFileSync('next.config.ts', 'utf8')
prova('X-Frame-Options c\'è', cfg.includes('"X-Frame-Options", value: "DENY"'), true)
prova('e il widget resta incorniciabile', cfg.includes('frame-ancestors *'), true)
// ⚠️ La regola larga (`/(.*)`) metterebbe DENY anche sul widget, e il widget
// dentro l'iframe dei clienti È il prodotto: sarebbe una correzione di
// sicurezza che spegne una funzione che funziona.
// ⚠️ Con la virgola in fondo: senza, questa riga combacia anche col COMMENTO
// che spiega perché il source largo sarebbe sbagliato — e la prova fallirebbe
// per aver trovato la propria spiegazione.
prova('⚠️ il source NON è largo', cfg.includes('source: "/(.*)",'), false)
prova('⚠️ ed è ancorato, non per prefisso', cfg.includes('source: "/((?!widget).*)",'), false)

console.log('\n— il webhook senza segreti si CHIUDE —')
const wh = fs.readFileSync('src/app/api/webhooks/meta/route.ts', 'utf8')
prova('non c\'è più il ramo che salta la verifica', wh.includes('if (segreti.length) {'), false)
prova('senza segreti risponde 503', wh.includes("return new NextResponse('Webhook non configurato', { status: 503 })"), true)

console.log(`\n${fatte - rotte}/${fatte} passate${rotte ? ` — ${rotte} ROTTE` : ''}`)
process.exit(rotte ? 1 : 0)
