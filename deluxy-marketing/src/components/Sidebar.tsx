import { conteggiSidebar } from "@/lib/conteggi-sidebar";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, STATI_AZIONE_APERTI, STATI_CAMPAGNA_VIVE } from "@/lib/dominio";
import { Icona } from "./Icona";
import { VoceNovita } from "./PalliniNav";
import { SbSezione } from "./SbSezione";
import { TornaIndietro } from "./TornaIndietro";

export type VoceSidebar =
  | "home" | "analisi" | "audit" | "azioni" | "campagne" | "gruppi" | "landing" | "copy" | "keywords"
  | "meta" | "pubblici" | "ordini" | "offerte" | "drive" | "storico" | "vendite" | "budget" | "mkt" | "impostazioni"
  | "errori" | "memoria" | "incongruenze" | "cadenze" | "occasioni" | "operazioni" | "periodo" | "ricezione" | "ai"
  | "tracciamento" | "termini" | "trend" | "esclusioni" | "estensioni" | "liste-escluse"
  | "campagne-storiche";

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
    nPubblici, nOrdini, nErroriAperti, nIncongruenzeAperte, nOperazioni, nGruppi, nTermini, nEstensioniFerme,
  } = await conteggiSidebar();


  // I conteggi per canale/brand arrivano già come mappa dalla query unica
  const conta = (per: Record<string, number>, canale: string) => per[canale] ?? 0;
  const aperteDi = (brand: string) => aperteBrand[brand] ?? 0;

  const voce = (id: VoceSidebar, href: string, icona: string, nome: string, count?: number, novita = false) => (
    <a className={`sb-item${attiva === id && !canaleAttivo ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count != null && count !== 0 && <span className="sb-count">{count}</span>}
      {/* Pallino giallo «è arrivato qualcosa da quando hai guardato» (Libro
          UX&UI v1.4 §7) sulle voci con arrivi esterni. Il numero e il pallino
          dicono cose diverse: il sb-count qui sopra è quanto c'è, il pallino
          è il segnalibro personale. */}
      {novita && <VoceNovita href={href} />}
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
      {/* «Indietro» su OGNI pagina, non solo dove qualcuno si è ricordato di
          metterlo: si naviga in profondità — campagna, gruppo, coda — e la
          via del ritorno serve dappertutto. Usa la cronologia del browser,
          quindi vale anche per un link incollato. */}
      <div style={{ padding: "0 14px 10px" }}>
        <TornaIndietro />
      </div>
      <nav>
        {/* L'ordine è quello del lavoro, non quello dei canali: prima cosa
            devo fare adesso, poi su cosa lo faccio, poi com'è andata.
            Analisi/Audit/Azioni/Campagne comparivano tre volte a testa —
            generiche, Google e Meta — per un totale di dodici voci: il canale
            ora è un filtro dentro la pagina, non una sezione del menu. */}
        <SbSezione titolo="Adesso">
          {voce("home", "/", "home", "Dashboard")}
          {voce("azioni", "/azioni", "azioni", "Da fare", nAzioniAperte)}
          {/* Si chiamava "Coda su Google" ed era vero a meta: nella stessa coda
              ci sono anche le operazioni Meta, che uno script di Google non
              eseguira mai. Il nome della voce segue quello della pagina. */}
          {voce("operazioni", "/operazioni", "azioni", "Operazioni", nOperazioni, true)}
          {voce("errori", "/errori", "audit", "Incidenti aperti", nErroriAperti)}
        </SbSezione>

        {/* ⚠️ Google e Meta separati, non mescolati in un elenco solo.
            Le due piattaforme non hanno le stesse cose — su Meta non esistono
            keyword né parole cercate, su Google non esistono i pubblici — e
            tenerle in una lista unica faceva cercare voci che su quel canale
            non ci sono. Quello che vale per entrambe resta qui in cima. */}
        <SbSezione titolo="Campagne">
          {voce("campagne", "/campagne", "campagne", "Tutte le campagne", nCampagneVive)}
          {voce("landing", "/landing", "landing", "Landing page", nLanding)}
          {/* ⚠️ Voce a parte da «Tutte le campagne», che mostra quelle VIVE:
              qui ci sono anche le rimosse degli anni scorsi, che l'app non ha
              mai visto. Metterle nello stesso elenco farebbe sembrare vivo
              qualcosa che è morto nel 2024. */}
          {voce("campagne-storiche", "/campagne-storiche", "storico", "Quante ce n'erano (storico)")}
        </SbSezione>

        <SbSezione titolo="Google Ads">
          {voceCanale("campagne", "google_ads", "/campagne?canale=google_ads", "campagne", "Campagne Google", conta(campagneCanale, "google_ads"))}
          {voce("gruppi", "/gruppi?canale=google_ads", "metriche", "Gruppi di annunci")}
          {voce("keywords", "/keywords", "analisi", "Keywords")}
          {voce("termini", "/termini", "analisi", "Parole cercate", nTermini)}
          {voce("esclusioni", "/esclusioni", "analisi", "Regole di esclusione")}
          {/* ⚠️ Due voci vicine e diverse: le REGOLE trasformano una ricerca in
              una negativa, le LISTE sono insiemi di parole da applicare a piu'
              campagne. La prima si chiamava "Liste esclusioni" e prendeva il
              nome della seconda. */}
          {voce("liste-escluse", "/liste-escluse", "analisi", "Liste di parole escluse")}
          {voce("copy", "/copy", "copy", "Copy & annunci")}
          {/* ⚠️ Le estensioni si vedevano SOLO dentro la singola campagna: per
              sapere se un brand aveva i callout bisognava aprirle una per una. Il
              contatore mostra quante sono ferme, che è la ragione per entrare. */}
          {voce("estensioni", "/estensioni", "copy", "Estensioni", nEstensioniFerme)}
        </SbSezione>

        <SbSezione titolo="Meta">
          {voceCanale("campagne", "meta_ads", "/campagne?canale=meta_ads", "campagne", "Campagne Meta", conta(campagneCanale, "meta_ads"))}
          {/* ⚠️ Niente voce «Ad set»: gli ad set di Meta NON vengono importati
              (misurato 09/08/2026: 117 gruppi in archivio, tutti Google). Una
              voce che porta a una pagina vuota è peggio di una voce assente —
              fa cercare un dato che non c'è e sembra un guasto. Torna il
              giorno che la sync Meta li porterà. */}
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
          {voce("analisi", "/analisi", "analisi", "Analisi", nAnalisi, true)}
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
