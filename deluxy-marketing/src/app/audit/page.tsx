import { BottoneSync } from "@/components/BottoneSync";
import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_ESITO,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_ESITO,
  ETICHETTA_TIPO_ANALISI,
  formattaData,
  SOGLIA_POOL_MINIMO,
} from "@/lib/dominio";
import { iconaCanale } from "@/lib/salute";

export const dynamic = "force-dynamic";

// Le verifiche che dicono in che stato è un account pubblicitario.
const TIPI_AUDIT = ["audit_google", "audit_meta", "revisione_creativi", "revisione_landing"];

// Le tematiche verificate: righe della griglia, una per area di controllo.
const TEMATICHE: { chiave: string; nome: string; icona: string; test: (titolo: string, tipo: string) => boolean }[] = [
  {
    chiave: "tracciamento",
    nome: "Tracciamento & misurazione",
    icona: "metriche",
    test: (t) => /tracciament|tracking|pixel|conversion|tag|consent/i.test(t),
  },
  { chiave: "google", nome: "Struttura Google Ads", icona: "google", test: (t, tipo) => tipo === "audit_google" && !/tracciament|sitelink|landing/i.test(t) },
  { chiave: "meta", nome: "Struttura Meta Ads", icona: "metaads", test: (_, tipo) => tipo === "audit_meta" },
  { chiave: "asset", nome: "Asset & sitelink", icona: "copy", test: (t) => /sitelink|asset|estension/i.test(t) },
  { chiave: "creativi", nome: "Creativi & copy", icona: "copy", test: (_, tipo) => tipo === "revisione_creativi" },
  { chiave: "landing", nome: "Landing & sito", icona: "landing", test: (t, tipo) => tipo === "revisione_landing" || /landing|sito/i.test(t) },
];

function tematicaDi(titolo: string, tipo: string): string {
  for (const t of TEMATICHE) if (t.test(titolo, tipo)) return t.chiave;
  return tipo === "audit_google" ? "google" : tipo === "audit_meta" ? "meta" : "asset";
}

// Stato account: per ogni brand (colonna) e tematica (riga) il semaforo
// dell'ultima verifica, con lo storico completo sotto.
export default async function PaginaStatoAccount({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; tipo?: string; canale?: string }>;
}) {
  const { brand, tipo, canale } = await searchParams;
  const audit = await prisma.analisi.findMany({
    where: {
      tipo: tipo ? tipo : { in: TIPI_AUDIT },
      ...(brand ? { brand } : {}),
      ...(canale ? { canale } : {}),
    },
    orderBy: { dataAnalisi: "desc" },
    include: { _count: { select: { azioni: true } } },
  });

  // ultima verifica per (brand × tematica): è lo stato corrente
  const corrente = new Map<string, (typeof audit)[number]>();
  for (const a of audit) {
    const chiave = `${a.brand}|${tematicaDi(a.titolo, a.tipo)}`;
    if (!corrente.has(chiave)) corrente.set(chiave, a);
  }

  // Pubblici: lo stato non viene da un documento ma dal registro stesso —
  // un brand è "in ordine" se non ha pubblici obsoleti, da creare o pool
  // sotto la soglia minima di utilizzabilità.
  const pubblici = await prisma.pubblico.findMany({
    select: { brand: true, stato: true, dimensione: true, tipo: true, verificatoIl: true },
  });
  const statoPubblici = (b: string) => {
    const del = pubblici.filter((x) => x.brand === b);
    if (del.length === 0) return null;
    const daFare = del.filter((x) => x.stato === "da_creare" || x.stato === "obsoleto").length;
    const daVerificare = del.filter((x) => x.stato === "da_verificare").length;
    const piccoli = del.filter(
      (x) => x.dimensione != null && x.dimensione < SOGLIA_POOL_MINIMO && x.tipo !== "esclusione"
    ).length;
    const ultima = del
      .map((x) => x.verificatoIl)
      .filter((d): d is Date => d != null)
      .sort((a, b2) => b2.getTime() - a.getTime())[0] ?? null;
    const esito = daFare > 0 || piccoli > 1 ? "critico" : daVerificare > 0 || piccoli > 0 ? "attenzione" : "ok";
    const dettagli = [
      `${del.length} pubblici`,
      daFare ? `${daFare} da creare o obsoleti` : null,
      daVerificare ? `${daVerificare} da verificare` : null,
      piccoli ? `${piccoli} pool sotto ${SOGLIA_POOL_MINIMO}` : null,
    ].filter(Boolean);
    return { esito, ultima, dettaglio: dettagli.join(" · "), n: del.length };
  };

  const brandInGriglia = BRANDS.filter(
    (b) => audit.some((a) => a.brand === b) || pubblici.some((x) => x.brand === b)
  );
  const tematicheInGriglia = TEMATICHE.filter((t) =>
    brandInGriglia.some((b) => corrente.has(`${b}|${t.chiave}`))
  );
  const criticita =
    [...corrente.values()].filter((a) => a.esito === "critico").length +
    brandInGriglia.filter((b) => statoPubblici(b)?.esito === "critico").length;

  return (
    <div className="layout">
      <Sidebar attiva="audit" brandAttivo={brand} canaleAttivo={canale} />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Stato account{canale ? ` — ${ETICHETTA_CANALE[canale] ?? canale}` : ""}
            </h1>
            <p className="page-sub">
              Come stanno gli account, brand per brand e tematica per tematica: ogni casella è
              l&apos;ultima verifica fatta su quell&apos;area. Sotto, lo storico completo delle
              verifiche.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <BottoneSync />
            <a className="btn" href="/analisi/nuova">Deposita verifica</a>
          </div>
        </div>

        {criticita > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>{criticita} aree in stato critico</b>: sono i quadri rossi qui sotto. Aprili per
              leggere la sintesi e creare le azioni correttive.
            </span>
          </div>
        )}

        {tematicheInGriglia.length === 0 ? (
          <div className="vuoto">Nessuna verifica depositata: la griglia comparirà qui.</div>
        ) : (
          <section className="scheda" style={{ padding: 0, marginBottom: 18 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="griglia-stato">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Tematica</th>
                    {brandInGriglia.map((b) => (
                      <th key={b}>
                        <span className="sb-dot" style={{ display: "inline-block", width: 8, height: 8, background: COLORE_BRAND[b], marginRight: 7 }} />
                        {ETICHETTA_BRAND[b]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tematicheInGriglia.map((t) => (
                    <tr key={t.chiave}>
                      <td>
                        <span className="tematica-nome">
                          <span className="tessera-icona" style={{ width: 28, height: 28 }}>
                            <Icona nome={t.icona} />
                          </span>
                          {t.nome}
                        </span>
                      </td>
                      {brandInGriglia.map((b) => {
                        const a = corrente.get(`${b}|${t.chiave}`);
                        if (!a) {
                          return (
                            <td key={b}>
                              <span className="quadro-vuoto">mai verificato</span>
                            </td>
                          );
                        }
                        const colore = a.esito ? COLORE_ESITO[a.esito] ?? "var(--text-tertiary)" : "var(--text-tertiary)";
                        return (
                          <td key={b}>
                            <a className="quadro-stato" href={`/analisi/${a.id}`} style={{ borderColor: colore }}>
                              <span className="quadro-esito" style={{ color: colore }}>
                                <span className="dot" />
                                {a.esito ? ETICHETTA_ESITO[a.esito] ?? a.esito : "Senza esito"}
                              </span>
                              <span className="quadro-data">{formattaData(a.dataAnalisi)}</span>
                              {a._count.azioni > 0 && (
                                <span className="quadro-azioni">{a._count.azioni} azioni</span>
                              )}
                            </a>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Pubblici: stato calcolato dal registro, non da un documento */}
                  <tr>
                    <td>
                      <span className="tematica-nome">
                        <span className="tessera-icona" style={{ width: 28, height: 28 }}>
                          <Icona nome="pubblici" />
                        </span>
                        Pubblici &amp; CRM
                      </span>
                    </td>
                    {brandInGriglia.map((b) => {
                      const s = statoPubblici(b);
                      if (!s) {
                        return (
                          <td key={b}>
                            <span className="quadro-vuoto">nessun pubblico</span>
                          </td>
                        );
                      }
                      const colore = COLORE_ESITO[s.esito] ?? "var(--text-tertiary)";
                      return (
                        <td key={b}>
                          <a className="quadro-stato" href={`/pubblici?brand=${b}`} style={{ borderColor: colore }} title={s.dettaglio}>
                            <span className="quadro-esito" style={{ color: colore }}>
                              <span className="dot" />
                              {ETICHETTA_ESITO[s.esito] ?? s.esito}
                            </span>
                            <span className="quadro-data">
                              {s.ultima ? formattaData(s.ultima) : "mai verificato"}
                            </span>
                            <span className="quadro-azioni">{s.n} pubblici</span>
                          </a>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        <form className="filtri" method="get">
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="tipo" defaultValue={tipo ?? ""}>
            <option value="">Tutti i tipi di verifica</option>
            {TIPI_AUDIT.map((t) => (
              <option key={t} value={t}>{ETICHETTA_TIPO_ANALISI[t]}</option>
            ))}
          </select>
          <select name="canale" defaultValue={canale ?? ""}>
            <option value="">Tutti i canali</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="sito">Sito / landing</option>
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {audit.length === 0 ? (
          <div className="vuoto">Nessuna verifica con questi filtri.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Verifica</th>
                  <th>Tematica</th>
                  <th>Brand</th>
                  <th>Canale</th>
                  <th>Esito</th>
                  <th className="num">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => {
                  const t = TEMATICHE.find((x) => x.chiave === tematicaDi(a.titolo, a.tipo));
                  return (
                    <tr key={a.id}>
                      <td className="cella-muta">{formattaData(a.dataAnalisi)}</td>
                      <td>
                        <a href={`/analisi/${a.id}`}>
                          <div className="cella-nome">{a.titolo}</div>
                          {a.fileDrive && <div className="cella-sub">{a.fileDrive}</div>}
                        </a>
                      </td>
                      <td className="cella-muta">{t?.nome ?? "—"}</td>
                      <td>
                        <span className="tag-salute" style={{ color: COLORE_BRAND[a.brand] ?? "var(--text-tertiary)" }}>
                          <span className="dot" />
                          {ETICHETTA_BRAND[a.brand] ?? a.brand}
                        </span>
                      </td>
                      <td className="cella-muta">
                        {a.canale ? (
                          <span className="tag-neutro">
                            <Icona nome={iconaCanale(a.canale)} />
                            {ETICHETTA_CANALE[a.canale] ?? a.canale}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        {a.esito ? (
                          <span className="tag-salute" style={{ color: COLORE_ESITO[a.esito] ?? "var(--text-tertiary)" }}>
                            <span className="dot" />
                            {ETICHETTA_ESITO[a.esito] ?? a.esito}
                          </span>
                        ) : (
                          <span className="cella-muta">—</span>
                        )}
                      </td>
                      <td className="num">{a._count.azioni || "—"}</td>
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
