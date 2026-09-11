import { creaOperazioneAnnuncioMeta } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { annunciMeta } from "@/lib/meta-annunci";

// Gli ANNUNCI della campagna Meta, con le creatività: letti VIVI dalla Graph
// API quando si apre la scheda — nessuna copia in database. Si vedono TUTTI
// gli stati, comprese le PAUSED (è come nascono i nostri lanci).
//
// ⚠️ Le «bozze» di Ads Manager (mai pubblicate) non esistono per l'API:
// la sezione lo dice invece di far credere che non ci sia niente.
//
// Da qui si può anche FERMARE un singolo annuncio (o riaccenderlo): serve a
// spegnere una creatività che non rende senza fermare l'ad set, che è la
// ragione per cui si guarda questo riquadro. La modifica non parte da qui:
// passa dalla coda con approvazione, come tutto il resto.

const ETICHETTA_FORMATO: Record<string, string> = {
  immagine: "Immagine",
  video: "Video",
  carosello: "Carosello",
  catalogo: "Catalogo",
  altro: "Altro",
};

const ETICHETTA_ATTESA: Record<string, string> = {
  pausa_annuncio: "pausa chiesta",
  attiva_annuncio: "riattivazione chiesta",
};

export async function AnnunciMeta({
  idCampagnaEsterno,
  campagnaId,
  ritorno,
}: {
  idCampagnaEsterno: string;
  /** Serve ai comandi: senza, il riquadro resta di sola lettura. */
  campagnaId?: string;
  ritorno?: string;
}) {
  const esito = await annunciMeta(idCampagnaEsterno);

  // Le operazioni già in coda su questi annunci: senza, chi ha appena chiesto
  // una pausa vede l'annuncio ancora «Attivo» (è vero: su Meta lo è finché
  // qualcuno non approva) e clicca di nuovo. La riga lo dice.
  const attese = new Map<string, { tipo: string; stato: string }>();
  if (campagnaId) {
    const righe = await prisma.operazioneAdv.findMany({
      where: {
        tipo: { in: ["pausa_annuncio", "attiva_annuncio"] },
        campagnaId,
        stato: { in: ["in_attesa", "approvata"] },
      },
      select: { tipo: true, stato: true, parametri: true },
    });
    for (const r of righe) {
      try {
        const id = String(JSON.parse(r.parametri ?? "{}").idAnnuncio ?? "");
        if (id) attese.set(id, { tipo: r.tipo, stato: r.stato });
      } catch {
        // parametri illeggibili: niente indicatore, ma il riquadro resta in piedi
      }
    }
  }

  // Quanti annunci ACCESI ha ciascun ad set, contati sulla lettura viva appena
  // fatta: serve all'avviso «fermando questo, l'ad set non eroga più niente».
  //
  // ⚠️ Si conta lo stato PROPRIO dell'annuncio (`status`), non quello
  // effettivo. Se l'ad set è in pausa, tutti i suoi annunci hanno un effettivo
  // diverso da ACTIVE: contando quello il conto sarebbe zero e l'avviso
  // scatterebbe sempre, dicendo «è l'unico attivo» di un annuncio fra dieci.
  // La domanda è «quanti annunci resteranno accesi dentro l'ad set», e quella
  // la risponde `status`.
  const accesiPerAdSet = new Map<string, number>();
  if (esito.ok) {
    for (const a of esito.annunci) {
      if (a.stato !== "ACTIVE") continue;
      const k = a.gruppo ?? "";
      accesiPerAdSet.set(k, (accesiPerAdSet.get(k) ?? 0) + 1);
    }
  }

  return (
    <section className="scheda" id="annunci-meta">
      <div className="scheda-titolo">Annunci su Meta (dal vivo)</div>
      {!esito.ok ? (
        <div className="vuoto-mini">Non riesco a leggerli adesso: {esito.errore}</div>
      ) : esito.annunci.length === 0 ? (
        <div className="vuoto-mini">
          Nessun annuncio su questa campagna. ⚠️ Le «bozze» di Ads Manager (mai pubblicate)
          non viaggiano nell&apos;API: se ne hai una lì, qui non può comparire finché non è
          pubblicata — anche solo in pausa.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {esito.annunci.map((a) => {
              const attesa = attese.get(a.id);
              // ⚠️⚠️ IL VERSO DEL BOTTONE LO DECIDE `status`, NON
              // `effective_status`. Un annuncio ACTIVE dentro un ad set fermo
              // ha effettivo `ADSET_PAUSED`: guardando quello si sarebbe
              // offerto «Riattiva» su un annuncio già acceso, cioè una POST
              // che scrive ACTIVE su ACTIVE — Meta la accetta, la rilettura
              // conferma, e l'operazione risulta ESEGUITA senza aver cambiato
              // niente. Un comando che riesce senza fare nulla è peggio di uno
              // che fallisce: non lascia traccia del malinteso.
              const acceso = a.stato === "ACTIVE";
              const accesiQui = accesiPerAdSet.get(a.gruppo ?? "") ?? 0;
              // Quando i due stati non coincidono è una notizia: l'annuncio è
              // acceso ma qualcosa sopra lo tiene fermo, e fermarlo non
              // cambierebbe quello che si vede in giro.
              const bloccatoDaSopra = acceso && a.effettivo !== "ACTIVE";
              return (
                <div
                  key={a.id}
                  style={{
                    display: "flex", gap: 12, padding: 12,
                    border: "1px solid var(--hairline)", borderRadius: 12,
                    background: "var(--surface)",
                  }}
                >
                  {/* La miniatura è un URL firmato di Meta che SCADE: si mostra
                      e basta, mai salvarlo. */}
                  {a.miniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.miniatura}
                      alt=""
                      width={72}
                      height={72}
                      style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: 8, background: "var(--fill)", flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cella-nome" style={{ whiteSpace: "normal", fontSize: 13 }}>{a.nome}</div>
                    <div className="card-campagna-tag" style={{ marginTop: 4 }}>
                      <span
                        className="tag-salute"
                        style={{ color: a.effettivo === "ACTIVE" ? "var(--green)" : a.stato === "PAUSED" ? "var(--orange)" : "var(--text-tertiary)" }}
                        title={`Stato ${a.stato} · effettivo ${a.effettivo}`}
                      >
                        <span className="dot" />
                        {a.effettivo === "ACTIVE" ? "Attivo" : a.stato === "PAUSED" ? "In pausa" : a.effettivo}
                      </span>
                      <span className="tag-neutro">
                        {ETICHETTA_FORMATO[a.formato]}
                        {a.schede ? ` · ${a.schede} schede` : ""}
                      </span>
                    </div>
                    {(a.titolo || a.testo) && (
                      <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 5 }}>
                        {a.titolo && <b>{a.titolo}</b>}
                        {a.titolo && a.testo && " — "}
                        {a.testo && (a.testo.length > 110 ? `${a.testo.slice(0, 110)}…` : a.testo)}
                      </div>
                    )}
                    {a.gruppo && <div className="cella-sub" style={{ marginTop: 3 }}>ad set: {a.gruppo}</div>}
                    {bloccatoDaSopra && (
                      <div
                        className="cella-sub"
                        style={{ marginTop: 3, color: "var(--orange)" }}
                        title={`status ${a.stato} · effective_status ${a.effettivo}`}
                      >
                        acceso, ma Meta lo dà come {a.effettivo}: c&apos;è qualcosa sopra che lo
                        tiene fermo (di solito l&apos;ad set o la campagna in pausa)
                      </div>
                    )}

                    {/* ⚠️ Lo stato che si vede è quello di META, non quello che
                        abbiamo chiesto: finché nessuno approva, l'annuncio è
                        ancora attivo e la scritta lo dice giusto. L'attesa si
                        segnala accanto, invece di mentire sullo stato. */}
                    {attesa && (
                      <div className="cella-sub" style={{ marginTop: 4, color: "var(--orange)" }}>
                        ⏳ {ETICHETTA_ATTESA[attesa.tipo] ?? attesa.tipo} ·{" "}
                        {attesa.stato === "approvata" ? "approvata, la esegue l'app" : "da approvare"}
                      </div>
                    )}

                    {campagnaId && !attesa && (a.stato === "ACTIVE" || a.stato === "PAUSED") && (
                      <form action={creaOperazioneAnnuncioMeta} style={{ marginTop: 8 }}>
                        <input type="hidden" name="campagnaId" value={campagnaId} />
                        <input type="hidden" name="idAnnuncio" value={a.id} />
                        <input type="hidden" name="etichetta" value={a.nome} />
                        <input type="hidden" name="adSet" value={a.gruppo ?? ""} />
                        <input type="hidden" name="verso" value={acceso ? "pausa" : "attiva"} />
                        {/* Quanti annunci attivi ha il suo ad set, contati adesso:
                            serve solo all'avviso per chi approva. */}
                        <input type="hidden" name="attiviNelSuoAdSet" value={accesiQui} />
                        {ritorno && <input type="hidden" name="ritorno" value={`${ritorno}#annunci-meta`} />}
                        <button
                          className="btn small btn-secondario"
                          type="submit"
                          title={
                            acceso
                              ? "Mette in coda la pausa di QUESTO annuncio: gli altri dell'ad set continuano"
                              : "Mette in coda la riattivazione di questo annuncio"
                          }
                        >
                          {acceso ? "Metti in pausa" : "Riattiva"}
                        </button>
                      </form>
                    )}
                    {/* ⚠️ Un annuncio in stato DELETED o ARCHIVED non si tocca:
                        offrire un bottone che Meta rifiuta è una promessa
                        vuota, e lasciarlo spento e muto non spiega perché. */}
                    {campagnaId && a.stato !== "ACTIVE" && a.stato !== "PAUSED" && (
                      <div className="cella-sub" style={{ marginTop: 6 }}>
                        stato «{a.stato}»: non si accende né si spegne da qui
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
            Letti adesso dalla Graph API, miniature comprese. ⚠️ Le «bozze» di Ads Manager mai
            pubblicate non sono nell&apos;API: qui compaiono gli annunci reali in ogni stato — anche
            in pausa, che è come nascono quelli lanciati dall&apos;app.
            {campagnaId && (
              <>
                {" "}
                <b>Fermare un annuncio</b> passa dalla coda con approvazione, come ogni altra
                modifica: l&apos;app la esegue su Meta appena approvata, e lo stato qui sopra resta
                quello vero di Meta finché non è fatta.
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
