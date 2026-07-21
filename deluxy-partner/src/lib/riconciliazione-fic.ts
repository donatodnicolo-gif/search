import type { Partner } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { ficClientiFiscali, type FicClienteFiscale } from "./fic";
import { matchPartner } from "./riconciliazione";
import { qontoBeneficiari, qontoConfigurato, type QontoBeneficiario } from "./qonto";

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
};

export type Riconciliazione = {
  conciliati: EsitoRiga[]; // cliente FIC ↔ partner collegato al registro (aggiornabili)
  daCollegare: EsitoRiga[]; // abbinati a un partner ma senza anagraficaId
  senzaMatch: EsitoRiga[]; // clienti FIC senza partner corrispondente
};

// Campi che FIC può proporre al registro per un cliente conciliato: i dati
// fiscali (livelli alti) e quelli finanziari che FIC possiede (PEC, codice SDI,
// contatto amministrativo). IBAN/banca/metodo pagamento NON stanno in FIC.
export function campiProposti(d: FicClienteFiscale) {
  const indirizzo = [d.indirizzo, [d.cap, d.citta].filter(Boolean).join(" "), d.provincia ? `(${d.provincia})` : ""]
    .filter(Boolean)
    .join(", ")
    .trim();
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
  const [clienti, partners, stati, beneficiariQonto, movConIban] = await Promise.all([
    clientiFicCache(),
    prisma.partner.findMany(),
    prisma.riconciliazioneAnagrafica.findMany(),
    beneficiariQontoCache(),
    prisma.transazioneBancaria.findMany({
      where: { ibanControparte: { not: null } },
      select: { controparte: true, descrizione: true, ibanControparte: true },
      take: 5000,
    }),
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
  // IBAN il cui nome (beneficiario/controparte) corrisponde al partner (preferendo i trusted Qonto)
  const ibanPerPartner = (partner: Partner | null): string | null => {
    if (!partner) return null;
    const candidati = fonti
      .filter((b) => matchPartner(b.nome, [partner]) != null)
      .sort((a, b) => Number(b.trusted) - Number(a.trusted));
    return candidati[0]?.iban ?? null;
  };

  const conciliati: EsitoRiga[] = [];
  const daCollegare: EsitoRiga[] = [];
  const senzaMatch: EsitoRiga[] = [];

  for (const dati of clienti) {
    const partner = matchPartner(dati.nome, partners);
    const st = statoPerNome.get(dati.nome);
    const riga: EsitoRiga = {
      ficNome: dati.nome,
      dati,
      partner,
      collegatoRegistro: Boolean(partner?.anagraficaId),
      stato: (st?.stato as "confermata" | "ignorata" | undefined) ?? null,
      esitoUltimoInvio: st?.esito ?? null,
      ibanSuggerito: ibanPerPartner(partner),
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
