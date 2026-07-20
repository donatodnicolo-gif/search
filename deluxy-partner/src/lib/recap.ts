import { euro } from "./format";
import { nomeMese, type RiepilogoMese, type Rolling } from "./calc";

type MeseRiep = { mese: number; riepilogo: RiepilogoMese; saldo?: { note: string | null } | null };

// Costruisce il prompt testuale da incollare in ChatGPT: istruzioni (esperto di
// finance) + tutta la situazione crediti/debiti mese per mese, risultati e
// confronto con l'anno precedente. Nessun dato lascia l'app finche' l'utente
// non lo copia e incolla volontariamente.
export function costruisciRecapPrompt(opts: {
  partner: { nome: string; categoria: string | null; citta: string | null; feePercent: number | null; compensazione: boolean; clienteAnno: string | null };
  anno: number;
  annoPrec: number;
  mesi: MeseRiep[];
  mesiPrec: MeseRiep[];
  rolling: Rolling;
  rollingPrec: Rolling;
}): string {
  const { partner, anno, annoPrec, mesi, mesiPrec, rolling, rollingPrec } = opts;
  const L: string[] = [];

  L.push(
    "Sei un consulente esperto di FINANCE e controllo di gestione. Analizza la situazione " +
      "economico-finanziaria del seguente partner commerciale e produci un recap sintetico e " +
      "professionale in italiano."
  );
  L.push("");
  L.push("Cosa mi aspetto dal tuo recap:");
  L.push("1. Un giudizio sintetico sull'andamento del partner nell'anno corrente vs anno precedente.");
  L.push("2. Analisi di crediti e debiti: quanto dobbiamo bonificare al partner, quanto dobbiamo incassare, esposizione netta e trend mensile.");
  L.push("3. Segnalazione di anomalie, rischi (es. crediti scaduti, esposizione crescente) e mesi critici.");
  L.push("4. 2-3 raccomandazioni operative concrete.");
  L.push(
    "Tieni conto delle NOTE operatore riportate su alcuni mesi: spiegano accordi, contestazioni " +
      "o situazioni particolari e vanno considerate nel giudizio."
  );
  L.push("Usa un tono da report direzionale, con numeri puntuali. Evita giri di parole.");
  L.push("");
  L.push("=== DATI PARTNER ===");
  L.push(`Nome: ${partner.nome}`);
  L.push(`Categoria: ${partner.categoria ?? "n/d"} | Citta: ${partner.citta ?? "n/d"}`);
  L.push(`Fee su vendite come vendor: ${partner.feePercent != null ? partner.feePercent + "%" : "n/d"}`);
  L.push(`Stato: ${partner.clienteAnno ?? "n/d"}`);
  L.push(
    `Regime saldi: ${partner.compensazione
      ? "CON compensazione (crediti servizi e debiti vendite si compensano in un unico saldo netto)"
      : "SENZA compensazione (crediti e debiti sono due partite separate, gestite distintamente)"}`
  );
  L.push("");
  L.push(`=== SITUAZIONE MENSILE ${anno} (confronto con ${annoPrec}) ===`);
  L.push(
    "Legenda: Vendite = venduto da noi per il partner; Servizi = fatture emesse al partner (netto IVA); " +
      "Dovuto = quanto spetta al partner sulle vendite; Da bonificare = residuo da pagargli; " +
      "Da incassare = fatture non ancora saldate dal partner."
  );
  L.push("");

  for (const { mese, riepilogo: r, saldo } of mesi) {
    const nota = saldo?.note?.trim();
    const hasData = r.vendite || r.serviziNetto || r.bonifico || r.daIncassare || r.daBonificare || nota;
    if (!hasData) continue;
    const p = mesiPrec.find((x) => x.mese === mese)?.riepilogo;
    const val = r.vendite + r.serviziNetto;
    const valPrec = p ? p.vendite + p.serviziNetto : 0;
    const delta = valPrec ? ` (vs ${annoPrec}: ${euro(valPrec)}, ${((val - valPrec) / valPrec * 100).toFixed(1)}%)` : "";
    L.push(`${nomeMese(mese)} ${anno} — valore ${euro(val)}${delta}`);
    L.push(
      `  Vendite ${euro(r.vendite)} | commissioni ${euro(r.commissioni)} | dovuto al partner ${euro(r.dovutoPartner)}`
    );
    L.push(`  Servizi fatturati (netto IVA) ${euro(r.serviziNetto)} | non ancora saldati ${euro(r.serviziNonPagati)}`);
    L.push(
      `  Bonifici registrati: inviati ${euro(r.bonificoInviato)} | ricevuti ${euro(r.bonificoRicevuto)}`
    );
    L.push(
      `  => Da bonificare al partner: ${euro(r.daBonificare)} | Da incassare dal partner: ${euro(r.daIncassare)} | ${r.pareggiato ? "PAREGGIATO" : "APERTO"}`
    );
    if (nota) L.push(`  NOTA operatore: ${nota}`);
  }

  L.push("");
  L.push(`=== TOTALI ANNO ${anno} (year-to-date) vs ${annoPrec} (intero) ===`);
  L.push(`Vendite come vendor: ${euro(rolling.vendite)} (${annoPrec}: ${euro(rollingPrec.vendite)})`);
  L.push(`Servizi fatturati netto IVA: ${euro(rolling.fatture)} (${annoPrec}: ${euro(rollingPrec.fatture)})`);
  L.push(`Commissioni Deluxy: ${euro(rolling.commissioni)} (${annoPrec}: ${euro(rollingPrec.commissioni)})`);
  L.push(`Dovuto al partner: ${euro(rolling.incassiNettoCommissioni)}`);
  L.push(`Gia' bonificato al partner: ${euro(rolling.pagatoAlPartner)} | gia' incassato dal partner: ${euro(rolling.incassatoDalPartner)}`);
  L.push(`ESPOSIZIONE APERTA: da bonificare ${euro(rolling.daBonificare)} | da incassare ${euro(rolling.daIncassare)}`);
  L.push("");
  L.push("Produci ora il recap.");

  return L.join("\n");
}
