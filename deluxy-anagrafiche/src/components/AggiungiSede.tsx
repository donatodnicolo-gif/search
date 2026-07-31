"use client";

import { useEffect, useRef, useState } from "react";
import { aggiungiSede, collegaSedi } from "@/lib/azioni";
import { ETICHETTE_TIPO_LUOGO, TIPI_LUOGO } from "@/lib/luoghi";

type RisultatoPartner = {
  id: string;
  nome: string;
  categoria: string;
  citta: string | null;
};

// Aggiunge una sede all'insegna aperta. Due strade, perché i due casi veri
// sono diversi: **Nuova** quando il negozio non è ancora nel registro (anche un
// secondo indirizzo nella stessa città), **Collega** quando l'anagrafica esiste
// già ed era stata censita come se fosse un'azienda a sé.
export function AggiungiSede({
  madreId,
  nome,
  citta,
  provincia,
  ragioneSociale,
  categoria,
  compatto = false,
}: {
  madreId: string;
  nome: string;
  citta: string | null;
  provincia: string | null;
  ragioneSociale: string | null;
  categoria: string;
  compatto?: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [modo, setModo] = useState<"nuova" | "collega">("nuova");
  const [errore, setErrore] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<RisultatoPartner[]>([]);
  const [statoRicerca, setStatoRicerca] = useState<"" | "cerco" | "errore" | "fatto">("");
  // Scelta MULTIPLA: le spunte restano anche cambiando ricerca, così si
  // possono pescare i negozi uno a uno e collegarli tutti in un colpo.
  const [scelte, setScelte] = useState<Map<string, RisultatoPartner>>(new Map());

  function alterna(r: RisultatoPartner) {
    setScelte((prec) => {
      const nuova = new Map(prec);
      if (nuova.has(r.id)) nuova.delete(r.id);
      else nuova.set(r.id, r);
      return nuova;
    });
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aperto || modo !== "collega") return;
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setRisultati([]);
      setStatoRicerca("");
      return;
    }
    timer.current = setTimeout(async () => {
      setStatoRicerca("cerco");
      try {
        const res = await fetch(`/api/interno/cerca-partner?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        setRisultati((json.dati ?? []).filter((r: RisultatoPartner) => r.id !== madreId));
        setStatoRicerca("fatto");
      } catch {
        setStatoRicerca("errore");
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, aperto, modo, madreId]);

  function chiudi() {
    setAperto(false);
    setErrore(null);
    setQuery("");
    setRisultati([]);
    setStatoRicerca("");
    setScelte(new Map());
    setModo("nuova");
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondario"
        style={compatto ? { fontSize: 12.5, padding: "6px 14px" } : undefined}
        onClick={() => setAperto(true)}
        title={`Aggiungi un'altra sede di ${nome}`}
      >
        ＋ Sedi di questa
      </button>

      {aperto && (
        <div className="modale-sfondo" onClick={chiudi}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testata">
              <div>
                <div className="modale-titolo">Aggiungi una sede a «{nome}»</div>
                <div className="modale-sub">
                  <strong>Altre realtà diventano sedi di questa.</strong> Ognuna resta
                  un&apos;anagrafica autonoma per stato, referenti e feedback; fatturazione e gruppo
                  di pagamento restano quelli dell&apos;insegna. Per il contrario — dire che è
                  <strong> questa</strong> a essere la sede di un&apos;altra — usa <strong>↳ È una
                  sede di…</strong>
                </div>
              </div>
              <button type="button" className="modale-chiudi" onClick={chiudi}>✕</button>
            </div>

            <div className="tab" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className={`tab-voce${modo === "nuova" ? " attiva" : ""}`}
                onClick={() => { setModo("nuova"); setErrore(null); }}
              >
                Nuova sede
              </button>
              <button
                type="button"
                className={`tab-voce${modo === "collega" ? " attiva" : ""}`}
                onClick={() => { setModo("collega"); setErrore(null); }}
              >
                Collega esistenti
              </button>
            </div>

            {errore && <div className="avviso-errore">{errore}</div>}

            {modo === "nuova" ? (
              <form
                action={async (fd) => {
                  setSalvo(true);
                  try {
                    const esito = await aggiungiSede(madreId, fd);
                    if (esito.ok) chiudi();
                    else setErrore(esito.errore);
                  } finally {
                    setSalvo(false);
                  }
                }}
              >
                <div className="modulo">
                  <div className="campo-modulo">
                    <label htmlFor="sede-nome">Insegna</label>
                    <input id="sede-nome" name="nome" defaultValue={nome} />
                    <p className="testo-guida">Resta il nome dell&apos;azienda: è uguale per tutte le sedi.</p>
                  </div>
                  <div className="campo-modulo">
                    <label htmlFor="sede-sede">Nome della sede</label>
                    <input id="sede-sede" name="sede" placeholder="Montenapoleone, Flagship…" />
                    <p className="testo-guida">Come chiamate questo luogo fra voi.</p>
                  </div>
                  <div className="campo-modulo">
                    <label htmlFor="sede-tipo">Tipo di luogo</label>
                    <select id="sede-tipo" name="tipoLuogo" defaultValue="negozio">
                      <option value="">— non indicato —</option>
                      {TIPI_LUOGO.map((t) => (
                        <option key={t} value={t}>{ETICHETTE_TIPO_LUOGO[t]}</option>
                      ))}
                    </select>
                    <p className="testo-guida">Un luogo nuovo di solito è un negozio; la sede è una sola.</p>
                  </div>
                  <div className="campo-modulo">
                    <label htmlFor="sede-citta">Città</label>
                    <input id="sede-citta" name="citta" defaultValue={citta ?? ""} />
                  </div>
                  <div className="campo-modulo">
                    <label htmlFor="sede-provincia">Provincia</label>
                    <input id="sede-provincia" name="provincia" defaultValue={provincia ?? ""} />
                    <p className="testo-guida">
                      Cambiala se la sede è in un&apos;altra provincia: senza, prende quella
                      dell&apos;insegna e resterebbe sbagliata in silenzio.
                    </p>
                  </div>
                  <div className="campo-modulo largo">
                    <label htmlFor="sede-indirizzo">Indirizzo</label>
                    <input id="sede-indirizzo" name="indirizzo" placeholder="Via Montenapoleone 12" />
                    <p className="testo-guida">
                      Con il nome della sede è quello che distingue due luoghi nella stessa città: senza né l’uno né l’altro, una seconda
                      sede con lo stesso nome e la stessa città non viene creata.
                    </p>
                  </div>
                  <div className="campo-modulo">
                    <label htmlFor="sede-telefono">Telefono</label>
                    <input id="sede-telefono" name="telefono" />
                  </div>
                  <div className="campo-modulo">
                    <label htmlFor="sede-email">Email</label>
                    <input id="sede-email" name="email" type="email" />
                  </div>
                </div>
                <p className="testo-guida" style={{ marginTop: 10 }}>
                  <strong>Arriva tutto dall&apos;insegna, non serve riscriverlo</strong>:{" "}
                  {[ragioneSociale, categoria].filter(Boolean).join(" · ")}, stati, interessi, account
                  e i dati di fatturazione. Qui si scrive solo quello che <em>cambia</em> da una sede
                  all&apos;altra — e l&apos;indirizzo resta vuoto apposta: una sede nuova e un altro
                  luogo, copiarlo creerebbe un gemello.
                </p>
                <div className="azioni-modulo">
                  <button type="button" className="btn btn-secondario" onClick={chiudi}>Annulla</button>
                  <button type="submit" className="btn" disabled={salvo}>
                    {salvo ? "Creo…" : "Crea sede"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <input
                  autoFocus
                  type="search"
                  className="modale-ricerca"
                  placeholder="Nome dell'anagrafica da collegare…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="modale-risultati">
                  {statoRicerca === "cerco" && <div className="modale-vuoto">Ricerca…</div>}
                  {statoRicerca === "errore" && <div className="modale-vuoto">Errore nella ricerca. Riprova.</div>}
                  {statoRicerca === "fatto" && risultati.length === 0 && (
                    <div className="modale-vuoto">Nessun risultato per «{query}».</div>
                  )}
                  {risultati.map((r) => {
                    const scelta = scelte.has(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`modale-voce voce-scelta${scelta ? " attiva" : ""}`}
                        aria-pressed={scelta}
                        disabled={salvo}
                        onClick={() => alterna(r)}
                      >
                        <span className="spunta" aria-hidden="true">{scelta ? "✓" : ""}</span>
                        <span className="voce-testo">
                          <span className="modale-voce-nome">{r.nome}</span>
                          <span className="modale-voce-sub">
                            {[r.categoria, r.citta].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {statoRicerca === "" && (
                    <div className="modale-vuoto">
                      Cerca l&apos;insegna: puoi spuntarne <strong>più di una</strong>, anche cambiando
                      ricerca. Diventano tutte sedi di «{nome}».
                    </div>
                  )}
                </div>

                <div className="modale-piede">
                  <span className="testo-guida">
                    {scelte.size === 0
                      ? "Nessuna anagrafica selezionata"
                      : `${scelte.size} ${scelte.size === 1 ? "anagrafica" : "anagrafiche"}: ${[...scelte.values()].map((s) => s.nome).join(", ")}`}
                  </span>
                  <button type="button" className="btn btn-secondario" onClick={chiudi}>Annulla</button>
                  <button
                    type="button"
                    className="btn"
                    disabled={scelte.size === 0 || salvo}
                    onClick={async () => {
                      setSalvo(true);
                      try {
                        const esito = await collegaSedi(madreId, [...scelte.keys()]);
                        if (!esito.ok) {
                          setErrore(esito.errore);
                          return;
                        }
                        // Chi non si è potuto collegare va detto con il nome e
                        // il motivo: un conteggio più basso e nessuna
                        // spiegazione è il modo migliore per non accorgersene.
                        if (esito.scartate.length) {
                          setErrore(
                            `Collegate ${esito.collegate}. Non collegate: ` +
                              esito.scartate.map((s) => `${s.nome} (${s.motivo})`).join(", "),
                          );
                          setScelte(new Map());
                          return;
                        }
                        chiudi();
                      } finally {
                        setSalvo(false);
                      }
                    }}
                  >
                    {salvo ? "Collego…" : scelte.size > 1 ? `Collega ${scelte.size} sedi` : "Collega"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
