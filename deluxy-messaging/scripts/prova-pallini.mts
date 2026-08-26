// Prova della regola del pallino giallo nel menu.
//
// ⚠️ I due casi che questa prova esiste per fermare: **tutti i pallini accesi la
// prima volta** (che vorrebbe dire «non ti conosco», non «è arrivato qualcosa»)
// e **il pallino acceso sulla pagina che si sta guardando**.
//
//   npx tsx scripts/prova-pallini.mts
import { decidiPallini, suQuestaPagina } from '../src/lib/pallini'

let male = 0
const prova = (nome: string, ok: boolean, extra = '') => {
  if (!ok) male++
  console.log(`${ok ? '  ok ' : '  NO '} ${nome}${extra ? ' — ' + extra : ''}`)
}
const A = '2026-08-27T09:00:00.000Z'
const B = '2026-08-27T10:00:00.000Z'

console.log('=== LA PRIMA VOLTA ===')
{
  const r = decidiPallini({ '/inbox': A, '/ordini': A }, {}, '/', true)
  prova('non accende niente', r.accesi.length === 0, JSON.stringify(r.accesi))
  prova('ma si segna dov’è il mondo', r.visto['/inbox'] === A && r.visto['/ordini'] === A)
}

console.log('\n=== POI ===')
{
  const r = decidiPallini({ '/inbox': B, '/ordini': A }, { '/inbox': A, '/ordini': A }, '/', false)
  prova('accende solo dove è cambiato', r.accesi.join() === '/inbox', JSON.stringify(r.accesi))
  prova('e NON sposta il segnalibro di quella accesa', r.visto['/inbox'] === A, r.visto['/inbox'])
}
{
  const r = decidiPallini({ '/inbox': A }, { '/inbox': A }, '/', false)
  prova('niente di nuovo, niente pallino', r.accesi.length === 0)
}

console.log('\n=== STANDO SULLA PAGINA ===')
{
  const r = decidiPallini({ '/inbox': B }, { '/inbox': A }, '/inbox', false)
  prova('sulla pagina il pallino non si accende', r.accesi.length === 0, JSON.stringify(r.accesi))
  prova('e il segnalibro avanza da solo', r.visto['/inbox'] === B, r.visto['/inbox'])
}
{
  const r = decidiPallini({ '/inbox': B }, { '/inbox': A }, '/inbox?c=abc', false)
  // ⚠️ Con un parametro nell'indirizzo il percorso resta `/inbox`: qui si passa
  // il percorso, non l'URL intero. La prova sta a dire che se qualcuno un giorno
  // ci passasse l'URL intero, il pallino resterebbe acceso mentre si guarda.
  prova('⚠️ con la query nel percorso NON riconosce la pagina', r.accesi.join() === '/inbox')
}
{
  const r = decidiPallini({ '/reclami': B }, { '/reclami': A }, '/reclami/casistiche', false)
  prova('una sotto-pagina conta come «ci sono sopra»', r.accesi.length === 0)
}

console.log('\n=== SEZIONI VUOTE ===')
{
  const r = decidiPallini({ '/chiamate': '', '/inbox': B }, { '/inbox': A }, '/', false)
  prova('una sezione senza niente non accende', !r.accesi.includes('/chiamate'))
  prova('e non finisce nel segnalibro', !('/chiamate' in r.visto))
}

console.log('\n=== IL SEGNALIBRO NON SI ROVINA ===')
{
  const visto = { '/inbox': A }
  const r = decidiPallini({ '/inbox': B }, visto, '/', false)
  prova('l’originale non viene toccato', visto['/inbox'] === A)
}

console.log('\n=== «CI SONO SOPRA» ===')
prova('la radice combacia solo con sé stessa', suQuestaPagina('/', '/') && !suQuestaPagina('/inbox', '/'))
prova('/ordini non prende /ordini-globali', !suQuestaPagina('/ordini-globali', '/ordini'))

console.log(male ? `\n${male} PROVE FALLITE` : '\nTutte le prove passate.')
process.exit(male ? 1 : 0)
