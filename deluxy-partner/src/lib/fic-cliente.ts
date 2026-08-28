import type { Partner } from "@prisma/client";
import { prisma } from "./db";
import { matchPartner } from "./riconciliazione";
import { ficIntestatarioDaNumero } from "./fic";

// Quale soggetto di Fatture in Cloud corrisponde a un partner Deluxy.
//
// Prima si guardava solo la somiglianza dei nomi, e per i partner intestati a
// una persona fisica non combaciava mai: su FIC «CHANTILLITTY (Ilaria
// Chiarakul)» è «CHIARAKUL ILARIA», e la pagina rispondeva «nessun cliente
// combacia» proprio a chi la riconciliazione l'aveva già fatta e confermata.
//
// L'ordine giusto è l'inverso: **prima la riconciliazione confermata a mano**
// (`RiconciliazioneAnagrafica`, che è esattamente la risposta alla domanda
// «questo cliente FIC è quel partner»), e solo se non c'è si prova coi nomi.
// Un partner può avere più righe confermate — la stessa azienda fatturata sia
// come insegna sia come persona fisica: si prende la più recente fra quelle
// che hanno davvero un soggetto su FIC, e le altre si dicono a chi guarda.
//
// ⚠️ L'elenco da passare qui dev'essere quello dei soggetti FATTURABILI
// (`ficClientiFatturabili`), non la sola rubrica clienti: al 31/07/2026 la
// rubrica ha 53 nomi mentre gli intestatari delle fatture emesse sono 112, e
// **26 delle 32 riconciliazioni confermate puntano a un nome che in rubrica
// non c'è**. Con la sola rubrica questa funzione non troverebbe niente.

const chiave = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export type SuggerimentoCliente<T> = {
  cliente: T | null;
  /** da dove arriva: riconciliazione confermata, fatture già emesse a quel
   *  partner, somiglianza di nome, oppure niente */
  da: "riconciliazione" | "piva" | "storico" | "nome" | null;
  /** il nome con cui il soggetto è registrato su FIC */
  ficNome?: string;
  /** altri soggetti FIC riconciliati con lo stesso partner (intestazioni alternative) */
  alternative: T[];
};

// L'intestatario dell'ultima fattura commissioni emessa dall'app per questo
// partner, se quel soggetto è ancora fra i fatturabili. Si guardano gli ultimi
// numeri salvati (non solo l'ultimissimo): un numero può non essere più
// rintracciabile su FIC — fattura cancellata, numerazione cambiata — e in quel
// caso vale il precedente. Tre tentativi bastano: sono chiamate di rete.
async function soggettoDaFattureEmesse<T>(
  partnerId: string,
  perNome: Map<string, T>
): Promise<{ cliente: T; nome: string } | null> {
  const emesse = await prisma.saldoMensile.findMany({
    where: { partnerId, commFattEmessa: true, commFattNumero: { not: null } },
    orderBy: [{ anno: "desc" }, { mese: "desc" }],
    select: { anno: true, commFattNumero: true },
    take: 3,
  });
  const visti = new Set<string>();
  for (const s of emesse) {
    const numero = s.commFattNumero!;
    if (visti.has(numero)) continue; // lo stesso numero può ripetersi su più mesi
    visti.add(numero);
    try {
      const nome = await ficIntestatarioDaNumero(numero, s.anno);
      const trovato = nome ? perNome.get(chiave(nome)) : undefined;
      if (nome && trovato) return { cliente: trovato, nome };
    } catch {
      // FIC non risponde su quel numero: si prova col precedente
    }
  }
  return null;
}

export async function suggerisciClienteFic<T extends { nome: string; piva?: string | null }>(
  partner: Pick<Partner, "id" | "nome"> & { piva?: string | null },
  clienti: T[]
): Promise<SuggerimentoCliente<T>> {
  const conferme = await prisma.riconciliazioneAnagrafica.findMany({
    where: { partnerId: partner.id, stato: "confermata" },
    orderBy: { updatedAt: "desc" },
    select: { ficNome: true },
  });

  const perNome = new Map(clienti.map((c) => [chiave(c.nome), c]));
  const riconciliati: T[] = [];
  for (const c of conferme) {
    const trovato = perNome.get(chiave(c.ficNome));
    if (trovato && !riconciliati.includes(trovato)) riconciliati.push(trovato);
  }

  if (riconciliati.length > 0) {
    return {
      cliente: riconciliati[0],
      da: "riconciliazione",
      ficNome: riconciliati[0].nome,
      alternative: riconciliati.slice(1),
    };
  }

  // ⚠️ La P.IVA è l'identità fiscale: se il partner ne ha una (dal registro
  // Anagrafiche) e un cliente FIC porta la STESSA, è quello — non un'ipotesi.
  // Va prima della somiglianza di nome, che su parole comuni («LOGISTICS»)
  // pesca il cliente sbagliato (caso HAVI LOGISTICS → «Hansol Logistics»).
  const pivaPartner = (partner.piva ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (pivaPartner.length >= 8) {
    const perPiva = clienti.find(
      (c) => (c.piva ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase() === pivaPartner
    );
    if (perPiva) {
      return { cliente: perPiva, da: "piva", ficNome: perPiva.nome, alternative: [] };
    }
    // La P.IVA c'è ma nessun cliente FIC la porta: il soggetto giusto non è
    // ancora fra i fatturabili. Meglio NON proporre un nome a caso — chi guarda
    // sceglie, o crea il cliente coi dati veri — che proporne uno sbagliato.
    return { cliente: null, da: null, alternative: [] };
  }

  // Seconda via, altrettanto solida: le fatture commissioni che l'app ha già
  // emesso a questo partner. Il numero è salvato in `SaldoMensile`, e chi c'era
  // scritto sopra è il cliente giusto — non un'ipotesi. Vale per i partner
  // fatturati da mesi che nessuno ha mai riconciliato.
  const daStorico = await soggettoDaFattureEmesse(partner.id, perNome);
  if (daStorico) {
    return { cliente: daStorico.cliente, da: "storico", ficNome: daStorico.nome, alternative: [] };
  }

  // ripiego: la ragione sociale FIC compare nel nome partner («MOSCATI SRL» in
  // «BELLAVIA (MOSCATI SRL)») o viceversa
  const comePartner = (nome: string) => ({ nome }) as Partner;
  const perSomiglianza =
    clienti.find((c) => matchPartner(partner.nome, [comePartner(c.nome)]) != null) ??
    clienti.find((c) => matchPartner(c.nome, [comePartner(partner.nome)]) != null) ??
    null;

  return {
    cliente: perSomiglianza,
    da: perSomiglianza ? "nome" : null,
    ficNome: perSomiglianza?.nome,
    alternative: [],
  };
}
