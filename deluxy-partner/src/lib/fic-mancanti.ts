// LE FATTURE CHE FIC HA E FINANCE NO (31/08/2026, richiesta dell'utente:
// «metti automatismi anche di controllo se sono direttamente su FIC e non su
// FINANCE e fai l'import a quel punto»).
//
// Il buco che chiude, misurato il 30/08: `FatturaServizio` — la tabella che
// alimenta il fatturato per tipologia, cioè i ricavi commerciali di Budgets —
// si riempiva SOLO per mano umana (il form, o «registra fattura FIC» dalla
// scheda del partner, una alla volta). Tutto ciò che veniva emesso
// direttamente su Fatture in Cloud fuori dal giro mensile dei servizi — gli
// ordini Scout, i lavori spot — per Finance non esisteva: ad agosto erano
// **36 fatture per 15.216 € netti**, invisibili.
//
// Come funziona:
//  - `trovaFattureFicMancanti()` legge da FIC le fatture emesse nella
//    finestra e toglie quelle già registrate (confronto sul NUMERO);
//  - per ognuna prova ad abbinare la SCHEDA per nome e a proporre la
//    TIPOLOGIA imparandola dall'ultima fattura registrata di quel partner;
//  - `importaFattureFicSicure()` registra DA SOLO quelle con scheda e
//    tipologia note (è il cron notturno); le altre restano nella pagina
//    «Da Fatture in Cloud», dove una persona sceglie tipologia (e scheda)
//    una volta — dalla successiva sono automatiche anche loro.
//
// ⚠️ La COMPETENZA è il MESE DEL SERVIZIO (decisione dell'utente, 31/08:
// «devono essere tutte così», detto guardando le 136 del giro mensile —
// «Servizi Deluxy Luglio» emessa ad agosto va a luglio). Il mese del servizio
// lo dice la DESCRIZIONE della fattura: se nomina un mese, la competenza è
// quella (con l'anno giusto: «dicembre» su una fattura di gennaio è l'anno
// prima); se non lo nomina, resta il mese di emissione — meglio l'emissione
// che un mese indovinato.
//
// ⚠️ L'IVA si ricava dai totali FIC (lordo/netto): una fattura esente esce 0%,
// non 22% — inventare l'aliquota falserebbe l'ivato e quindi lo scaduto.
//
// ⚠️ LE FATTURE COMMISSIONI NON SONO SERVIZI (02/09/2026). La fattura delle
// commissioni sulle vendite come vendor («Commissioni Deluxy Giugno 2026») è
// già dentro il motore: la commissione è calcolata sulla vendita (incasso ×
// fee%) e già tolta dal dovuto al partner. Registrarla come «servizio a
// fatturazione» la conta una seconda volta — nel saldo del mese e nel
// fatturato per tipologia che legge Budgets. Il backfill del 31/08 lo ha fatto
// per 132 fatture (69.808 € netti): riparate con
// scripts/ripara-commissioni-importate.mjs. Da qui in poi si riconoscono
// (descrizione «Commission…» o numero già agganciato come fattura commissioni
// di un mese) e si AGGANCIANO al mese (commFattNumero) invece di registrarle.
//
// ⚠️ PAGATA SU FIC = «Saldata» QUI, con tutto quello che comporta (02/09/2026):
// una fattura importata già pagata passa da segnaFatturaPagataConEsito — il
// punto unico che, per i partner in compensazione, registra l'incasso sul
// saldo del mese e il riferimento nel registro Pagamenti. Scrivere pagata=true
// a mano lasciava il mese «da incassare» per soldi già arrivati (4 fatture,
// 1.658 € ivati, riparate con scripts/ripara-incassi-importati.mjs).
import { prisma } from "./db";
import { ficFetch, ficStato } from "./fic";
import { segnaFatturaPagataConEsito } from "./actions";

export type FatturaFicMancante = {
  ficId: number;
  numero: string; // es. "612/2026", come le registrate
  data: string; // ISO, giorno di emissione
  anno: number;
  mese: number; // competenza: mese del servizio (dalla descrizione) o di emissione
  cliente: string;
  imponibile: number;
  aliquotaIva: number;
  descrizione: string | null;
  // L'abbinamento proposto: null = serve una persona.
  partnerId: string | null;
  partnerNome: string | null;
  tipologiaId: string | null;
  tipologiaNome: string | null;
  // Lo stato del pagamento, letto dai pagamenti FIC: chi importa non deve
  // ricontrollare a mano cosa risulta gia incassato.
  scadenza: string | null;
  pagata: boolean;
  dataPagamento: string | null;
};

/** Una fattura COMMISSIONI vista su FIC: non si registra, si aggancia al mese. */
export type FatturaFicCommissioni = {
  numero: string;
  cliente: string;
  partnerId: string | null;
  anno: number;
  mese: number;
  imponibile: number;
  descrizione: string | null;
  giaAgganciata: boolean; // il mese ha già questo numero come fattura commissioni
};

export type EsitoControlloFic =
  | { ok: false; errore: string }
  | { ok: true; mancanti: FatturaFicMancante[]; commissioni: FatturaFicCommissioni[]; controllate: number };

/** È la fattura delle commissioni vendor? Dalla descrizione, o perché quel
 *  numero è già agganciato a un mese come fattura commissioni. */
export function eFatturaCommissioni(descrizione: string | null | undefined, numero: string, numeriCommissioni: Set<string>): boolean {
  if (numeriCommissioni.has(numero)) return true;
  return /\bcommission[ei]\b/i.test(descrizione ?? "");
}

/** Come si confrontano i nomi: maiuscole, niente punteggiatura né forme societarie. */
export function nomePerConfronto(s: string): string {
  return s
    .toUpperCase()
    .replace(/\b(S\.?R\.?L\.?S?|S\.?P\.?A\.?|S\.?A\.?S|S\.?N\.?C|SOCIETA'? A RESPONSABILITA'? LIMITATA( SEMPLIFICATA)?|SOCIETA'? COOPERATIVA|DI|&)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

type DocFic = {
  id: number;
  number?: number;
  numeration?: string | null;
  date?: string;
  amount_net?: number;
  amount_gross?: number;
  subject?: string | null;
  visible_subject?: string | null;
  next_due_date?: string | null;
  payments_list?: { amount?: number; due_date?: string | null; status?: string | null; paid_date?: string | null }[] | null;
  entity?: { name?: string | null };
};

// Gli stessi stati «chiusi» di fic.ts (fatture-cerca): paid, settled, reversed.
const PAGAMENTO_CHIUSO = new Set(["paid", "settled", "reversed"]);

/** Scadenza, pagata e data di pagamento, lette dai pagamenti FIC. */
function statoPagamento(d: DocFic): { scadenza: string | null; pagata: boolean; dataPagamento: string | null } {
  const p = d.payments_list ?? [];
  if (p.length === 0) return { scadenza: d.next_due_date ?? null, pagata: false, dataPagamento: null };
  const pagata = p.every((x) => PAGAMENTO_CHIUSO.has(x.status ?? ""));
  const scadenze = p.map((x) => x.due_date).filter(Boolean) as string[];
  const pagateIl = p.map((x) => x.paid_date).filter(Boolean) as string[];
  return {
    scadenza: d.next_due_date ?? (scadenze.length ? scadenze.sort()[scadenze.length - 1] : null),
    pagata,
    dataPagamento: pagata && pagateIl.length ? pagateIl.sort()[pagateIl.length - 1] : null,
  };
}

const MESI_NOMI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
/** Il mese che la descrizione nomina («Servizi Deluxy Luglio 2026» → 7), o null. */
export function meseNellaDescrizione(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.toLowerCase();
  for (let i = 0; i < 12; i++) if (t.includes(MESI_NOMI[i])) return i + 1;
  return null;
}

export async function trovaFattureFicMancanti(giorni = 90): Promise<EsitoControlloFic> {
  const stato = await ficStato();
  if (!stato.collegato || !stato.companyId) {
    return { ok: false, errore: "Fatture in Cloud non è collegato (Impostazioni → FIC)." };
  }

  const da = new Date(Date.now() - giorni * 86400000).toISOString().slice(0, 10);
  const docs: DocFic[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await ficFetch<{ data?: DocFic[] }>(
      `/c/${stato.companyId}/issued_documents?type=invoice&q=${encodeURIComponent(`date >= '${da}'`)}` +
        `&fields=id,number,numeration,date,amount_net,amount_gross,subject,visible_subject,next_due_date,payments_list,entity&per_page=100&page=${page}&sort=-date`
    );
    const pagina = r.data ?? [];
    docs.push(...pagina);
    if (pagina.length < 100) break;
  }

  // I numeri già registrati: il confronto è sul numero pieno («612/2026»),
  // con la tolleranza per chi l'ha scritto senza anno.
  const registrate = await prisma.fatturaServizio.findMany({
    where: { anno: { gte: new Date(da).getFullYear() } },
    select: { numero: true },
  });
  const numeri = new Set(registrate.map((f) => (f.numero ?? "").trim()));
  const giaRegistrata = (d: DocFic) => {
    if (d.number == null || !d.date) return false;
    const annoDoc = Number(d.date.slice(0, 4));
    return numeri.has(`${d.number}/${annoDoc}`) || numeri.has(String(d.number));
  };

  // I numeri già agganciati ai mesi come fatture COMMISSIONI: quelle non sono
  // servizi e non si registrano (vedi in cima). Solo i valori che sembrano un
  // numero: l'import xlsx ha lasciato «Si»/«No» in quella colonna.
  const saldiConComm = await prisma.saldoMensile.findMany({
    where: { commFattNumero: { not: null } },
    select: { partnerId: true, anno: true, mese: true, commFattNumero: true },
  });
  const numeriCommissioni = new Set(
    saldiConComm.map((s) => (s.commFattNumero ?? "").trim()).filter((x) => /\d/.test(x))
  );
  const numeroDoc = (d: DocFic) => `${d.number}/${Number(d.date!.slice(0, 4))}`;
  const oggettoDoc = (d: DocFic) => d.subject?.trim() || d.visible_subject?.trim() || null;

  const nonRegistrate = docs.filter((d) => d.number != null && d.date && !giaRegistrata(d));
  const daAbbinare = nonRegistrate.filter((d) => !eFatturaCommissioni(oggettoDoc(d), numeroDoc(d), numeriCommissioni));
  const docCommissioni = nonRegistrate.filter((d) => !daAbbinare.includes(d));
  if (daAbbinare.length === 0 && docCommissioni.length === 0) {
    return { ok: true, mancanti: [], commissioni: [], controllate: docs.length };
  }

  // Le schede, una volta sola, indicizzate per nome confrontabile.
  const partner = await prisma.partner.findMany({ select: { id: true, nome: true } });
  const perNome = new Map<string, { id: string; nome: string }>();
  const normalizzate: { chiave: string; id: string; nome: string }[] = [];
  for (const p of partner) {
    const k = nomePerConfronto(p.nome);
    perNome.set(k, { id: p.id, nome: p.nome });
    normalizzate.push({ chiave: k, id: p.id, nome: p.nome });
  }
  // L'abbinamento: prima il nome ESATTO (normalizzato); se non c'è, vale il
  // CONTENIMENTO — «TBF LIMITED» trova la scheda «TBF Limited Srl Firenze» —
  // ma SOLO se il candidato è UNO: «CHANEL» ha tre schede (Roma, Milano,
  // Firenze) e scegliere a caso metterebbe fatture sulla scheda sbagliata,
  // quindi l'ambiguo resta alla persona. Sotto le 5 lettere niente
  // contenimento: «LEG» dentro «LEGAMI FIORI» sarebbe un abbinamento a caso.
  const trovaScheda = (nomeFic: string): { id: string; nome: string } | null => {
    const k = nomePerConfronto(nomeFic);
    if (!k) return null;
    const esatto = perNome.get(k);
    if (esatto) return esatto;
    if (k.length < 5) return null;
    const candidati = normalizzate.filter(
      (p) => p.chiave.length >= 5 && (p.chiave.includes(k) || k.includes(p.chiave))
    );
    return candidati.length === 1 ? { id: candidati[0].id, nome: candidati[0].nome } : null;
  };

  // La tipologia si IMPARA: l'ultima fattura registrata di quel partner dice
  // come si è deciso l'altra volta. Nessuna storia = nessuna proposta.
  const idsAbbinati = [...new Set(
    daAbbinare.map((d) => trovaScheda(d.entity?.name ?? "")?.id).filter(Boolean)
  )] as string[];

  // Le fatture commissioni: scheda per nome, mese dalla descrizione (o
  // emissione), e se il mese ha già QUESTO numero agganciato.
  const commissioni: FatturaFicCommissioni[] = docCommissioni.map((d) => {
    const dataDoc = d.date!;
    const annoDoc = Number(dataDoc.slice(0, 4));
    const meseDoc = Number(dataDoc.slice(5, 7));
    const oggetto = oggettoDoc(d);
    const meseServizio = meseNellaDescrizione(oggetto);
    const mese = meseServizio ?? meseDoc;
    const anno = meseServizio && meseServizio > meseDoc ? annoDoc - 1 : annoDoc;
    const scheda = trovaScheda(d.entity?.name ?? "");
    const numero = numeroDoc(d);
    const giaAgganciata = !!scheda && saldiConComm.some(
      (s) => s.partnerId === scheda.id && s.anno === anno && s.mese === mese && (s.commFattNumero ?? "").trim() === numero
    );
    return {
      numero,
      cliente: (d.entity?.name ?? "(senza nome)").trim(),
      partnerId: scheda?.id ?? null,
      anno,
      mese,
      imponibile: d.amount_net ?? 0,
      descrizione: oggetto,
      giaAgganciata,
    };
  });
  const storia = idsAbbinati.length
    ? await prisma.fatturaServizio.findMany({
        where: { partnerId: { in: idsAbbinati } },
        orderBy: [{ anno: "desc" }, { mese: "desc" }],
        select: { partnerId: true, tipologiaId: true, tipologia: { select: { nome: true } } },
      })
    : [];
  const tipologiaDi = new Map<string, { id: string; nome: string }>();
  for (const f of storia) {
    if (!tipologiaDi.has(f.partnerId)) tipologiaDi.set(f.partnerId, { id: f.tipologiaId, nome: f.tipologia.nome });
  }

  const mancanti: FatturaFicMancante[] = daAbbinare.map((d) => {
    const dataDoc = d.date!;
    const annoDoc = Number(dataDoc.slice(0, 4));
    const meseDoc = Number(dataDoc.slice(5, 7));
    const scheda = trovaScheda(d.entity?.name ?? "");
    const tip = scheda ? tipologiaDi.get(scheda.id) ?? null : null;
    const netto = d.amount_net ?? 0;
    const lordo = d.amount_gross ?? netto;
    // L'aliquota dai totali, arrotondata al punto: 22,000001 è 22, e una
    // fattura esente resta 0 invece di diventare 22 per pigrizia.
    const aliquota = netto > 0 ? Math.round(((lordo - netto) / netto) * 100) : 0;
    const oggetto = oggettoDoc(d);
    // La competenza: il mese che la descrizione NOMINA (regola dell'utente),
    // sennò quello di emissione. «Dicembre» su una fattura di gennaio è l'anno
    // prima.
    const meseServizio = meseNellaDescrizione(oggetto);
    const mese = meseServizio ?? meseDoc;
    const anno = meseServizio && meseServizio > meseDoc ? annoDoc - 1 : annoDoc;
    return {
      ficId: d.id,
      numero: `${d.number}/${annoDoc}`,
      data: dataDoc,
      anno,
      mese,
      cliente: (d.entity?.name ?? "(senza nome)").trim(),
      imponibile: netto,
      aliquotaIva: aliquota,
      descrizione: oggetto,
      partnerId: scheda?.id ?? null,
      partnerNome: scheda?.nome ?? null,
      tipologiaId: tip?.id ?? null,
      tipologiaNome: tip?.nome ?? null,
      ...statoPagamento(d),
    };
  });

  return { ok: true, mancanti, commissioni, controllate: docs.length };
}

export type EsitoImportFic =
  | { ok: false; errore: string }
  | { ok: true; importate: number; daRivedere: number; commissioniAgganciate: number; dettaglio: string[] };

/**
 * Aggancia una fattura commissioni al suo mese (commFattNumero), come fa
 * «registra fattura FIC → fee vendor» dalla scheda partner. Solo se il mese non
 * ha già un numero: una seconda fattura dello stesso mese («integrazione») non
 * sovrascrive la prima. Torna true se ha scritto.
 */
export async function agganciaFatturaCommissioni(c: FatturaFicCommissioni): Promise<boolean> {
  if (!c.partnerId || c.giaAgganciata) return false;
  const saldo = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId: c.partnerId, anno: c.anno, mese: c.mese } },
    select: { commFattNumero: true },
  });
  if (saldo?.commFattNumero?.trim() && /\d/.test(saldo.commFattNumero)) return false;
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId: c.partnerId, anno: c.anno, mese: c.mese } },
    create: { partnerId: c.partnerId, anno: c.anno, mese: c.mese, commFattEmessa: true, commFattNumero: c.numero },
    update: { commFattEmessa: true, commFattNumero: c.numero },
  });
  return true;
}

/**
 * Registra una fattura importata da FIC: nasce NON pagata e, se su FIC risulta
 * pagata, passa dal punto unico «Saldata» (incasso sul saldo del mese per i
 * partner in compensazione, riferimento nel registro Pagamenti). FIC non si
 * riallinea: è lui la fonte di quello stato.
 */
export async function creaFatturaImportata(m: {
  partnerId: string; tipologiaId: string; anno: number; mese: number; numero: string;
  data: string; scadenza: string | null; pagata: boolean; dataPagamento: string | null;
  imponibile: number; aliquotaIva: number; descrizione: string | null;
}): Promise<string> {
  const f = await prisma.fatturaServizio.create({
    data: {
      partnerId: m.partnerId,
      tipologiaId: m.tipologiaId,
      anno: m.anno,
      mese: m.mese,
      numero: m.numero,
      emissione: new Date(m.data),
      scadenza: m.scadenza ? new Date(m.scadenza) : null,
      pagata: false,
      imponibile: m.imponibile,
      aliquotaIva: m.aliquotaIva,
      descrizione: m.descrizione ?? "Importata da Fatture in Cloud",
    },
  });
  if (m.pagata) {
    await segnaFatturaPagataConEsito(f.id, true, m.dataPagamento ?? new Date(m.data), { allineaFic: false });
  }
  return f.id;
}

/**
 * Registra da solo le mancanti «sicure» — scheda abbinata E tipologia già
 * imparata. Le altre non si toccano: le decide una persona da /fatture/da-fic.
 * Idempotente: il numero già registrato non si reimporta.
 */
export async function importaFattureFicSicure(origine: string, giorni = 90): Promise<EsitoImportFic> {
  const esito = await trovaFattureFicMancanti(giorni);
  if (!esito.ok) return { ok: false, errore: esito.errore };

  const sicure = esito.mancanti.filter((m) => m.partnerId && m.tipologiaId);
  const dettaglio: string[] = [];
  let importate = 0;
  for (const m of sicure) {
    // La ricontrollo sul numero DENTRO il giro: due corse vicine non devono
    // scrivere due volte la stessa fattura.
    const gia = await prisma.fatturaServizio.findFirst({ where: { numero: m.numero } });
    if (gia) continue;
    await creaFatturaImportata({ ...m, partnerId: m.partnerId!, tipologiaId: m.tipologiaId! });
    importate++;
    dettaglio.push(`${m.numero} · ${m.partnerNome} · ${m.tipologiaNome} · ${Math.round(m.imponibile)} €${m.pagata ? " · pagata" : ""}`);
  }

  // Le fatture commissioni si agganciano al mese, mai registrate come servizi.
  let commissioniAgganciate = 0;
  for (const c of esito.commissioni) {
    if (await agganciaFatturaCommissioni(c)) {
      commissioniAgganciate++;
      dettaglio.push(`${c.numero} · ${c.cliente} · commissioni ${c.mese}/${c.anno} agganciate al mese`);
    }
  }

  if (importate > 0 || commissioniAgganciate > 0) {
    const { registra } = await import("./registro");
    await registra({
      azione:
        `Importate ${importate} fatture da Fatture in Cloud (${origine})` +
        (commissioniAgganciate > 0 ? ` · ${commissioniAgganciate} fatture commissioni agganciate ai mesi` : ""),
      categoria: "fatture",
      dettaglio:
        `Scheda e tipologia imparate dalle registrazioni precedenti; competenza = mese del servizio (dalla descrizione) o di emissione; pagata su FIC = saldata qui. ` +
        dettaglio.slice(0, 20).join(" · ") +
        (esito.mancanti.length - sicure.length > 0
          ? ` — ${esito.mancanti.length - sicure.length} restano da rivedere in /fatture/da-fic (scheda o tipologia mai decise)`
          : ""),
    });
  }
  return { ok: true, importate, daRivedere: esito.mancanti.length - sicure.length, commissioniAgganciate, dettaglio };
}
