import type { Partner } from "@prisma/client";
import { prisma } from "./db";
import { ficClientiFiscali, type FicClienteFiscale } from "./fic";
import { matchPartner } from "./riconciliazione";

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

export async function costruisciRiconciliazione(): Promise<Riconciliazione> {
  const [clienti, partners, stati] = await Promise.all([
    ficClientiFiscali(),
    prisma.partner.findMany(),
    prisma.riconciliazioneAnagrafica.findMany(),
  ]);
  const statoPerNome = new Map(stati.map((s) => [s.ficNome, s]));

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
