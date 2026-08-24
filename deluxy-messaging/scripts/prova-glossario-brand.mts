// Prova dei MARCHI di una voce di glossario.
//
// ⚠️⚠️ Perche' i marchi sono diversi dagli altri campi: cambiano il SENSO della
// voce, non la sua forma. «La consegna e' gratuita» e' vera per un negozio e
// falsa per un altro, e accettarla per TUTTI quando vale per due su tre mette in
// bocca agli operatori una promessa sbagliata — il glossario e' fatto apposta
// perche' la ripetano.
//
// ⚠️⚠️ E LA LISTA VUOTA VUOL DIRE «TUTTI», non «nessuno». E' il contrario di
// quello che verrebbe da pensare guardando un array vuoto, ed e' la cosa da non
// sbagliare in questo file.
import {
  marchiScritti,
  marchiSiSovrappongono,
  stessiMarchi,
  testoDaScrivere,
  valePer,
  valePerTutti,
} from '../src/lib/glossario'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

const CAKE = 'id-cake'
const FLOWERS = 'id-flowers'
const DELUXY = 'id-deluxy'
const NOMI = new Map([[CAKE, 'Cake'], [FLOWERS, 'FLowers'], [DELUXY, 'Deluxy']])

console.log('══ LA LISTA VUOTA VUOL DIRE «TUTTI» ══')
prova('vuota = tutti', valePerTutti([]))
prova('con un marchio = non tutti', !valePerTutti([CAKE]))
prova('una voce globale vale anche per Cake', valePer([], CAKE))
prova('una voce di Cake NON vale per FLowers', !valePer([CAKE], FLOWERS))
prova('una voce di Cake+FLowers vale per FLowers', valePer([CAKE, FLOWERS], FLOWERS))
prova('senza filtro si vede tutto', valePer([CAKE], ''))
prova('scritta com e', marchiScritti([CAKE, FLOWERS], NOMI) === 'Cake · FLowers', marchiScritti([CAKE, FLOWERS], NOMI))
prova('e vuota si scrive «tutti i marchi»', marchiScritti([], NOMI) === 'tutti i marchi')

console.log('\n══ QUANDO DUE VOCI SI DANNO FASTIDIO ══')
// ⚠️ Col passaggio ai marchi multipli e' caduto il vincolo di unicita' su
// (termine, marchio): due voci con lo stesso termine e marchi DIVERSI sono
// legittime. Quello che non va bene e' che si SOVRAPPONGANO.
prova('Cake e FLowers non si danno fastidio', !marchiSiSovrappongono([CAKE], [FLOWERS]))
prova('Cake+Deluxy contro FLowers nemmeno', !marchiSiSovrappongono([CAKE, DELUXY], [FLOWERS]))
prova('Cake+FLowers contro FLowers SI', marchiSiSovrappongono([CAKE, FLOWERS], [FLOWERS]))
// ⚠️ Il caso che si dimentica: «tutti» si sovrappone con QUALUNQUE cosa.
prova('«tutti» contro Cake: si sovrappongono', marchiSiSovrappongono([], [CAKE]))
prova('Cake contro «tutti»: idem', marchiSiSovrappongono([CAKE], []))
prova('«tutti» contro «tutti»: si', marchiSiSovrappongono([], []))

console.log('\n══ LO STESSO INSIEME, IN ALTRO ORDINE ══')
prova('l ordine non conta', stessiMarchi([CAKE, FLOWERS], [FLOWERS, CAKE]))
prova('ma il numero si', !stessiMarchi([CAKE], [CAKE, FLOWERS]))

// La proposta vera dello screenshot: nata senza marchio, cioe' «vale per tutti».
const proposta = {
  termine: 'Consegna gratuita',
  definizione: 'La consegna è gratuita, ma dipende dalla disponibilità dell’artista.',
  categoria: 'cliente',
  negozioId: '',
}

console.log('\n══ SI ACCETTA COM E ══')
{
  const s = testoDaScrivere(proposta, {})
  prova('niente mandato = niente cambiato', !s.corretta)
  prova('  e resta valida per tutti', s.negoziIds.length === 0)
}

console.log('\n══ SI SCEGLIE PIU DI UN MARCHIO ══')
{
  const s = testoDaScrivere(proposta, { negoziIds: [CAKE, FLOWERS] })
  prova('tutti e due i marchi arrivano', stessiMarchi(s.negoziIds, [CAKE, FLOWERS]), s.negoziIds.join(', '))
  // ⚠️ Cambiare SOLO i marchi, a testo identico, E' una correzione: cambia a chi
  // quella frase si puo' dire. Senza, l'archivio direbbe «proposta dall'AI e
  // accettata cosi'» di una voce che una persona ha ristretto.
  prova('e conta come correzione anche a testo identico', s.corretta)
  prova('  il testo resta quello proposto', s.termine === proposta.termine)
  const doppio = testoDaScrivere(proposta, { negoziIds: [CAKE, CAKE, ' '] })
  prova('i doppioni e gli spazi si buttano', stessiMarchi(doppio.negoziIds, [CAKE]), doppio.negoziIds.join('|'))
}

console.log('\n══ SI ALLARGA A TUTTI (il caso che si perdeva) ══')
{
  const nataPerUno = { ...proposta, negozioId: CAKE }
  // ⚠️⚠️ QUI STA LA TRAPPOLA: la lista VUOTA e' un valore vero («tutti i
  // marchi»), non un campo non compilato. Col solito `|| p.negozioId` il vuoto
  // verrebbe scambiato per «non me l'hanno detto» e ricadrebbe su Cake:
  // allargare una voce a tutti sarebbe stato IMPOSSIBILE, in silenzio.
  const s = testoDaScrivere(nataPerUno, { negoziIds: [] })
  prova('lista vuota mandata = vale per tutti', s.negoziIds.length === 0)
  prova('  ed e una correzione', s.corretta)
  // Il contrario: campo assente davvero → resta com'era.
  const t = testoDaScrivere(nataPerUno, { termine: 'Consegna gratuita' })
  prova('campo ASSENTE = non si toccano i marchi', stessiMarchi(t.negoziIds, [CAKE]), t.negoziIds.join(', '))
  prova('  e non e una correzione', !t.corretta)
}

console.log('\n══ GLI ALTRI CAMPI, COME PRIMA ══')
{
  const s = testoDaScrivere(proposta, { definizione: 'Riscritta a mano.' })
  prova('testo cambiato = correzione', s.corretta)
  prova('  e il termine resta', s.termine === proposta.termine)
  const c = testoDaScrivere(proposta, { categoria: 'tecnico' })
  prova('categoria cambiata = correzione', c.corretta && c.categoria === 'tecnico')
  const v = testoDaScrivere(proposta, { termine: '   ' })
  prova('un campo di soli spazi non cancella il termine', v.termine === proposta.termine)
}

console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
