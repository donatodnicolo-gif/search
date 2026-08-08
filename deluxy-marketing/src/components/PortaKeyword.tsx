"use client";

import { useEffect, useRef, useState } from "react";
import { ATTR } from "@/lib/porta-keyword";
import { testoKeywordPulito } from "@/lib/dominio";
import { adattaKeyword } from "@/lib/traduci-keyword";

export type CampagnaScelta = {
  id: string;
  nome: string;
  classe: string;
  lingua?: string | null;
  // La citta nominata dal NOME della campagna: serve ad adattare la keyword.
  // Si calcola sul server e viaggia con la campagna, come la lingua.
  citta?: string | null;
};

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
  // Le parole da portare: una (dalla riga) o molte (dalla selezione multipla).
  const [parole, setParole] = useState<string[]>([]);
  const keyword = parole[0] ?? "";
  const piuParole = parole.length > 1;
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
      // Un bottone può portare una parola o un elenco separato da "\n": il
      // dialogo è lo stesso, cambia solo quante ne mette in coda.
      setParole(
        (b.getAttribute(ATTR.keyword) ?? "")
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)
      );
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
        {parole.map((p) => (
          <input key={p} type="hidden" name="testo" value={p} />
        ))}
        <input type="hidden" name="ritorno" value={ritorno} />

        <div className="modale-testa">
          <div>
            <div className="modale-occhiello">Porta la keyword su altre campagne</div>
            <div className="modale-titolo">
              {piuParole ? `${parole.length} parole selezionate` : keyword}
            </div>
            {piuParole && (
              <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
                {parole.slice(0, 6).join(" · ")}
                {parole.length > 6 && ` e altre ${parole.length - 6}`}
              </div>
            )}
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
          {/* ⚠️ Chi ce l'ha GIÀ, detto PRIMA di premere. Queste campagne non
              sono nell'elenco perché la parola c'è già: senza dirlo, l'utente
              le cerca, non le trova e non capisce se manca la campagna o la
              parola. Prima lo si scopriva solo dopo, dal messaggio «saltate». */}
          {escludi.length > 0 && (
            <span className="cella-sub" style={{ flexBasis: "100%", whiteSpace: "normal", order: 3 }}>
              Fuori elenco perché <b>ce l&apos;hanno già</b>: {escludi.join(", ")}.
            </span>
          )}
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

        {/* ——— Il testo che finirà in coda, UNA CASELLA PER CAMPAGNA ———
            ⚠️ Prima la casella compariva solo quando cambiava la LINGUA, e per
            lingua invece che per campagna. Così «rome flower delivery service»
            portata su «[Deluxy] - Fiori Milano ENG» non mostrava niente — stesso
            inglese — e in coda finiva una parola su ROMA dentro una campagna su
            MILANO. Sbagliare città costa come sbagliare lingua, e due campagne
            della stessa lingua ma di città diverse vogliono due testi diversi:
            per questo la chiave è la campagna, non la lingua.
            Adesso la casella c'è SEMPRE, con la proposta già adattata, e quello
            che va in coda è ciò che si legge — non ciò che ha scritto l'app. */}
        {(() => {
          // ⚠️ Con più parole non si propone niente: una casella sola non può
          // correggerne dieci, e mostrarne dieci non verificate sarebbe il modo
          // di farle approvare senza guardarle.
          if (piuParole || scelte.length === 0) return null;
          const origine = lingueDiOra[0] ?? null;
          const pulito = testoKeywordPulito(keyword);
          const dove = scelte
            .map((id) => disponibili.find((c) => c.id === id))
            .filter((c): c is CampagnaScelta => !!c);
          return (
            <div className="modale-tradotto">
              <div className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
                <b>Come entra in ogni campagna.</b> La proposta è già adattata alla lingua e alla
                città di destinazione: <b>correggila liberamente</b> — in coda va quello che leggi
                nella casella, non quello che ha scritto l&apos;app.
              </div>
              {dove.map((c) => {
                const a = adattaKeyword(pulito, {
                  daLingua: origine,
                  aLingua: c.lingua ?? null,
                  aCitta: c.citta ?? null,
                });
                const valore = testiTradotti[c.id] ?? a.testo;
                const cambiata = valore.toLowerCase() !== pulito.toLowerCase();
                return (
                  <div key={c.id} style={{ marginBottom: 12 }}>
                    <input type="hidden" name={`testo_${c.id}`} value={valore} />
                    <label className="modale-campo">
                      {c.nome}
                      {c.lingua && <> · {NOME_LINGUA[c.lingua] ?? c.lingua}</>}
                      {c.citta && <> · {c.citta}</>}
                      <input
                        value={valore}
                        onChange={(e) => {
                          setTestiTradotti((s) => ({ ...s, [c.id]: e.target.value }));
                          setToccati((s) => ({ ...s, [c.id]: true }));
                        }}
                      />
                    </label>
                    <div className="cella-sub" style={{ marginTop: 5, whiteSpace: "normal" }}>
                      {cambiata ? <>da «{pulito}»</> : <>invariata</>}
                      {a.cambiamenti.length > 0 && <> · {a.cambiamenti.join(" · ")}</>}
                      {a.nonTradotte.length > 0 && (
                        <> · <b>non tradotte</b>: {a.nonTradotte.join(", ")}</>
                      )}
                      {toccati[c.id] && <> · <b>corretta a mano</b></>}
                      {/* Il caso che non si può adattare da soli: la parola
                          nomina una città e la campagna d'arrivo no. Può essere
                          giusto (una campagna nazionale) o essere l'errore. */}
                      {a.cittaSbagliata && (
                        <>
                          {" "}· ⚠️ la parola dice <b>{a.cittaSbagliata}</b> e questa campagna non
                          nomina una città: controlla che sia quello che vuoi
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
