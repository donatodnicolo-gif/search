"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { riconciliaHubspot, unisciAnagrafiche } from "@/lib/azioni";

type RisultatoPartner = {
  id: string;
  nome: string;
  categoria: string;
  citta: string | null;
  stato: string;
  hubspotId: string | null;
};
type RisultatoHubspot = {
  id: string;
  nome: string;
  citta: string | null;
  telefono: string | null;
  dominio: string | null;
};

// Popup di riconciliazione della riga.
// cerca="hubspot": la riga è un'anagrafica (partnerId fisso), si cerca la company.
// cerca="partner": la riga è una company HubSpot (hubspotId fisso), si cerca l'anagrafica.
//
// Con `unibile` il ⇄ non parla **solo** con HubSpot: due doppioni nati dentro il
// registro (la stessa azienda scritta in due modi) non hanno niente a che fare
// con HubSpot, e prima si potevano unire soltanto entrando nella scheda. Da qui
// si sceglie con che cosa riconciliare — una company HubSpot o un'altra
// anagrafica — e la ricerca è **parziale**: «flowers» trova sia «Flowers & More»
// sia «Flowers and More», che per nome esatto non si incontrerebbero mai.
export function Riconcilia({
  cerca,
  partnerId,
  hubspotId,
  nomeRiga,
  collegato = false,
  unibile = false,
}: {
  cerca: "hubspot" | "partner";
  partnerId?: string;
  hubspotId?: string;
  nomeRiga: string;
  collegato?: boolean;
  unibile?: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [modo, setModo] = useState<"hubspot" | "registro">("hubspot");
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<(RisultatoPartner | RisultatoHubspot)[]>([]);
  const [statoRicerca, setStatoRicerca] = useState<"" | "cerco" | "errore" | "fatto">("");
  const [salvo, setSalvo] = useState(false);
  const [daUnire, setDaUnire] = useState<RisultatoPartner | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Su una riga di HubSpot si cerca sempre un'anagrafica; sull'elenco del
  // registro decide il modo scelto.
  const cercaOra: "hubspot" | "partner" =
    cerca === "partner" ? "partner" : modo === "registro" ? "partner" : "hubspot";

  useEffect(() => {
    if (!aperto) return;
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setRisultati([]);
      setStatoRicerca("");
      return;
    }
    timer.current = setTimeout(async () => {
      setStatoRicerca("cerco");
      try {
        const res = await fetch(`/api/interno/cerca-${cercaOra}?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        // Se stessa: unire un'anagrafica con sé stessa non vuol dire niente.
        setRisultati((json.dati ?? []).filter((r: { id: string }) => r.id !== partnerId));
        setStatoRicerca("fatto");
      } catch {
        setStatoRicerca("errore");
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, aperto, cercaOra, partnerId]);

  function chiudi() {
    setAperto(false);
    setQuery("");
    setRisultati([]);
    setStatoRicerca("");
    setDaUnire(null);
    setErrore(null);
  }

  function cambiaModo(nuovo: "hubspot" | "registro") {
    setModo(nuovo);
    setQuery("");
    setRisultati([]);
    setStatoRicerca("");
    setDaUnire(null);
    setErrore(null);
  }

  async function scegli(r: RisultatoPartner | RisultatoHubspot) {
    // Unire archivia un'anagrafica: si conferma prima, non al primo clic.
    if (cerca === "hubspot" && modo === "registro") {
      setDaUnire(r as RisultatoPartner);
      return;
    }
    setSalvo(true);
    try {
      if (cerca === "hubspot") {
        await riconciliaHubspot(partnerId!, r.id);
      } else {
        await riconciliaHubspot(r.id, hubspotId!);
      }
      chiudi();
    } finally {
      setSalvo(false);
    }
  }

  async function unisci() {
    if (!daUnire) return;
    setSalvo(true);
    setErrore(null);
    try {
      const esito = await unisciAnagrafiche(partnerId!, daUnire.id);
      if (!esito.ok) {
        setErrore(esito.errore);
        return;
      }
      chiudi();
      router.refresh();
    } finally {
      setSalvo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn-riconcilia${collegato ? " collegato" : ""}`}
        title={
          cerca === "partner"
            ? "Riconcilia con un'anagrafica del registro"
            : unibile
              ? collegato
                ? "Riconcilia: già collegata a HubSpot (si può cambiare) oppure unisci a un'altra anagrafica del registro"
                : "Riconcilia: collega a una company HubSpot oppure unisci a un'altra anagrafica del registro"
              : collegato
                ? "Già riconciliata con HubSpot — clicca per cambiare collegamento"
                : "Riconcilia con una company HubSpot"
        }
        onClick={() => setAperto(true)}
      >
        ⇄
      </button>

      {aperto && (
        <div className="modale-sfondo" onClick={chiudi}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testata">
              <div>
                <div className="modale-titolo">Riconcilia «{nomeRiga}»</div>
                <div className="modale-sub">
                  {cerca === "partner"
                    ? "Cerca l'anagrafica corrispondente nel registro"
                    : modo === "registro"
                      ? "Il doppione è dentro il registro: cerca l'anagrafica buona, questa ci finisce dentro"
                      : "Cerca la company corrispondente su HubSpot"}
                </div>
              </div>
              <button type="button" className="modale-chiudi" onClick={chiudi}>✕</button>
            </div>

            {cerca === "hubspot" && unibile && (
              <div className="scelta-modo">
                <button
                  type="button"
                  className={`modo${modo === "hubspot" ? " attivo" : ""}`}
                  onClick={() => cambiaModo("hubspot")}
                >
                  Company HubSpot
                </button>
                <button
                  type="button"
                  className={`modo${modo === "registro" ? " attivo" : ""}`}
                  onClick={() => cambiaModo("registro")}
                >
                  Un&apos;altra anagrafica
                </button>
              </div>
            )}

            {errore && <div className="avviso-errore">{errore}</div>}

            {daUnire ? (
              <>
                <p className="avviso-pagamento">
                  <strong>«{nomeRiga}» verrà archiviata dentro «{daUnire.nome}».</strong> Referenti,
                  feedback, sedi e collegamenti si spostano lì; i campi di «{daUnire.nome}»{" "}
                  <strong>non vengono toccati</strong> — si riempiono solo quelli vuoti. Questa
                  anagrafica non viene cancellata: resta in archivio con scritto dov&apos;è finita.
                </p>
                <div className="azioni-modulo">
                  <button type="button" className="btn btn-secondario" onClick={() => setDaUnire(null)}>
                    Scegli un&apos;altra
                  </button>
                  <button type="button" className="btn" disabled={salvo} onClick={unisci}>
                    {salvo ? "Unisco…" : `Unisci a «${daUnire.nome}»`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  autoFocus
                  type="search"
                  className="modale-ricerca"
                  placeholder={
                    cercaOra === "hubspot" ? "Nome della company…" : "Anche solo un pezzo del nome…"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="modale-risultati">
                  {statoRicerca === "cerco" && <div className="modale-vuoto">Ricerca…</div>}
                  {statoRicerca === "errore" && <div className="modale-vuoto">Errore nella ricerca. Riprova.</div>}
                  {statoRicerca === "fatto" && risultati.length === 0 && (
                    <div className="modale-vuoto">Nessun risultato per «{query}».</div>
                  )}
                  {statoRicerca === "" && cercaOra === "partner" && (
                    <div className="modale-vuoto">
                      Scrivi almeno due lettere. Si cerca su nome, ragione sociale, città, indirizzo,
                      email e referenti — anche solo un pezzo: «flowers» trova sia «Flowers &amp; More»
                      sia «Flowers and More».
                    </div>
                  )}
                  {risultati.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="modale-voce"
                      disabled={salvo}
                      onClick={() => scegli(r)}
                    >
                      <span className="modale-voce-nome">{r.nome}</span>
                      <span className="modale-voce-sub">
                        {"categoria" in r
                          ? [r.categoria, r.citta, r.hubspotId ? "già collegata ⇄" : null].filter(Boolean).join(" · ")
                          : [r.citta, r.dominio ?? r.telefono].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
