import { prisma } from "./db";
import { risolviAnagrafica } from "./anagrafiche";

// L'IBAN DI UN PARTNER STA NEL REGISTRO ANAGRAFICHE, NON QUI.
//
// Lo dice già il commento sulla colonna `Partner.iban`: «verità nel registro
// Anagrafiche, qui è la copia». Ma il codice che paga leggeva **solo la copia**,
// e la copia quasi sempre non c'è: **18 partner su 119 hanno un IBAN in
// Finance, 101 no — e 68 di questi sono agganciati al registro**, dove l'IBAN
// c'è. Risultato: «Paga» rifiutava dicendo «non ha un IBAN in anagrafica»
// mentre in anagrafica l'IBAN c'era (segnalato dall'utente il 04/09/2026 su
// GIADA CAKE, luglio 2026).
//
// Ordine: prima il REGISTRO (è la fonte), poi la copia locale come ripiego se
// il registro non risponde o non ce l'ha. Non si riscrive la copia: una copia
// che si aggiorna da sola è una copia che diverge in silenzio (Standard §7 —
// riferimento, non copia).
//
// ⚠️ «Non c'è» e «non lo so» sono due risposte diverse: se il registro non
// risponde non si può dire al partner che l'IBAN manca. Per questo torna anche
// `registroRisponde`, e chi mostra l'errore lo dice.

export type DatiBancari = {
  /** IBAN senza spazi, maiuscolo. Stringa vuota se non risulta da nessuna parte. */
  iban: string;
  /** A chi è intestato il conto: lo verifica la banca contro l'IBAN. */
  intestatario: string | null;
  fonte: "registro" | "finance" | "nessuna";
  registroRisponde: boolean;
};

const pulisci = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "").toUpperCase();

export async function datiBancariPartner(partnerId: string): Promise<DatiBancari> {
  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { nome: true, ragioneSociale: true, iban: true, intestatarioConto: true, anagraficaId: true },
  });
  if (!p) return { iban: "", intestatario: null, fonte: "nessuna", registroRisponde: false };

  const locale = pulisci(p.iban);

  // Senza aggancio al registro non c'è niente da chiedere: vale la copia.
  if (!p.anagraficaId && !p.nome) {
    return { iban: locale, intestatario: p.intestatarioConto ?? null, fonte: locale ? "finance" : "nessuna", registroRisponde: false };
  }

  let registro: Awaited<ReturnType<typeof risolviAnagrafica>> = null;
  let risponde = true;
  try {
    registro = await risolviAnagrafica(p.nome, p.anagraficaId);
  } catch {
    risponde = false;
  }
  // nel registro i dati di pagamento stanno nel blocco `datiFinanziari`
  const dalRegistro = pulisci(registro?.datiFinanziari?.iban);
  if (dalRegistro) {
    return {
      iban: dalRegistro,
      intestatario: registro?.datiFinanziari?.intestatarioConto?.trim() || p.intestatarioConto?.trim() || null,
      fonte: "registro",
      registroRisponde: risponde,
    };
  }
  return {
    iban: locale,
    intestatario: p.intestatarioConto ?? null,
    fonte: locale ? "finance" : "nessuna",
    registroRisponde: risponde && registro !== null,
  };
}

/** La frase da mostrare quando non si può pagare: dice se l'IBAN MANCA o se
 *  non siamo riusciti a leggerlo. Sono due problemi con due rimedi diversi. */
export function perchePagamentoSenzaIban(d: DatiBancari, nomePartner: string): string {
  return d.registroRisponde
    ? `${nomePartner} non ha un IBAN: non c'è né in Finance né nel registro Anagrafiche. Va aggiunto nel registro (è lui la fonte), poi ripremi Paga.`
    : `Non riesco a leggere l'IBAN di ${nomePartner} dal registro Anagrafiche (non risponde) e in Finance non ce n'è una copia. Riprova fra poco.`;
}
