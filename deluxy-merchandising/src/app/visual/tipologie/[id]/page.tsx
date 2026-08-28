import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TornaIndietro } from "@/components/TornaIndietro";
import { SelettoreCriteri } from "@/components/SelettoreCriteri";
import { SelettoreRegole } from "@/components/SelettoreRegole";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/dominio";
import {
  descriviCriteri,
  filtroCriteri,
  parseCriteri,
  quantiCriteri,
  vociDisponibili,
} from "@/lib/criteri-tipologia";
import { etichettaRegola, ordinaProdotti, parseRegole } from "@/lib/ordinamento-vetrina";
import {
  aggiornaCriteriTipologia,
  aggiornaTipologia,
  applicaTipologiaAlleSueCollezioni,
  assegnaCollezioniATipologia,
  eliminaTipologia,
} from "@/lib/azioni-tipologie";

export const dynamic = "force-dynamic";

const MAX_ANTEPRIMA = 60;

export default async function SchedaTipologiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.tipologiaCollezione.findUnique({
    where: { id },
    include: { collezioni: { select: { id: true, titolo: true, negozio: true } } },
  });
  if (!t) notFound();

  const criteri = parseCriteri(t.criteri);
  const regole = parseRegole(t.regolaOrdinamento);
  const [voci, dove] = await Promise.all([vociDisponibili(), filtroCriteri(criteri)]);

  // I prodotti che rientrano, già ordinati come dicono le regole: è l'anteprima
  // di quello che si sta decidendo, non un elenco a caso.
  const totale = dove ? await prisma.prodotto.count({ where: dove }) : 0;
  const grezzi = dove
    ? await prisma.prodotto.findMany({
        where: dove,
        select: {
          id: true,
          nome: true,
          codice: true,
          prezzoVendita: true,
          costoProduzione: true,
          creatoIl: true,
          tipoShopify: true,
          vendorShopify: true,
        },
      })
    : [];
  const ordinati = await ordinaProdotti(
    grezzi.map((p) => ({
      prodottoId: p.id,
      nome: p.nome,
      prezzoVendita: p.prezzoVendita,
      costoProduzione: p.costoProduzione,
      creatoIl: p.creatoIl,
      codice: p.codice,
      tipoShopify: p.tipoShopify,
      vendorShopify: p.vendorShopify,
    })),
    regole
  );
  const anteprima = ordinati.slice(0, MAX_ANTEPRIMA);

  const pubblicate = await prisma.collezioneShopify.findMany({
    where: { pubblicataShopify: true },
    orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
    select: { id: true, titolo: true, negozio: true, tipologiaId: true },
  });

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 1000 }}>
        {/* «Il ritorno al punto esatto» (Libro v1.5 §2): la history conserva
            i filtri dell'elenco; l'URL nudo è solo il ripiego da link diretto. */}
        <TornaIndietro fallback="/visual/tipologie" label="Tipologie" />
        <div className="page-head">
          <div>
            <h1 className="page-title">{t.nome}</h1>
            <p className="page-sub">
              {t.descrizione ? `${t.descrizione} · ` : ""}
              {descriviCriteri(criteri, voci)}
            </p>
          </div>
        </div>

        {/* 1. Cosa ha preso: il conto viene prima di tutto, perché è la verifica
            che i criteri dicano quello che si pensava. */}
        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore" style={{ color: quantiCriteri(criteri) === 0 ? "var(--orange)" : undefined }}>
              {quantiCriteri(criteri) === 0 ? "—" : totale}
            </div>
            <div className="kpi-etichetta">Prodotti in questa tipologia</div>
            <div className="kpi-sotto">
              {quantiCriteri(criteri) === 0
                ? "nessun criterio impostato: non seleziona niente"
                : `su ${quantiCriteri(criteri)} criteri`}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{etichettaRegola(t.regolaOrdinamento)}</div>
            <div className="kpi-etichetta">Ordine</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{t.collezioni.length}</div>
            <div className="kpi-etichetta">Collezioni collegate</div>
            <div className="kpi-sotto">dove l&apos;ordine viene applicato</div>
          </div>
        </div>

        {/* 2. La priorità: si sceglie dopo aver visto cosa è stato preso. */}
        <div className="scheda">
          <div className="scheda-titolo">Priorità d&apos;ordine</div>
          <form action={aggiornaTipologia.bind(null, id)} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
            <SelettoreRegole valore={t.regolaOrdinamento} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn">Salva la priorità</button>
            </div>
          </form>
        </div>

        {/* 3. L'anteprima nell'ordine deciso. */}
        <div className="scheda">
          <div className="scheda-titolo">
            I prodotti, nell&apos;ordine{regole.length > 0 ? ` · ${etichettaRegola(t.regolaOrdinamento)}` : ""}
          </div>
          {quantiCriteri(criteri) === 0 ? (
            <div className="vuoto-mini">
              Nessun criterio impostato: scegli qui sotto cosa rende un prodotto «{t.nome}».
            </div>
          ) : totale === 0 ? (
            <div className="vuoto-mini">
              Nessun prodotto rispetta questi criteri. Prova ad allargarli: i criteri valgono tutti insieme.
            </div>
          ) : (
            <>
              <div className="tabella-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Prodotto</th>
                      <th>Tipo</th>
                      <th>Fornitore</th>
                      <th className="num">Prezzo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anteprima.map((p, i) => (
                      <tr key={p.prodottoId} className="riga-cliccabile">
                        <td className="num">{i + 1}</td>
                        <td>
                          <a href={`/prodotti/${p.prodottoId}`} className="cella-nome link-riga">
                            {p.nome}
                          </a>
                          <div className="cella-sub">{p.codice}</div>
                        </td>
                        <td><span className="cella-sub">{p.tipoShopify ?? "—"}</span></td>
                        <td><span className="cella-sub">{p.vendorShopify ?? "—"}</span></td>
                        <td className="num">{p.prezzoVendita > 0 ? euro(p.prezzoVendita) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totale > anteprima.length && (
                <p className="page-sub" style={{ marginTop: 12 }}>
                  Mostrati i primi {anteprima.length} di {totale}: gli altri {totale - anteprima.length} rientrano
                  nella tipologia allo stesso modo.
                </p>
              )}
            </>
          )}
        </div>

        {/* 4. I criteri, modificabili. */}
        <form action={aggiornaCriteriTipologia.bind(null, id)}>
          <div className="scheda">
            <div className="scheda-titolo">Cosa rende un prodotto «{t.nome}»</div>
            <div className="modulo" style={{ gridTemplateColumns: "1fr 2fr", marginBottom: 6 }}>
              <div className="campo-modulo">
                <label>Nome</label>
                <input name="nome" defaultValue={t.nome} />
              </div>
              <div className="campo-modulo">
                <label>Descrizione</label>
                <input name="descrizione" defaultValue={t.descrizione ?? ""} />
              </div>
            </div>
            <SelettoreCriteri criteri={criteri} voci={voci} />
            <div className="azioni-modulo" style={{ marginTop: 14 }}>
              <button type="submit" className="btn">Salva i criteri</button>
            </div>
          </div>
        </form>

        {/* 5. Dove applicare l'ordine: le collezioni del negozio. */}
        <div className="scheda">
          <div className="scheda-titolo">Collezioni su cui applicare l&apos;ordine</div>
          <p className="page-sub" style={{ marginTop: 0 }}>
            La priorità qui sopra diventa l&apos;ordine dei prodotti dentro queste collezioni, e si riapplica da sola a
            ogni import.
          </p>
          {pubblicate.length === 0 ? (
            <p className="page-sub" style={{ margin: 0 }}>
              Nessuna collezione pubblicata: rifai l&apos;import da <a href="/collezioni">Collezioni</a>.
            </p>
          ) : (
            <form action={assegnaCollezioniATipologia} style={{ display: "grid", gap: 8, maxWidth: 520 }}>
              <input type="hidden" name="tipologiaId" value={id} />
              <select
                multiple
                name="collezioni"
                size={6}
                defaultValue={t.collezioni.map((c) => c.id)}
                style={{ font: "inherit", padding: 8, borderRadius: "var(--radius-m)", background: "var(--fill)", border: "1px solid transparent" }}
              >
                {pubblicate.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titolo} ({c.negozio}){c.tipologiaId && c.tipologiaId !== id ? " · già di un'altra" : ""}
                  </option>
                ))}
              </select>
              <div>
                <button type="submit" className="btn">Collega le collezioni scelte</button>
              </div>
            </form>
          )}
          {t.collezioni.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <form action={applicaTipologiaAlleSueCollezioni.bind(null, id)}>
                <button type="submit" className="btn btn-secondario">Riapplica l&apos;ordine ora</button>
              </form>
            </div>
          )}
        </div>

        <form action={eliminaTipologia.bind(null, id)} style={{ marginTop: 8 }}>
          <button type="submit" className="btn btn-secondario">Elimina questa tipologia</button>
        </form>
      </main>
    </div>
  );
}
