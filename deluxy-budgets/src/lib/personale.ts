// L'organico viene da Deluxy Personale, la casa dei dati HR (Standard §7: ogni
// dato ha una casa sola). Fino al 06/09/2026 Budgets teneva un roster suo —
// tabella `Dipendente`, editor in /dipendenti — e Personale gli PROPONEVA le
// persone nuove via POST. L'utente ha deciso: «personale e team devono
// arrivare da app personale». Da qui in poi persone e squadre si LEGGONO da
// `/api/v1/persone` e `/api/v1/team` di Personale; Budgets tiene solo ciò che
// è pianificazione sua (la maison a cui attribuire il costo, il ruolo
// economico della squadra, note), agganciato per id — riferimento, non copia.
//
// ⚠️ Best effort come le altre letture (Orders, Finance, piattaforma): se
// Personale tace la pagina lo DICE e il costo del personale vale zero
// dichiarato, non zero silenzioso. Niente ripiego sul vecchio roster: sarebbe
// la tabella-copia che il contratto vieta, e mostrerebbe un numero vecchio
// con l'aria di essere quello giusto.

import { RIVALIDA } from "./cache";
import { chiave } from "./chiavi";

const BASE = (process.env.PERSONALE_URL ?? "https://deluxy-personale.vercel.app").replace(/\/$/, "");

export type InquadramentoPersonale = {
  decorrenza: string; // ISO yyyy-mm-dd
  scadenza: string | null;
  tipoContratto: string; // chiave di Personale: dipendente | stage | partita_iva | …
  tipoContrattoNome: string;
  partTimePct: number;
};

export type CompensoPersonale = {
  decorrenza: string;
  // "ral" per i dipendenti, "compenso" per gli autonomi (P.IVA, consulente)
  natura: "ral" | "compenso";
  // ⚠️ È già l'importo EFFETTIVO (col part-time applicato): 25.000 × 75% arriva
  // come 18.750. Non va riproporzionato una seconda volta.
  ral: number;
  mensilita: number | null;
  // null = non dichiarati in Personale: il costo azienda là è «non calcolabile».
  contributiPct: number | null;
  costoAzienda: number | null;
};

export type PersonaPersonale = {
  id: string;
  nome: string;
  email: string | null;
  ruolo: string | null;
  stato: "attivo" | "cessato" | string;
  dataAssunzione: string | null;
  dataCessazione: string | null;
  funzione: { id: string; nome: string } | null;
  inquadramento: InquadramentoPersonale | null;
  compenso: CompensoPersonale | null;
  // Le STORIE (con ?storia=1, dal 06/09/2026): ogni variazione con la sua
  // decorrenza, comprese quelle FUTURE — è così che un budget sa che a
  // settembre arriva una persona che oggi non costa ancora.
  inquadramenti?: InquadramentoPersonale[];
  compensi?: CompensoPersonale[];
};

export type FunzionePersonale = {
  id: string;
  nome: string;
  responsabile: string | null;
};

export type OrganicoPersonale =
  | {
      stato: "ok";
      persone: PersonaPersonale[];
      funzioni: FunzionePersonale[];
      // false = il Personale interrogato non espone ancora le storie: si è
      // usato il solo «corrente», e le pagine lo dichiarano.
      storia: boolean;
    }
  | { stato: "senza-chiave" }
  | { stato: "errore"; motivo: string };

export const NOME_CHIAVE_PERSONALE = "PERSONALE_API_KEY";

export async function fetchOrganicoPersonale(): Promise<OrganicoPersonale> {
  const key = await chiave(NOME_CHIAVE_PERSONALE);
  if (!key) return { stato: "senza-chiave" };

  const headers = { "x-api-key": key, "X-App": "deluxy-budgets" };
  try {
    const [rp, rt] = await Promise.all([
      // Tutte le persone, cessate comprese: chi è uscito a giugno è costato
      // sei mesi, e un consuntivo senza di lui sarebbe falso.
      fetch(`${BASE}/api/v1/persone?stato=tutti&compensi=1&storia=1`, {
        headers,
        next: { revalidate: RIVALIDA },
        signal: AbortSignal.timeout(6000),
      }),
      fetch(`${BASE}/api/v1/team`, {
        headers,
        next: { revalidate: RIVALIDA },
        signal: AbortSignal.timeout(6000),
      }),
    ]);
    if (rp.status === 401 || rt.status === 401) {
      return {
        stato: "errore",
        motivo:
          "Personale non riconosce la chiave (401): se ne genera una nuova da Personale → Chiavi delle app (sola lettura) e si mette come PERSONALE_API_KEY (ambiente, Configurazione → Chiavi, o cassaforte del Hub)",
      };
    }
    if (!rp.ok) return { stato: "errore", motivo: `Personale risponde ${rp.status} su /api/v1/persone` };
    if (!rt.ok) return { stato: "errore", motivo: `Personale risponde ${rt.status} su /api/v1/team` };

    const dp = (await rp.json()) as { persone?: PersonaPersonale[] };
    const dt = (await rt.json()) as { team?: FunzionePersonale[] };
    if (!Array.isArray(dp?.persone) || !Array.isArray(dt?.team)) {
      return { stato: "errore", motivo: "risposta di Personale non riconosciuta" };
    }
    const storia = dp.persone.some((p) => Array.isArray(p.inquadramenti));
    return {
      stato: "ok",
      persone: dp.persone,
      funzioni: dt.team.map((t) => ({ id: t.id, nome: t.nome, responsabile: t.responsabile ?? null })),
      storia,
    };
  } catch {
    return { stato: "errore", motivo: "Personale non raggiungibile (timeout o rete)" };
  }
}
