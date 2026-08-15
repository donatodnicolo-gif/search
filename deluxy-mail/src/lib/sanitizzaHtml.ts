// Ripulisce l'HTML di una mail prima di mostrarlo. È la PRIMA difesa; la
// seconda è l'iframe in sandbox senza script (vedi CorpoMessaggio), che
// impedisce comunque l'esecuzione di codice anche se qualcosa sfuggisse qui.
//
// Togliamo: script, iframe/object/embed (contenuti attivi), link/meta
// (risorse esterne e refresh), gli handler on... e gli URL javascript:.
// Teniamo: tag, stili inline, <style> (isolati nell'iframe), immagini, tabelle
// — cioè tutto ciò che serve a far apparire la mail come l'ha pensata chi l'ha
// scritta.

export function sanitizzaHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    // svg/math portano vettori a sé, <base> dirotta i link relativi: via del
    // tutto, non servono a mostrare una mail. Anche i tag NON chiusi (un
    // `<svg/onload=…>` senza `</svg>`), o resterebbero mezzi in piedi.
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<math[\s\S]*?<\/math>/gi, '')
    .replace(/<\/?(svg|math)\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    // Attributi on... (onclick, onload, onerror…), in TUTTE le forme.
    // ⚠️ Il separatore prima di «on» NON è solo uno spazio: un client può
    // scrivere `<img src=x /onerror="…">`, dove prima di onerror c'è una «/».
    // Il browser lo interpreta lo stesso come attributo (unexpected-solidus),
    // quindi va tolto anche quel caso — se no il gestore sopravvive e, appena
    // l'HTML finisce in innerHTML dell'editor di risposta, esegue (trovato in
    // revisione il 14/08/2026). Si cattura il separatore e lo si rimette, così
    // `x/onerror=…` non collassa in `xonerror=…`.
    .replace(/([\s"'`/])on\w+\s*=\s*"[^"]*"/gi, '$1')
    .replace(/([\s"'`/])on\w+\s*=\s*'[^']*'/gi, '$1')
    .replace(/([\s"'`/])on\w+\s*=\s*[^\s>]+/gi, '$1')
    // href/src/action che aprirebbero javascript: o data:text/html (esegue).
    .replace(/(href|src|action|formaction|xlink:href)\s*=\s*"\s*(javascript|data):[^"]*"/gi, '$1="#"')
    .replace(/(href|src|action|formaction|xlink:href)\s*=\s*'\s*(javascript|data):[^']*'/gi, "$1='#'")
    // @import remoti dentro i blocchi <style>
    .replace(/@import[^;]+;/gi, '')
}
