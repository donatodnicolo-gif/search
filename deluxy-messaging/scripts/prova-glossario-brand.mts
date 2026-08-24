// Prova di che cosa si scrive in glossario accettando una proposta,
// soprattutto del BRAND.
//
// ⚠️⚠️ Perche' il brand e' diverso dagli altri campi: cambia il SENSO della
// voce, non la sua forma. «La consegna e' gratuita» e' vera per un negozio e
// falsa per un altro, e accettarla per TUTTI quando vale per uno solo mette in
// bocca agli operatori una promessa sbagliata — il glossario e' fatto apposta
// perche' la ripetano.
import { testoDaScrivere } from '../src/lib/glossario'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

// La proposta vera dello screenshot: nata senza brand, cioe' «vale per tutti».
const proposta = {
  termine: 'Consegna gratuita',
  definizione: 'La consegna è gratuita, ma dipende dalla disponibilità dell’artista.',
  categoria: 'cliente',
  negozioId: '',
}

console.log('══ SI ACCETTA COM E ══')
{
  const s = testoDaScrivere(proposta, {})
  prova('niente mandato = niente cambiato', !s.corretta)
  prova('  e il brand resta quello proposto', s.negozioId === '')
}

console.log('\n══ SI RESTRINGE A UN MARCHIO ══')
{
  const s = testoDaScrivere(proposta, { negozioId: 'neg-flowers' })
  prova('il brand scelto vince', s.negozioId === 'neg-flowers', s.negozioId)
  // ⚠️ Cambiare SOLO il brand, a testo identico, E' una correzione: cambia a chi
  // quella frase si puo' dire. Senza questo, l'archivio direbbe «proposta
  // dall'AI e accettata cosi'» di una voce che una persona ha ristretto.
  prova('e conta come correzione anche se il testo non cambia', s.corretta)
  prova('  il testo resta quello proposto', s.termine === proposta.termine && s.definizione === proposta.definizione)
}

console.log('\n══ SI ALLARGA A TUTTI (il caso che si perdeva) ══')
{
  const nataPerUno = { ...proposta, negozioId: 'neg-cake' }
  // ⚠️⚠️ QUI STA LA TRAPPOLA: la stringa VUOTA e' un valore vero («tutti i
  // marchi»), non un campo non compilato. Col solito `|| p.negozioId` il vuoto
  // verrebbe scambiato per «non me l'hanno detto» e ricadrebbe su «neg-cake»:
  // allargare una voce a tutti sarebbe stato IMPOSSIBILE, in silenzio.
  const s = testoDaScrivere(nataPerUno, { negozioId: '' })
  prova('vuoto mandato = vale per tutti', s.negozioId === '', JSON.stringify(s.negozioId))
  prova('  ed e' + ' una correzione', s.corretta)
  // Il contrario: campo assente davvero → resta com'era.
  const t = testoDaScrivere(nataPerUno, { termine: 'Consegna gratuita' })
  prova('campo ASSENTE = non si tocca il brand', t.negozioId === 'neg-cake', t.negozioId)
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
