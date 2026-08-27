// I TEMPLATE DEI DOCUMENTI, UNO PER BRAND (27/08/2026).
//
// Cosa deve esserci su una pro-forma, secondo la prassi italiana (verificato
// su più fonti fiscali il 27/08/2026, vedi README §Template dei documenti):
//   1. la dicitura «fattura pro-forma» BEN VISIBILE, per non confonderla con
//      una fattura;
//   2. una numerazione INDIPENDENTE da quella fiscale (qui: PF n/anno);
//   3. i dati di chi emette: denominazione, indirizzo, P. IVA o codice
//      fiscale, eventuale REA — e il logo, che non è obbligatorio ma è quello
//      che fa riconoscere il mittente;
//   4. i dati del cliente: ragione sociale, indirizzo, P. IVA o codice fiscale;
//   5. descrizione, quantità, prezzo unitario, IVA separata, totale;
//   6. come si paga: modalità e IBAN — un documento che chiede soldi senza
//      dire dove mandarli fa perdere un giro di mail;
//   7. in calce, la formula di legge (sotto, `DISCLAIMER_PROFORMA`).
//
// Il layout non ha vincoli formali (la pro-forma non ha valore fiscale), ma la
// prassi è compilarla come se fosse una fattura vera.
//
// Di questi, 1-2-5 li sa il documento e 4 lo sa l'anagrafica del cliente; 3, 6
// e 7 sono SEMPRE gli stessi per un dato brand — ed è esattamente ciò che sta
// qui dentro.
import { prisma } from "./db";
import { CHIAVI, leggiImpostazioni } from "./impostazioni";
// ⚠️ Le costanti stanno in un file SENZA Prisma: il form dei template è un
// componente client, e importarle da qui gli tirerebbe dietro il database.
export { DISCLAIMER_PROFORMA, DISCLAIMER_PREVENTIVO, BRAND_NOTI, LOGO_MAX_BYTE, logoAccettabile } from "./documento-costanti";

/** L'intestazione risolta di un documento: template se c'è, generale se no. */
export interface Intestazione {
  ragioneSociale: string;
  indirizzo: string;
  piva: string;
  codiceFiscale: string;
  rea: string;
  contatti: string;
  logoDataUrl: string;
  iban: string;
  intestatarioConto: string;
  modalitaPagamento: string;
  noteDefault: string;
  disclaimer: string;
  /** Da dove arriva: serve a dirlo a schermo, non a decidere. */
  fonte: "template" | "impostazioni";
  nomeTemplate: string | null;
}

/**
 * L'intestazione da usare per un documento.
 *
 * ⚠️ NON inventa: se il template non c'è si torna alle quattro righe di
 * `Impostazione` che c'erano prima — chi non ha ancora fatto i template
 * continua a vedere esattamente quello che vedeva.
 */
export async function intestazionePerDocumento(templateId: string | null): Promise<Intestazione> {
  const t = templateId
    ? await prisma.templateDocumento.findUnique({ where: { id: templateId } })
    : null;
  if (t) {
    return {
      ragioneSociale: t.ragioneSociale,
      indirizzo: t.indirizzo ?? "",
      piva: t.piva ?? "",
      codiceFiscale: t.codiceFiscale ?? "",
      rea: t.rea ?? "",
      contatti: t.contatti ?? "",
      logoDataUrl: t.logoDataUrl ?? "",
      iban: t.iban ?? "",
      intestatarioConto: t.intestatarioConto ?? "",
      modalitaPagamento: t.modalitaPagamento ?? "",
      noteDefault: t.noteDefault ?? "",
      disclaimer: t.disclaimer ?? "",
      fonte: "template",
      nomeTemplate: t.nome,
    };
  }
  const imp = await leggiImpostazioni();
  return {
    ragioneSociale: imp[CHIAVI.aziendaIntestazione] || "Deluxy",
    indirizzo: imp[CHIAVI.aziendaIndirizzo] || "",
    piva: imp[CHIAVI.aziendaPiva] || "",
    codiceFiscale: "",
    rea: "",
    contatti: imp[CHIAVI.aziendaContatti] || "",
    logoDataUrl: "",
    iban: imp[CHIAVI.ordinanteIban] || "",
    intestatarioConto: imp[CHIAVI.ordinanteNome] || "",
    modalitaPagamento: "",
    noteDefault: "",
    disclaimer: "",
    fonte: "impostazioni",
    nomeTemplate: null,
  };
}

/**
 * Quale template usare quando chi chiede il documento non lo dice per id.
 *
 * Si accetta il NOME o il BRAND, perché è così che lo conosce chi chiama da
 * fuori: Scout sa di vendere per «cakedesign.me», non conosce un cuid. Se non
 * combacia niente si prende il predefinito; se non c'è nemmeno quello si torna
 * `null`, e il documento uscirà con l'intestazione generale.
 *
 * ⚠️ Un nome che non esiste NON è un errore silenzioso da ignorare: chi chiama
 * riceve `trovato: false` e può dirlo. Chiedere «emetti con l'intestazione di
 * cakedesign.me» e vedersi uscire quella di un altro brand è peggio di un
 * rifiuto.
 */
export async function risolviTemplate(
  chiave: string | null | undefined,
): Promise<{ id: string | null; nome: string | null; trovato: boolean; chiesto: string | null }> {
  const q = (chiave ?? "").trim();
  if (q) {
    const t = await prisma.templateDocumento.findFirst({
      where: { attivo: true, OR: [{ id: q }, { nome: q }, { brand: q }] },
    });
    if (t) return { id: t.id, nome: t.nome, trovato: true, chiesto: q };
  }
  const pre = await prisma.templateDocumento.findFirst({ where: { attivo: true, predefinito: true } });
  return { id: pre?.id ?? null, nome: pre?.nome ?? null, trovato: !q, chiesto: q || null };
}

/**
 * Rende predefinito un template e toglie il flag agli altri.
 *
 * ⚠️ In una transazione, e prima si spegne poi si accende: l'indice parziale
 * ammette UN solo predefinito, quindi l'ordine inverso violerebbe il vincolo a
 * metà strada.
 */
export async function rendiPredefinito(id: string): Promise<void> {
  await prisma.$transaction([
    prisma.templateDocumento.updateMany({ where: { predefinito: true, NOT: { id } }, data: { predefinito: false } }),
    prisma.templateDocumento.update({ where: { id }, data: { predefinito: true } }),
  ]);
}
