import { ETICHETTA_GIUDIZIO_GOOGLE, formattaEuro, GIUDIZI_GOOGLE } from "@/lib/dominio";
import { dinamico, etichettaFunzione, misuraTesto, oltreIlLimite, REGEX_FUNZIONE, spiegaDinamico } from "@/lib/funzioni-annuncio";

// Titoli e descrizioni come si vedono in Google Ads: una scheda per testo, con
// sotto il conteggio dei caratteri sul limite (21 / 30). È la stessa forma che
// si ha davanti quando si scrive l'annuncio, e serve a poter confrontare senza
// tradurre a mente da un elenco all'altro.
//
// ⚠️ Il conteggio in cima è **quanti ne esistono su quanti ne può mostrare un
// annuncio** (15 titoli, 4 descrizioni). Non è una percentuale di
// completamento: una campagna può avere trenta titoli diversi sparsi su più
// annunci e stare benissimo.
export type TestoAnnuncio = {
  id: string;
  tipo: string; // titolo | descrizione
  testo: string;
  caratteri: number | null;
  rendimento: string | null;
  // Gli ID degli annunci che usano questo testo, separati da virgola; ogni
  // voce può portare lo stato attaccato ("id:ENABLED", dall'11/08).
  annunci?: string | null;
  finalUrl?: string | null;
  // Sulle righe `destinazione`: account:gruppo:idAnnuncio — il legame
  // diretto con l'annuncio, perché la final URL è sua.
  idEsterno?: string | null;
};

// I numeri di un annuncio, dalla riga `tipo: "annuncio"` (idEsterno
// account:gruppo:idAnnuncio).
export type RigaMetricaAnnuncio = {
  idEsterno: string | null;
  spesa: number | null;
  clic: number | null;
  impressioni: number | null;
  conversioni: number | null;
  incasso: number | null;
  metricheGiorni?: number | null;
};

const LIMITE: Record<string, number> = { titolo: 30, descrizione: 90 };
const PER_ANNUNCIO: Record<string, number> = { titolo: 15, descrizione: 4 };

// ⚠️ Le funzioni di Google fra graffe stanno in `lib/funzioni-annuncio`: la
// stessa regola serve qui, nel dialogo del nuovo annuncio e nella validazione
// lato server. Tenerne tre copie le ha già fatte divergere una volta — il
// dialogo contava «{KeyWord:Fresh Flower Delivery}» come 31 caratteri e
// bloccava il bottone su un titolo che per Google ne ha 21.

/**
 * Il testo dell'annuncio con le GRAFFE che parlano: al posto del codice, una
 * pastiglia che dice che cosa Google ci metterà.
 *
 * ⚠️ Il taglio si fa scorrendo l'indice e non con uno `split`: le parti di
 * testo FRA due funzioni si perderebbero, e un titolo con due graffe è
 * normale.
 */
function conFunzioniParlanti(testo: string): React.ReactNode[] {
  const pezzi: React.ReactNode[] = [];
  const re = new RegExp(REGEX_FUNZIONE.source, "gi");
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(testo)) !== null) {
    if (m.index > ultimo) pezzi.push(testo.slice(ultimo, m.index));
    pezzi.push(
      <span className="ga-funzione" key={`f${n++}`} title={`Nel codice: ${m[0]}`}>
        {etichettaFunzione(m[0])}
      </span>
    );
    ultimo = m.index + m[0].length;
  }
  if (ultimo < testo.length) pezzi.push(testo.slice(ultimo));
  return pezzi.length > 0 ? pezzi : [testo];
}

function Gruppo({ titolo, tipo, testi }: { titolo: string; tipo: string; testi: TestoAnnuncio[] }) {
  if (testi.length === 0) return null;
  const limite = LIMITE[tipo] ?? 30;
  return (
    <div className="ga-blocco">
      <div className="ga-intestazione">
        {titolo} <span className="ga-conteggio">{testi.length}</span>
        <span className="ga-su">su {PER_ANNUNCIO[tipo] ?? 15} per annuncio</span>
      </div>
      {testi.map((t) => {
        const din = dinamico(t.testo);
        // ⚠️ Con una funzione dentro, il conteggio vero è quello RESO: un
        // «{KeyWord:testo di riserva}» vale quanto il testo di riserva, che è
        // ciò che Google mostra quando la parola cercata non ci sta.
        const misura = misuraTesto(t.testo);
        const lungo = oltreIlLimite(t.testo, limite);
        const giudizio =
          t.rendimento && GIUDIZI_GOOGLE.includes(t.rendimento)
            ? ETICHETTA_GIUDIZIO_GOOGLE[t.rendimento] ?? t.rendimento
            : null;
        return (
          <div className="ga-riga" key={t.id}>
            <div className={`ga-casella${lungo ? " oltre" : ""}`}>
              {din ? conFunzioniParlanti(t.testo) : t.testo}
            </div>
            <div className="ga-sotto">
              {giudizio && <span className="ga-giudizio">{giudizio}</span>}
              <span className={lungo ? "ga-caratteri oltre" : "ga-caratteri"}>
                {!din
                  ? `${t.caratteri ?? "?"} / ${limite}`
                  : misura.certa
                  ? `${misura.lunghezza} / ${limite}`
                  : "lunghezza variabile"}
              </span>
            </div>
            {/* La spiegazione sta sotto il testo, non in un tooltip: è la
                domanda che si fa chi lo vede per la prima volta, e un tooltip
                lo trova solo chi sospetta già che ci sia qualcosa da sapere. */}
            {/* La frase resta, ma sotto: la pastiglia dice COSA, questa dice
                COME funziona. Chi ha già capito la salta con l'occhio. */}
            {din && spiegaDinamico(t.testo) && (
              <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 2 }}>
                {spiegaDinamico(t.testo)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TestiAnnuncio({
  testi,
  destinazioni = [],
  destinazioniAltriGruppi = [],
  soloAttivi = false,
  linkTutti,
  linkAttivi,
  metricheAnnunci = [],
}: {
  testi: TestoAnnuncio[];
  // Le righe `tipo: "destinazione"` del gruppo: portano l'elenco degli
  // annunci che le usano, e da lì si scrive la landing sotto ogni colonna.
  destinazioni?: TestoAnnuncio[];
  // Le destinazioni degli ALTRI gruppi della campagna: servono a togliere
  // gli annunci che sono di casa altrove (vedi il recinto qui sotto).
  destinazioniAltriGruppi?: TestoAnnuncio[];
  // Mostrare solo gli annunci in asta: la scelta vive nell'URL della pagina
  // (`?ann=attivi`), così sopravvive a un salvataggio e al tasto indietro.
  soloAttivi?: boolean;
  // I due link del filtro, quando la pagina ne ha uno: qui non si conosce
  // l'indirizzo, lo passa chi ci monta il blocco.
  linkTutti?: string;
  linkAttivi?: string;
  // Le righe `tipo: "annuncio"`: i numeri di ogni annuncio nella finestra
  // del giro copy. Senza, le colonne dicono cosa è scritto ma non cosa rende.
  metricheAnnunci?: RigaMetricaAnnuncio[];
}) {
  const titoli = testi.filter((t) => t.tipo === "titolo");
  const descrizioni = testi.filter((t) => t.tipo === "descrizione");
  if (titoli.length === 0 && descrizioni.length === 0) return null;

  const giudicati = testi.filter((t) => t.rendimento && GIUDIZI_GOOGLE.includes(t.rendimento)).length;
  // Senza giudizio si ordina per lunghezza: è l'unica cosa azionabile rimasta.
  const perLunghezza = (a: TestoAnnuncio, b: TestoAnnuncio) => (b.caratteri ?? 0) - (a.caratteri ?? 0);

  // ⚠️ Un elenco di 39 titoli e 12 descrizioni non è quello che vede chi cerca:
  // quello che va in asta è **un annuncio**, con i suoi 15 titoli e le sue 4
  // descrizioni. Qui si rimettono insieme, una colonna per annuncio.
  //
  // Serve `annunci` (gli ID che usano ogni testo), che arriva dal giro `copy`
  // dello script aggiornato al 07/08/2026: finché non passa, quel campo è
  // vuoto e si mostra l'elenco unico DICENDO perché.
  const perAnnuncio = new Map<string, TestoAnnuncio[]>();
  // Lo STATO di ogni annuncio, quando la voce lo porta ("id:ENABLED", dallo
  // script aggiornato l'11/08): senza, le colonne non dicevano quale annuncio
  // è in asta e quale è fermo. Le voci vecchie (solo id) restano leggibili.
  const statoAnnuncio = new Map<string, string>();
  for (const t of testi) {
    for (const voce of (t.annunci ?? "").split(",").filter(Boolean)) {
      const [id, stato] = voce.split(":");
      if (!id) continue;
      if (stato && !statoAnnuncio.has(id)) statoAnnuncio.set(id, stato);
      const v = perAnnuncio.get(id) ?? [];
      v.push(t);
      perAnnuncio.set(id, v);
    }
  }
  // Dalle DESTINAZIONI (che sono per gruppo, non condivise): dove manda ogni
  // annuncio, il suo stato, e — quando ci sono — il RECINTO del gruppo.
  //
  // ⚠️ I testi sono CONDIVISI fra gruppi: le loro voci citano anche annunci
  // di ALTRI gruppi, e sulla scheda comparivano colonne e «attivi» che su
  // Google stanno altrove — misurato l'11/08: 4 attivi nell'app contro 1
  // Eligible su Google. Gli annunci delle destinazioni sono del gruppo:
  // quando l'elenco c'è, le colonne si limitano a quelli.
  const landingAnnuncio = new Map<string, string>();
  const annunciDelGruppo = new Set<string>();
  for (const d of destinazioni) {
    const url = d.finalUrl ?? d.testo;
    // ⚠️ Dal 11/08 la riga destinazione è UNA PER ANNUNCIO e l'id lo dice in
    // coda (account:gruppo:idAnnuncio): è il legame diretto, perché su Google
    // la final URL è dell'annuncio. L'elenco `annunci` resta letto per le
    // righe vecchie, accorpate per (gruppo, url).
    const idDaEsterno = /^[\d-]+:\d+:\d+$/.test(d.idEsterno ?? "")
      ? d.idEsterno!.split(":").pop()!
      : null;
    if (idDaEsterno) {
      annunciDelGruppo.add(idDaEsterno);
      if (url) landingAnnuncio.set(idDaEsterno, url);
    }
    for (const voce of (d.annunci ?? "").split(",").filter(Boolean)) {
      const [id, stato] = voce.split(":");
      if (!id) continue;
      annunciDelGruppo.add(id);
      if (stato && !statoAnnuncio.has(id)) statoAnnuncio.set(id, stato);
      if (url && !landingAnnuncio.has(id)) landingAnnuncio.set(id, url);
    }
  }

  // ⚠️ Il recinto si fa per ESCLUSIONE, non per inclusione. Le destinazioni
  // del gruppo conoscono solo gli annunci che hanno una URL propria — su
  // Torte per Oggi erano 2 su 6, e l'unico attivo restava fuori. Quelle
  // degli ALTRI gruppi invece dicono con certezza chi è di casa altrove: si
  // tolgono quelli, e restano gli annunci del gruppo. (Un annuncio assegnato
  // qui dalle nostre destinazioni non si toglie mai, anche se una riga
  // stantia lo cita altrove: la casa dichiarata dal gruppo vince.)
  // I numeri per annuncio, presi dall'id in coda (account:gruppo:idAnnuncio).
  const kpiAnnuncio = new Map<string, RigaMetricaAnnuncio>();
  for (const m of metricheAnnunci) {
    const id = (m.idEsterno ?? "").split(":").pop();
    if (id) kpiAnnuncio.set(id, m);
  }

  const annunciDiAltri = new Set<string>();
  for (const d of destinazioniAltriGruppi) {
    for (const voce of (d.annunci ?? "").split(",").filter(Boolean)) {
      const [id, stato] = voce.split(":");
      if (!id || annunciDelGruppo.has(id)) continue;
      annunciDiAltri.add(id);
      if (stato && !statoAnnuncio.has(id)) statoAnnuncio.set(id, stato);
    }
  }

  // Prima gli annunci IN ASTA (è quello che si guarda per primo), poi i più
  // ricchi: un annuncio con 15 titoli è quello completo, uno con 3 un residuo.
  const tuttiGliAnnunci = [...perAnnuncio.entries()]
    .filter(([id]) => !annunciDiAltri.has(id))
    .sort((a, b) => {
      const pesoA = statoAnnuncio.get(a[0]) === "ENABLED" ? 0 : 1;
      const pesoB = statoAnnuncio.get(b[0]) === "ENABLED" ? 0 : 1;
      return pesoA - pesoB || b[1].length - a[1].length;
    });
  const attivi = tuttiGliAnnunci.filter(([id]) => statoAnnuncio.get(id) === "ENABLED");
  // Il filtro non nasconde MAI tutto: se degli attivi non si sa niente
  // (script vecchio), «solo attivi» darebbe una pagina vuota che sembra un
  // guasto. In quel caso si mostrano tutti e la nota lo dice.
  const soloAttiviPossibile = attivi.length > 0;
  const annunci = soloAttivi && soloAttiviPossibile ? attivi : tuttiGliAnnunci;

  const nota =
    giudicati === 0 ? (
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        Google <b>non li giudica</b>: su questa campagna risponde «non applicabile» su tutti,
        quindi non c&apos;è un migliore e un peggiore da mostrare. Sotto ogni testo, i caratteri
        sul limite — in rosso quelli che Google troncherebbe.
      </p>
    ) : null;

  if (annunci.length === 0) {
    return (
      <>
        {nota}
        <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
          Questi sono <b>tutti i testi della campagna messi insieme</b>, non i singoli annunci:
          per dividerli serve sapere quale annuncio usa quale testo, e quel dato arriva col
          prossimo giro <code>AZIONE = &quot;copy&quot;</code> dello script.
        </p>
        <div className="ga-colonne">
          <Gruppo titolo="Titoli" tipo="titolo" testi={[...titoli].sort(perLunghezza)} />
          <Gruppo titolo="Descrizioni" tipo="descrizione" testi={[...descrizioni].sort(perLunghezza)} />
        </div>
      </>
    );
  }

  return (
    <>
      {nota}
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        Una colonna per <b>annuncio</b> ({annunci.length}): sono i testi che vanno in asta
        insieme. Lo stesso titolo può comparire in più annunci — è normale, ed è il motivo per
        cui la somma delle colonne è più grande del numero di testi diversi.
      </p>
      {linkTutti && linkAttivi && (
        <div className="pill-scelta" style={{ marginBottom: 12 }}>
          <a className={`pill-opt${soloAttivi && soloAttiviPossibile ? "" : " attuale"}`} href={linkTutti}>
            Tutti ({tuttiGliAnnunci.length})
          </a>
          <a
            className={`pill-opt${soloAttivi && soloAttiviPossibile ? " attuale" : ""}`}
            href={linkAttivi}
            title={soloAttiviPossibile ? "Solo gli annunci in asta adesso" : "Nessun annuncio risulta attivo: lo stato arriva col giro copy dello script aggiornato"}
          >
            Solo attivi ({attivi.length})
          </a>
        </div>
      )}
      {/* Le destinazioni del GRUPPO, quando i singoli annunci non hanno
          ancora la loro: dette come quello che sono — le pagine dove manda
          questo gruppo — invece di essere attribuite a caso a una colonna.
          Il legame annuncio → URL arriva col giro copy dello script
          aggiornato all'11/08. */}
      {destinazioni.length > 0 && annunci.some(([id]) => !landingAnnuncio.has(id)) && (
        <div className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
          <b>Dove manda questo gruppo:</b>{" "}
          {destinazioni.map((d, i) => {
            const url = d.finalUrl ?? d.testo;
            return (
              <span key={d.id}>
                {i > 0 && " · "}
                <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>
                  {url.replace(/^https?:\/\//, "")}
                </a>
              </span>
            );
          })}
          . Quale di queste usi ogni singolo annuncio l&apos;app non lo sa ancora: quel legame
          arriva col prossimo giro <code>copy</code> dello script aggiornato.
        </div>
      )}
      {soloAttivi && !soloAttiviPossibile && (
        <div className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
          Di nessuno di questi annunci si sa ancora se è attivo, quindi sono mostrati tutti: lo
          stato per annuncio arriva col giro <code>copy</code> dello script aggiornato all&apos;11/08.
        </div>
      )}
      <div className="ga-colonne">
        {annunci.map(([id, suoi], i) => {
          const stato = statoAnnuncio.get(id);
          return (
          <div key={id}>
            <div className="ga-annuncio" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Annuncio {i + 1}
              {/* ⚠️ «Attivo» = `ad_group_ad.status` ENABLED, cioè NON IN PAUSA.
                  NON vuol dire «in asta»: un annuncio rifiutato o limitato da
                  Google resta ENABLED e non esce lo stesso — è quello che è
                  successo alla WORLD-ENG (DESTINATION_NOT_WORKING). Il conto
                  degli annunci limitati o in revisione arriva dal giro
                  `approvazioni` ed è per campagna: sta nell'avviso in cima. */}
              {stato === "ENABLED" ? (
                <span
                  className="tag-salute"
                  style={{ color: "var(--green)" }}
                  title="Non è in pausa. Se Google l'ha rifiutato o limitato può non uscire lo stesso: vedi in cima quanti sono limitati o in revisione."
                >
                  <span className="dot" />attivo
                </span>
              ) : stato === "PAUSED" ? (
                <span className="tag-salute" style={{ color: "var(--ardesia)" }}>
                  <span className="dot" />in pausa
                </span>
              ) : (
                <span
                  className="cella-sub"
                  title="Lo stato per annuncio arriva col giro copy dello script aggiornato all'11/08: finché non passa, non si sa"
                >
                  stato non ancora letto
                </span>
              )}
            </div>
            {/* I numeri di QUESTO annuncio: quanto spende e cosa torna
                indietro. Senza, le colonne dicono cosa è scritto ma non cosa
                rende — e fra due annunci si sceglieva a occhio. */}
            {(() => {
              const k = kpiAnnuncio.get(id);
              if (!k) return null;
              const spesa = k.spesa ?? 0;
              const incasso = k.incasso ?? 0;
              const resa = spesa > 0 ? incasso / spesa : null;
              return (
                <div
                  className="cella-sub"
                  style={{ marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 8 }}
                  title={`Numeri di questo annuncio${k.metricheGiorni ? ` negli ultimi ${k.metricheGiorni} giorni` : ""}: ${k.impressioni ?? 0} comparse, ${k.clic ?? 0} clic, ${k.conversioni ?? 0} conversioni`}
                >
                  <span><b>{formattaEuro(spesa)}</b> spesi</span>
                  <span>{k.clic ?? 0} clic</span>
                  {/* Il CTR subito, non solo nel tooltip: fra due annunci
                      dello stesso gruppo è il primo numero che dice quale
                      testo funziona — la spesa dipende dall'asta, il CTR dal
                      testo. */}
                  {(k.impressioni ?? 0) > 0 && (
                    <span title={`${k.impressioni} comparse`}>
                      CTR {((((k.clic ?? 0) / (k.impressioni ?? 1)) * 100)).toFixed(1)}%
                    </span>
                  )}
                  {(k.conversioni ?? 0) > 0 && (
                    <span>
                      {Number.isInteger(k.conversioni) ? k.conversioni : (k.conversioni ?? 0).toFixed(1)} conv
                    </span>
                  )}
                  {incasso > 0 && (
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>
                      → {formattaEuro(incasso)}
                      {resa != null && ` · ${resa.toFixed(1).replace(".", ",")}×`}
                    </span>
                  )}
                  {/* ⚠️ DI CHE PERIODO SONO. Questi numeri hanno la finestra
                      fissa dello script (`GIORNI_COPY`, 30 giorni), mentre più
                      in alto la stessa pagina mostra numeri che seguono il
                      periodo scelto: due cifre diverse per la stessa cosa, e
                      nessuna delle due che dice a cosa si riferisce. Un numero
                      senza il suo periodo non è un numero, è un indovinello. */}
                  {k.metricheGiorni != null && (
                    <span style={{ color: "var(--text-tertiary)" }}>ultimi {k.metricheGiorni} giorni</span>
                  )}
                </div>
              );
            })()}
            {/* DOVE MANDA questo annuncio. Il legame preciso arriva dalle
                destinazioni; quando manca (l'annuncio condivide la URL con un
                altro e la riga è una sola) si mostra quella del GRUPPO,
                dichiarando che è del gruppo e non dell'annuncio: una landing
                probabile detta per quello che è vale più di un vuoto. */}
            {(() => {
              // ⚠️ SOLO la URL di QUESTO annuncio. C'era un ripiego sulla
              // destinazione del gruppo, ed era peggio del vuoto: sul primo
              // annuncio di Torte per Oggi mostrava «festa-della-mamma», che
              // è la landing di un altro annuncio (11/08). Una destinazione
              // probabile è indistinguibile da una vera, e qui si clicca.
              const url = landingAnnuncio.get(id);
              if (!url) {
                return (
                  <div
                    className="cella-sub"
                    style={{ marginBottom: 8 }}
                    title="Ogni annuncio ne ha una su Google: l'app la lega al singolo annuncio dal giro copy dello script aggiornato all'11/08"
                  >
                    destinazione non ancora letta per questo annuncio
                  </div>
                );
              }
              return (
                <div className="cella-sub" style={{ marginBottom: 8, overflowWrap: "anywhere" }}>
                  ↳{" "}
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--blue)" }}
                    title="La final URL di questo annuncio, come sta su Google"
                  >
                    {url.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              );
            })()}
            <Gruppo
              titolo="Titoli"
              tipo="titolo"
              testi={suoi.filter((t) => t.tipo === "titolo").sort(perLunghezza)}
            />
            <Gruppo
              titolo="Descrizioni"
              tipo="descrizione"
              testi={suoi.filter((t) => t.tipo === "descrizione").sort(perLunghezza)}
            />
          </div>
          );
        })}
      </div>
    </>
  );
}
