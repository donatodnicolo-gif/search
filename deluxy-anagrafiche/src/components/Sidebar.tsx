import { prisma } from "@/lib/db";
import { INTERESSI_AFFILIAZIONE, coloreInteresse } from "@/lib/interessi";
import { getLinee } from "@/lib/linee";
import {
  COLORE_STATO,
  COLORE_STATO_ANALISI,
  COLORE_STATO_FINANZIARIO,
  ETICHETTE_STATO,
  ETICHETTE_STATO_ANALISI,
  ETICHETTE_STATO_FINANZIARIO,
  STATI,
  STATI_ANALISI,
  STATI_FINANZIARI,
} from "@/lib/stati";
import { IconaCategoria } from "./IconaCategoria";
import { SbSezione } from "./SbSezione";

// Sidebar di navigazione: tipologie, stati e interessi filtrano l'elenco;
// "Aziende" mostra tutto. I conteggi considerano solo le anagrafiche
// attive; le archiviate vivono nella sezione dedicata in fondo.
export async function Sidebar({
  categoriaAttiva,
  statoAttivo,
  statoFinanziarioAttivo,
  statoAnalisiAttivo,
  interesseAttivo,
  archivioAttivo = false,
  hubspotAttivo = false,
  dashboardAttiva = false,
  matchAttivo = false,
  contattiAttiva = false,
  riconciliazioneAttiva = false,
  riconciliazioniAttive = false,
  identitaAttiva = false,
  chiaviAttive = false,
  affiliatiAttivi = false,
  valetAttivo = false,
}: {
  categoriaAttiva?: string | null;
  statoAttivo?: string | null;
  statoFinanziarioAttivo?: string | null;
  statoAnalisiAttivo?: string | null;
  interesseAttivo?: string | null;
  archivioAttivo?: boolean;
  hubspotAttivo?: boolean;
  dashboardAttiva?: boolean;
  matchAttivo?: boolean;
  contattiAttiva?: boolean;
  riconciliazioneAttiva?: boolean;
  riconciliazioniAttive?: boolean;
  identitaAttiva?: boolean;
  chiaviAttive?: boolean;
  affiliatiAttivi?: boolean;
  valetAttivo?: boolean;
}) {
  // ⚠️ PRESTAZIONI — leggere prima di toccare.
  // La sidebar sta su OGNI pagina e viene ricostruita a ogni azione (cambiare
  // stato o interesse rivalida `/`). I suoi conteggi erano dodici query: prima
  // in fila (3,3 s), poi in `Promise.all` (1,4 s, perché la connessione al
  // pooler ha `connection_limit=5` e le "parallele" vanno a ondate).
  // Ora sono **una sola query**: 0,5 s, e non peggiora aggiungendo conteggi.
  // Se ne serve un altro, aggiungi un sotto-select qui, non un `await` sotto.
  const [conteggi, linee] = await Promise.all([
    prisma.$queryRaw<
      {
        categorie: { categoria: string; n: number }[] | null;
        archiviate: number;
        stati: { v: string; n: number }[] | null;
        finanziari: { v: string; n: number }[] | null;
        analisi: { v: string; n: number }[] | null;
        interessi: { v: string; n: number }[] | null;
        damatch: number;
        dariconciliare: number;
        disaccordi: number;
        chiavi: number;
        valet: number;
        affiliati: number;
      }[]
      // Schema sempre qualificato: via pgbouncer il `search_path` non è
      // garantito e "Partner" senza schema può colpire la tabella di un'altra
      // app del cluster (già successo in produzione, errore 42703).
    >`
      SELECT
        (SELECT json_agg(t) FROM (
          SELECT "categoria", count(*)::int AS n FROM "anagrafiche"."Partner"
          WHERE "attivo" GROUP BY 1 ORDER BY n DESC, "categoria" ASC) t) AS categorie,
        (SELECT count(*)::int FROM "anagrafiche"."Partner" WHERE NOT "attivo") AS archiviate,
        (SELECT json_agg(t) FROM (
          SELECT "stato" AS v, count(*)::int AS n FROM "anagrafiche"."Partner"
          WHERE "attivo" GROUP BY 1) t) AS stati,
        (SELECT json_agg(t) FROM (
          SELECT "statoFinanziario" AS v, count(*)::int AS n FROM "anagrafiche"."Partner"
          WHERE "attivo" GROUP BY 1) t) AS finanziari,
        (SELECT json_agg(t) FROM (
          SELECT coalesce("statoAnalisi", 'nessuno') AS v, count(*)::int AS n
          FROM "anagrafiche"."Partner" WHERE "attivo" GROUP BY 1) t) AS analisi,
        (SELECT json_agg(t) FROM (
          SELECT unnest("interessi") AS v, count(*)::int AS n FROM "anagrafiche"."Partner"
          WHERE "attivo" GROUP BY 1) t) AS interessi,
        (SELECT count(*)::int FROM "anagrafiche"."RichiestaMatch"
          WHERE NOT "risolto" AND "esito" <> 'agganciata') AS damatch,
        (SELECT count(*)::int FROM "anagrafiche"."Contatto" c
          JOIN "anagrafiche"."Partner" pa ON pa."id" = c."partnerId"
          WHERE NOT c."archiviato" AND pa."attivo" AND pa."categoria" = 'DA CLASSIFICARE') AS dariconciliare,
        (SELECT count(*)::int FROM "anagrafiche"."Riconciliazione" WHERE "stato" = 'aperta') AS disaccordi,
        (SELECT count(*)::int FROM "anagrafiche"."ApiKey" WHERE "attiva") AS chiavi,
        (SELECT count(*)::int FROM "anagrafiche"."Valet" WHERE "attivo") AS valet,
        (SELECT count(*)::int FROM "anagrafiche"."Partner"
          WHERE "attivo" AND "interessi" && ARRAY['Affiliazioni','Re-seller']::text[]) AS affiliati`,
    getLinee(),
  ]);

  const c = conteggi[0];
  const categorie = c?.categorie ?? [];
  const archiviate = c?.archiviate ?? 0;
  const daRisolvere = c?.damatch ?? 0;
  const daRiconciliare = c?.dariconciliare ?? 0;
  const disaccordi = c?.disaccordi ?? 0;
  const chiaviAttiveConteggio = c?.chiavi ?? 0;
  const valet = c?.valet ?? 0;
  const affiliati = c?.affiliati ?? 0;
  const totale = categorie.reduce((somma, x) => somma + x.n, 0);
  const perStato = new Map((c?.stati ?? []).map((s) => [s.v, s.n]));
  const perStatoFinanziario = new Map((c?.finanziari ?? []).map((s) => [s.v, s.n]));
  const perStatoAnalisi = new Map((c?.analisi ?? []).map((s) => [s.v, s.n]));
  const perInteresse = new Map((c?.interessi ?? []).map((i) => [i.v, i.n]));

  const globaleAttiva =
    !categoriaAttiva && !statoAttivo && !statoFinanziarioAttivo && !statoAnalisiAttivo && !interesseAttivo && !archivioAttivo && !hubspotAttivo && !dashboardAttiva && !matchAttivo && !contattiAttiva && !riconciliazioneAttiva && !identitaAttiva && !chiaviAttive && !affiliatiAttivi && !valetAttivo;

  return (
    <aside className="sidebar">
      <nav>
        <SbSezione titolo="Registro">
          <a className={`sb-item${globaleAttiva ? " attiva" : ""}`} href="/">
            <span className="sb-icona"><IconaCategoria categoria="GLOBALE" /></span>
            <span className="sb-nome">Aziende</span>
            <span className="sb-count">{totale}</span>
          </a>
          <a className={`sb-item${dashboardAttiva ? " attiva" : ""}`} href="/dashboard">
            <span className="sb-icona"><IconaCategoria categoria="DASHBOARD" /></span>
            <span className="sb-nome">Dashboard</span>
          </a>
          <a className={`sb-item${contattiAttiva ? " attiva" : ""}`} href="/contatti">
            <span className="sb-icona"><IconaCategoria categoria="CONTATTI" /></span>
            <span className="sb-nome">Contatti</span>
          </a>
          <a className={`sb-item${valetAttivo ? " attiva" : ""}`} href="/valet">
            <span className="sb-icona"><IconaCategoria categoria="VALET" /></span>
            <span className="sb-nome">Valet</span>
            <span className="sb-count">{valet}</span>
          </a>
          {/* La pagella di chi serve le consegne D2C: i giudizi arrivano dai
              reclami di Customer Service, e qui si legge chi lavora male. */}
          <a className={`sb-item${affiliatiAttivi ? " attiva" : ""}`} href="/affiliati">
            <span className="sb-icona"><IconaCategoria categoria="AFFILIATI" /></span>
            <span className="sb-nome">Affiliati e re-seller</span>
            <span className="sb-count">{affiliati}</span>
          </a>
        </SbSezione>

        <SbSezione titolo="Tipologie">
          {categorie.map((c) => (
            <a
              key={c.categoria}
              className={`sb-item${categoriaAttiva === c.categoria && !archivioAttivo ? " attiva" : ""}`}
              href={`/?categoria=${encodeURIComponent(c.categoria)}`}
            >
              <span className="sb-icona"><IconaCategoria categoria={c.categoria} /></span>
              <span className="sb-nome">{etichetta(c.categoria)}</span>
              <span className="sb-count">{c.n}</span>
            </a>
          ))}
        </SbSezione>

        <SbSezione titolo="Stati commerciali">
          {STATI.map((s) => (
            <a
              key={s}
              className={`sb-item${statoAttivo === s ? " attiva" : ""}`}
              href={`/?stato=${s}`}
            >
              <span className="sb-icona"><span className="sb-dot" style={{ background: COLORE_STATO[s] }} /></span>
              <span className="sb-nome">{ETICHETTE_STATO[s]}</span>
              <span className="sb-count">{perStato.get(s) ?? 0}</span>
            </a>
          ))}
        </SbSezione>

        <SbSezione titolo="Stati finanziari">
          {STATI_FINANZIARI.map((s) => (
            <a
              key={s}
              className={`sb-item${statoFinanziarioAttivo === s ? " attiva" : ""}`}
              href={`/?statoFinanziario=${s}`}
            >
              <span className="sb-icona">
                <span className="sb-dot" style={{ background: COLORE_STATO_FINANZIARIO[s] }} />
              </span>
              <span className="sb-nome">{ETICHETTE_STATO_FINANZIARIO[s]}</span>
              <span className="sb-count">{perStatoFinanziario.get(s) ?? 0}</span>
            </a>
          ))}
        </SbSezione>

        <SbSezione titolo="Stati analisi">
          {STATI_ANALISI.map((s) => (
            <a
              key={s}
              className={`sb-item${statoAnalisiAttivo === s ? " attiva" : ""}`}
              href={`/?statoAnalisi=${s}`}
            >
              <span className="sb-icona">
                <span className="sb-dot" style={{ background: COLORE_STATO_ANALISI[s] }} />
              </span>
              <span className="sb-nome">{ETICHETTE_STATO_ANALISI[s]}</span>
              <span className="sb-count">{perStatoAnalisi.get(s) ?? 0}</span>
            </a>
          ))}
          <a
            className={`sb-item${statoAnalisiAttivo === "nessuno" ? " attiva" : ""}`}
            href="/?statoAnalisi=nessuno"
          >
            <span className="sb-icona"><span className="sb-dot" style={{ background: "var(--text-tertiary)" }} /></span>
            <span className="sb-nome">Non analizzate</span>
            <span className="sb-count">{perStatoAnalisi.get("nessuno") ?? 0}</span>
          </a>
        </SbSezione>

        <SbSezione titolo="Interessi">
          {linee.map((i) => (
            <a
              key={i}
              className={`sb-item${interesseAttivo === i ? " attiva" : ""}`}
              href={`/?interesse=${encodeURIComponent(i)}`}
            >
              <span className="sb-icona"><span className="sb-dot" style={{ background: coloreInteresse(i) }} /></span>
              <span className="sb-nome">{i}</span>
              <span className="sb-count">{perInteresse.get(i) ?? 0}</span>
            </a>
          ))}
        </SbSezione>

        <SbSezione titolo="Archivio">
          <a className={`sb-item${archivioAttivo ? " attiva" : ""}`} href="/?archiviati=1">
            <span className="sb-icona"><IconaCategoria categoria="ARCHIVIO" /></span>
            <span className="sb-nome">Archiviati</span>
            <span className="sb-count">{archiviate}</span>
          </a>
        </SbSezione>

        <SbSezione titolo="Identità aziende">
          <a className={`sb-item${identitaAttiva ? " attiva" : ""}`} href="/identita-aziende">
            <span className="sb-icona"><IconaCategoria categoria="DASHBOARD" /></span>
            <span className="sb-nome">Panoramica</span>
          </a>
          <a className={`sb-item${hubspotAttivo ? " attiva" : ""}`} href="/sync-hubspot">
            <span className="sb-icona"><IconaCategoria categoria="SYNC" /></span>
            <span className="sb-nome">Sync HubSpot</span>
          </a>
          <a className={`sb-item${matchAttivo ? " attiva" : ""}`} href="/match">
            <span className="sb-icona"><IconaCategoria categoria="MATCH" /></span>
            <span className="sb-nome">Richieste di aggancio</span>
            {daRisolvere > 0 && <span className="sb-count">{daRisolvere}</span>}
          </a>
          <a className={`sb-item${riconciliazioneAttiva ? " attiva" : ""}`} href="/riconciliazione">
            <span className="sb-icona"><IconaCategoria categoria="MATCH" /></span>
            <span className="sb-nome">Riconciliazione referenti</span>
            {daRiconciliare > 0 && <span className="sb-count">{daRiconciliare}</span>}
          </a>
          {/* Nome esteso in tutte e due le voci: «Riconciliazione» da sola non
              distingueva l'assegnazione dei referenti dalla scelta fra due
              valori in disaccordo. */}
          <a className={`sb-item${riconciliazioniAttive ? " attiva" : ""}`} href="/riconciliazioni">
            <span className="sb-icona"><IconaCategoria categoria="MATCH" /></span>
            <span className="sb-nome">Riconciliazioni dati</span>
            {disaccordi > 0 && <span className="sb-count">{disaccordi}</span>}
          </a>
        </SbSezione>

        <SbSezione titolo="Impostazioni">
          <a className={`sb-item${chiaviAttive ? " attiva" : ""}`} href="/chiavi">
            <span className="sb-icona"><IconaCategoria categoria="CHIAVI" /></span>
            <span className="sb-nome">Chiavi API</span>
            <span className="sb-count">{chiaviAttiveConteggio}</span>
          </a>
        </SbSezione>
      </nav>
    </aside>
  );
}

// "CHEF PRIVATO" → "Chef privato"
export function etichetta(categoria: string): string {
  const minuscolo = categoria.toLowerCase();
  return minuscolo.charAt(0).toUpperCase() + minuscolo.slice(1);
}
