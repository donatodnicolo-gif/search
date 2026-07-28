import { prisma } from "@/lib/db";

// Il salvataggio delle metriche di campagna, in un posto solo.
// Lo usano sia /api/v1/ingest (dove le manda lo script di Google Ads) sia il
// connettore Meta, che invece va a prenderle lui: la logica di riconoscimento
// delle campagne e di aggiornamento per giorno deve essere identica, altrimenti
// gli stessi dati raccontano storie diverse a seconda della porta d'ingresso.

export type RigaMetrica = {
  idCampagna: string;
  nome: string;
  data: string;
  spesa?: number | null;
  impression?: number | null;
  click?: number | null;
  conversioni?: number | null;
  ricavi?: number | null;
  stato?: string | null;
  budgetGiornaliero?: number | null;
  strategiaOfferta?: string | null;
  obiettivo?: string | null;
  annunciTotali?: number | null;
  annunciInReview?: number | null;
  // Quota impressioni: si accetta sia 0-1 sia 0-100, si salva sempre 0-1.
  quotaImpressioni?: number | null;
  persaBudget?: number | null;
  persaRank?: number | null;
};

export type EsitoIngest = {
  metricheSalvate: number;
  campagneCreate: number;
  righeScartate: number;
  campagneToccate: Set<string>;
  giornoMin: Date | null;
  giornoMax: Date | null;
};

const numero = (v: unknown) => (v == null || v === "" ? null : Number(v));
// Google le manda 0-1, i fogli e le persone 0-100: si normalizza qui una volta
// per tutte, altrimenti una campagna col 90% di quota sembra il 9000%.
const quota = (v: unknown) => {
  const n = numero(v);
  if (n == null || isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
};
const intero = (v: unknown) => (numero(v) != null ? Math.round(numero(v)!) : null);

// Brand dedotto dal nome della campagna quando non è dichiarato: i nomi
// Deluxy portano già il marchio (es. "[Deluxyflowers] ITALIAN-ENG").
function brandDa(nome: string, brandDichiarato?: string): string {
  if (brandDichiarato) return brandDichiarato;
  const t = nome.toLowerCase();
  if (/deluxyflower|flowers/.test(t)) return "flowers";
  if (/cake|torte/.test(t)) return "cake";
  if (/deluxy|gifts|regali/.test(t)) return "gifts";
  return "cross";
}

// Riconoscimento sfumato dei nomi: la 00.4 censisce con codici ("DC1 Fiori
// Milano ENG"), la piattaforma usa i nomi veri ("[Deluxy] - Fiori Milano
// ENG"). Senza questa normalizzazione ogni account creerebbe doppie.
// Esportata perché serve anche al legame con le vendite Shopify: l'UTM scritto
// sull'ordine è il nome della campagna passato per le mani di Shopify, e va
// confrontato con lo stesso metro con cui l'import riconosce le campagne.
export function normalizza(n: string): string {
  return n
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\b(dc|df|dt|dg)\d+\b/g, "")
    .replace(/english/g, "eng")
    .replace(/italian/g, "ita")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function salvaMetriche(
  righe: RigaMetrica[],
  opzioni: { canale: string; account?: string | null; brand?: string }
): Promise<EsitoIngest> {
  const { canale, account } = opzioni;
  const esito: EsitoIngest = {
    metricheSalvate: 0,
    campagneCreate: 0,
    righeScartate: 0,
    campagneToccate: new Set<string>(),
    giornoMin: null,
    giornoMax: null,
  };

  for (const r of righe) {
    if (!r?.idCampagna || !r?.nome || !r?.data) {
      esito.righeScartate++;
      continue;
    }
    const idEsterno = String(r.idCampagna);
    const giorno = new Date(r.data);
    if (isNaN(giorno.getTime())) {
      esito.righeScartate++;
      continue;
    }
    giorno.setUTCHours(0, 0, 0, 0);

    // La campagna si riconosce dall'id di piattaforma; se non c'è, si crea.
    let campagna = await prisma.campagna.findFirst({ where: { idEsterno, canale } });
    if (!campagna) {
      campagna = await prisma.campagna.findFirst({ where: { nome: String(r.nome), canale } });
      if (!campagna) {
        const nRiga = normalizza(String(r.nome));
        const censite = await prisma.campagna.findMany({ where: { canale, idEsterno: null } });
        campagna =
          censite.find((c) => {
            const n = normalizza(c.nome);
            return n.length > 3 && nRiga.length > 3 && (n === nRiga || n.includes(nRiga) || nRiga.includes(n));
          }) ?? null;
      }
      if (campagna) {
        // Il nome vero della piattaforma vince sul codice di censimento; il
        // codice resta nelle note per ritrovarlo nella 00.4.
        campagna = await prisma.campagna.update({
          where: { id: campagna.id },
          data: {
            idEsterno,
            ...(campagna.nome !== String(r.nome)
              ? {
                  nome: String(r.nome),
                  note: `${campagna.note ? campagna.note + " · " : ""}Codice 00.4: ${campagna.nome}`,
                }
              : {}),
          },
        });
      } else {
        campagna = await prisma.campagna.create({
          data: {
            nome: String(r.nome),
            idEsterno,
            canale,
            brand: brandDa(String(r.nome), opzioni.brand),
            stato: r.stato ?? "attiva",
            budgetGiornaliero: numero(r.budgetGiornaliero),
            strategiaOfferta: r.strategiaOfferta ? String(r.strategiaOfferta) : null,
            obiettivo: r.obiettivo ? String(r.obiettivo) : null,
            annunciTotali: intero(r.annunciTotali),
            annunciInReview: intero(r.annunciInReview),
            note: `Creata automaticamente dall'import ${canale}${account ? ` (account ${account})` : ""}`,
          },
        });
        esito.campagneCreate++;
      }
    } else if (r.stato || r.budgetGiornaliero != null || r.strategiaOfferta || r.annunciTotali != null) {
      await prisma.campagna.update({
        where: { id: campagna.id },
        data: {
          ...(r.stato ? { stato: r.stato } : {}),
          ...(r.budgetGiornaliero != null ? { budgetGiornaliero: numero(r.budgetGiornaliero) } : {}),
          ...(r.strategiaOfferta ? { strategiaOfferta: String(r.strategiaOfferta) } : {}),
          ...(r.annunciTotali != null ? { annunciTotali: intero(r.annunciTotali) } : {}),
          ...(r.annunciInReview != null ? { annunciInReview: intero(r.annunciInReview) } : {}),
        },
      });
    }

    // Le righe che portano solo i conteggi di approvazione non hanno metriche
    if (r.spesa == null && r.impression == null && r.click == null && r.annunciTotali != null) {
      esito.metricheSalvate++;
      continue;
    }
    const valori = {
      spesa: numero(r.spesa),
      impression: intero(r.impression),
      click: intero(r.click),
      conversioni: numero(r.conversioni),
      ricavi: numero(r.ricavi),
      quotaImpressioni: quota(r.quotaImpressioni),
      persaBudget: quota(r.persaBudget),
      persaRank: quota(r.persaRank),
    };
    await prisma.metricaCampagna.upsert({
      where: { campagnaId_data: { campagnaId: campagna.id, data: giorno } },
      create: { campagnaId: campagna.id, data: giorno, ...valori },
      update: valori,
    });
    esito.metricheSalvate++;
    esito.campagneToccate.add(campagna.id);
    if (esito.giornoMin == null || giorno < esito.giornoMin) esito.giornoMin = giorno;
    if (esito.giornoMax == null || giorno > esito.giornoMax) esito.giornoMax = giorno;
  }

  return esito;
}

// Vendite o lead? Le campagne B2B/corporate ottimizzano lead con valore
// simbolico (doc 4): un valore medio per conversione sotto i 10 € non è una
// vendita, e giudicare quella campagna col ROAS sarebbe un errore di lettura.
// Si guarda solo la finestra recente: il tracking di un anno fa può essere
// diverso da quello di oggi. Non sovrascrive mai una scelta fatta a mano.
export async function deduciTipoConversione(campagneIds: Iterable<string>): Promise<void> {
  const da90 = new Date(Date.now() - 90 * 86_400_000);
  for (const id of campagneIds) {
    const c = await prisma.campagna.findUnique({ where: { id }, select: { tipoConversione: true } });
    if (c?.tipoConversione === "vendite" || c?.tipoConversione === "lead") continue;
    const agg = await prisma.metricaCampagna.aggregate({
      where: { campagnaId: id, data: { gte: da90 } },
      _sum: { conversioni: true, ricavi: true },
    });
    const conv = agg._sum.conversioni ?? 0;
    if (conv < 3) continue; // troppo poco per dedurre
    const medio = (agg._sum.ricavi ?? 0) / conv;
    await prisma.campagna.update({
      where: { id },
      data: { tipoConversione: medio < 10 ? "lead" : "vendite" },
    });
  }
}

// ---------- Anagrafica delle campagne (senza metriche) ----------

export type RigaAnagrafica = {
  idCampagna: string;
  nome: string;
  stato?: string | null;
  budgetGiornaliero?: number | null;
  strategiaOfferta?: string | null;
  tipo?: string | null;
};

export type EsitoAnagrafica = {
  create: number;
  aggiornate: number;
  invariate: number;
  scartate: number;
};

/**
 * Registra le campagne che ESISTONO, a prescindere da quanto hanno speso.
 *
 * Le metriche arrivano da una query per giorno: una campagna in pausa da
 * settimane non produce nessuna riga, quindi per l'app non esisteva. Ma non si
 * può decidere di riattivare una campagna che non si vede — e nemmeno
 * accorgersi che ne è comparsa una nuova ancora ferma.
 *
 * Riconoscimento identico a quello delle metriche (stesso id di piattaforma,
 * stesso ripiego sul nome): registro e metriche devono finire sulla STESSA
 * riga, o si creerebbero doppioni della stessa campagna.
 */
export async function salvaAnagrafica(
  righe: RigaAnagrafica[],
  opzioni: { canale: string; account?: string | null; brand?: string }
): Promise<EsitoAnagrafica> {
  const { canale, account } = opzioni;
  const esito: EsitoAnagrafica = { create: 0, aggiornate: 0, invariate: 0, scartate: 0 };

  // Una lettura sola per tutto il lotto invece di una interrogazione per
  // campagna: gli account grossi ne hanno centinaia.
  const esistenti = await prisma.campagna.findMany({ where: { canale } });
  const perId = new Map(esistenti.filter((c) => c.idEsterno).map((c) => [c.idEsterno!, c]));
  const perNome = new Map(esistenti.map((c) => [c.nome, c]));
  const perNomeNormalizzato = new Map(
    esistenti.filter((c) => !c.idEsterno).map((c) => [normalizza(c.nome), c])
  );

  for (const r of righe) {
    if (!r?.idCampagna || !r?.nome) {
      esito.scartate++;
      continue;
    }
    const idEsterno = String(r.idCampagna);
    const nome = String(r.nome);
    const nNorm = normalizza(nome);

    const trovata =
      perId.get(idEsterno) ??
      perNome.get(nome) ??
      (nNorm.length > 3 ? perNomeNormalizzato.get(nNorm) : undefined);

    const dati = {
      stato: r.stato ?? undefined,
      budgetGiornaliero: r.budgetGiornaliero ?? undefined,
      strategiaOfferta: r.strategiaOfferta ? String(r.strategiaOfferta) : undefined,
      obiettivo: r.tipo ? String(r.tipo) : undefined,
    };

    if (!trovata) {
      const creata = await prisma.campagna.create({
        data: {
          nome,
          idEsterno,
          canale,
          brand: brandDa(nome, opzioni.brand),
          stato: r.stato ?? "in_pausa",
          budgetGiornaliero: r.budgetGiornaliero ?? null,
          strategiaOfferta: r.strategiaOfferta ? String(r.strategiaOfferta) : null,
          obiettivo: r.tipo ? String(r.tipo) : null,
          note: `Registrata dall'anagrafica ${canale}${account ? ` (account ${account})` : ""}: esiste sulla piattaforma, nessuna erogazione nel periodo letto`,
        },
      });
      perId.set(idEsterno, creata);
      perNome.set(nome, creata);
      esito.create++;
      continue;
    }

    // Si scrive solo se qualcosa è davvero cambiato: un giro di anagrafica che
    // "aggiorna" trecento campagne identiche riempie lo storico di rumore e
    // rende invisibile il cambiamento vero.
    const cambia =
      (dati.stato != null && dati.stato !== trovata.stato) ||
      (dati.budgetGiornaliero != null && dati.budgetGiornaliero !== trovata.budgetGiornaliero) ||
      (dati.strategiaOfferta != null && dati.strategiaOfferta !== trovata.strategiaOfferta) ||
      (dati.obiettivo != null && dati.obiettivo !== trovata.obiettivo) ||
      trovata.idEsterno !== idEsterno ||
      trovata.nome !== nome;

    if (!cambia) {
      esito.invariate++;
      continue;
    }

    await prisma.campagna.update({
      where: { id: trovata.id },
      data: {
        ...(dati.stato != null ? { stato: dati.stato } : {}),
        ...(dati.budgetGiornaliero != null ? { budgetGiornaliero: dati.budgetGiornaliero } : {}),
        ...(dati.strategiaOfferta != null ? { strategiaOfferta: dati.strategiaOfferta } : {}),
        ...(dati.obiettivo != null ? { obiettivo: dati.obiettivo } : {}),
        ...(trovata.idEsterno !== idEsterno ? { idEsterno } : {}),
        // Il nome vero della piattaforma vince sul codice di censimento.
        ...(trovata.nome !== nome
          ? { nome, note: `${trovata.note ? trovata.note + " · " : ""}Codice 00.4: ${trovata.nome}` }
          : {}),
      },
    });
    esito.aggiornate++;
  }

  return esito;
}
