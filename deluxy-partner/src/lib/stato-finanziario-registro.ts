import { prisma } from "./db";
import { aggiornaAnagrafica, scritturaAnagraficheAttiva } from "./anagrafiche";
import { schedeTutti, schedaVuota, statoPerRegistro } from "./stato-credito";

// LO STATO FINANZIARIO NASCE QUI E VA DETTO AL REGISTRO.
//
// FINANCE è l'unico che sa come paga un cliente: ha le fatture, le scadenze e
// lo scaduto. Il registro Anagrafiche però è quello che il commerciale apre
// prima di andare da un partner, e finché quel campo restava «da verificare»
// per tutti, chi vendeva non sapeva di stare per firmare con un insoluto.
//
// ⚠️ Si manda solo quando CAMBIA. Lo stato qui è calcolato ogni volta dalle
// fatture aperte: senza la memoria di `Partner.statoFinInviato` ogni notte
// partirebbero cento PATCH identici a quelli della notte prima, e nello storico
// del registro ogni cliente risulterebbe «cambiato» tutti i giorni.
//
// ⚠️ Chi non ha crediti aperti non si tocca (`statoPerRegistro` torna null):
// non avere fatture in giro non dice come paga, e sovrascrivere un giudizio
// scritto a mano nel registro sarebbe peggio del silenzio.

export type EsitoStati = {
  inviati: { nome: string; da: string | null; a: string }[];
  invariati: number;
  errori: string[];
  errore?: string;
};

export async function inviaStatiFinanziari(): Promise<EsitoStati> {
  const vuoto: EsitoStati = { inviati: [], invariati: 0, errori: [] };
  if (!scritturaAnagraficheAttiva()) {
    return { ...vuoto, errore: "Scrittura su Anagrafiche non configurata (manca ANAGRAFICHE_WRITE_KEY)." };
  }

  const [partners, schede] = await Promise.all([
    prisma.partner.findMany({
      where: { anagraficaId: { not: null } },
      select: { id: true, nome: true, anagraficaId: true, statoFinInviato: true, pdrDebito: true },
    }),
    schedeTutti(),
  ]);

  const inviati: EsitoStati["inviati"] = [];
  const errori: string[] = [];
  let invariati = 0;

  for (const p of partners) {
    const scheda = schede.get(p.id) ?? schedaVuota();
    const stato = statoPerRegistro(scheda.stato, {
      // un piano di rientro concordato è un fatto, e sta scritto qui
      pianoDiRientro: Boolean(p.pdrDebito?.trim()),
    });
    if (!stato) continue;
    if (stato === p.statoFinInviato) {
      invariati++;
      continue;
    }
    const res = await aggiornaAnagrafica(p.anagraficaId!, { statoFinanziario: stato });
    if (res.ok) {
      await prisma.partner.update({ where: { id: p.id }, data: { statoFinInviato: stato } });
      inviati.push({ nome: p.nome, da: p.statoFinInviato, a: stato });
    } else {
      errori.push(`${p.nome}: ${res.errore}`);
    }
  }

  return { inviati, invariati, errori };
}

/** Quanti stati sarebbero da mandare, senza mandarli: serve alla pagina per
 *  dire «ce ne sono N da allineare» prima che qualcuno prema qualcosa. */
export async function statiDaAllineare(): Promise<number> {
  const [partners, schede] = await Promise.all([
    prisma.partner.findMany({
      where: { anagraficaId: { not: null } },
      select: { id: true, statoFinInviato: true, pdrDebito: true },
    }),
    schedeTutti(),
  ]);
  let n = 0;
  for (const p of partners) {
    const scheda = schede.get(p.id) ?? schedaVuota();
    const stato = statoPerRegistro(scheda.stato, { pianoDiRientro: Boolean(p.pdrDebito?.trim()) });
    if (stato && stato !== p.statoFinInviato) n++;
  }
  return n;
}
