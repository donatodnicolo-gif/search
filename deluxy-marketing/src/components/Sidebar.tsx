import { conteggiSidebar } from "@/lib/conteggi-sidebar";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, STATI_AZIONE_APERTI, STATI_CAMPAGNA_VIVE } from "@/lib/dominio";
import { Icona } from "./Icona";
import { SbSezione } from "./SbSezione";

export type VoceSidebar =
  | "home" | "analisi" | "audit" | "azioni" | "campagne" | "gruppi" | "landing" | "copy" | "keywords"
  | "meta" | "pubblici" | "ordini" | "offerte" | "drive" | "storico" | "vendite" | "budget" | "mkt" | "impostazioni"
  | "errori" | "memoria" | "incongruenze" | "cadenze" | "occasioni" | "operazioni" | "periodo" | "ricezione" | "ai"
  | "tracciamento" | "termini" | "trend" | "esclusioni";

// Sidebar di navigazione. `attiva` identifica la sezione corrente; `brandAttivo`
// e `canaleAttivo` evidenziano il filtro con cui si sta guardando la pagina.
export async function Sidebar({
  attiva,
  brandAttivo,
  canaleAttivo,
}: {
  attiva?: VoceSidebar;
  brandAttivo?: string;
  canaleAttivo?: string;
}) {
  // Un solo giro al database invece di 19, con 60 secondi di cache: la sidebar
  // sta su OGNI pagina, e quei contatori li pagava tutti a ogni click.
  const {
    nAnalisi, nAudit, nAzioniAperte, nCampagneVive, nLanding, nTestAperti, nDocumenti,
    aperteBrand, aperteCanale, analisiCanale, auditCanale, campagneCanale,
    nPubblici, nOrdini, nErroriAperti, nIncongruenzeAperte, nOperazioni, nGruppi, nTermini,
  } = await conteggiSidebar();


  // I conteggi per canale/brand arrivano già come mappa dalla query unica
  const conta = (per: Record<string, number>, canale: string) => per[canale] ?? 0;
  const aperteDi = (brand: string) => aperteBrand[brand] ?? 0;

  const voce = (id: VoceSidebar, href: string, icona: string, nome: string, count?: number) => (
    <a className={`sb-item${attiva === id && !canaleAttivo ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count != null && count !== 0 && <span className="sb-count">{count}</span>}
    </a>
  );

  // Voce filtrata per canale: attiva solo se si sta guardando quel canale.
  const voceCanale = (
    id: VoceSidebar,
    canale: string,
    href: string,
    icona: string,
    nome: string,
    count: number
  ) => (
    <a className={`sb-item${attiva === id && canaleAttivo === canale ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count !== 0 && <span className="sb-count">{count}</span>}
    </a>
  );

  return (
    <aside className="sidebar">
      <nav>
        {/* L'ordine è quello del lavoro, non quello dei canali: prima cosa
            devo fare adesso, poi su cosa lo faccio, poi com'è andata.
            Analisi/Audit/Azioni/Campagne comparivano tre volte a testa —
            generiche, Google e Meta — per un totale di dodici voci: il canale
            ora è un filtro dentro la pagina, non una sezione del menu. */}
        <SbSezione titolo="Adesso">
          {voce("home", "/", "home", "Dashboard")}
          {voce("azioni", "/azioni", "azioni", "Da fare", nAzioniAperte)}
          {voce("operazioni", "/operazioni", "azioni", "Coda su Google", nOperazioni)}
          {voce("errori", "/errori", "audit", "Incidenti aperti", nErroriAperti)}
        </SbSezione>

        <SbSezione titolo="Campagne">
          {voce("campagne", "/campagne", "campagne", "Tutte le campagne", nCampagneVive)}
          {voceCanale("campagne", "google_ads", "/campagne?canale=google_ads", "campagne", "Solo Google", conta(campagneCanale, "google_ads"))}
          {voceCanale("campagne", "meta_ads", "/campagne?canale=meta_ads", "campagne", "Solo Meta", conta(campagneCanale, "meta_ads"))}
          {voce("gruppi", "/gruppi", "metriche", "Gruppi di annunci", nGruppi)}
          {voce("keywords", "/keywords", "analisi", "Keywords")}
          {voce("termini", "/termini", "analisi", "Parole cercate", nTermini)}
          {voce("esclusioni", "/esclusioni", "analisi", "Liste esclusioni")}
          {voce("copy", "/copy", "copy", "Copy & annunci")}
          {voce("landing", "/landing", "landing", "Landing page", nLanding)}
          {voce("pubblici", "/pubblici", "pubblici", "Pubblici", nPubblici)}
          {voce("meta", "/meta", "meta", "Test & AIDA", nTestAperti)}
        </SbSezione>

        <SbSezione titolo="Com'è andata">
          {voce("periodo", "/analisi-campagne", "metriche", "Analisi periodo")}
          {voce("tracciamento", "/tracciamento", "metriche", "Ritorno e tracciamento")}
          {voce("mkt", "/mkt", "metriche", "MKT vs 2025")}
          {voce("ordini", "/ordini", "ordini", "Ordini", nOrdini)}
          {voce("offerte", "/offerte", "vendite", "Analisi per offerta")}
          {voce("trend", "/trend", "metriche", "Trend vendite")}
        </SbSezione>

        <SbSezione titolo="Piano">
          {voce("budget", "/budget", "budget", "Budget ADV")}
          {voce("vendite", "/vendite", "vendite", "Budget vendite")}
          {voce("occasioni", "/occasioni", "vendite", "Occasioni")}
          {voce("cadenze", "/cadenze", "storico", "Cadenze")}
        </SbSezione>

        <SbSezione titolo="Da sapere">
          {voce("analisi", "/analisi", "analisi", "Analisi", nAnalisi)}
          {voce("audit", "/audit", "audit", "Audit", nAudit)}
          {voce("ai", "/ai", "analisi", "Lettura AI")}
          {voce("memoria", "/memoria", "analisi", "Memoria condivisa")}
          {voce("drive", "/drive", "drive", "Documenti Drive", nDocumenti)}
        </SbSezione>

        <SbSezione titolo="I dati tengono?">
          {voce("ricezione", "/ricezione", "metriche", "Dati in arrivo")}
          {voce("incongruenze", "/incongruenze", "pagina", "Incongruenze", nIncongruenzeAperte)}
          {voce("storico", "/storico", "storico", "Storico modifiche")}
          {voce("impostazioni", "/impostazioni", "impostazioni", "Impostazioni")}
        </SbSezione>

        <SbSezione titolo="Brand">
          {BRANDS.map((b) => (
            <a
              key={b}
              className={`sb-item${brandAttivo === b ? " attiva" : ""}`}
              href={`/brand/${b}`}
            >
              <span className="sb-icona">
                <span className="sb-dot" style={{ background: COLORE_BRAND[b] }} />
              </span>
              <span className="sb-nome">{ETICHETTA_BRAND[b]}</span>
              <span className="sb-count">{aperteDi(b) || ""}</span>
            </a>
          ))}
        </SbSezione>
      </nav>
    </aside>
  );
}
