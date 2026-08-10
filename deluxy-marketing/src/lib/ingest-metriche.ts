import { prisma } from "@/lib/db";
import { STATI_CAMPAGNA_NOSTRI } from "@/lib/dominio";

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

  // ⚠️ Le campagne si caricano UNA volta sola, non una volta per riga.
  //
  // Prima qui c'era una `findFirst` dentro il ciclo: con 30 giorni della stessa
  // campagna erano 29 query per riscoprire ogni volta la stessa cosa, più una
  // `findMany` di tutte le censite ogni volta che un nome non combaciava. Su un
  // Postgres remoto con `connection_limit=5` quelle andate e ritorno ERANO il
  // costo dell'import: misurato 1,5 s per riga, cioè 3 minuti per un mese di un
  // solo account, e `{giorni:400}` moriva in timeout senza arrivare in fondo.
  // Meta non c'entrava niente: era questo.
  const campagne = await prisma.campagna.findMany({ where: { canale } });
  type Campagna = (typeof campagne)[number];
  const perId = new Map<string, Campagna>();
  const perNome = new Map<string, Campagna>();
  let senzaId: Campagna[] = [];
  for (const c of campagne) {
    if (c.idEsterno) perId.set(c.idEsterno, c);
    else senzaId.push(c);
    perNome.set(c.nome, c);
  }

  // Le metriche si accumulano e si scrivono in fondo: due righe per lo stesso
  // (campagna, giorno) — doppioni nell'invio — si schiacciano qui invece di
  // diventare due upsert che si sovrascrivono a vicenda.
  const daScrivere = new Map<string, { campagnaId: string; giorno: Date; valori: Record<string, number | null> }>();
  // Gli aggiornamenti di stato/budget della campagna valgono per tutta la
  // campagna, non per il singolo giorno: si applicano una volta sola alla fine.
  // Prima si eseguiva un update per OGNI riga, cioè 30 update identici per una
  // campagna con 30 giorni.
  const daAggiornare = new Map<string, Record<string, unknown>>();

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
    let campagna: Campagna | null = perId.get(idEsterno) ?? null;
    if (!campagna) {
      campagna = perNome.get(String(r.nome)) ?? null;
      if (!campagna) {
        const nRiga = normalizza(String(r.nome));
        campagna =
          senzaId.find((c) => {
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
      // La campagna appena creata o agganciata entra SUBITO nelle mappe: senza
      // questo, la seconda riga della stessa campagna non la troverebbe e ne
      // creerebbe un'altra — trenta giorni, trenta doppioni.
      perId.set(idEsterno, campagna);
      perNome.set(campagna.nome, campagna);
      senzaId = senzaId.filter((c) => c.id !== campagna!.id);
    } else if (r.stato || r.budgetGiornaliero != null || r.strategiaOfferta || r.annunciTotali != null) {
      // Non si scrive qui: si annota e si applica una volta sola in fondo.
      // L'ultimo valore vince, esattamente come quando ogni riga faceva il suo
      // update — ma con una query invece di trenta.
      //
      // ⚠️ Si FONDE con quanto già annotato, non si sostituisce. Sostituendo,
      // la riga 2 di una campagna cancellava il `brand` che la riga 1 aveva
      // appena promosso — e la promozione non riscattava, perché la cache in
      // memoria diceva già il brand giusto. Risultato: il brand corretto
      // spariva prima di arrivare al database.
      daAggiornare.set(campagna.id, {
        ...(daAggiornare.get(campagna.id) ?? {}),
        ...(r.stato ? { stato: r.stato } : {}),
        ...(r.budgetGiornaliero != null ? { budgetGiornaliero: numero(r.budgetGiornaliero) } : {}),
        ...(r.strategiaOfferta ? { strategiaOfferta: String(r.strategiaOfferta) } : {}),
        ...(r.annunciTotali != null ? { annunciTotali: intero(r.annunciTotali) } : {}),
        ...(r.annunciInReview != null ? { annunciInReview: intero(r.annunciInReview) } : {}),
      });
    }

    // ⚠️ "cross" non vuol dire «di tutti i marchi»: vuol dire «non lo so».
    // Se l'import sa da quale account arriva la riga, quel dubbio si scioglie
    // e la campagna smette di essere invisibile nelle viste per brand.
    // Si promuove SOLO da cross a un brand noto: un brand già deciso — a mano
    // o da un nome che parla chiaro — non si tocca.
    if (
      opzioni.brand &&
      opzioni.brand !== "cross" &&
      campagna.brand === "cross" &&
      // ⚠️ Un brand deciso A MANO non si promuove: è una scelta, non un vuoto.
      !campagna.brandManuale
    ) {
      daAggiornare.set(campagna.id, { ...(daAggiornare.get(campagna.id) ?? {}), brand: opzioni.brand });
      campagna.brand = opzioni.brand; // la cache resta d'accordo col database
    }

    // ⚠️ L'ACCOUNT da cui la riga arriva: è un fatto, e va scritto sempre.
    // Se la campagna risultava di un altro account, quello vecchio era una
    // deduzione sbagliata — è successo a «[Palloncini] - AWARENESS», che
    // risultava di Cake con 1.137,67 € attribuiti e su Cake non esiste.
    if (opzioni.account && campagna.account !== opzioni.account) {
      daAggiornare.set(campagna.id, {
        ...(daAggiornare.get(campagna.id) ?? {}),
        account: opzioni.account,
      });
      campagna.account = opzioni.account;
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
    daScrivere.set(`${campagna.id}|${giorno.getTime()}`, { campagnaId: campagna.id, giorno, valori });
    esito.metricheSalvate++;
    esito.campagneToccate.add(campagna.id);
    if (esito.giornoMin == null || giorno < esito.giornoMin) esito.giornoMin = giorno;
    if (esito.giornoMax == null || giorno > esito.giornoMax) esito.giornoMax = giorno;
  }

  for (const [id, dati] of daAggiornare) {
    await prisma.campagna.update({ where: { id }, data: dati });
  }

  // Gli upsert restano uno per (campagna, giorno) — non c'è un modo di farne
  // uno solo — ma vanno a piccoli gruppi invece che in fila indiana: con la
  // latenza verso Postgres remoto è l'attesa a dominare, non il lavoro.
  // Quattro per volta e non di più: le connessioni disponibili sono cinque e
  // la quinta deve restare libera per chi sta usando l'app in quel momento.
  const LOTTO = 4;
  const voci = [...daScrivere.values()];
  for (let i = 0; i < voci.length; i += LOTTO) {
    await Promise.all(
      voci.slice(i, i + LOTTO).map((v) =>
        prisma.metricaCampagna.upsert({
          where: { campagnaId_data: { campagnaId: v.campagnaId, data: v.giorno } },
          create: { campagnaId: v.campagnaId, data: v.giorno, ...v.valori },
          update: v.valori,
        })
      )
    );
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

// Una località del targeting di una campagna, come la manda lo script.
export type LocalitaRiga = {
  // L'id del "geo target constant" di Google (il criterion_id di un criterio
  // LOCATION è quello): è la chiave vera, i nomi cambiano lingua.
  idEsterno: string;
  nome: string;
  // City | Region | Country… — arriva dall'arricchimento, può mancare.
  tipo?: string | null;
  esclusa?: boolean;
  modificatore?: number | null;
};

export type RigaAnagrafica = {
  idCampagna: string;
  nome: string;
  // Le località del targeting, COMPLETE per la campagna: chi le manda le
  // manda tutte, perché qui si sincronizza uno specchio (si aggiunge, si
  // aggiorna E si toglie). Campo assente = script vecchio: non si tocca
  // niente. Elenco vuoto = la campagna non ha criteri di località, e lo
  // specchio si svuota.
  localita?: LocalitaRiga[] | null;
  // Lo stato tradotto nel nostro vocabolario dallo script (`statoCampagna()`)
  stato?: string | null;
  // Quello grezzo di Google, se lo script lo manda: ENABLED | PAUSED | REMOVED
  statoPiattaforma?: string | null;
  budgetGiornaliero?: number | null;
  strategiaOfferta?: string | null;
  tipo?: string | null;
};

// Lo script manda già lo stato tradotto; da lì si risale al fatto di Google
// senza toccare lo script. Se un giorno manderà `statoPiattaforma` diretto,
// quello vince.
function statoPiattaformaDa(stato?: string | null): string | undefined {
  if (stato === "in_pausa") return "PAUSED";
  if (stato === "conclusa") return "REMOVED";
  if (stato === "attiva") return "ENABLED";
  return undefined;
}

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
  // Le località da sincronizzare si raccolgono durante il giro e si scrivono
  // in fondo: una lettura sola per tutto il lotto, non una per campagna.
  const localitaDaSincronizzare: { campagnaId: string; localita: LocalitaRiga[] }[] = [];

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

    // ⚠️ `stato` si aggiorna SOLO se quello che c'è non è uno stato nostro.
    // Prima si scriveva sempre, e una campagna marcata «defunta» a mano
    // tornava «in_pausa» alla passata dopo: 66 marcature su 68 annullate
    // così (misurato sul registro il 04/08/2026). Il fatto di Google non si
    // perde — va in `statoPiattaforma`, che si scrive sempre.
    const suoNostro = trovata != null && (STATI_CAMPAGNA_NOSTRI as readonly string[]).includes(trovata.stato);
    const dati = {
      stato: suoNostro ? undefined : r.stato ?? undefined,
      statoPiattaforma: r.statoPiattaforma ?? statoPiattaformaDa(r.stato),
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
          account: account ?? null,
          stato: r.stato ?? "in_pausa",
          statoPiattaforma: dati.statoPiattaforma,
          budgetGiornaliero: r.budgetGiornaliero ?? null,
          strategiaOfferta: r.strategiaOfferta ? String(r.strategiaOfferta) : null,
          obiettivo: r.tipo ? String(r.tipo) : null,
          note: `Registrata dall'anagrafica ${canale}${account ? ` (account ${account})` : ""}: esiste sulla piattaforma, nessuna erogazione nel periodo letto`,
        },
      });
      perId.set(idEsterno, creata);
      perNome.set(nome, creata);
      esito.create++;
      if (Array.isArray(r.localita)) {
        localitaDaSincronizzare.push({ campagnaId: creata.id, localita: r.localita });
      }
      continue;
    }

    // ⚠️ PRIMA del controllo «è cambiato qualcosa»: le località possono
    // cambiare anche quando stato e budget sono identici, e il `continue`
    // delle invariate le salterebbe.
    if (Array.isArray(r.localita)) {
      localitaDaSincronizzare.push({ campagnaId: trovata.id, localita: r.localita });
    }

    // Si scrive solo se qualcosa è davvero cambiato: un giro di anagrafica che
    // "aggiorna" trecento campagne identiche riempie lo storico di rumore e
    // rende invisibile il cambiamento vero.
    const cambia =
      (dati.stato != null && dati.stato !== trovata.stato) ||
      (dati.statoPiattaforma != null && dati.statoPiattaforma !== trovata.statoPiattaforma) ||
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
        ...(dati.statoPiattaforma != null ? { statoPiattaforma: dati.statoPiattaforma } : {}),
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

  await sincronizzaLocalita(localitaDaSincronizzare);

  return esito;
}

// Lo specchio delle località di targeting. Qui — a differenza dei copy — la
// consegna è COMPLETA per campagna, quindi togliere ciò che Google non ha più
// è giusto: una località rimossa dal targeting deve sparire dallo specchio.
// Una lettura sola per tutto il lotto; scritture solo dove qualcosa cambia.
async function sincronizzaLocalita(
  lotto: { campagnaId: string; localita: LocalitaRiga[] }[]
): Promise<void> {
  if (lotto.length === 0) return;

  const esistenti = await prisma.localitaCampagna.findMany({
    where: { campagnaId: { in: lotto.map((x) => x.campagnaId) } },
  });
  const chiaveDi = (x: { campagnaId: string; idEsterno: string; esclusa: boolean }) =>
    `${x.campagnaId}|${x.idEsterno}|${x.esclusa}`;
  const perChiave = new Map(esistenti.map((e) => [chiaveDi(e), e]));

  const arrivate = new Set<string>();
  for (const { campagnaId, localita } of lotto) {
    for (const grezza of localita) {
      if (!grezza?.idEsterno || !grezza?.nome) continue;
      const voce = {
        campagnaId,
        idEsterno: String(grezza.idEsterno),
        nome: String(grezza.nome),
        tipo: grezza.tipo ? String(grezza.tipo) : null,
        esclusa: Boolean(grezza.esclusa),
        modificatore: grezza.modificatore == null ? null : Number(grezza.modificatore),
      };
      arrivate.add(chiaveDi(voce));
      const presente = perChiave.get(chiaveDi(voce));
      if (!presente) {
        await prisma.localitaCampagna.create({ data: voce });
      } else if (
        presente.nome !== voce.nome ||
        (voce.tipo != null && presente.tipo !== voce.tipo) ||
        presente.modificatore !== voce.modificatore
      ) {
        await prisma.localitaCampagna.update({
          where: { id: presente.id },
          data: {
            nome: voce.nome,
            ...(voce.tipo != null ? { tipo: voce.tipo } : {}),
            modificatore: voce.modificatore,
          },
        });
      }
    }
  }

  // Via quelle che Google non conferma più — SOLO delle campagne arrivate in
  // questo lotto: delle altre la consegna non dice niente.
  const daTogliere = esistenti.filter((e) => !arrivate.has(chiaveDi(e)));
  if (daTogliere.length > 0) {
    await prisma.localitaCampagna.deleteMany({
      where: { id: { in: daTogliere.map((x) => x.id) } },
    });
  }
}
