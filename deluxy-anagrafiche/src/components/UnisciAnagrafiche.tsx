"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { unisciAnagrafiche } from "@/lib/azioni";

type Risultato = { id: string; nome: string; categoria: string; citta: string | null };

// «Unisci a…»: due anagrafiche che sono la stessa azienda scritta in due modi.
// La ricerca è **parziale e a parole** (la stessa dell'elenco): «flowers» trova
// sia «Flowers & More» sia «Flowers and More», che per nome esatto non si
// incontrerebbero mai — ed è esattamente il caso in cui i doppioni nascono.
//
// Il verso conta e va detto: **questa** viene archiviata dentro quella scelta.
export function UnisciAnagrafiche({ partnerId, nome }: { partnerId: string; nome: string }) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<Risultato[]>([]);
  const [stato, setStato] = useState<"" | "cerco" | "fatto" | "errore">("");
  const [scelta, setScelta] = useState<Risultato | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [unisco, setUnisco] = useState(false);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aperto) return;
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setRisultati([]);
      setStato("");
      return;
    }
    timer.current = setTimeout(async () => {
      setStato("cerco");
      try {
        const res = await fetch(`/api/interno/cerca-partner?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        setRisultati((json.dati ?? []).filter((r: Risultato) => r.id !== partnerId));
        setStato("fatto");
      } catch {
        setStato("errore");
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, aperto, partnerId]);

  function chiudi() {
    setAperto(false);
    setQuery("");
    setRisultati([]);
    setStato("");
    setScelta(null);
    setErrore(null);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondario"
        style={{ fontSize: 12.5, padding: "6px 14px" }}
        onClick={() => setAperto(true)}
        title={`«${nome}» è un doppione di un'altra anagrafica? Uniscile`}
      >
        ⇄ Unisci a…
      </button>

      {aperto && (
        <div className="modale-sfondo" onClick={chiudi}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testata">
              <div>
                <div className="modale-titolo">Unisci «{nome}» a un&apos;altra anagrafica</div>
                <div className="modale-sub">
                  Per i doppioni: la stessa azienda entrata due volte con nomi diversi. Cerca anche
                  solo un pezzo del nome — «flowers» trova sia «Flowers &amp; More» sia «Flowers and
                  More»
                </div>
              </div>
              <button type="button" className="modale-chiudi" onClick={chiudi}>✕</button>
            </div>

            {errore && <div className="avviso-errore">{errore}</div>}

            {scelta ? (
              <>
                <p className="avviso-pagamento">
                  <strong>«{nome}» verrà archiviata dentro «{scelta.nome}».</strong> Referenti,
                  feedback, sedi e collegamenti si spostano lì; i campi di «{scelta.nome}»{" "}
                  <strong>non vengono toccati</strong> — si riempiono solo quelli vuoti. Questa
                  anagrafica non viene cancellata: resta in archivio con scritto dov&apos;è finita.
                </p>
                <div className="azioni-modulo">
                  <button type="button" className="btn btn-secondario" onClick={() => setScelta(null)}>
                    Scegli un&apos;altra
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={unisco}
                    onClick={async () => {
                      setUnisco(true);
                      try {
                        const esito = await unisciAnagrafiche(partnerId, scelta.id);
                        if (!esito.ok) {
                          setErrore(esito.errore);
                          return;
                        }
                        // Sulla scheda buona, non su quella appena archiviata:
                        // `window.location` perdeva la corsa con la rivalidazione.
                        chiudi();
                        router.push(`/partner/${scelta.id}`);
                      } finally {
                        setUnisco(false);
                      }
                    }}
                  >
                    {unisco ? "Unisco…" : `Unisci a «${scelta.nome}»`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  autoFocus
                  type="search"
                  className="modale-ricerca"
                  placeholder="Anche solo un pezzo del nome…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="modale-risultati">
                  {stato === "cerco" && <div className="modale-vuoto">Ricerca…</div>}
                  {stato === "errore" && <div className="modale-vuoto">Errore nella ricerca. Riprova.</div>}
                  {stato === "fatto" && risultati.length === 0 && (
                    <div className="modale-vuoto">Nessun risultato per «{query}».</div>
                  )}
                  {risultati.map((r) => (
                    <button key={r.id} type="button" className="modale-voce" onClick={() => setScelta(r)}>
                      <span className="modale-voce-nome">{r.nome}</span>
                      <span className="modale-voce-sub">
                        {[r.categoria, r.citta].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                  {stato === "" && (
                    <div className="modale-vuoto">
                      Scrivi almeno due lettere. Si cerca su nome, ragione sociale, città, indirizzo,
                      email e referenti.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
