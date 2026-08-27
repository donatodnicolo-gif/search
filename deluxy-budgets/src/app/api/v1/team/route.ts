import { NextRequest, NextResponse } from "next/server";
import { autentica, chiamante } from "@/lib/api-auth";
import { ANNO_CORRENTE, caricaAnno, TIPI_PERSONA } from "@/lib/calc";
import { lordoAnnuo } from "@/lib/persone";

// GET /api/v1/team — **squadre e persone** per le altre app Deluxy, in testa il
// Hub.
//
// Perché il Hub le vuole: è lui la porta d'ingresso e sa *chi* è una persona
// (email, password, ruolo), ma non sa **in che squadra sta** né **chi ne
// risponde** — quello vive qui, perché nasce dal budget del personale. Con
// questa rotta il Hub può mostrare l'organico senza tenersene una copia.
//
// Auth: header `X-API-Key` con `BUDGETS_API_KEY`. Sola lettura.
//
// Parametri:
//   ?anno=2026     l'organico è per anno di budget (default: anno corrente)
//   ?compensi=1    aggiunge il costo azienda di ogni persona E la retribuzione
//                  DICHIARATA nel roster (importo, superminimo, periodicità,
//                  contributi, mensilità, più il lordo annuo calcolato con la
//                  regola di questa app) — serve a deluxy-personale per
//                  importare i contratti senza dedurli dal costo. **Fuori di
//                  default**: sono stipendi, e un'API che li restituisce a
//                  chiunque abbia la chiave è un modo silenzioso di farli
//                  girare. Chi li vuole li chiede, e si vede nei log.
//
// Cosa NON esce mai: la stima del netto in busta. È un calcolo di
// pianificazione con parametri fiscali di un altro anno — utile dentro Budgets,
// dove la pagina lo spiega, ingannevole fuori, dove sembrerebbe un cedolino.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const negata = await autentica(req);
  if (negata) return negata;

  const p = req.nextUrl.searchParams;
  const anno = Number(p.get("anno")) || ANNO_CORRENTE;
  // ⚠️⚠️ **I COMPENSI NON ESCONO CON LA CHIAVE CONDIVISA** (buco confermato e
  // provato dal vivo il 27/08/2026: `GET /api/v1/team?compensi=1` con
  // `BUDGETS_API_KEY` rispondeva **200** con `costoAzienda` e `retribuzione`
  // — importo, superminimo, contributi, lordo annuo — di **11 persone**).
  //
  // Perché era aperto: `autentica()` decide lo scope dal **metodo HTTP**, e un
  // GET passa con qualunque chiave di lettura. Sopra questa riga c'era scritto
  // «sono stipendi… chi li vuole li chiede, e si vede nei log»: era un
  // **cartello**, non una serratura. E `ultimoUso` registra la chiave, non il
  // parametro, quindi nemmeno il log manteneva la promessa.
  //
  // ⭐ La chiave condivisa gira negli `.env` di Hub, Anagrafiche, Finance e
  // Marketing, **non si può revocare da sola** e non dice chi l'ha usata: è
  // esattamente la credenziale a cui non si dà il dato più sensibile dell'app.
  // I compensi vogliono una chiave **emessa**, che ha un nome e si revoca.
  const vuoleCompensi = p.get("compensi") === "1";
  const chi = await chiamante(req);
  if (vuoleCompensi && chi?.tipo !== "emessa") {
    return NextResponse.json(
      {
        errore:
          "I compensi non escono con la chiave condivisa BUDGETS_API_KEY: serve una chiave emessa a nome della tua app (Budgets → Configurazione → Chiavi), così si sa chi li ha letti e la si può revocare.",
      },
      { status: 403 }
    );
  }
  const conCompensi = vuoleCompensi;

  const dati = await caricaAnno(anno);
  const nomeTipo = (k: string) => TIPI_PERSONA.find((t) => t.key === k)?.label ?? k;
  const nomeMaison = (id: string | null) => dati.maisons.find((m) => m.id === id)?.nome ?? null;

  const persone = dati.persone.map((x) => ({
    nome: x.nome,
    ruolo: x.ruolo,
    tipo: x.tipo,
    tipoNome: nomeTipo(x.tipo),
    teamId: x.teamId,
    maison: nomeMaison(x.maisonId),
    // I mesi in cui la persona è a carico: un contratto che parte a settembre
    // non è un part-time, ed è la differenza fra «c'è» e «ci sarà».
    mesi: x.mesi,
    partTimePct: x.partTimePct,
    ...(conCompensi
      ? {
          costoAzienda: costoAnnuo(x),
          // I valori COME DICHIARATI nel roster, non ricalcolati: chi importa
          // deve poter distinguere «2.000 €/mese» da «24.000 €/anno».
          retribuzione: {
            importo: x.importo,
            superminimo: x.superminimo,
            periodicita: x.periodicita,
            contributiPct: x.contributiPct,
            mensilita: x.mensilita,
            // Lordo annuo effettivo con la regola di QUESTA app (lordoAnnuo):
            // tabellare + superminimo, ×12 se mensile, riproporzionato al part-time.
            lordoAnnuo: lordoAnnuo(x),
          },
        }
      : {}),
  }));

  const team = dati.team.map((t) => ({
    id: t.id,
    nome: t.nome,
    responsabile: t.responsabile,
    colore: t.colore,
    persone: persone.filter((x) => x.teamId === t.id).map(({ teamId: _t, ...resto }) => resto),
  }));

  // Chi non ha squadra non sparisce: un elenco che perde persone per strada è
  // peggio di un elenco con una voce «senza team».
  const senzaTeam = persone.filter((x) => !x.teamId).map(({ teamId: _t, ...resto }) => resto);

  return NextResponse.json({
    anno,
    compensiInclusi: conCompensi,
    team,
    senzaTeam,
    totali: { team: team.length, persone: persone.length, senzaTeam: senzaTeam.length },
    // I ruoli che questa app riconosce, per chi deve mostrarli o mapparli.
    tipiPersona: TIPI_PERSONA.map((t) => ({ chiave: t.key, nome: t.label })),
  });
}

// Costo azienda annuo della persona, con la stessa regola del P&L: lordo
// riproporzionato al part-time, più gli oneri, solo sui mesi di competenza.
function costoAnnuo(x: {
  importo: number;
  superminimo: number;
  partTimePct: number;
  periodicita: string;
  contributiPct: number;
  mesi: number[];
}): number {
  const lordoPieno = (x.importo + x.superminimo) * (x.partTimePct / 100);
  const annuo = x.periodicita === "MENSILE" ? lordoPieno * 12 : lordoPieno;
  const conOneri = annuo * (1 + x.contributiPct / 100);
  return (conOneri / 12) * x.mesi.length;
}
