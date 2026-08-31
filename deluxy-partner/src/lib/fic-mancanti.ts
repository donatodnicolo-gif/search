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
// ⚠️ La COMPETENZA è il MESE DI EMISSIONE (decisione dell'utente, 30/08:
// «la competenza mettila in base al mese di emissione»). Chi la vuole diversa
// la sposta dopo, dalla fattura.
//
// ⚠️ L'IVA si ricava dai totali FIC (lordo/netto): una fattura esente esce 0%,
// non 22% — inventare l'aliquota falserebbe l'ivato e quindi lo scaduto.
import { prisma } from "./db";
import { ficFetch, ficStato } from "./fic";

export type FatturaFicMancante = {
  ficId: number;
  numero: string; // es. "612/2026", come le registrate
  data: string; // ISO, giorno di emissione
  anno: number;
  mese: number; // competenza = mese di emissione
  cliente: string;
  imponibile: number;
  aliquotaIva: number;
  descrizione: string | null;
  // L'abbinamento proposto: null = serve una persona.
  partnerId: string | null;
  partnerNome: string | null;
  tipologiaId: string | null;
  tipologiaNome: string | null;
};

export type EsitoControlloFic =
  | { ok: false; errore: string }
  | { ok: true; mancanti: FatturaFicMancante[]; controllate: number };

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
  entity?: { name?: string | null };
};

export async function trovaFattureFicMancanti(giorni = 90): Promise<EsitoControlloFic> {
  const stato = await ficStato();
  if (!stato.collegato || !stato.companyId) {
    return { ok: false, errore: "Fatture in Cloud non è collegato (Impostazioni → FIC)." };
  }

  const da = new Date(Date.now() - giorni * 86400000).toISOString().slice(0, 10);
  const docs: DocFic[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = await ficFetch<{ data?: DocFic[] }>(
      `/c/${stato.companyId}/issued_documents?type=invoice&q=${encodeURIComponent(`date >= '${da}'`)}` +
        `&fields=id,number,numeration,date,amount_net,amount_gross,subject,entity&per_page=100&page=${page}&sort=-date`
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

  const daAbbinare = docs.filter((d) => d.number != null && d.date && !giaRegistrata(d));
  if (daAbbinare.length === 0) return { ok: true, mancanti: [], controllate: docs.length };

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
    return {
      ficId: d.id,
      numero: `${d.number}/${annoDoc}`,
      data: dataDoc,
      anno: annoDoc,
      mese: meseDoc,
      cliente: (d.entity?.name ?? "(senza nome)").trim(),
      imponibile: netto,
      aliquotaIva: aliquota,
      descrizione: d.subject?.trim() || null,
      partnerId: scheda?.id ?? null,
      partnerNome: scheda?.nome ?? null,
      tipologiaId: tip?.id ?? null,
      tipologiaNome: tip?.nome ?? null,
    };
  });

  return { ok: true, mancanti, controllate: docs.length };
}

export type EsitoImportFic =
  | { ok: false; errore: string }
  | { ok: true; importate: number; daRivedere: number; dettaglio: string[] };

/**
 * Registra da solo le mancanti «sicure» — scheda abbinata E tipologia già
 * imparata. Le altre non si toccano: le decide una persona da /fatture/da-fic.
 * Idempotente: il numero già registrato non si reimporta.
 */
export async function importaFattureFicSicure(origine: string): Promise<EsitoImportFic> {
  const esito = await trovaFattureFicMancanti();
  if (!esito.ok) return { ok: false, errore: esito.errore };

  const sicure = esito.mancanti.filter((m) => m.partnerId && m.tipologiaId);
  const dettaglio: string[] = [];
  let importate = 0;
  for (const m of sicure) {
    // La ricontrollo sul numero DENTRO il giro: due corse vicine non devono
    // scrivere due volte la stessa fattura.
    const gia = await prisma.fatturaServizio.findFirst({ where: { numero: m.numero } });
    if (gia) continue;
    await prisma.fatturaServizio.create({
      data: {
        partnerId: m.partnerId!,
        tipologiaId: m.tipologiaId!,
        anno: m.anno,
        mese: m.mese,
        numero: m.numero,
        emissione: new Date(m.data),
        imponibile: m.imponibile,
        aliquotaIva: m.aliquotaIva,
        descrizione: m.descrizione ?? "Importata da Fatture in Cloud",
      },
    });
    importate++;
    dettaglio.push(`${m.numero} · ${m.partnerNome} · ${m.tipologiaNome} · ${Math.round(m.imponibile)} €`);
  }

  if (importate > 0) {
    const { registra } = await import("./registro");
    await registra({
      azione: `Importate ${importate} fatture da Fatture in Cloud (${origine})`,
      categoria: "fatture",
      dettaglio:
        `Scheda e tipologia imparate dalle registrazioni precedenti; competenza = mese di emissione. ` +
        dettaglio.slice(0, 20).join(" · ") +
        (esito.mancanti.length - sicure.length > 0
          ? ` — ${esito.mancanti.length - sicure.length} restano da rivedere in /fatture/da-fic (scheda o tipologia mai decise)`
          : ""),
    });
  }
  return { ok: true, importate, daRivedere: esito.mancanti.length - sicure.length, dettaglio };
}
