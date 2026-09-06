// Da una persona di Personale a una riga di costo del personale di Budgets:
// **niente database, niente rete** (come persone.ts: queste funzioni possono
// servire anche a un componente client).
//
// Il punto delicato è il TEMPO. Personale tiene inquadramento e compenso come
// STORIE (una riga per variazione, con decorrenza), e conosce assunzione e
// cessazione. Budgets ragiona per mesi dell'anno di budget. Qui si traduce:
// per ogni mese dell'anno si guarda se la persona è in forza e quale compenso
// vale in quel mese — comprese le decorrenze FUTURE, perché un budget deve
// sapere che a settembre arriva qualcuno che ad agosto non costa ancora.
//
// ⚠️ Cosa NON si deduce (regola di casa: meglio «non indicato» che un numero
// inventato):
// - contributi non dichiarati in Personale → costo = lordo, e la persona
//   finisce fra gli `avvisi` (là il costo azienda è «non calcolabile»; qui un
//   costo a zero farebbe più danno di uno sottostimato e dichiarato);
// - nessun compenso in forza in un mese → quel mese costa zero, e se la
//   persona è in forza senza compenso lo si dice.

import type { Persona } from "./persone";
import type { CompensoPersonale, InquadramentoPersonale, PersonaPersonale } from "./personale";

// Il tipo di Budgets (decide TFR e stima del netto) dal tipo di contratto di
// Personale. Stage → stagista; P.IVA e consulente → consulente; il resto è
// lavoro dipendente (indeterminato, determinato, apprendistato, co.co.co.,
// «dipendente», «altro»).
export function tipoBudgetsDa(tipoContratto: string | null | undefined): Persona["tipo"] {
  if (tipoContratto === "stage") return "STAGISTA";
  if (tipoContratto === "partita_iva" || tipoContratto === "consulente") return "CONSULENTE";
  return "DIPENDENTE";
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const ultimoGiorno = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// L'ultima riga con decorrenza non oltre la data (confronto fra ISO
// yyyy-mm-dd, che si ordinano come stringhe).
function inVigoreAl<T extends { decorrenza: string }>(righe: T[], data: string): T | null {
  let scelta: T | null = null;
  for (const r of righe) {
    if (r.decorrenza <= data && (!scelta || r.decorrenza > scelta.decorrenza)) scelta = r;
  }
  return scelta;
}

export type AttributiPianificazione = {
  maisonId: string | null;
  budget: boolean;
  note: string | null;
};

export type PersonaTradotta = {
  persona: Persona;
  avvisi: string[];
};

export function personaDaPersonale(
  p: PersonaPersonale,
  year: number,
  attributi: AttributiPianificazione | null
): PersonaTradotta {
  const avvisi: string[] = [];
  // Con le storie si ragiona sulle storie; senza (Personale vecchio) resta il
  // solo «corrente», e vale per tutti i mesi in forza — dichiarato dal
  // chiamante tramite `organico.storia`.
  const inquadramenti: InquadramentoPersonale[] = p.inquadramenti ?? (p.inquadramento ? [p.inquadramento] : []);
  const compensi: CompensoPersonale[] = p.compensi ?? (p.compenso ? [p.compenso] : []);

  // La finestra in cui la persona è in forza: dall'assunzione (o, se non
  // scritta, dalla prima decorrenza nota) alla cessazione. La SCADENZA di un
  // inquadramento non chiude la finestra: un contratto si rinnova, e chi è
  // ancora «attivo» in Personale è ancora in azienda (Turchiello: scadenza
  // 30/06, uscita vera 31/07).
  const decorrenze = [...inquadramenti.map((i) => i.decorrenza), ...compensi.map((c) => c.decorrenza)].sort();
  const inizio = p.dataAssunzione ?? decorrenze[0] ?? null;
  const fine = p.dataCessazione ?? null;
  if (!inizio) avvisi.push(`${p.nome}: né assunzione né decorrenze in Personale — non si sa da quando conta, esclusa`);

  const mesi: number[] = [];
  const perMese: { lordo: number; contributiPct: number }[] = [];
  let mesiSenzaCompenso = 0;
  let contributiMancanti = false;
  let ultimoCompenso: CompensoPersonale | null = null;
  let ultimoInquadramento: InquadramentoPersonale | null = null;
  for (let m = 1; m <= 12; m++) {
    const primo = iso(year, m, 1);
    const ultimo = iso(year, m, ultimoGiorno(year, m));
    const inForza = Boolean(inizio) && inizio! <= ultimo && (!fine || fine >= primo);
    if (!inForza) {
      perMese.push({ lordo: 0, contributiPct: 0 });
      continue;
    }
    const comp = inVigoreAl(compensi, ultimo);
    const inq = inVigoreAl(inquadramenti, ultimo);
    if (inq) ultimoInquadramento = inq;
    if (!comp) {
      mesiSenzaCompenso++;
      perMese.push({ lordo: 0, contributiPct: 0 });
      continue;
    }
    ultimoCompenso = comp;
    const autonomo = comp.natura === "compenso";
    let contributi = comp.contributiPct;
    if (contributi == null) {
      // Un autonomo senza oneri dichiarati costa il compenso (sulla fattura
      // non ci sono oneri nascosti); un dipendente senza % è un dato che manca.
      if (!autonomo) contributiMancanti = true;
      contributi = 0;
    }
    mesi.push(m);
    perMese.push({ lordo: comp.ral / 12, contributiPct: contributi });
  }
  if (mesiSenzaCompenso > 0) {
    avvisi.push(
      `${p.nome}: in forza ${mesiSenzaCompenso} ${mesiSenzaCompenso === 1 ? "mese" : "mesi"} senza un compenso in Personale — quei mesi costano zero`
    );
  }
  if (contributiMancanti) {
    avvisi.push(`${p.nome}: contributi non dichiarati in Personale — contata al solo lordo`);
  }

  const tipoContratto = (ultimoInquadramento ?? p.inquadramento)?.tipoContratto ?? null;
  const persona: Persona = {
    id: p.id,
    nome: p.nome,
    ruolo: p.ruolo,
    tipo: tipoBudgetsDa(tipoContratto),
    // Il RAL di Personale è già l'importo effettivo (part-time applicato):
    // qui va a tempo pieno = 100 per non riproporzionarlo di nuovo. La
    // percentuale vera resta in `tempoPct`, per mostrarla.
    importo: ultimoCompenso?.ral ?? 0,
    superminimo: 0,
    partTimePct: 100,
    periodicita: "ANNUO",
    contributiPct: ultimoCompenso?.contributiPct ?? 0,
    mensilita: ultimoCompenso?.mensilita ?? 14,
    inpsPct: 9.19,
    addizionaliPct: 2,
    mesi,
    maisonId: attributi?.maisonId ?? null,
    teamId: p.funzione?.id ?? null,
    budget: attributi?.budget ?? false,
    note: attributi?.note ?? null,
    perMese,
    tempoPct: (ultimoInquadramento ?? p.inquadramento)?.partTimePct ?? null,
    contratto: (ultimoInquadramento ?? p.inquadramento)?.tipoContrattoNome ?? null,
    email: p.email ?? null,
    stato: p.stato,
    dal: inizio,
    al: fine,
  };
  return { persona, avvisi };
}

// Lo stesso nome scritto un po' diverso deve contare come uguale (come fa il
// Hub): serve UNA volta, per agganciare il vecchio roster alle schede di
// Personale. Dopo, il legame è per id.
export function nomeNormalizzato(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
