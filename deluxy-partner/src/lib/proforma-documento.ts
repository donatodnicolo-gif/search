// IL DOCUMENTO PRO-FORMA / PREVENTIVO, PRONTO DA MOSTRARE (02/09/2026).
//
// Un solo punto che raccoglie tutto ciò che serve per «disegnare» il documento
// — chi emette (intestazione fotografata), a chi (dati fiscali del cliente dal
// registro Anagrafiche), righe, totali, riferimento — così l'anteprima HTML
// (pagina), la stampa e il PDF (react-pdf) leggono LA STESSA cosa e non possono
// divergere. Prima tutto questo stava dentro la pagina.
import { prisma } from "./db";
import { anagraficaPerId } from "./anagrafiche";
import { intestazioneDaMostrare, type Intestazione } from "./intestazione";
import { rifProForma, totaliProForma, importoRiga, type RigaLike } from "./proforma";

export type ClienteDocumento = {
  nome: string;
  insegna: string | null;
  indirizzo: string | null;
  citta: string | null; // solo se NON già contenuta nell'indirizzo
  pIva: string | null;
  codiceFiscale: string | null; // solo se diverso dalla P. IVA
  codiceSdi: string | null;
  pec: string | null;
  email: string | null;
};

export type RigaDocumento = RigaLike & { id: string; importo: number };

export type DocumentoProForma = {
  id: string;
  preventivo: boolean;
  titolo: string; // «Fattura pro-forma» | «Preventivo»
  rif: string; // «PF 12/2026»
  numero: number;
  anno: number;
  data: Date;
  scadenza: Date | null;
  validoFino: Date | null;
  oggetto: string | null;
  note: string | null;
  stato: string;
  fatturaNumero: string | null;
  inviataIl: Date | null;
  inviataA: string | null;
  fatturataIl: Date | null;
  annullataIl: Date | null;
  emittente: Intestazione & { fonte: "documento" | "impostazioni" };
  cliente: ClienteDocumento;
  righe: RigaDocumento[];
  totali: ReturnType<typeof totaliProForma>;
  /** Cosa manca al cliente per una fattura vera (P. IVA, SDI/PEC). */
  mancanti: string[];
  /** Nome del file quando si scarica: «Pro-forma PF 12-2026 — Cliente.pdf». */
  nomeFile: string;
};

export async function caricaDocumentoProForma(id: string): Promise<DocumentoProForma | null> {
  const pf = await prisma.proForma.findUnique({
    where: { id },
    include: { partner: true, righe: { orderBy: { ordine: "asc" } } },
  });
  if (!pf) return null;
  const preventivo = pf.tipo === "preventivo";

  // I DATI FISCALI DEL CLIENTE vengono da ANAGRAFICHE, non ricopiati qui: se il
  // partner è collegato al registro si leggono da lì. Non fatale: se il
  // registro è giù, restano i pochi campi del partner. 8 s perché è una
  // lettura che DEVE riuscire (vedi handoff 28/08).
  const anag = pf.partner.anagraficaId ? await anagraficaPerId(pf.partner.anagraficaId, 8000) : null;
  const nome = pf.partner.ragioneSociale || anag?.ragioneSociale || pf.partner.nome;
  const indirizzo = anag?.indirizzo ?? null;
  const cittaGrezza = anag?.citta ?? pf.partner.citta ?? null;
  const pIva = anag?.pIva ?? null;
  const cf = anag?.codiceFiscale ?? null;
  const cliente: ClienteDocumento = {
    nome,
    insegna: pf.partner.nome && pf.partner.nome !== nome ? pf.partner.nome : null,
    indirizzo,
    citta: cittaGrezza && !(indirizzo ?? "").toLowerCase().includes(cittaGrezza.toLowerCase()) ? cittaGrezza : null,
    pIva,
    codiceFiscale: cf && cf !== pIva ? cf : null,
    codiceSdi: anag?.datiFinanziari?.codiceSdi ?? null,
    pec: anag?.datiFinanziari?.pec ?? null,
    email: pf.partner.email ?? anag?.email ?? null,
  };
  const mancanti: string[] = [];
  if (!cliente.pIva) mancanti.push("P. IVA");
  if (!cliente.codiceSdi && !cliente.pec) mancanti.push("Cod. SDI o PEC");

  const emittente = await intestazioneDaMostrare(pf.intestazione, preventivo);
  const rif = rifProForma(pf);
  const righe: RigaDocumento[] = pf.righe.map((r) => ({
    id: r.id,
    descrizione: r.descrizione,
    quantita: r.quantita,
    prezzoUnitario: r.prezzoUnitario,
    aliquotaIva: r.aliquotaIva,
    importo: importoRiga(r),
  }));
  const pulito = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return {
    id: pf.id,
    preventivo,
    titolo: preventivo ? "Preventivo" : "Fattura pro-forma",
    rif,
    numero: pf.numero,
    anno: pf.anno,
    data: pf.data,
    scadenza: pf.scadenza,
    validoFino: pf.validoFino,
    oggetto: pf.oggetto,
    note: pf.note,
    stato: pf.stato,
    fatturaNumero: pf.fatturaNumero,
    inviataIl: pf.inviataIl,
    inviataA: pf.inviataA,
    fatturataIl: pf.fatturataIl,
    annullataIl: pf.annullataIl,
    emittente,
    cliente,
    righe,
    totali: totaliProForma(pf.righe),
    mancanti,
    nomeFile: `${pulito(`${preventivo ? "Preventivo" : "Pro-forma"} ${rif.replace("/", "-")} — ${nome}`)}.pdf`,
  };
}
