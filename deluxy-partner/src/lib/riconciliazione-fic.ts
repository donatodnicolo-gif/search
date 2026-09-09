import type { Partner } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { ficClientiFiscali, type FicClienteFiscale } from "./fic";
import { matchPartner } from "./riconciliazione";
import { qontoBeneficiari, qontoConfigurato, type QontoBeneficiario } from "./qonto";
import { elencoAnagrafiche } from "./anagrafiche";

// I due dati esterni pesanti della pagina di riconciliazione — clienti FIC
// (rubrica + fatture) e beneficiari Qonto (IBAN dei bonifici fatti) — cambiano di
// rado ma costano decine di chiamate API sequenziali. Li memorizziamo per 10
// minuti: così il render (e soprattutto il rebuild dopo ogni Salva/Conferma) è
// veloce, mentre i dati mutabili (partner, stato riconciliazione, IBAN salvato)
// restano freschi perché letti dal DB a ogni render.
const clientiFicCache = unstable_cache(async () => ficClientiFiscali(), ["ric-fic-clienti"], {
  revalidate: 600,
  tags: ["ric-fic"],
});
const beneficiariQontoCache = unstable_cache(
  async (): Promise<QontoBeneficiario[]> => {
    try {
      return (await qontoConfigurato()) ? await qontoBeneficiari() : [];
    } catch {
      return [];
    }
  },
  ["ric-qonto-beneficiari"],
  { revalidate: 600, tags: ["ric-qonto"] }
);

// ⭐ 09/09/2026 — QUELLO CHE IL REGISTRO HA GIÀ.
//
// L'IBAN dei partner lo scrivono ORMAI DA SOLI dall'app delivery (cambio in due
// passi, col codice via mail), e finisce nel registro Anagrafiche. Riproporre
// qui una «riconciliazione IBAN» per un partner che l'IBAN ce l'ha già è
// rumore: fa sembrare che manchi qualcosa, e invita a incollarci sopra un conto
// dedotto dai bonifici — cioè a sostituire un dato dichiarato dal partner con
// uno indovinato da noi (richiesta dell'utente: «se l'IBAN è già salvato da app
// delivery e tu lo hai in anagrafica, evita di mostrare riconciliazione IBAN»).
//
// L'elenco del registro porta già `datiFinanziari`, quindi bastano poche pagine
// invece di una chiamata per partner. In cache 10 minuti come gli altri due
// dati esterni della pagina.
export type ContoRegistro = { iban: string; intestatario: string | null };
/** Quello che il registro ha GIÀ per una scheda: serve sia a nascondere la
 *  riconciliazione IBAN, sia a non riproporre campi che ci sono già. */
export type SchedaRegistro = ContoRegistro & { valori: Record<string, string> };

const schedeRegistroCache = unstable_cache(
  async (): Promise<Record<string, SchedaRegistro>> => {
    const out: Record<string, SchedaRegistro> = {};
    try {
      for (let page = 1; page <= 15; page++) {
        const r = await elencoAnagrafiche(page, 200);
        for (const a of r.dati) {
          const f = a.datiFinanziari ?? null;
          const valori: Record<string, string> = {};
          const metti = (k: string, v: unknown) => {
            const t = typeof v === "string" ? v.trim() : "";
            if (t) valori[k] = t;
          };
          // gli stessi nomi che `campiProposti` usa, così il confronto è diretto
          metti("ragioneSociale", a.ragioneSociale);
          metti("pIva", a.pIva);
          metti("codiceFiscale", a.codiceFiscale);
          metti("indirizzo", a.indirizzo);
          metti("citta", a.citta);
          metti("provincia", a.provincia);
          metti("email", a.email);
          metti("pec", f?.pec);
          metti("codiceSdi", f?.codiceSdi);
          metti("amministrazioneNome", f?.amministrazioneNome);
          metti("amministrazioneTelefono", f?.amministrazioneTelefono);
          metti("amministrazioneEmail", f?.amministrazioneEmail);
          out[a.id] = {
            iban: (f?.iban ?? "").replace(/\s+/g, "").toUpperCase(),
            intestatario: f?.intestatarioConto?.trim() || null,
            valori,
          };
        }
        if (r.dati.length < 200) break;
      }
    } catch {
      // Il registro che non risponde non deve svuotare la pagina: senza questa
      // mappa si ricade nel comportamento di prima (si propone tutto), che è
      // prudente — non si nasconde qualcosa perché «forse» c'è già.
      return out;
    }
    return out;
  },
  ["ric-registro-schede"],
  { revalidate: 600, tags: ["ric-registro"] }
);

/**
 * ⭐ 09/09/2026 (regola dell'utente: «inserisci solo i campi mancanti o che
 * migliora»).
 *
 * «Conferma e aggiorna» mandava TUTTO quello che FIC sa, anche i campi che il
 * registro aveva già identici — e su Vivo Concerti dei cinque campi proposti due
 * erano uguali (P.IVA, SDI), due mancavano davvero (ragione sociale, codice
 * fiscale) e uno **peggiorava** l'indirizzo. Un bottone che dice «da
 * confermare» anche quando non cambierebbe niente non è un invito, è rumore.
 *
 * ⚠️ Un campo che il registro ha GIÀ, diverso, NON si tocca: qual è quello buono
 * non lo sappiamo — potrebbe averlo corretto una persona. Si dichiara la
 * differenza e la decide chi guarda.
 */
export type Confronto = {
  /** Quello che si manderà davvero: solo i campi che il registro non ha. */
  daInviare: Record<string, string>;
  /** Ha già un valore, diverso dal nostro: si mostra, non si sovrascrive. */
  diversi: { campo: string; nostro: string; proposto: string }[];
  /** Identici: non si mandano, e non si contano come «da confermare». */
  uguali: number;
};

export function confrontaColRegistro(
  proposti: Record<string, string>,
  scheda: SchedaRegistro | undefined
): Confronto {
  const daInviare: Record<string, string> = {};
  const diversi: Confronto["diversi"] = [];
  let uguali = 0;
  const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  for (const [k, v] of Object.entries(proposti)) {
    const nostro = scheda?.valori[k];
    // Senza la scheda (registro muto) si torna al comportamento di prima:
    // si propone tutto. Meglio proporre due volte che tacere per un'assenza
    // che non è una risposta.
    if (!scheda) { daInviare[k] = v; continue; }
    if (!nostro) { daInviare[k] = v; continue; }
    if (norm(nostro) === norm(v)) { uguali++; continue; }
    diversi.push({ campo: k, nostro, proposto: v });
  }
  return { daInviare, diversi, uguali };
}

// Riconciliazione dei clienti Fatture in Cloud con i partner Deluxy (e, tramite
// il loro anagraficaId, col registro Anagrafiche). FIC è la fonte ricca di dati
// fiscali (P.IVA, CF, indirizzo); il registro spesso non li ha. Qui si abbina
// per nome e si preparano i dati da proporre al registro. Nessuna scrittura
// avviene qui: l'invio parte solo su conferma dell'operatore (server action).

export type EsitoRiga = {
  ficNome: string;
  dati: FicClienteFiscale;
  partner: Partner | null;
  collegatoRegistro: boolean; // il partner ha anagraficaId
  stato: "confermata" | "ignorata" | null; // da RiconciliazioneAnagrafica
  esitoUltimoInvio: string | null;
  ibanSuggerito: string | null; // IBAN del beneficiario Qonto (bonifici) col nome del partner
  // A CHI era intestato quel conto quando gli abbiamo bonificato: il nome del
  // beneficiario in banca È l'intestatario del conto, e spesso non è né
  // l'insegna né la ragione sociale (ditte individuali, società che incassano
  // per il negozio). Va nel registro perché la banca rifiuta il pagamento se
  // intestatario e IBAN non combaciano.
  intestatarioSuggerito: string | null;
  /** L'IBAN che il REGISTRO ha già (scritto dal partner sull'app delivery).
   *  Se c'è, la riga non chiede niente: mostra quello e basta. */
  ibanRegistro: string | null;
  intestatarioRegistro: string | null;
  /** «Il conto proposto dalla banca non è il suo»: proposta messa a tacere. */
  ibanIgnorato: boolean;
  /** Cosa cambierebbe davvero premendo «Conferma e aggiorna». */
  confronto: Confronto;
};

export type Riconciliazione = {
  conciliati: EsitoRiga[]; // cliente FIC ↔ partner collegato al registro (aggiornabili)
  daCollegare: EsitoRiga[]; // abbinati a un partner ma senza anagraficaId
  senzaMatch: EsitoRiga[]; // clienti FIC senza partner corrispondente
};

// Campi che FIC può proporre al registro per un cliente conciliato: i dati
// fiscali (livelli alti) e quelli finanziari che FIC possiede (PEC, codice SDI,
// contatto amministrativo). IBAN/banca/metodo pagamento NON stanno in FIC.
/**
 * L'indirizzo composto da quello che FIC tiene in pezzi separati.
 *
 * ⚠️ 09/09/2026 — su alcuni clienti la VIA contiene già CAP e città, perché chi
 * ha creato la scheda su FIC ha scritto tutto in un campo solo. Attaccarci
 * dietro CAP e città li raddoppiava, e peggiorava un dato che era giusto:
 * «Piazza Fernanda Pivano 9, 20143 Milano» diventava
 * «Piazza Fernanda Pivano 9, 20143 Milano, 20100 MILANO, (MI)» — con Milano due
 * volte e il CAP **generico 20100** accanto a quello vero della via.
 * Su 87 clienti FIC con un indirizzo sono 2 (Vivo Concerti, OLFATTORIO), ma
 * bastano a trasformare una «conferma» in un peggioramento.
 */
export function componiIndirizzo(d: Pick<FicClienteFiscale, "indirizzo" | "cap" | "citta" | "provincia">): string {
  const via = (d.indirizzo ?? "").trim();
  if (!via) return "";
  const giaDentro = (v?: string | null) => Boolean(v && via.toLowerCase().includes(v.trim().toLowerCase()));
  const capGiaNellaVia = /\b\d{5}\b/.test(via);
  const coda = [
    capGiaNellaVia ? "" : (d.cap ?? "").trim(),
    giaDentro(d.citta) ? "" : (d.citta ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const prov = d.provincia && !giaDentro(d.provincia) ? `(${d.provincia})` : "";
  return [via, coda, prov].filter(Boolean).join(", ").trim();
}

export function campiProposti(d: FicClienteFiscale) {
  const indirizzo = componiIndirizzo(d);
  return {
    // il nome fiscale del cliente FIC (intestazione della fattura) è la ragione
    // sociale: nel registro il "nome" è l'insegna, la "ragioneSociale" è la
    // denominazione legale. Finora non veniva propagata → restava vuota ovunque.
    ...(d.nome ? { ragioneSociale: d.nome } : {}),
    ...(d.piva ? { pIva: d.piva } : {}),
    ...(d.codiceFiscale ? { codiceFiscale: d.codiceFiscale } : {}),
    ...(indirizzo ? { indirizzo } : {}),
    ...(d.citta ? { citta: d.citta } : {}),
    ...(d.provincia ? { provincia: d.provincia } : {}),
    ...(d.email ? { email: d.email } : {}),
    // dati finanziari da FIC (vanno nel blocco datiFinanziari del registro)
    ...(d.pec ? { pec: d.pec } : {}),
    ...(d.codiceSdi ? { codiceSdi: d.codiceSdi } : {}),
    ...(d.referente ? { amministrazioneNome: d.referente } : {}),
    ...(d.telefono ? { amministrazioneTelefono: d.telefono } : {}),
    ...(d.email ? { amministrazioneEmail: d.email } : {}),
  };
}

// Ricalcola i campi da proporre partendo dal nome del cliente FIC, leggendo i
// dati FIC correnti (in cache). Serve alle server action per NON dipendere dal
// payload della pagina nel browser, che può essere una versione vecchia priva di
// campi introdotti dopo (es. la ragione sociale).
export async function campiPropostiPerNome(ficNome: string) {
  const clienti = await clientiFicCache();
  const d = clienti.find((c) => c.nome === ficNome);
  return d ? campiProposti(d) : {};
}

export async function costruisciRiconciliazione(): Promise<Riconciliazione> {
  // Tutto in parallelo: i due dati esterni pesanti sono in cache (10 min), i tre
  // dati DB sono freschi. Prima erano in serie → decine di round-trip a ogni render.
  const [clienti, partners, stati, beneficiariQonto, movConIban, schedeRegistro] = await Promise.all([
    clientiFicCache(),
    prisma.partner.findMany(),
    prisma.riconciliazioneAnagrafica.findMany(),
    beneficiariQontoCache(),
    prisma.transazioneBancaria.findMany({
      where: { ibanControparte: { not: null } },
      select: { controparte: true, descrizione: true, ibanControparte: true },
      take: 5000,
    }),
    schedeRegistroCache(),
  ]);
  const statoPerNome = new Map(stati.map((s) => [s.ficNome, s]));

  // IBAN dai bonifici fatti: beneficiari Qonto (best effort) + IBAN presenti nei
  // movimenti importati (es. bonifici dell'estratto Vivid). Uniti in un'unica
  // lista {nome, iban} su cui abbinare il partner per nome.
  const fonti: { nome: string; iban: string; trusted: boolean }[] = [...beneficiariQonto];
  for (const m of movConIban) {
    const nome = (m.controparte ?? m.descrizione ?? "").trim();
    if (nome && m.ibanControparte) fonti.push({ nome, iban: m.ibanControparte, trusted: false });
  }
  // IBAN il cui nome (beneficiario/controparte) corrisponde al partner
  // (preferendo i trusted Qonto). Torna anche il NOME: è l'intestatario del
  // conto, e si perde se si tiene solo l'IBAN.
  const contoPerPartner = (partner: Partner | null): { iban: string; nome: string } | null => {
    if (!partner) return null;
    const candidati = fonti
      .filter((b) => matchPartner(b.nome, [partner]) != null)
      .sort((a, b) => Number(b.trusted) - Number(a.trusted));
    return candidati[0] ? { iban: candidati[0].iban, nome: candidati[0].nome.trim() } : null;
  };

  const conciliati: EsitoRiga[] = [];
  const daCollegare: EsitoRiga[] = [];
  const senzaMatch: EsitoRiga[] = [];

  for (const dati of clienti) {
    const st = statoPerNome.get(dati.nome);
    // Un abbinamento manuale salvato (st.partnerId) ha priorità sull'auto-match
    // per nome: così un cliente "solo FIC" riconciliato a mano con un partner
    // FINANCE passa dai "senza conciliazione" ai conciliati.
    // ⚠️ Su una riga IGNORATA l'abbinamento automatico non si riapplica: chi ha
    // premuto «Ignora» ha detto che quel partner non è il suo, e riproporglielo
    // a ogni ricarica lo rimetterebbe esattamente dove non lo voleva. Senza
    // questo, «CIOCCOLATO S.A.S. DI SIMONA SOLBIATI» tornava agganciato ad AMIR
    // subito dopo essere stato scollegato.
    // Solo «confermata» e «ignorata» sono decisioni. Dal 09/09 una riga può
    // esistere anche solo per tenere «l'IBAN proposto non mi interessa»
    // (`stato: "aperta"`): quella non deve valere come giudizio sull'abbinamento.
    const statoDeciso =
      st?.stato === "confermata" || st?.stato === "ignorata" ? st.stato : null;
    const scelto = st?.partnerId ? partners.find((p) => p.id === st.partnerId) ?? null : null;
    const partner = scelto ?? (statoDeciso === "ignorata" ? null : matchPartner(dati.nome, partners));
    const conto = contoPerPartner(partner);
    const riga: EsitoRiga = {
      ficNome: dati.nome,
      dati,
      partner,
      collegatoRegistro: Boolean(partner?.anagraficaId),
      stato: statoDeciso,
      esitoUltimoInvio: st?.esito ?? null,
      ibanSuggerito: conto?.iban ?? null,
      intestatarioSuggerito: conto?.nome ?? null,
      ibanRegistro: partner?.anagraficaId ? schedeRegistro[partner.anagraficaId]?.iban || null : null,
      intestatarioRegistro: partner?.anagraficaId
        ? schedeRegistro[partner.anagraficaId]?.intestatario ?? null
        : null,
      ibanIgnorato: st?.ibanIgnorato ?? false,
      confronto: confrontaColRegistro(
        campiProposti(dati),
        partner?.anagraficaId ? schedeRegistro[partner.anagraficaId] : undefined
      ),
    };
    if (!partner) senzaMatch.push(riga);
    else if (partner.anagraficaId) conciliati.push(riga);
    else daCollegare.push(riga);
  }

  // i conciliati: prima quelli ancora da confermare, poi confermati/ignorati
  const ordine = (r: EsitoRiga) => (r.stato === null ? 0 : r.stato === "confermata" ? 1 : 2);
  conciliati.sort((a, b) => ordine(a) - ordine(b) || a.ficNome.localeCompare(b.ficNome, "it"));

  return { conciliati, daCollegare, senzaMatch };
}

/** I dati fiscali che Fatture in Cloud conosce già per un partner Deluxy.
 *
 *  Serve al caso vero: il partner «GRUÈ» in anagrafica non ha né partita IVA né
 *  codice SDI, ma su Fatture in Cloud ci sono 38 fatture intestate a
 *  «GRUE' S.R.L.» con tutto. Chiedere all'operatore di ridigitare quei dati —
 *  o peggio, farlo sbagliare scegliendo la voce sbagliata di un menu dove lo
 *  stesso cliente compare due volte con due nomi — è lavoro inutile e un modo
 *  per emettere una fattura a un'anagrafica sbagliata.
 *
 *  L'aggancio usa lo stesso confronto per parole intere della riconciliazione,
 *  quindi «FIORE» non prende «FIORERIA». Se il nome non combacia con nessuno,
 *  torna null: meglio fermarsi e chiedere che indovinare l'intestatario.
 */
export async function datiFiscaliDaFic(partner: Partner): Promise<FicClienteFiscale | null> {
  let clienti: FicClienteFiscale[];
  try {
    clienti = await clientiFicCache();
  } catch {
    return null; // FIC irraggiungibile: si prosegue coi soli dati locali
  }
  const candidati = clienti.filter((c) => matchPartner(c.nome, [partner])?.id === partner.id);
  if (candidati.length === 0) return null;
  // Fra più intestazioni dello stesso cliente vince la più completa: alcune
  // fatture vecchie hanno solo il nome.
  const punti = (c: FicClienteFiscale) => Object.values(c).filter(Boolean).length;
  return candidati.sort((a, b) => punti(b) - punti(a))[0];
}


/**
 * I campi da mandare al registro per un cliente FIC: **solo quelli mancanti**.
 *
 * Le server action ricalcolano i campi da qui invece di fidarsi del payload del
 * browser (che può essere una pagina vecchia). Il filtro deve stare QUI e non
 * solo nell'interfaccia: una server action è un endpoint, e il conto di «cosa
 * cambia» non può dipendere da cosa aveva in mano la scheda aperta ieri.
 */
export async function campiDaInviarePerNome(
  ficNome: string,
  anagraficaId: string | null
): Promise<Confronto> {
  const [clienti, schede] = await Promise.all([clientiFicCache(), schedeRegistroCache()]);
  const d = clienti.find((c) => c.nome === ficNome);
  if (!d) return { daInviare: {}, diversi: [], uguali: 0 };
  return confrontaColRegistro(campiProposti(d), anagraficaId ? schede[anagraficaId] : undefined);
}
