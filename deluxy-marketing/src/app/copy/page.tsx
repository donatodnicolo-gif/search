import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, formattaEuro, formattaNumero } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";

export const dynamic = "force-dynamic";

// Un gruppo di annunci si legge col break-even del suo brand, non con un numero
// buono per tutti: Gifts va in pari a 3,33 di ROAS, Cake a 2,0 (doc 10 §11).
function letturaRoas(roas: number | null, spesa: number, brand: string) {
  if (roas == null || spesa <= 0) {
    return { testo: "—", colore: "var(--text-tertiary)", spiega: "Nessuna spesa nel periodo" };
  }
  const be = breakEvenRoas(brand);
  if (roas >= be * 1.5) {
    return { testo: roas.toFixed(2) + "×", colore: "var(--green)", spiega: `Sopra il target (1,5× il break-even di ${be.toFixed(2)})` };
  }
  if (roas >= be) {
    return { testo: roas.toFixed(2) + "×", colore: "var(--blue)", spiega: `Sopra il break-even del brand (${be.toFixed(2)}), sotto il target` };
  }
  return { testo: roas.toFixed(2) + "×", colore: "var(--red)", spiega: `Sotto il break-even del brand (${be.toFixed(2)}): sta perdendo` };
}

// Copy & annunci: titoli e descrizioni RSA per campagna, con keyword e resa.
// Fonte: fogli "Flowers ADS Google" (+ENG) del Monitoraggio; regole di tono
// e claim nei Definitivi 7.2/7.3 su Drive.
export default async function PaginaCopy({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; campagna?: string; q?: string }>;
}) {
  const { brand, campagna, q } = await searchParams;
  const tutti = await prisma.copyAnnuncio.findMany({
    where: {
      tipo: { notIn: ["keyword", "gruppo"] },
      ...(brand ? { brand } : {}),
      ...(campagna ? { campagna } : {}),
      ...(q ? { testo: { contains: q } } : {}),
    },
    orderBy: [{ campagna: "asc" }, { tipo: "asc" }, { posizione: "asc" }],
  });
  // Gruppi di annunci (e gruppi di asset delle PMax): li manda lo script con
  // AZIONE = "gruppi", finestra ultimi 30 giorni.
  const gruppi = await prisma.copyAnnuncio.findMany({
    where: {
      tipo: "gruppo",
      ...(brand ? { brand } : {}),
      ...(campagna ? { campagna } : {}),
      ...(q ? { testo: { contains: q } } : {}),
    },
    orderBy: [{ spesa: "desc" }, { testo: "asc" }],
  });
  const campagne = await prisma.copyAnnuncio.groupBy({ by: ["campagna"], orderBy: { campagna: "asc" } });
  // Estensioni/asset: stanno su tre livelli (account, campagna, gruppo)
  const estensioni = await prisma.copyAnnuncio.findMany({
    where: { tipo: { in: ["sitelink", "callout", "snippet", "immagine"] } },
    orderBy: [{ livello: "asc" }, { tipo: "asc" }, { testo: "asc" }],
  });

  // raggruppa per campagna
  const perCampagna = new Map<string, typeof tutti>();
  for (const c of tutti) {
    if (!perCampagna.has(c.campagna)) perCampagna.set(c.campagna, []);
    perCampagna.get(c.campagna)!.push(c);
  }

  return (
    <div className="layout">
      <Sidebar attiva="copy" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Copy &amp; annunci</h1>
            <p className="page-sub">
              I testi degli annunci per campagna: titoli e descrizioni RSA con il conteggio dei
              caratteri (in rosso quelli fuori limite). Le keyword hanno una sezione dedicata; le
              regole di tono e claim vivono nei Definitivi (7.2 Tono di Voce, 7.3 Claim e Consegna).
            </p>
          </div>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca nel testo…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="campagna" defaultValue={campagna ?? ""}>
            <option value="">Tutte le campagne</option>
            {campagne.map((c) => (
              <option key={c.campagna} value={c.campagna}>{c.campagna}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {perCampagna.size === 0 && gruppi.length === 0 && (
          <div className="vuoto">Nessun copy: importare il Monitoraggio o depositare via API.</div>
        )}

        {gruppi.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Gruppi di annunci ({gruppi.length})</div>
            <p className="cella-sub" style={{ marginBottom: 12 }}>
              Quanto spende e quanto rende ogni gruppo, ultimi 30 giorni, come li manda lo
              script di Google Ads. Il ROAS è colorato sul break-even del brand (Gifts 3,33 ·
              Flowers 2,50 · Cake 2,00): verde sopra il target, blu in utile, rosso in perdita.
              Le Performance Max non hanno gruppi di annunci: al loro posto compaiono i gruppi
              di asset.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Gruppo</th>
                    <th>Stato</th>
                    <th style={{ textAlign: "right" }}>Spesa</th>
                    <th style={{ textAlign: "right" }}>Clic</th>
                    <th style={{ textAlign: "right" }}>Conv.</th>
                    <th style={{ textAlign: "right" }}>Incasso</th>
                    <th style={{ textAlign: "right" }}>ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {gruppi.map((g) => {
                    const spesa = g.spesa ?? 0;
                    const incasso = g.incasso ?? 0;
                    const roas = spesa > 0 ? incasso / spesa : null;
                    const lettura = letturaRoas(roas, spesa, g.brand);
                    return (
                      <tr key={g.id}>
                        <td style={{ maxWidth: 320 }}>
                          <div className="cella-nome">{g.testo}</div>
                          <div className="cella-sub">
                            {g.campagna}
                            {g.note ? ` · ${g.note}` : ""}
                          </div>
                        </td>
                        <td>
                          <Badge
                            testo={g.statoPiattaforma === "PAUSED" ? "in pausa" : "attivo"}
                            colore={g.statoPiattaforma === "PAUSED" ? "var(--orange)" : "var(--green)"}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>{formattaEuro(spesa)}</td>
                        <td style={{ textAlign: "right" }} className="cella-muta">{formattaNumero(g.clic)}</td>
                        <td style={{ textAlign: "right" }} className="cella-muta">{formattaNumero(g.conversioni)}</td>
                        <td style={{ textAlign: "right" }}>{formattaEuro(incasso)}</td>
                        <td style={{ textAlign: "right", color: lettura.colore, fontWeight: 600 }} title={lettura.spiega}>
                          {lettura.testo}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}


        {estensioni.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Estensioni e asset ({estensioni.length})</div>
            <p className="cella-sub" style={{ marginBottom: 12 }}>
              Sitelink, callout, snippet e immagini, con il livello a cui sono agganciati:
              account, campagna o gruppo di annunci. Un gruppo senza asset propri eredita
              quelli della campagna.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Tipo</th>
                    <th>Livello</th>
                    <th>Campagna / gruppo</th>
                    <th>Destinazione</th>
                  </tr>
                </thead>
                <tbody>
                  {estensioni.map((e) => (
                    <tr key={e.id}>
                      <td style={{ maxWidth: 280 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          {e.anteprima && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={e.anteprima} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flex: "0 0 auto" }} />
                          )}
                          <span style={{ minWidth: 0 }}>
                            <div className="cella-nome">{e.testo}</div>
                            {e.note && <div className="cella-sub" style={{ whiteSpace: "normal" }}>{e.note}</div>}
                          </span>
                        </div>
                      </td>
                      <td className="cella-muta">{e.tipo}</td>
                      <td>
                        <span className="tag-neutro">{e.livello ?? "—"}</span>
                      </td>
                      <td className="cella-muta">
                        {e.campagna}
                        {e.gruppo && <div className="cella-sub">{e.gruppo}</div>}
                      </td>
                      <td className="cella-muta" style={{ maxWidth: 240, overflowWrap: "anywhere" }}>
                        {e.finalUrl ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {[...perCampagna.entries()].map(([nomeCampagna, asset]) => {
          const titoli = asset.filter((a) => a.tipo === "titolo");
          const descrizioni = asset.filter((a) => a.tipo === "descrizione");
          const note = asset.filter((a) => a.tipo === "nota");
          const brandCampagna = asset[0]?.brand ?? "cross";
          return (
            <section className="scheda" key={nomeCampagna}>
              <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {nomeCampagna}
                <Badge testo={ETICHETTA_BRAND[brandCampagna] ?? brandCampagna} colore={COLORE_BRAND[brandCampagna] ?? "var(--text-tertiary)"} />
                {note.map((n) => (
                  <Badge key={n.id} testo={n.testo} colore="var(--green)" />
                ))}
                {asset[0]?.lingua && <span style={{ textTransform: "uppercase", color: "var(--text-tertiary)" }}>{asset[0].lingua}</span>}
              </div>
              <div>
                  {titoli.length > 0 && (
                    <>
                      <div className="cella-sub" style={{ marginBottom: 6 }}>TITOLI ({titoli.length}, max 30 caratteri)</div>
                      <ul className="storia">
                        {titoli.map((t) => (
                          <li key={t.id}>
                            <span className="storia-data">H{t.posizione}</span>
                            <span className="storia-testo">{t.testo} {t.rendimento && (
                              <span className="tag-salute" style={{ color: t.rendimento === 'BEST' ? 'var(--green)' : t.rendimento === 'GOOD' ? 'var(--blue)' : t.rendimento === 'LOW' ? 'var(--red)' : 'var(--text-tertiary)' }} title="Etichetta di rendimento assegnata da Google a questo asset">
                                <span className="dot" />
                                {t.rendimento}
                              </span>
                            )}</span>
                            <span className="storia-autore" style={(t.caratteri ?? 0) > 30 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                              {t.caratteri} car.
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {descrizioni.length > 0 && (
                    <>
                      <div className="cella-sub" style={{ margin: "14px 0 6px" }}>DESCRIZIONI ({descrizioni.length}, max 90 caratteri)</div>
                      <ul className="storia">
                        {descrizioni.map((d) => (
                          <li key={d.id}>
                            <span className="storia-data">D{d.posizione}</span>
                            <span className="storia-testo">{d.testo} {d.rendimento && (
                              <span className="tag-salute" style={{ color: d.rendimento === 'BEST' ? 'var(--green)' : d.rendimento === 'GOOD' ? 'var(--blue)' : d.rendimento === 'LOW' ? 'var(--red)' : 'var(--text-tertiary)' }} title="Etichetta di rendimento assegnata da Google a questo asset">
                                <span className="dot" />
                                {d.rendimento}
                              </span>
                            )}</span>
                            <span className="storia-autore" style={(d.caratteri ?? 0) > 90 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                              {d.caratteri} car.
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
