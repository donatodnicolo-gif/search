import { formattaEuro, formattaNumero } from "@/lib/dominio";

type Riga = {
  tipo: string;
  testo: string;
  idEsterno: string | null;
  annunci?: string | null;
  finalUrl?: string | null;
  spesa?: number | null;
  clic?: number | null;
  impressioni?: number | null;
  conversioni?: number | null;
  incasso?: number | null;
};

// Il recap in due righe: quanti annunci ci sono, quanti sono in asta, dove
// mandano e come vanno. I testi completi restano in fondo alla pagina.
//
// ⚠️ Nessuna query: lavora sulle righe che la scheda ha già caricato. Un
// riassunto che costasse altre letture al database sarebbe un riassunto che
// rallenta la pagina che voleva rendere più leggibile.
export function RecapAnnunci({ righe }: { righe: Riga[] }) {
  const idDa = (v: string | null | undefined) =>
    /^[\d-]+:\d+:\d+$/.test(v ?? "") ? v!.split(":").pop()! : null;

  // Un annuncio per riga `destinazione` (dall'11/08 sono una per annuncio),
  // con i numeri presi dalla riga `annuncio` che porta lo stesso id.
  const kpi = new Map<string, Riga>();
  for (const r of righe) {
    if (r.tipo !== "annuncio") continue;
    const id = idDa(r.idEsterno);
    if (id) kpi.set(id, r);
  }

  const annunci = new Map<string, { url: string | null; stato: string | null; completo: string | null }>();
  for (const r of righe) {
    if (r.tipo !== "destinazione") continue;
    const id = idDa(r.idEsterno);
    if (!id) continue;
    const stato = (r.annunci ?? "").split(",")[0]?.split(":")[1] ?? null;
    annunci.set(id, { url: r.finalUrl ?? r.testo ?? null, stato, completo: r.idEsterno ?? null });
  }
  if (annunci.size === 0) return null;

  const elenco = [...annunci.entries()]
    .map(([id, v]) => ({ id, ...v, n: kpi.get(id) }))
    .sort((a, b) => {
      // Prima gli attivi, poi chi spende di più: è l'ordine in cui si guardano.
      const pa = a.stato === "ENABLED" ? 0 : 1;
      const pb = b.stato === "ENABLED" ? 0 : 1;
      return pa - pb || (b.n?.spesa ?? 0) - (a.n?.spesa ?? 0);
    });
  const attivi = elenco.filter((a) => a.stato === "ENABLED").length;
  const landing = [...new Set(elenco.map((a) => a.url).filter(Boolean))] as string[];

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Annunci ({elenco.length}) · {attivi} in asta
      </div>
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        Il riassunto: chi è in asta, quanto spende e dove manda.{" "}
        <a href="#annunci" style={{ color: "var(--blue)" }}>I testi completi stanno in fondo</a>.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Annuncio</th>
              <th>Dove manda</th>
              <th className="num">Spesa</th>
              <th className="num">Clic</th>
              <th className="num">CTR</th>
              <th className="num">Conv.</th>
              <th className="num">Resa</th>
            </tr>
          </thead>
          <tbody>
            {elenco.map((a, i) => {
              const n = a.n;
              const spesa = n?.spesa ?? 0;
              const incasso = n?.incasso ?? 0;
              const resa = spesa > 0 ? incasso / spesa : null;
              const ctr =
                (n?.impressioni ?? 0) > 0 ? ((n?.clic ?? 0) / (n!.impressioni ?? 1)) * 100 : null;
              return (
                <tr key={a.id}>
                  <td>
                    {/* Si clicca e si apre come va per finestra (7g, mese,
                        30g, anno): il numero in riga è una finestra sola. */}
                    <button
                      type="button"
                      data-ann-dettaglio
                      data-kw-id={a.completo ?? ""}
                      data-kw-testo={`Annuncio ${i + 1}`}
                      title="Apri le prestazioni di questo annuncio per finestra"
                      style={{ background: "none", border: 0, padding: 0, font: "inherit", fontWeight: 700, cursor: "pointer", textAlign: "left" }}
                    >
                      Annuncio {i + 1}
                    </button>
                    <div className="cella-sub" style={{ color: a.stato === "ENABLED" ? "var(--green)" : undefined }}>
                      {a.stato === "ENABLED" ? "attivo" : a.stato === "PAUSED" ? "in pausa" : "stato non letto"}
                    </div>
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 260 }}>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", overflowWrap: "anywhere" }}>
                        {a.url.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">{spesa > 0 ? formattaEuro(spesa) : "—"}</td>
                  <td className="num cella-muta">{(n?.clic ?? 0) > 0 ? formattaNumero(n!.clic) : "—"}</td>
                  <td className="num cella-muta">{ctr != null ? `${ctr.toFixed(1)}%` : "—"}</td>
                  <td className="num">{(n?.conversioni ?? 0) > 0 ? formattaNumero(n!.conversioni) : "—"}</td>
                  <td
                    className="num"
                    style={{ fontWeight: 600, color: resa == null ? undefined : resa >= 3 ? "var(--green)" : resa < 1 ? "var(--red)" : undefined }}
                  >
                    {resa != null ? `${resa.toFixed(1)}×` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {landing.length > 1 && (
        <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
          Gli annunci di questo gruppo mandano a <b>{landing.length} pagine diverse</b>: se non è
          voluto, è una delle cose che spiega una resa disomogenea fra annunci simili.
        </p>
      )}
    </section>
  );
}
