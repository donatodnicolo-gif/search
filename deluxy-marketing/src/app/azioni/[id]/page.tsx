import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Scadenza } from "@/components/Scadenza";
import { Sidebar } from "@/components/Sidebar";
import { aggiungiFeedback, cambiaStatoAzione, chiudiAzioneConPaperTrail, esitoVerificaAzione } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  COLORE_BRAND,
  COLORE_PRIORITA,
  COLORE_STATO_AZIONE,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_OWNER,
  ETICHETTA_PRIORITA,
  ETICHETTA_STATO_AZIONE,
  formattaDataOra,
  STATI_AZIONE,
  STATI_AZIONE_APERTI,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

function descriviEvento(e: { tipo: string; da: string | null; a: string | null; testo: string | null }): string {
  if (e.tipo === "creazione") return e.testo ?? "Azione creata";
  if (e.tipo === "stato") {
    return `Stato: ${ETICHETTA_STATO_AZIONE[e.da ?? ""] ?? e.da ?? "—"} → ${ETICHETTA_STATO_AZIONE[e.a ?? ""] ?? e.a ?? "—"}`;
  }
  return e.testo ?? "";
}

export default async function SchedaAzione({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const azione = await prisma.azione.findUnique({
    where: { id },
    include: {
      analisi: { select: { id: true, titolo: true } },
      campagna: { select: { id: true, nome: true } },
      eventi: { orderBy: { creatoIl: "desc" } },
    },
  });
  if (!azione) notFound();
  const chiusa = !STATI_AZIONE_APERTI.includes(azione.stato);

  return (
    <div className="layout">
      <Sidebar attiva="azioni" />
      <main className="main">
        <a className="ritorno" href="/azioni">← Azioni</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">{azione.titolo}</h1>
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge testo={ETICHETTA_BRAND[azione.brand] ?? azione.brand} colore={COLORE_BRAND[azione.brand] ?? "var(--text-tertiary)"} />
              <Badge testo={`Priorità ${ETICHETTA_PRIORITA[azione.priorita] ?? azione.priorita}`} colore={COLORE_PRIORITA[azione.priorita] ?? "var(--text-tertiary)"} />
              <Badge testo={`Owner: ${ETICHETTA_OWNER[azione.owner] ?? azione.owner}`} colore="var(--text-secondary)" />
              {azione.riaperture > 0 && (
                <Badge testo={`Riaperta ${azione.riaperture}×`} colore="var(--red)" />
              )}
              {azione.verificataIl && <Badge testo="Verificata" colore="var(--green)" />}
              {azione.scadenza && (
                <span>
                  Scadenza: <Scadenza data={azione.scadenza} chiusa={chiusa} />
                </span>
              )}
            </p>
          </div>
        </div>

        <section className="scheda">
          <div className="scheda-titolo">Stato</div>
          <form className="pill-scelta" action={cambiaStatoAzione}>
            <input type="hidden" name="id" value={azione.id} />
            {STATI_AZIONE.map((s) => (
              <button
                key={s}
                className={`pill-opt${azione.stato === s ? " attuale" : ""}`}
                style={{ color: azione.stato === s ? undefined : COLORE_STATO_AZIONE[s] }}
                type="submit"
                name="stato"
                value={s}
                disabled={azione.stato === s}
              >
                <span className="dot" />
                <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_AZIONE[s]}</span>
              </button>
            ))}
          </form>
        </section>


        {STATI_AZIONE_APERTI.includes(azione.stato) && (
          <section className="scheda">
            <div className="scheda-titolo">Chiudi con paper-trail (regola 00.3)</div>
            <p className="cella-sub" style={{ marginBottom: 12 }}>
              Completamento ≠ efficacia: la chiusura registra PRIMA/DOPO e genera da sola la
              verifica a +72h. Solo dopo quella l&apos;azione è davvero VERIFICATA.
            </p>
            <form className="modulo" action={chiudiAzioneConPaperTrail}>
              <input type="hidden" name="id" value={azione.id} />
              <div className="campo-modulo">
                <label>Prima</label>
                <input name="prima" placeholder="stato esatto prima della modifica" />
              </div>
              <div className="campo-modulo">
                <label>Dopo</label>
                <input name="dopo" placeholder="stato esatto dopo" />
              </div>
              <div className="campo-modulo largo">
                <label>Esito</label>
                <input name="esito" placeholder="Come è andata, in una riga" />
              </div>
              <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                <button className="btn" type="submit">Segna FATTA + crea verifica +72h</button>
              </div>
            </form>
          </section>
        )}

        {azione.stato === "fatta" && !azione.verificataIl && (
          <section className="scheda">
            <div className="scheda-titolo">Verifica di efficacia (FATTA ≠ VERIFICATA)</div>
            <form className="modulo" action={esitoVerificaAzione} style={{ gridTemplateColumns: "2fr auto auto" }}>
              <input type="hidden" name="id" value={azione.id} />
              <div className="campo-modulo">
                <label>Nota di verifica</label>
                <input name="nota" placeholder="I numeri confermano l effetto?" />
              </div>
              <div className="azioni-modulo" style={{ alignSelf: "end" }}>
                <button className="btn small" name="esitoVerifica" value="verificata">✓ Verificata</button>
              </div>
              <div className="azioni-modulo" style={{ alignSelf: "end" }}>
                <button className="btn small btn-secondario" name="esitoVerifica" value="riaperta">Riapri</button>
              </div>
            </form>
          </section>
        )}

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">Storia &amp; feedback</div>
              <form className="modulo" action={aggiungiFeedback} style={{ marginBottom: 16 }}>
                <input type="hidden" name="id" value={azione.id} />
                <div className="campo-modulo largo">
                  <textarea name="testo" rows={2} required placeholder="Scrivi un feedback su questa azione (com'è andata, cosa cambiare)…" />
                </div>
                <div className="azioni-modulo" style={{ gridColumn: "1 / -1", justifyContent: "flex-start" }}>
                  <button className="btn small" type="submit" name="tipo" value="feedback">Aggiungi feedback</button>
                  <button className="btn small btn-secondario" type="submit" name="tipo" value="nota">Aggiungi nota</button>
                </div>
              </form>
              {azione.eventi.length === 0 ? (
                <div className="vuoto-mini">Nessun evento registrato</div>
              ) : (
                <ul className="storia">
                  {azione.eventi.map((e) => (
                    <li key={e.id}>
                      <span className="storia-data">{formattaDataOra(e.creatoIl)}</span>
                      <span className="storia-testo">
                        {e.tipo === "feedback" && <b>Feedback: </b>}
                        {descriviEvento(e)}
                      </span>
                      <span className="storia-autore">{e.autore}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div>
            <section className="scheda">
              <div className="scheda-titolo">Dettagli</div>
              <div className="griglia-campi" style={{ gridTemplateColumns: "1fr" }}>
                {azione.descrizione && (
                  <dl className="campo">
                    <dt>Descrizione</dt>
                    <dd>{azione.descrizione}</dd>
                  </dl>
                )}
                <dl className="campo">
                  <dt>Canale</dt>
                  <dd>{azione.canale ? ETICHETTA_CANALE[azione.canale] ?? azione.canale : "—"}</dd>
                </dl>
                {azione.analisi && (
                  <dl className="campo">
                    <dt>Nata dall&apos;analisi</dt>
                    <dd><a href={`/analisi/${azione.analisi.id}`} style={{ color: "var(--blue)" }}>{azione.analisi.titolo}</a></dd>
                  </dl>
                )}
                {azione.campagna && (
                  <dl className="campo">
                    <dt>Campagna</dt>
                    <dd><a href={`/campagne/${azione.campagna.id}`} style={{ color: "var(--blue)" }}>{azione.campagna.nome}</a></dd>
                  </dl>
                )}
                {azione.fileDrive && (
                  <dl className="campo">
                    <dt>Piano su Drive</dt>
                    <dd>{azione.fileDrive}</dd>
                  </dl>
                )}
                {azione.esito && (
                  <dl className="campo">
                    <dt>Esito</dt>
                    <dd>{azione.esito}</dd>
                  </dl>
                )}
                <dl className="campo">
                  <dt>Creata il</dt>
                  <dd>{formattaDataOra(azione.creataIl)}</dd>
                </dl>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
