import { annunciMeta } from "@/lib/meta-annunci";

// Gli ANNUNCI della campagna Meta, con le creatività: letti VIVI dalla Graph
// API quando si apre la scheda — nessuna copia in database. Si vedono TUTTI
// gli stati, comprese le PAUSED (è come nascono i nostri lanci).
//
// ⚠️ Le «bozze» di Ads Manager (mai pubblicate) non esistono per l'API:
// la sezione lo dice invece di far credere che non ci sia niente.

const ETICHETTA_FORMATO: Record<string, string> = {
  immagine: "Immagine",
  video: "Video",
  carosello: "Carosello",
  catalogo: "Catalogo",
  altro: "Altro",
};

export async function AnnunciMeta({ idCampagnaEsterno }: { idCampagnaEsterno: string }) {
  const esito = await annunciMeta(idCampagnaEsterno);

  return (
    <section className="scheda">
      <div className="scheda-titolo">Annunci su Meta (dal vivo)</div>
      {!esito.ok ? (
        <div className="vuoto-mini">Non riesco a leggerli adesso: {esito.errore}</div>
      ) : esito.annunci.length === 0 ? (
        <div className="vuoto-mini">
          Nessun annuncio su questa campagna. ⚠️ Le «bozze» di Ads Manager (mai pubblicate)
          non viaggiano nell&apos;API: se ne hai una lì, qui non può comparire finché non è
          pubblicata — anche solo in pausa.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {esito.annunci.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex", gap: 12, padding: 12,
                  border: "1px solid var(--hairline)", borderRadius: 12,
                  background: "var(--surface)",
                }}
              >
                {/* La miniatura è un URL firmato di Meta che SCADE: si mostra
                    e basta, mai salvarlo. */}
                {a.miniatura ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.miniatura}
                    alt=""
                    width={72}
                    height={72}
                    style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 8, background: "var(--fill)", flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cella-nome" style={{ whiteSpace: "normal", fontSize: 13 }}>{a.nome}</div>
                  <div className="card-campagna-tag" style={{ marginTop: 4 }}>
                    <span
                      className="tag-salute"
                      style={{ color: a.effettivo === "ACTIVE" ? "var(--green)" : a.stato === "PAUSED" ? "var(--orange)" : "var(--text-tertiary)" }}
                      title={`Stato ${a.stato} · effettivo ${a.effettivo}`}
                    >
                      <span className="dot" />
                      {a.effettivo === "ACTIVE" ? "Attivo" : a.stato === "PAUSED" ? "In pausa" : a.effettivo}
                    </span>
                    <span className="tag-neutro">
                      {ETICHETTA_FORMATO[a.formato]}
                      {a.schede ? ` · ${a.schede} schede` : ""}
                    </span>
                  </div>
                  {(a.titolo || a.testo) && (
                    <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 5 }}>
                      {a.titolo && <b>{a.titolo}</b>}
                      {a.titolo && a.testo && " — "}
                      {a.testo && (a.testo.length > 110 ? `${a.testo.slice(0, 110)}…` : a.testo)}
                    </div>
                  )}
                  {a.gruppo && <div className="cella-sub" style={{ marginTop: 3 }}>ad set: {a.gruppo}</div>}
                </div>
              </div>
            ))}
          </div>
          <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
            Letti adesso dalla Graph API, miniature comprese. ⚠️ Le «bozze» di Ads Manager mai
            pubblicate non sono nell&apos;API: qui compaiono gli annunci reali in ogni stato — anche
            in pausa, che è come nascono quelli lanciati dall&apos;app.
          </p>
        </>
      )}
    </section>
  );
}
