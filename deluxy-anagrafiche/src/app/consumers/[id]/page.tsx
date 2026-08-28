import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TornaIndietro } from "@/components/TornaIndietro";
import { prisma } from "@/lib/db";
import { attivita, coloreSegmento, coloreTipologia, nomeSegmento, nomeTipologia } from "@/lib/consumers";

export const dynamic = "force-dynamic";

const euro = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const dataIt = (d: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");

function Campo({ etichetta, valore, largo }: { etichetta: string; valore: string | null; largo?: boolean }) {
  return (
    <div className={`campo${largo ? " largo" : ""}`}>
      <dt>{etichetta}</dt>
      <dd>{valore || "—"}</dd>
    </div>
  );
}

// La scheda di una persona che compra da noi. Tutto quello che si vede qui è
// stato calcolato da Orders: la scheda lo dice in testa e rimanda là, perché
// chi vuole gli ordini uno per uno deve andare dove vivono.
export default async function SchedaConsumer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.consumer.findUnique({
    where: { id },
    include: { partner: { select: { id: true, nome: true, citta: true, stato: true } } },
  });
  if (!c) notFound();

  const att = attivita(c.giorniDallUltimo);
  const codice = Buffer.from(c.chiave, "utf8").toString("base64url");

  return (
    <div className="layout">
      <Sidebar consumersAttivi />
      <main className="main">
        <TornaIndietro fallback="/consumers" label="Consumers" />

        <div className="page-head">
          <div>
            <h1 className="page-title">{c.nome ?? c.email ?? c.telefono ?? "Senza nome"}</h1>
            <p className="page-sub">
              {[c.citta, c.email, c.telefono].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              className="btn btn-secondario"
              style={{ fontSize: 12.5, padding: "6px 14px" }}
              href={`https://deluxy-orders.vercel.app/clienti/${codice}`}
              target="_blank"
              rel="noreferrer"
              title="Gli ordini uno per uno stanno in Orders, che li possiede"
            >
              Vedi gli ordini in Orders ↗
            </a>
          </div>
        </div>

        <section className="scheda pannello-stati">
          <div className="riga-dimensione">
            <span className="etichetta-dimensione">Tipologia</span>
            <span className="badge" style={{ color: coloreTipologia(c.tipologia) }}>
              <span className="dot" />
              {nomeTipologia(c.tipologia)}
            </span>
          </div>
          <div className="riga-dimensione">
            <span className="etichetta-dimensione">Segmento</span>
            <span className="badge" style={{ color: coloreSegmento(c.segmento) }}>
              <span className="dot" />
              {nomeSegmento(c.segmento)}
            </span>
          </div>
          <div className="riga-dimensione">
            <span className="etichetta-dimensione">Da quanto</span>
            <span className="badge" style={{ color: att.colore }}>
              <span className="dot" />
              {att.nome}
            </span>
          </div>
        </section>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{c.ordini}</div>
            <div className="kpi-etichetta">Ordini{c.annullati > 0 ? ` (+${c.annullati} annullati)` : ""}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{euro(c.speso)}</div>
            <div className="kpi-etichetta">Speso</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{euro(c.ordineMedio)}</div>
            <div className="kpi-etichetta">Ordine medio</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{dataIt(c.ultimoOrdine)}</div>
            <div className="kpi-etichetta">Ultimo ordine</div>
          </div>
        </div>

        {c.riassunto ? (
          <section className="scheda">
            <h2 className="scheda-titolo">
              Chi è <span className="scheda-sub">riassunto scritto dall&apos;AI in Orders leggendo i suoi ordini</span>
            </h2>
            <p style={{ margin: "0 0 10px", fontSize: 14 }}>{c.riassunto}</p>
            {c.gusti && (
              <p className="testo-guida" style={{ margin: 0 }}>
                <strong>Gusti:</strong> {c.gusti}
              </p>
            )}
            {c.riepilogoOrdini != null && c.ordini > c.riepilogoOrdini && (
              <p className="testo-guida" style={{ marginBottom: 0 }}>
                ⚠️ Scritto su {c.riepilogoOrdini} ordini, da allora ne sono arrivati altri{" "}
                {c.ordini - c.riepilogoOrdini}: parla di una persona un po&apos; più vecchia di quella
                che hai davanti.
              </p>
            )}
          </section>
        ) : (
          <section className="scheda">
            <h2 className="scheda-titolo">Chi è</h2>
            <p className="testo-guida" style={{ margin: 0 }}>
              Nessun riassunto ancora scritto — <strong>non vuol dire «persona senza preferenze»</strong>.
              Si scrivono in Orders (ognuno costa una chiamata all&apos;AI), e da qui si leggono soltanto.
            </p>
          </section>
        )}

        <section className="scheda">
          <h2 className="scheda-titolo">Dati</h2>
          <dl className="griglia-campi">
            <Campo etichetta="Email" valore={c.email} />
            <Campo etichetta="Telefono" valore={c.telefono} />
            <Campo etichetta="Città" valore={c.citta} />
            <Campo etichetta="Brand comprati" valore={c.brand.join(", ")} />
            <Campo etichetta="Primo ordine" valore={dataIt(c.primoOrdine)} />
            <Campo etichetta="Ultimo ordine" valore={dataIt(c.ultimoOrdine)} />
            {/* Il canale del PRIMO ordine: una persona la si acquista una volta
                sola. Vuoto NON vuol dire «diretto», vuol dire che non lo sappiamo. */}
            <Campo etichetta="Come è arrivata" valore={c.acquisizioneCanale || "non indicato"} />
            <Campo
              etichetta="Fotografia scattata il"
              valore={c.sincronizzatoIl.toLocaleString("it-IT")}
            />
          </dl>
        </section>

        <section className="scheda">
          <h2 className="scheda-titolo">
            Azienda del registro <span className="scheda-sub">se questa persona è anche un&apos;anagrafica B2B</span>
          </h2>
          {c.partner ? (
            <p style={{ margin: 0, fontSize: 13.5 }}>
              È la stessa realtà di{" "}
              <a href={`/partner/${c.partner.id}`}>
                <strong>{c.partner.nome}</strong>
              </a>
              {c.partner.citta && <span className="cella-fonte"> · {c.partner.citta}</span>}{" "}
              <span className="cella-fonte">— agganciata per {c.agganciatoCome}</span>
            </p>
          ) : (
            <p className="testo-guida" style={{ margin: 0 }}>
              Nessuna azienda agganciata. L&apos;aggancio si fa per <strong>email o telefono</strong>:
              il nome no, perché sui dati veri trovava 2 casi su 61 e produceva falsi positivi.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
