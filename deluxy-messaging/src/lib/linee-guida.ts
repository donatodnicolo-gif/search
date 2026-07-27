// L'esportazione delle linee guida: le regole con cui rispondiamo ai clienti,
// tirate fuori dall'app come documento da leggere, mandare o stampare.
//
// A cosa serve davvero: le stesse regole che legge l'AI devono poterle leggere
// le persone — chi entra in squadra, chi lavora dall'esterno, chi deve
// approvarle. Se il tono di voce vive solo dentro un prompt, esiste per il
// modello e non per l'azienda.
//
// Escono i PALETTI insieme alle istruzioni: chi legge il documento deve sapere
// che certe cose l'AI non le dirà mai, altrimenti si domanda perché non promette
// mai un rimborso.

import { PALETTI, nomeAmbito } from './cs-ai'

export type RigaGuida = {
  id: string
  titolo: string
  categoria: string
  testo: string
  ambito: string
  attiva: boolean
  sostituisceId: string | null
  negozio: { nome: string } | null
  documento: { nome: string } | null
}

/**
 * Le regole generali che, per il brand esportato, sono state sostituite da una
 * regola di brand.
 *
 * ⚠️ Non si tolgono dal documento: si MARCANO. Toglierle farebbe sparire una
 * regola che per gli altri brand vale eccome, e chi legge non capirebbe perché
 * il documento di Cake non parla di firma mentre quello di Flowers sì. Ma
 * lasciarle lì senza dire niente sarebbe peggio: il documento dichiara di
 * contenere quello che legge l'AI, e quella riga l'AI non la legge.
 */
function sostituite(righe: RigaGuida[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of righe) {
    if (r.negozio && r.sostituisceId) {
      const chi = righe.find((x) => x.id === r.sostituisceId)
      if (chi) m.set(chi.id, r.titolo)
    }
  }
  return m
}

export type Intestazione = {
  brand: string | null
  quando: Date
  /** Se false, nel documento entrano anche le regole spente, marcate. */
  soloAttive: boolean
}

function raggruppa(righe: RigaGuida[]): Map<string, RigaGuida[]> {
  const m = new Map<string, RigaGuida[]>()
  for (const r of righe) {
    const k = r.categoria || 'Generale'
    m.set(k, [...(m.get(k) ?? []), r])
  }
  return m
}

const dataLunga = (d: Date) =>
  d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

export function titoloDocumento(brand: string | null): string {
  return brand
    ? `Linee guida di risposta ai clienti — ${brand}`
    : 'Linee guida di risposta ai clienti — Deluxy'
}

/** Il documento in Markdown: si legge com'è, si incolla dove serve. */
export function inMarkdown(righe: RigaGuida[], testa: Intestazione): string {
  const out: string[] = []
  out.push(`# ${titoloDocumento(testa.brand)}`)
  out.push('')
  out.push(
    `_Documento generato da Deluxy Customer Service il ${dataLunga(testa.quando)}._` +
      (testa.brand ? '' : ' _Valgono per tutti i brand del gruppo._')
  )
  out.push('')
  out.push(
    'Sono le regole con cui rispondiamo ai clienti, in chat e per email. Le stesse ' +
      'vengono lette dall’assistente AI quando propone una risposta: qui non c’è una ' +
      'versione per le persone e una per la macchina.'
  )
  out.push('')
  out.push('## Regole che non si toccano')
  out.push('')
  out.push(
    'Valgono sempre e non si possono disattivare dall’app: sono ciò che impedisce di ' +
      'promettere a un cliente cose che l’azienda non ha deciso.'
  )
  out.push('')
  for (const p of PALETTI) out.push(`- ${p}`)
  out.push('')

  if (!righe.length) {
    out.push('## Istruzioni')
    out.push('')
    out.push('_Nessuna istruzione registrata per questa selezione._')
    return out.join('\n') + '\n'
  }

  const rimpiazzate = sostituite(righe)
  for (const [categoria, elenco] of raggruppa(righe)) {
    out.push(`## ${categoria}`)
    out.push('')
    for (const r of elenco) {
      const note: string[] = []
      if (r.ambito !== 'tutti') note.push(nomeAmbito(r.ambito).toLowerCase())
      if (r.negozio) note.push(`brand ${r.negozio.nome}`)
      if (!r.attiva) note.push('**disattivata**')
      const da = rimpiazzate.get(r.id)
      if (da) note.push(`**qui non vale**`)
      out.push(`### ${r.titolo}${note.length ? ` _(${note.join(' · ')})_` : ''}`)
      out.push('')
      out.push(r.testo)
      if (da) {
        out.push('')
        out.push(
          `> Per ${testa.brand} questa regola **non si applica**: al suo posto vale «${da}».`
        )
      }
      if (r.documento) {
        out.push('')
        out.push(`_Fonte: ${r.documento.nome}._`)
      }
      out.push('')
    }
  }
  return out.join('\n')
}

const scappa = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Il documento in HTML, pensato per essere STAMPATO (o salvato in PDF dal
 * browser). Non si genera un PDF lato server: servirebbe un motore di
 * impaginazione dentro una funzione serverless per ottenere lo stesso file che
 * il browser produce già con Ctrl+P.
 */
export function inHtml(righe: RigaGuida[], testa: Intestazione): string {
  const titolo = titoloDocumento(testa.brand)
  const sezioni: string[] = []

  const rimpiazzate = sostituite(righe)
  for (const [categoria, elenco] of raggruppa(righe)) {
    const voci = elenco
      .map((r) => {
        const note: string[] = []
        if (r.ambito !== 'tutti') note.push(nomeAmbito(r.ambito))
        if (r.negozio) note.push(`brand ${r.negozio.nome}`)
        if (!r.attiva) note.push('disattivata')
        const da = rimpiazzate.get(r.id)
        if (da) note.push('qui non vale')
        return `<article${da ? ' class="sostituita"' : ''}>
  <h3>${scappa(r.titolo)}${
    note.length ? note.map((n) => ` <span class="tag">${scappa(n)}</span>`).join('') : ''
  }</h3>
  <p>${scappa(r.testo)}</p>
  ${
    da
      ? `<p class="fonte">Per ${scappa(testa.brand ?? '')} questa regola non si applica: al suo posto vale «${scappa(da)}».</p>`
      : ''
  }
  ${r.documento ? `<p class="fonte">Fonte: ${scappa(r.documento.nome)}</p>` : ''}
</article>`
      })
      .join('\n')
    sezioni.push(`<section><h2>${scappa(categoria)}</h2>\n${voci}</section>`)
  }

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>${scappa(titolo)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --oro:#B8963E; --bordo:#E5E5E7; --grigio:#6E6E73; }
  * { box-sizing:border-box }
  body { font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         color:#1D1D1F; max-width:760px; margin:0 auto; padding:48px 28px; }
  h1 { font-size:30px; letter-spacing:-.6px; margin:0 0 6px }
  h2 { font-size:20px; letter-spacing:-.3px; margin:38px 0 14px;
       padding-bottom:8px; border-bottom:1px solid var(--bordo) }
  h3 { font-size:16px; margin:0 0 4px }
  p { margin:0 0 10px }
  article { margin:0 0 20px }
  .meta { color:var(--grigio); font-size:14px; margin-bottom:26px }
  .intro { color:#3A3A3C }
  .paletti { background:#FAFAFA; border:1px solid var(--bordo); border-left:3px solid var(--oro);
             border-radius:12px; padding:18px 22px; margin:24px 0 8px }
  .paletti h2 { border:0; margin:0 0 8px; font-size:17px }
  .paletti ul { margin:10px 0 0; padding-left:20px }
  .paletti li { margin-bottom:8px }
  .tag { font-size:12px; color:var(--grigio); border:1px solid var(--bordo);
         border-radius:999px; padding:2px 9px; margin-left:6px; font-weight:400;
         white-space:nowrap; display:inline-block; vertical-align:middle }
  .fonte { color:var(--grigio); font-size:13px }
  .sostituita { opacity:.6 }
  .sostituita h3 { text-decoration:line-through; text-decoration-color:#C7C7CC }
  .stampa { position:fixed; top:20px; right:20px; background:#1D1D1F; color:#fff;
            border:0; border-radius:999px; padding:10px 20px; font-size:14px; cursor:pointer }
  @media print { .stampa { display:none } body { padding:0; max-width:none } }
</style>
</head>
<body>
<button class="stampa" onclick="window.print()">Stampa o salva in PDF</button>
<h1>${scappa(titolo)}</h1>
<p class="meta">Generato da Deluxy Customer Service il ${dataLunga(testa.quando)}${
    testa.brand ? '' : ' · valgono per tutti i brand del gruppo'
  }</p>
<p class="intro">Sono le regole con cui rispondiamo ai clienti, in chat e per email.
Le stesse vengono lette dall’assistente AI quando propone una risposta: non c’è una
versione per le persone e una per la macchina.</p>

<div class="paletti">
  <h2>Regole che non si toccano</h2>
  <p>Valgono sempre e non si possono disattivare dall’app: sono ciò che impedisce di
  promettere a un cliente cose che l’azienda non ha deciso.</p>
  <ul>${PALETTI.map((p) => `<li>${scappa(p)}</li>`).join('')}</ul>
</div>

${sezioni.join('\n') || '<section><p class="meta">Nessuna istruzione registrata per questa selezione.</p></section>'}
</body>
</html>`
}

/** Nome del file scaricato: leggibile, datato, senza caratteri che Windows rifiuta. */
export function nomeFile(brand: string | null, estensione: string, quando: Date): string {
  const giorno = quando.toISOString().slice(0, 10)
  const marca = brand ? '-' + brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''
  return `linee-guida-clienti${marca}-${giorno}.${estensione}`
}
