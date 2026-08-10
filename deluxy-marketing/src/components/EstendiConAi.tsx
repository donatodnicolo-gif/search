"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { EsitoEstendi, LivelloEstensione } from "@/lib/azioni-estendi";

// «Estendi con AI»: si scrive un'indicazione (le parole spuntate in tabella
// fanno da seme, o la parola della riga da cui si apre), si sceglie QUANTO
// allontanarsi (prossima / media / alta), l'AI propone parole correlate e
// SOLO quelle lasciate spuntate vanno in coda come nuove keyword.
//
// ⚠️ Tre cancelli, nessuno salta gli altri: l'AI propone, la persona sceglie
// nel dialogo, la coda approva in Operazioni. L'accodamento è lo stesso di
// «Porta altrove» (`applicaKeywordAdAltreCampagne`): controllo «ce l'ha già»,
// livello L1, motivo che dichiara da dove nasce la parola.
//
// Il dialogo vive FUORI dal form della barra multipla (dentro c'è già un
// form, e i form non si annidano): il bottone-apri è un `data-estendi-ai`
// delegato, lo stesso disegno di PortaKeyword. Il bottone di una RIGA porta
// anche seme, gruppo e corrispondenza di quella parola: i default del
// dialogo partono da lì — si estende «quella», e la nuova nasce dove stava.

const ETICHETTA_ESTENSIONE: { chiave: LivelloEstensione; nome: string; spiega: string }[] = [
  { chiave: "prossima", nome: "Prossima", spiega: "stessa domanda, altro luogo: torte milano → torte roma" },
  { chiave: "media", nome: "Media", spiega: "aggiunge un concetto: torte milano → torta personalizzata milano" },
  { chiave: "alta", nome: "Alta", spiega: "ricerche affini: torte milano → cake design torino" },
];

// La corrispondenza della riga arriva come la scrive Google (EXACT,
// NEAR_PHRASE, broad…): si riduce alle tre nostre, e nel dubbio la più
// stretta — su parole mai comprate, «generica» moltiplica le ricerche.
const normalizzaMatch = (v: string | null): string => {
  const t = (v ?? "").toLowerCase();
  if (t.includes("phrase") || t.includes("frase")) return "phrase";
  if (t.includes("broad") || t.includes("generic")) return "broad";
  return "exact";
};

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
  azioneAi: (input: {
    campagnaId: string;
    indicazione: string;
    semi: string[];
    livello: LivelloEstensione;
  }) => Promise<EsitoEstendi>;
  azioneAccoda: (fd: FormData) => void | Promise<void>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [semi, setSemi] = useState<string[]>([]);
  const [indicazione, setIndicazione] = useState("");
  const [livello, setLivello] = useState<LivelloEstensione>("prossima");
  const [proposte, setProposte] = useState<string[] | null>(null);
  const [scelte, setScelte] = useState<string[]>([]);
  const [cerca, setCerca] = useState("");
  const [corrispondenza, setCorrispondenza] = useState("exact");
  const [gruppoScelto, setGruppoScelto] = useState("");
  const [nota, setNota] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();

  useEffect(() => {
    const apri = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest("[data-estendi-ai]");
      if (!b) return;
      // Da DOVE si parte: il bottone di una RIGA porta la sua parola in
      // `data-estendi-seme` (più gruppo e corrispondenza), il bottone della
      // barra non porta niente e i semi sono le parole spuntate (il testo
      // sta in `data-testo` quando il value serve ad altro, come /termini).
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
      // Gruppo e corrispondenza di default: quelli della parola che si
      // estende — la nuova nasce dove stava quella vera. Restano cambiabili.
      const gruppoDiRiga = b.getAttribute("data-estendi-gruppo");
      setGruppoScelto(gruppoDiRiga && gruppi.includes(gruppoDiRiga) ? gruppoDiRiga : gruppi[0] ?? "");
      setCorrispondenza(normalizzaMatch(b.getAttribute("data-estendi-corrispondenza")));
      setLivello("prossima");
      setIndicazione("");
      setProposte(null);
      setScelte([]);
      setCerca("");
      setNota(null);
      setErrore(null);
      dialogo.current?.showModal();
    };
    document.addEventListener("click", apri);
    return () => document.removeEventListener("click", apri);
  }, [gruppi]);

  const chiedi = () => {
    setErrore(null);
    setNota(null);
    avvia(async () => {
      const r = await azioneAi({ campagnaId, indicazione, semi, livello });
      if (!r.ok) {
        setErrore(r.errore);
        return;
      }
      setProposte(r.parole);
      // Tutte spuntate in partenza: la scelta vera è togliere, e comunque
      // niente parte senza l'approvazione in coda.
      setScelte(r.parole);
      setCerca("");
      if (r.parole.length === 0) {
        setNota(
          r.scartateEsistenti > 0
            ? `L'AI ha proposto solo parole che la campagna ha già (${r.scartateEsistenti} scartate).`
            : "L'AI non ha trovato parole da proporre: prova a dire di più (prodotto, occasione, città…) o alza il livello."
        );
      } else if (r.scartateEsistenti > 0) {
        setNota(`${r.scartateEsistenti} proposte scartate perché la campagna le ha già.`);
      }
    });
  };

  const q = cerca.trim().toLowerCase();
  const combacia = (p: string) => q === "" || p.includes(q);
  const filtrate = (proposte ?? []).filter(combacia);

  const motivo = `Proposta dall'AI (estensione ${livello}) su indicazione: «${indicazione.trim() || "—"}»${
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
      {/* ⚠️ Il form È il corpo, come in PortaKeyword: `.modale-elenco`
          scrolla solo da figlio DIRETTO del flex `.modale-corpo` — con un
          form di mezzo l'elenco cresceva e il piede col «Metti in coda»
          finiva tagliato fuori dallo schermo, irraggiungibile. La textarea
          e la casella di ricerca non hanno `name`: non vanno nella FormData. */}
      <form action={azioneAccoda} className="modale-corpo">
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

        <label className="modale-campo" style={{ margin: "0 18px 10px" }}>
          Cosa vuoi ottenere
          <textarea
            value={indicazione}
            onChange={(e) => setIndicazione(e.target.value)}
            rows={2}
            placeholder="es. varianti con consegna a domicilio e in giornata, anche per compleanni"
            style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)", resize: "vertical" }}
          />
        </label>

        {/* QUANTO ci si allontana dalla parola di partenza: tre istruzioni
            diverse per l'AI, non un numero. Il title di ognuna dice cosa fa. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "0 18px 10px" }}>
          <span className="cella-sub">Estensione</span>
          <span className="pill-scelta">
            {ETICHETTA_ESTENSIONE.map((l) => (
              <button
                key={l.chiave}
                type="button"
                className={`pill-opt${livello === l.chiave ? " attuale" : ""}`}
                title={l.spiega}
                onClick={() => setLivello(l.chiave)}
              >
                {l.nome}
              </button>
            ))}
          </span>
          <button type="button" className="btn small" onClick={chiedi} disabled={inCorso}>
            {inCorso ? "L'AI sta pensando…" : proposte ? "Chiedi di nuovo" : "Chiedi le parole"}
          </button>
        </div>

        {nota && (
          <div className="cella-sub" style={{ whiteSpace: "normal", margin: "0 18px 8px" }}>{nota}</div>
        )}
        {errore && <div className="modale-avviso">{errore}</div>}

        {proposte && proposte.length > 0 && (
          <>
            <input type="hidden" name="campagne" value={campagnaId} />
            <input type="hidden" name="ritorno" value={ritorno} />
            <input type="hidden" name="motivo" value={motivo} />

            {/* Cerca + selezione di massa, come nel dialogo delle campagne.
                ⚠️ Le parole spuntate restano spuntate anche quando la ricerca
                le nasconde — le righe si nascondono, non si smontano — ed è
                per questo che il conteggio delle selezionate è sempre in
                vista: quello che parte è QUEL numero, non ciò che si vede. */}
            <div className="modale-barra" style={{ paddingBottom: 4 }}>
              <label className="modale-campo modale-cerca">
                Cerca fra le proposte
                <input
                  type="search"
                  value={cerca}
                  onChange={(e) => setCerca(e.target.value)}
                  placeholder="es. torino"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="modale-conteggio">
              <span>
                {filtrate.length} propost{filtrate.length === 1 ? "a" : "e"}
                {q !== "" && ` su ${proposte.length}`} · <strong>{scelte.length} selezionate</strong>
              </span>
              <span className="modale-scorciatoie">
                <button
                  type="button"
                  onClick={() => setScelte((s) => Array.from(new Set([...s, ...filtrate])))}
                  disabled={filtrate.length === 0}
                >
                  Prendi le {q === "" ? "proposte" : "trovate"}
                </button>
                <button
                  type="button"
                  onClick={() => setScelte(q === "" ? [] : (s) => s.filter((x) => !combacia(x)))}
                  disabled={scelte.length === 0}
                >
                  Togli {q === "" ? "tutte" : "le trovate"}
                </button>
              </span>
            </div>

            <div className="modale-elenco">
              {proposte.map((p) => (
                <label key={p} className="modale-riga" style={combacia(p) ? undefined : { display: "none" }}>
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
              <label className="modale-campo" title="Di partenza è quella della parola che stai estendendo: si cambia liberamente">
                Corrispondenza
                <select
                  name="corrispondenza"
                  value={corrispondenza}
                  onChange={(e) => setCorrispondenza(e.target.value)}
                >
                  <option value="exact">esatta</option>
                  <option value="phrase">a frase</option>
                  <option value="broad">generica ⚠</option>
                </select>
              </label>
              {gruppi.length > 0 ? (
                <label className="modale-campo" title="Di partenza è il gruppo della parola che stai estendendo: si cambia liberamente">
                  In quale gruppo di annunci
                  <select
                    name={`gruppo_${campagnaId}`}
                    value={gruppoScelto}
                    onChange={(e) => setGruppoScelto(e.target.value)}
                  >
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
          </>
        )}
      </form>
    </dialog>
  );
}
