import { Sidebar } from "@/components/Sidebar";
import { annullaOperazione, approvaOperazione } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { ETICHETTA_LIVELLO, formattaDataOra } from "@/lib/dominio";

export const dynamic = "force-dynamic";

const ETICHETTA_TIPO: Record<string, string> = {
  pausa_campagna: "Metti in pausa la campagna",
  attiva_campagna: "Riattiva la campagna",
  budget: "Cambia budget giornaliero",
  pausa_keyword: "Metti in pausa la keyword",
  attiva_keyword: "Riattiva la keyword",
  negativa: "Aggiungi keyword negativa",
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
export default async function PaginaOperazioni() {
  const operazioni = await prisma.operazioneAdv.findMany({
    orderBy: { creataIl: "desc" },
    take: 100,
  });
  const daApprovare = operazioni.filter((o) => o.stato === "in_attesa");
  const approvate = operazioni.filter((o) => o.stato === "approvata");
  const concluse = operazioni.filter((o) => ["eseguita", "fallita", "annullata"].includes(o.stato));

  const riga = (o: (typeof operazioni)[number], conAzioni: boolean) => {
    const p = o.parametri ? (JSON.parse(o.parametri) as Record<string, unknown>) : {};
    return (
      <li key={o.id}>
        <span className="storia-data">{formattaDataOra(o.creataIl)}</span>
        <span className="storia-testo">
          <b>{ETICHETTA_TIPO[o.tipo] ?? o.tipo}</b> — {o.bersaglio}
          {p.budget != null && <> → <b>{String(p.budget)} €/g</b></>}
          <span className="cella-sub" style={{ whiteSpace: "normal" }}>
            {o.prima ? `Prima: ${o.prima}. ` : ""}
            {o.motivo ?? ""}
            {o.esito ? ` · Esito: ${o.esito}` : ""}
          </span>
          {conAzioni && (
            <form className="pill-scelta" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={o.id} />
              <button className="pill-opt" formAction={approvaOperazione} style={{ color: "var(--green)" }}>
                <span className="dot" />
                <span style={{ color: "var(--text)" }}>Approva</span>
              </button>
              <button className="pill-opt" formAction={annullaOperazione} style={{ color: "var(--text-tertiary)" }}>
                <span className="dot" />
                <span style={{ color: "var(--text)" }}>Annulla</span>
              </button>
            </form>
          )}
        </span>
        <span className="storia-autore">
          <span className="tag-salute" style={{ color: COLORE_STATO[o.stato] }}>
            <span className="dot" />
            {ETICHETTA_STATO[o.stato] ?? o.stato}
          </span>
          <div className="cella-sub">{ETICHETTA_LIVELLO[o.livello] ?? o.livello}</div>
        </span>
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
            </p>
          </div>
        </div>

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
            <ul className="storia">{daApprovare.map((o) => riga(o, true))}</ul>
          )}
        </section>

        {approvate.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Approvate, in attesa dello script ({approvate.length})</div>
            <ul className="storia">{approvate.map((o) => riga(o, false))}</ul>
          </section>
        )}

        {concluse.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Storico</div>
            <ul className="storia">{concluse.map((o) => riga(o, false))}</ul>
          </section>
        )}
      </main>
    </div>
  );
}
