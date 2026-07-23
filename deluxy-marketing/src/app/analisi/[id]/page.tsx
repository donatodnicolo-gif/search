import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Icona } from "@/components/Icona";
import { Scadenza } from "@/components/Scadenza";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  COLORE_BRAND,
  COLORE_ESITO,
  COLORE_STATO_AZIONE,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_ESITO,
  ETICHETTA_STATO_AZIONE,
  ETICHETTA_TIPO_ANALISI,
  formattaData,
  STATI_AZIONE_APERTI,
} from "@/lib/dominio";
import { categoriaCampagna, iconaCanale } from "@/lib/salute";

export const dynamic = "force-dynamic";

const SPIEGA_ESITO: Record<string, string> = {
  ok: "Nessun problema bloccante emerso",
  attenzione: "Ci sono gap da chiudere, non bloccanti",
  critico: "Problemi che richiedono un intervento immediato",
};

export default async function SchedaAnalisi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analisi = await prisma.analisi.findUnique({
    where: { id },
    include: { azioni: { orderBy: { creataIl: "desc" } } },
  });
  if (!analisi) notFound();

  const aperte = analisi.azioni.filter((a) => STATI_AZIONE_APERTI.includes(a.stato)).length;
  const categoria = categoriaCampagna(`${analisi.titolo} ${analisi.fileDrive ?? ""}`);
  const coloreEsito = analisi.esito ? COLORE_ESITO[analisi.esito] ?? "var(--text-tertiary)" : "var(--fill-active)";

  return (
    <div className="layout">
      <Sidebar attiva="analisi" brandAttivo={analisi.brand} canaleAttivo={analisi.canale ?? undefined} />
      <main className="main">
        <a className="ritorno" href="/analisi">← Analisi</a>

        <section className="scheda-hero">
          <span className="hero-barra" style={{ background: coloreEsito }} />
          <div className="hero-corpo">
            <div className="hero-tag">
              <span className="tag-salute" style={{ color: COLORE_BRAND[analisi.brand] ?? "var(--text-tertiary)" }}>
                <span className="dot" />
                {ETICHETTA_BRAND[analisi.brand] ?? analisi.brand}
              </span>
              {analisi.canale && (
                <span className="tag-neutro">
                  <Icona nome={iconaCanale(analisi.canale)} />
                  {ETICHETTA_CANALE[analisi.canale] ?? analisi.canale}
                </span>
              )}
              <span className="tag-neutro">
                <Icona nome={categoria.icona} />
                {categoria.nome}
              </span>
              <span className="tag-neutro">{ETICHETTA_TIPO_ANALISI[analisi.tipo] ?? analisi.tipo}</span>
            </div>
            <h1 className="page-title" style={{ fontSize: 26, marginTop: 10 }}>{analisi.titolo}</h1>
            <div className="hero-meta">
              <span>{formattaData(analisi.dataAnalisi)}</span>
              <span>·</span>
              <span>origine {analisi.origine}</span>
              {analisi.fileDrive && (
                <>
                  <span>·</span>
                  <span title={analisi.fileDrive} style={{ overflowWrap: "anywhere" }}>
                    {analisi.fileDrive.split("/").pop()}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="hero-esito" style={{ color: coloreEsito }}>
            <div className="hero-esito-valore">
              {analisi.esito ? ETICHETTA_ESITO[analisi.esito] ?? analisi.esito : "Nessun esito"}
            </div>
            <div className="hero-esito-nota">
              {analisi.esito ? SPIEGA_ESITO[analisi.esito] ?? "" : "Esito non dichiarato nel documento"}
            </div>
          </div>
        </section>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{analisi.azioni.length}</div>
            <div className="kpi-etichetta">Azioni derivate</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={aperte > 0 ? { color: "var(--orange)" } : undefined}>{aperte}</div>
            <div className="kpi-etichetta">Ancora aperte</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ fontSize: 18 }}>{ETICHETTA_TIPO_ANALISI[analisi.tipo] ?? analisi.tipo}</div>
            <div className="kpi-etichetta">Tipo di analisi</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ fontSize: 18 }}>
              {analisi.canale ? ETICHETTA_CANALE[analisi.canale] ?? analisi.canale : "—"}
            </div>
            <div className="kpi-etichetta">Canale</div>
          </div>
        </div>

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">Sintesi operativa</div>
              <div className="sintesi-testo">{analisi.sintesi}</div>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">
                Azioni derivate ({analisi.azioni.length}{aperte > 0 ? `, ${aperte} aperte` : ""})
              </div>
              {analisi.azioni.length === 0 ? (
                <div className="vuoto-mini">
                  Nessuna azione collegata: creane una dal bottone qui accanto.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Azione</th>
                        <th>Stato</th>
                        <th>Scadenza</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisi.azioni.map((a) => (
                        <tr key={a.id}>
                          <td><a href={`/azioni/${a.id}`} className="cella-nome">{a.titolo}</a></td>
                          <td>
                            <Badge testo={ETICHETTA_STATO_AZIONE[a.stato] ?? a.stato} colore={COLORE_STATO_AZIONE[a.stato] ?? "var(--text-tertiary)"} />
                          </td>
                          <td>
                            <Scadenza data={a.scadenza} chiusa={!STATI_AZIONE_APERTI.includes(a.stato)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div>
            <section className="scheda">
              <div className="scheda-titolo">Cosa fare</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <a className="btn" href={`/azioni/nuova?analisi=${analisi.id}&brand=${analisi.brand}`}>
                  Crea azione da questa analisi
                </a>
                <a className="btn btn-secondario" href={`/analisi?brand=${analisi.brand}`}>
                  Altre analisi {ETICHETTA_BRAND[analisi.brand] ?? analisi.brand}
                </a>
                {analisi.canale && (
                  <a className="btn btn-secondario" href={`/campagne?canale=${analisi.canale}`}>
                    Campagne {ETICHETTA_CANALE[analisi.canale] ?? analisi.canale}
                  </a>
                )}
              </div>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Documento su Drive</div>
              {analisi.fileDrive ? (
                <>
                  <div className="cella-sub" style={{ whiteSpace: "normal", overflowWrap: "anywhere", fontSize: 12.5 }}>
                    {analisi.fileDrive}
                  </div>
                  <div className="cella-sub" style={{ marginTop: 8 }}>
                    Il documento completo vive nella cartella “ADV DELUXY SRL”: questa scheda ne è
                    la sintesi ricercabile.
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <a className="btn small btn-secondario" href={`/drive?q=${encodeURIComponent(analisi.fileDrive.split("/").pop() ?? "")}`}>
                      Trova nell&apos;indice Drive
                    </a>
                  </div>
                </>
              ) : (
                <div className="vuoto-mini">Nessun documento collegato</div>
              )}
            </section>

            {analisi.note && (
              <section className="scheda">
                <div className="scheda-titolo">Note</div>
                <div className="sintesi-testo">{analisi.note}</div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
