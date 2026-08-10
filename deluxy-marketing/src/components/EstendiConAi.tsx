"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { EsitoEstendi } from "@/lib/azioni-estendi";

// «Estendi con AI»: si scrive un'indicazione (le parole spuntate in tabella
// fanno da seme), l'AI propone una sequenza di parole correlate, e SOLO
// quelle lasciate spuntate vanno in coda come nuove keyword della campagna.
//
// ⚠️ Tre cancelli, nessuno salta gli altri: l'AI propone, la persona sceglie
// nel dialogo, la coda approva in Operazioni. L'accodamento è lo stesso di
// «Porta altrove» (`applicaKeywordAdAltreCampagne`): controllo «ce l'ha già»,
// livello L1, motivo che dichiara da dove nasce la parola.
//
// Il dialogo vive FUORI dal form della barra multipla (dentro c'è già un
// form, e i form non si annidano): il bottone nella barra è un semplice
// `data-estendi-ai`, intercettato dall'ascoltatore delegato — lo stesso
// disegno di PortaKeyword.
export function EstendiConAi({
  campagnaId,
  nomeCampagna,
  gruppi,
  ritorno,
  azioneAi,
  azioneAccoda,
}: {
  campagnaId: string;
  nomeCampagna: string;
  // I gruppi di annunci della campagna: senza scelta, lo script infila la
  // keyword nel primo gruppo attivo che incontra.
  gruppi: string[];
  ritorno: string;
  azioneAi: (input: { campagnaId: string; indicazione: string; semi: string[] }) => Promise<EsitoEstendi>;
  azioneAccoda: (fd: FormData) => void | Promise<void>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [semi, setSemi] = useState<string[]>([]);
  const [indicazione, setIndicazione] = useState("");
  const [proposte, setProposte] = useState<string[] | null>(null);
  const [scelte, setScelte] = useState<string[]>([]);
  const [nota, setNota] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();

  useEffect(() => {
    const apri = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest("[data-estendi-ai]");
      if (!b) return;
      // Da DOVE si parte: il bottone di una RIGA porta la sua parola in
      // `data-estendi-seme` e il seme è quella; il bottone della barra non
      // porta niente e i semi sono le parole spuntate (il testo sta in
      // `data-testo` quando il value serve ad altro, come su /termini).
      const semeDiRiga = b.getAttribute("data-estendi-seme");
      setSemi(
        semeDiRiga
          ? [semeDiRiga]
          : [
              ...document.querySelectorAll<HTMLInputElement>(
                'input[form="scelte-termini"][name="scelte"]:checked'
              ),
            ].map((i) => i.dataset.testo ?? i.value)
      );
      setIndicazione("");
      setProposte(null);
      setScelte([]);
      setNota(null);
      setErrore(null);
      dialogo.current?.showModal();
    };
    document.addEventListener("click", apri);
    return () => document.removeEventListener("click", apri);
  }, []);

  const chiedi = () => {
    setErrore(null);
    setNota(null);
    avvia(async () => {
      const r = await azioneAi({ campagnaId, indicazione, semi });
      if (!r.ok) {
        setErrore(r.errore);
        return;
      }
      setProposte(r.parole);
      // Tutte spuntate in partenza: la scelta vera è togliere, e comunque
      // niente parte senza l'approvazione in coda.
      setScelte(r.parole);
      if (r.parole.length === 0) {
        setNota(
          r.scartateEsistenti > 0
            ? `L'AI ha proposto solo parole che la campagna ha già (${r.scartateEsistenti} scartate).`
            : "L'AI non ha trovato parole da proporre con questa indicazione: prova a dire di più (prodotto, occasione, città…)."
        );
      } else if (r.scartateEsistenti > 0) {
        setNota(`${r.scartateEsistenti} proposte scartate perché la campagna le ha già.`);
      }
    });
  };

  const motivo = `Proposta dall'AI su indicazione: «${indicazione.trim() || "—"}»${
    semi.length > 0 ? `, partendo da ${semi.slice(0, 3).join(", ")}${semi.length > 3 ? "…" : ""}` : ""
  } — scelta a mano nel dialogo`;

  return (
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
            <div className="modale-occhiello">Estendi con AI</div>
            <div className="modale-titolo">{nomeCampagna}</div>
            <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
              {semi.length > 0 ? (
                <>
                  Parte da: {semi.slice(0, 6).join(" · ")}
                  {semi.length > 6 && ` e altre ${semi.length - 6}`}
                </>
              ) : (
                <>Nessuna parola spuntata in tabella: l&apos;AI parte solo dall&apos;indicazione.</>
              )}
            </div>
          </div>
          <button
            type="button"
            className="modale-chiudi"
            aria-label="Chiudi"
            onClick={() => dialogo.current?.close()}
          >
            ✕
          </button>
        </div>

        <label className="modale-campo" style={{ marginBottom: 10 }}>
          Cosa vuoi ottenere
          <textarea
            value={indicazione}
            onChange={(e) => setIndicazione(e.target.value)}
            rows={2}
            placeholder="es. varianti con consegna a domicilio e in giornata, anche per compleanni"
            style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)", resize: "vertical" }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <button type="button" className="btn small" onClick={chiedi} disabled={inCorso}>
            {inCorso ? "L'AI sta pensando…" : proposte ? "Chiedi di nuovo" : "Chiedi le parole"}
          </button>
          {nota && <span className="cella-sub" style={{ whiteSpace: "normal" }}>{nota}</span>}
        </div>

        {errore && <div className="modale-avviso">{errore}</div>}

        {proposte && proposte.length > 0 && (
          <form action={azioneAccoda}>
            <input type="hidden" name="campagne" value={campagnaId} />
            <input type="hidden" name="ritorno" value={ritorno} />
            <input type="hidden" name="motivo" value={motivo} />

            <div className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 8 }}>
              Togli la spunta a quelle che non vuoi: <b>solo le spuntate</b> vanno in coda, da
              approvare in Operazioni. Il controllo «ce l&apos;ha già» viene rifatto una per una.
            </div>

            <div className="modale-elenco" style={{ marginBottom: 10 }}>
              {proposte.map((p) => (
                <label key={p} className="modale-riga">
                  {/* name="testo": le spuntate finiscono in fd.getAll("testo"),
                      cioè la stessa porta di «Porta altrove». */}
                  <input
                    type="checkbox"
                    name="testo"
                    value={p}
                    checked={scelte.includes(p)}
                    onChange={(e) =>
                      setScelte((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))
                    }
                  />
                  <span className="modale-riga-nome">{p}</span>
                </label>
              ))}
            </div>

            <div className="modale-barra">
              <label className="modale-campo">
                Corrispondenza
                {/* ⚠️ Esatta di default: parole mai comprate prima, si parte
                    strette e si allarga dopo, non il contrario. */}
                <select name="corrispondenza" defaultValue="exact">
                  <option value="exact">esatta</option>
                  <option value="phrase">a frase</option>
                  <option value="broad">generica ⚠</option>
                </select>
              </label>
              {gruppi.length > 0 ? (
                <label className="modale-campo">
                  In quale gruppo di annunci
                  <select name={`gruppo_${campagnaId}`} defaultValue={gruppi[0]}>
                    {gruppi.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                  Gruppi non ancora letti: la keyword finirà nel primo gruppo attivo.
                </span>
              )}
            </div>

            <div className="modale-piede">
              <button type="button" className="btn small btn-secondario" onClick={() => dialogo.current?.close()}>
                Annulla
              </button>
              <button className="btn small" type="submit" disabled={scelte.length === 0}>
                Metti in coda{scelte.length > 0 && ` (${scelte.length})`}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
