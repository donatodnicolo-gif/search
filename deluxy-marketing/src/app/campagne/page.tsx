import { redirect } from "next/navigation";
import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { VisteSalvate } from "@/components/VisteSalvate";
import { prisma } from "@/lib/db";
import { destinazionePredefinita } from "@/lib/viste";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_STATO_CAMPAGNA,
  formattaEuro,
  roas,
  STATI_CAMPAGNA,
  STATI_CAMPAGNA_IGNORATE,
  STATI_CAMPAGNA_VIVE,
  COLORE_STATO_CAMPAGNA,
  formattaData,
} from "@/lib/dominio";
import { categoriaCampagna, iconaCanale, saluteCampagna } from "@/lib/salute";
import { COLORE_CLASSE, ETICHETTA_CLASSE } from "@/lib/dominio";

export const dynamic = "force-dynamic";

const ORDINE_BRAND = ["flowers", "gifts", "cake", "cross"];
const ORDINE_CANALE = ["google_ads", "meta_ads", "tiktok", "email", "sito", "seo", "crm", "social", "altro"];

// Esplora campagne: una colonna per brand, una card per campagna con icona di
// canale e categoria, landing, budget, performance e stato di salute.
export default async function PaginaCampagne({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; canale?: string; brand?: string; q?: string; vista?: string }>;
}) {
  const p = await searchParams;
  // Pagina aperta nuda e c'è una vista predefinita: si va lì.
  const dove = await destinazionePredefinita("campagne", "/campagne", p);
  if (dove) redirect(dove);
  const { stato, canale, brand, q } = p;
  const giorni30 = new Date(Date.now() - 30 * 86_400_000);
  const campagne = await prisma.campagna.findMany({
    where: {
      // "Defunta" vuol dire non considerarla mai più: sparisce dall'elenco a
      // meno che non si chieda proprio lei col filtro di stato.
      ...(stato ? { stato } : { stato: { notIn: [...STATI_CAMPAGNA_IGNORATE] } }),
      ...(canale ? { canale } : {}),
      ...(brand ? { brand } : {}),
      ...(q ? { nome: { contains: q } } : {}),
    },
    include: {
      metriche: { where: { data: { gte: giorni30 } } },
      landing: { select: { id: true, url: true, stato: true } },
      _count: { select: { azioni: true } },
    },
  });

  // Le campagne che NON stanno girando, defunte comprese: è l'unico posto
  // dell'app dove le defunte compaiono senza doverle chiedere col filtro,
  // perché è la sezione fatta apposta per guardare indietro.
  //
  // La spesa storica resta la loro: "mai più" vale per l'operativo, non per la
  // contabilità — una campagna morta ha comunque speso soldi veri.
  const spente = await prisma.campagna.findMany({
    where: {
      stato: { notIn: [...STATI_CAMPAGNA_VIVE] },
      ...(canale ? { canale } : {}),
      ...(brand ? { brand } : {}),
      ...(q ? { nome: { contains: q } } : {}),
    },
    include: {
      metriche: { select: { spesa: true, ricavi: true, data: true } },
      _count: { select: { azioni: true } },
    },
    orderBy: [{ stato: "asc" }, { nome: "asc" }],
  });

  const brands = ORDINE_BRAND.filter((b) => campagne.some((c) => c.brand === b));

  return (
    <div className="layout">
      <Sidebar attiva="campagne" canaleAttivo={canale} brandAttivo={brand} />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Campagne{canale ? ` — ${ETICHETTA_CANALE[canale] ?? canale}` : ""}
            </h1>
            <p className="page-sub">
              Una colonna per brand. Ogni card mostra il canale e la categoria di prodotto con
              un&apos;icona, la landing di destinazione, il budget e come sta andando: performa,
              nella media, in apprendimento o critica.
            </p>
          </div>
          <a className="btn btn-secondario" href="/campagne/nuova">Censisci esistente</a>
          <a className="btn btn-secondario" href="/campagne/lancia">Lancia su Google Ads</a>
          <a className="btn" href="/campagne/crea">Crea da ciò che funziona</a>
        </div>

        <VisteSalvate pagina="campagne" base="/campagne" parametri={p} />

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca una campagna…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="canale" defaultValue={canale ?? ""}>
            <option value="">Tutti i canali</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="tiktok">TikTok</option>
          </select>
          <select name="stato" defaultValue={stato ?? ""}>
            <option value="">Tutti gli stati (tranne le defunte)</option>
            {STATI_CAMPAGNA.map((s) => (
              <option key={s} value={s}>{ETICHETTA_STATO_CAMPAGNA[s]}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {stato === "defunta" && (
          <div className="nota-info">
            <span className="nota-icona">⌁</span>
            <span>
              Stai guardando le campagne <b>defunte</b>: normalmente non compaiono da nessuna parte.
              La spesa che hanno fatto resta comunque nei totali — quei soldi sono usciti davvero.
            </span>
          </div>
        )}

        {campagne.length === 0 ? (
          <div className="vuoto">Nessuna campagna con questi filtri.</div>
        ) : (
          <div className="colonne-brand">
            {brands.map((brand) => {
              const del = campagne
                .filter((c) => c.brand === brand)
                .sort(
                  (a, b) =>
                    ORDINE_CANALE.indexOf(a.canale) - ORDINE_CANALE.indexOf(b.canale) ||
                    (b.budgetGiornaliero ?? 0) - (a.budgetGiornaliero ?? 0)
                );
              const budgetGiorno = del
                .filter((c) => c.stato === "attiva" || c.stato === "in_apprendimento")
                .reduce((s, c) => s + (c.budgetGiornaliero ?? 0), 0);
              let canalePrec = "";
              return (
                <div className="colonna-brand" key={brand}>
                  <div className="colonna-brand-testata">
                    <span className="board-titolo">
                      <span className="sb-dot" style={{ background: COLORE_BRAND[brand], width: 9, height: 9 }} />
                      {ETICHETTA_BRAND[brand]}
                    </span>
                    <span className="board-conta">
                      {del.length} · {formattaEuro(budgetGiorno)}/g
                    </span>
                  </div>
                  {del.map((c) => {
                    const spesa = c.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
                    const ricavi = c.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
                    const r = roas(ricavi, spesa);
                    const salute = saluteCampagna(c.stato, r, spesa, c.brand);
                    const categoria = categoriaCampagna(`${c.nome} ${c.landing?.url ?? ""} ${c.obiettivo ?? ""}`);
                    const nuovoCanale = c.canale !== canalePrec;
                    canalePrec = c.canale;
                    return (
                      <div key={c.id}>
                        {nuovoCanale && (
                          <div className="canale-divisore">
                            <Icona nome={iconaCanale(c.canale)} />
                            {ETICHETTA_CANALE[c.canale] ?? c.canale}
                          </div>
                        )}
                        <a className="card-campagna" href={`/campagne/${c.id}`}>
                          <div className="card-campagna-alto">
                            <span className="card-campagna-icona" title={categoria.nome}>
                              <Icona nome={categoria.icona} />
                            </span>
                            <span className="card-campagna-nome">{c.nome}</span>
                          </div>
                          <div className="card-campagna-tag">
                            <span className="tag-salute" style={{ color: salute.colore }} title={salute.spiega}>
                              <span className="dot" />
                              {salute.etichetta}
                            </span>
                            <span className="tag-neutro">{categoria.nome}</span>
                            {c.classe !== "standard" && (
                              <span className="tag-salute" style={{ color: COLORE_CLASSE[c.classe] }} title={c.classe === "traino" ? "Campagna protetta (doc 11): modifiche solo con change control" : "Campagna sperimentale"}>
                                <span className="dot" />
                                {c.classe === "traino" ? "🛡 Traino" : ETICHETTA_CLASSE[c.classe]}
                              </span>
                            )}
                          </div>
                          {c.obiettivo && <div className="card-campagna-obiettivo">◎ {c.obiettivo}</div>}
                          {c.landing && (
                            <div
                              className="card-campagna-landing"
                              style={c.landing.stato === "mismatch" ? { color: "var(--orange)" } : undefined}
                              title={c.landing.url}
                            >
                              ↳ {c.landing.url.replace(/^[^/]+/, "") || "/"}
                              {c.landing.stato === "mismatch" ? " · mismatch" : ""}
                            </div>
                          )}
                          <div className="card-campagna-kpi">
                            <span>
                              <b>{c.budgetGiornaliero != null ? `${formattaEuro(c.budgetGiornaliero)}/g` : "—"}</b>
                              <i>budget</i>
                            </span>
                            <span>
                              <b>{spesa > 0 ? formattaEuro(spesa) : "—"}</b>
                              <i>spesa 30g</i>
                            </span>
                            <span>
                              <b style={r != null ? { color: salute.colore } : undefined}>
                                {r != null ? `${r.toFixed(1)}×` : "—"}
                              </b>
                              <i>ROAS</i>
                            </span>
                            {c._count.azioni > 0 && (
                              <span>
                                <b>{c._count.azioni}</b>
                                <i>azioni</i>
                              </span>
                            )}
                          </div>
                        </a>
                      </div>
                    );
                  })}
                  {del.length === 0 && <div className="vuoto-mini">Nessuna campagna</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* ——— L'archivio: tutto quello che non sta girando ———
            Chiuso di default: è materiale da consultare, non da guardare ogni
            giorno. Ma deve esistere un posto dove trovarlo, altrimenti una
            campagna messa in pausa sei mesi fa non la ritrova più nessuno — e
            con lei la sua spesa, che nei conti c'è ancora. */}
        {spente.length > 0 && (
          <details className="scheda" style={{ marginTop: 4 }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="scheda-titolo" style={{ margin: 0 }}>
                Campagne non attive ({spente.length})
              </span>
              <span className="cella-sub">
                in pausa, concluse, mai partite e defunte · spesa storica{" "}
                {formattaEuro(spente.reduce((t, c) => t + c.metriche.reduce((s2, m) => s2 + (m.spesa ?? 0), 0), 0))}
              </span>
            </summary>

            <p className="cella-sub" style={{ marginTop: 12, marginBottom: 12, whiteSpace: "normal" }}>
              Qui dentro ci sono anche le <b>defunte</b>, che altrove non compaiono mai. La loro
              spesa resta nei totali dell&apos;azienda: «mai più» vale per l&apos;operativo, non per la
              contabilità. Il ROAS è calcolato su <b>tutta</b> la loro vita, non sugli ultimi 30
              giorni — su una campagna spenta quella finestra è vuota per definizione.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Campagna</th>
                    <th>Stato</th>
                    <th>Brand</th>
                    <th className="num">Spesa storica</th>
                    <th className="num">Incasso</th>
                    <th className="num">ROAS</th>
                    <th>Ultimo giorno</th>
                  </tr>
                </thead>
                <tbody>
                  {spente.map((c) => {
                    const sp = c.metriche.reduce((t, m) => t + (m.spesa ?? 0), 0);
                    const ri = c.metriche.reduce((t, m) => t + (m.ricavi ?? 0), 0);
                    const r = roas(ri, sp);
                    const ultimo = c.metriche.reduce<Date | null>(
                      (max, m) => (!max || m.data > max ? m.data : max),
                      null
                    );
                    return (
                      <tr key={c.id}>
                        <td style={{ maxWidth: 320 }}>
                          <a className="cella-nome" href={`/campagne/${c.id}`}>{c.nome}</a>
                          {c._count.azioni > 0 && (
                            <div className="cella-sub">{c._count.azioni} azioni collegate</div>
                          )}
                        </td>
                        <td>
                          <span className="tag-salute" style={{ color: COLORE_STATO_CAMPAGNA[c.stato] }}>
                            <span className="dot" />
                            {ETICHETTA_STATO_CAMPAGNA[c.stato] ?? c.stato}
                          </span>
                        </td>
                        <td className="cella-muta">{ETICHETTA_BRAND[c.brand] ?? c.brand}</td>
                        <td className="num">{sp > 0 ? formattaEuro(sp) : "—"}</td>
                        <td className="num">{ri > 0 ? formattaEuro(ri) : "—"}</td>
                        <td className="num">{r != null ? `${r.toFixed(1)}×` : "—"}</td>
                        <td className="cella-muta">{ultimo ? formattaData(ultimo) : "mai partita"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

      </main>
    </div>
  );
}
