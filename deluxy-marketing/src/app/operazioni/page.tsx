import { SelettoreStato } from "@/components/SelettoreStato";
import { ModificaTestoOperazione } from "@/components/ModificaTestoOperazione";
import { SelezionaTutte } from "@/components/SelezionaTutte";
import { Sidebar } from "@/components/Sidebar";
import { TornaIndietro } from "@/components/TornaIndietro";
import { annullaOperazione, approvaOperazione, approvaOperazioniSelezionate,
  cambiaCorrispondenzaOperazione, riapriOperazione,
  cambiaTestoOperazione, rilanciaCampagnaRifiutata, accettaDivergenza, riprovaCompletamento,
  riprovaFallita, riprendiAnnuncioAccodato,
} from "@/lib/azioni";
import { campagneNonConfermate, letturaNonConfermata } from "@/lib/campagne-non-confermate";
import { COLORE_CONFERMA, confermeOperazioni, type Conferma } from "@/lib/conferme-operazioni";
import { prisma } from "@/lib/db";
import { ETICHETTA_CANALE, ETICHETTA_LIVELLO, formattaDataOra } from "@/lib/dominio";
import { spiegaErroreGoogle } from "@/lib/errori-google";
import { EseguiMeta } from "@/components/EseguiMeta";
import { Icona } from "@/components/Icona";
import { iconaCanale } from "@/lib/salute";
import { dichiarazioniScript, TIPI_ESEGUIBILI_OGGI } from "@/lib/versione-script";

export const dynamic = "force-dynamic";

const ETICHETTA_TIPO: Record<string, string> = {
  pausa_campagna: "Metti in pausa la campagna",
  nuova_campagna: "Crea la campagna (nasce in pausa)",
  completa_campagna: "Completa la campagna (gruppo, keyword, annuncio, localita)",
  nuova_keyword: "Aggiungi la keyword",
  attiva_campagna: "Riattiva la campagna",
  budget: "Cambia budget giornaliero",
  pausa_keyword: "Metti in pausa la keyword",
  attiva_keyword: "Riattiva la keyword",
  negativa: "Aggiungi keyword negativa",
  pausa_gruppo: "Metti in pausa il gruppo di annunci",
  attiva_gruppo: "Riattiva il gruppo di annunci",
  // Aggiunti man mano che lo script impara a eseguirli: una riga senza
  // etichetta si legge come "nuovo_annuncio", cioe' come un errore.
  nuovo_annuncio: "Crea un annuncio",
  lista_negative: "Applica una lista di parole escluse",
  localita: "Cambia le localita' della campagna",
  estensione: "Aggiungi un'estensione",
  rimuovi_estensione: "Rimuovi un'estensione (sitelink, callout o snippet)",
};


// Come Google chiama le corrispondenze, e cosa fanno DAVVERO su una negativa.
// La differenza non è cosmetica: la generica è quella che può spegnere una
// campagna per sbaglio, ed è il motivo per cui il default qui è «esatta».
const ETICHETTA_MATCH: Record<string, string> = {
  exact: "esatta",
  esatta: "esatta",
  phrase: "a frase",
  frase: "a frase",
  broad: "generica",
  generica: "generica",
};

const SPIEGA_MATCH: Record<string, string> = {
  exact: "Blocca SOLO questa ricerca esatta. È la più prudente: non tocca le varianti.",
  esatta: "Blocca SOLO questa ricerca esatta. È la più prudente: non tocca le varianti.",
  phrase: "Blocca le ricerche che contengono questa sequenza di parole nell'ordine dato.",
  frase: "Blocca le ricerche che contengono questa sequenza di parole nell'ordine dato.",
  broad: "⚠️ Blocca OGNI ricerca che contenga tutte queste parole, in qualsiasi ordine: «fiori milano» spegne anche «consegna fiori a milano centro».",
  generica: "⚠️ Blocca OGNI ricerca che contenga tutte queste parole, in qualsiasi ordine.",
};

const COLORE_STATO: Record<string, string> = {
  in_attesa: "var(--orange)",
  approvata: "var(--blue)",
  eseguita: "var(--green)",
  fallita: "var(--red)",
  annullata: "var(--text-tertiary)",
};
const ETICHETTA_STATO: Record<string, string> = {
  in_attesa: "Da approvare",
  approvata: "Approvata — in attesa di chi la esegue",
  eseguita: "Eseguita sulla piattaforma",
  fallita: "Fallita",
  annullata: "Annullata",
};

// Coda delle operazioni verso Google Ads. L'app non scrive mai in diretta:
// ogni modifica nasce qui "da approvare", e solo dopo l'approvazione lo
// script la può prendere ed eseguire.
export default async function PaginaOperazioni({
  searchParams,
}: {
  // ⚠️ Questa pagina non leggeva NESSUN parametro: chi ci arrivava dopo aver
  // messo qualcosa in coda non riceveva nessuna conferma, e se tutte le
  // campagne scelte erano state saltate (parola già presente, freeze) non
  // compariva nemmeno una riga nuova. Dal di fuori è indistinguibile da un
  // bottone che non fa niente — ed è esattamente come è stato segnalato.
  // `torna`: da dove si veniva quando si è messo qualcosa in coda. Diventa
  // il bottone «torna indietro», e resta nell'URL anche dopo l'approvazione.
  searchParams: Promise<{ esito?: string; saltate?: string; avvisi?: string; torna?: string }>;
}) {
  const sp = await searchParams;
  // ⚠️ LE VIVE SI PRENDONO TUTTE, le concluse solo degli ULTIMI 7 GIORNI.
  //
  // Prima era «le ultime 100 comunque»: con abbastanza operazioni recenti,
  // una da approvare poteva restare fuori dalla pagina che serve ad
  // approvarla — e nessuno se ne sarebbe accorto, perché una coda che non
  // mostra una riga è indistinguibile da una coda vuota.
  //
  // Il resto della storia non sparisce: sta in /operazioni/archivio, dove si
  // cerca. Qui davanti resta quello su cui si lavora oggi.
  const SETTE_GIORNI = new Date(Date.now() - 7 * 24 * 3600_000);
  const [vive, concluseRecenti, piuVecchie, nonConfermate] = await Promise.all([
    prisma.operazioneAdv.findMany({
      where: { stato: { in: ["in_attesa", "approvata"] } },
      orderBy: { creataIl: "desc" },
    }),
    prisma.operazioneAdv.findMany({
      where: {
        stato: { in: ["eseguita", "fallita", "annullata"] },
        creataIl: { gte: SETTE_GIORNI },
      },
      orderBy: { creataIl: "desc" },
    }),
    prisma.operazioneAdv.count({
      where: {
        stato: { in: ["eseguita", "fallita", "annullata"] },
        creataIl: { lt: SETTE_GIORNI },
      },
    }),
    // «Eseguita» su una campagna nuova vuol dire INVIATA: il bulk upload non
    // risponde. Qui si incrociano i giri di anagrafica arrivati dopo.
    campagneNonConfermate(),
  ]);
  const operazioni = [...vive, ...concluseRecenti];
  const daApprovare = operazioni.filter((o) => o.stato === "in_attesa");
  const approvate = operazioni.filter((o) => o.stato === "approvata");
  const concluse = operazioni.filter((o) => ["eseguita", "fallita", "annullata"].includes(o.stato));

  // ⚠️ «Eseguita» è la parola dello SCRIPT: dice che ha chiamato Google e
  // Google non ha protestato. Qui si va a prendere la CONFERMA INDIPENDENTE —
  // cosa ha rimandato Google dopo, nei giri di lettura che arrivano comunque.
  // Vale per ogni tipo di operazione, non solo per le campagne nuove.
  const conferme = await confermeOperazioni(operazioni);

  // ── COSA SANNO ESEGUIRE LE COPIE DELLO SCRIPT ──────────────────────────
  // ⚠️ Le copie vivono dentro Google Ads e le incolla una persona: l'app non
  // le vede. Finché non dicevano la propria versione, «questo conto sa
  // eseguire `localita`?» si poteva rispondere solo accodando un'operazione
  // vera e guardando come finiva — una prova pagata con una modifica su un
  // account vero. Dal 25/08/2026 la copia lo dichiara al giro di «esegui», e
  // qui si legge. Un conto MUTO non è un conto senza script: è un conto la cui
  // copia è più vecchia di quella data, e va scritto con queste parole.
  const [contiGoogle, dichiarazioni] = await Promise.all([
    prisma.accountAdv.findMany({
      where: { piattaforma: "google_ads", attivo: true },
      select: { idEsterno: true, nome: true, brand: true },
      orderBy: { brand: "asc" },
    }),
    dichiarazioniScript(),
  ]);
  const contiIncerti = contiGoogle.filter((c) => {
    const d = dichiarazioni.get(c.idEsterno.trim());
    return !d || TIPI_ESEGUIBILI_OGGI.some((t) => !d.sa.includes(t));
  });
  const smentite = concluse.filter((o) => {
    const c = conferme.get(o.id);
    return c && (c.stato === "smentita" || c.stato === "rifiutata");
  });

  // ── Le approvate FERME si dichiarano ────────────────────────────────────
  // Un'operazione approvata che lo script ha già scavalcato è indistinguibile
  // da una che aspetta il primo giro — e una coda che si blocca in silenzio è
  // indistinguibile da una coda vuota (successo davvero, 07/08: il motivo
  // viveva solo nel log dentro Google Ads). La differenza sta nelle consegne
  // dell'account DOPO l'approvazione, e va scritta sulla riga.
  const accountDelleApprovate = [
    ...new Set(approvate.map((o) => o.account).filter((a): a is string => Boolean(a))),
  ];
  const primaApprovazione = approvate.reduce<Date | null>((min, o) => {
    const d = o.approvataIl ?? o.creataIl;
    return !min || d < min ? d : min;
  }, null);
  const consegneDopo =
    accountDelleApprovate.length > 0 && primaApprovazione
      ? await prisma.ricezioneDati.findMany({
          where: {
            fonte: "google_ads",
            account: { in: accountDelleApprovate },
            ricevutoIl: { gt: primaApprovazione },
          },
          select: { account: true, ricevutoIl: true },
        })
      : [];
  // Un «giro» è un giorno con almeno una consegna: la stessa corsa consegna
  // più volte (metriche, gruppi, copy) e contare le consegne gonfierebbe.
  // Il margine di un'ora tiene fuori il giro a cavallo dell'approvazione.
  const giriDopo = (o: (typeof operazioni)[number]): number => {
    if (!o.account) return 0;
    const da = (o.approvataIl ?? o.creataIl).getTime() + 60 * 60 * 1000;
    return new Set(
      consegneDopo
        .filter((c) => c.account === o.account && c.ricevutoIl.getTime() > da)
        .map((c) => c.ricevutoIl.toISOString().slice(0, 10))
    ).size;
  };

  /**
   * Le righe divise per PIATTAFORMA, con scritto chi le esegue.
   *
   * ⚠️ La coda è una sola ed è giusto — la decisione è la stessa, cambia chi
   * la porta a termine — ma mescolare le righe le rende indistinguibili: «metti
   * in pausa la campagna» su Google e su Meta si leggono identiche, e finiscono
   * in due mondi diversi con due motori diversi. Uno aspetta lo script e l'altro
   * aspetta te.
   */
  const perPiattaforma = (righe: typeof operazioni, selezionabile = false) => {
    const ordine = ["google_ads", "meta_ads"];
    const canali = [...new Set(righe.map((r) => r.canale ?? ""))].sort(
      (a, b) => (ordine.indexOf(a) + 1 || 9) - (ordine.indexOf(b) + 1 || 9)
    );
    // Con una piattaforma sola il divisore è rumore: si mostra l'elenco.
    if (canali.length <= 1) return <ul className="storia">{righe.map((r) => riga(r, selezionabile))}</ul>;
    return (
      <>
        {canali.map((c) => {
          const sue = righe.filter((r) => (r.canale ?? "") === c);
          return (
            <div key={c || "altro"}>
              <div className="canale-divisore">
                <Icona nome={iconaCanale(c)} />
                {ETICHETTA_CANALE[c] ?? (c || "Altro")} ({sue.length})
                <span className="cella-sub" style={{ fontWeight: 400, marginLeft: 8 }}>
                  {c === "meta_ads"
                    ? "le esegue l'app, quando premi «Esegui adesso» qui sopra"
                    : c === "google_ads"
                      ? "le esegue lo script dentro l'account, da solo"
                      : "senza esecutore automatico"}
                </span>
              </div>
              <ul className="storia">{sue.map((r) => riga(r, selezionabile))}</ul>
            </div>
          );
        })}
      </>
    );
  };

  const riga = (o: (typeof operazioni)[number], selezionabile = false) => {
    const conferma: Conferma | undefined = conferme.get(o.id);
    const p = o.parametri ? (JSON.parse(o.parametri) as Record<string, unknown>) : {};
    const parola = typeof p.testo === "string" && p.testo ? p.testo : null;
    const match = typeof p.corrispondenza === "string" ? String(p.corrispondenza).toLowerCase() : null;
    // Finché non è partita si può ancora ritoccare; dopo è storia.
    const modificabile = o.stato === "in_attesa" || o.stato === "approvata";
    // ⚠️ L'errore di Google arriva come JSON: la riga «esito» diventava
    // quattro righe di parentesi che nessuno legge. La traduzione si
    // AGGIUNGE (non sostituisce): il testo originale serve a cercarlo, e su
    // un errore sconosciuto una frase generica sarebbe peggio del JSON.
    const spiegato = spiegaErroreGoogle(o.esito);
    // ⚠️ Una PROGRAMMATA approvata non sta per partire: senza dirlo si legge
    //    come le altre, e chi guarda la coda si aspetta di vederla eseguita
    //    stanotte.
    const programmata =
      o.daEseguireDal && o.daEseguireDal.getTime() > Date.now()
        ? o.daEseguireDal.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })
        : null;
    const dettagli = [
      o.prima ? `prima: ${o.prima}` : null,
      o.motivo || null,
      // La traduzione PRIMA del testo grezzo: e' quella che si legge.
      spiegato,
      programmata ? `programmata: parte dal ${programmata}` : null,
      o.esito ? `esito: ${o.esito}` : null,
    ].filter(Boolean);

    return (
      <li id={`op-${o.id}`} className="op-riga" key={o.id}>
        {/* La casella raggiunge il form della barra con form=: dentro la riga
            ci sono gia i moduli di approva e annulla, e i form non si
            annidano. */}
        {selezionabile && (
          <input
            type="checkbox"
            form="scelte-op"
            name="scelte"
            value={o.id}
            aria-label={`Seleziona: ${ETICHETTA_TIPO[o.tipo] ?? o.tipo} su ${o.bersaglio}`}
            style={{ marginRight: 10, marginTop: 4 }}
          />
        )}
        <div className="op-corpo">
          <div className="op-titolo">
            <b>{ETICHETTA_TIPO[o.tipo] ?? o.tipo}</b>
            {parola && <span className="op-parola">«{parola}»</span>}
            {/* La matita: si corregge il testo PRIMA che diventi una parola
                vera in asta. Solo finché è da approvare — chi ha approvato ha
                approvato quella parola, e cambiargliela sotto vorrebbe dire
                eseguire una cosa che nessuno ha guardato. */}
            {parola && o.stato === "in_attesa" && (o.tipo === "nuova_keyword" || o.tipo === "negativa") && (
              <ModificaTestoOperazione
                id={o.id}
                testo={parola}
                tipo={o.tipo}
                campagna={o.bersaglio}
                azione={cambiaTestoOperazione}
              />
            )}
            {parola && match && (
              modificabile ? (
                /* Si cambia qui, finché lo script non è passato: la
                   corrispondenza è l'unica cosa che ha senso ritoccare senza
                   rifare l'operazione — il resto È la decisione. */
                <form action={cambiaCorrispondenzaOperazione} style={{ display: "inline-flex" }}>
                  <input type="hidden" name="id" value={o.id} />
                  <SelettoreStato
                    nome="corrispondenza"
                    valore={match === "esatta" ? "exact" : match === "frase" ? "phrase" : match === "generica" ? "broad" : match}
                    colore={match === "broad" || match === "generica" ? "var(--orange)" : undefined}
                    opzioni={[
                      { valore: "exact", etichetta: "esatta" },
                      { valore: "phrase", etichetta: "a frase" },
                      { valore: "broad", etichetta: "generica ⚠" },
                    ]}
                  />
                </form>
              ) : (
                <span
                  className={`op-match${match === "broad" || match === "generica" ? " larga" : ""}`}
                  title={SPIEGA_MATCH[match] ?? ""}
                >
                  {ETICHETTA_MATCH[match] ?? match}
                </span>
              )
            )}
            {p.budget != null && <span className="op-parola">{String(p.budget)} €/g</span>}
          </div>

          <div className="op-dove">
            {parola ? "in " : ""}
            {o.campagnaId ? (
              <a href={`/campagne/${o.campagnaId}`}>{o.bersaglio}</a>
            ) : (
              o.bersaglio
            )}
            {" · "}
            {formattaDataOra(o.creataIl)}
          </div>

          {dettagli.length > 0 && <div className="op-dettagli">{dettagli.join(" · ")}</div>}

          {/* Quello che il change control avrebbe rifiutato, e che dal
              04/08/2026 dice invece di rifiutare. Sta sulla riga e non in un
              messaggio di passaggio, perché chi approva può essere un'altra
              persona un altro giorno: è QUI che l'avviso serve. */}
          {o.avvisi && (
            <div className="op-avvisi">
              <span aria-hidden="true">⚠</span> {o.avvisi}
            </div>
          )}

          {/* Cosa dice GOOGLE, per esteso. La pillola a destra dà il verdetto
              in due parole; qui c'è il perché — quale consegna fa fede, quando
              è arrivata e cosa fare se non torna. ⚠️ Non è un avviso solo
              quando qualcosa non va: anche «confermata» va scritta, perché è
              il caso in cui uno smette di dubitare, e un'assenza di segnale
              non è un segnale di conferma. */}
          {conferma && (
            <div
              className={
                conferma.stato === "smentita" || conferma.stato === "rifiutata"
                  ? "op-avvisi"
                  : "op-conferma"
              }
              style={
                conferma.stato === "smentita" || conferma.stato === "rifiutata"
                  ? undefined
                  : { color: COLORE_CONFERMA[conferma.stato] }
              }
            >
              <span aria-hidden="true">
                {conferma.stato === "confermata"
                  ? "✓"
                  : conferma.stato === "in_attesa"
                  ? "◷"
                  : conferma.stato === "non_verificabile" || conferma.stato === "superata"
                  ? "◇"
                  : conferma.stato === "accettata"
                  ? /* Una divergenza dichiarata voluta non è un allarme: il ⚠ qui
                       rimetterebbe in testa il dubbio che qualcuno ha appena
                       tolto, ed è il motivo per cui gli avvisi si smettono di
                       leggere. */
                    "✋"
                  : "⚠"}
              </span>{" "}
              <b>Google: </b>
              {conferma.frase}
              {/* «Lo so, è voluto». Compare solo quando c'è davvero una
                  divergenza: è la via d'uscita senza la quale un avviso che
                  non si può chiudere si smette di leggere — e allora smette di
                  funzionare anche per quelli veri. ⚠️ Non tocca Google:
                  dichiara una decisione già presa là, e allinea l'app al
                  fatto. */}
              {(conferma.stato === "smentita" || conferma.stato === "rifiutata") && (
                <form action={accettaDivergenza} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    className="btn small btn-secondario"
                    type="submit"
                    style={{ marginLeft: 8 }}
                    title="Dichiara che la differenza è una tua decisione presa in Google Ads: l'avviso si chiude e lo stato dell'app si allinea a quello di Google. Non cambia niente su Google."
                  >
                    È voluto
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ⚠️ Un'approvata che lo script ha scavalcato non deve sembrare una
              che aspetta il primo giro: senza questa riga, «ferma da tre
              giorni» e «in attesa da stanotte» si leggono uguali. */}
          {o.stato === "approvata" && o.canale === "google_ads" && giriDopo(o) > 0 && (
            <div className="op-avvisi">
              <span aria-hidden="true">⚠</span> <b>Ferma: lo script di questo account è passato{" "}
              {giriDopo(o) === 1 ? "un giorno" : `${giriDopo(o)} giorni`} dopo l&apos;approvazione
              senza eseguirla.</b> O il lavoro «esegui» non gira su quell&apos;account, o il
              bersaglio non si trova: il motivo preciso è nel log dello script dentro Google Ads,
              sotto «ESEGUI». Puoi ritirare l&apos;approvazione e rifarla, o annullarla.
            </div>
          )}
          {(o.stato === "approvata" || o.stato === "in_attesa") && o.canale === "google_ads" && !o.account && (
            <div className="op-avvisi">
              <span aria-hidden="true">⚠</span> <b>Senza account: nessuno script la riconosce come
              sua.</b> Gli account estranei la saltano e quello giusto non sa di esserlo, quindi
              resterebbe qui per sempre. Succede alle operazioni nate prima dell&apos;8/08 o quando
              il brand della campagna non dice l&apos;account: meglio annullarla e rimetterla in
              coda dall&apos;app.
            </div>
          )}

          {/* ⚠️ DA DOVE VIENE, detto a chi approva. Un'esclusione proposta da
              una regola automatica non è la stessa cosa di una chiesta da una
              persona che guardava quel numero: chi approva deve saperlo PRIMA
              di premere, e la riga è l'unico posto dove lo legge davvero. */}
          {o.richiestaDa === "regole-ai" && o.stato === "in_attesa" && (
            <div className="op-avvisi">
              <span aria-hidden="true">◈</span> <b>Proposta dalle regole automatiche, non da una
              persona.</b> Nessuno ha guardato questa ricerca una per una: prima di approvare
              controlla che escluderla sia davvero quello che vuoi — la regola che l'ha scelta è
              scritta qui sopra, nel motivo.
            </div>
          )}

          {/* Finché lo script non è passato si può sempre tornare indietro:
              annullare non cambia niente su Google, perché l'operazione non è
              mai arrivata là. Dopo l'esecuzione sparisce — per disfare serve
              l'operazione opposta. */}
          {/* ⚠️ RIPROVA, solo sul completamento e solo se qualcosa era andato
              storto. È l'unica operazione fatta per essere ripetibile — lo
              script salta località, gruppo e keyword che ci sono già — quindi
              riprova soltanto il pezzo fallito. Senza questo bottone, dopo aver
              sistemato (per esempio) la landing rifiutata non c'era modo di
              riprovare il solo annuncio: bisognava rifare il modulo di lancio,
              che avrebbe creato una SECONDA campagna. */}
          {o.tipo === "completa_campagna" &&
            o.stato === "eseguita" &&
            /ATTENZIONE|RIFIUTAT|non trovate|ambigu/i.test(o.esito ?? "") && (
              <form className="op-comandi" action={riprovaCompletamento}>
                <input type="hidden" name="id" value={o.id} />
                <button
                  className="btn small btn-secondario"
                  type="submit"
                  title="Rimette in coda il completamento. Località, gruppo e keyword già presenti vengono saltati: riprova solo quello che era fallito. Prima però va sistemata la causa, o fallirà di nuovo."
                >
                  Riprova quello che manca
                </button>
              </form>
            )}

          {/* ⚠️ UNA RIGA «FALLITA» SENZA BOTTONI E' UN VICOLO CIECO.
              Lo storico diceva cosa era andato storto e finiva li': per
              riprovare bisognava rifare tutto dal punto di partenza — per un
              annuncio, riscrivere quindici titoli. `nuova_campagna` resta
              fuori: ha la sua strada con le tre prove, perche' rimetterla in
              coda alla cieca puo' creare una seconda campagna che spende. */}
          {o.stato === "fallita" && o.tipo !== "nuova_campagna" && (
            <div className="op-comandi" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <form action={riprovaFallita} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={o.id} />
                {sp.torna && <input type="hidden" name="torna" value={sp.torna} />}
                <button
                  className="btn small btn-secondario"
                  type="submit"
                  title={
                    o.tipo === "nuovo_annuncio" || o.tipo === "nuova_keyword"
                      ? "Rimette in coda lo stesso identico contenuto: torna «da approvare». ⚠️ Prima controlla su Google che il tentativo fallito non abbia creato niente a metà, altrimenti si duplica."
                      : "Rimette in coda l'operazione: torna «da approvare». Se la causa del fallimento non è stata sistemata, fallirà di nuovo."
                  }
                >
                  Rimetti in coda
                </button>
              </form>
              {o.tipo === "nuovo_annuncio" && o.gruppoId && (
                <form action={riprendiAnnuncioAccodato} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    className="btn small btn-secondario"
                    type="submit"
                    title="Riporta titoli, descrizioni e destinazione nelle caselle del gruppo: si corregge quello che non andava e si rimette in coda, senza riscrivere il resto."
                  >
                    Correggi i testi
                  </button>
                </form>
              )}
            </div>
          )}

          {(o.stato === "in_attesa" || o.stato === "approvata") && (
            <form className="pill-scelta op-comandi">
              <input type="hidden" name="id" value={o.id} />
              {/* Il ritorno sopravvive all approvazione: senza, il bottone
                  «torna dove eri» spariva proprio dopo il click che lo
                  rendeva utile. */}
              {sp.torna && <input type="hidden" name="torna" value={sp.torna} />}
              {o.stato === "in_attesa" && (
                <button className="pill-opt" formAction={approvaOperazione} style={{ color: "var(--green)" }}>
                  <span className="dot" />
                  <span style={{ color: "var(--text)" }}>Approva</span>
                </button>
              )}
              {o.stato === "approvata" && (
                <button
                  className="pill-opt"
                  formAction={riapriOperazione}
                  style={{ color: "var(--gold-strong)" }}
                  title="Ritira l approvazione: torna fra quelle da decidere, senza perdere l operazione"
                >
                  <span className="dot" />
                  <span style={{ color: "var(--text)" }}>Ritira approvazione</span>
                </button>
              )}
              <button
                className="pill-opt"
                formAction={annullaOperazione}
                style={{ color: "var(--text-tertiary)" }}
                title={
                  o.stato === "approvata"
                    ? "Toglie l'operazione dalla coda prima che lo script la esegua: su Google non cambia niente"
                    : "Scarta l'operazione senza eseguirla"
                }
              >
                <span className="dot" />
                <span style={{ color: "var(--text)" }}>Annulla</span>
              </button>
            </form>
          )}
        </div>

        <div className="op-stato">
          {/* ⚠️ La piattaforma sulla riga: «pausa campagna» su Google e su
              Meta si leggono uguali e finiscono in due posti diversi, con due
              esecutori diversi. */}
          <span className="cella-sub">{ETICHETTA_CANALE[o.canale ?? ""] ?? o.canale}</span>
          <span className="tag-salute" style={{ color: COLORE_STATO[o.stato] }}>
            <span className="dot" />
            {ETICHETTA_STATO[o.stato] ?? o.stato}
          </span>
          {/* ⚠️ DUE COSE DIVERSE, UNA SOPRA L'ALTRA. Sopra c'è quello che ha
              detto lo script; sotto quello che dice GOOGLE quando ha
              rimandato il dato. Sono affiancate e non fuse apposta: fonderle
              vorrebbe dire scegliere una delle due e nascondere l'altra —
              ed è la fusione che aveva fatto leggere «eseguita» come «creata»
              su una campagna che Google aveva rifiutato. */}
          {conferma && (
            <span
              className="tag-salute"
              style={{ color: COLORE_CONFERMA[conferma.stato] }}
              title={conferma.frase}
            >
              <span className="dot" />
              {conferma.etichetta}
            </span>
          )}
          <span className="op-livello">{ETICHETTA_LIVELLO[o.livello] ?? o.livello}</span>
        </div>
      </li>
    );
  };


  return (
    <div className="layout">
      <Sidebar attiva="operazioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Operazioni</h1>
            <p className="page-sub">
              {/* ⚠️ UNA CODA SOLA, DUE MOTORI. Le operazioni Google e Meta
                  stanno nella stessa tabella — ed è giusto: la decisione è la
                  stessa, cambia solo chi la esegue. Ma la pagina parlava solo
                  di «lo script», e su Meta lo script non esiste: chi
                  approvava una modifica Meta restava ad aspettare un motore
                  che non sarebbe mai passato. */}
              Le modifiche decise qui non partono da sole: restano in attesa finché non le approvi.
              Poi cambia <b>chi le esegue</b>: su <b>Google</b> lo script dentro l&apos;account, che
              passa da solo; su <b>Meta</b> l&apos;app, e solo quando premi <b>Esegui adesso</b> nel
              riquadro qui sopra. Quando un&apos;operazione va a buon fine parte il blackout di 72
              ore e nascono le verifiche.
              {" "}Sulle parole, la <b>corrispondenza</b> si cambia da qui finché l&apos;operazione non
              è partita: <b>esatta</b> blocca solo quella ricerca, <b>a frase</b> la sequenza di
              parole, <b>generica</b> ogni ricerca che le contenga in qualsiasi ordine — ed è quella
              che può spegnere una campagna per sbaglio.
            </p>
          </div>
        </div>

        {/* ⚠️ CHI ESEGUE, E COSA SA FARE. Sta in cima perché è la domanda che
            viene prima di ogni approvazione: approvare un tipo che la copia
            incollata non conosce vuol dire mettere in coda un'attesa, non una
            modifica. Si mostra sempre — anche quando va tutto bene — perché
            «nessun avviso» e «non l'ho guardato» si somigliano troppo. */}
        {contiGoogle.length > 0 && (
          <div
            className="nota-info"
            style={
              contiIncerti.length > 0
                ? { borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }
                : undefined
            }
          >
            <span className="nota-icona" style={{ color: contiIncerti.length > 0 ? "var(--orange)" : "var(--green)" }}>
              {contiIncerti.length > 0 ? "⚠" : "✓"}
            </span>
            <span>
              <b>Le copie dello script, e cosa dichiarano di saper eseguire.</b>{" "}
              Su Google esegue una copia di questo script <b>incollata dentro l&apos;account</b>:
              se è vecchia, un&apos;operazione approvata resta in coda finché non fallisce con
              «Tipo di operazione non gestito».
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {contiGoogle.map((c) => {
                  const d = dichiarazioni.get(c.idEsterno.trim());
                  const mancanti = d ? TIPI_ESEGUIBILI_OGGI.filter((t) => !d.sa.includes(t)) : [];
                  return (
                    <li key={c.idEsterno} style={{ marginBottom: 4 }}>
                      <b>{c.nome}</b> <span className="cella-sub">({c.idEsterno})</span>{" "}
                      {!d ? (
                        <span className="cella-sub">
                          — <b>non dichiara la sua versione</b>: la copia incollata è più vecchia
                          del 25/08/2026. Non si sa cosa sappia eseguire finché non la si reincolla.
                        </span>
                      ) : mancanti.length > 0 ? (
                        <span className="cella-sub">
                          — versione <b>{d.versione}</b>, vista il {formattaDataOra(d.visto)}.{" "}
                          <b>Non sa eseguire:</b> {mancanti.join(", ")} — va reincollata.
                        </span>
                      ) : (
                        <span className="cella-sub">
                          — versione <b>{d.versione}</b>, vista il {formattaDataOra(d.visto)}: sa
                          eseguire tutti i {TIPI_ESEGUIBILI_OGGI.length} tipi che l&apos;app può
                          mettere in coda.
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {contiIncerti.length > 0 && (
                <div className="cella-sub" style={{ marginTop: 8 }}>
                  Le copie aggiornate si rigenerano con{" "}
                  <code>node scripts/genera-copie-google.mjs</code> e si reincollano una per
                  account (CHIAVE_API e BRAND vanno rimessi a mano). La dichiarazione arriva al
                  primo giro di <b>esegui</b>.
                </div>
              )}
            </span>
          </div>
        )}

        {/* ⚠️ «Eseguita» su una campagna nuova vuol dire INVIATA, non CREATA.
            Il bulk upload di Google non risponde e viene lavorato dopo: se lo
            rifiuta, l'errore resta nel registro dei caricamenti dentro Google
            Ads e non torna mai indietro. Qui si dichiara, incrociando i giri di
            anagrafica arrivati dopo il lancio — l'unica prova che l'app ha. */}
        {nonConfermate.length > 0 && (
          <div
            className="nota-info"
            style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}
          >
            <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
            <span>
              <b>
                {nonConfermate.length} campagn{nonConfermate.length === 1 ? "a lanciata" : "e lanciate"} che
                Google non ha ancora confermato
              </b>
              . «Eseguita» qui vuol dire che il <b>caricamento è stato inviato</b>, non che la
              campagna esista: il bulk upload non risponde all&apos;app.
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {nonConfermate.map((c) => {
                  const l = letturaNonConfermata(c);
                  return (
                    <li key={c.id} style={{ marginBottom: 4 }}>
                      <a href={`/campagne/${c.id}`} style={{ color: "var(--blue)" }}>{c.nome}</a>{" "}
                      <span className="cella-sub">
                        — lanciata il {formattaDataOra(c.lanciataIl)}
                        {c.account ? ` sull'account ${c.account}` : ""}.{" "}
                        {l.grave ? <b>{l.frase.replace(/\*\*/g, "")}</b> : l.frase}
                      </span>
                      {/* Il rilancio compare SOLO quando il rifiuto è provato:
                          rimettere in coda una campagna davvero creata ne farebbe
                          nascere una seconda. Il controllo è ripetuto anche nella
                          server action — un bottone nascosto non è una rete. */}
                      {l.grave && (
                        <form action={rilanciaCampagnaRifiutata} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={c.operazioneId} />
                          <button
                            className="btn small btn-secondario"
                            type="submit"
                            style={{ marginLeft: 8 }}
                            title="Rimette l'operazione fra quelle da approvare, con gli stessi parametri: non serve rifare il modulo. Prima però va reincollato lo script corretto, o verrà rifiutata di nuovo."
                          >
                            Rimetti in coda
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </span>
          </div>
        )}

        {/* ⚠️ Le operazioni che Google SMENTISCE, in cima. Una riga «eseguita»
            in fondo allo storico non la guarda nessuno: se il dato che Google
            ha rimandato dopo dice il contrario, va detto dove si entra. Le
            campagne nuove hanno già il loro avviso qui sopra, con il rilancio:
            qui restano budget, stati e keyword. */}
        {smentite.filter((o) => o.tipo !== "nuova_campagna").length > 0 && (
          <div
            className="nota-info"
            style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}
          >
            <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
            <span>
              <b>
                {smentite.filter((o) => o.tipo !== "nuova_campagna").length} operazion
                {smentite.filter((o) => o.tipo !== "nuova_campagna").length === 1 ? "e risulta eseguita" : "i risultano eseguite"} ma
                Google dice il contrario
              </b>
              . «Eseguita» è quello che ha riferito lo script; questo è quello che l&apos;account ha
              rimandato <b>dopo</b>, nei giri di lettura. ⚠️ <b>Non vuol dire che sia un guasto</b>:
              quasi sempre è qualcuno che ha cambiato quella cosa a mano in Google Ads, e l&apos;app
              non ha modo di saperlo — è proprio per vederlo che questo riquadro esiste. Le trovi
              qui sotto nello storico, con la spiegazione sulla riga:
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {smentite
                  .filter((o) => o.tipo !== "nuova_campagna")
                  .map((o) => (
                    <li key={o.id} style={{ marginBottom: 4 }}>
                      <b>{ETICHETTA_TIPO[o.tipo] ?? o.tipo}</b>
                      {" su "}
                      {o.campagnaId ? (
                        <a href={`/campagne/${o.campagnaId}`} style={{ color: "var(--blue)" }}>{o.bersaglio}</a>
                      ) : (
                        o.bersaglio
                      )}{" "}
                      <span className="cella-sub">— {conferme.get(o.id)?.frase}</span>
                    </li>
                  ))}
              </ul>
            </span>
          </div>
        )}

        {/* ⚠️ La via del ritorno. Chi mette in coda arriva qui da una scheda
            campagna o gruppo, e dopo aver approvato doveva rifare la strada a
            memoria: campagna, gruppo, filtro. Il link sta in cima e resta
            anche dopo l'approvazione, perché è lì che serve. */}
        <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Due vie d'uscita, e servono entrambe: il link esplicito quando si
              sa da dove si veniva (ci si torna anche dopo il redirect
              dell'approvazione, che azzera la cronologia utile), e la
              cronologia per chi è entrato dal menù. */}
          {sp.torna && (
            <a className="btn small btn-secondario" href={sp.torna}>
              ← Torna dove eri
            </a>
          )}
          <TornaIndietro />
        </div>

        {sp.esito && (
          <div className="avviso-ok">
            <strong>{sp.esito}</strong>
          </div>
        )}

        {/* ⚠️ Meta ha un motore diverso: su Google esegue lo script dentro
            l account, qui esegue l app e SOLO quando qualcuno preme. Senza
            dirlo, una coda Meta approvata resta ferma per sempre ed e
            indistinguibile da una che sta per partire. */}
        <EseguiMeta />
        {/* Le saltate NON sono un dettaglio: sono il motivo per cui uno guarda
            la coda e non trova quello che si aspettava. */}
        {sp.saltate && (
          <div className="avviso-errore">
            <strong>Saltate:</strong> {sp.saltate}
          </div>
        )}
        {/* Il change control non rifiuta più: dice l'impatto. L'avviso compare
            qui per chi ha appena messo in coda, e resta sulla riga
            dell'operazione per chi approverà — che può essere un'altra
            persona un altro giorno. */}
        {sp.avvisi && (
          <div className="avviso-attenzione">
            <strong>Da sapere prima di approvare:</strong> {sp.avvisi}
          </div>
        )}

        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Perché questo passaggio: i Definitivi prescrivono che si esegua <b>solo ciò che è stato
            esplicitamente approvato</b> (AGENDA PIANI) e che ogni modifica passi dal change control
            del doc 11. Il guardrail controlla <i>prima</i> di mettere in coda: se una regola è
            violata, l&apos;operazione non nasce nemmeno.
          </span>
        </div>

        <section className="scheda">
          <div className="scheda-titolo">
            Da approvare ({daApprovare.length})
          </div>
          {daApprovare.length === 0 ? (
            <div className="vuoto-mini">Niente in attesa.</div>
          ) : (
            <>
              {/* Approvare in blocco. ⚠️ Non salta nessuna rete: si approva
                  solo ciò che è già in coda, solo le righe spuntate, e lo
                  script le esegue una per una riferendo l'esito di ognuna.
                  Sparisce il click ripetuto quindici volte, non il
                  controllo. Il form sta FUORI dalla lista: dentro le righe
                  ci sono già i moduli di approva e annulla. */}
              <form id="scelte-op" action={approvaOperazioniSelezionate} className="barra-multipla">
                {sp.torna && <input type="hidden" name="torna" value={sp.torna} />}
                <span className="cella-sub">
                  Spunta le operazioni e approvale tutte insieme:
                </span>
                <SelezionaTutte formId="scelte-op" />
                <button className="btn small" type="submit">
                  Approva le selezionate
                </button>
                <span className="cella-sub">
                  Restano in coda: nessuna parte adesso. Su Google le prende lo script al giro
                  successivo, su Meta partono quando premi «Esegui adesso».
                </span>
              </form>
              {perPiattaforma(daApprovare, true)}
            </>
          )}
        </section>

        {approvate.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Approvate, in attesa di partire ({approvate.length})</div>
            {perPiattaforma(approvate)}
          </section>
        )}

        {(concluse.length > 0 || piuVecchie > 0) && (
          <section className="scheda">
            {/* ⚠️ La finestra si DICHIARA. «Storico» senza una data fa credere
                che ci sia tutto, e chi non trova un'operazione di tre
                settimane fa conclude che sia sparita. */}
            <div
              className="scheda-titolo"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
            >
              <span>Storico — ultimi 7 giorni ({concluse.length})</span>
              {piuVecchie > 0 && (
                <a className="btn small btn-secondario" href="/operazioni/archivio">
                  Archivio ({piuVecchie} più vecchie) →
                </a>
              )}
            </div>
            {concluse.length === 0 ? (
              <div className="vuoto-mini">Niente negli ultimi 7 giorni.</div>
            ) : (
              <ul className="storia">{concluse.map((o) => riga(o))}</ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
