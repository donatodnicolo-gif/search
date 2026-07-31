// **Quanto mettere da parte per l'IVA.**
//
// L'IVA non è un costo e non passa dal conto economico: è denaro che si incassa
// per conto dello Stato e si riversa. Ma è **cassa che esce**, ogni tre mesi, e
// un'azienda che la spende credendola sua si trova senza soldi il 16 del mese
// dopo. Il P&L non la vede per costruzione: per questo sta qui.
//
// Il conto è sempre lo stesso: **IVA incassata sulle vendite − IVA pagata sugli
// acquisti = quanto versare**. Le tre difficoltà vere sono nel dettaglio:
//
//  1. **sull'ecommerce Deluxy è intermediario** (modello C): l'IVA sul prezzo
//     pieno la fa il partner con il suo scontrino, e Deluxy versa l'IVA solo
//     sulla **propria provvigione**. Contarla sul venduto sarebbe versare l'IVA
//     di un altro;
//  2. **le uscite di banca sono IVA inclusa**: per sapere quanto si può
//     detrarre bisogna scorporarla, e non da tutte — su una fattura senza
//     partita IVA (fioristi occasionali, rimborsi) non c'è niente da detrarre;
//  3. **la detraibilità non è mai piena su tutto**: i veicoli si detraggono al
//     40%, la rappresentanza quasi mai, gli stipendi non hanno IVA.

export const ALIQUOTA_IVA = 22;

// ---- Non tutto sta al 22%: i fiori stanno al 10% ----
//
// **Fiori recisi, piante ornamentali e prodotti del florovivaismo scontano
// l'IVA al 10%** (tabella A parte III del DPR 633/72). È esattamente quello che
// Deluxy compra di più. Scorporando il 22% da una spesa che il 22% non l'ha mai
// avuto si tira fuori un'IVA che nessuno ha pagato: su 1.000 € di fiori il conto
// dà 180 € di credito invece di 91 — **il doppio**. E siccome il credito si
// sottrae dal debito, il numero che ne esce peggio è proprio quello per cui la
// pagina esiste: **quanto accantonare**, che risultava più basso del vero.
//
// La regola sta sulla **categoria** e non sul singolo movimento, perché la
// banca non dice cosa c'era dentro la fattura: dice a chi è stato pagato. È
// un'approssimazione, ed è dichiarata — ma è molto più vicina del 22% su tutto.
export const ALIQUOTA_PER_CATEGORIA: Record<string, { pct: number; perche: string }> = {
  "Materiali per gli ordini": {
    pct: 10,
    perche: "fiori, piante e prodotti del florovivaismo: aliquota ridotta al 10% (tabella A parte III, DPR 633/72)",
  },
  "Partner che eseguono gli ordini": {
    pct: 10,
    perche: "sono fiori e torte eseguiti da fiorai e pasticcerie: quando c'è una fattura, l'aliquota è il 10%",
  },
};

export const aliquotaDi = (categoria: string) => ALIQUOTA_PER_CATEGORIA[categoria]?.pct ?? ALIQUOTA_IVA;

// Quanta IVA si può detrarre su ciascuna categoria di costo, e perché. Dove non
// c'è una regola vale la detraibilità piena — che è la scelta prudente al
// contrario: sovrastima il credito e quindi **sottostima** quanto accantonare.
// Meglio così che il contrario? No: qui la prudenza vera sarebbe accantonare di
// più. Le categorie che contano sono quindi elencate una per una.
export const DETRAIBILITA: Record<string, { pct: number; perche: string }> = {
  "Stipendi dei dipendenti": { pct: 0, perche: "le retribuzioni sono fuori campo IVA: non c'è niente da detrarre" },
  "Amministratore e collaboratori": { pct: 0, perche: "compensi fuori campo o senza rivalsa IVA" },
  "Imposte e tributi": { pct: 0, perche: "i tributi non hanno IVA" },
  "Banca e giroconti": { pct: 0, perche: "le operazioni finanziarie sono esenti (art. 10)" },
  "Carburante, pedaggi e parcheggi": {
    pct: 40,
    perche: "veicoli non esclusivamente strumentali: detrazione al 40% (art. 19-bis1 lett. c)",
  },
  "Pasti e rappresentanza": {
    pct: 0,
    perche:
      "spese di rappresentanza: IVA **indetraibile** salvo omaggi sotto i 50 €. Su vitto e alloggio la detrazione c'è solo con fattura, non con lo scontrino",
  },
  "Viaggi e trasferte": { pct: 50, perche: "detraibile solo la parte documentata da fattura: percentuale prudenziale" },
  "Partner che eseguono gli ordini": {
    pct: 0,
    perche:
      "partita di giro del modello C: quello che si gira al partner non è un acquisto di Deluxy, e chi esegue spesso non emette fattura con IVA",
  },
};

export type RigaIva = {
  voce: string;
  imponibile: number;
  iva: number;
  // Con quale aliquota si è scorporato: senza questa colonna un credito più
  // basso del previsto sembra un errore di conto invece di una scelta.
  aliquota: number;
  nota: string;
};

export type StimaIva = {
  debito: RigaIva[]; // IVA incassata sulle vendite
  credito: RigaIva[]; // IVA pagata sugli acquisti, per la parte detraibile
  totaleDebito: number;
  totaleCredito: number;
  daVersare: number;
  // Quanto mettere da parte ogni mese per non trovarsi scoperti al versamento.
  accantonamentoMensile: number;
  avvertenze: string[];
};

// Scorpora l'IVA da un importo che la contiene: 122 → 22.
export const scorpora = (lordo: number, aliquota = ALIQUOTA_IVA) => (lordo * aliquota) / (100 + aliquota);

export function stimaIva(input: {
  mesi: number;
  // fatture emesse: imponibile e IVA arrivano già separati da Finance
  ivaFatture: number;
  imponibileFatture: number;
  // provvigioni dell'ecommerce: imponibili, l'IVA si aggiunge sopra
  provvigioniEcommerce: number;
  // margine sulla parte comprata dai fornitori: lì Deluxy compra e rivende,
  // quindi l'IVA netta è quella sul margine, non sull'intero venduto
  margineFornitori: number;
  costiPerCategoria: { categoria: string; costo: number }[];
}): StimaIva {
  const debito: RigaIva[] = [];
  if (input.ivaFatture > 0) {
    debito.push({
      voce: "Fatture emesse (consegne, eventi, B2B)",
      imponibile: input.imponibileFatture,
      iva: input.ivaFatture,
      // Aliquota media effettiva: sulle fatture emesse non si sceglie niente,
      // si legge quello che Finance ha già separato.
      aliquota: input.imponibileFatture > 0 ? (input.ivaFatture / input.imponibileFatture) * 100 : ALIQUOTA_IVA,
      nota: "IVA già separata sulle fatture di Finance: è un dato, non una stima",
    });
  }
  if (input.provvigioniEcommerce > 0) {
    debito.push({
      voce: "Provvigioni sulle vendite dei partner",
      imponibile: input.provvigioniEcommerce,
      iva: (input.provvigioniEcommerce * ALIQUOTA_IVA) / 100,
      // Una provvigione è una prestazione di servizi: 22% anche quando il
      // prodotto sottostante sta al 10%.
      aliquota: ALIQUOTA_IVA,
      nota: "modello C: si versa l'IVA sulla provvigione, non sul venduto — quella la fa il partner col suo scontrino",
    });
  }
  if (input.margineFornitori > 0) {
    debito.push({
      voce: "Margine sugli ordini eseguiti da fornitori",
      imponibile: input.margineFornitori,
      iva: scorpora(input.margineFornitori),
      aliquota: ALIQUOTA_IVA,
      nota: "qui si compra e si rivende: l'IVA netta è quella sul margine, perché quella sull'acquisto si detrae. Resta al 22%: se anche la vendita al consumatore è di fiori al 10%, questa riga è più alta del vero",
    });
  }

  const credito: RigaIva[] = [];
  for (const c of input.costiPerCategoria) {
    if (c.costo <= 0) continue;
    const r = DETRAIBILITA[c.categoria];
    const pct = r?.pct ?? 100;
    if (pct === 0) continue;
    // Due percentuali diverse che non vanno confuse: **l'aliquota** dice quanta
    // IVA c'era dentro quella spesa, la **detraibilità** quanta di quella se ne
    // può recuperare. Sbagliare la prima falsa il credito anche quando la
    // seconda è giusta.
    const aliquota = aliquotaDi(c.categoria);
    const a = ALIQUOTA_PER_CATEGORIA[c.categoria];
    const ivaPiena = scorpora(c.costo, aliquota);
    const perche = r?.perche ?? "detraibile per intero";
    credito.push({
      voce: c.categoria,
      imponibile: c.costo - ivaPiena,
      iva: (ivaPiena * pct) / 100,
      aliquota,
      nota: a ? `${perche} — ${a.perche}` : perche,
    });
  }

  const totaleDebito = debito.reduce((s, r) => s + r.iva, 0);
  const totaleCredito = credito.reduce((s, r) => s + r.iva, 0);
  const daVersare = totaleDebito - totaleCredito;

  return {
    debito,
    credito: credito.sort((a, b) => b.iva - a.iva),
    totaleDebito,
    totaleCredito,
    daVersare,
    accantonamentoMensile: input.mesi > 0 ? daVersare / input.mesi : 0,
    avvertenze: [
      "**È una stima di cassa, non la liquidazione.** La liquidazione vera si fa sui registri IVA, per data di fattura e non di pagamento: qui gli acquisti arrivano dalla banca, cioè da quando il denaro è uscito.",
      "**Le uscite senza fattura non danno credito**: un fiorista che non emette fattura, un rimborso, uno scontrino. Se dentro le categorie detraibili ce ne sono, il credito qui è più alto del vero e l'accantonamento più basso.",
      `**I fiori stanno al 10%, e adesso il conto lo sa** (${Object.keys(ALIQUOTA_PER_CATEGORIA).join(", ")}): scorporare il 22% da una spesa che il 22% non l'ha mai avuto tirava fuori il doppio dell'IVA davvero pagata — 180 € invece di 91 su mille euro di fiori — e siccome il credito si sottrae dal debito, l'accantonamento risultava più basso del vero. L'aliquota sta sulla **categoria** e non sul singolo movimento, perché la banca dice a chi hai pagato, non cosa c'era in fattura.`,
      "**Sul debito il 10% non è stato applicato**: il margine sugli ordini eseguiti da fornitori resta scorporato al 22%. Se anche la vendita al consumatore è di fiori al 10%, quella riga è più alta del vero e il saldo da versare pure — cioè l'errore che resta è dalla parte prudente. Le altre aliquote ridotte (il 4%) non sono gestite.",
      "**Il saldo a credito non si incassa**: se il conto va in negativo l'IVA si porta al periodo dopo, non torna indietro (salvo rimborso chiesto apposta).",
      "**Scadenze**: liquidazione trimestrale entro il 16 del secondo mese dopo il trimestre (16/5, 16/8, 16/11, 16/3), con l'1% di interessi per chi è trimestrale.",
    ],
  };
}
