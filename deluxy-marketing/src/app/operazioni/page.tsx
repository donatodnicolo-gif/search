import { SelettoreStato } from "@/components/SelettoreStato";
import { ModificaTestoOperazione } from "@/components/ModificaTestoOperazione";
import { Sidebar } from "@/components/Sidebar";
import { annullaOperazione, approvaOperazione, cambiaCorrispondenzaOperazione, riapriOperazione,
  cambiaTestoOperazione,
} from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { ETICHETTA_LIVELLO, formattaDataOra } from "@/lib/dominio";

export const dynamic = "force-dynamic";

const ETICHETTA_TIPO: Record<string, string> = {
  pausa_campagna: "Metti in pausa la campagna",
  nuova_campagna: "Crea la campagna (nasce in pausa)",
  nuova_keyword: "Aggiungi la keyword",
  attiva_campagna: "Riattiva la campagna",
  budget: "Cambia budget giornaliero",
  pausa_keyword: "Metti in pausa la keyword",
  attiva_keyword: "Riattiva la keyword",
  negativa: "Aggiungi keyword negativa",
  pausa_gruppo: "Metti in pausa il gruppo di annunci",
  attiva_gruppo: "Riattiva il gruppo di annunci",
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
  approvata: "Approvata — in attesa dello script",
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
  searchParams: Promise<{ esito?: string; saltate?: string; avvisi?: string }>;
}) {
  const sp = await searchParams;
  const operazioni = await prisma.operazioneAdv.findMany({
    orderBy: { creataIl: "desc" },
    take: 100,
  });
  const daApprovare = operazioni.filter((o) => o.stato === "in_attesa");
  const approvate = operazioni.filter((o) => o.stato === "approvata");
  const concluse = operazioni.filter((o) => ["eseguita", "fallita", "annullata"].includes(o.stato));

  const riga = (o: (typeof operazioni)[number]) => {
    const p = o.parametri ? (JSON.parse(o.parametri) as Record<string, unknown>) : {};
    const parola = typeof p.testo === "string" && p.testo ? p.testo : null;
    const match = typeof p.corrispondenza === "string" ? String(p.corrispondenza).toLowerCase() : null;
    // Finché non è partita si può ancora ritoccare; dopo è storia.
    const modificabile = o.stato === "in_attesa" || o.stato === "approvata";
    const dettagli = [
      o.prima ? `prima: ${o.prima}` : null,
      o.motivo || null,
      o.esito ? `esito: ${o.esito}` : null,
    ].filter(Boolean);

    return (
      <li className="op-riga" key={o.id}>
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
          {(o.stato === "in_attesa" || o.stato === "approvata") && (
            <form className="pill-scelta op-comandi">
              <input type="hidden" name="id" value={o.id} />
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
          <span className="tag-salute" style={{ color: COLORE_STATO[o.stato] }}>
            <span className="dot" />
            {ETICHETTA_STATO[o.stato] ?? o.stato}
          </span>
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
              Le modifiche decise qui non partono da sole: restano in attesa finché non le approvi,
              poi è lo script di Google Ads a eseguirle e a riferire com&apos;è andata. Quando
              un&apos;operazione va a buon fine parte il blackout di 72 ore e nascono le verifiche.
              {" "}Sulle parole, la <b>corrispondenza</b> si cambia da qui finché l&apos;operazione non
              è partita: <b>esatta</b> blocca solo quella ricerca, <b>a frase</b> la sequenza di
              parole, <b>generica</b> ogni ricerca che le contenga in qualsiasi ordine — ed è quella
              che può spegnere una campagna per sbaglio.
            </p>
          </div>
        </div>

        {sp.esito && (
          <div className="avviso-ok">
            <strong>{sp.esito}</strong>
          </div>
        )}
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
            <ul className="storia">{daApprovare.map((o) => riga(o))}</ul>
          )}
        </section>

        {approvate.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Approvate, in attesa dello script ({approvate.length})</div>
            <ul className="storia">{approvate.map((o) => riga(o))}</ul>
          </section>
        )}

        {concluse.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Storico</div>
            <ul className="storia">{concluse.map((o) => riga(o))}</ul>
          </section>
        )}
      </main>
    </div>
  );
}
