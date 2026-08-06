"use client";

import { useEffect, useRef, useState } from "react";
import { ATTR } from "@/lib/porta-keyword";
import { testoKeywordPulito } from "@/lib/dominio";
import { traduciKeyword } from "@/lib/traduci-keyword";

export type CampagnaScelta = { id: string; nome: string; classe: string; lingua?: string | null };

const NOME_LINGUA: Record<string, string> = { ita: "italiano", eng: "inglese", fra: "francese" };

// "Porta su altre campagne": un dialogo a tutta pagina, non un pannello dentro
// la cella della tabella. Prima era un <details> inline e ereditava la
// larghezza della colonna keyword: con nomi lunghi ("[Cakedesign.me] |
// LeadGen | ITA") si leggevano tre parole per riga in una colonnina di 180px,
// e scegliere la campagna giusta era indovinare.
//
// ⚠️ **Uno solo per pagina, non uno per riga.** Il <details> stampava l'elenco
// completo delle campagne dentro OGNI riga: misurato su /keywords?tema=fiori,
// 1.531 righe × 121 campagne = **185.480 checkbox e 68 MB di HTML** per una
// lista che è sempre la stessa. Qui l'elenco sta in un posto solo e le righe
// portano quattro attributi a testa; quale keyword si stia portando lo dice il
// bottone che ha aperto il dialogo.
export function PortaKeyword({
  campagne,
  ritorno,
  azione,
}: {
  campagne: CampagnaScelta[];
  ritorno: string;
  azione: (fd: FormData) => void | Promise<void>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [keyword, setKeyword] = useState("");
  const [corrispondenza, setCorrispondenza] = useState("broad");
  const [escludi, setEscludi] = useState<string[]>([]);
  const [daClassificare, setDaClassificare] = useState(false);
  const [lingueDiOra, setLingueDiOra] = useState<string[]>([]);
  // Il testo da usare per ogni lingua di destinazione: nasce dalla traduzione
  // proposta e resta MODIFICABILE. Quello che finisce in coda è ciò che si
  // legge nella casella, non ciò che ha scritto il glossario.
  const [testiTradotti, setTestiTradotti] = useState<Record<string, string>>({});
  const [toccati, setToccati] = useState<Record<string, boolean>>({});
  const [cerca, setCerca] = useState("");
  const [scelte, setScelte] = useState<string[]>([]);

  useEffect(() => {
    // Un ascoltatore delegato per tutta la pagina: i bottoni delle righe sono
    // HTML del server e non hanno bisogno di diventare componenti client.
    const apri = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>(`[${ATTR.keyword}]`);
      if (!b) return;
      const gia = b.getAttribute(ATTR.escludi) ?? "";
      setKeyword(b.getAttribute(ATTR.keyword) ?? "");
      setCorrispondenza(b.getAttribute(ATTR.corrispondenza) || "broad");
      setEscludi(gia === "" ? [] : gia.split("\n"));
      setDaClassificare(b.getAttribute(ATTR.classificata) === "no");
      const ling = b.getAttribute(ATTR.lingue) ?? "";
      setLingueDiOra(ling === "" ? [] : ling.split(","));
      setTestiTradotti({});
      setToccati({});
      setCerca("");
      setScelte([]);
      dialogo.current?.showModal();
    };
    document.addEventListener("click", apri);
    return () => document.removeEventListener("click", apri);
  }, []);

  // Le campagne su cui la parola c'è già non si propongono: accodarle
  // produrrebbe un'aggiunta che Google rifiuta come duplicata.
  const disponibili = campagne.filter((c) => !escludi.includes(c.nome));
  const q = cerca.trim().toLowerCase();
  const combacia = (c: CampagnaScelta) => q === "" || c.nome.toLowerCase().includes(q);
  const filtrate = disponibili.filter(combacia);

  return (
    <dialog
      ref={dialogo}
      className="modale"
      // Il clic sullo sfondo chiude: il dialogo riceve l'evento solo quando si
      // preme fuori dal riquadro interno.
      onClick={(e) => {
        if (e.target === dialogo.current) dialogo.current?.close();
      }}
    >
      <form action={azione} className="modale-corpo">
        <input type="hidden" name="testo" value={keyword} />
        <input type="hidden" name="ritorno" value={ritorno} />

        <div className="modale-testa">
          <div>
            <div className="modale-occhiello">Porta la keyword su altre campagne</div>
            <div className="modale-titolo">{keyword}</div>
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

        <div className="modale-barra">
          <label className="modale-campo">
            Corrispondenza
            <select
              name="corrispondenza"
              value={corrispondenza}
              onChange={(e) => setCorrispondenza(e.target.value)}
            >
              <option value="broad">generica</option>
              <option value="phrase">a frase</option>
              <option value="exact">esatta</option>
            </select>
          </label>
          <label className="modale-campo modale-cerca">
            Cerca campagna
            <input
              type="search"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="nome, brand, lingua…"
              autoComplete="off"
            />
          </label>
        </div>

        {/* ⚠️ Le campagne spuntate restano spuntate anche quando la ricerca le
            nasconde — le righe si nascondono, non si smontano, quindi il
            modulo le manda lo stesso. È voluto (si cercano tre campagne una
            alla volta), ma va DETTO: per questo il conteggio è sempre in
            vista, col modo per svuotarlo. */}
        <div className="modale-conteggio">
          {/* «attive» va detto: l'elenco è filtrato, e una lista filtrata che
              non lo dichiara si legge come "queste sono tutte le campagne". */}
          <span>
            {filtrate.length} campagn{filtrate.length === 1 ? "a attiva" : "e attive"}
            {q !== "" && ` su ${disponibili.length}`} · <strong>{scelte.length} selezionate</strong>
          </span>
          <span className="modale-scorciatoie">
            <button
              type="button"
              onClick={() => setScelte((s) => Array.from(new Set([...s, ...filtrate.map((c) => c.id)])))}
              disabled={filtrate.length === 0}
            >
              Prendi le {q === "" ? "campagne" : "trovate"}
            </button>
            <button type="button" onClick={() => setScelte([])} disabled={scelte.length === 0}>
              Togli tutte
            </button>
          </span>
        </div>

        <div className="modale-elenco">
          {disponibili.map((c) => (
            <label
              key={c.id}
              className="modale-riga"
              style={combacia(c) ? undefined : { display: "none" }}
            >
              <input
                type="checkbox"
                name="campagne"
                value={c.id}
                checked={scelte.includes(c.id)}
                onChange={(e) =>
                  setScelte((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))
                }
              />
              <span className="modale-riga-nome">{c.nome}</span>
              {c.classe === "traino" && <span className="tag-neutro">TRAINO</span>}
            </label>
          ))}
          {filtrate.length === 0 && (
            <div className="modale-vuoto">
              {disponibili.length === 0
                ? "Questa parola è già su tutte le campagne attive."
                : `Nessuna campagna attiva con «${cerca}».`}
            </div>
          )}
        </div>

        {/* ⚠️ Una parola che gira su campagne inglesi, portata su una italiana,
            resta scritta in inglese: «milano flowers» dentro «Fiori Milano
            ITA» non intercetta chi cerca in italiano. L'app non la traduce —
            tradurre a macchina una keyword è il modo di comprare ricerche che
            nessuno fa — ma non deve nemmeno far finta di niente. */}
        {(() => {
          const diverse = scelte
            .map((id) => disponibili.find((c) => c.id === id))
            .filter((c): c is CampagnaScelta => !!c?.lingua && !lingueDiOra.includes(c.lingua));
          if (lingueDiOra.length === 0 || diverse.length === 0) return null;
          const origine = lingueDiOra[0];
          const pulito = testoKeywordPulito(keyword);
          const perLingua = [...new Set(diverse.map((c) => c.lingua!))];
          return (
            <div className="modale-tradotto">
              <div className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
                <b>Lingua diversa.</b> Questa parola gira su campagne in{" "}
                {lingueDiOra.map((l) => NOME_LINGUA[l] ?? l).join(" e ")}. Qui sotto la proposta
                nella lingua di ogni campagna scelta: <b>correggila</b> — in coda va quello che
                leggi nella casella, non quello che ha scritto il glossario.
              </div>
              {perLingua.map((lin) => {
                const t = traduciKeyword(pulito, origine, lin);
                const proposta = t?.testo ?? pulito;
                const valore = testiTradotti[lin] ?? proposta;
                const dove = diverse.filter((c) => c.lingua === lin);
                return (
                  <div key={lin} style={{ marginBottom: 12 }}>
                    <input type="hidden" name={`testo_${lin}`} value={valore} />
                    <label className="modale-campo">
                      {NOME_LINGUA[lin] ?? lin} — {dove.map((c) => c.nome).join(", ")}
                      <input
                        value={valore}
                        onChange={(e) => {
                          setTestiTradotti((s) => ({ ...s, [lin]: e.target.value }));
                          setToccati((s) => ({ ...s, [lin]: true }));
                        }}
                      />
                    </label>
                    <div className="cella-sub" style={{ marginTop: 5, whiteSpace: "normal" }}>
                      {t == null ? (
                        <>
                          Nessuna parola del glossario: la proposta è il testo <b>invariato</b>.
                          Riscrivilo tu, o su quella campagna non intercetta nessuno.
                        </>
                      ) : (
                        <>
                          da «{pulito}»
                          {t.riordinata && <> · città spostata in fondo</>}
                          {t.nonTradotte.length > 0 && (
                            <>
                              {" "}· <b>non tradotte</b>: {t.nonTradotte.join(", ")}
                            </>
                          )}
                          {toccati[lin] && <> · <b>corretta a mano</b></>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {daClassificare && (
          <div className="modale-avviso">
            L&apos;AI non l&apos;ha ancora classificata: controlla che descriva cosa vendiamo e non
            un concorrente o la nostra insegna.
          </div>
        )}

        <div className="modale-piede">
          <button
            type="button"
            className="btn small btn-secondario"
            onClick={() => dialogo.current?.close()}
          >
            Annulla
          </button>
          <button className="btn small" type="submit" disabled={scelte.length === 0}>
            Metti in coda
            {scelte.length > 0 && ` (${scelte.length})`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
