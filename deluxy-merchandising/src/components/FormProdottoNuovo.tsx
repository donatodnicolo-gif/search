"use client";

// **Il modulo «Nuovo prodotto», rifatto il 04/09/2026 su richiesta dell'utente.**
//
// Un modulo solo per far nascere un prodotto: scheda, foto e video, prezzo, e
// — se lo si vuole **Pubblico** — la creazione sul negozio Shopify con la
// collezione, le traduzioni e la finestra di pubblicazione. Le regole:
// - lo **SKU** nasce da solo, 7 cifre casuali, e resta modificabile; il
//   salvataggio garantisce che sia unico;
// - la **collezione** è una delle collezioni manuali del negozio scelto, e si
//   può non sceglierne nessuna;
// - le **categorie** sono quelle del brand/negozio scelto più quelle comuni;
// - **Pubblico** vuol dire che va su Shopify: non è un'etichetta;
// - le **foto e i video** si caricano dal computer e finiscono nei Files del
//   negozio (dal browser direttamente a Shopify, così i video non passano dal
//   nostro server); per questo il negozio si sceglie prima delle foto;
// - la **descrizione** la può proporre l'AI, come nell'altro modulo.

import { useRef, useState } from "react";
import { ETICHETTA_FASE } from "@/lib/dominio";

export type NegozioPerForm = { id: string; nome: string; dominio: string; puoScrivere: boolean };
export type CategoriaPerForm = { chiave: string; nome: string; negozio: string | null; conPrompt: boolean };
export type CollezionePerForm = { id: string; titolo: string; negozio: string };

type MediaCaricato = {
  shopifyFileId: string;
  tipo: "immagine" | "video";
  url: string | null;
  anteprima: string | null;
  stato: "pronto" | "in-elaborazione" | "fallito";
  nome: string;
  negozio: string;
  errore?: string;
};

const FASI_SCELTA = ["concept", "prototipo", "approvato", "in_vendita"] as const;

type Variante = { nome: string; prezzo: string; costo: string; giacenza: string };
const varianteVuota = (): Variante => ({ nome: "", prezzo: "", costo: "", giacenza: "0" });

/** Sette cifre casuali, mai con lo zero davanti (così resta di sette anche letto come numero). */
export function skuCasuale(): string {
  return String(Math.floor(1_000_000 + Math.random() * 9_000_000));
}

export function FormProdottoNuovo({
  negozi,
  categorie,
  collezioni,
  aiPronta,
  azione,
}: {
  negozi: NegozioPerForm[];
  categorie: CategoriaPerForm[];
  collezioni: CollezionePerForm[];
  aiPronta: boolean;
  azione: (fd: FormData) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [negozioId, setNegozioId] = useState(negozi[0]?.id ?? "");
  const negozio = negozi.find((n) => n.id === negozioId) ?? null;
  const [fase, setFase] = useState<string>("concept");
  const pubblico = fase === "in_vendita";
  const [categoria, setCategoria] = useState("");
  const [collezioneId, setCollezioneId] = useState("");
  const [sku, setSku] = useState(skuCasuale);
  const [descrizione, setDescrizione] = useState("");
  const [tono, setTono] = useState("maison");
  const [scrivendo, setScrivendo] = useState(false);
  const [erroreAi, setErroreAi] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaCaricato[]>([]);
  // Varianti (chieste dall'utente il 04/09/2026): ogni variante ha il suo SKU,
  // derivato da quello principale con un numero in coda («4839201-1»). Lo SKU
  // della variante non si scrive: segue quello principale, così restano
  // agganciati anche se lo si rigenera.
  const [haVarianti, setHaVarianti] = useState(false);
  const [nomeOpzione, setNomeOpzione] = useState("Formato");
  const [varianti, setVarianti] = useState<Variante[]>([varianteVuota()]);
  const aggiornaVariante = (i: number, campo: keyof Variante, valore: string) =>
    setVarianti((v) => v.map((x, j) => (j === i ? { ...x, [campo]: valore } : x)));
  const [caricando, setCaricando] = useState(false);
  const [erroreMedia, setErroreMedia] = useState<string | null>(null);

  // Categorie e collezioni seguono il negozio scelto.
  const categorieVisibili = categorie.filter((c) => !c.negozio || c.negozio === negozio?.nome);
  const collezioniVisibili = collezioni.filter((c) => c.negozio === negozio?.nome);
  const mediaDiQuestoNegozio = media.filter((m) => m.negozio === negozio?.nome);
  const mediaDiAltri = media.length - mediaDiQuestoNegozio.length;

  function cambiaNegozio(id: string) {
    setNegozioId(id);
    setCollezioneId("");
    const nuovo = negozi.find((n) => n.id === id);
    if (categoria && !categorie.some((c) => c.chiave === categoria && (!c.negozio || c.negozio === nuovo?.nome))) {
      setCategoria("");
    }
  }

  async function scriviConAI() {
    setErroreAi(null);
    setScrivendo(true);
    try {
      const leggi = (n: string) => (form.current?.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
      const res = await fetch("/api/ai/descrizione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: leggi("nome"),
          categoria,
          tipo: "",
          materiali: leggi("materiali"),
          prezzo: leggi("prezzoVendita"),
          varianti: [],
          tono,
        }),
      });
      const dati = await res.json();
      if (!dati.ok) {
        setErroreAi(dati.errore ?? "La generazione non è riuscita.");
        return;
      }
      const punti = (dati.punti as string[]).map((p) => `• ${p}`).join("\n");
      setDescrizione([dati.claim, "", dati.descrizione, punti ? `\n${punti}` : ""].filter(Boolean).join("\n").trim());
    } catch {
      setErroreAi("Non sono riuscito a contattare il servizio di scrittura.");
    } finally {
      setScrivendo(false);
    }
  }

  async function caricaFile(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    if (!negozio) {
      setErroreMedia("Scegli prima il negozio: le foto vanno nei suoi Files su Shopify.");
      return;
    }
    setErroreMedia(null);
    setCaricando(true);
    const file = Array.from(lista);
    const problemi: string[] = [];
    try {
      // Passo 1: gli indirizzi temporanei.
      const prep = await fetch("/api/media/prepara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negozioId, file: file.map((f) => ({ nome: f.name, mime: f.type, byte: f.size })) }),
      }).then((r) => r.json());
      if (!prep.ok) {
        setErroreMedia(prep.errore ?? "Shopify non ha accettato il caricamento.");
        return;
      }
      // Passo 2: il file va dal browser a Shopify. Se non riesce, passa dal
      // nostro server — ma solo se è piccolo.
      const daRegistrare: { resourceUrl: string; nome: string; mime: string }[] = [];
      for (let i = 0; i < file.length; i++) {
        const b = prep.bersagli[i] as { url: string; resourceUrl: string; parametri: { name: string; value: string }[] };
        const f = file[i];
        try {
          const fd = new FormData();
          for (const p of b.parametri) fd.append(p.name, p.value);
          fd.append("file", f);
          const r = await fetch(b.url, { method: "POST", body: fd });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          daRegistrare.push({ resourceUrl: b.resourceUrl, nome: f.name, mime: f.type });
        } catch {
          if (f.size > 4 * 1024 * 1024) {
            problemi.push(`«${f.name}»: il caricamento diretto non è riuscito e il file è troppo grande per passare dal server.`);
            continue;
          }
          const fd = new FormData();
          fd.append("negozioId", negozioId);
          fd.append("file", f);
          const r = await fetch("/api/media/registra", { method: "POST", body: fd }).then((x) => x.json());
          if (r.ok) aggiungiMedia(r.file);
          else problemi.push(`«${f.name}»: ${r.errore ?? "non caricato"}`);
        }
      }
      // Passo 3: si registrano fra i Files del negozio.
      if (daRegistrare.length) {
        const r = await fetch("/api/media/registra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ negozioId, file: daRegistrare }),
        }).then((x) => x.json());
        if (r.ok) aggiungiMedia(r.file);
        else problemi.push(r.errore ?? "Shopify non ha registrato i file.");
      }
    } catch {
      problemi.push("Il caricamento si è interrotto: riprova.");
    } finally {
      setCaricando(false);
      if (problemi.length) setErroreMedia(problemi.join(" · "));
    }
  }

  function aggiungiMedia(lista: Omit<MediaCaricato, "negozio">[]) {
    if (!negozio) return;
    setMedia((m) => [...m, ...lista.map((x) => ({ ...x, negozio: negozio.nome }))]);
  }

  const puoPubblicare = !pubblico || (negozio?.puoScrivere ?? false);

  return (
    <form action={azione} ref={form}>
      <input type="hidden" name="mediaJson" value={JSON.stringify(mediaDiQuestoNegozio)} />
      <input type="hidden" name="nomeOpzione" value={nomeOpzione} />
      <input
        type="hidden"
        name="variantiJson"
        value={JSON.stringify(haVarianti ? varianti.filter((v) => v.nome.trim()) : [])}
      />
      <input type="hidden" name="negozioId" value={negozioId} />

      {/* ---------- Anagrafica ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Anagrafica</div>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label htmlFor="nome">
              Nome <span className="obbligatorio">*</span>
            </label>
            <input id="nome" name="nome" required placeholder="Es. Bouquet Ora Blu" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="negozio">
              Brand / negozio <span className="obbligatorio">*</span>
            </label>
            <select id="negozio" value={negozioId} onChange={(e) => cambiaNegozio(e.target.value)} required>
              {negozi.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome} — {n.dominio}
                  {n.puoScrivere ? "" : " (solo lettura)"}
                </option>
              ))}
              {negozi.length === 0 && <option value="">Nessun negozio collegato</option>}
            </select>
            <span className="cella-sub">Decide categorie, collezioni e dove vanno le foto.</span>
          </div>
          <div className="campo-modulo">
            <label htmlFor="codice">Codice / SKU</label>
            <div className="riga-ai" style={{ marginBottom: 0 }}>
              <input
                id="codice"
                name="codice"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]{7}"
                title="Sette cifre"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-secondario small" onClick={() => setSku(skuCasuale())}>
                Rigenera
              </button>
            </div>
            <span className="cella-sub">Sette cifre casuali, univoche: se esistesse già, al salvataggio se ne genera un altro.</span>
          </div>
          <div className="campo-modulo">
            <label htmlFor="categoria">Categoria</label>
            <select id="categoria" name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">— Da classificare —</option>
              {categorieVisibili.map((c) => (
                <option key={c.chiave} value={c.chiave}>
                  {c.nome}
                  {c.negozio ? ` · ${c.negozio}` : ""}
                  {c.conPrompt ? " · guida l'AI" : ""}
                </option>
              ))}
            </select>
            <span className="cella-sub">
              Le categorie del brand scelto più quelle comuni: si impostano in{" "}
              <a href="/classificazione">Imposta categorie e linee</a>.
            </span>
          </div>
          <div className="campo-modulo">
            <label htmlFor="collezione">Collezione su Shopify</label>
            <select
              id="collezione"
              name="collezioneShopifyId"
              value={collezioneId}
              onChange={(e) => setCollezioneId(e.target.value)}
            >
              <option value="">— Nessuna collezione —</option>
              {collezioniVisibili.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titolo}
                </option>
              ))}
            </select>
            <span className="cella-sub">
              Solo le collezioni manuali di {negozio?.nome ?? "questo negozio"}: in quelle automatiche decide la
              regola del negozio.
            </span>
          </div>
          <div className="campo-modulo">
            <label htmlFor="fase">Fase iniziale</label>
            <select id="fase" name="fase" value={fase} onChange={(e) => setFase(e.target.value)}>
              {FASI_SCELTA.map((f) => (
                <option key={f} value={f}>
                  {ETICHETTA_FASE[f]}
                  {f === "in_vendita" ? " — va su Shopify" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="descrizione">Descrizione</label>
            <div className="riga-ai">
              <select value={tono} onChange={(e) => setTono(e.target.value)} aria-label="Tono della descrizione">
                <option value="maison">Tono maison</option>
                <option value="caldo">Tono caldo</option>
                <option value="essenziale">Tono essenziale</option>
              </select>
              <button
                type="button"
                className="btn btn-secondario small"
                onClick={scriviConAI}
                disabled={scrivendo || !aiPronta}
                title={aiPronta ? "Scrive una proposta partendo dai dati del prodotto" : "Manca la chiave OpenAI"}
              >
                {scrivendo ? "Sto scrivendo…" : "✦ Scrivi con l'AI"}
              </button>
              {descrizione && !scrivendo && (
                <button type="button" className="btn btn-secondario small" onClick={scriviConAI}>
                  Riscrivi
                </button>
              )}
            </div>
            <textarea
              id="descrizione"
              name="descrizione"
              rows={descrizione ? 8 : 3}
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Il testo che il cliente legge. Puoi scriverlo tu o farlo proporre all'AI (usa nome, categoria, materiali e prezzo)."
            />
            {erroreAi && <div className="avviso-errore" style={{ marginTop: 8 }}>{erroreAi}</div>}
            {!aiPronta && (
              <span className="cella-sub">Per la scrittura AI serve la chiave OpenAI, in Negozi &amp; permessi.</span>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Foto e video ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Foto e video</div>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          Vanno nei <b>Files del negozio {negozio?.nome ?? ""}</b> su Shopify, anche se il prodotto non è ancora
          pubblico; alla pubblicazione si agganciano al prodotto. La prima immagine è quella principale.
        </p>
        <label className="btn btn-secondario" style={{ cursor: caricando ? "wait" : "pointer" }}>
          {caricando ? "Caricamento in corso…" : "Scegli foto o video"}
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            disabled={caricando || !negozio}
            onChange={(e) => {
              void caricaFile(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {erroreMedia && <div className="avviso-errore" style={{ marginTop: 10 }}>{erroreMedia}</div>}
        {mediaDiAltri > 0 && (
          <p className="cella-sub" style={{ marginTop: 8 }}>
            {mediaDiAltri} file caricati per un altro negozio non si useranno: restano nei suoi Files.
          </p>
        )}
        {mediaDiQuestoNegozio.length > 0 && (
          <ul className="galleria-media" aria-label="File caricati">
            {mediaDiQuestoNegozio.map((m, i) => (
              <li key={m.shopifyFileId} className={`media-voce${m.stato === "fallito" ? " fallito" : ""}`}>
                {m.anteprima || (m.tipo === "immagine" && m.url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.anteprima ?? (m.url as string)} alt={m.nome} />
                ) : (
                  <span className="media-segnaposto">{m.tipo === "video" ? "▶" : "❀"}</span>
                )}
                <span className="media-nome" title={m.nome}>
                  {i === 0 && m.tipo === "immagine" ? "principale · " : ""}
                  {m.tipo === "video" ? "video" : "foto"}
                  {m.stato === "in-elaborazione" ? " · in elaborazione" : ""}
                  {m.stato === "fallito" ? ` · ${m.errore ?? "non riuscito"}` : ""}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  title="Togli dal prodotto (il file resta nei Files del negozio)"
                  onClick={() => setMedia((x) => x.filter((y) => y.shopifyFileId !== m.shopifyFileId))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- Scheda creativa ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Scheda creativa</div>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label htmlFor="brief">Brief</label>
            <textarea id="brief" name="brief" rows={2} placeholder="Il concept del prodotto" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="materiali">Materiali / fiori</label>
            <input id="materiali" name="materiali" placeholder="Anemoni, ranuncoli, foglia oro" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="palette">Palette</label>
            <input id="palette" name="palette" placeholder="Indaco · avorio · oro" />
          </div>
        </div>
      </div>

      {/* ---------- Costi & prezzo ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Costi &amp; prezzo</div>
        <div className="modulo">
          <div className="campo-modulo">
            <label htmlFor="costoProduzione">Costo di produzione (€)</label>
            <input id="costoProduzione" name="costoProduzione" type="number" step="0.01" min="0" defaultValue="0" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="prezzoVendita">Prezzo di vendita (€)</label>
            <input id="prezzoVendita" name="prezzoVendita" type="number" step="0.01" min="0" defaultValue="0" />
            {haVarianti && (
              <span className="cella-sub">Con le varianti è il prezzo base: se lo lasci a 0 vale il prezzo della variante più economica.</span>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Varianti ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Varianti</div>
        <div className="pill-scelta" style={{ marginBottom: 12 }}>
          <label className="pill-opt" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={haVarianti} onChange={(e) => setHaVarianti(e.target.checked)} />
            Il prodotto ha varianti (formati, misure, colori)
          </label>
        </div>
        {haVarianti && (
          <>
            <div className="modulo">
              <div className="campo-modulo">
                <label htmlFor="nomeOpzione">Nome dell&apos;opzione</label>
                <input id="nomeOpzione" value={nomeOpzione} onChange={(e) => setNomeOpzione(e.target.value)} placeholder="Formato" />
              </div>
            </div>
            <div className="tabella-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Variante *</th>
                    <th>SKU</th>
                    <th className="num">Prezzo (€)</th>
                    <th className="num">Costo (€)</th>
                    <th className="num">Giacenza</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {varianti.map((v, i) => (
                    <tr key={i}>
                      <td>
                        <input value={v.nome} onChange={(e) => aggiornaVariante(i, "nome", e.target.value)} placeholder="Medium" aria-label={`Nome variante ${i + 1}`} />
                      </td>
                      <td>
                        {/* Derivato, non scritto: segue lo SKU principale. */}
                        <code>{sku || "…"}-{i + 1}</code>
                      </td>
                      <td>
                        <input value={v.prezzo} onChange={(e) => aggiornaVariante(i, "prezzo", e.target.value)} inputMode="decimal" className="num" placeholder="95,00" aria-label={`Prezzo variante ${i + 1}`} />
                      </td>
                      <td>
                        <input value={v.costo} onChange={(e) => aggiornaVariante(i, "costo", e.target.value)} inputMode="decimal" className="num" placeholder="0" aria-label={`Costo variante ${i + 1}`} />
                      </td>
                      <td>
                        <input value={v.giacenza} onChange={(e) => aggiornaVariante(i, "giacenza", e.target.value)} type="number" min={0} className="num" aria-label={`Giacenza variante ${i + 1}`} />
                      </td>
                      <td>
                        <button type="button" className="icon-btn" onClick={() => setVarianti((x) => x.filter((_, j) => j !== i))} disabled={varianti.length === 1} title="Togli questa variante">
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-secondario small" style={{ marginTop: 12 }} onClick={() => setVarianti((v) => [...v, varianteVuota()])}>
              Aggiungi variante
            </button>
            <p className="cella-sub" style={{ marginTop: 8 }}>
              Gli SKU delle varianti sono lo SKU principale più «-1», «-2»…: se rigeneri quello principale, seguono. Su
              Shopify diventano le varianti dell&apos;opzione «{nomeOpzione || "Formato"}».
            </p>
          </>
        )}
      </div>

      {/* ---------- Pubblicazione ---------- */}
      {/* Sempre visibile (chiesto dall'utente: «manca date pubblicazione»):
          le date si possono decidere anche prima che il prodotto sia
          Pubblico, e restano scritte sulla scheda. Le traduzioni invece
          hanno senso solo quando si pubblica. */}
      {
        <div className="scheda">
          <div className="scheda-titolo">Pubblicazione su {negozio?.nome ?? "Shopify"}</div>
          {!pubblico && (
            <p className="page-sub" style={{ marginBottom: 12 }}>
              Il prodotto va sul negozio solo con la fase <b>Pubblico</b>. Le date qui sotto si salvano comunque:
              sono il programma, e si leggono nel calendario delle pubblicazioni.
            </p>
          )}
          {pubblico && !negozio?.puoScrivere && (
            <div className="avviso-errore" style={{ marginBottom: 12 }}>
              Il negozio scelto non ha il permesso <code>write_products</code>: qui si può creare il prodotto solo
              come bozza interna. Aggiungi il permesso all&apos;app Shopify e rifai la verifica in Negozi &amp; permessi.
            </div>
          )}
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="pubblicatoDal">Pubblico dal</label>
              <input id="pubblicatoDal" name="pubblicatoDal" type="date" />
              <span className="cella-sub">Vuoto = da subito. Con una data futura nasce come bozza e si accende quel giorno.</span>
            </div>
            <div className="campo-modulo">
              <label htmlFor="pubblicatoFinoAl">Fino al</label>
              <input id="pubblicatoFinoAl" name="pubblicatoFinoAl" type="date" />
              <span className="cella-sub">Vuoto = per sempre. Il giorno dopo torna bozza sul negozio.</span>
            </div>
            {pubblico && (
              <div className="campo-modulo largo">
                <label className="pill-opt" style={{ cursor: "pointer", width: "fit-content" }}>
                  <input type="checkbox" name="traduci" defaultChecked />
                  Traduci titolo e descrizione nelle 8 lingue del negozio (con l&apos;AI)
                </label>
                <span className="cella-sub">
                  Inglese, francese, tedesco, spagnolo, russo, cinese, arabo, giapponese. Le lingue che il negozio non
                  ha configurato vengono rifiutate da Shopify e lo si legge nell&apos;esito.
                </span>
              </div>
            )}
          </div>
        </div>
      }

      <div className="azioni-modulo">
        <a className="btn btn-secondario" href="/prodotti">
          Annulla
        </a>
        <button type="submit" className="btn" disabled={!puoPubblicare || caricando || negozi.length === 0}>
          {pubblico ? `Crea e pubblica su ${negozio?.nome ?? "Shopify"}` : "Crea prodotto"}
        </button>
      </div>
    </form>
  );
}
