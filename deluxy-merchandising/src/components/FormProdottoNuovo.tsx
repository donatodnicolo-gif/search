"use client";

// **Il modulo del prodotto — nuovo e modifica** (04/09/2026, richieste dell'utente).
//
// Un modulo solo per far nascere un prodotto e, dal 04/09 pomeriggio, per
// modificarne uno esistente («ogni prodotto nell'app poi potrà essere
// modificato con lo stesso form»). Le regole:
// - lo **SKU** nasce da solo, 7 cifre casuali, e resta modificabile; il
//   salvataggio garantisce che sia unico;
// - le **varianti** hanno lo SKU principale più «-1», «-2»…: non si scrive,
//   segue il principale (le varianti già salvate tengono il loro);
// - la **giacenza** è facoltativa: si accende sul prodotto, e se non c'è sul
//   padre non c'è nemmeno per le varianti;
// - la **collezione** è una delle manuali del negozio scelto, o nessuna;
// - le **categorie** sono quelle del brand/negozio scelto più le comuni;
// - **Pubblico** vuol dire che va su Shopify;
// - **foto e video** finiscono nei Files del negozio (dal browser a Shopify);
// - la **descrizione** la può proporre l'AI;
// - i **campi del negozio** (i metafield definiti su Shopify: occasioni,
//   fiori, colore, orario…) si compilano qui, coi valori ammessi dal negozio.

import { useRef, useState } from "react";
import { ETICHETTA_FASE } from "@/lib/dominio";
import { chiaveDef, etichettaDef, listaDa, type DefinizioneMetafield } from "@/lib/metafield-puro";

export type NegozioPerForm = { id: string; nome: string; dominio: string; puoScrivere: boolean };
export type CategoriaPerForm = { chiave: string; nome: string; negozio: string | null; conPrompt: boolean };
export type CollezionePerForm = { id: string; titolo: string; negozio: string };

export type MediaCaricato = {
  shopifyFileId: string;
  tipo: "immagine" | "video";
  url: string | null;
  anteprima: string | null;
  stato: "pronto" | "in-elaborazione" | "fallito";
  nome: string;
  negozio: string;
  errore?: string;
};

export type VarianteForm = { nome: string; sku: string | null; prezzo: string; costo: string; prezzoPartner: string; giacenza: string };

/** Quello che il modulo mostra quando si modifica un prodotto esistente. */
export type ProdottoIniziale = {
  id: string;
  nome: string;
  negozioId: string;
  fase: string;
  categoria: string;
  collezioneShopifyId: string;
  codice: string;
  descrizione: string;
  brief: string;
  materiali: string;
  palette: string;
  costoProduzione: number;
  prezzoVendita: number;
  prezzoPartner: number | null;
  pubblicatoDal: string;
  pubblicatoFinoAl: string;
  controllaStock: boolean;
  giacenza: number;
  nomeOpzione: string;
  varianti: VarianteForm[];
  media: MediaCaricato[];
  metafield: Record<string, string>;
  tags: string[];
  /** Le collezioni in cui il prodotto sta già (dall'import), automatiche comprese. */
  collezioni: { id: string; titolo: string; tipo: string }[];
  shopifyId: string | null;
};

const FASI_SCELTA = ["concept", "prototipo", "approvato", "in_vendita"] as const;
const varianteVuota = (): VarianteForm => ({ nome: "", sku: null, prezzo: "", costo: "", prezzoPartner: "", giacenza: "0" });

/** Sette cifre casuali, mai con lo zero davanti. */
export function skuCasuale(): string {
  return String(Math.floor(1_000_000 + Math.random() * 9_000_000));
}

export function FormProdottoNuovo({
  negozi,
  categorie,
  collezioni,
  definizioniPerNegozio,
  tagEsistenti,
  aiPronta,
  azione,
  iniziale,
}: {
  negozi: NegozioPerForm[];
  categorie: CategoriaPerForm[];
  collezioni: CollezionePerForm[];
  definizioniPerNegozio: Record<string, DefinizioneMetafield[]>;
  tagEsistenti: string[];
  aiPronta: boolean;
  azione: (fd: FormData) => void;
  iniziale?: ProdottoIniziale;
}) {
  const modifica = !!iniziale;
  const form = useRef<HTMLFormElement>(null);
  const [negozioId, setNegozioId] = useState(iniziale?.negozioId || negozi[0]?.id || "");
  const negozio = negozi.find((n) => n.id === negozioId) ?? null;
  const [fase, setFase] = useState<string>(iniziale?.fase ?? "concept");
  const pubblico = fase === "in_vendita";
  const [categoria, setCategoria] = useState(iniziale?.categoria === "DA_CLASSIFICARE" ? "" : (iniziale?.categoria ?? ""));
  // Collezioni (più d'una, chiesto dall'utente): in creazione si scelgono fra
  // le manuali del negozio; in modifica si parte da quelle in cui il prodotto
  // sta già. Le automatiche si vedono ma non si toccano: decide la regola.
  const [collezioniScelte, setCollezioniScelte] = useState<string[]>(
    iniziale ? iniziale.collezioni.filter((c) => c.tipo === "manuale").map((c) => c.id) : []
  );
  const [cercaCollezione, setCercaCollezione] = useState("");
  const collezioniAutomatiche = iniziale?.collezioni.filter((c) => c.tipo !== "manuale") ?? [];
  const [sku, setSku] = useState(iniziale?.codice ?? skuCasuale);
  const [descrizione, setDescrizione] = useState(iniziale?.descrizione ?? "");
  const [tono, setTono] = useState("maison");
  const [scrivendo, setScrivendo] = useState(false);
  const [erroreAi, setErroreAi] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaCaricato[]>(iniziale?.media ?? []);
  const [caricando, setCaricando] = useState(false);
  const [erroreMedia, setErroreMedia] = useState<string | null>(null);
  const [controllaStock, setControllaStock] = useState(iniziale?.controllaStock ?? false);
  const [haVarianti, setHaVarianti] = useState((iniziale?.varianti.length ?? 0) > 0);
  const [nomeOpzione, setNomeOpzione] = useState(iniziale?.nomeOpzione || "Formato");
  const [varianti, setVarianti] = useState<VarianteForm[]>(iniziale?.varianti.length ? iniziale.varianti : [varianteVuota()]);
  const [metafield, setMetafield] = useState<Record<string, string>>(iniziale?.metafield ?? {});
  // Tag (chiesti dall'utente): quelli del prodotto, coi suggerimenti presi
  // dai tag già in uso sui prodotti importati dal negozio.
  const [tags, setTags] = useState<string[]>(iniziale?.tags ?? []);
  const [tagNuovo, setTagNuovo] = useState("");
  const aggiungiTag = (t: string) => {
    const pulito = t.trim().replace(/,+$/, "").trim();
    if (!pulito) return;
    setTags((x) => (x.some((y) => y.toLowerCase() === pulito.toLowerCase()) ? x : [...x, pulito]));
    setTagNuovo("");
  };

  const aggiornaVariante = (i: number, campo: keyof VarianteForm, valore: string) =>
    setVarianti((v) => v.map((x, j) => (j === i ? { ...x, [campo]: valore } : x)));

  // Lo SKU di una variante: quello già salvato, altrimenti principale + numero
  // progressivo dopo l'ultimo già assegnato.
  const skuVariante = (v: VarianteForm, i: number) => {
    if (v.sku) return v.sku;
    const usati = varianti.filter((x) => x.sku).length;
    const posizioneNuova = varianti.slice(0, i).filter((x) => !x.sku).length;
    return `${sku || "…"}-${usati + posizioneNuova + 1}`;
  };

  const categorieVisibili = categorie.filter((c) => !c.negozio || c.negozio === negozio?.nome);
  const collezioniVisibili = collezioni.filter((c) => c.negozio === negozio?.nome);
  const mediaDiQuestoNegozio = media.filter((m) => m.negozio === negozio?.nome);
  const mediaDiAltri = media.length - mediaDiQuestoNegozio.length;
  const definizioni = negozio ? definizioniPerNegozio[negozio.nome] ?? [] : [];

  function cambiaNegozio(id: string) {
    setNegozioId(id);
    setCollezioniScelte([]);
    const nuovo = negozi.find((n) => n.id === id);
    if (categoria && !categorie.some((c) => c.chiave === categoria && (!c.negozio || c.negozio === nuovo?.nome))) setCategoria("");
  }

  async function scriviConAI() {
    setErroreAi(null);
    setScrivendo(true);
    try {
      const leggi = (n: string) => (form.current?.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
      const res = await fetch("/api/ai/descrizione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: leggi("nome"), categoria, tipo: "", materiali: leggi("materiali"), prezzo: leggi("prezzoVendita"), varianti: haVarianti ? varianti.map((v) => v.nome).filter(Boolean) : [], tono }),
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
      const prep = await fetch("/api/media/prepara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negozioId, file: file.map((f) => ({ nome: f.name, mime: f.type, byte: f.size })) }),
      }).then((r) => r.json());
      if (!prep.ok) {
        setErroreMedia(prep.errore ?? "Shopify non ha accettato il caricamento.");
        return;
      }
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
      <input type="hidden" name="negozioId" value={negozioId} />
      <input type="hidden" name="nomeOpzione" value={nomeOpzione} />
      <input
        type="hidden"
        name="variantiJson"
        value={JSON.stringify(haVarianti ? varianti.filter((v) => v.nome.trim()).map((v, i) => ({ ...v, sku: v.sku ?? null, indice: i })) : [])}
      />
      <input type="hidden" name="metafieldJson" value={JSON.stringify(metafield)} />
      <input type="hidden" name="tagsJson" value={JSON.stringify(tags)} />
      {controllaStock && <input type="hidden" name="controllaStock" value="1" />}

      {/* ---------- In modifica: cosa si sta toccando, e dove finisce ---------- */}
      {modifica && iniziale && (
        <div className="riepilogo-modifica">
          {iniziale.media.find((x) => x.tipo === "immagine" && (x.anteprima || x.url)) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={(iniziale.media.find((x) => x.tipo === "immagine" && (x.anteprima || x.url))?.anteprima ?? iniziale.media.find((x) => x.tipo === "immagine")?.url) as string} alt="" />
          ) : (
            <span className="media-segnaposto" style={{ width: 56, height: 56, fontSize: 22 }}>❀</span>
          )}
          <div>
            <div className="riepilogo-titolo">Stai modificando «{iniziale.nome}»</div>
            <div className="cella-sub">
              SKU {iniziale.codice} · {ETICHETTA_FASE[iniziale.fase] ?? iniziale.fase} ·{" "}
              {iniziale.shopifyId
                ? `sul negozio ${negozi.find((n) => n.id === iniziale.negozioId)?.nome ?? ""}: salvando si aggiorna anche là`
                : "non è sul negozio: resta qui, salvo scegliere la fase Pubblico"}
              {iniziale.varianti.length ? ` · ${iniziale.varianti.length} varianti` : ""}
            </div>
          </div>
        </div>
      )}

      {/* ---------- Anagrafica ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Anagrafica</div>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label htmlFor="nome">
              Nome <span className="obbligatorio">*</span>
            </label>
            <input id="nome" name="nome" required placeholder="Es. Bouquet Ora Blu" defaultValue={iniziale?.nome ?? ""} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="negozio">
              Brand / negozio <span className="obbligatorio">*</span>
            </label>
            <select id="negozio" value={negozioId} onChange={(e) => cambiaNegozio(e.target.value)} required disabled={!!iniziale?.shopifyId}>
              {negozi.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome} — {n.dominio}
                  {n.puoScrivere ? "" : " (solo lettura)"}
                </option>
              ))}
              {negozi.length === 0 && <option value="">Nessun negozio collegato</option>}
            </select>
            <span className="cella-sub">
              {iniziale?.shopifyId ? "Il prodotto è già sul negozio: non si sposta." : "Decide categorie, collezioni, campi e dove vanno le foto."}
            </span>
          </div>
          <div className="campo-modulo">
            <label htmlFor="codice">Codice / SKU</label>
            <div className="riga-ai" style={{ marginBottom: 0 }}>
              <input id="codice" name="codice" value={sku} onChange={(e) => setSku(e.target.value)} inputMode="numeric" pattern="[0-9]{7}" title="Sette cifre" style={{ flex: 1 }} />
              {!modifica && (
                <button type="button" className="btn btn-secondario small" onClick={() => setSku(skuCasuale())}>
                  Rigenera
                </button>
              )}
            </div>
            <span className="cella-sub">
              {modifica ? "Cambiarlo cambia anche gli SKU delle varianti nuove; quelle già salvate tengono il loro." : "Sette cifre casuali, univoche: se esistesse già, al salvataggio se ne genera un altro."}
            </span>
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
              Le categorie del brand scelto più quelle comuni: si impostano in <a href="/classificazione">Imposta categorie e linee</a>.
            </span>
          </div>
          <div className="campo-modulo largo">
            <label>Collezioni su Shopify{collezioniScelte.length ? ` · ${collezioniScelte.length} scelte` : ""}</label>
            <input type="hidden" name="collezioniJson" value={JSON.stringify(collezioniScelte)} />
            {(collezioniScelte.length > 0 || collezioniAutomatiche.length > 0) && (
              <div className="pill-scelta" style={{ marginBottom: 8 }}>
                {collezioniScelte.map((id) => {
                  const c = collezioni.find((x) => x.id === id) ?? iniziale?.collezioni.find((x) => x.id === id);
                  return (
                    <span key={id} className="pill-opt chip-scelta selezionato">
                      {c?.titolo ?? id}
                      <button type="button" className="icon-btn" style={{ padding: 0, width: 18, height: 18, color: "#fff" }} title="Togli da questa collezione" onClick={() => setCollezioniScelte((x) => x.filter((y) => y !== id))}>
                        ×
                      </button>
                    </span>
                  );
                })}
                {collezioniAutomatiche.map((c) => (
                  <span key={c.id} className="pill-opt" title="Collezione automatica: chi ci entra lo decide la regola del negozio" style={{ cursor: "default" }}>
                    {c.titolo} <em style={{ fontStyle: "normal", color: "var(--text-tertiary)" }}>· automatica</em>
                  </span>
                ))}
              </div>
            )}
            <input
              value={cercaCollezione}
              onChange={(e) => setCercaCollezione(e.target.value)}
              placeholder={`Cerca fra le ${collezioniVisibili.length} collezioni manuali di ${negozio?.nome ?? "questo negozio"}…`}
              aria-label="Cerca una collezione"
              style={{ font: "inherit", padding: "8px 12px", borderRadius: "var(--radius-m)", border: "1px solid transparent", background: "var(--fill)", width: "100%" }}
            />
            {cercaCollezione.trim() && (
              <div className="pill-scelta" style={{ marginTop: 8 }}>
                {collezioniVisibili
                  .filter((c) => !collezioniScelte.includes(c.id) && c.titolo.toLowerCase().includes(cercaCollezione.trim().toLowerCase()))
                  .slice(0, 30)
                  .map((c) => (
                    <button key={c.id} type="button" className="pill-opt chip-scelta" onClick={() => { setCollezioniScelte((x) => [...x, c.id]); setCercaCollezione(""); }}>
                      + {c.titolo}
                    </button>
                  ))}
                {collezioniVisibili.filter((c) => !collezioniScelte.includes(c.id) && c.titolo.toLowerCase().includes(cercaCollezione.trim().toLowerCase())).length === 0 && (
                  <span className="cella-sub">Nessuna collezione manuale con questo nome.</span>
                )}
              </div>
            )}
            <span className="cella-sub">
              Nessuna collezione è ammesso. Le manuali si aggiungono e si tolgono da qui (alla pubblicazione, o subito se il prodotto è già sul negozio);
              in quelle automatiche decide la regola del negozio.
            </span>
          </div>
          <div className="campo-modulo">
            <label htmlFor="fase">{modifica ? "Fase" : "Fase iniziale"}</label>
            <select id="fase" name="fase" value={fase} onChange={(e) => setFase(e.target.value)}>
              {FASI_SCELTA.map((f) => (
                <option key={f} value={f}>
                  {ETICHETTA_FASE[f]}
                  {f === "in_vendita" ? " — va su Shopify" : ""}
                </option>
              ))}
            </select>
            {modifica && iniziale?.shopifyId && fase !== "in_vendita" && (
              <span className="cella-sub">Togliendo «Pubblico» il prodotto torna bozza sul negozio: il cliente non lo vede più.</span>
            )}
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="descrizione">Descrizione</label>
            <div className="riga-ai">
              <select value={tono} onChange={(e) => setTono(e.target.value)} aria-label="Tono della descrizione">
                <option value="maison">Tono maison</option>
                <option value="caldo">Tono caldo</option>
                <option value="essenziale">Tono essenziale</option>
              </select>
              <button type="button" className="btn btn-secondario small" onClick={scriviConAI} disabled={scrivendo || !aiPronta} title={aiPronta ? "Scrive una proposta partendo dai dati del prodotto" : "Manca la chiave OpenAI"}>
                {scrivendo ? "Sto scrivendo…" : "✦ Scrivi con l'AI"}
              </button>
              {descrizione && !scrivendo && (
                <button type="button" className="btn btn-secondario small" onClick={scriviConAI}>
                  Riscrivi
                </button>
              )}
            </div>
            <textarea id="descrizione" name="descrizione" rows={descrizione ? 8 : 3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} placeholder="Il testo che il cliente legge. Puoi scriverlo tu o farlo proporre all'AI (usa nome, categoria, materiali e prezzo)." />
            {erroreAi && <div className="avviso-errore" style={{ marginTop: 8 }}>{erroreAi}</div>}
            {!aiPronta && <span className="cella-sub">Per la scrittura AI serve la chiave OpenAI, in Negozi &amp; permessi.</span>}
          </div>
        </div>
      </div>

      {/* ---------- Tag ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Tag</div>
        <p className="page-sub" style={{ marginBottom: 10 }}>
          I tag del negozio (occasioni, città, fornitore…): scrivi e premi Invio o virgola. I suggerimenti sono i tag già in uso sui prodotti importati.
        </p>
        <div className="pill-scelta" style={{ marginBottom: 8 }}>
          {tags.map((t) => (
            <span key={t} className="pill-opt attuale">
              {t}
              <button type="button" className="icon-btn" style={{ padding: 0, width: 18, height: 18 }} title={`Togli ${t}`} onClick={() => setTags((x) => x.filter((y) => y !== t))}>
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          list="tag-esistenti"
          value={tagNuovo}
          onChange={(e) => setTagNuovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              aggiungiTag(tagNuovo);
            }
          }}
          onBlur={() => aggiungiTag(tagNuovo)}
          placeholder="Aggiungi un tag…"
          aria-label="Nuovo tag"
          style={{ font: "inherit", padding: "8px 12px", borderRadius: "var(--radius-m)", border: "1px solid transparent", background: "var(--fill)", width: 280 }}
        />
        <datalist id="tag-esistenti">
          {tagEsistenti.filter((t) => !tags.includes(t)).slice(0, 400).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      {/* ---------- Campi del negozio (metafield) ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Campi del negozio · {definizioni.length}</div>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          I campi che {negozio?.nome ?? "il negozio"} definisce su Shopify (i <i>metafield</i>), coi valori che ammette. Si scrivono sul negozio
          alla pubblicazione e restano qui sulla scheda. Quelli a scelta chiusa (riferimenti a file, metaobject, prodotti correlati) si
          impostano nell&apos;admin del negozio.
        </p>
        {definizioni.length === 0 ? (
          <div className="vuoto-mini">Nessuna definizione letta per questo negozio: arriva col prossimo import delle collezioni.</div>
        ) : (
          (() => {
            // Prima i campi che il negozio tiene **in evidenza** nell'admin
            // (quelli appuntati: occasioni, fiori, orario…), nell'ordine
            // dell'admin; gli altri — spesso campi di prova o di app — stanno
            // ripiegati, ma si aprono se ne hanno già un valore.
            const inEvidenza = definizioni.filter((d) => d.posizione != null);
            const altri = definizioni.filter((d) => d.posizione == null);
            const principali = inEvidenza.length ? inEvidenza : altri;
            const secondari = inEvidenza.length ? altri : [];
            const compilati = secondari.filter((d) => (metafield[chiaveDef(d)] ?? "") !== "").length;
            const campo = (d: DefinizioneMetafield) => (
              <CampoMetafield key={chiaveDef(d)} def={d} valore={metafield[chiaveDef(d)] ?? ""} onChange={(v) => setMetafield((m) => ({ ...m, [chiaveDef(d)]: v }))} />
            );
            return (
              <>
                <div className="modulo">{principali.map(campo)}</div>
                {secondari.length > 0 && (
                  <details className="altri-campi" open={compilati > 0 || undefined}>
                    <summary className="pill-opt">
                      Altri {secondari.length} campi non in evidenza{compilati ? ` · ${compilati} compilati` : ""}
                    </summary>
                    <p className="cella-sub" style={{ margin: "8px 0 10px" }}>
                      Campi che il negozio non tiene in evidenza nell&apos;admin: di prova, di app o usati di rado. Si compilano solo se servono.
                    </p>
                    <div className="modulo">{secondari.map(campo)}</div>
                  </details>
                )}
              </>
            );
          })()
        )}
      </div>

      {/* ---------- Foto e video ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Foto e video</div>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          Vanno nei <b>Files del negozio {negozio?.nome ?? ""}</b> su Shopify, anche se il prodotto non è ancora pubblico; alla pubblicazione si
          agganciano al prodotto. La prima immagine è quella principale.
        </p>
        <label className="btn btn-secondario" style={{ cursor: caricando ? "wait" : "pointer" }}>
          {caricando ? "Caricamento in corso…" : "Scegli foto o video"}
          <input type="file" accept="image/*,video/*" multiple hidden disabled={caricando || !negozio} onChange={(e) => { void caricaFile(e.target.files); e.target.value = ""; }} />
        </label>
        {erroreMedia && <div className="avviso-errore" style={{ marginTop: 10 }}>{erroreMedia}</div>}
        {mediaDiAltri > 0 && <p className="cella-sub" style={{ marginTop: 8 }}>{mediaDiAltri} file caricati per un altro negozio non si useranno: restano nei suoi Files.</p>}
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
                <button type="button" className="icon-btn" title="Togli dal prodotto (il file resta nei Files del negozio)" onClick={() => setMedia((x) => x.filter((y) => y.shopifyFileId !== m.shopifyFileId))}>
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
            <textarea id="brief" name="brief" rows={2} placeholder="Il concept del prodotto" defaultValue={iniziale?.brief ?? ""} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="materiali">Materiali / fiori</label>
            <input id="materiali" name="materiali" placeholder="Anemoni, ranuncoli, foglia oro" defaultValue={iniziale?.materiali ?? ""} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="palette">Palette</label>
            <input id="palette" name="palette" placeholder="Indaco · avorio · oro" defaultValue={iniziale?.palette ?? ""} />
          </div>
        </div>
      </div>

      {/* ---------- Costi, prezzo, giacenza ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Costi, prezzo e giacenza</div>
        <div className="modulo">
          <div className="campo-modulo">
            <label htmlFor="costoProduzione">Costo di produzione (€)</label>
            <input id="costoProduzione" name="costoProduzione" type="number" step="0.01" min="0" defaultValue={iniziale?.costoProduzione ?? 0} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="prezzoVendita">Prezzo di vendita (€)</label>
            <input id="prezzoVendita" name="prezzoVendita" type="number" step="0.01" min="0" defaultValue={iniziale?.prezzoVendita ?? 0} />
            {haVarianti && <span className="cella-sub">Con le varianti è il prezzo base: se lo lasci a 0 vale il prezzo della variante più economica.</span>}
          </div>
          <div className="campo-modulo">
            <label htmlFor="prezzoPartner">Prezzo partner (€)</label>
            <input id="prezzoPartner" name="prezzoPartner" type="number" step="0.01" min="0" defaultValue={iniziale?.prezzoPartner ?? ""} placeholder="—" />
            <span className="cella-sub">Quanto viene dato al partner. Dato interno, non va su Shopify. Vuoto = non indicato.</span>
          </div>
          <div className="campo-modulo largo">
            <label className="pill-opt" style={{ cursor: "pointer", width: "fit-content" }}>
              <input type="checkbox" checked={controllaStock} onChange={(e) => setControllaStock(e.target.checked)} />
              Controlla la giacenza
            </label>
            <span className="cella-sub">Facoltativa. Spenta sul prodotto, non c&apos;è nemmeno per le varianti: su Shopify il prodotto non conta lo stock.</span>
          </div>
          {controllaStock && !haVarianti && (
            <div className="campo-modulo">
              <label htmlFor="giacenza">Giacenza</label>
              <input id="giacenza" name="giacenza" type="number" min={0} defaultValue={iniziale?.giacenza ?? 0} />
            </div>
          )}
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
                    <th className="num">Partner (€)</th>
                    {controllaStock && <th className="num">Giacenza</th>}
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
                        <code>{skuVariante(v, i)}</code>
                      </td>
                      <td>
                        <input value={v.prezzo} onChange={(e) => aggiornaVariante(i, "prezzo", e.target.value)} inputMode="decimal" className="num" placeholder="95,00" aria-label={`Prezzo variante ${i + 1}`} />
                      </td>
                      <td>
                        <input value={v.costo} onChange={(e) => aggiornaVariante(i, "costo", e.target.value)} inputMode="decimal" className="num" placeholder="0" aria-label={`Costo variante ${i + 1}`} />
                      </td>
                      <td>
                        <input value={v.prezzoPartner} onChange={(e) => aggiornaVariante(i, "prezzoPartner", e.target.value)} inputMode="decimal" className="num" placeholder="—" aria-label={`Prezzo partner variante ${i + 1}`} />
                      </td>
                      {controllaStock && (
                        <td>
                          <input value={v.giacenza} onChange={(e) => aggiornaVariante(i, "giacenza", e.target.value)} type="number" min={0} className="num" aria-label={`Giacenza variante ${i + 1}`} />
                        </td>
                      )}
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
              Gli SKU delle varianti sono lo SKU principale più «-1», «-2»…; le varianti già salvate tengono il loro. Su Shopify diventano le varianti
              dell&apos;opzione «{nomeOpzione || "Formato"}».
              {modifica && iniziale?.shopifyId ? " Una variante tolta qui resta sul negozio: si toglie dall'admin di Shopify." : ""}
            </p>
          </>
        )}
      </div>

      {/* ---------- Pubblicazione (solo con la fase Pubblico: deciso dall'utente) ---------- */}
      {pubblico && (
      <div className="scheda">
        <div className="scheda-titolo">Pubblicazione su {negozio?.nome ?? "Shopify"}</div>
        {!negozio?.puoScrivere && (
          <div className="avviso-errore" style={{ marginBottom: 12 }}>
            Il negozio scelto non ha il permesso <code>write_products</code>: qui si può salvare il prodotto solo come bozza interna. Aggiungi il permesso
            all&apos;app Shopify e rifai la verifica in Negozi &amp; permessi.
          </div>
        )}
        <div className="modulo">
          <div className="campo-modulo">
            <label htmlFor="pubblicatoDal">Pubblico dal</label>
            <input id="pubblicatoDal" name="pubblicatoDal" type="date" defaultValue={iniziale?.pubblicatoDal ?? ""} />
            <span className="cella-sub">Vuoto = da subito. Con una data futura nasce come bozza e si accende quel giorno.</span>
          </div>
          <div className="campo-modulo">
            <label htmlFor="pubblicatoFinoAl">Fino al (facoltativo)</label>
            <input id="pubblicatoFinoAl" name="pubblicatoFinoAl" type="date" defaultValue={iniziale?.pubblicatoFinoAl ?? ""} />
            <span className="cella-sub">Vuoto = per sempre. Il giorno dopo torna bozza sul negozio.</span>
          </div>
          <div className="campo-modulo largo">
            <label className="pill-opt" style={{ cursor: "pointer", width: "fit-content" }}>
              <input type="checkbox" name="traduci" defaultChecked={!modifica} />
              {modifica ? "Riscrivi le traduzioni" : "Traduci"} titolo e descrizione nelle 8 lingue del negozio (con l&apos;AI)
            </label>
            <span className="cella-sub">
              Inglese, francese, tedesco, spagnolo, russo, cinese, arabo, giapponese. Le lingue che il negozio non ha configurato vengono rifiutate da
              Shopify e lo si legge nell&apos;esito.
            </span>
          </div>
        </div>
      </div>
      )}

      <div className="azioni-modulo">
        <a className="btn btn-secondario" href={modifica ? `/prodotti/${iniziale?.id}` : "/prodotti"}>
          Annulla
        </a>
        <button type="submit" className="btn" disabled={!puoPubblicare || caricando || negozi.length === 0}>
          {modifica
            ? pubblico && !iniziale?.shopifyId
              ? `Salva e pubblica su ${negozio?.nome ?? "Shopify"}`
              : iniziale?.shopifyId
                ? "Salva qui e sul negozio"
                : "Salva le modifiche"
            : pubblico
              ? `Crea e pubblica su ${negozio?.nome ?? "Shopify"}`
              : "Crea prodotto"}
        </button>
      </div>
    </form>
  );
}

/** Un metafield reso secondo il suo tipo e i valori ammessi. */
function CampoMetafield({ def, valore, onChange }: { def: DefinizioneMetafield; valore: string; onChange: (v: string) => void }) {
  const id = `mf-${def.namespace}-${def.key}`;
  const compilato = valore !== "";
  // L'etichetta: il nome dato nell'admin, con la chiave tecnica accanto in
  // piccolo — con nomi come «Data» o «Test1» è la chiave a dire cos'è.
  const etichetta = (
    <>
      {etichettaDef(def)}
      <span className="mf-chiave">{chiaveDef(def)}</span>
      {compilato && <span className="mf-punto" title="Compilato" />}
    </>
  );
  const aiuto = def.descrizione ? <span className="cella-sub">{def.descrizione}</span> : null;

  if (def.tipo === "list.single_line_text_field" && def.scelte?.length) {
    const scelti = new Set(listaDa(valore));
    const toggle = (s: string, acceso: boolean) => {
      const n = new Set(scelti);
      if (acceso) n.add(s);
      else n.delete(s);
      onChange(n.size ? JSON.stringify([...n]) : "");
    };
    return (
      <div className="campo-modulo largo">
        <label>{etichetta}</label>
        <div className="pill-scelta">
          {def.scelte.map((s) => (
            <label key={s} className={`pill-opt chip-scelta${scelti.has(s) ? " selezionato" : ""}`}>
              <input type="checkbox" checked={scelti.has(s)} onChange={(e) => toggle(s, e.target.checked)} hidden />
              {scelti.has(s) ? "✓ " : ""}
              {s}
            </label>
          ))}
        </div>
        {scelti.size > 0 && <span className="cella-sub">{scelti.size} scelti</span>}
        {aiuto}
      </div>
    );
  }
  if (def.tipo === "list.single_line_text_field") {
    return (
      <div className="campo-modulo largo">
        <label htmlFor={id}>{etichetta}</label>
        <input id={id} value={listaDa(valore).join("; ")} onChange={(e) => { const l = e.target.value.split(";").map((s) => s.trim()).filter(Boolean); onChange(l.length ? JSON.stringify(l) : ""); }} placeholder="Uno o più valori, separati da ;" />
        {aiuto}
      </div>
    );
  }
  if (def.scelte?.length) {
    return (
      <div className="campo-modulo">
        <label htmlFor={id}>{etichetta}</label>
        <select id={id} value={valore} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {def.scelte.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {aiuto}
      </div>
    );
  }
  if (def.tipo === "boolean") {
    return (
      <div className="campo-modulo">
        <label htmlFor={id}>{etichetta}</label>
        <select id={id} value={valore} onChange={(e) => onChange(e.target.value)}>
          <option value="">— non indicato —</option>
          <option value="true">Sì</option>
          <option value="false">No</option>
        </select>
        {aiuto}
      </div>
    );
  }
  if (def.tipo === "number_integer" || def.tipo === "number_decimal") {
    return (
      <div className="campo-modulo">
        <label htmlFor={id}>{etichetta}</label>
        <input id={id} type="number" step={def.tipo === "number_integer" ? 1 : "0.01"} min={def.min ?? undefined} max={def.max ?? undefined} value={valore} onChange={(e) => onChange(e.target.value)} />
        {aiuto}
      </div>
    );
  }
  if (def.tipo === "multi_line_text_field") {
    return (
      <div className="campo-modulo largo">
        <label htmlFor={id}>{etichetta}</label>
        <textarea id={id} rows={2} value={valore} onChange={(e) => onChange(e.target.value)} />
        {aiuto}
      </div>
    );
  }
  return (
    <div className="campo-modulo">
      <label htmlFor={id}>{etichetta}</label>
      <input id={id} type={def.tipo === "url" ? "url" : "text"} value={valore} onChange={(e) => onChange(e.target.value)} />
      {aiuto}
    </div>
  );
}
