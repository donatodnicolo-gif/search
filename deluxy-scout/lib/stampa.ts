// IL PDF DELLA PRO-FORMA, generato e SCARICATO da Scout.
//
// Richiesta dell'utente (28/08/2026), in due tempi: «consenti il download
// direttamente da app senza aprire finance» e poi, davanti al dialogo di
// stampa: «con download del file, non la stampa come ora». Quindi niente
// print(): un file .pdf vero, che finisce nei Download col suo nome.
//
// ⚠️ **Il documento vive su FINANCE** (numerazione, righe): da lì arrivano i
// DATI via API. L'intestazione viene dal template del brand (template di
// Scout); se non ce n'è — al 28/08 la tabella era VUOTA, ed è per questo che
// la prima copia è uscita con il solo «Deluxy Srl» — si ripiega sui dati
// aziendali delle Impostazioni di Scout (ragione sociale, indirizzo, P.IVA,
// IBAN), che sono dati veri, non inventati.
//
// ⚠️ jsPDF si carica SOLO al clic (import dinamico): sono ~350 KB che non
// devono pesare su chi apre l'elenco ordini e non scarica niente.
import type { IntestazioneDocumento } from '@/lib/template-documento';
import type { DocumentoProforma } from '@/lib/partner';

const euro = (n: number | null | undefined) =>
  n == null
    ? '—'
    : '€ ' +
      Number(n)
        .toFixed(2)
        .replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const dataIt = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [a, m, g] = iso.split('-');
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

/**
 * Genera il PDF e lo fa scaricare. Torna il nome del file, o lancia con un
 * messaggio leggibile: chi chiama lo mostra, un download che non parte in
 * silenzio insegna a non premere il bottone.
 */
export async function scaricaPdfProforma(
  doc: DocumentoProforma,
  int: Partial<IntestazioneDocumento> | null,
): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

  const L = 18; // margine sinistro
  const R = 192; // bordo destro utile
  let y = 20;

  // ── Testata: logo + azienda a sinistra, titolo e numero a destra ─────────
  if (int?.logoDataUrl) {
    try {
      // Il logo è un data URI del template: 38×14 mm massimi, proporzioni sue.
      const props = pdf.getImageProperties(int.logoDataUrl);
      const maxW = 38;
      const maxH = 14;
      const scala = Math.min(maxW / props.width, maxH / props.height);
      pdf.addImage(int.logoDataUrl, L, y - 5, props.width * scala, props.height * scala);
      y += props.height * scala + 2;
    } catch {
      // logo illeggibile: il documento esce lo stesso, senza
    }
  }
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text(int?.ragioneSociale || 'Deluxy Srl', L, y);
  pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
  if (int?.indirizzo) pdf.text(int.indirizzo, L, (y += 4.5));
  const rigaFiscale = [int?.piva ? `P.IVA ${int.piva}` : '', int?.rea ? `REA ${int.rea}` : '']
    .filter(Boolean)
    .join(' · ');
  if (rigaFiscale) pdf.text(rigaFiscale, L, (y += 4.5));
  if (int?.contatti) pdf.text(int.contatti, L, (y += 4.5));

  const titolo = doc.tipo === 'preventivo' ? 'PREVENTIVO' : 'PRO-FORMA';
  pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(150, 120, 46);
  pdf.text(titolo, R, 15, { align: 'right' });
  pdf.setFontSize(16).setTextColor(17, 19, 24);
  pdf.text(doc.riferimento, R, 22, { align: 'right' });
  pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
  pdf.text(`del ${dataIt(doc.data)}`, R, 27, { align: 'right' });
  if (doc.scadenza) pdf.text(`scadenza ${dataIt(doc.scadenza)}`, R, 31.5, { align: 'right' });

  y = Math.max(y, 34) + 8;
  pdf.setDrawColor(220).line(L, y, R, y);
  y += 8;

  // ── Intestata a / oggetto ────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(150, 120, 46);
  pdf.text('INTESTATA A', L, y);
  pdf.setFontSize(12).setTextColor(17, 19, 24);
  pdf.text(doc.partner?.nome ?? '', L, (y += 5.5));
  if (doc.oggetto) {
    pdf.setFontSize(8).setTextColor(150, 120, 46);
    pdf.text('OGGETTO', L, (y += 8));
    pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(17, 19, 24);
    const righeOgg = pdf.splitTextToSize(doc.oggetto, R - L);
    pdf.text(righeOgg, L, (y += 5));
    y += (righeOgg.length - 1) * 4.5;
  }
  y += 9;

  // ── La tabella delle righe ───────────────────────────────────────────────
  // Colonne fisse da destra, la descrizione prende il resto e va a capo.
  const cImporto = R;
  const cIva = R - 26;
  const cPrezzo = R - 38;
  const cQta = R - 62;
  const wDescr = cQta - 12 - L;

  pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(110);
  pdf.text('DESCRIZIONE', L, y);
  pdf.text('QTÀ', cQta, y, { align: 'right' });
  pdf.text('PREZZO', cPrezzo + 10, y, { align: 'right' });
  pdf.text('IVA', cIva + 6, y, { align: 'right' });
  pdf.text('IMPORTO', cImporto, y, { align: 'right' });
  y += 2;
  pdf.setDrawColor(190).line(L, y, R, y);
  y += 6;

  pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(17, 19, 24);
  for (const r of doc.righe ?? []) {
    const righeDescr = pdf.splitTextToSize(r.descrizione ?? '', wDescr);
    pdf.text(righeDescr, L, y);
    pdf.text(String(r.quantita ?? 1), cQta, y, { align: 'right' });
    pdf.text(euro(r.prezzoUnitario), cPrezzo + 10, y, { align: 'right' });
    pdf.text(`${r.aliquotaIva ?? 22}%`, cIva + 6, y, { align: 'right' });
    pdf.text(euro(r.importo), cImporto, y, { align: 'right' });
    y += righeDescr.length * 4.8 + 3;
    pdf.setDrawColor(235).line(L, y - 2.2, R, y - 2.2);
    // ⚠️ Fine pagina: si continua su una nuova, non si stringe. Un documento
    // compresso per farci stare tutto è illeggibile proprio dove conta.
    if (y > 258) {
      pdf.addPage();
      y = 20;
    }
  }

  // ── I totali, incolonnati a destra ───────────────────────────────────────
  y += 4;
  const lTot = R - 70;
  pdf.setFontSize(10).setTextColor(80);
  pdf.text('Imponibile', lTot, y);
  pdf.text(euro(doc.imponibile), R, y, { align: 'right' });
  pdf.text('IVA', lTot, (y += 5.5));
  pdf.text(euro(doc.iva), R, y, { align: 'right' });
  pdf.setDrawColor(17, 19, 24).line(lTot, (y += 3), R, y);
  pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(17, 19, 24);
  pdf.text('Totale', lTot, (y += 6));
  pdf.text(euro(doc.totale), R, y, { align: 'right' });
  y += 11;

  // ── Pagamento (se l'intestazione porta l'IBAN) ───────────────────────────
  if (int?.iban) {
    pdf.setFontSize(8).setTextColor(150, 120, 46);
    pdf.text('PAGAMENTO', L, y);
    pdf.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(17, 19, 24);
    pdf.text(int.modalitaPagamento || 'Bonifico bancario', L, (y += 4.8));
    pdf.text(
      `IBAN ${int.iban}${int.banca ? ' · ' + int.banca : ''}${int.bic ? ' · BIC ' + int.bic : ''}`,
      L,
      (y += 4.8),
    );
    if (int.intestatarioConto) pdf.text(`Intestato a ${int.intestatarioConto}`, L, (y += 4.8));
    y += 8;
  }

  if (doc.note) {
    pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(150, 120, 46);
    pdf.text('NOTE', L, y);
    pdf.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(17, 19, 24);
    const righeNote = pdf.splitTextToSize(doc.note, R - L);
    pdf.text(righeNote, L, (y += 4.8));
    y += righeNote.length * 4.4 + 5;
  }

  if (int?.disclaimer) {
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110);
    const righeDisc = pdf.splitTextToSize(int.disclaimer, R - L);
    pdf.text(righeDisc, L, y);
    y += righeDisc.length * 3.8 + 4;
  }

  pdf.setFontSize(7.5).setTextColor(150);
  pdf.text(
    'Documento emesso da Deluxy Scout — l’originale vive su Deluxy Partner (FINANCE).',
    L,
    Math.min(y + 4, 288),
  );

  // Il nome dice documento e cliente: «PF 12-2026 · Vivo Concerti SRL.pdf»
  // si ritrova nei Download anche fra un mese.
  const nome = `${doc.riferimento.replace(/\//g, '-')} · ${doc.partner?.nome ?? 'cliente'}.pdf`;
  pdf.save(nome);
  return nome;
}
