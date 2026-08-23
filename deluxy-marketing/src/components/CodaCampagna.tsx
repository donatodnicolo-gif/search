import { prisma } from "@/lib/db";
import { formattaDataOra } from "@/lib/dominio";

const ETICHETTA_TIPO: Record<string, string> = {
  pausa_campagna: "Metti in pausa la campagna",
  attiva_campagna: "Riattiva la campagna",
  nuova_campagna: "Crea la campagna",
  budget: "Cambia budget",
  pausa_keyword: "Metti in pausa la keyword",
  attiva_keyword: "Riattiva la keyword",
  nuova_keyword: "Aggiungi la keyword",
  negativa: "Aggiungi negativa",
  pausa_gruppo: "Metti in pausa il gruppo",
  attiva_gruppo: "Riattiva il gruppo",
  nuovo_annuncio: "Crea un annuncio",
  localita: "Cambia le localita' della campagna",
  estensione: "Aggiungi un'estensione",
  completa_campagna: "Completa la campagna",
};

// Cosa sta per succedere su Google PER QUESTA CAMPAGNA: le operazioni in
// coda, in evidenza sulla scheda.
//
// ⚠️ Prima c'erano solo mescolate allo storico «Ultime modifiche», in fondo
// alla pagina, insieme a quelle vecchie e annullate: per sapere se una
// campagna aveva qualcosa in attesa bisognava andare in /operazioni e
// cercarla fra tutte. Qui ci sono solo le VIVE — da approvare o approvate —
// perché sono le uniche su cui si può ancora fare qualcosa.
export async function CodaCampagna({
  campagnaId,
  gruppoId,
  ritorno,
}: {
  // Una delle due: la coda di una campagna, o quella di un singolo gruppo.
  campagnaId?: string;
  // ⚠️ Serve sulla scheda del GRUPPO: un annuncio nuovo o una pausa messi
  // in coda da li lasciavano la pagina identica a prima, e l app diceva
  // «messo in coda» senza che si vedesse niente. Un esito che non si vede
  // dove si e agito e indistinguibile da un bottone che non ha funzionato.
  gruppoId?: string;
  // Dove tornare dopo aver approvato: la coda lo riceve e mostra il bottone.
  ritorno: string;
}) {
  const inCoda = await prisma.operazioneAdv.findMany({
    where: {
      ...(gruppoId ? { gruppoId } : campagnaId ? { campagnaId } : {}),
      stato: { in: ["in_attesa", "approvata"] },
    },
    orderBy: { creataIl: "desc" },
    take: 12,
  });
  if (inCoda.length === 0) return null;

  const daApprovare = inCoda.filter((o) => o.stato === "in_attesa").length;
  const approvate = inCoda.length - daApprovare;
  const linkCoda = `/operazioni?torna=${encodeURIComponent(ritorno)}`;

  return (
    <section className="scheda">
      <div className="scheda-titolo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span>In coda ({inCoda.length})</span>
        <a className="btn small" href={linkCoda}>
          {daApprovare > 0 ? `Approva (${daApprovare})` : "Vai alla coda"}
        </a>
      </div>
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        {daApprovare > 0 && (
          <>
            <b>{daApprovare} da approvare</b>: finché non le approvi non parte niente.{" "}
          </>
        )}
        {approvate > 0 && (
          <>
            <b>{approvate} già approvate</b>, in attesa di chi le esegue: su Google lo script
            dentro l&apos;account (ogni notte, o ogni ora dove è schedulato), su Meta l&apos;app
            quando qualcuno preme <b>Esegui adesso</b> in Operazioni — lì non c&apos;è nessun
            automatismo.
          </>
        )}
      </p>
      <ul className="storia">
        {inCoda.map((o) => {
          const p = o.parametri ? (JSON.parse(o.parametri) as Record<string, unknown>) : {};
          const parola = typeof p.testo === "string" ? p.testo : null;
          return (
            <li key={o.id}>
              <span className="storia-data">{formattaDataOra(o.creataIl)}</span>
              <span className="storia-testo">
                <span
                  className="tag-salute"
                  style={{ color: o.stato === "in_attesa" ? "var(--orange)" : "var(--blue)", marginRight: 8 }}
                >
                  <span className="dot" />
                  {o.stato === "in_attesa" ? "da approvare" : "approvata"}
                </span>
                {ETICHETTA_TIPO[o.tipo] ?? o.tipo.split("_").join(" ")}
                {parola && <> «{parola}»</>}
                {p.budget != null && <> a {String(p.budget)} €/g</>}
                {/* Gli avvisi del guardrail viaggiano con l'operazione: chi
                    approva deve leggerli, e può essere un'altra persona un
                    altro giorno. */}
                {o.avvisi && <span className="cella-sub"> ⚠ {o.avvisi}</span>}
              </span>
              <span className="storia-autore">
                {o.richiestaDa === "regole-ai" ? "regole automatiche" : o.richiestaDa}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
