import { Prisma } from "@prisma/client";
import { RigaLink } from "@/components/RigaLink";
import { Sidebar } from "@/components/Sidebar";
import { Vuoto } from "@/components/Vuoto";
import { ZonaFiltri } from "@/components/ZonaFiltri";
import { prisma } from "@/lib/db";
import {
  SEGMENTI,
  TIPOLOGIE,
  attivita,
  coloreSegmento,
  coloreTipologia,
  nomeSegmento,
  nomeTipologia,
} from "@/lib/consumers";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;

const euro = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dataIt = (d: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");

function giorniFa(g: number | null): string {
  if (g == null) return "";
  if (g === 0) return "oggi";
  if (g === 1) return "ieri";
  if (g < 60) return `${g} giorni fa`;
  if (g < 730) return `${Math.round(g / 30)} mesi fa`;
  return `${Math.floor(g / 365)} anni fa`;
}

// CONSUMERS — le persone che comprano da noi su Shopify.
//
// ⚠️ Non sono le aziende del registro: quelle stanno in «Aziende». Qui c'è chi
// ha messo la carta su deluxy.it, importato da Orders che possiede gli ordini.
// Questa pagina è uno SPECCHIO, e lo dice: in testa c'è quando è stata scattata
// la fotografia, perché un numero senza data qui varrebbe poco.
export default async function Consumers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segmento?: string; tipologia?: string; b2b?: string; ordina?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const segmento = SEGMENTI.some((s) => s.chiave === sp.segmento) ? sp.segmento! : "";
  const tipologia = TIPOLOGIE.some((t) => t.chiave === sp.tipologia) ? sp.tipologia! : "";
  const soloB2B = sp.b2b === "1";
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const ordina = sp.ordina === "ordini" || sp.ordina === "recenti" || sp.ordina === "nome" ? sp.ordina : "speso";

  const where: Prisma.ConsumerWhereInput = {
    ...(segmento ? { segmento } : {}),
    ...(tipologia ? { tipologia } : {}),
    ...(soloB2B ? { partnerId: { not: null } } : {}),
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { telefono: { contains: q, mode: "insensitive" } },
            { citta: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ConsumerOrderByWithRelationInput[] =
    ordina === "ordini"
      ? [{ ordini: "desc" }, { speso: "desc" }]
      : ordina === "recenti"
        ? [{ ultimoOrdine: { sort: "desc", nulls: "last" } }]
        : ordina === "nome"
          ? [{ nome: "asc" }]
          : [{ speso: "desc" }];

  const [totale, righe, totali, ultimaSync, agganciati] = await Promise.all([
    prisma.consumer.count({ where }),
    prisma.consumer.findMany({
      where,
      orderBy,
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      include: { partner: { select: { id: true, nome: true, stato: true } } },
    }),
    prisma.consumer.aggregate({ where, _sum: { speso: true, ordini: true } }),
    prisma.consumer.aggregate({ _max: { sincronizzatoIl: true } }),
    prisma.consumer.count({ where: { partnerId: { not: null } } }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const conFiltro = (cambi: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { q, segmento, tipologia, b2b: soloB2B ? "1" : "", ordina, pagina: String(pagina) };
    for (const [k, v] of Object.entries({ ...base, ...cambi })) if (v) p.set(k, v);
    return `/consumers?${p.toString()}`;
  };

  return (
    <div className="layout">
      <Sidebar consumersAttivi />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Consumers</h1>
            <p className="page-sub">
              Le persone che comprano da noi su Shopify. Gli ordini sono di{" "}
              <a href="https://deluxy-orders.vercel.app/clienti" target="_blank" rel="noreferrer">Orders</a>:
              qui c&apos;è la fotografia importata da lì
              {ultimaSync._max.sincronizzatoIl && (
                <> — scattata il <strong>{ultimaSync._max.sincronizzatoIl.toLocaleString("it-IT")}</strong></>
              )}
            </p>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{totale.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">{q || segmento || tipologia || soloB2B ? "Persone trovate" : "Persone"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{euro(totali._sum.speso ?? 0)}</div>
            <div className="kpi-etichetta">Quanto hanno speso</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{(totali._sum.ordini ?? 0).toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Ordini</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{agganciati.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Anche azienda del registro</div>
          </div>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca nome, email, telefono, città…" defaultValue={q} />
          {/* I select vivono dietro «Filtri (N)» sotto la soglia mobile (Libro
              v1.2 §8). L'ordinamento NON è un filtro: sta nel pannello ma
              resta fuori dal conteggio N (§8.6). */}
          <ZonaFiltri attivi={[segmento, tipologia].filter(Boolean).length}>
            <select name="segmento" defaultValue={segmento}>
              <option value="">Tutti i segmenti</option>
              {SEGMENTI.map((s) => (
                <option key={s.chiave} value={s.chiave}>{s.nome}</option>
              ))}
            </select>
            <select name="tipologia" defaultValue={tipologia}>
              <option value="">Tutte le tipologie</option>
              {TIPOLOGIE.map((t) => (
                <option key={t.chiave} value={t.chiave}>{t.nome}</option>
              ))}
            </select>
            <select name="ordina" defaultValue={ordina}>
              <option value="speso">Ordina per spesa</option>
              <option value="ordini">Ordina per numero di ordini</option>
              <option value="recenti">Ordina per ultimo ordine</option>
              <option value="nome">Ordina per nome</option>
            </select>
          </ZonaFiltri>
          <button className="btn btn-secondario" type="submit">Filtra</button>
          <a className="btn btn-secondario" href={conFiltro({ b2b: soloB2B ? "" : "1", pagina: "" })}>
            {soloB2B ? "← Tutte le persone" : `Solo chi è anche azienda (${agganciati})`}
          </a>
        </form>

        {righe.length === 0 ? (
          <Vuoto titolo="Nessun consumer">
            {totale === 0 && !q && !segmento && !tipologia
              ? "Nessun consumer importato. Si importano da Orders con `npm run importa:consumers`."
              : "Nessuna persona con questi filtri. Prova ad allargare o azzerare i filtri."}
          </Vuoto>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tipologia</th>
                  <th>Segmento</th>
                  <th>Da quanto</th>
                  <th>Recapiti</th>
                  <th>Brand</th>
                  <th>Ordini</th>
                  <th>Speso</th>
                  <th>Ordine medio</th>
                  <th>Ultimo ordine</th>
                  <th>Azienda</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((c) => {
                  const att = attivita(c.giorniDallUltimo);
                  return (
                    // La riga si apre col click (Libro v1.6 §8): tutta la
                    // riga porta alla scheda, i link dentro restano loro.
                    <RigaLink key={c.id} href={`/consumers/${c.id}`} className="riga-link">
                      <td>
                        <a href={`/consumers/${c.id}`}>
                          <div className="cella-nome">{c.nome ?? c.email ?? c.telefono ?? "—"}</div>
                          {c.citta && <div className="cella-sub">{c.citta}</div>}
                        </a>
                      </td>
                      <td>
                        <span className="badge" style={{ color: coloreTipologia(c.tipologia) }}>
                          <span className="dot" />
                          {nomeTipologia(c.tipologia)}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ color: coloreSegmento(c.segmento) }}>
                          <span className="dot" />
                          {nomeSegmento(c.segmento)}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ color: att.colore }}>
                          <span className="dot" />
                          {att.nome}
                        </span>
                      </td>
                      <td className="cella-muta">
                        {c.email && <div>{c.email}</div>}
                        {c.telefono && <div className="cella-sub">{c.telefono}</div>}
                        {!c.email && !c.telefono && "—"}
                      </td>
                      <td className="cella-muta">{c.brand.join(", ") || "—"}</td>
                      <td className="cella-muta">
                        {c.ordini}
                        {c.annullati > 0 && (
                          <div className="cella-sub" title="annullati, esclusi dai totali">+{c.annullati} annull.</div>
                        )}
                      </td>
                      <td className="cella-muta">{euro(c.speso)}</td>
                      <td className="cella-muta">{euro(c.ordineMedio)}</td>
                      <td className="cella-muta">
                        {dataIt(c.ultimoOrdine)}
                        <div className="cella-sub">{giorniFa(c.giorniDallUltimo)}</div>
                      </td>
                      <td className="cella-muta">
                        {c.partner ? (
                          <a href={`/partner/${c.partner.id}`} title={`Agganciata via ${c.agganciatoCome}`}>
                            {c.partner.nome}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </RigaLink>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagine > 1 && (
          <div className="paginazione">
            {pagina > 1 && <a className="btn btn-secondario" href={conFiltro({ pagina: String(pagina - 1) })}>← Precedente</a>}
            <span className="testo-guida">Pagina {pagina} di {pagine}</span>
            {pagina < pagine && <a className="btn btn-secondario" href={conFiltro({ pagina: String(pagina + 1) })}>Successiva →</a>}
          </div>
        )}
      </main>
    </div>
  );
}
