import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { brandCorrente, negoziDelBrand, etichettaAmbito } from "@/lib/brand";
import { nomePosizione, posizioniDa } from "@/lib/collezioni";
import { euro, percentuale } from "@/lib/dominio";
import { etichettaRegola } from "@/lib/ordinamento-vetrina";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";
import { etichettaFrequenza, etichettaModo } from "@/lib/rotazione";
import { cambiaVetrina } from "@/lib/azioni-collezioni-shopify";

export const dynamic = "force-dynamic";

// I modi di mettere in fila le collezioni. «Novità» non c'è per un motivo
// dichiarato in pagina: Shopify **non dà una data di creazione** per le
// collezioni, e la nostra `creataIl` è il momento dell'import — ordinarci sopra
// darebbe una classifica che sembra vera e non lo è. «Ultima modifica» invece è
// il `updatedAt` vero del negozio.
const ORDINI = [
  { chiave: "venduto", nome: "Più vendute" },
  { chiave: "modifica", nome: "Ultima modifica sul negozio" },
  { chiave: "prodotti", nome: "Più prodotti" },
  { chiave: "nome", nome: "Nome" },
  { chiave: "vetrina", nome: "Prima quelle in vetrina" },
] as const;
type Ordine = (typeof ORDINI)[number]["chiave"];

export default async function VisualPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string; ordina?: string }>;
}) {
  const sp = await searchParams;
  const ordina: Ordine = (ORDINI.find((o) => o.chiave === sp.ordina)?.chiave ?? "venduto") as Ordine;

  const brand = await brandCorrente();
  const negozi = await negoziDelBrand(brand); // null = globale, [] = brand senza negozio
  const filtroNegozio = negozi ? { negozio: { in: negozi } } : {};
  const doveColl = { pubblicataShopify: true, ...filtroNegozio };

  const f = finestra(90);
  const [collezioni, totali, pianiBozza, venditePerProdotto] = await Promise.all([
    prisma.collezioneShopify.findMany({
      where: doveColl,
      include: {
        _count: { select: { prodotti: true } },
        tipologia: { select: { nome: true } },
        rotazione: { select: { nome: true, frequenza: true, modo: true, attiva: true } },
        prodotti: { select: { prodottoId: true } },
      },
    }),
    prisma.collezioneShopify.count({ where: filtroNegozio }),
    prisma.pianoRiordino.count({ where: { stato: "bozza" } }),
    // Il venduto della finestra in un colpo solo: si somma per collezione qui,
    // senza elencare gli id dei prodotti nella query.
    prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE, ...(brand ? { canale: brand } : {}) },
      _sum: { quantita: true, ricavo: true },
    }),
  ]);

  const vp = new Map(venditePerProdotto.filter((v) => v.prodottoId).map((v) => [v.prodottoId as string, v]));

  // Il venduto di ogni collezione e la sua **quota**: la quota si legge sul
  // totale delle collezioni in elenco, così le percentuali sommano a quello che
  // si vede e non a un totale invisibile.
  const righe = collezioni.map((c) => {
    let ricavo = 0;
    let pezzi = 0;
    for (const p of c.prodotti) {
      const v = vp.get(p.prodottoId);
      if (v) {
        ricavo += v._sum.ricavo ?? 0;
        pezzi += v._sum.quantita ?? 0;
      }
    }
    const posizioni = posizioniDa(c.posizioni);
    return {
      c,
      ricavo,
      pezzi,
      posizioni,
      inVetrina: posizioni.includes("vetrina"),
      daSincronizzare:
        c.ordineModificatoIl != null && (c.ordineSpintoIl == null || c.ordineModificatoIl > c.ordineSpintoIl),
    };
  });
  // **Il totale è il venduto vero del periodo, non la somma delle collezioni.**
  // Un prodotto sta in molte collezioni: sommandole si conta più volte lo stesso
  // incasso e viene fuori un numero molto più grande del fatturato — che letto di
  // sfuggita sembra il fatturato. La quota si legge quindi come «quanta parte del
  // venduto passa da questa collezione».
  const totaleRicavo = venditePerProdotto.reduce((s, v) => s + (v._sum.ricavo ?? 0), 0);
  const inVetrina = righe.filter((r) => r.inVetrina).length;

  righe.sort((a, b) => {
    switch (ordina) {
      case "modifica":
        return (b.c.aggiornataShopifyIl?.getTime() ?? 0) - (a.c.aggiornataShopifyIl?.getTime() ?? 0);
      case "prodotti":
        return b.c._count.prodotti - a.c._count.prodotti;
      case "nome":
        return a.c.titolo.localeCompare(b.c.titolo);
      case "vetrina":
        return Number(b.inVetrina) - Number(a.inVetrina) || b.ricavo - a.ricavo;
      default:
        return b.ricavo - a.ricavo;
    }
  });

  const dataIt = (d: Date | null) =>
    d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Visual merchandising{brand ? ` — ${etichettaAmbito(brand)}` : ""}</h1>
            <p className="page-sub">
              Le collezioni <b>pubblicate sul negozio</b>{brand ? <> del brand <b>{etichettaAmbito(brand)}</b></> : ""}: cosa
              sono, quanto vendono e in che ordine si presentano. Da ognuna scegli la regola d&apos;ordine e la mandi a
              Shopify.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn btn-secondario" href="/visual/tipologie">Tipologie & regole</Link>
            <Link className="btn btn-secondario" href="/visual/rotazioni">Rotazioni</Link>
            <Link className="btn btn-secondario" href="/riordini">
              Ipotesi di ordinativo{pianiBozza > 0 ? ` · ${pianiBozza} in bozza` : ""}
            </Link>
          </div>
        </div>

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        {righe.length === 0 ? (
          <div className="vuoto">
            <p>Nessuna collezione <b>pubblicata sul negozio</b> da mettere in scena.</p>
            <p className="page-sub" style={{ marginTop: 8 }}>
              {totali === 0
                ? "Non ci sono collezioni importate: importale da "
                : `Ci sono ${totali} collezioni importate ma nessuna risulta pubblicata sul negozio online. Lo stato di pubblicazione si legge rifacendo l'import da `}
              <Link href="/collezioni">Collezioni → Importa da Shopify</Link>.
            </p>
          </div>
        ) : (
          <>
            <div className="kpi-riga">
              <div className="kpi">
                <div className="kpi-valore">{righe.length}</div>
                <div className="kpi-etichetta">Collezioni in scena</div>
                <div className="kpi-sotto">pubblicate su {totali} importate</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore" style={{ color: inVetrina ? "var(--gold)" : "var(--text-tertiary)" }}>
                  {inVetrina}
                </div>
                <div className="kpi-etichetta">In vetrina</div>
                <div className="kpi-sotto">{inVetrina === 0 ? "nessuna ancora segnata" : "segnate da noi"}</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{euro(totaleRicavo)}</div>
                <div className="kpi-etichetta">Venduto 90 giorni</div>
                <div className="kpi-sotto">tutto il venduto del periodo, a buon fine</div>
              </div>
            </div>

            <FormOrdina ordina={ordina} />

            <div className="scheda">
              <div className="tabella-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}></th>
                      <th>Collezione</th>
                      <th>Caratteristiche</th>
                      <th className="num">Prodotti</th>
                      <th className="num">Venduto 90gg</th>
                      <th className="num">Quota</th>
                      <th>Ordine</th>
                      <th>Rotazione</th>
                      <th>Modificata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map((r) => (
                      <tr key={r.c.id} className="riga-cliccabile">
                        {/* Il bollino della vetrina si accende e si spegne da qui:
                            vederlo e non poterlo cambiare sarebbe mezza risposta. */}
                        <td>
                          <form action={cambiaVetrina.bind(null, r.c.id)} style={{ position: "relative", zIndex: 1 }}>
                            <button
                              type="submit"
                              className="icon-btn"
                              title={r.inVetrina ? "Togli dalla vetrina" : "Metti in vetrina"}
                              style={{ color: r.inVetrina ? "var(--gold)" : "var(--text-tertiary)", fontSize: 16 }}
                            >
                              {r.inVetrina ? "★" : "☆"}
                            </button>
                          </form>
                        </td>
                        <td>
                          <Link href={`/visual/${r.c.id}`} className="cella-nome link-riga">
                            {r.c.titolo}
                          </Link>
                          <div className="cella-sub">{r.c.negozio}</div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Pill
                              testo={r.inVetrina ? "In vetrina" : "Non in vetrina"}
                              colore={r.inVetrina ? "var(--gold)" : "var(--text-tertiary)"}
                            />
                            <Pill
                              testo={r.c.tipo === "automatica" ? "Automatica" : "Manuale"}
                              colore={r.c.tipo === "automatica" ? "var(--blue)" : "var(--green)"}
                            />
                            {r.c.stato === "sospesa" && <Pill testo="Sospesa" colore="var(--orange)" />}
                            {r.c.tipologia && <Pill testo={r.c.tipologia.nome} colore="var(--purple, #5B4FC7)" />}
                            {r.c.inCampagne && <Pill testo="In campagne" colore="var(--blue)" />}
                            {r.posizioni
                              .filter((p) => p !== "vetrina")
                              .map((p) => (
                                <Pill key={p} testo={nomePosizione(p)} colore="var(--text-tertiary)" />
                              ))}
                            {r.daSincronizzare && <Pill testo="Da sincronizzare" colore="var(--orange)" />}
                          </div>
                        </td>
                        <td className="num">{r.c._count.prodotti}</td>
                        <td className="num">{r.ricavo > 0 ? euro(r.ricavo) : "—"}</td>
                        <td className="num">
                          {totaleRicavo > 0 && r.ricavo > 0 ? percentuale(r.ricavo / totaleRicavo) : "—"}
                          {r.pezzi > 0 && <div className="cella-sub">{r.pezzi} pz</div>}
                        </td>
                        <td>
                          <span className="cella-sub">{etichettaRegola(r.c.regolaOrdinamento)}</span>
                        </td>
                        <td>
                          {r.c.rotazione ? (
                            <>
                              <Pill
                                testo={etichettaFrequenza(r.c.rotazione.frequenza)}
                                colore={r.c.rotazione.attiva ? "var(--green)" : "var(--text-tertiary)"}
                              />
                              <div className="cella-sub">
                                {r.c.rotazione.nome} · {etichettaModo(r.c.rotazione.modo)}
                                {r.c.rotazione.attiva ? "" : " · in pausa"}
                              </div>
                            </>
                          ) : (
                            <span className="cella-sub">—</span>
                          )}
                        </td>
                        <td>
                          <span className="cella-sub">{dataIt(r.c.aggiornataShopifyIl)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="page-sub" style={{ marginTop: 12 }}>
                La quota dice <b>quanta parte del venduto del periodo passa da quella collezione</b> (base: {euro(totaleRicavo)},
                tutto il venduto a buon fine). Un prodotto sta in più collezioni, quindi <b>le quote non sommano a
                100%</b>: sommarle conterebbe più volte lo stesso incasso.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** Pillola di caratteristica: si legge a colpo d'occhio senza aprire la scheda. */
function Pill({ testo, colore }: { testo: string; colore: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: colore,
        background: `color-mix(in srgb, ${colore} 12%, transparent)`,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {testo}
    </span>
  );
}

function FormOrdina({ ordina }: { ordina: Ordine }) {
  return (
    <form method="get" className="riga-azione" style={{ marginBottom: 14 }}>
      <label className="page-sub" style={{ margin: 0 }}>Ordina per</label>
      <select name="ordina" defaultValue={ordina} aria-label="Ordina le collezioni">
        {ORDINI.map((o) => (
          <option key={o.chiave} value={o.chiave}>
            {o.nome}
          </option>
        ))}
      </select>
      <button className="btn btn-secondario" type="submit">Applica</button>
      <span className="page-sub" style={{ margin: 0 }}>
        Shopify non dà una data di creazione per le collezioni: «novità» non si può ordinare senza inventarla, quindi
        c&apos;è «ultima modifica sul negozio», che è un dato vero.
      </span>
    </form>
  );
}
