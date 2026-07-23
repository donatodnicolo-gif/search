import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  formattaData,
  formattaEuro,
  formattaNumero,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

const ICONA_CATEGORIA: Record<string, string> = {
  fiori: "fiori",
  torte: "torta",
  colazioni: "colazione",
  dolci: "colazione",
  palloncini: "palloncino",
  vini: "regalo",
  servizio: "pagina",
  altro: "pagina",
};

// Da dove è arrivato l'ordine, in una parola.
function canaleOrdine(origine: string | null, utmSource: string | null): { nome: string; colore: string } {
  const t = `${utmSource ?? ""} ${origine ?? ""}`.toLowerCase();
  if (/adwords|google ads|gclid/.test(t)) return { nome: "Google Ads", colore: "var(--blue)" };
  if (/facebook|instagram|meta|fb/.test(t)) return { nome: "Meta", colore: "var(--purple)" };
  if (/klaviyo|email|newsletter/.test(t)) return { nome: "Email", colore: "var(--gold-strong)" };
  if (/google/.test(t)) return { nome: "Google organico", colore: "var(--green)" };
  if (/direct/.test(t)) return { nome: "Diretto", colore: "var(--text-secondary)" };
  if (t.trim() === "") return { nome: "Non tracciato", colore: "var(--text-tertiary)" };
  return { nome: origine ?? "Altro", colore: "var(--text-tertiary)" };
}

// Ordini scaricati dai negozi Shopify: la vendita accanto alla pubblicità.
export default async function PaginaOrdini({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; da?: string; a?: string; canale?: string; q?: string }>;
}) {
  const p = await searchParams;
  const da = p.da ? new Date(p.da) : new Date(Date.now() - 30 * 86_400_000);
  const a = p.a ? new Date(p.a) : new Date();

  const ordini = await prisma.ordine.findMany({
    where: {
      data: { gte: da, lte: a },
      ...(p.brand ? { brand: p.brand } : {}),
      ...(p.q
        ? { OR: [{ numero: { contains: p.q } }, { cliente: { contains: p.q } }, { citta: { contains: p.q } }] }
        : {}),
    },
    orderBy: { data: "desc" },
    include: { righe: true },
    take: 400,
  });

  const validi = ordini.filter((o) => o.stato !== "annullato");
  const fatturato = validi.reduce((s, o) => s + (o.totale ?? 0), 0);
  const medio = validi.length > 0 ? fatturato / validi.length : 0;
  const tracciati = validi.filter((o) => o.utmSource || o.origine).length;

  // Ripartizione per canale d'arrivo
  const perCanale = new Map<string, { n: number; valore: number; colore: string }>();
  for (const o of validi) {
    const c = canaleOrdine(o.origine, o.utmSource);
    const v = perCanale.get(c.nome) ?? { n: 0, valore: 0, colore: c.colore };
    v.n++;
    v.valore += o.totale ?? 0;
    perCanale.set(c.nome, v);
  }
  const canali = [...perCanale.entries()].sort((x, y) => y[1].valore - x[1].valore);

  return (
    <div className="layout">
      <Sidebar attiva="ordini" brandAttivo={p.brand} />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Ordini</h1>
            <p className="page-sub">
              Gli ordini scaricati dai negozi Shopify, con la campagna da cui sono arrivati quando
              Shopify la registra. È il dato che permette di mettere le vendite accanto alla spesa
              pubblicitaria, offerta per offerta.
            </p>
          </div>
          <a className="btn btn-secondario" href="/offerte">Analisi per offerta</a>
        </div>

        {ordini.length === 0 ? (
          <div className="vuoto">
            Nessun ordine caricato in questo periodo. Si caricano con{" "}
            <b>npm run import:ordini</b> (serve un token Admin API per negozio, vedi README) oppure
            via <b>POST /api/v1/ordini</b> da una sessione Claude collegata a Shopify.
          </div>
        ) : (
          <>
            <div className="kpi-riga">
              <div className="kpi">
                <div className="kpi-valore">{formattaNumero(validi.length)}</div>
                <div className="kpi-etichetta">Ordini nel periodo</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{formattaEuro(fatturato)}</div>
                <div className="kpi-etichetta">Fatturato</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{formattaEuro(medio)}</div>
                <div className="kpi-etichetta">Ordine medio</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">
                  {validi.length > 0 ? `${Math.round((tracciati / validi.length) * 100)}%` : "—"}
                </div>
                <div className="kpi-etichetta">Ordini con provenienza tracciata</div>
              </div>
            </div>

            <section className="scheda">
              <div className="scheda-titolo">Da dove arrivano</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {canali.map(([nome, v]) => (
                  <span className="tag-salute" key={nome} style={{ color: v.colore, padding: "6px 12px" }}>
                    <span className="dot" />
                    {nome}: <b>{v.n}</b> ordini · {formattaEuro(v.valore)}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Numero, cliente o città…" defaultValue={p.q ?? ""} />
          <select name="brand" defaultValue={p.brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <input type="date" name="da" defaultValue={da.toISOString().slice(0, 10)} />
          <input type="date" name="a" defaultValue={a.toISOString().slice(0, 10)} />
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {ordini.length > 0 && (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Data</th>
                  <th>Brand</th>
                  <th>Contenuto</th>
                  <th>Città</th>
                  <th>Provenienza</th>
                  <th className="num">Totale</th>
                </tr>
              </thead>
              <tbody>
                {ordini.map((o) => {
                  const c = canaleOrdine(o.origine, o.utmSource);
                  return (
                    <tr key={o.id} style={o.stato === "annullato" ? { opacity: 0.5 } : undefined}>
                      <td>
                        <div className="cella-nome">{o.numero}</div>
                        <div className="cella-sub">{o.cliente ?? "—"}</div>
                      </td>
                      <td className="cella-muta">{formattaData(o.data)}</td>
                      <td>
                        <span className="tag-salute" style={{ color: COLORE_BRAND[o.brand] ?? "var(--text-tertiary)" }}>
                          <span className="dot" />
                          {ETICHETTA_BRAND[o.brand] ?? o.brand}
                        </span>
                      </td>
                      <td style={{ maxWidth: 330 }}>
                        {o.righe.map((r) => (
                          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                            <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
                              <Icona nome={ICONA_CATEGORIA[r.categoria ?? "altro"] ?? "pagina"} />
                            </span>
                            <span style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>
                              {r.quantita > 1 ? `${r.quantita}× ` : ""}
                              {r.titolo}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="cella-muta">{o.citta ?? "—"}</td>
                      <td>
                        <span className="tag-salute" style={{ color: c.colore }}>
                          <span className="dot" />
                          {c.nome}
                        </span>
                        {o.utmCampagna && <div className="cella-sub">{o.utmCampagna}</div>}
                      </td>
                      <td className="num">
                        <b>{formattaEuro(o.totale)}</b>
                        {o.stato !== "pagato" && <div className="cella-sub">{o.stato}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
