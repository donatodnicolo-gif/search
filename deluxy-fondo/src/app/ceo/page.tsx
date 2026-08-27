/**
 * CEO — le persone al vertice.
 *
 * L'unità di analisi qui è la **persona**, non l'azienda: è la domanda che la tesi del fondo
 * pone davvero («cambia chi comanda, cambia il risultato?») e che le altre pagine, ordinate
 * per titolo, non possono formulare.
 *
 * Due cautele scritte in pagina, perché sono il punto debole della lettura:
 *  - un mandato non è una capacità: chi arriva in un settore in salita eredita un risultato;
 *  - il campione è piccolo e recente, quindi la maggior parte dei mandati non è ancora
 *    giudicabile. La pagina distingue i misurabili dagli altri invece di mediarli insieme.
 */

import { profiliCeo, riepilogo } from "@/lib/ceo";
import { Avviso, Badge, Metrica, Vuoto } from "@/componenti/pezzi";
import { dataBreve, numero, percentuale, prezzo, punti, verso } from "@/lib/formato";

export const dynamic = "force-dynamic";

const ETICHETTA_RUOLO: Record<string, string> = {
  guida: "caso guida",
  "controllo-riuscito": "controllo, riuscito",
  "controllo-fallito": "controllo, fallito",
  recente: "cambio recente",
};

const COLORE_RUOLO: Record<string, string> = {
  guida: "var(--gold)",
  "controllo-riuscito": "var(--green)",
  "controllo-fallito": "var(--red)",
  recente: "var(--blue)",
};

/** Filtro dalla query: nessuno stato lato browser, solo collegamenti. */
type Ricerca = { filtro?: string };

export default async function Ceo({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const q = await searchParams;
  const tutti = await profiliCeo();
  const r = riepilogo(tutti);

  const filtro = q.filtro ?? "tutti";
  const profili = tutti.filter((p) => {
    if (filtro === "misurati") return p.mandatiMisurati > 0;
    if (filtro === "sopra") return p.mandatiSopraIndice > 0;
    if (filtro === "esterni") return p.incarichi.some((i) => i.evento.successoreEsterno === true);
    if (filtro === "forzati") return p.incarichi.some((i) => i.evento.forzato === true);
    if (filtro === "catena") return p.usciteAltrove.length > 0;
    if (filtro === "profilo") return p.biografia !== null;
    return true;
  });

  const FILTRI = [
    { id: "tutti", testo: `Tutti (${tutti.length})` },
    { id: "misurati", testo: `Mandato misurabile (${tutti.filter((p) => p.mandatiMisurati > 0).length})` },
    { id: "sopra", testo: `Sopra l'indice (${tutti.filter((p) => p.mandatiSopraIndice > 0).length})` },
    { id: "esterni", testo: `Arrivati da fuori (${tutti.filter((p) => p.incarichi.some((i) => i.evento.successoreEsterno === true)).length})` },
    { id: "forzati", testo: `Dopo un'uscita forzata (${tutti.filter((p) => p.incarichi.some((i) => i.evento.forzato === true)).length})` },
    { id: "catena", testo: `Con un posto lasciato (${tutti.filter((p) => p.usciteAltrove.length > 0).length})` },
    { id: "profilo", testo: `Con percorso ricostruito (${tutti.filter((p) => p.biografia !== null).length})` },
  ];

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Le persone al vertice</h1>
        <p className="page-sub">
          Chi guida le aziende monitorate, da dove arriva, com&apos;è uscito il predecessore e
          quanto ha reso il titolo sotto la sua gestione rispetto al mercato.
        </p>
      </div>

      <div className="sezione">
        <div className="metriche">
          <Metrica nome="Persone censite" valore={String(r.persone)} nota={`${r.inCarica} in carica`} />
          <Metrica
            nome="Mandati misurabili"
            valore={`${r.mandatiMisurati} su ${r.persone}`}
            nota="gli altri sono troppo recenti o senza storico"
          />
          <Metrica
            nome="Sopra l'indice"
            valore={`${r.sopraIndice} su ${r.mandatiMisurati}`}
            nota={r.mandatiMisurati ? `${Math.round((r.sopraIndice / r.mandatiMisurati) * 100)}% dei misurabili` : null}
            colore={r.sopraIndice * 2 > r.mandatiMisurati ? "su" : "giu"}
          />
          <Metrica
            nome="Arrivati da fuori"
            valore={`${r.esterni} su ${r.esterni + r.interni + r.nonAccertati}`}
            nota={`${r.interni} promossi dall'interno`}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <Avviso grave titolo="Come NON leggere questa pagina.">
            Un mandato non misura una capacità. Chi arriva in un settore in salita eredita un
            risultato che non ha prodotto — nel campione ci sono la difesa europea e le banche
            coi tassi alti, dove il titolo sarebbe corso con qualsiasi gestione. E{" "}
            <strong>
              {r.mandatiMisurati} mandati su {r.persone}
            </strong>{" "}
            sono misurabili: gli altri sono cominciati troppo di recente. Con numeri così, questa
            è una <strong>scheda di monitoraggio</strong>, non una classifica di manager.
          </Avviso>
        </div>

        <div className="filtri">
          {FILTRI.map((f) => (
            <a key={f.id} className={`chip ${filtro === f.id ? "attivo" : ""}`} href={`/ceo?filtro=${f.id}`}>
              {f.testo}
            </a>
          ))}
        </div>
      </div>

      {/* ---------------- Elenco ---------------- */}
      <div className="sezione">
        <div className="sezione-titolo">
          {profili.length} {profili.length === 1 ? "persona" : "persone"}
        </div>

        {profili.length === 0 ? (
          <Vuoto
            titolo="Nessuna persona con questo filtro"
            azione={{ href: "/ceo", testo: "Mostra tutte le persone" }}
          >
            Il filtro scelto non corrisponde ad alcun profilo dell&apos;universo monitorato.
            Togli il filtro per tornare all&apos;elenco completo.
          </Vuoto>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {profili.map((p) => (
              <div className="card" key={p.nome}>
                <div className="card-testa">
                  <div>
                    <div className="card-titolo" style={{ fontSize: 17 }}>
                      {p.nome}
                    </div>
                    <div className="card-sub">
                      {p.incarichi
                        .map((i) => `${i.nomeAzienda} · ${i.settore}`)
                        .join(" — ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                    {p.quantiIncarichi > 1 ? (
                      <Badge testo={`${p.quantiIncarichi} incarichi`} colore="var(--gold)" forte />
                    ) : null}
                    {p.eccessoMedio !== null ? (
                      <Badge
                        testo={`${punti(p.eccessoMedio)} contro l'indice`}
                        colore={p.eccessoMedio > 0 ? "var(--green)" : "var(--red)"}
                        forte
                      />
                    ) : (
                      <Badge testo="mandato non misurabile" />
                    )}
                  </div>
                </div>

                {/* Percorso professionale: la parte con un legame plausibile col risultato */}
                {p.biografia ? (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Percorso</span>
                      {p.biografia.annoNascita ? (
                        <Badge testo={`classe ${p.biografia.annoNascita}`} />
                      ) : null}
                      {p.biografia.giaAmministratoreDelegato === true ? (
                        <Badge testo="aveva già guidato un'azienda" colore="var(--gold)" forte />
                      ) : p.biografia.giaAmministratoreDelegato === false ? (
                        <Badge testo="primo incarico da capo azienda" colore="var(--blue)" />
                      ) : null}
                      {p.biografia.confidenza !== "alta" ? (
                        <Badge testo={`confidenza ${p.biografia.confidenza}`} colore="var(--orange)" />
                      ) : null}
                    </div>

                    {p.biografia.formazione ? (
                      <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 }}>
                        <strong>Formazione:</strong> {p.biografia.formazione}
                      </div>
                    ) : null}

                    {p.biografia.carriera.length > 0 ? (
                      <div className="timeline" style={{ marginTop: 10 }}>
                        {p.biografia.carriera.map((t, k) => (
                          <div className="timeline-voce" key={`${t.azienda}-${k}`}>
                            <div className="timeline-data">
                              {t.da ?? "?"} — {t.a ?? "oggi"}
                            </div>
                            <div className="timeline-titolo">
                              {t.azienda} · {t.ruolo}
                            </div>
                            {t.nota ? <div className="timeline-testo">{t.nota}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {p.biografia.stileDichiarato ? (
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.55, maxWidth: "85ch" }}>
                        <strong>Come dice di lavorare:</strong> {p.biografia.stileDichiarato}
                      </p>
                    ) : null}

                    {/* I tratti: contesto, non segnale. L'avvertenza sta accanto, non in fondo. */}
                    {p.biografia.tratti.length > 0 ? (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                          Note biografiche
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--orange)", marginBottom: 7 }}>
                          Contesto su chi è la persona, <strong>non indicatori</strong>: nessuno di
                          questi elementi ha un legame dimostrato con il rendimento di un titolo.
                        </div>
                        <ul style={{ margin: "0 0 0 18px", fontSize: 12.5, lineHeight: 1.6 }}>
                          {p.biografia.tratti.map((tr, k) => (
                            <li key={k}>
                              {tr.tratto}
                              {tr.dettaglio ? (
                                <span style={{ color: "var(--text-secondary)" }}> — {tr.dettaglio}</span>
                              ) : null}
                              {tr.fonte ? (
                                <>
                                  {" "}
                                  <a href={tr.fonte} target="_blank" rel="noreferrer" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>
                                    fonte
                                  </a>
                                </>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {p.biografia.fonti.length > 0 ? (
                      <div className="fonte">
                        {p.biografia.fonti.map((f, k) => (
                          <span key={f.url}>
                            {k > 0 ? " · " : ""}
                            <a href={f.url} target="_blank" rel="noreferrer">
                              {f.titolo}
                            </a>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Un blocco per incarico */}
                {p.incarichi.map((i) => (
                  <div
                    key={i.evento.id}
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: "1px solid var(--hairline)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{i.nomeAzienda}</span>
                      <Badge testo={ETICHETTA_RUOLO[i.ruolo] ?? i.ruolo} colore={COLORE_RUOLO[i.ruolo]} />
                      <Badge testo={i.inCorso ? "in carica" : "mandato concluso"} colore={i.inCorso ? "var(--green)" : "var(--text-tertiary)"} />
                      <Badge testo={i.evento.tier} />
                      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                        dal {dataBreve(i.evento.dataAnnuncio)}
                        {i.evento.dataEfficacia && i.evento.dataEfficacia !== i.evento.dataAnnuncio
                          ? ` · in carica dal ${dataBreve(i.evento.dataEfficacia)}`
                          : ""}
                        {i.mandato ? ` · ${numero(i.mandato.anni, 1)} anni` : ""}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 12.5 }}>
                      <span style={{ color: "var(--text-secondary)" }}>
                        Provenienza:{" "}
                        <strong>
                          {i.evento.successoreEsterno === null
                            ? "non accertata"
                            : i.evento.successoreEsterno
                              ? "da fuori il gruppo"
                              : "promosso dall'interno"}
                        </strong>
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        Predecessore: <strong>{i.predecessore ?? "non indicato"}</strong>
                        {i.evento.forzato === null
                          ? " (uscita non accertata)"
                          : i.evento.forzato
                            ? " (uscita forzata)"
                            : " (uscita ordinata)"}
                      </span>
                    </div>

                    <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.55, maxWidth: "85ch" }}>
                      {i.evento.descrizione}
                    </p>

                    {/* I numeri del mandato */}
                    {i.mandato ? (
                      <div className="metriche" style={{ marginTop: 10 }}>
                        <Metrica
                          nome="Il titolo sotto questa gestione"
                          valore={percentuale(i.mandato.rendimento)}
                          nota={`${prezzo(i.mandato.prezzoIniziale, i.mandato.valuta)} → ${prezzo(i.mandato.prezzoFinale, i.mandato.valuta)}`}
                          colore={verso(i.mandato.rendimento)}
                        />
                        <Metrica
                          nome="L'indice nello stesso periodo"
                          valore={percentuale(i.mandato.rendimentoBenchmark)}
                          nota="a dividendi reinvestiti"
                          colore={verso(i.mandato.rendimentoBenchmark)}
                        />
                        <Metrica
                          nome="Differenza"
                          valore={punti(i.mandato.eccesso)}
                          nota="è la colonna che conta"
                          colore={verso(i.mandato.eccesso)}
                        />
                        <Metrica
                          nome="Massimo ribasso nel mandato"
                          valore={percentuale(i.mandato.drawdown?.valore ?? null)}
                          nota="quanto ha dovuto sopportare chi è restato"
                          colore="giu"
                        />
                      </div>
                    ) : (
                      <div style={{ marginTop: 10 }}>
                        <Badge testo="non misurabile" colore="var(--text-tertiary)" />
                        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", marginLeft: 8 }}>
                          {i.problema}
                        </span>
                      </div>
                    )}

                    {i.evento.fonti.length > 0 ? (
                      <div className="fonte">
                        {i.evento.fonti.map((f, k) => (
                          <span key={f.url}>
                            {k > 0 ? " · " : ""}
                            <a href={f.url} target="_blank" rel="noreferrer">
                              {f.titolo}
                            </a>
                          </span>
                        ))}
                        {i.evento.confidenza !== "alta" ? (
                          <span style={{ color: "var(--orange)" }}> · confidenza {i.evento.confidenza}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}

                {/* La catena: dove questa persona ha lasciato un posto */}
                {p.usciteAltrove.length > 0 ? (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: "1px solid var(--hairline)",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <strong>Ha lasciato:</strong>{" "}
                    {p.usciteAltrove.map((u, k) => (
                      <span key={u.simbolo + u.data}>
                        {k > 0 ? " · " : ""}
                        {u.nomeAzienda} ({dataBreve(u.data)})
                      </span>
                    ))}
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                      Compare come predecessore in queste società: è la catena delle poltrone, e
                      spiega perché due cambi di vertice apparentemente separati sono lo stesso
                      movimento.
                    </div>
                  </div>
                ) : null}

                {/* Notizie che la nominano */}
                {p.notizie.length > 0 ? (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 550, marginBottom: 6 }}>
                      Notizie che citano il cognome
                    </div>
                    <ul style={{ margin: "0 0 0 18px", fontSize: 12.5, lineHeight: 1.6 }}>
                      {p.notizie.map((n) => (
                        <li key={n.url}>
                          <a href={n.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                            {n.titolo}
                          </a>
                          {n.editore ? (
                            <span style={{ color: "var(--text-tertiary)" }}> — {n.editore}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
                      Filtro sul solo cognome: può pescare omonimi e notizie non pertinenti. Sono
                      titoli da leggere, non fatti accertati.
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sezione">
        <div className="card">
          <div className="card-titolo" style={{ fontSize: 15 }}>
            Cosa dicono questi numeri, e cosa no
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8 }}>
            Su {r.mandatiMisurati} mandati misurabili, <strong>{r.sopraIndice}</strong> battono
            l&apos;indice. {r.dopoUscitaForzata} delle nomine censite arrivano dopo un&apos;uscita
            forzata del predecessore, e {r.esterni} portano una persona da fuori il gruppo: sono
            proprio le due condizioni che la letteratura associa ai turnaround riusciti, e per
            questo il campione è interessante da seguire nei prossimi anni.
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 10 }}>
            Ma oggi non decide nulla. La maggior parte di questi mandati è cominciata da mesi, e
            un rendimento su pochi mesi dice più del mercato che della persona. La pagina serve a{" "}
            <strong>tenere il conto adesso</strong>, così fra tre anni ci sarà una misura fatta
            in anticipo invece di un racconto costruito dopo.
          </p>
        </div>
      </div>
    </main>
  );
}
