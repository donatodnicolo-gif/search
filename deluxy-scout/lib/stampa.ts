// LA COPIA STAMPABILE DELLA PRO-FORMA, dentro Scout.
//
// Richiesta dell'utente (28/08/2026): «consenti il download direttamente da
// app di questa pro-forma senza aprire finance».
//
// ⚠️ **Il documento vive su FINANCE** (numerazione, righe, intestazione
// congelata) e la sua pagina è dietro login — verificato: /proforma/<id>
// risponde 307 verso /login. Da qui non si può «scaricare il suo PDF», perché
// un PDF non esiste: anche su FINANCE si stampa dal browser. Quindi Scout fa
// la stessa cosa: chiede i DATI del documento all'API (righe, totali, date) e
// li impagina con il template del brand — che è SUO (template_documento) — in
// una finestra pronta per «Salva come PDF».
//
// ⚠️ Il template usato è quello di OGGI, non la fotografia congelata al
// momento dell'emissione (l'API non la espone): se l'intestazione è cambiata
// dopo, la copia può differire dal documento che il cliente ha ricevuto. Per
// questo in fondo c'è scritto che è una copia emessa da Scout.
import type { IntestazioneDocumento } from '@/lib/template-documento';
import type { DocumentoProforma } from '@/lib/partner';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const euro = (n: number | null | undefined) =>
  n == null ? '—' : '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Apre la finestra di stampa con il documento impaginato. Solo web: sul
 * telefono si apre il link di FINANCE, che resta la casa del documento.
 *
 * Torna false se il browser ha bloccato la finestra (popup): chi chiama lo
 * DICE, perché un bottone che non fa niente insegna a non premerlo.
 */
export function stampaProforma(doc: DocumentoProforma, int: Partial<IntestazioneDocumento> | null): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const w = window.open('', '_blank', 'noopener,width=900,height=1000');
  if (!w) return false;

  const righeHtml = (doc.righe ?? [])
    .map(
      (r) => `<tr>
        <td>${esc(r.descrizione)}</td>
        <td class="num">${r.quantita ?? 1}</td>
        <td class="num">${euro(r.prezzoUnitario)}</td>
        <td class="num">${r.aliquotaIva ?? 22}%</td>
        <td class="num">${euro(r.importo)}</td>
      </tr>`,
    )
    .join('');

  const titolo = doc.tipo === 'preventivo' ? 'Preventivo' : 'Pro-forma';
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>${esc(doc.riferimento)} · ${esc(doc.partner?.nome ?? '')}</title>
<style>
  body{font-family:-apple-system,"Segoe UI",system-ui,sans-serif;color:#111318;margin:40px auto;max-width:760px;font-size:14px;line-height:1.5}
  header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:1px solid #ddd;padding-bottom:18px}
  img.logo{max-height:64px;max-width:200px;object-fit:contain}
  h1{font-size:22px;margin:24px 0 2px}
  .rif{color:#6E6E73}
  .blocco{margin-top:18px}
  .etich{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#96782E}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6E6E73;text-align:left;border-bottom:1px solid #ccc;padding:6px 8px}
  td{border-bottom:1px solid #eee;padding:8px}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .totali{margin-top:14px;margin-left:auto;width:280px}
  .totali div{display:flex;justify-content:space-between;padding:3px 8px}
  .totali .tot{font-weight:800;border-top:1px solid #111318;margin-top:4px;padding-top:7px}
  footer{margin-top:36px;color:#6E6E73;font-size:12px;border-top:1px solid #eee;padding-top:12px}
  .nota-copia{margin-top:18px;font-size:11px;color:#8E8E93}
  @media print{ .no-print{display:none} body{margin:10mm} }
  .no-print{position:fixed;top:12px;right:12px;background:#111318;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer}
</style></head><body>
<button class="no-print" onclick="window.print()">Stampa / Salva PDF</button>
<header>
  <div>
    ${int?.logoDataUrl ? `<img class="logo" src="${esc(int.logoDataUrl)}" alt="">` : ''}
    <div style="font-weight:700;margin-top:6px">${esc(int?.ragioneSociale ?? 'Deluxy Srl')}</div>
    <div>${esc(int?.indirizzo ?? '')}</div>
    <div>${int?.piva ? 'P.IVA ' + esc(int.piva) : ''}${int?.rea ? ' · REA ' + esc(int.rea) : ''}</div>
    <div>${esc(int?.contatti ?? '')}</div>
  </div>
  <div style="text-align:right">
    <div class="etich">${esc(titolo)}</div>
    <div style="font-size:20px;font-weight:800">${esc(doc.riferimento)}</div>
    <div class="rif">del ${esc(doc.data ?? '')}</div>
    ${doc.scadenza ? `<div class="rif">scadenza ${esc(doc.scadenza)}</div>` : ''}
  </div>
</header>

<div class="blocco">
  <div class="etich">Intestata a</div>
  <div style="font-weight:700;font-size:16px">${esc(doc.partner?.nome ?? '')}</div>
</div>

${doc.oggetto ? `<div class="blocco"><div class="etich">Oggetto</div><div>${esc(doc.oggetto)}</div></div>` : ''}

<table>
  <thead><tr><th>Descrizione</th><th class="num">Qtà</th><th class="num">Prezzo</th><th class="num">IVA</th><th class="num">Importo</th></tr></thead>
  <tbody>${righeHtml}</tbody>
</table>

<div class="totali">
  <div><span>Imponibile</span><span class="num">${euro(doc.imponibile)}</span></div>
  <div><span>IVA</span><span class="num">${euro(doc.iva)}</span></div>
  <div class="tot"><span>Totale</span><span class="num">${euro(doc.totale)}</span></div>
</div>

${
  int?.iban
    ? `<div class="blocco"><div class="etich">Pagamento</div>
       <div>${esc(int.modalitaPagamento ?? 'Bonifico bancario')}</div>
       <div>IBAN ${esc(int.iban)}${int.banca ? ' · ' + esc(int.banca) : ''}${int.bic ? ' · BIC ' + esc(int.bic) : ''}</div>
       ${int.intestatarioConto ? `<div>Intestato a ${esc(int.intestatarioConto)}</div>` : ''}</div>`
    : ''
}

${doc.note ? `<div class="blocco"><div class="etich">Note</div><div>${esc(doc.note)}</div></div>` : ''}
${int?.disclaimer ? `<footer>${esc(int.disclaimer)}</footer>` : ''}
<div class="nota-copia">Copia emessa da Deluxy Scout con l'intestazione attuale del brand — il documento originale vive su Deluxy Partner (FINANCE).</div>
</body></html>`;

  w.document.write(html);
  w.document.close();
  return true;
}
