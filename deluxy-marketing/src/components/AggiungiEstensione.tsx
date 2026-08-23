"use client";

import { useRef, useState, useTransition } from "react";

// Aggiungere un'estensione alla campagna: sitelink, callout, snippet.
//
// ⚠️ PERCHÉ SOLO QUESTE TRE. Sono quelle che si scrivono con del testo. Le
// immagini vogliono un file già caricato nell'account, e un file non entra in
// un'operazione: quelle restano da fare in Google Ads, e la pagina lo dice
// invece di offrire un bottone che poi fallisce.
//
// ⚠️ LE ESTENSIONI NASCONO SULLA CAMPAGNA. Google le tiene anche a livello di
// account (valgono per tutte le campagne di quel conto) e di gruppo: da qui si
// aggancia a QUESTA campagna, che è la scelta più prudente — una di account,
// messa per sbaglio, comparirebbe su tutto il brand.
export function AggiungiEstensione({
  campagnaId,
  nomeCampagna,
  azione,
  ritorno,
}: {
  campagnaId: string;
  nomeCampagna: string;
  azione: (input: {
    campagnaId: string;
    tipo: string;
    testo: string;
    url: string;
    descrizione1: string;
    descrizione2: string;
    header: string;
    valori: string[];
    ritorno: string;
  }) => Promise<{ ok: true; messaggio: string } | { ok: false; errore: string }>;
  ritorno: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [tipo, setTipo] = useState("sitelink");
  const [testo, setTesto] = useState("");
  const [url, setUrl] = useState("");
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [header, setHeader] = useState("");
  const [valoriTesto, setValoriTesto] = useState("");
  const [esito, setEsito] = useState<{ ok: true; messaggio: string } | { ok: false; errore: string } | null>(null);
  const [inCorso, avvia] = useTransition();

  const valori = valoriTesto
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  // I limiti di Google, contati mentre si scrive: scoprirli dal rifiuto vuol
  // dire un giro di script buttato.
  const problemi: string[] = [];
  if (tipo === "sitelink") {
    if (!testo.trim()) problemi.push("manca il testo del link");
    else if (testo.trim().length > 25) problemi.push(`il testo del link è di ${testo.trim().length} caratteri (max 25)`);
    if (!url.trim()) problemi.push("manca la pagina di destinazione");
    else if (!/^https?:\/\//i.test(url.trim())) problemi.push("la destinazione deve cominciare con http:// o https://");
    if (d1.trim().length > 35) problemi.push(`la prima riga è di ${d1.trim().length} caratteri (max 35)`);
    if (d2.trim().length > 35) problemi.push(`la seconda riga è di ${d2.trim().length} caratteri (max 35)`);
  }
  if (tipo === "callout") {
    if (!testo.trim()) problemi.push("manca il testo");
    else if (testo.trim().length > 25) problemi.push(`il callout è di ${testo.trim().length} caratteri (max 25)`);
  }
  if (tipo === "snippet") {
    if (!header.trim()) problemi.push("manca l'intestazione");
    // ⚠️ 3 è il minimo di Google, non una nostra preferenza: con due valori la
    // creazione fallisce con un messaggio che non dice quanti ne servano.
    if (valori.length < 3) problemi.push(`servono almeno 3 valori (ce ne sono ${valori.length})`);
    if (valori.some((v) => v.length > 25)) problemi.push("un valore supera i 25 caratteri");
  }
  const pronto = problemi.length === 0;

  const campo: React.CSSProperties = {
    font: "inherit",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--hairline-strong)",
    width: "100%",
  };

  return (
    <>
      <button
        type="button"
        className="btn small btn-secondario"
        onClick={() => {
          setEsito(null);
          dialogo.current?.showModal();
        }}
        title="Aggiungi un sitelink, un callout o uno snippet a questa campagna"
      >
        Aggiungi estensione
      </button>

      <dialog
        ref={dialogo}
        className="modale"
        onClick={(e) => {
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
      >
        <div className="modale-corpo">
          <div className="modale-testa">
            <div>
              <div className="modale-occhiello">Nuova estensione</div>
              <div className="modale-titolo">{nomeCampagna}</div>
              <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
                Le estensioni sono spazio gratuito nella pagina dei risultati: un annuncio più alto
                viene guardato di più a parità di offerta.
              </div>
            </div>
            <button type="button" className="modale-chiudi" aria-label="Chiudi" onClick={() => dialogo.current?.close()}>
              ✕
            </button>
          </div>

          <div className="modale-elenco" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <label className="modale-campo" style={{ marginBottom: 14 }}>
              Che tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="sitelink">Sitelink — un link in più, con la sua pagina</option>
                <option value="callout">Callout — una frase breve che non si clicca</option>
                <option value="snippet">Snippet — un elenco per categoria</option>
              </select>
            </label>

            {tipo === "sitelink" && (
              <>
                <label className="modale-campo" style={{ marginBottom: 4 }}>
                  Testo del link (max 25 caratteri)
                  <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Consegna in giornata" style={campo} />
                </label>
                <div className="cella-sub" style={{ marginBottom: 14 }}>{testo.trim().length}/25</div>
                <label className="modale-campo" style={{ marginBottom: 14 }}>
                  Dove porta
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={campo} />
                </label>
                <label className="modale-campo" style={{ marginBottom: 4 }}>
                  Prima riga di descrizione (facoltativa, max 35)
                  <input value={d1} onChange={(e) => setD1(e.target.value)} style={campo} />
                </label>
                <div className="cella-sub" style={{ marginBottom: 10 }}>{d1.trim().length}/35</div>
                <label className="modale-campo" style={{ marginBottom: 4 }}>
                  Seconda riga (facoltativa, max 35)
                  <input value={d2} onChange={(e) => setD2(e.target.value)} style={campo} />
                </label>
                <div className="cella-sub">{d2.trim().length}/35</div>
              </>
            )}

            {tipo === "callout" && (
              <>
                <label className="modale-campo" style={{ marginBottom: 4 }}>
                  Testo (max 25 caratteri)
                  <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Consegna in giornata" style={campo} />
                </label>
                <div className="cella-sub">{testo.trim().length}/25</div>
              </>
            )}

            {tipo === "snippet" && (
              <>
                <label className="modale-campo" style={{ marginBottom: 14 }}>
                  Intestazione
                  <input value={header} onChange={(e) => setHeader(e.target.value)} placeholder="es. Servizi" style={campo} />
                </label>
                <label className="modale-campo" style={{ marginBottom: 4 }}>
                  Valori — uno per riga
                  <textarea
                    value={valoriTesto}
                    onChange={(e) => setValoriTesto(e.target.value)}
                    rows={5}
                    placeholder={"Consegna a domicilio\nBiglietto scritto a mano\nVaso incluso"}
                    style={{ ...campo, resize: "vertical" }}
                  />
                </label>
                <div className="cella-sub">
                  {valori.length} valori · Google ne vuole <b>da 3 a 10</b>
                </div>
              </>
            )}
          </div>

          <div className="modale-avviso">
            Va <b>in coda</b>, da approvare: da qui non si scrive niente su Google. L&apos;estensione
            nasce nell&apos;account e viene agganciata a <b>questa campagna</b> — non a tutto il
            conto. Le <b>immagini</b> non si creano da qui: vogliono un file caricato nell&apos;account,
            e un file non entra in un&apos;operazione.
          </div>

          {esito && (
            <div className={esito.ok ? "avviso-ok" : "modale-avviso"} style={{ margin: "0 18px 10px" }}>
              {esito.ok ? (
                <>
                  {esito.messaggio}{" "}
                  <a href={`/operazioni?torna=${encodeURIComponent(ritorno)}`} style={{ textDecoration: "underline" }}>
                    Vai ad approvarla
                  </a>
                </>
              ) : (
                esito.errore
              )}
            </div>
          )}

          {!pronto && (testo || url || header || valori.length > 0) && (
            <div className="cella-sub" style={{ margin: "0 18px 10px", whiteSpace: "normal" }}>
              Manca ancora: {problemi.join(" · ")}.
            </div>
          )}

          <div className="modale-piede">
            <button type="button" className="btn small btn-secondario" onClick={() => dialogo.current?.close()}>
              Chiudi
            </button>
            <button
              type="button"
              className="btn small"
              disabled={!pronto || inCorso}
              onClick={() => {
                setEsito(null);
                avvia(async () => {
                  const r = await azione({
                    campagnaId,
                    tipo,
                    testo: testo.trim(),
                    url: url.trim(),
                    descrizione1: d1.trim(),
                    descrizione2: d2.trim(),
                    header: header.trim(),
                    valori,
                    ritorno,
                  });
                  setEsito(r);
                  // Si svuota solo se è andata: su un errore si riprova senza
                  // riscrivere tutto.
                  if (r.ok) {
                    setTesto("");
                    setUrl("");
                    setD1("");
                    setD2("");
                    setHeader("");
                    setValoriTesto("");
                  }
                });
              }}
            >
              {inCorso ? "Metto in coda…" : "Metti in coda"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
