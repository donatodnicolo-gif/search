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
import { ETICHETTA_FASE, ETICHETTA_TIPOLOGIA_VENDITA, SPIEGAZIONE_TIPOLOGIA_VENDITA, TIPOLOGIE_VENDITA } from "@/lib/dominio";
import { chiaveDef, etichettaDef, listaDa, type DefinizioneMetafield } from "@/lib/metafield-puro";

export type NegozioPerForm = { id: string; nome: string; dominio: string; puoScrivere: boolean };
export type CategoriaPerForm = { chiave: string; nome: string; negozio: string | null; conPrompt: boolean };
export type CollezionePerForm = { id: string; titolo: string; negozio: string };
/** ⭐ 08/09/2026: una sezione della scheda, per categoria e negozio. */
export type SezionePerForm = { categoria: string; negozio: string | null; nome: string; tipo: string; richiesta: boolean; ordine: number };

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

export type VarianteForm = { nome: string; sku: string | null; prezzo: string; costo: string; prezzoPartner: string; giacenza: string; note: string };

/** Quello che il modulo mostra quando si modifica un prodotto esistente. */
export type ProdottoIniziale = {
  id: string;
  nome: string;
  negozioId: string;
  fase: string;
  categoria: string;
  tipologiaVendita: string | null;
  note: string;
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
  /** ⭐ 08/09/2026: il plus del prodotto e le sezioni già compilate, per negozio. */
  plusProdotto?: string;
  sezioniScheda?: Record<string, Record<string, string>>;
  /** Le collezioni in cui il prodotto sta già (dall'import), automatiche comprese. */
  collezioni: { id: string; titolo: string; tipo: string; negozio?: string }[];
  shopifyId: string | null;
  /** ⭐ 07/09/2026: gli altri negozi (id) in cui il prodotto è o va pubblicato, oltre al principale. */
  altriNegoziId: string[];
  /** Dove sta già, negozio per negozio: per dirlo accanto alla scelta. */
  pubblicazioni: { negozio: string; shopifyId: string | null; statoShopify: string | null; statoVoluto?: string | null; errore: string | null; origine: string }[];
};

/**
 * **Come si compila una sezione**, secondo il tipo che aveva nel vecchio
 * gestionale. Il tipo non è un vezzo: «Dimensioni» è fatta di coppie
 * (Altezza: 60 cm) e «Perfetto per» di voci; scriverle nel modo sbagliato dà
 * una scheda che sul sito si legge male, e nessuno se ne accorge finché non
 * la guarda un cliente.
 */
const SEZIONE_AIUTO: Record<string, { placeholder: string; nota: string; righe: number }> = {
  testo: { placeholder: "Il testo che il cliente legge in questa sezione.", nota: "Testo libero.", righe: 4 },
  elenco: { placeholder: "Una voce per riga: Consegna in giornata", nota: "Una voce per riga: sul sito diventa un elenco puntato.", righe: 4 },
  coppie: { placeholder: "Una per riga, nome e valore: Altezza: 60 cm", nota: "Una per riga, «Nome: valore»: sul sito diventa una tabellina.", righe: 4 },
};

/** Come si chiamano gli stati di Shopify quando li legge una persona. */
const ETICHETTA_STATO_NEGOZIO: Record<string, string> = { ACTIVE: "attivo", DRAFT: "bozza", ARCHIVED: "archiviato" };

const FASI_SCELTA = ["concept", "prototipo", "approvato", "in_vendita"] as const;

/**
 * Una riga variante nuova. **Parte dal prezzo base del prodotto** (chiesto
 * dall'utente l'08/09/2026): le varianti di una scheda sono quasi sempre lo
 * stesso prodotto in misure diverse, e chi compila parte da quel numero e lo
 * ritocca — col campo vuoto lo si riscriveva ogni volta, e una riga dimenticata
 * finiva sul negozio a un prezzo che nessuno aveva deciso. Resta modificabile
 * riga per riga.
 */
const varianteVuota = (prezzoBase = ""): VarianteForm => ({ nome: "", sku: null, prezzo: prezzoBase, costo: "", prezzoPartner: "", giacenza: "0", note: "" });

/** Il prezzo di vendita scritto **adesso** nel modulo, letto dal form quando serve. */
function prezzoBaseDelForm(dentro: HTMLElement | null): string {
  const campo = dentro?.closest("form")?.elements.namedItem("prezzoVendita");
  const valore = campo instanceof HTMLInputElement ? campo.value.trim() : "";
  // Lo zero è il valore di partenza del campo, non un prezzo deciso: in quel
  // caso è più onesto lasciare la riga vuota, che si vede.
  return valore && Number(valore.replace(",", ".")) > 0 ? valore : "";
}

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
  sezioni = [],
  plusNegozio = {},
  azione,
  iniziale,
  duplica,
}: {
  negozi: NegozioPerForm[];
  categorie: CategoriaPerForm[];
  collezioni: CollezionePerForm[];
  definizioniPerNegozio: Record<string, DefinizioneMetafield[]>;
  tagEsistenti: string[];
  aiPronta: boolean;
  /** ⭐ 08/09/2026: le sezioni previste per ciascuna categoria e negozio. */
  sezioni?: SezionePerForm[];
  /** I due plus di ogni sito: righe 2 e 3 dell'elenco in cima alla scheda. */
  plusNegozio?: Record<string, { uno: string; due: string }>;
  azione: (fd: FormData) => void;
  iniziale?: ProdottoIniziale;
  /** ⭐ 07/09/2026 (utente): «duplica»: gli stessi dati di `iniziale`, ma è un prodotto NUOVO — SKU nuovo, varianti rinumerate. */
  duplica?: boolean;
}) {
  const modifica = !!iniziale && !duplica;
  const form = useRef<HTMLFormElement>(null);
  const [negozioId, setNegozioId] = useState(iniziale?.negozioId || negozi[0]?.id || "");
  const negozio = negozi.find((n) => n.id === negozioId) ?? null;
  // ⭐ 07/09/2026 (chiesto dall'utente): «pubblica anche su» — più negozi, per i
  // prodotti nuovi e per quelli esistenti. Il principale resta uno (categorie,
  // Files delle foto); gli altri ricevono la loro copia alla pubblicazione.
  const [altriNegozi, setAltriNegozi] = useState<string[]>((iniziale?.altriNegoziId ?? []).filter((x) => x !== (iniziale?.negozioId || negozi[0]?.id)));
  const negoziAnche = negozi.filter((n) => altriNegozi.includes(n.id) && n.id !== negozioId);
  const nomiNegoziScelti = [negozio?.nome ?? "Shopify", ...negoziAnche.map((n) => n.nome)];
  const statoSu = (nome: string) => iniziale?.pubblicazioni.find((p) => p.negozio === nome) ?? null;
  const [fase, setFase] = useState<string>(iniziale?.fase ?? "concept");
  const pubblico = fase === "in_vendita";
  const [categoria, setCategoria] = useState(iniziale?.categoria === "DA_CLASSIFICARE" ? "" : (iniziale?.categoria ?? ""));
  // ⭐ 06/09/2026 (regola utente): la tipologia di vendita è obbligatoria e ha la sua legenda.
  const [tipologiaVendita, setTipologiaVendita] = useState(iniziale?.tipologiaVendita ?? "");
  // Collezioni (più d'una, chiesto dall'utente): in creazione si scelgono fra
  // le manuali del negozio; in modifica si parte da quelle in cui il prodotto
  // sta già. Le automatiche si vedono ma non si toccano: decide la regola.
  const [collezioniScelte, setCollezioniScelte] = useState<string[]>(
    iniziale ? iniziale.collezioni.filter((c) => c.tipo === "manuale").map((c) => c.id) : []
  );
  const [cercaCollezione, setCercaCollezione] = useState("");
  const collezioniAutomatiche = iniziale?.collezioni.filter((c) => c.tipo !== "manuale") ?? [];
  // In duplica il codice arriva vuoto apposta: ne nasce uno nuovo, e con lui gli SKU delle varianti.
  const [sku, setSku] = useState(iniziale?.codice || skuCasuale);
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
  // ⭐ 08/09/2026 — **I tre punti in cima alla scheda**: il primo lo scrive chi
  // compila (è di questo prodotto), gli altri due vengono dai plus del sito.
  const [plusProdotto, setPlusProdotto] = useState(iniziale?.plusProdotto ?? "");
  // ⭐ **Le sezioni compilate, per negozio**: { "Gifts": { "Significato": "…" } }.
  // Separate per sito, come deciso dall'utente: lo stesso prodotto si racconta
  // diversamente al B2B e al cliente finale.
  const [sezioniValori, setSezioniValori] = useState<Record<string, Record<string, string>>>(iniziale?.sezioniScheda ?? {});
  const valoreSezione = (negozioNome: string, nome: string) => sezioniValori[negozioNome]?.[nome] ?? "";
  const cambiaSezione = (negozioNome: string, nome: string, v: string) =>
    setSezioniValori((tutte) => ({ ...tutte, [negozioNome]: { ...(tutte[negozioNome] ?? {}), [nome]: v } }));
  /** Le sezioni previste per la categoria scelta su un certo negozio: quelle
   *  del negozio se ce ne sono, altrimenti quelle valide per tutti. */
  const sezioniDi = (negozioNome: string) => {
    if (!categoria) return [];
    const perNegozio = sezioni.filter((x) => x.categoria === categoria && x.negozio === negozioNome);
    return (perNegozio.length ? perNegozio : sezioni.filter((x) => x.categoria === categoria && !x.negozio)).slice().sort((a: SezionePerForm, b: SezionePerForm) => a.ordine - b.ordine);
  };
  /** Cosa finisce nel database: le sezioni **con del testo dentro**. Le vuote
   *  non si salvano, altrimenti la scheda porterebbe per sempre le chiavi di
   *  una categoria che qualcuno ha cambiato dopo. I valori dei negozi non più
   *  scelti restano invece dove sono: sono lavoro fatto, e ricompaiono se quel
   *  sito torna. */
  const sezioniDaSalvare = Object.fromEntries(
    Object.entries(sezioniValori)
      .map(([sito, campi]) => [sito, Object.fromEntries(Object.entries(campi).filter(([, v]) => (v ?? "").trim() !== ""))] as const)
      .filter(([, campi]) => Object.keys(campi).length > 0)
  );
  // ⭐ 08/09/2026: lo **stato voluto** negozio per negozio. Parte da quello già
  // deciso in precedenza, non da quello letto sul sito: è una scelta, non una
  // fotografia — e la differenza fra i due è la cosa ancora da fare.
  const [statiVoluti, setStatiVoluti] = useState<Record<string, string>>(
    Object.fromEntries((iniziale?.pubblicazioni ?? []).map((p) => [p.negozio, p.statoVoluto ?? ""]))
  );
  const negoziDelProdotto = [...new Set((iniziale?.pubblicazioni ?? []).filter((p) => p.shopifyId).map((p) => p.negozio))].sort();
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
  const collezioniVisibili = collezioni.filter((c) => c.negozio === negozio?.nome || negoziAnche.some((n) => n.nome === c.negozio));
  const conNegozio = (titolo: string, nomeNegozio?: string | null) => (negoziAnche.length && nomeNegozio ? `${titolo} · ${nomeNegozio}` : titolo);
  const mediaDiQuestoNegozio = media.filter((m) => m.negozio === negozio?.nome);
  const mediaDiAltri = media.length - mediaDiQuestoNegozio.length;
  const definizioni = negozio ? definizioniPerNegozio[negozio.nome] ?? [] : [];

  function cambiaNegozio(id: string) {
    setNegozioId(id);
    setAltriNegozi((x) => x.filter((y) => y !== id));
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

  const puoPubblicare = !pubblico || ((negozio?.puoScrivere ?? false) && negoziAnche.every((n) => n.puoScrivere));

  return (
    <form action={azione} ref={form}>
      <input type="hidden" name="mediaJson" value={JSON.stringify(mediaDiQuestoNegozio)} />
      <input type="hidden" name="negozioId" value={negozioId} />
      <input type="hidden" name="negoziPubblicazioneJson" value={JSON.stringify(negoziAnche.map((n) => n.id))} />
      <input type="hidden" name="nomeOpzione" value={nomeOpzione} />
      <input
        type="hidden"
        name="variantiJson"
        value={JSON.stringify(haVarianti ? varianti.filter((v) => v.nome.trim()).map((v, i) => ({ ...v, sku: v.sku ?? null, indice: i })) : [])}
      />
      <input type="hidden" name="metafieldJson" value={JSON.stringify(metafield)} />
      <input type="hidden" name="tagsJson" value={JSON.stringify(tags)} />
      <input type="hidden" name="plusProdotto" value={plusProdotto} />
      <input type="hidden" name="sezioniJson" value={JSON.stringify(sezioniDaSalvare)} />
      {controllaStock && <input type="hidden" name="controllaStock" value="1" />}

      {/* ---------- In duplica: da dove vengono i dati, e cosa cambia ---------- */}
      {duplica && iniziale && (
        <div className="riepilogo-modifica">
          <div>
            <div className="riepilogo-titolo">Copia di «{iniziale.nome.replace(/^\(Duplica\) /, "").replace(/ \(copia\)$/, "")}»</div>
            <div className="cella-sub">
              Stessi dati, prodotto nuovo: SKU <b>{sku}</b> (rigenerato) e varianti rinumerate {sku}-1, {sku}-2…; foto, campi, tag e collezioni
              ricopiati. L&apos;originale non cambia. Nasce come <b>Concept</b>: per mandarlo sul negozio scegli la fase Pubblico.
            </div>
          </div>
        </div>
      )}

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
          {negozi.length > 1 && (
            <div className="campo-modulo largo">
              <label>Pubblica anche su{negoziAnche.length ? ` · ${negoziAnche.length} ${negoziAnche.length === 1 ? "altro negozio" : "altri negozi"}` : ""}</label>
              <div className="pill-scelta">
                {negozi
                  .filter((n) => n.id !== negozioId)
                  .map((n) => {
                    const acceso = altriNegozi.includes(n.id);
                    const st = statoSu(n.nome);
                    const dove =
                      st?.shopifyId && st.origine !== "tolto"
                        ? st.statoShopify === "ACTIVE" ? " · già attivo là" : st.statoShopify === "DRAFT" ? " · là in bozza" : st.statoShopify === "ARCHIVED" ? " · là archiviato" : ""
                        : st?.errore ? " · rifiutato l'ultima volta" : "";
                    return (
                      <label key={n.id} className={`pill-opt chip-scelta${acceso ? " selezionato" : ""}`} title={n.puoScrivere ? n.dominio : `${n.nome} non ha il permesso write_products`} style={n.puoScrivere ? undefined : { opacity: 0.5 }}>
                        <input type="checkbox" checked={acceso} disabled={!n.puoScrivere} onChange={(e) => setAltriNegozi((x) => (e.target.checked ? [...x, n.id] : x.filter((y) => y !== n.id)))} hidden />
                        {acceso ? "✓ " : "+ "}
                        {n.nome}
                        {dove}
                        {!n.puoScrivere ? " · solo lettura" : ""}
                      </label>
                    );
                  })}
              </div>
              <span className="cella-sub">
                Con la fase <b>Pubblico</b> il prodotto nasce anche su questi negozi, con gli stessi SKU, prezzi e varianti, le loro collezioni e i loro campi; le foto
                si copiano dal negozio principale. Togliendo un negozio in cui è già pubblicato, là torna bozza (non si cancella).
              </span>
            </div>
          )}

          {/* **Lo stato, negozio per negozio** (08/09/2026, richiesta dell'utente:
              «in modifica prodotto non è presente la possibilità di impostare lo
              stato», e «lo stato può essere diverso per ogni negozio»).
              Comandiamo noi: quello che si sceglie qui viene **imposto al sito**
              al salvataggio. Accanto si legge com'è adesso là, così si vede
              subito se la scelta è già realtà o è una cosa da fare. */}
          {modifica && negoziDelProdotto.length > 0 && (
            <div className="campo-modulo largo">
              <label>Stato su ogni negozio</label>
              <div className="stati-negozio">
                {negoziDelProdotto.map((nome) => {
                  const st = statoSu(nome);
                  const ora = st?.statoShopify ?? null;
                  const scelto = statiVoluti[nome] ?? "";
                  return (
                    <div key={nome} className="stato-negozio-riga">
                      <b>{nome}</b>
                      <select
                        name={`stato:${nome}`}
                        value={scelto}
                        onChange={(e) => setStatiVoluti((s) => ({ ...s, [nome]: e.target.value }))}
                      >
                        <option value="">Lascia com&apos;è{ora ? ` (${ETICHETTA_STATO_NEGOZIO[ora] ?? ora})` : ""}</option>
                        <option value="ACTIVE">Attivo — in vendita sul sito</option>
                        <option value="DRAFT">Bozza — non visibile ai clienti</option>
                        <option value="ARCHIVED">Archiviato — fuori catalogo</option>
                      </select>
                      {scelto && ora && scelto !== ora && (
                        <span className="cella-sub">da {ETICHETTA_STATO_NEGOZIO[ora] ?? ora} → si scrive sul negozio al salvataggio</span>
                      )}
                      {scelto && ora === scelto && <span className="cella-sub">è già così</span>}
                    </div>
                  );
                })}
              </div>
              <span className="cella-sub">
                Un prodotto può essere attivo su un sito e in bozza su un altro. Quello che scegli qui viene scritto sul negozio: la fase del ciclo di vita qui sopra
                resta la nostra, e riguarda il prodotto nel suo insieme.
              </span>
            </div>
          )}
          <div className="campo-modulo">
            <label htmlFor="codice">Codice / SKU</label>
            <div className="riga-ai" style={{ marginBottom: 0 }}>
              {/* ⚠️ **Il pattern non è più «sette cifre»** (08/09/2026, bloccava
                  l'utente su un caso vero: «Magnum Rosé», SKU `LFAKLK`, non si
                  poteva aggiungere a Business perché il browser rifiutava il
                  campo). Le sette cifre sono la forma degli SKU **nuovi**, che
                  l'app genera da sé; i 5.059 prodotti importati hanno SKU
                  storici di ogni forma — lettere, misti, con trattini — e in
                  modifica il pattern impediva **ogni** salvataggio, anche di
                  cose che con lo SKU non c'entrano.
                  E riscriverli d'ufficio sarebbe peggio del blocco: lo SKU lega
                  il prodotto agli ordini, al magazzino e ai suoi gemelli sugli
                  altri negozi (regola del 06/09: lo stesso prodotto su più siti
                  condivide lo SKU). Quindi qui si accetta quello che c'è, e
                  «Rigenera» resta a disposizione per sceglierlo. */}
              <input
                id="codice"
                name="codice"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}"
                title="Da 3 a 40 caratteri: lettere, cifre, punto, trattino. I nuovi nascono a sette cifre; quelli storici del negozio si tengono come sono."
                style={{ flex: 1 }}
              />
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
            <label htmlFor="note">Note di specifica</label>
            <textarea id="note" name="note" rows={2} defaultValue={iniziale?.note ?? ""}
                      placeholder="Che cosa c'è dentro: «20-25 fiori», «18-20 cm, 650 g - 1 kg», «6/8 porzioni»" />
            <span className="cella-sub">
              La legge il fioraio quando riceve l&apos;ordine: è quello che gli dice quanti fiori mettere.
              Se una taglia ha la sua misura, scrivila sulla variante.
            </span>
          </div>
          <div className="campo-modulo">
            {/* ⭐ 07/09/2026 (utente): NON è una «tipologia di vendita» del negozio, è una
                classificazione interna dell'app che la piattaforma consegne legge per
                scegliere il fornitore e fare il prezzo. Il campo nel database resta
                `tipologiaVendita` (lo leggono l'API e la piattaforma); cambia come si chiama. */}
            <label htmlFor="tipologiaVendita">Classificazione interna</label>
            <select id="tipologiaVendita" name="tipologiaVendita" value={tipologiaVendita} onChange={(e) => setTipologiaVendita(e.target.value)} required>
              <option value="">— Scegli —</option>
              {TIPOLOGIE_VENDITA.map((t) => (
                <option key={t} value={t}>
                  {ETICHETTA_TIPOLOGIA_VENDITA[t]}
                </option>
              ))}
            </select>
            <span className="cella-sub">
              Classificazione dell&apos;app, non del negozio: la piattaforma consegne la legge per scegliere il fornitore e fare il prezzo. Non va su Shopify.
              {tipologiaVendita ? ` ${SPIEGAZIONE_TIPOLOGIA_VENDITA[tipologiaVendita] ?? ""}` : ""}
            </span>
            <ul className="legenda-tipologia">
              {TIPOLOGIE_VENDITA.map((t) => (
                <li key={t}>
                  <b>{ETICHETTA_TIPOLOGIA_VENDITA[t]}</b> — {SPIEGAZIONE_TIPOLOGIA_VENDITA[t]}
                </li>
              ))}
            </ul>
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
                      {conNegozio(c?.titolo ?? id, (c as { negozio?: string } | undefined)?.negozio)}
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
              placeholder={`Cerca fra le ${collezioniVisibili.length} collezioni manuali di ${nomiNegoziScelti.join(" e ")}…`}
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
                      + {conNegozio(c.titolo, c.negozio)}
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

      {/* ---------- La scheda sul sito: i tre punti e le sezioni della categoria ----------
          Richiesta dell'utente (08/09/2026): «in impostazioni per ogni sito
          definisci due plus del sito, sono i 3 punti che per ogni prodotto sono
          mostrati all'inizio; il primo dei 3 è invece un plus del prodotto
          scritto dall'utente. Ogni categoria poi ha delle sezioni: i fiori hanno
          significato, dimensioni… I 3 punti e le sezioni sono personalizzabili
          per sito selezionato».
          **Perché un blocco per sito e non uno solo** (deciso dall'utente): lo
          stesso prodotto si racconta diversamente al B2B e al cliente finale —
          il vecchio gestionale teneva testi separati, e le sezioni stesse
          cambiano (su Business Deluxy la gastronomia chiude con «Occasioni»
          dove il D2C chiude con «Regala con Deluxy»). Un campo solo per tutti
          avrebbe costretto a scegliere quale sito serve peggio. */}
      <div className="scheda">
        <div className="scheda-titolo">Scheda sul sito · i tre punti e le sezioni</div>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          In cima alla scheda il cliente legge tre punti: <b>il primo è di questo prodotto</b> e si scrive qui; gli altri due sono del sito e si
          scrivono una volta sola in Negozi &amp; permessi. Sotto, le sezioni previste per la categoria — cambiano con la categoria e possono
          cambiare da un sito all&apos;altro.
        </p>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label htmlFor="plusProdotto">Plus del prodotto — il primo dei tre punti</label>
            <input
              id="plusProdotto"
              value={plusProdotto}
              maxLength={140}
              onChange={(e) => setPlusProdotto(e.target.value)}
              placeholder="Es. «Rose Ecuador a stelo lungo, aperte a mano la mattina della consegna»"
            />
            <span className="cella-sub">Una riga sola: è quello che distingue questo prodotto dagli altri dello stesso sito.</span>
          </div>
        </div>

        {!categoria ? (
          <div className="vuoto-mini">
            Scegli la categoria qui sopra: le sezioni da compilare cambiano con quella — i fiori hanno «Significato» e «Dimensioni», le torte
            «Ingredienti e allergeni» e «Conservazione».
          </div>
        ) : (
          nomiNegoziScelti.map((nomeSito) => {
            const suoi = sezioniDi(nomeSito);
            const plus = plusNegozio[nomeSito];
            const dueRighe = [plus?.uno, plus?.due].filter((x) => x && x.trim());
            const vuote = suoi.filter((s) => s.richiesta && !valoreSezione(nomeSito, s.nome).trim()).length;
            return (
              <div key={nomeSito} className="sezioni-sito">
                <div className="sezioni-sito-testata">
                  <b>{nomeSito}</b>
                  {vuote > 0 && <span className="cella-sub">{vuote === 1 ? "1 sezione consigliata ancora vuota" : `${vuote} sezioni consigliate ancora vuote`}</span>}
                </div>
                <p className="cella-sub" style={{ margin: "0 0 10px" }}>
                  {dueRighe.length > 0 ? (
                    <>Gli altri due punti su {nomeSito}: <b>{dueRighe.join(" · ")}</b></>
                  ) : (
                    <>Su {nomeSito} i due plus del sito non sono ancora scritti: si impostano in Negozi &amp; permessi, e valgono per tutti i suoi prodotti.</>
                  )}
                </p>
                {suoi.length === 0 ? (
                  <div className="vuoto-mini">
                    Per «{categorie.find((c) => c.chiave === categoria)?.nome ?? categoria}» su questo sito non sono previste sezioni.
                  </div>
                ) : (
                  <div className="modulo">
                    {suoi.map((s) => {
                      const aiuto = SEZIONE_AIUTO[s.tipo] ?? SEZIONE_AIUTO.testo;
                      const campoId = `sez-${nomeSito}-${s.nome}`.replace(/[^A-Za-z0-9_-]/g, "-");
                      return (
                        <div key={s.nome} className="campo-modulo largo">
                          <label htmlFor={campoId}>
                            {s.nome}
                            {s.richiesta && <span className="obbligatorio" title="Consigliata: senza, la scheda sul sito sembra incompleta"> *</span>}
                          </label>
                          <textarea
                            id={campoId}
                            rows={aiuto.righe}
                            value={valoreSezione(nomeSito, s.nome)}
                            onChange={(e) => cambiaSezione(nomeSito, s.nome, e.target.value)}
                            placeholder={aiuto.placeholder}
                          />
                          <span className="cella-sub">{aiuto.nota}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
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
          {negoziAnche.length > 0 && (
            <>
              {" "}Gli stessi valori vanno anche su {negoziAnche.map((n) => n.nome).join(", ")}, sui campi che quei negozi definiscono con la stessa chiave.
            </>
          )}
        </p>
        {definizioni.length === 0 ? (
          <div className="vuoto-mini">Nessuna definizione letta per questo negozio: arriva col prossimo import delle collezioni.</div>
        ) : (
          (() => {
            // Prima i campi che il negozio tiene **in evidenza** nell'admin
            // (quelli appuntati: occasioni, fiori, orario…), nell'ordine
            // dell'admin; gli altri — spesso campi di prova o di app — stanno
            // ripiegati, ma si aprono se ne hanno già un valore.
            // **Campi che dipendono da un altro campo** (08/09/2026, segnalato
            // dall'utente): «URL img dimensione» ha senso solo se «Guida misure»
            // è su «Si». Chiedere l'indirizzo di un'immagine che il negozio non
            // mostrerà è lavoro buttato, e un URL rimasto lì dopo aver spento la
            // guida è un dato che non corrisponde più a niente.
            const acceso = (chiave: string) => {
              const d = definizioni.find((x) => chiaveDef(x).endsWith("." + chiave) || chiaveDef(x) === chiave);
              const v = (d ? (metafield[chiaveDef(d)] ?? "") : "").trim();
              // Lo stesso campo arriva dai negozi in due forme — `SI` e `["SI"]`,
              // perché su un negozio la definizione è una lista: contate 177
              // schede con la guida misure, in entrambi i formati. Si accettano
              // tutte e due invece di far dipendere il modulo da come è stato
              // definito il campo su quel negozio.
              const testo = v.startsWith("[") ? v.replace(/[[\]"']/g, "") : v;
              return /^(s[iì]|true|1)$/i.test(testo.trim());
            };
            const dipendenze: Record<string, string> = { url_img_dimensione: "guida_misure" };
            const visibile = (d: DefinizioneMetafield) => {
              const chiave = chiaveDef(d).split(".").pop() ?? "";
              const da = dipendenze[chiave];
              return !da || acceso(da);
            };
            const inEvidenza = definizioni.filter((d) => d.posizione != null && visibile(d));
            const altri = definizioni.filter((d) => d.posizione == null && visibile(d));
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
            <input type="checkbox" checked={haVarianti} onChange={(e) => { const acceso = e.target.checked; const base = prezzoBaseDelForm(e.currentTarget); setHaVarianti(acceso); if (acceso) setVarianti((v) => (v.length === 1 && !v[0].nome.trim() && !v[0].prezzo.trim() ? [varianteVuota(base)] : v)); }} />
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
                        <input value={v.note} onChange={(e) => aggiornaVariante(i, "note", e.target.value)} placeholder="es. 20-25 fiori" aria-label={`Nota variante ${i + 1}`} />
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
            <button type="button" className="btn btn-secondario small" style={{ marginTop: 12 }} onClick={(e) => { const base = prezzoBaseDelForm(e.currentTarget); setVarianti((v) => [...v, varianteVuota(base)]); }}>
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
        <div className="scheda-titolo">Pubblicazione su {nomiNegoziScelti.join(" + ")}</div>
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
        <a className="btn btn-secondario" href={iniziale ? `/prodotti/${iniziale.id}` : "/prodotti"}>
          Annulla
        </a>
        <button type="submit" className="btn" disabled={!puoPubblicare || caricando || negozi.length === 0}>
          {modifica
            ? pubblico && !iniziale?.shopifyId
              ? `Salva e pubblica su ${nomiNegoziScelti.join(", ")}`
              : iniziale?.shopifyId
                ? negoziAnche.length ? `Salva qui e su ${nomiNegoziScelti.join(", ")}` : "Salva qui e sul negozio"
                : "Salva le modifiche"
            : pubblico
              ? `Crea e pubblica su ${nomiNegoziScelti.join(", ")}`
              : "Crea prodotto"}
        </button>
      </div>
      {!pubblico && (
        // ⭐ 07/09/2026: un prodotto salvato come Concept non va su Shopify e nessuno
        // se ne accorgeva (il «Panettone - Cioccolato Bianco e Frutti Rossi» è nato
        // così alle 12:45 e l'utente lo cercava sul negozio). Si dice prima di salvare.
        <p className="cella-sub" style={{ textAlign: "right", marginTop: 6 }}>
          Con la fase «{ETICHETTA_FASE[fase] ?? fase}» il prodotto resta solo qui: per mandarlo su {nomiNegoziScelti.join(", ")} scegli la fase <b>Pubblico</b>.
        </p>
      )}
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
