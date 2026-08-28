import { prisma } from "./db";
import { ibanSepa, ibanValido, normalizzaIban, normalizzaNome } from "./iban";
import type { Regole } from "./impostazioni";

// Punteggio di rischio di una richiesta, 0-100. Non decide da solo: alza la
// soglia di attenzione e, sopra la soglia impostata, impone la doppia firma.
// I controlli sono quelli che intercettano le frodi vere sui pagamenti B2B,
// nell'ordine in cui capitano davvero.

export type Valutazione = { punteggio: number; motivi: string[] };

export async function valutaRischio(
  dati: { importoCent: number; iban: string; metodo?: string; beneficiario: string; causale: string; origine: string },
  regole: Regole,
): Promise<Valutazione> {
  const motivi: string[] = [];
  let punti = 0;
  const metodo = dati.metodo || "iban";
  const conIban = metodo === "iban";
  const iban = normalizzaIban(dati.iban);
  const nomeNorm = normalizzaNome(dati.beneficiario);

  if (conIban) {
    // 1. IBAN formalmente sbagliato: da qui non si va avanti.
    if (!ibanValido(iban)) {
      punti += 60;
      motivi.push("IBAN non supera il controllo di checksum");
    }

    // 2. Fuori area SEPA: bonifico più costoso, più lento e meno tracciabile.
    if (!ibanSepa(iban)) {
      punti += 20;
      motivi.push(`IBAN fuori area SEPA (${iban.slice(0, 2) || "?"})`);
    }
  } else {
    // 1-bis. Un metodo senza IBAN non passa da nessuno dei controlli bancari
    // (rubrica fidata, VoP): la verifica è tutta sull'operatore che paga.
    punti += 15;
    motivi.push(`metodo «${metodo}»: nessun controllo bancario possibile, verifica a mano`);
  }

  // 3. Il beneficiario è nuovo? Primo pagamento a qualcuno è sempre il momento
  //    più delicato.
  let beneficiarioNoto = false;
  let cambioIban = false;
  try {
    const stessoNome = await prisma.beneficiario.findMany({ where: { nomeNorm } });
    beneficiarioNoto = stessoNome.length > 0;
    if (conIban && beneficiarioNoto && !stessoNome.some((b) => b.iban === iban)) {
      cambioIban = true;
    }
    if (conIban && regole.soloBeneficiariVerificati && !stessoNome.some((b) => b.iban === iban && b.verificato)) {
      punti += 25;
      motivi.push("beneficiario non presente fra quelli verificati");
    }
  } catch {
    // rubrica non leggibile: non si inventa un giudizio
  }

  if (!beneficiarioNoto) {
    punti += 15;
    motivi.push("primo pagamento a questo beneficiario");
  }

  // 4. IBAN cambiato per un beneficiario già pagato altrove: è la frode del
  //    «cambio coordinate», quella che costa di più. Vale da sola la doppia firma.
  if (cambioIban) {
    punti += 45;
    motivi.push("IBAN diverso da quello già usato per questo beneficiario");
  }

  // 5. Importo. Le soglie sono relative a quella della doppia firma, così
  //    cambiando la soglia si muove tutto insieme.
  if (regole.sogliaDoppiaFirma > 0) {
    if (dati.importoCent >= regole.sogliaDoppiaFirma * 5) {
      punti += 25;
      motivi.push("importo molto sopra la soglia di doppia firma");
    } else if (dati.importoCent >= regole.sogliaDoppiaFirma) {
      punti += 12;
      motivi.push("importo sopra la soglia di doppia firma");
    }
  }

  // 6. Cifra tonda e grossa: tipica delle richieste inventate.
  if (dati.importoCent >= 100_000 && dati.importoCent % 100_000 === 0) {
    punti += 5;
    motivi.push("importo a cifra tonda");
  }

  // 7. Causale vuota o generica: senza una causale il pagamento non è
  //    ricostruibile a posteriori.
  const causale = dati.causale.trim();
  if (causale.length < 6) {
    punti += 10;
    motivi.push("causale troppo generica");
  }

  // 8. Doppione recente: stesso beneficiario e stesso importo nelle ultime 24
  //    ore. Quasi sempre è un doppio invio, ogni tanto è un tentativo.
  try {
    const ieri = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const gemella = await prisma.richiesta.findFirst({
      where: {
        beneficiarioNorm: nomeNorm,
        importoCent: dati.importoCent,
        creataIl: { gte: ieri },
        stato: { notIn: ["rifiutata", "annullata"] },
      },
      select: { riferimento: true },
    });
    if (gemella) {
      punti += 20;
      motivi.push(`stesso importo allo stesso beneficiario nelle ultime 24 ore (${gemella.riferimento})`);
    }
  } catch {
    // niente storico: nessun punto
  }

  return { punteggio: Math.min(100, punti), motivi };
}

export function livelloRischio(punteggio: number): { nome: string; tono: "ok" | "attenzione" | "grave" } {
  if (punteggio >= 60) return { nome: "alto", tono: "grave" };
  if (punteggio >= 30) return { nome: "medio", tono: "attenzione" };
  return { nome: "basso", tono: "ok" };
}
