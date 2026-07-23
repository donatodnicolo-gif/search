import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
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

export const dynamic = "force-dynamic";

export default async function SchedaAnalisi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analisi = await prisma.analisi.findUnique({
    where: { id },
    include: { azioni: { orderBy: { creataIl: "desc" } } },
  });
  if (!analisi) notFound();

  const aperte = analisi.azioni.filter((a) => STATI_AZIONE_APERTI.includes(a.stato)).length;

  return (
    <div className="layout">
      <Sidebar attiva="analisi" />
      <main className="main">
        <a className="ritorno" href="/analisi">← Analisi &amp; audit</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">{analisi.titolo}</h1>
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge testo={ETICHETTA_TIPO_ANALISI[analisi.tipo] ?? analisi.tipo} colore="var(--text-secondary)" />
              <Badge testo={ETICHETTA_BRAND[analisi.brand] ?? analisi.brand} colore={COLORE_BRAND[analisi.brand] ?? "var(--text-tertiary)"} />
              {analisi.esito && (
                <Badge testo={ETICHETTA_ESITO[analisi.esito] ?? analisi.esito} colore={COLORE_ESITO[analisi.esito] ?? "var(--text-tertiary)"} />
              )}
            </p>
          </div>
          <a className="btn" href={`/azioni/nuova?analisi=${analisi.id}&brand=${analisi.brand}`}>
            Crea azione da questa analisi
          </a>
        </div>

        <section className="scheda">
          <div className="scheda-titolo">Sintesi operativa</div>
          <div className="sintesi-testo">{analisi.sintesi}</div>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">Dettagli</div>
          <div className="griglia-campi">
            <dl className="campo">
              <dt>Data dell&apos;analisi</dt>
              <dd>{formattaData(analisi.dataAnalisi)}</dd>
            </dl>
            <dl className="campo">
              <dt>Canale</dt>
              <dd>{analisi.canale ? ETICHETTA_CANALE[analisi.canale] ?? analisi.canale : "—"}</dd>
            </dl>
            <dl className="campo">
              <dt>Origine</dt>
              <dd>{analisi.origine}</dd>
            </dl>
            <dl className="campo">
              <dt>Depositata il</dt>
              <dd>{formattaData(analisi.creataIl)}</dd>
            </dl>
            <dl className="campo campo-largo">
              <dt>Documento su Drive (ADV DELUXY SRL)</dt>
              <dd>{analisi.fileDrive ?? "—"}</dd>
            </dl>
            {analisi.note && (
              <dl className="campo campo-largo">
                <dt>Note</dt>
                <dd>{analisi.note}</dd>
              </dl>
            )}
          </div>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">
            Azioni derivate ({analisi.azioni.length}{aperte > 0 ? `, ${aperte} aperte` : ""})
          </div>
          {analisi.azioni.length === 0 ? (
            <div className="vuoto-mini">Nessuna azione collegata a questa analisi</div>
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
                      <td>
                        <a href={`/azioni/${a.id}`} className="cella-nome">{a.titolo}</a>
                      </td>
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
      </main>
    </div>
  );
}
