import type { Partner } from "@prisma/client";
import { prisma } from "./db";
import { matchPartner } from "./riconciliazione";

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
  /** da dove arriva: riconciliazione confermata, somiglianza di nome, oppure niente */
  da: "riconciliazione" | "nome" | null;
  /** il nome con cui il soggetto è registrato su FIC */
  ficNome?: string;
  /** altri soggetti FIC riconciliati con lo stesso partner (intestazioni alternative) */
  alternative: T[];
};

export async function suggerisciClienteFic<T extends { nome: string }>(
  partner: Pick<Partner, "id" | "nome">,
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
