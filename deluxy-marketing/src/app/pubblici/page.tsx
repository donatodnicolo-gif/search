import { Icona } from "@/components/Icona";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Sidebar } from "@/components/Sidebar";
import { cambiaStatoPubblico, salvaPubblico } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_STATO_PUBBLICO,
  ETICHETTA_BRAND,
  ETICHETTA_PIATTAFORMA,
  ETICHETTA_STATO_PUBBLICO,
  ETICHETTA_TIPO_PUBBLICO,
  formattaData,
  formattaNumero,
  PIATTAFORME_PUBBLICO,
  SOGLIA_POOL_MINIMO,
  STATI_PUBBLICO,
  TIPI_PUBBLICO,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

const ICONA_PIATTAFORMA: Record<string, string> = {
  meta: "metaads",
  google: "google",
  tiktok: "tiktok",
  klaviyo: "copy",
  shopify: "regalo",
  altro: "pagina",
};

// Pubblici: liste clienti, lookalike, retargeting e segmenti CRM, per
// piattaforma e brand. Canonico su Drive (00.4 Mappa Pubblici del sistema CRM).
export default async function PaginaPubblici({
  searchParams,
}: {
  searchParams: Promise<{ piattaforma?: string; brand?: string; stato?: string; q?: string }>;
}) {
  const p = await searchParams;
  const pubblici = await prisma.pubblico.findMany({
    where: {
      ...(p.piattaforma ? { piattaforma: p.piattaforma } : {}),
      ...(p.brand ? { brand: p.brand } : {}),
      ...(p.stato ? { stato: p.stato } : {}),
      ...(p.q ? { OR: [{ nome: { contains: p.q } }, { note: { contains: p.q } }] } : {}),
    },
    orderBy: [{ piattaforma: "asc" }, { brand: "asc" }, { nome: "asc" }],
    include: { misure: { orderBy: { data: "desc" }, take: 2 } },
  });

  const piattaformeInPagina = PIATTAFORME_PUBBLICO.filter((pf) =>
    pubblici.some((x) => x.piattaforma === pf)
  );
  const piccoli = pubblici.filter(
    (x) => x.dimensione != null && x.dimensione < SOGLIA_POOL_MINIMO && x.tipo !== "esclusione"
  );
  const daFare = pubblici.filter((x) => x.stato === "da_creare" || x.stato === "da_verificare");
  const totaleContatti = pubblici
    .filter((x) => x.tipo === "cliente" || x.tipo === "segmento")
    .reduce((s, x) => s + (x.dimensione ?? 0), 0);

  return (
    <div className="layout">
      <Sidebar attiva="pubblici" brandAttivo={p.brand} />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Pubblici</h1>
            <p className="page-sub">
              Liste clienti, lookalike, retargeting e segmenti CRM per piattaforma e brand: quanto
              sono grandi, in che stato sono e quando sono stati verificati. Il canonico è la Mappa
              Pubblici del sistema CRM su Drive; i pubblici li crea solo quel sistema.
            </p>
          </div>
          <a className="btn" href="#nuovo">Registra pubblico</a>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{pubblici.length}</div>
            <div className="kpi-etichetta">Pubblici censiti</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaNumero(totaleContatti)}</div>
            <div className="kpi-etichetta">Contatti nelle liste clienti</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={piccoli.length > 0 ? { color: "var(--orange)" } : undefined}>
              {piccoli.length}
            </div>
            <div className="kpi-etichetta">Pool sotto i {formattaNumero(SOGLIA_POOL_MINIMO)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={daFare.length > 0 ? { color: "var(--blue)" } : undefined}>
              {daFare.length}
            </div>
            <div className="kpi-etichetta">Da creare o verificare</div>
          </div>
        </div>

        {piccoli.length > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>{piccoli.length} pubblici sotto i {formattaNumero(SOGLIA_POOL_MINIMO)} utenti</b>: su Meta
              un pool così piccolo satura in fretta (frequenza alta, costi che salgono). Allargare
              le finestre a 45-60 giorni o accorpare, invece di insistere.
            </span>
          </div>
        )}

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca un pubblico…" defaultValue={p.q ?? ""} />
          <select name="piattaforma" defaultValue={p.piattaforma ?? ""}>
            <option value="">Tutte le piattaforme</option>
            {PIATTAFORME_PUBBLICO.map((pf) => (
              <option key={pf} value={pf}>{ETICHETTA_PIATTAFORMA[pf]}</option>
            ))}
          </select>
          <select name="brand" defaultValue={p.brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="stato" defaultValue={p.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {STATI_PUBBLICO.map((s) => (
              <option key={s} value={s}>{ETICHETTA_STATO_PUBBLICO[s]}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {pubblici.length === 0 && (
          <div className="vuoto">
            Nessun pubblico censito con questi filtri: registrane uno qui sotto o caricali dal
            Drive con <b>npm run db:seed-pubblici</b>.
          </div>
        )}

        {piattaformeInPagina.map((pf) => {
          const del = pubblici.filter((x) => x.piattaforma === pf);
          return (
            <section className="scheda" key={pf} style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 24px 0" }}>
                <span className="tessera-icona" style={{ width: 30, height: 30 }}>
                  <Icona nome={ICONA_PIATTAFORMA[pf] ?? "pagina"} />
                </span>
                {ETICHETTA_PIATTAFORMA[pf]} ({del.length})
              </div>
              <div style={{ overflowX: "auto", paddingBottom: 6 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Pubblico</th>
                      <th>Brand</th>
                      <th>Tipo</th>
                      <th className="num">Dimensione</th>
                      <th style={{ minWidth: 150 }}>Stato</th>
                      <th>Verificato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {del.map((x) => {
                      const precedente = x.misure[1]?.dimensione ?? null;
                      const variazione =
                        x.dimensione != null && precedente != null && precedente > 0
                          ? x.dimensione / precedente - 1
                          : null;
                      const piccolo = x.dimensione != null && x.dimensione < SOGLIA_POOL_MINIMO && x.tipo !== "esclusione";
                      return (
                        <tr key={x.id}>
                          <td style={{ maxWidth: 320 }}>
                            <div className="cella-nome">{x.nome}</div>
                            {x.note && (
                              <div className="cella-sub" style={{ whiteSpace: "normal" }}>{x.note}</div>
                            )}
                          </td>
                          <td>
                            <span className="tag-salute" style={{ color: COLORE_BRAND[x.brand] ?? "var(--text-tertiary)" }}>
                              <span className="dot" />
                              {ETICHETTA_BRAND[x.brand] ?? x.brand}
                            </span>
                          </td>
                          <td className="cella-muta">{ETICHETTA_TIPO_PUBBLICO[x.tipo] ?? x.tipo}</td>
                          <td className="num">
                            <b style={piccolo ? { color: "var(--orange)" } : undefined}>
                              {x.dimensione != null ? formattaNumero(x.dimensione) : "—"}
                            </b>
                            {variazione != null && (
                              <div className="cella-sub num" style={{ color: variazione >= 0 ? "var(--green)" : "var(--red)" }}>
                                {variazione >= 0 ? "+" : ""}{(variazione * 100).toFixed(0)}%
                              </div>
                            )}
                          </td>
                          <td>
                            <form action={cambiaStatoPubblico}>
                              <input type="hidden" name="id" value={x.id} />
                              <SelettoreStato
                                valore={x.stato}
                                colore={COLORE_STATO_PUBBLICO[x.stato]}
                                opzioni={STATI_PUBBLICO.map((s) => ({
                                  valore: s,
                                  etichetta: ETICHETTA_STATO_PUBBLICO[s],
                                }))}
                              />
                            </form>
                          </td>
                          <td className="cella-muta">{formattaData(x.verificatoIl)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <section className="scheda" id="nuovo">
          <div className="scheda-titolo">Registra o aggiorna un pubblico</div>
          <p className="cella-sub" style={{ marginBottom: 14 }}>
            Nome e piattaforma sono la chiave: rimandando lo stesso pubblico se ne aggiorna la
            dimensione e se ne tiene lo storico.
          </p>
          <form className="modulo" action={salvaPubblico}>
            <div className="campo-modulo largo">
              <label>Nome <span className="obbligatorio">*</span></label>
              <input name="nome" required placeholder="Es. CM GLOBALE clienti 365g" />
            </div>
            <div className="campo-modulo">
              <label>Piattaforma</label>
              <select name="piattaforma" defaultValue="meta">
                {PIATTAFORME_PUBBLICO.map((pf) => (
                  <option key={pf} value={pf}>{ETICHETTA_PIATTAFORMA[pf]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Brand</label>
              <select name="brand" defaultValue="cross">
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Tipo</label>
              <select name="tipo" defaultValue="cliente">
                {TIPI_PUBBLICO.map((t) => (
                  <option key={t} value={t}>{ETICHETTA_TIPO_PUBBLICO[t]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Dimensione (utenti)</label>
              <input name="dimensione" type="number" min="0" />
            </div>
            <div className="campo-modulo">
              <label>Stato</label>
              <select name="stato" defaultValue="attivo">
                {STATI_PUBBLICO.map((s) => (
                  <option key={s} value={s}>{ETICHETTA_STATO_PUBBLICO[s]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>Note</label>
              <textarea name="note" rows={2} placeholder="A cosa serve, finestra temporale, criteri, avvertenze…" />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Salva pubblico</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
