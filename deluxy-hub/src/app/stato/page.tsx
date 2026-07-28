import { richiediAdmin } from "@/lib/sessione-server";
import { statoServizi, type StatoServizio } from "@/lib/stato-servizi";

// Lo stato è una fotografia del momento: niente cache, si rilegge a ogni visita.
export const dynamic = "force-dynamic";
// I controlli hanno un timeout di 6 secondi ciascuno e girano in parallelo, ma
// con molte app la somma può superare il limite di default della piattaforma.
export const maxDuration = 60;

function BadgeServer({ s }: { s: StatoServizio }) {
  const su = s.server === "su";
  return (
    <span className={`badge ${su ? "green" : "red"}`}>
      <span className="dot" />
      {su ? "Server su" : "Server giù"}
    </span>
  );
}

function BadgeDatabase({ s }: { s: StatoServizio }) {
  if (s.database === "ok")
    return (
      <span className="badge green">
        <span className="dot" />
        Database ok
      </span>
    );
  if (s.database === "ko")
    return (
      <span className="badge red">
        <span className="dot" />
        Database ko
      </span>
    );
  // "n-d": l'app non espone ancora un health-check che provi il database.
  return (
    <span className="badge neutro">
      <span className="dot" />
      Database non verificato
    </span>
  );
}

export default async function StatoPage() {
  await richiediAdmin();
  const servizi = await statoServizi();

  const giu = servizi.filter((s) => s.server === "giu" || s.database === "ko");
  const daVerificare = servizi.filter((s) => s.server === "su" && s.database === "n-d");

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Stato servizi</h1>
        <p className="page-sub">
          Server e database di tutte le app Deluxy, controllati adesso. Ricarica la pagina per
          rifare il controllo.
        </p>
      </div>

      {giu.length > 0 ? (
        <div className="avviso errore" style={{ marginBottom: 24 }}>
          <strong>{giu.length === 1 ? "Un servizio ha un problema" : `${giu.length} servizi hanno un problema`}:</strong>{" "}
          {giu.map((s) => s.nome).join(", ")}.
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 24 }}>
          Tutti i servizi rispondono.
          {daVerificare.length > 0 && (
            <>
              {" "}
              Per {daVerificare.length}{" "}
              {daVerificare.length === 1 ? "app il database non è verificabile" : "app il database non è verificabile"}:
              manca l&apos;health-check.
            </>
          )}
        </div>
      )}

      <div className="stato-lista">
        {servizi.map((s) => (
          <div key={s.id} className="stato-riga">
            <div className="stato-nome">
              <div className="app-name">{s.nome}</div>
              <div className="app-role">{s.sottotitolo}</div>
            </div>

            <div className="stato-badge">
              <BadgeServer s={s} />
              <BadgeDatabase s={s} />
            </div>

            <div className="stato-note">
              {s.dettaglio && <div className="stato-dettaglio">{s.dettaglio}</div>}
              <a href={s.url} target="_blank" rel="noreferrer" className="app-open">
                {s.url.replace(/^https?:\/\//, "")}
              </a>
              {s.latenzaMs !== null && <span className="stato-latenza">{s.latenzaMs} ms</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
