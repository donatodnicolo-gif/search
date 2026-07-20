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
    // Attributi on... (onclick, onload, onerror…), in tutte le forme di quoting.
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    // href/src che aprirebbero javascript:
    .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
    // @import remoti dentro i blocchi <style>
    .replace(/@import[^;]+;/gi, '')
}
