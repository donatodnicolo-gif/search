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

import { EditorScheda } from "./EditorScheda";
import { componiDescrizioneHtml } from "@/lib/descrizione-shopify";
import { MAX_DESCRIZIONE, MAX_TITOLO, seoDaRegole } from "@/lib/seo-regole";
import { useCallback, useEffect, useRef, useState } from "react";
import { ETICHETTA_FASE, ETICHETTA_TIPOLOGIA_VENDITA, SPIEGAZIONE_TIPOLOGIA_VENDITA, TIPOLOGIE_VENDITA } from "@/lib/dominio";
import { chiaveDef, etichettaDef, listaDa, type DefinizioneMetafield } from "@/lib/metafield-puro";

export type NegozioPerForm = { id: string; nome: string; dominio: string; puoScrivere: boolean; lingueAttive?: string[] };
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
  /** ⭐ 09/09/2026: il «Tipo di prodotto» di Shopify, più fine della categoria. */
  tipoShopify?: string;
  /** ⭐ 09/09/2026: la nostra bozza SEO (non quella già sul negozio). */
  seoTitolo?: string;
  seoDescrizione?: string;
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
  nomePartner?: string;
  nomePartnerAttivo?: boolean;
  /** ⭐ 08/09/2026: il plus del prodotto e le sezioni già compilate, per negozio. */
  plusProdotto?: string;
  sezioniScheda?: Record<string, Record<string, string>>;
  /** Le collezioni in cui il prodotto sta già (dall'import), automatiche comprese. */
  collezioni: { id: string; titolo: string; tipo: string; negozio?: string }[];
  shopifyId: string | null;
  /** ⭐ 07/09/2026: gli altri negozi (id) in cui il prodotto è o va pubblicato, oltre al principale. */
  altriNegoziId: string[];
  /** Dove sta già, negozio per negozio: per dirlo accanto alla scelta. */
  pubblicazioni: { negozio: string; shopifyId: string | null; handle?: string | null; statoShopify: string | null; statoVoluto?: string | null; errore: string | null; origine: string }[];
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

/** I nomi delle lingue, per chi legge. */
const ETICHETTA_LINGUA: Record<string, string> = { en: "inglese", fr: "francese", de: "tedesco", es: "spagnolo", ru: "russo", "zh-CN": "cinese", ar: "arabo", ja: "giapponese" };

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
  tipiShopify = [],
}: {
  negozi: NegozioPerForm[];
  categorie: CategoriaPerForm[];
  collezioni: CollezionePerForm[];
  definizioniPerNegozio: Record<string, DefinizioneMetafield[]>;
  tagEsistenti: string[];
  aiPronta: boolean;
  /** ⭐ 09/09/2026: i «Tipo di prodotto» in uso, con le categorie che li usano. */
  tipiShopify?: { tipo: string; categorie: string[] }[];
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
  // ⭐ 08/09/2026 (utente): «nessun negozio deve essere autoselezionato».
  // Partiva sul primo dell'elenco: chi non guardava quel campo pubblicava
  // su un negozio che non aveva scelto, e il negozio decide categorie,
  // collezioni, campi e dove vanno le foto. Ora è vuoto e obbligatorio.
  // ⭐ 09/09/2026 (utente): «questo non serve, si sceglie direttamente da
  // sotto». La tendina «Brand / negozio» chiedeva due volte la stessa cosa: il
  // negozio principale sopra e gli altri sotto, con la tendina che spariva
  // dall'elenco di sotto — due comandi per una decisione sola.
  //
  // Ora la scelta è UNA: l'elenco dei siti. **Il primo scelto è il principale**
  // — decide categorie, collezioni, campi e in quali Files vanno le foto — e
  // sta scritto sulla sua pastiglia, perché è una conseguenza, non un secondo
  // comando. L'ordine è quello in cui si clicca: si tiene una lista, non un
  // insieme, altrimenti «il primo» non vorrebbe dire niente.
  const [sitiScelti, setSitiScelti] = useState<string[]>(() => {
    const primo = iniziale?.negozioId ? [iniziale.negozioId] : [];
    return [...primo, ...(iniziale?.altriNegoziId ?? []).filter((x) => x !== iniziale?.negozioId)];
  });
  const negozioId = sitiScelti[0] ?? "";
  const negozio = negozi.find((n) => n.id === negozioId) ?? null;
  // ⭐⭐ 09/09/2026 (utente): «la foto è un elemento comune, quindi falle già
  // inserire prima». Prima il caricamento era spento finché non si sceglieva il
  // negozio, perché i file vivono nei **Files di un negozio** su Shopify. Ma le
  // foto sono comuni a tutti i siti (decisione dell'08/09) e chi compila le ha
  // in mano subito: farlo aspettare metteva una regola tecnica davanti al
  // lavoro. Quindi si sceglie da soli **dove ospitarle** — il sito principale
  // se c'è, altrimenti il primo negozio che sa scrivere — e si dice quale.
  // ⚠️ Ospitare non è pubblicare: alla pubblicazione le foto del negozio
  // principale si agganciano per id, quelle ospitate altrove per indirizzo.
  const negozioOspite = negozio ?? negozi.find((n) => n.puoScrivere) ?? null;
  // ⭐ 07/09/2026 (chiesto dall'utente): «pubblica anche su» — più negozi, per i
  // prodotti nuovi e per quelli esistenti. Il principale resta uno (categorie,
  // Files delle foto); gli altri ricevono la loro copia alla pubblicazione.
  const altriNegozi = sitiScelti.slice(1);
  const negoziAnche = negozi.filter((n) => altriNegozi.includes(n.id));
  const nomiNegoziScelti = [...(negozio ? [negozio.nome] : []), ...negoziAnche.map((n) => n.nome)];
  // ⭐ 08/09/2026 — **la scheda del sito che si sta compilando**.
  // ⚠️ Non si tiene in uno stato che può restare indietro: se cambio il
  // negozio principale o tolgo un sito, il nome memorizzato punterebbe a una
  // tab che non c'è più e il pannello resterebbe vuoto senza dire perché.
  // Qui lo stato è solo un'intenzione, e la verità è la lista dei siti scelti.
  const [sitoVoluto, setSitoAttivo] = useState<string | null>(null);
  const sitoAttivo = sitoVoluto && nomiNegoziScelti.includes(sitoVoluto) ? sitoVoluto : nomiNegoziScelti[0] ?? "";
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
  // ⭐ 08/09/2026 (utente): «l'AI deve essere in grado di riempire le varie
  // sezioni di ogni categoria». Una richiesta per sito, perché le sezioni
  // cambiano da un negozio all'altro; e **non sovrascrive** quello che una
  // persona ha già scritto: si compilano solo le caselle vuote.
  const [sezioniAi, setSezioniAi] = useState<string | null>(null);
  const [scrivendoSezioni, setScrivendoSezioni] = useState(false);
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
  // ⭐ 08/09/2026: il nome per i partner, con la sua spunta.
  const [nomePartnerAttivo, setNomePartnerAttivo] = useState(iniziale?.nomePartnerAttivo ?? false);
  const [nomePartner, setNomePartner] = useState(iniziale?.nomePartner ?? "");
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

  /** Sposta una variante di un posto. L'ordine si salva insieme al prodotto. */
  function spostaVariante(i: number, verso: -1 | 1) {
    setVarianti((v) => {
      const j = i + verso;
      if (j < 0 || j >= v.length) return v;
      const nuovo = v.slice();
      [nuovo[i], nuovo[j]] = [nuovo[j], nuovo[i]];
      return nuovo;
    });
  }

  // Lo SKU di una variante: quello già salvato, altrimenti principale + numero
  // progressivo dopo l'ultimo già assegnato.
  const skuVariante = (v: VarianteForm, i: number) => {
    if (v.sku) return v.sku;
    const usati = varianti.filter((x) => x.sku).length;
    const posizioneNuova = varianti.slice(0, i).filter((x) => !x.sku).length;
    return `${sku || "…"}-${usati + posizioneNuova + 1}`;
  };

  // ⭐ 08/09/2026 (utente): «categoria deve ordinata in modo alfabetico».
  // Arrivavano nell'ordine in cui stanno nel catalogo — cioè quello in cui sono
  // state create: con diciotto voci, trovarne una voleva dire scorrerle tutte.
  // `localeCompare` in italiano e non un confronto fra stringhe, altrimenti gli
  // accentati finiscono in fondo, dopo la Z.
  // ⭐ 09/09/2026 (utente): «tipo di prodotto va fatto listato e ordinato per
  // nome, la scelta della categoria poi filtra la lista».
  //
  // ⚠️ **Il valore che il prodotto ha già sta SEMPRE nell'elenco**, anche se la
  // sua categoria non lo prevede. Senza questa riga, aprire un prodotto il cui
  // tipo non è fra quelli della categoria e premere Salva ne cambierebbe il
  // tipo **senza che nessuno l'abbia chiesto** — un campo che si azzera da solo
  // perché il filtro non lo contempla è peggio del campo assente.
  const [tipoShopify, setTipoShopify] = useState(iniziale?.tipoShopify ?? "");
  // ⭐ 09/09/2026 (utente): «porta la SEO ad essere autocompilata con delle
  // regole anche in sede di creazione», «fai vedere la SEO anche nel form di
  // creazione e modifica». Prima stava solo nella scheda di dettaglio, cioè
  // dopo — quando il prodotto era già nato e nessuno tornava indietro a
  // scriverla: **561 prodotti su 5.069 hanno un titolo SEO**, gli altri no.
  const [seoTitolo, setSeoTitolo] = useState(iniziale?.seoTitolo ?? "");
  const [seoDescrizione, setSeoDescrizione] = useState(iniziale?.seoDescrizione ?? "");
  const [seoToccata, setSeoToccata] = useState(!!(iniziale?.seoTitolo || iniziale?.seoDescrizione));

  /**
   * ⭐ 09/09/2026 (utente): «metti salvataggio automatico del prodotto in fase
   * di creazione e indica che è una bozza». Chiudere la pagina a metà voleva
   * dire ricominciare da capo.
   *
   * ⚠️ **Solo alla creazione.** In modifica il prodotto esiste già e ha il suo
   * salvataggio, con i controlli su SKU, negozi e stati: un salvataggio
   * automatico che gli scrive sopra ogni due secondi sarebbe un modo per
   * cambiare un prodotto vivo senza premere niente.
   */
  const [bozzaId, setBozzaId] = useState<string | null>(null);
  const [bozzaSalvata, setBozzaSalvata] = useState<Date | null>(null);
  // ⚠️⚠️ 10/09/2026 — **la duplicazione è esclusa, e non è una dimenticanza.**
  //
  // L'utente ha segnalato «duplicando, le varianti sono al contrario» e «finisce
  // tutto il testo delle sezioni nella descrizione». Guardando il prodotto vero
  // «(Duplica) I'm Back Cake»: 0 varianti, nessun prezzo, nessuna foto — ma
  // descrizione, categoria e sezioni sì. È esattamente l'insieme di campi che
  // scrive il salvataggio automatico: **non era un duplicato, era una bozza**.
  //
  // Perché non basta farle completare la bozza come fa «Nuovo prodotto»: la
  // duplicazione deve generare SKU NUOVI a partire dal codice nuovo, mentre il
  // percorso di aggiornamento riuserebbe quelli dell'originale — e andrebbero
  // in collisione, perché l'originale ce li ha ancora. Due percorsi diversi per
  // un motivo vero: qui l'autosalvataggio si spegne.
  const inCreazione = !iniziale;

  /**
   * ⭐ 09/09/2026 (utente): «le regole Google per la SEO si generano in
   * automatico». Prima bisognava premere un pulsante: chi non lo notava
   * salvava un prodotto senza SEO, ed è il motivo per cui oggi **solo 561
   * prodotti su 5.069** ne hanno una.
   *
   * ⚠️ Si riscrive **solo finché nessuno l'ha toccata a mano**: al primo
   * carattere scritto da una persona la regola smette di intervenire. Un campo
   * che si riscrive sotto le dita mentre lo stai correggendo è peggio di un
   * campo vuoto.
   */
  const rigeneraSeo = useCallback(() => {
    if (seoToccata) return;
    const nome = (form.current?.elements.namedItem("nome") as HTMLInputElement | null)?.value ?? "";
    if (!nome.trim()) return;
    const nomiSezioni = [...new Set(Object.values(sezioniValori).flatMap((v) => Object.keys(v ?? {})))];
    const r = seoDaRegole({ nome, descrizione, plusProdotto, sezioni: nomiSezioni });
    setSeoTitolo(r.titolo);
    setSeoDescrizione(r.descrizione);
  }, [seoToccata, descrizione, plusProdotto, sezioniValori]);

  // Il testo e il plus sono stati: qui la rigenerazione parte da sola. Il nome
  // invece è un campo non controllato, e si aggancia all'uscita dal campo
  // (`onBlur` sul modulo, che risale dagli input dentro).
  useEffect(() => { rigeneraSeo(); }, [rigeneraSeo]);

  /**
   * Salva la bozza, al massimo una volta ogni due secondi di quiete.
   *
   * ⚠️ La pausa non è cortesia: senza, si scriverebbe sul database a ogni
   * tasto premuto — e il Postgres è condiviso con altre tredici app.
   */
  useEffect(() => {
    if (!inCreazione) return;
    const attesa = setTimeout(async () => {
      const nome = (form.current?.elements.namedItem("nome") as HTMLInputElement | null)?.value ?? "";
      if (nome.trim().length < 3) return;
      try {
        const r = await fetch("/api/prodotti/bozza", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: bozzaId,
            nome,
            categoria,
            descrizione,
            plusProdotto,
            brief: (form.current?.elements.namedItem("brief") as HTMLTextAreaElement | null)?.value ?? "",
            sezioniScheda: sezioniValori,
          }),
        });
        const d = await r.json();
        if (d?.ok && d.id) { setBozzaId(d.id); setBozzaSalvata(new Date()); }
      } catch {
        // Una bozza non salvata non è un errore da mostrare: si riprova al
        // prossimo cambiamento, e il salvataggio vero resta quello col pulsante.
      }
    }, 2000);
    return () => clearTimeout(attesa);
  }, [inCreazione, bozzaId, categoria, descrizione, plusProdotto, sezioniValori]);
  const perNome = (a: string, b: string) => a.localeCompare(b, "it");
  const tipiDellaCategoria = [
    ...new Set([
      ...tipiShopify.filter((t) => !categoria || t.categorie.includes(categoria)).map((t) => t.tipo),
      ...(tipoShopify ? [tipoShopify] : []),
    ]),
  ].sort(perNome);
  const tipiAltri = tipiShopify
    .map((t) => t.tipo)
    .filter((t) => !tipiDellaCategoria.includes(t))
    .sort(perNome);

  const categorieVisibili = categorie
    .filter((c) => !c.negozio || c.negozio === negozio?.nome)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "it", { sensitivity: "base" }));
  // Le foto sono del PRODOTTO, non del negozio che le ospita: si mostrano e si
  // salvano tutte. Prima si filtravano per negozio e cambiando sito sparivano
  // dalla galleria — sembravano perse, ed erano solo nascoste.
  const mediaDiQuestoNegozio = media;

  /**
   * Accende o spegne un sito. **Se cambia il primo**, cambia il negozio
   * principale: e allora le collezioni scelte non valgono più (sono di un altro
   * negozio) e la categoria può non esistere là. Si azzerano qui, come faceva
   * la vecchia tendina: lasciarle vorrebbe dire salvare riferimenti a roba di
   * un negozio diverso.
   */
  function scegliSito(id: string) {
    setSitiScelti((prima) => {
      const dopo = prima.includes(id) ? prima.filter((x) => x !== id) : [...prima, id];
      if ((dopo[0] ?? "") !== (prima[0] ?? "")) {
        setCollezioniScelte([]);
        const nuovo = negozi.find((n) => n.id === dopo[0]);
        if (categoria && !categorie.some((c) => c.chiave === categoria && (!c.negozio || c.negozio === nuovo?.nome))) setCategoria("");
      }
      return dopo;
    });
  }

  /**
   * **Una richiesta per sito, ma quello che è già stato scritto non si richiede.**
   *
   * L'utente (09/09/2026): «compila già per tutti i siti, alcune cose saranno
   * comuni: esempio ingredienti e allergeni». Gli ingredienti di un prodotto
   * sono gli stessi ovunque lo si venda: richiederli sito per sito non è solo
   * uno spreco, è un **rischio** — due risposte diverse sugli allergeni dello
   * stesso prodotto sono due verità, e a leggerle è chi è allergico. Quindi una
   * sezione già scritta per un sito si **ricopia** sugli altri che hanno una
   * sezione con lo stesso nome, e all'AI si chiede solo il resto.
   *
   * Resta una richiesta per sito perché le sezioni cambiano da un negozio
   * all'altro (Cake unisce «Ingredienti e Allergeni», Business li separa) e il
   * tono di un sito B2B non è quello di un sito al pubblico.
   */
  async function compilaSezioniTuttiISiti() {
    if (!categoria) return;
    const siti = nomiNegoziScelti;
    if (!siti.length) return;
    setScrivendoSezioni(true);
    setSezioniAi(null);
    const scritteAltrove = new Map<string, string>();
    const resoconto: string[] = [];
    try {
      for (const sito of siti) {
        const esito = await compilaUnSito(sito, scritteAltrove);
        if (esito) resoconto.push(esito);
      }
      setSezioniAi(resoconto.length ? resoconto.join(" · ") : "Nessuna sezione da compilare: scegli prima la categoria e i siti.");
    } finally {
      setScrivendoSezioni(false);
    }
  }

  /** Un sito solo. `scritteAltrove` porta avanti quello che si è già scritto. */
  async function compilaUnSito(sito: string, scritteAltrove: Map<string, string>): Promise<string | null> {
    const daFare = sezioniDi(sito);
    if (!daFare.length) return null;
    const chiave = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

    // Prima si ricopia: quello che vale per un sito vale per l'altro.
    let copiate = 0;
    for (const x of daFare) {
      const gia = scritteAltrove.get(chiave(x.nome));
      if (gia && !valoreSezione(sito, x.nome).trim()) {
        cambiaSezione(sito, x.nome, gia);
        copiate++;
      }
    }
    const daChiedere = daFare.filter((x) => !scritteAltrove.has(chiave(x.nome)) && !valoreSezione(sito, x.nome).trim());
    if (!daChiedere.length) {
      return copiate ? `${sito}: ${copiate} sezioni riprese da quelle già scritte.` : null;
    }
    try {
      const leggi = (nome: string) => (form.current?.elements.namedItem(nome) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";
      const res = await fetch("/api/ai/sezioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: leggi("nome"),
          categoria,
          sito,
          materiali: leggi("materiali"),
          note: leggi("note"),
          prezzo: leggi("prezzoVendita"),
          descrizione,
          varianti: haVarianti ? varianti.map((v) => v.nome).filter(Boolean) : [],
          sezioni: daChiedere.map((x) => ({ nome: x.nome, tipo: x.tipo })),
          gia: Object.fromEntries(daFare.map((x) => [x.nome, valoreSezione(sito, x.nome)])),
        }),
      });
      const dati = await res.json();
      if (!dati.ok) return `${sito}: ${dati.errore ?? "la compilazione non è riuscita"}.`;
      const scritte = Object.entries(dati.sezioni as Record<string, string>);
      for (const [nome, testo] of scritte) {
        cambiaSezione(sito, nome, testo);
        // Da qui in poi vale anche per gli altri siti che hanno la stessa sezione.
        scritteAltrove.set(chiave(nome), testo);
      }
      const saltate = (dati.saltate as string[]) ?? [];
      const pezzi = [
        scritte.length ? `${scritte.length} scritte` : null,
        copiate ? `${copiate} riprese dagli altri siti` : null,
      ].filter(Boolean);
      return pezzi.length
        ? `${sito}: ${pezzi.join(", ")}.${saltate.length ? ` Vuote: ${saltate.join(", ")} — non c'erano dati per scriverle senza inventare.` : ""}`
        : `${sito}: niente da scrivere senza inventare (mancano materiali o note di specifica).`;
    } catch {
      return `${sito}: non sono riuscito a raggiungere il servizio.`;
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
        body: JSON.stringify({ nome: leggi("nome"), categoria, tipo: "", materiali: leggi("materiali"), prezzo: leggi("prezzoVendita"), varianti: haVarianti ? varianti.map((v) => v.nome).filter(Boolean) : [], tono }),
      });
      const dati = await res.json();
      if (!dati.ok) {
        setErroreAi(dati.errore ?? "La generazione non è riuscita.");
        return;
      }
      // ⭐ 09/09/2026 (utente): «nel descrivi con AI non fare i 3 punti».
      // I tre punti hanno già il loro posto — il plus del prodotto più i due
      // del sito — e finivano anche qui come righe col puntino: sulla scheda
      // online uscivano due volte, una come elenco in cima e una dentro il
      // testo. Il modello continua a proporli, noi non li usiamo più.
      setDescrizione([dati.claim, "", dati.descrizione].filter(Boolean).join("\n").trim());
    } catch {
      setErroreAi("Non sono riuscito a contattare il servizio di scrittura.");
    } finally {
      setScrivendo(false);
    }
  }

  async function caricaFile(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    if (!negozioOspite) {
      setErroreMedia("Nessun negozio sa scrivere su Shopify: senza, le foto non hanno dove stare.");
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
        body: JSON.stringify({ negozioId: negozioOspite.id, file: file.map((f) => ({ nome: f.name, mime: f.type, byte: f.size })) }),
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
          fd.append("negozioId", negozioOspite.id);
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
          body: JSON.stringify({ negozioId: negozioOspite.id, file: daRegistrare }),
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

  /**
   * ⚠️⚠️ 09/09/2026 — **qui il file caricato veniva buttato via in silenzio.**
   * L'utente: «la foto la fa vedere solo dopo aver selezionato il sito».
   * Il caricamento era già stato staccato dalla scelta del sito (si usa il
   * negozio che OSPITA), ma questa funzione no: apriva con `if (!negozio)
   * return`, quindi il file arrivava su Shopify e poi spariva dall'elenco.
   * Nessun errore, nessun avviso: sembrava che non fosse successo niente.
   * Mezza correzione è peggio di nessuna, perché sposta il sintomo.
   */
  function aggiungiMedia(lista: Omit<MediaCaricato, "negozio">[]) {
    const dove = negozioOspite?.nome;
    if (!dove) {
      setErroreMedia("Il file è stato caricato ma non so in quali Files sta: ricarica la pagina e riprova.");
      return;
    }
    setMedia((m) => [...m, ...lista.map((x) => ({ ...x, negozio: dove }))]);
  }

  const puoPubblicare = !pubblico || ((negozio?.puoScrivere ?? false) && negoziAnche.every((n) => n.puoScrivere));

  return (
    <form action={azione} ref={form} onBlur={() => rigeneraSeo()}>
      {/* L'id della bozza: il salvataggio la COMPLETA invece di creare un
          secondo prodotto con lo stesso nome. */}
      {bozzaId && <input type="hidden" name="bozzaId" value={bozzaId} />}
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

      {/* ════════ 1. COMUNE A TUTTI I NEGOZI ════════
          Struttura chiesta dall'utente (08/09/2026): «informazioni comuni a
          tutti gli store (nome, nome diverso, sku, categoria, fase, plus del
          prodotto, categoria interna); la scelta del brand poi apre dei tab col
          nome del sito che contengono tutte le info che possono cambiare per
          brand».
          Il criterio non è l'anagrafica del dato, è **dove può cambiare**: se
          un campo vale uguale ovunque sta qui una volta sola; se può essere
          diverso da un sito all'altro sta nella scheda del suo sito. Prima
          erano mescolati in una card da undici campi e non si capiva quale
          fosse quale. */}
      <div className="scheda">
        <div className="scheda-titolo">Comune a tutti i negozi</div>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          Quello che il prodotto è, ovunque venga venduto. Più sotto, nella scheda di ogni sito, c&apos;è quello che può cambiare da un negozio all&apos;altro.
        </p>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label htmlFor="nome">
              Nome <span className="obbligatorio">*</span>
            </label>
            <input id="nome" name="nome" required placeholder="Es. Bouquet Ora Blu" defaultValue={iniziale?.nome ?? ""} />
            {/* ⭐ 08/09/2026 (utente): «un nome visibile ai partner da flaggare
                nel caso il nome al pubblico sia diverso». Il nome commerciale
                racconta, quello di lavorazione dice cosa va nella scatola: il
                fioraio che riceve «Bouquet Ora Blu» deve poter leggere «rose
                blu, 12 steli». Spunta esplicita e non «campo pieno = attivo»:
                un valore rimasto lì da prima non è una decisione. */}
            <label className="pill-opt" style={{ cursor: "pointer", width: "fit-content", marginTop: 6 }}>
              <input type="checkbox" name="nomePartnerAttivo" value="1" checked={nomePartnerAttivo} onChange={(e) => setNomePartnerAttivo(e.target.checked)} />
              <span>Per i partner si chiama diversamente</span>
            </label>
            {nomePartnerAttivo && (
              <input
                name="nomePartner"
                value={nomePartner}
                onChange={(e) => setNomePartner(e.target.value)}
                maxLength={200}
                placeholder="Il nome che legge chi lo prepara — es. «Bouquet rose blu, 12 steli»"
                aria-label="Nome visibile ai partner"
              />
            )}
            {nomePartnerAttivo && !nomePartner.trim() && (
              <span className="cella-sub">Finché resta vuoto, al partner arriva il nome pubblico.</span>
            )}
          </div>
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
          {/* ⭐ 09/09/2026 (utente): «per i nuovi prodotti non appare su Shopify
              "Tipo di prodotto"». Non si deduce dalla categoria: misurato sulle
              schede vive, la nostra REGALI là diventa «Cosmetici», «Gioielli»,
              «Gift Card», «Box Regalo». L'elenco propone i tipi già in uso sui
              negozi, ma il campo resta libero. */}
          <div className="campo-modulo">
            <label htmlFor="tipoShopify">Tipo di prodotto (Shopify)</label>
            <select id="tipoShopify" name="tipoShopify" value={tipoShopify} onChange={(e) => setTipoShopify(e.target.value)}>
              <option value="">— Nessuno —</option>
              {tipiDellaCategoria.length > 0 && (
                <optgroup label={categoria ? `Usati in ${categorie.find((c) => c.chiave === categoria)?.nome ?? categoria}` : "In uso sui negozi"}>
                  {tipiDellaCategoria.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </optgroup>
              )}
              {/* ⚠️ Gli altri restano raggiungibili, in fondo. Il filtro serve a
                  mettere davanti i tipi giusti, non a rendere impossibile una
                  combinazione nuova: «Palloncini» sta sotto due categorie, e un
                  prodotto che ne inaugura una terza non deve trovare la strada
                  chiusa. */}
              {tipiAltri.length > 0 && (
                <optgroup label={categoria ? "Altri tipi in uso" : "Tutti"}>
                  {tipiAltri.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="cella-sub">
              È il «Tipo di prodotto» dell&apos;admin del negozio: più fine della categoria — qui ci va «Cake Design», non «Torte e Dolci».
              {categoria
                ? ` L'elenco mostra per primi i ${tipiDellaCategoria.length} già usati in questa categoria.`
                : " Scegliendo la categoria, l'elenco si accorcia a quelli che le appartengono."}
            </span>
          </div>
          <div className="campo-modulo">
            <label htmlFor="fase">{modifica ? "Fase" : "Fase iniziale"}</label>
            <select id="fase" name="fase" value={fase} onChange={(e) => setFase(e.target.value)}>
              {FASI_SCELTA.map((f) => (
                <option key={f} value={f}>
                  {ETICHETTA_FASE[f]}
                  {/* ⭐ 09/09/2026: anche «approvato» crea la scheda sul
                      negozio, ma in bozza — il cliente non la vede. */}
                  {f === "in_vendita" ? " — va su Shopify, visibile" : f === "approvato" ? " — va su Shopify, in bozza" : ""}
                </option>
              ))}
            </select>
            {modifica && iniziale?.shopifyId && fase !== "in_vendita" && (
              <span className="cella-sub">Togliendo «Pubblico» il prodotto torna bozza sul negozio: il cliente non lo vede più.</span>
            )}
          </div>
          {/* ⭐ 08/09/2026 (utente): «mostra solo se il prodotto è in fase di
              concept e concept è selezionato, e mostra sopra appena dopo fase
              iniziale». È la scheda del lavoro creativo: brief, materiali,
              palette servono mentre il prodotto si sta pensando, non quando è
              già in vendita — e sotto, dopo prezzi e varianti, non le vedeva
              nessuno proprio nel momento in cui servono. */}
          {/* ⭐ 09/09/2026 (utente): «non appare piu sul modulo la parte di brief
              per dare indicazioni generali all'AI». Non era sparito: stava
              dentro la condizione «concept» qui sopra, e su un prodotto gia in
              vendita non si vedeva. Ma il brief non serve solo mentre il
              prodotto si pensa — e' anche **quello che l'AI legge** per
              scrivere descrizione e sezioni, e serve proprio quando il prodotto
              e' vivo. Quindi esce dalla condizione; materiali e palette, che
              sono lavoro creativo puro, restano dentro. */}
          <div className="campo-modulo largo">
            <label htmlFor="brief">Brief · indicazioni per l&apos;AI</label>
            <textarea id="brief" name="brief" rows={2} placeholder="Il concept del prodotto, e cosa deve sapere l'AI quando scrive" defaultValue={iniziale?.brief ?? ""} />
            <span className="cella-sub">Lo legge l&apos;AI quando compila descrizione e sezioni.</span>
          </div>
          {fase === "concept" && (
            <>
              <div className="campo-modulo">
                <label htmlFor="materiali">Materiali / fiori</label>
                <input id="materiali" name="materiali" placeholder="Anemoni, ranuncoli, foglia oro" defaultValue={iniziale?.materiali ?? ""} />
              </div>
              <div className="campo-modulo">
                <label htmlFor="palette">Palette</label>
                <input id="palette" name="palette" placeholder="Indaco · avorio · oro" defaultValue={iniziale?.palette ?? ""} />
              </div>
            </>
          )}
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
          <div className="campo-modulo largo">
            <label htmlFor="note">Note di specifica</label>
            <textarea id="note" name="note" rows={2} defaultValue={iniziale?.note ?? ""}
                      placeholder="Che cosa c'è dentro: «20-25 fiori», «18-20 cm, 650 g - 1 kg», «6/8 porzioni»" />
            <span className="cella-sub">
              La legge il fioraio quando riceve l&apos;ordine: è quello che gli dice quanti fiori mettere.
              Se una taglia ha la sua misura, scrivila sulla variante.
            </span>
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
          {/* ⭐ 09/09/2026 (utente): «fai vedere la SEO anche nel form di
              creazione e modifica prodotto», e «autocompilata con delle
              regole». Sta qui, subito sotto la descrizione, perché è di lì che
              nasce: è la stessa cosa detta a Google in 60 e 160 caratteri.
              ⚠️ È una BOZZA: si scrive nei campi nostri, non su Shopify. Il
              testo che i clienti leggono nei risultati cambia solo quando
              qualcuno lo manda al negozio, dalla scheda del prodotto. */}
          <div className="campo-modulo largo">
            <label htmlFor="seoTitolo">Come si vede su Google</label>
            <div className="riga-ai" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="btn btn-secondario small"
                onClick={() => {
                  const nome = (form.current?.elements.namedItem("nome") as HTMLInputElement | null)?.value ?? "";
                  // I nomi delle sezioni che il prodotto ha davvero: servono
                  // a non farsi scappare un titolo di sezione dentro la
                  // descrizione che finisce su Google.
                  const nomiSezioni = [...new Set(Object.values(sezioniValori).flatMap((v) => Object.keys(v ?? {})))];
                  const r = seoDaRegole({ nome, descrizione, plusProdotto, sezioni: nomiSezioni });
                  setSeoTitolo(r.titolo);
                  setSeoDescrizione(r.descrizione);
                  setSeoToccata(true);
                }}
              >
                ✎ Riscrivila dalle regole
              </button>
              <span className="cella-sub">
                {seoToccata
                  ? "L'hai scritta tu: da qui in poi la regola non la tocca più. Il pulsante la riscrive da capo."
                  : "Si scrive da sola mentre compili: titolo «nome | DELUXY» e le prime frasi della descrizione, dentro i limiti che Google mostra. Appena la correggi a mano, smette."}
              </span>
            </div>
            <input
              id="seoTitolo"
              name="seoTitolo"
              value={seoTitolo}
              onChange={(e) => { setSeoTitolo(e.target.value); setSeoToccata(true); }}
              placeholder="Il titolo nei risultati di ricerca"
            />
            <span className={`cella-sub${seoTitolo.length > MAX_TITOLO ? " fuori-limite" : ""}`}>
              {seoTitolo.length}/{MAX_TITOLO} caratteri{seoTitolo.length > MAX_TITOLO ? " — oltre questo Google taglia" : ""}
            </span>
            <textarea
              id="seoDescrizione"
              name="seoDescrizione"
              rows={2}
              value={seoDescrizione}
              onChange={(e) => { setSeoDescrizione(e.target.value); setSeoToccata(true); }}
              placeholder="Le due righe sotto il titolo, nei risultati"
              style={{ marginTop: 8 }}
            />
            <span className={`cella-sub${seoDescrizione.length > MAX_DESCRIZIONE ? " fuori-limite" : ""}`}>
              {seoDescrizione.length}/{MAX_DESCRIZIONE} caratteri{seoDescrizione.length > MAX_DESCRIZIONE ? " — oltre questo Google taglia" : ""}
            </span>
            {!seoToccata && (
              <span className="cella-sub">
                Lasciandola vuota, al salvataggio si scrive da sola con le regole qui sopra.
              </span>
            )}
          </div>

          <div className="campo-modulo largo">
            {/* ⭐ 08/09/2026 (utente): «le foto sono nei campi comuni».
                Una sola serie di foto per il prodotto: alla pubblicazione
                si copiano sugli altri negozi. Stavano in una card a parte
                dopo le schede dei siti, e sembravano di un sito solo. */}
            <label>Foto e video</label>
      {/* ---------- Foto e video ---------- */}
        <p className="page-sub" style={{ marginBottom: 12 }}>
          Le foto sono <b>del prodotto</b> e valgono su tutti i siti. Si possono caricare subito, anche prima di
          decidere dove va: vengono ospitate nei Files di{" "}
          <b>{negozioOspite?.nome ?? "un negozio"}</b> su Shopify e alla pubblicazione arrivano su ogni sito scelto.
          La prima immagine è quella principale.
        </p>
        <label
          className={`btn btn-secondario${caricando || !negozioOspite ? " disabilitato" : ""}`}
          aria-disabled={caricando || !negozioOspite}
          style={{ cursor: caricando ? "wait" : "pointer" }}
        >
          {caricando ? "Caricamento in corso…" : "Scegli foto o video"}
          {/* ⭐ 09/09/2026 (utente): «il click su seleziona immagine o video è
              molto lento». `accept="image/*,video/*"` chiede a Windows di
              espandere DUE famiglie MIME intere, e la finestra di scelta file
              le risolve interrogando i codec registrati prima di aprirsi. Un
              elenco esplicito non ha niente da espandere.
              ⚠️ Detto onesto: questa non è una misura. La lentezza sta nella
              finestra del sistema operativo, fuori dalla pagina, e da qui non
              la posso cronometrare. */}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif,.heic,.avif,.mp4,.mov,.m4v,.webm"
            multiple
            hidden
            disabled={caricando || !negozioOspite}
            onChange={(e) => { void caricaFile(e.target.files); e.target.value = ""; }}
          />
        </label>
        {!negozioOspite && (
          <span className="cella-sub" style={{ display: "block", marginTop: 8 }}>
            Nessuno dei negozi collegati ha il permesso di scrivere: senza, le foto non hanno dove stare.
          </span>
        )}
        {erroreMedia && <div className="avviso-errore" style={{ marginTop: 10 }}>{erroreMedia}</div>}
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
          </div>
        </div>
      </div>

      {/* ════════ 2. DOVE VA — è la scelta che apre le schede dei siti ════════ */}
      <div className="scheda">
        <div className="scheda-titolo">Dove va</div>
        <div className="modulo">
          {negozi.length > 0 && (
            <div className="campo-modulo largo">
              <label>
                Su quali siti <span className="obbligatorio">*</span>
                {sitiScelti.length > 1 ? ` · ${sitiScelti.length} siti` : ""}
              </label>
              <div className="pill-scelta">
                {negozi
                  .map((n) => {
                    const acceso = sitiScelti.includes(n.id);
                    const principale = n.id === negozioId;
                    const st = statoSu(n.nome);
                    const dove =
                      st?.shopifyId && st.origine !== "tolto"
                        ? st.statoShopify === "ACTIVE" ? " · già attivo là" : st.statoShopify === "DRAFT" ? " · là in bozza" : st.statoShopify === "ARCHIVED" ? " · là archiviato" : ""
                        : st?.errore ? " · rifiutato l'ultima volta" : "";
                    return (
                      <label
                        key={n.id}
                        className={`pill-opt chip-scelta${acceso ? " selezionato" : ""}`}
                        title={!n.puoScrivere ? `${n.nome} non ha il permesso write_products` : principale ? "Sito principale: decide categorie, collezioni, campi e dove vanno le foto" : n.dominio}
                        style={n.puoScrivere ? undefined : { opacity: 0.5 }}
                      >
                        {/* ⚠️ Il primo sito scelto non si toglie se il prodotto è
                            già su quel negozio: là non si sposta. */}
                        <input
                          type="checkbox"
                          checked={acceso}
                          disabled={!n.puoScrivere || (principale && !!iniziale?.shopifyId)}
                          onChange={() => scegliSito(n.id)}
                          hidden
                        />
                        {acceso ? "✓ " : "+ "}
                        {n.nome}
                        {principale ? " · principale" : ""}
                        {dove}
                        {!n.puoScrivere ? " · solo lettura" : ""}
                      </label>
                    );
                  })}
              </div>
              <span className="cella-sub">
                Il <b>primo</b> che scegli è il principale: decide categorie, collezioni, campi e in quali Files vanno le foto. Con la fase{" "}
                <b>Pubblico</b> il prodotto nasce su tutti, con gli stessi SKU, prezzi e varianti, e le foto si copiano. Togliendo un sito dove è già
                pubblicato, là torna bozza (non si cancella).
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ⭐ 09/09/2026 (utente): «compila con l'AI portalo più su, e compila già
          per tutti i siti — alcune cose saranno comuni, esempio ingredienti e
          allergeni». Prima il pulsante stava DENTRO la scheda di un sito: per
          quattro siti si premeva quattro volte, e non c'era modo di accorgersi
          che gli allergeni erano usciti diversi da una scheda all'altra. Ora è
          uno solo, sopra le tab — nel punto in cui si è appena deciso dove va
          il prodotto — e quello che scrive per un sito lo ricopia sugli altri
          che hanno una sezione con lo stesso nome. */}
      {nomiNegoziScelti.length > 0 && categoria && (
        <div className="scheda">
          <div className="scheda-titolo">Le sezioni della scheda</div>
          <div className="riga-ai">
            <button
              type="button"
              className="btn btn-secondario"
              onClick={() => void compilaSezioniTuttiISiti()}
              disabled={scrivendoSezioni || !aiPronta}
              title={aiPronta ? "Compila le sezioni vuote di tutti i siti scelti" : "Manca la chiave OpenAI"}
            >
              {scrivendoSezioni ? "Sto compilando…" : `✦ Compila le sezioni con l'AI · ${nomiNegoziScelti.length} ${nomiNegoziScelti.length === 1 ? "sito" : "siti"}`}
            </button>
            <span className="cella-sub">
              Riempie solo le caselle vuote, sito per sito. Quello che vale per tutti — ingredienti, allergeni, misure —
              si scrive una volta e si ricopia: due risposte diverse sugli allergeni dello stesso prodotto sarebbero due verità.
              Li scrive solo se glieli hai dati.
            </span>
          </div>
          {sezioniAi && (
            <div className="nota-info" style={{ marginTop: 10 }}>
              <span className="nota-icona">◆</span>
              <span>{sezioniAi}</span>
            </div>
          )}
        </div>
      )}

      {/* ════════ 3. UNA SCHEDA PER OGNI SITO ════════
          Tab a selezione singola, una per negozio scelto. **Non tutte impilate
          e non un accordion**: sono gli stessi campi ripetuti con contenuto
          diverso, cioè alternative parallele. Con l'accordion due siti possono
          restare aperti insieme e le due caselle omonime finiscono adiacenti —
          è così che il testo del B2B si scrive nel campo del D2C. La tab lo
          rende impossibile.
          Sul telefono la fila si dispone **in verticale** (richiesta
          dell'utente). Con un sito solo le tab non compaiono: sarebbe una
          scelta fra una cosa sola. */}
      <div className="scheda">
        <div className="scheda-titolo">
          {nomiNegoziScelti.length > 1 ? `Su ogni sito · ${nomiNegoziScelti.length}` : `Su ${nomiNegoziScelti[0] ?? "questo sito"}`}
        </div>
        {nomiNegoziScelti.length > 1 && (
          <div className="tab-siti" role="tablist" aria-label="Il sito di cui stai compilando la scheda">
            {nomiNegoziScelti.map((nomeSito) => {
              const mancano = categoria ? sezioniDi(nomeSito).filter((s) => s.richiesta && !valoreSezione(nomeSito, s.nome).trim()).length : 0;
              return (
                <button
                  key={nomeSito}
                  type="button"
                  role="tab"
                  aria-selected={nomeSito === sitoAttivo}
                  className={`tab-sito${nomeSito === sitoAttivo ? " attiva" : ""}`}
                  onClick={() => setSitoAttivo(nomeSito)}
                >
                  {nomeSito}
                  {mancano > 0 && <span className="tab-sito-conto" title={`${mancano} sezioni consigliate ancora vuote`}>{mancano}</span>}
                </button>
              );
            })}
          </div>
        )}

        {(() => {
          const nomeSito = sitoAttivo;
          const plus = plusNegozio[nomeSito];
          const suoi = categoria ? sezioniDi(nomeSito) : [];
          const st = statoSu(nomeSito);
          const ora = st?.statoShopify ?? null;
          const scelto = statiVoluti[nomeSito] ?? "";
          const sue = collezioni.filter((c) => c.negozio === nomeSito);
          const scelteQui = collezioniScelte.filter((id) => sue.some((c) => c.id === id) || (iniziale?.collezioni ?? []).some((c) => c.id === id && c.negozio === nomeSito));
          const autoQui = collezioniAutomatiche.filter((c) => c.negozio === nomeSito);
          const defSito = definizioniPerNegozio[nomeSito] ?? [];
          return (
            <div className="pannello-sito" role="tabpanel" aria-label={nomeSito}>
              <div className="cella-sub" style={{ marginBottom: 4 }}>In cima alla scheda su <b>{nomeSito}</b></div>
              <ul className="tre-punti">
                <li className={plusProdotto.trim() ? undefined : "vuoto"}>
                  {plusProdotto.trim() || "Il plus di questo prodotto — si scrive qui sopra, fra le informazioni comuni"}
                </li>
                <li className={plus?.uno?.trim() ? undefined : "vuoto"}>
                  {plus?.uno?.trim() || `Secondo punto di ${nomeSito} — da scrivere in Negozi e permessi`}
                </li>
                <li className={plus?.due?.trim() ? undefined : "vuoto"}>
                  {plus?.due?.trim() || `Terzo punto di ${nomeSito} — da scrivere in Negozi e permessi`}
                </li>
              </ul>

              {/* ⭐ 09/09/2026 (utente): «per sito crea una scheda come questo
                  invece dell'anteprima con tab di ora». Al posto della sola
                  anteprima, la scheda si scrive **come si vede**: l'HTML che
                  andrà sul negozio, con grassetto, elenchi e titoli di sezione.
                  ⚠️ I pezzi restano: al salvataggio la scheda si rispezza in
                  punti, testo e sezioni — e solo se qualcuno l'ha toccata. */}
              <EditorScheda
                sito={nomeSito}
                nome={(iniziale?.nome ?? "") || ""}
                urlOnline={(() => {
                  const sito = negozi.find((x) => x.nome === nomeSito);
                  return st?.handle && sito ? `https://${sito.dominio}/products/${st.handle}` : null;
                })()}
                htmlIniziale={componiDescrizioneHtml({
                  etichettaCategoria: categorie.find((c) => c.chiave === categoria)?.nome ?? null,
                  plusProdotto,
                  plusUno: plus?.uno,
                  plusDue: plus?.due,
                  descrizione,
                  sezioni: suoi.map((x, i) => ({ nome: x.nome, tipo: x.tipo, ordine: i, valore: valoreSezione(nomeSito, x.nome) })),
                })}
              />

              {/* ⭐ 08/09/2026: le traduzioni di QUESTO negozio, nelle sue lingue.
                  ⚠️ Le lingue non si chiedono a Shopify (manca lo scope
                  `read_locales`): si deducono da chi ha già traduzioni e si
                  tengono sulla scheda del negozio. Un locale spento fa
                  rifiutare l'intero lotto, comprese le lingue buone. */}
              {(() => {
                const sito = negozi.find((x) => x.nome === nomeSito);
                const lingue = sito?.lingueAttive ?? [];
                const linkTrad = st?.shopifyId && sito ? `https://${sito.dominio}/admin/apps/translate-and-adapt/localize/products?id=${(st.shopifyId.split("/").pop() ?? "")}` : null;
                return (
                  <div className="campo-modulo" style={{ marginBottom: 14 }}>
                    <label>Traduzioni su {nomeSito}</label>
                    {lingue.length === 0 ? (
                      <span className="cella-sub">Questo negozio non ha altre lingue attive: si pubblica solo in italiano.</span>
                    ) : (
                      <>
                        <label className="pill-opt" style={{ cursor: "pointer", width: "fit-content" }}>
                          <input type="checkbox" name={`traduci:${nomeSito}`} value="1" defaultChecked={!modifica} />
                          {modifica ? "Riscrivi le traduzioni" : "Traduci"} titolo e descrizione in {lingue.map((c: string) => ETICHETTA_LINGUA[c] ?? c).join(" e ")} (con l&apos;AI)
                        </label>
                        <span className="cella-sub">Sono le lingue che {nomeSito} ha davvero attive: le altre Shopify le rifiuta, e il rifiuto fa cadere l&apos;intero lotto.</span>
                      </>
                    )}
                    {linkTrad && (
                      <a className="btn btn-secondario small" href={linkTrad} target="_blank" rel="noreferrer" style={{ marginTop: 8, width: "fit-content" }}>
                        Modifica le traduzioni su Shopify ↗
                      </a>
                    )}
                  </div>
                );
              })()}

              {modifica && st?.shopifyId && (
                <div className="campo-modulo" style={{ marginBottom: 14 }}>
                  <label htmlFor={`stato-${nomeSito}`}>Stato su {nomeSito}</label>
                  <select id={`stato-${nomeSito}`} name={`stato:${nomeSito}`} value={scelto} onChange={(e) => setStatiVoluti((x) => ({ ...x, [nomeSito]: e.target.value }))}>
                    <option value="">Lascia com&apos;è{ora ? ` (${ETICHETTA_STATO_NEGOZIO[ora] ?? ora})` : ""}</option>
                    <option value="ACTIVE">Attivo — in vendita sul sito</option>
                    <option value="DRAFT">Bozza — non visibile ai clienti</option>
                    <option value="ARCHIVED">Archiviato — fuori catalogo</option>
                  </select>
                  {scelto && ora && scelto !== ora && <span className="cella-sub">da {ETICHETTA_STATO_NEGOZIO[ora] ?? ora} → si scrive sul negozio al salvataggio</span>}
                  {scelto && ora === scelto && <span className="cella-sub">è già così</span>}
                </div>
              )}

              {/* ⭐ 10/09/2026: RIACCESO su richiesta dell'utente («fai vedere
                  di quale collezione fa parte»). Era stato nascosto l'08/09
                  perché ingombrava; ma l'appartenenza si importa da Shopify a
                  ogni giro e non si vedeva da nessuna parte — un dato che si
                  scrive e non si rilegge tanto vale non averlo. In sola
                  lettura sta anche nella scheda del prodotto; qui si sceglie. */}
              {(
              <div className="campo-modulo largo" style={{ marginBottom: 14 }}>
                <label>Collezioni su {nomeSito}{scelteQui.length ? ` · ${scelteQui.length}` : ""}</label>
                {(scelteQui.length > 0 || autoQui.length > 0) && (
                  <div className="pill-scelta" style={{ marginBottom: 8 }}>
                    {scelteQui.map((id) => {
                      const c = collezioni.find((x) => x.id === id) ?? iniziale?.collezioni.find((x) => x.id === id);
                      return (
                        <span key={id} className="pill-opt chip-scelta selezionato">
                          {c?.titolo ?? id}
                          <button type="button" className="icon-btn" style={{ padding: 0, width: 18, height: 18, color: "var(--on-ink)" }} title="Togli da questa collezione" onClick={() => setCollezioniScelte((x) => x.filter((y) => y !== id))}>×</button>
                        </span>
                      );
                    })}
                    {autoQui.map((c) => (
                      <span key={c.id} className="pill-opt" title="Collezione automatica: chi ci entra lo decide la regola del negozio" style={{ cursor: "default" }}>
                        {c.titolo} <em style={{ fontStyle: "normal", color: "var(--text-tertiary)" }}>· automatica</em>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  value={cercaCollezione}
                  onChange={(e) => setCercaCollezione(e.target.value)}
                  placeholder={`Cerca fra le ${sue.length} collezioni manuali di ${nomeSito}…`}
                  aria-label={`Cerca una collezione di ${nomeSito}`}
                  style={{ font: "inherit", padding: "8px 12px", borderRadius: "var(--radius-m)", border: "1px solid transparent", background: "var(--fill)", width: "100%" }}
                />
                {cercaCollezione.trim() && (
                  <div className="pill-scelta" style={{ marginTop: 8 }}>
                    {sue.filter((c) => !collezioniScelte.includes(c.id) && c.titolo.toLowerCase().includes(cercaCollezione.trim().toLowerCase())).slice(0, 30).map((c) => (
                      <button key={c.id} type="button" className="pill-opt chip-scelta" onClick={() => { setCollezioniScelte((x) => [...x, c.id]); setCercaCollezione(""); }}>
                        + {c.titolo}
                      </button>
                    ))}
                    {sue.filter((c) => !collezioniScelte.includes(c.id) && c.titolo.toLowerCase().includes(cercaCollezione.trim().toLowerCase())).length === 0 && (
                      <span className="cella-sub">Nessuna collezione manuale di {nomeSito} con questo nome.</span>
                    )}
                  </div>
                )}
              </div>

              )}

              {!categoria ? (
                <div className="vuoto-mini">Scegli la categoria qui sopra: le sezioni da compilare cambiano con quella.</div>
              ) : suoi.length === 0 ? (
                <div className="vuoto-mini">Per «{categorie.find((c) => c.chiave === categoria)?.nome ?? categoria}» su {nomeSito} non sono previste sezioni.</div>
              ) : (
                <>
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
                        <textarea id={campoId} rows={aiuto.righe} value={valoreSezione(nomeSito, s.nome)} onChange={(e) => cambiaSezione(nomeSito, s.nome, e.target.value)} placeholder={aiuto.placeholder} />
                      </div>
                    );
                  })}
                </div>
                </>
              )}

              {/* ⚠️ NASCOSTO il 08/09/2026 su richiesta dell'utente («per ora
                  nascondi»). Il blocco funziona, ma mostra i campi che QUESTO
                  negozio definisce con valori che invece sono **gli stessi per
                  tutti i siti**: due cose diverse che sembrano una sola. Prima
                  di rimetterlo va deciso se i valori dei metafield diventano
                  per negozio. Per riaccenderlo: togliere `false &&`. */}
              {false && defSito.length > 0 && (
                <details className="altri-campi">
                  <summary className="pill-opt">Campi di {nomeSito} · {defSito.length}</summary>
                  <p className="cella-sub" style={{ margin: "8px 0 10px" }}>
                    I <i>metafield</i> che {nomeSito} definisce su Shopify. ⚠️ I valori sono gli stessi su tutti i siti che hanno un campo con la stessa chiave: qui si vede quali campi ciascun sito espone.
                  </p>
                  <div className="modulo">
                    {defSito.map((d) => (
                      <CampoMetafield key={chiaveDef(d)} def={d} valore={metafield[chiaveDef(d)] ?? ""} onChange={(v) => setMetafield((m) => ({ ...m, [chiaveDef(d)]: v }))} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })()}
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
            <div className="tabella-wrap tabella-varianti" style={{ marginTop: 12 }}>
              <table>
                <colgroup>
                  <col className="nome" />
                  <col className="sku" />
                  <col className="soldi" />
                  <col className="soldi" />
                  <col className="soldi" />
                  <col className="nota" />
                  {controllaStock && <col className="soldi" />}
                  <col className="togli" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Variante *</th>
                    <th>SKU</th>
                    <th className="num">Prezzo (€)</th>
                    <th className="num">Costo (€)</th>
                    <th className="num">Partner (€)</th>
                    <th>Nota</th>
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
                      {/* ⭐ 08/09/2026: la nota ha la SUA colonna. Stava dentro
                          la cella del prezzo partner, sotto di esso e senza
                          intestazione: due campi in una casella sola, che
                          sfondavano la colonna e obbligavano la tabella a
                          scorrere di lato. Segnalato dall'utente con la
                          schermata. */}
                      <td>
                        <input value={v.note} onChange={(e) => aggiornaVariante(i, "note", e.target.value)} placeholder="es. 20-25 fiori" aria-label={`Nota variante ${i + 1}`} />
                      </td>
                      {controllaStock && (
                        <td>
                          <input value={v.giacenza} onChange={(e) => aggiornaVariante(i, "giacenza", e.target.value)} type="number" min={0} className="num" aria-label={`Giacenza variante ${i + 1}`} />
                        </td>
                      )}
                      <td>
                        {/* ⭐ 09/09/2026 (utente): «permetti di poterle ordinare
                            a piacimento». La posizione qui è quella che il
                            cliente vede sul negozio, e dal 09/09 si salva nella
                            colonna `ordine`. */}
                        <span className="varianti-frecce">
                          <button type="button" className="icon-btn" onClick={() => spostaVariante(i, -1)} disabled={i === 0} title="Sposta in su" aria-label={`Sposta la variante ${i + 1} in su`}>↑</button>
                          <button type="button" className="icon-btn" onClick={() => spostaVariante(i, 1)} disabled={i === varianti.length - 1} title="Sposta in giù" aria-label={`Sposta la variante ${i + 1} in giù`}>↓</button>
                          <button type="button" className="icon-btn" onClick={() => setVarianti((x) => x.filter((_, j) => j !== i))} disabled={varianti.length === 1} title="Togli questa variante">
                            ×
                          </button>
                        </span>
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
            {/* ⭐ 08/09/2026 (utente): «la traduzione va inserita con il negozio,
                ogni negozio ha lingue a parte». Qui c'era una spunta sola che
                diceva «le 8 lingue del negozio» a tutti e quattro — falso:
                misurate, sono inglese e francese su Flowers, inglese e russo su
                Gifts, solo inglese su Cake e Business. La spunta è passata
                nella scheda di ogni sito, con le SUE lingue. */}
            <span className="cella-sub">
              Le traduzioni si scelgono nella scheda di ogni sito, qui sopra: ogni negozio ha le sue lingue.
            </span>
          </div>
        </div>
      </div>
      )}

      <div className="azioni-modulo">
        {/* ⭐ 09/09/2026: si dice CHE è una bozza e DOVE sta, altrimenti un
            salvataggio invisibile è indistinguibile da nessun salvataggio. */}
        {bozzaSalvata && (
          <span className="bozza-salvata">
            Salvata come <b>bozza</b> alle{" "}
            {bozzaSalvata.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} ·{" "}
            <a href={`/prodotti/${bozzaId}`}>vedila nell&apos;elenco</a>
          </span>
        )}
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
