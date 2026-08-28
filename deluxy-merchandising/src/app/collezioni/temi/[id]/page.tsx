import { notFound } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { TornaIndietro } from "@/components/TornaIndietro";
import { Badge } from "@/components/Badge";
import { Miniatura } from "@/components/Miniatura";
import { prisma } from "@/lib/db";
import { posizioniDa } from "@/lib/collezioni";
import { euro } from "@/lib/dominio";
import { etichettaRegola } from "@/lib/ordinamento-vetrina";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";
import { aggiungiCollezioniATema, eliminaTema, rinominaTema, togliCollezioneDaTema } from "@/lib/azioni-temi";

export const dynamic = "force-dynamic";

const MAX_SCELTA = 400;

// La scheda di un tema: quali collezioni ci stanno dentro, e quanto pesano.
export default async function TemaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();

  const t = await prisma.temaCollezioni.findUnique({
    where: { id },
    include: {
      collezioni: {
        orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
        select: {
          id: true,
          titolo: true,
          negozio: true,
          immagine: true,
          // Lo **stato**: le stesse cose che si leggono in Visual, perché da qui
          // si decide su cosa lavorare e una collezione sospesa o automatica non
          // si tratta come una manuale in vetrina.
          tipo: true,
          stato: true,
          pubblicataShopify: true,
          posizioni: true,
          regolaOrdinamento: true,
          ordineModificatoIl: true,
          ordineSpintoIl: true,
          regolaOrdine: { select: { nome: true, aggiornataIl: true } },
          tipologia: { select: { nome: true } },
          prodotti: { select: { prodottoId: true } },
        },
      },
    },
  });
  if (!t) notFound();

  const dentro = new Set(t.collezioni.map((c) => c.id));
  // Le candidate: **solo quelle che non ci sono già**, e filtrabili per nome
  // perché sono 343. Un menu con tutte dentro rende impossibile trovare quella
  // che si cerca.
  const candidate = await prisma.collezioneShopify.findMany({
    where: {
      id: { notIn: [...dentro] },
      ...(q ? { titolo: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
    take: MAX_SCELTA,
    select: { id: true, titolo: true, negozio: true },
  });

  const f = finestra(90);
  const vendite = t.collezioni.length
    ? await prisma.vendita.groupBy({
        by: ["prodottoId"],
        where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE },
        _sum: { ricavo: true },
      })
    : [];
  const vp = new Map(vendite.filter((v) => v.prodottoId).map((v) => [v.prodottoId as string, v._sum.ricavo ?? 0]));

  const prodottiDistinti = new Set<string>();
  for (const c of t.collezioni) for (const p of c.prodotti) prodottiDistinti.add(p.prodottoId);
  let ricavoTema = 0;
  for (const x of prodottiDistinti) ricavoTema += vp.get(x) ?? 0;

  return (
    <div className="layout">
      <Sidebar attiva="collezioni" />
      <main className="main" style={{ maxWidth: 980 }}>
        {/* «Il ritorno al punto esatto» (Libro v1.5 §2): la history conserva
            i filtri dell'elenco; l'URL nudo è solo il ripiego da link diretto. */}
        <TornaIndietro fallback="/collezioni/temi" label="Temi" />
        <div className="page-head">
          <div>
            <h1 className="page-title">{t.nome}</h1>
            <p className="page-sub">
              {t.collezioni.length === 0 ? (
                <>Nessuna collezione assegnata: il tema esiste ma non tiene ancora insieme niente.</>
              ) : (
                <>
                  <b>{t.collezioni.length}</b> collezioni · <b>{prodottiDistinti.size}</b> prodotti distinti ·{" "}
                  <b>{euro(ricavoTema)}</b> negli ultimi 90 giorni
                </>
              )}
              {t.descrizione ? ` · ${t.descrizione}` : ""}
            </p>
          </div>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Aggiungi collezioni</div>
          {/* La ricerca è un form a parte (GET): serve a restringere la scelta
              fra 343 collezioni prima di selezionarle. */}
          <form method="get" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Cerca una collezione per nome…" style={{ minWidth: 280 }} />
            <button type="submit" className="btn btn-secondario">Cerca</button>
            {q && <Link className="btn btn-secondario" href={`/collezioni/temi/${t.id}`}>Azzera</Link>}
          </form>
          {candidate.length === 0 ? (
            <div className="vuoto-mini">
              {q ? `Nessuna collezione fuori dal tema risponde a «${sp.q}».` : "Tutte le collezioni sono già in questo tema."}
            </div>
          ) : (
            <form action={aggiungiCollezioniATema.bind(null, t.id)} style={{ display: "grid", gap: 10 }}>
              <select name="collezioneId" multiple size={Math.min(12, candidate.length)} style={{ minWidth: 380 }} aria-label="Collezioni">
                {candidate.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titolo} — {c.negozio}
                  </option>
                ))}
              </select>
              <div>
                <button type="submit" className="btn btn-primario">Aggiungi al tema</button>
              </div>
            </form>
          )}
          <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            Le collezioni scelte <b>si aggiungono</b> a quelle già nel tema, non le sostituiscono
            {candidate.length >= MAX_SCELTA ? `. Mostrate le prime ${MAX_SCELTA}: restringi con la ricerca` : ""}.
          </p>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Collezioni nel tema ({t.collezioni.length})</div>
          {t.collezioni.length === 0 ? (
            <div className="vuoto-mini">Nessuna ancora. Scegline qui sopra.</div>
          ) : (
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Collezione</th>
                    <th>Stato</th>
                    <th>Ordine</th>
                    <th className="num">Prodotti</th>
                    <th className="num">Venduto 90gg</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {t.collezioni.map((c) => {
                    const ricavo = c.prodotti.reduce((s, p) => s + (vp.get(p.prodottoId) ?? 0), 0);
                    const posizioni = posizioniDa(c.posizioni);
                    const daSincronizzare =
                      c.ordineModificatoIl != null &&
                      (c.ordineSpintoIl == null || c.ordineModificatoIl > c.ordineSpintoIl);
                    const regolaPiuRecente =
                      c.regolaOrdine != null &&
                      (c.ordineModificatoIl == null || c.ordineModificatoIl < c.regolaOrdine.aggiornataIl);
                    return (
                      <tr key={c.id} className="riga-cliccabile">
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Miniatura url={c.immagine} />
                            <span>
                              <Link href={`/visual/${c.id}`} className="cella-nome link-riga">{c.titolo}</Link>
                              <div className="cella-sub">{c.negozio}</div>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Badge
                              testo={c.tipo === "automatica" ? "Automatica" : "Manuale"}
                              colore={c.tipo === "automatica" ? "var(--blue)" : "var(--green)"}
                              title={
                                c.tipo === "automatica"
                                  ? "Chi ci sta dentro lo decide una regola di Shopify: non si riordina a mano."
                                  : "Si può riordinare e mandare l'ordine al negozio."
                              }
                            />
                            {!c.pubblicataShopify && <Badge testo="Non pubblicata" colore="var(--text-tertiary)" />}
                            {c.stato === "sospesa" && <Badge testo="Sospesa" colore="var(--orange)" />}
                            {posizioni.includes("vetrina") && <Badge testo="In vetrina" colore="var(--gold)" />}
                            {c.tipologia && <Badge testo={c.tipologia.nome} colore="var(--purple, #5B4FC7)" />}
                            {daSincronizzare && <Badge testo="Da sincronizzare" colore="var(--orange)" />}
                            {regolaPiuRecente && <span className="pill-ritardo">Ordine da rifare</span>}
                          </div>
                        </td>
                        <td>
                          <span className="cella-sub">
                            {c.regolaOrdine ? c.regolaOrdine.nome : etichettaRegola(c.regolaOrdinamento)}
                          </span>
                        </td>
                        <td className="num">{c.prodotti.length}</td>
                        <td className="num">{ricavo > 0 ? euro(ricavo) : "—"}</td>
                        <td>
                          {/* Togliere dal tema non tocca la collezione: sparisce
                              l'etichetta, restano ordine, tipologia e prodotti. */}
                          <form action={togliCollezioneDaTema.bind(null, t.id, c.id)} style={{ position: "relative", zIndex: 1 }}>
                            <button className="icon-btn" title="Togli dal tema" type="submit">×</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Nome e descrizione</div>
          <form action={rinominaTema.bind(null, t.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="nome" defaultValue={t.nome} required style={{ minWidth: 260 }} />
            <input name="descrizione" defaultValue={t.descrizione ?? ""} placeholder="A cosa serve" style={{ minWidth: 280 }} />
            <button type="submit" className="btn btn-secondario">Salva</button>
          </form>
          <form action={eliminaTema.bind(null, t.id)} style={{ marginTop: 14 }}>
            <button type="submit" className="btn btn-secondario">Elimina il tema</button>
            <span className="page-sub" style={{ marginLeft: 10 }}>
              <b>Le collezioni non si toccano</b>: sparisce l&apos;etichetta, restano ordine, tipologia e prodotti.
            </span>
          </form>
        </div>
      </main>
    </div>
  );
}
