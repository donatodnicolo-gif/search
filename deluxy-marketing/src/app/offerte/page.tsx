import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
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

// Giudizio su una singola offerta: quanto pesa e quanto la sostiene la pubblicità.
function giudizioOfferta(quotaPubblicita: number | null, ricavo: number, ordini: number) {
  if (ordini < 3) {
    return { etichetta: "Pochi ordini", colore: "var(--text-tertiary)", spiega: "Sotto i 3 ordini nel periodo: numeri non ancora leggibili." };
  }
  if (quotaPubblicita == null) {
    return { etichetta: "Senza tracciamento", colore: "var(--text-tertiary)", spiega: "Nessun ordine con provenienza tracciata: non si può dire quanto la sostenga la pubblicità." };
  }
  if (quotaPubblicita >= 0.8) {
    return {
      etichetta: "Dipende dall'ADV",
      colore: "var(--orange)",
      spiega: `${Math.round(quotaPubblicita * 100)}% del ricavo arriva da campagne a pagamento: se si spegne la spesa, l'offerta si ferma.`,
    };
  }
  if (quotaPubblicita >= 0.4) {
    return {
      etichetta: "Sostenuta dall'ADV",
      colore: "var(--blue)",
      spiega: `${Math.round(quotaPubblicita * 100)}% da campagne: mix equilibrato tra pagato e spontaneo.`,
    };
  }
  return {
    etichetta: "Vende da sola",
    colore: "var(--green)",
    spiega: `Solo il ${Math.round(quotaPubblicita * 100)}% arriva da campagne: domanda spontanea, buona candidata a spingere di più.`,
  };
}

// Analisi per offerta: quanto vende ogni prodotto e quanta parte del suo
// ricavo arriva dalle campagne (dalla provenienza registrata sull'ordine).
export default async function PaginaOfferte({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; da?: string; a?: string; categoria?: string; ordina?: string }>;
}) {
  const p = await searchParams;
  const da = p.da ? new Date(p.da) : new Date(Date.now() - 30 * 86_400_000);
  const a = p.a ? new Date(p.a) : new Date();
  const ordina = p.ordina ?? "ricavo";

  const [ordini, metriche] = await Promise.all([
    prisma.ordine.findMany({
      where: { data: { gte: da, lte: a }, stato: { not: "annullato" }, ...(p.brand ? { brand: p.brand } : {}) },
      include: { righe: true },
    }),
    // spesa pubblicitaria del periodo, per confronto complessivo
    prisma.metricaCampagna.findMany({
      where: { data: { gte: da, lte: a } },
      include: { campagna: { select: { brand: true } } },
    }),
  ]);

  const spesaAdv = metriche
    .filter((m) => !p.brand || m.campagna.brand === p.brand)
    .reduce((s, m) => s + (m.spesa ?? 0), 0);

  // aggregazione per titolo di prodotto (l'offerta)
  type Offerta = {
    titolo: string;
    categoria: string;
    vendor: string | null;
    pezzi: number;
    ordini: number;
    ricavo: number;
    ricavoAdv: number;
    ricavoTracciato: number;
    campagne: Map<string, number>;
  };
  const offerte = new Map<string, Offerta>();
  for (const o of ordini) {
    const daAdv = /adwords|google ads|facebook|instagram|meta/i.test(`${o.utmSource ?? ""} ${o.origine ?? ""}`);
    const tracciato = Boolean(o.utmSource || o.origine);
    for (const r of o.righe) {
      if (r.categoria === "servizio") continue; // spedizioni e riconsegne non sono offerte
      const chiave = r.titolo.trim().toLowerCase();
      const off = offerte.get(chiave) ?? {
        titolo: r.titolo.trim(),
        categoria: r.categoria ?? "altro",
        vendor: r.vendor,
        pezzi: 0,
        ordini: 0,
        ricavo: 0,
        ricavoAdv: 0,
        ricavoTracciato: 0,
        campagne: new Map<string, number>(),
      };
      const valore = r.totale ?? (r.prezzo ?? 0) * r.quantita;
      off.pezzi += r.quantita;
      off.ordini += 1;
      off.ricavo += valore;
      if (tracciato) off.ricavoTracciato += valore;
      if (daAdv) {
        off.ricavoAdv += valore;
        if (o.utmCampagna) off.campagne.set(o.utmCampagna, (off.campagne.get(o.utmCampagna) ?? 0) + valore);
      }
      offerte.set(chiave, off);
    }
  }

  let lista = [...offerte.values()];
  if (p.categoria) lista = lista.filter((o) => o.categoria === p.categoria);
  lista.sort((x, y) =>
    ordina === "pezzi" ? y.pezzi - x.pezzi : ordina === "adv" ? y.ricavoAdv - x.ricavoAdv : y.ricavo - x.ricavo
  );

  const categorie = [...new Set([...offerte.values()].map((o) => o.categoria))].sort();
  const ricavoTotale = lista.reduce((s, o) => s + o.ricavo, 0);
  const ricavoAdvTotale = lista.reduce((s, o) => s + o.ricavoAdv, 0);

  const link = (cambi: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      brand: p.brand, da: p.da, a: p.a, categoria: p.categoria, ordina: p.ordina,
    };
    for (const [k, v] of Object.entries({ ...base, ...cambi })) if (v) q.set(k, v);
    const s = q.toString();
    return `/offerte${s ? `?${s}` : ""}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="offerte" brandAttivo={p.brand} />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Analisi per offerta</h1>
            <p className="page-sub">
              Quanto vende ogni singola offerta e quanta parte di quel ricavo arriva dalle campagne
              a pagamento. Serve a distinguere i prodotti che tirano da soli da quelli che stanno
              in piedi solo finché si spende.
            </p>
          </div>
          <a className="btn btn-secondario" href="/ordini">Vai agli ordini</a>
        </div>

        {lista.length === 0 ? (
          <div className="vuoto">
            Nessun ordine nel periodo: carica gli ordini con <b>npm run import:ordini</b> e questa
            analisi si popola da sola.
          </div>
        ) : (
          <>
            <div className="kpi-riga">
              <div className="kpi">
                <div className="kpi-valore">{lista.length}</div>
                <div className="kpi-etichetta">Offerte vendute</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{formattaEuro(ricavoTotale)}</div>
                <div className="kpi-etichetta">Ricavo prodotto</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{formattaEuro(ricavoAdvTotale)}</div>
                <div className="kpi-etichetta">
                  Di cui da campagne
                  {ricavoTotale > 0 ? ` · ${Math.round((ricavoAdvTotale / ricavoTotale) * 100)}%` : ""}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{spesaAdv > 0 ? formattaEuro(spesaAdv) : "—"}</div>
                <div className="kpi-etichetta">Spesa ADV registrata nel periodo</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">
                  {spesaAdv > 0 ? `${(ricavoAdvTotale / spesaAdv).toFixed(1)}×` : "—"}
                </div>
                <div className="kpi-etichetta">Ritorno sul pagato</div>
              </div>
            </div>

            {spesaAdv === 0 && (
              <div className="nota-info">
                <span className="nota-icona">◈</span>
                <span>
                  Nel periodo non ci sono metriche di spesa registrate sulle campagne, quindi il
                  ritorno non è calcolabile: carica le metriche (dalle schede campagna o via API) per
                  vedere il rapporto vendite/pubblicità completo.
                </span>
              </div>
            )}

            <form className="filtri" method="get">
              <select name="brand" defaultValue={p.brand ?? ""}>
                <option value="">Tutti i brand</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
              <select name="categoria" defaultValue={p.categoria ?? ""}>
                <option value="">Tutte le categorie</option>
                {categorie.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input type="date" name="da" defaultValue={da.toISOString().slice(0, 10)} />
              <input type="date" name="a" defaultValue={a.toISOString().slice(0, 10)} />
              <button className="btn small" type="submit">Filtra</button>
            </form>

            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Offerta</th>
                    <th className="num"><a href={link({ ordina: "pezzi" })}>Pezzi {ordina === "pezzi" ? "↓" : ""}</a></th>
                    <th className="num"><a href={link({ ordina: "ricavo" })}>Ricavo {ordina === "ricavo" ? "↓" : ""}</a></th>
                    <th className="num"><a href={link({ ordina: "adv" })}>Da campagne {ordina === "adv" ? "↓" : ""}</a></th>
                    <th style={{ minWidth: 170 }}>Quota pubblicità</th>
                    <th>Giudizio</th>
                    <th>Campagne che l&apos;hanno venduta</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, 150).map((o) => {
                    const quota = o.ricavoTracciato > 0 ? o.ricavoAdv / o.ricavoTracciato : null;
                    const g = giudizioOfferta(quota, o.ricavo, o.ordini);
                    return (
                      <tr key={o.titolo}>
                        <td style={{ maxWidth: 300 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <span className="card-campagna-icona" style={{ width: 28, height: 28 }}>
                              <Icona nome={ICONA_CATEGORIA[o.categoria] ?? "pagina"} />
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <div className="cella-nome" style={{ overflowWrap: "anywhere" }}>{o.titolo}</div>
                              <div className="cella-sub">
                                {o.categoria}
                                {o.vendor ? ` · ${o.vendor}` : ""}
                              </div>
                            </span>
                          </div>
                        </td>
                        <td className="num">{formattaNumero(o.pezzi)}</td>
                        <td className="num"><b>{formattaEuro(o.ricavo)}</b></td>
                        <td className="num cella-muta">{o.ricavoAdv > 0 ? formattaEuro(o.ricavoAdv) : "—"}</td>
                        <td>
                          {quota == null ? (
                            <span className="cella-muta">—</span>
                          ) : (
                            <div className="margine-cella">
                              <span className="margine-track">
                                <span
                                  className="margine-fill"
                                  style={{ width: `${Math.min(quota * 100, 100)}%`, background: g.colore }}
                                />
                              </span>
                              <span className="margine-valore">{Math.round(quota * 100)}%</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="tag-salute" style={{ color: g.colore }} title={g.spiega}>
                            <span className="dot" />
                            {g.etichetta}
                          </span>
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          {o.campagne.size === 0 ? (
                            <span className="cella-muta">—</span>
                          ) : (
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {[...o.campagne.entries()]
                                .sort((x, y) => y[1] - x[1])
                                .slice(0, 3)
                                .map(([nome, valore]) => (
                                  <span className="tag-neutro" key={nome} title={`${formattaEuro(valore)} da questa campagna`}>
                                    {nome}
                                  </span>
                                ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {lista.length > 150 && (
              <div className="cella-sub" style={{ marginTop: 8 }}>
                Mostrate le prime 150 offerte su {lista.length}.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
