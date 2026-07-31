// **Le imposte che si pagheranno**, stimate dal bilancio.
//
// Perché serve: nel 2024 Deluxy ha chiuso in **perdita di 21.130 €** e ha
// comunque pagato imposte, perché il reddito **fiscale** era +48.970 € e la
// base IRAP 97.120 €. Il gestionale non lo vede: guarda l'EBITDA, che di quella
// differenza non sa niente. Un'azienda che chiude in perdita e riceve un F24 da
// migliaia di euro ha un problema di cassa che nessuna pagina di questa app
// stava anticipando.
//
// **La differenza fra utile civilistico e reddito imponibile** sono le
// *variazioni*: costi che in bilancio ci sono ma che il fisco non riconosce, o
// riconosce solo in parte. Le percentuali qui sotto sono le regole ordinarie per
// una S.r.l. (TUIR); non sostituiscono il commercialista, ma dicono l'ordine di
// grandezza **prima** che arrivi il conto.
//
// Le tre cose che questo file NON sa fare, dichiarate perché contano:
//  - **ROL e interessi passivi** (art. 96 TUIR): deducibili entro il 30% del
//    ROL. Qui gli oneri finanziari si considerano interamente deducibili;
//  - **ACE, perdite pregresse riportabili, crediti d'imposta**: abbattono
//    l'imponibile e non sono nei dati dell'app;
//  - **la competenza fiscale**: alcuni costi si deducono per cassa (compensi
//    amministratore, contributi), e qui si usa il criterio del bilancio.

export const ALIQUOTA_IRES = 24;
export const ALIQUOTA_IRAP = 3.9;

export type RegolaFiscale = {
  // quanto del costo è deducibile ai fini IRES
  ires: number;
  // quanto lo è ai fini IRAP: molte voci deducibili IRES non lo sono IRAP,
  // perché l'IRAP colpisce il valore della produzione, non l'utile
  irap: number;
  perche: string;
};

const PIENA: RegolaFiscale = { ires: 100, irap: 100, perche: "costo ordinario, interamente deducibile" };

// Le regole per categoria di costo, riconosciute dal **nome** delle categorie
// del CFO. Quando una categoria non è nell'elenco vale la deducibilità piena, ed
// è la scelta prudente: sovrastimare le imposte spaventa senza motivo,
// sottostimarle fa arrivare un F24 a sorpresa — ma inventare indeducibilità che
// nessuno ha deciso sarebbe peggio di entrambe.
export const REGOLE: Record<string, RegolaFiscale> = {
  "Pasti e rappresentanza": {
    ires: 75,
    irap: 0,
    perche:
      "vitto e alloggio deducibili al 75% (art. 109 c.5 TUIR); le spese di rappresentanza hanno anche il tetto dell'1,5% dei ricavi. Ai fini IRAP sono indeducibili",
  },
  "Carburante, pedaggi e parcheggi": {
    ires: 20,
    irap: 20,
    perche:
      "veicoli non esclusivamente strumentali: 20% (art. 164 TUIR). Sale al 70% se assegnati in uso promiscuo a un dipendente per la maggior parte del periodo",
  },
  "Viaggi e trasferte": {
    ires: 75,
    irap: 0,
    perche: "vitto e alloggio al 75%; i trasporti sono pieni. Percentuale prudenziale in attesa della distinzione",
  },
  "Imposte e tributi": {
    ires: 0,
    irap: 0,
    perche:
      "IRES e IRAP non sono deducibili da se stesse; IVA e ritenute sono partite di giro, non costi. L'IMU invece è deducibile al 100% dal 2022 e va tolta da qui",
  },
  "Banca e giroconti": {
    ires: 100,
    irap: 0,
    perche:
      "commissioni e interessi passivi: deducibili IRES (entro il 30% del ROL, non calcolato qui) ma **indeducibili IRAP**, che non guarda la gestione finanziaria",
  },
  "Amministratore e collaboratori": {
    ires: 100,
    irap: 0,
    perche:
      "compenso dell'amministratore: deducibile IRES **per cassa** (art. 95 c.5 TUIR) e indeducibile IRAP. Se è deliberato ma non pagato nell'anno, non si deduce",
  },
  "Stipendi dei dipendenti": {
    ires: 100,
    irap: 100,
    perche:
      "dal 2015 il costo dei dipendenti a tempo indeterminato è deducibile IRAP con la deduzione del cuneo fiscale: qui è trattato come pieno",
  },
  "Consulenti esterni": PIENA,
  "Abbonamenti software": PIENA,
  "Sviluppo su commessa": PIENA,
  "Struttura e servizi fissi": PIENA,
  "Pubblicità": PIENA,
  "Consegne (valet e corrieri)": PIENA,
  "Fornitori di eventi": PIENA,
  "Materiali per gli ordini": PIENA,
  "Da classificare": {
    ires: 100,
    irap: 100,
    perche: "trattata come piena, ma è la coda non classificata: finché sta lì, la stima è meno affidabile",
  },
};

export function regolaDi(nomeCategoria: string): RegolaFiscale {
  return REGOLE[nomeCategoria] ?? PIENA;
}

// **Il metro storico, e perché serve.**
//
// Misurato sul 2024 vero: le variazioni in aumento dichiarate sono state
// **70.100 €** (reddito imponibile 48.970 su una perdita civilistica di
// −21.130), mentre le percentuali per categoria qui sopra ne spiegano **1.385**,
// cioè il **2%**. Il resto sono voci che l'app non vede — accantonamenti,
// ammortamenti eccedenti i coefficienti, compensi non pagati nell'anno, perdite
// su crediti, costi non documentati.
//
// Una stima che ignora il 98% delle variazioni non è una stima: è un numero che
// tranquillizza. Per questo accanto al calcolo analitico si tiene il rapporto
// dell'ultimo anno **vero**, che quel 98% lo contiene per definizione.
export type MetroStorico = {
  anno: number;
  variazioni: number; // reddito imponibile − risultato ante imposte
  suiCosti: number; // in percentuale sui costi dell'anno
  spiegatoDalModello: number; // quanto ne coglievano le regole per categoria
};

export function metroStorico(input: {
  anno: number;
  redditoImponibile: number;
  risultatoAnteImposte: number;
  costiTotali: number;
  variazioniDaModello: number;
}): MetroStorico | null {
  const variazioni = input.redditoImponibile - input.risultatoAnteImposte;
  if (variazioni <= 0 || input.costiTotali <= 0) return null;
  return {
    anno: input.anno,
    variazioni,
    suiCosti: (variazioni / input.costiTotali) * 100,
    spiegatoDalModello: (input.variazioniDaModello / variazioni) * 100,
  };
}

export type VariazioneFiscale = {
  categoria: string;
  costo: number;
  deducibileIres: number;
  variazioneIres: number; // la parte NON deducibile: si somma all'utile
  deducibileIrap: number;
  variazioneIrap: number;
  perche: string;
};

export type StimaImposte = {
  // punto di partenza
  utileCivilistico: number;
  // variazioni in aumento per costi indeducibili
  variazioni: VariazioneFiscale[];
  totaleVariazioniIres: number;
  // Gli ammortamenti che il fisco non riconosce: non nascono da una categoria
  // di banca (gli ammortamenti in banca non passano), li dà il commercialista.
  variazioneAmmortamenti: number;
  // Prima delle perdite pregresse: è l'imponibile su cui si calcola l'80%.
  redditoLordo: number;
  // Perdite di esercizi precedenti effettivamente usate quest'anno.
  perditeUsate: number;
  perditeDisponibili: number;
  perditeResidue: number;
  redditoImponibile: number;
  ires: number;
  // IRAP: base diversa, non parte dall'utile
  baseIrap: number;
  irap: number;
  totale: number;
  // Quello che la stima NON contiene: si dichiara, perché ognuna di queste voci
  // può spostare il conto di migliaia di euro.
  avvertenze: string[];
};

// Quanta parte dell'imponibile può essere abbattuta dalle perdite pregresse
// (art. 84 c.1 TUIR). Non è il 100%: anche con perdite enormi un quinto del
// reddito resta tassato.
export const USO_MASSIMO_PERDITE = 80;

export function stimaImposte(input: {
  utileCivilistico: number;
  costiPerCategoria: { categoria: string; costo: number }[];
  // valore della produzione e costi che concorrono alla base IRAP
  valoreProduzione: number;
  costiIrapDeducibili: number;
  // ---- I due numeri che solo il commercialista ha ----
  // Si passano `undefined` finché non arrivano: zero e «non comunicato» non
  // sono la stessa cosa, e la pagina lo dice invece di calcolare su un vuoto.
  perditePregresse?: number;
  ammortamentiIndeducibili?: number;
}): StimaImposte {
  const variazioni: VariazioneFiscale[] = [];
  for (const c of input.costiPerCategoria) {
    if (c.costo <= 0) continue;
    const r = regolaDi(c.categoria);
    const dedIres = (c.costo * r.ires) / 100;
    const dedIrap = (c.costo * r.irap) / 100;
    variazioni.push({
      categoria: c.categoria,
      costo: c.costo,
      deducibileIres: dedIres,
      variazioneIres: c.costo - dedIres,
      deducibileIrap: dedIrap,
      variazioneIrap: c.costo - dedIrap,
      perche: r.perche,
    });
  }
  const totaleVariazioniIres = variazioni.reduce((s, v) => s + v.variazioneIres, 0);
  // Gli ammortamenti eccedenti i coefficienti fiscali sono una variazione in
  // aumento come le altre, ma non hanno una categoria di banca da cui nascere:
  // in banca gli ammortamenti non passano. Arrivano dal conto economico.
  const variazioneAmmortamenti = input.ammortamentiIndeducibili ?? 0;
  const redditoLordo = input.utileCivilistico + totaleVariazioniIres + variazioneAmmortamenti;

  // ---- Perdite pregresse (art. 84 TUIR) ----
  // Abbattono l'imponibile ma **fino all'80%**: anche con perdite più grandi
  // del reddito, un quinto resta tassato. È il motivo per cui «abbiamo le
  // perdite, non paghiamo niente» è quasi sempre falso.
  const perditeDisponibili = Math.max(0, input.perditePregresse ?? 0);
  const perditeUsate =
    redditoLordo > 0 ? Math.min(perditeDisponibili, (redditoLordo * USO_MASSIMO_PERDITE) / 100) : 0;
  const perditeResidue = perditeDisponibili - perditeUsate;
  const redditoImponibile = redditoLordo - perditeUsate;
  // L'IRES si paga solo su un reddito positivo: una perdita non genera credito,
  // si riporta agli anni successivi.
  const ires = redditoImponibile > 0 ? (redditoImponibile * ALIQUOTA_IRES) / 100 : 0;

  const baseIrap = input.valoreProduzione - input.costiIrapDeducibili;
  const irap = baseIrap > 0 ? (baseIrap * ALIQUOTA_IRAP) / 100 : 0;

  return {
    utileCivilistico: input.utileCivilistico,
    variazioni: variazioni.sort((a, b) => b.variazioneIres - a.variazioneIres),
    totaleVariazioniIres,
    variazioneAmmortamenti,
    redditoLordo,
    perditeUsate,
    perditeDisponibili,
    perditeResidue,
    redditoImponibile,
    ires,
    baseIrap,
    irap,
    totale: ires + irap,
    avvertenze: [
      "**Interessi passivi**: qui sono dedotti per intero, ma l'art. 96 TUIR li ammette entro il 30% del ROL. Con molti oneri finanziari l'imponibile vero è più alto.",
      input.perditePregresse === undefined
        ? "**Perdite pregresse: non comunicate.** Una perdita fiscale di anni passati abbatte questo imponibile fino all'80%, senza limiti di tempo. Finché il campo nel conto economico è vuoto, l'IRES stimata è un **massimo**. Deluxy ha chiuso il 2024 in perdita civilistica, quindi è probabile che qualcosa ci sia."
        : `**Perdite pregresse**: ${Math.round(perditeUsate).toLocaleString("it-IT")} € usati sui ${Math.round(perditeDisponibili).toLocaleString("it-IT")} € comunicati (tetto dell'80% dell'imponibile, art. 84 TUIR); ne restano ${Math.round(perditeResidue).toLocaleString("it-IT")} € per gli anni prossimi.`,
      input.ammortamentiIndeducibili === undefined
        ? "**Ammortamenti eccedenti: non comunicati.** La parte di B10 che supera i coefficienti fiscali è una variazione in aumento, e il gestionale non la può vedere: gli ammortamenti in banca non passano. Il campo è nel conto economico."
        : `**Ammortamenti eccedenti i coefficienti**: ${Math.round(variazioneAmmortamenti).toLocaleString("it-IT")} € sommati all'imponibile, comunicati dal commercialista.`,
      "**ACE e crediti d'imposta** (ricerca, formazione, beni strumentali) riducono ulteriormente il conto e non sono nei dati.",
      "**Deducibilità per cassa**: il compenso dell'amministratore si deduce solo se pagato nell'anno; qui vale il criterio del bilancio.",
      "**Rappresentanza**: oltre al 75% c'è il tetto dell'1,5% dei ricavi, non applicato in questa stima.",
      "**Acconti**: quanto stimato è l'imposta dell'anno, non quanto uscirà di cassa. Il saldo si versa a giugno dell'anno dopo, più due acconti al 40% e 60% del dovuto.",
    ],
  };
}
