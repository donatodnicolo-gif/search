import { redirect } from "next/navigation";
import { STATI_GRUPPO_IGNORATI } from "@/lib/gruppi";
import { cittaDaTesto } from "@/lib/citta";
import { Icona } from "@/components/Icona";
import { PortaKeyword } from "@/components/PortaKeyword";
import { attributiPortaKeyword } from "@/lib/porta-keyword";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Sidebar } from "@/components/Sidebar";
import { VisteSalvate } from "@/components/VisteSalvate";
import { destinazionePredefinita } from "@/lib/viste";
import { applicaKeywordAdAltreCampagne, cambiaStatoKeyword, creaOperazioneKeyword } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  COLORE_STATO_KEYWORD,
  ETICHETTA_STATO_KEYWORD,
  formattaEuro,
  formattaNumero,
  STATI_KEYWORD,
  STATI_CAMPAGNA_VIVE,
  corrispondenzaDiTesto,
} from "@/lib/dominio";
import { giudizioKeyword } from "@/lib/salute";
import { ETICHETTA_LINGUA, LINGUE_CAMPAGNA, linguaDaNome } from "@/lib/vendite-campagna";

export const dynamic = "force-dynamic";

// Categoria di prodotto dedotta dal testo della keyword.
function categoriaKeyword(testo: string): string {
  const t = testo.toLowerCase();
  if (/tort|cake|pasticc|dolc/.test(t)) return "torte";
  if (/colazion|breakfast|croissant/.test(t)) return "colazioni";
  if (/palloncin|balloon/.test(t)) return "palloncini";
  if (/regal|gift|box/.test(t)) return "regali";
  if (/rose|fior|flower|bouquet|piant|orchide|girasol|peoni|mazz/.test(t)) return "fiori";
  if (/consegn|domicilio|delivery|spedi|invio|inviare|manda/.test(t)) return "consegna";
  return "altro";
}

const CATEGORIE: { chiave: string; nome: string; icona: string; colore: string }[] = [
  { chiave: "fiori", nome: "Fiori", icona: "fiori", colore: "var(--purple)" },
  { chiave: "torte", nome: "Torte", icona: "torta", colore: "var(--orange)" },
  { chiave: "colazioni", nome: "Colazioni", icona: "colazione", colore: "var(--gold-strong)" },
  { chiave: "regali", nome: "Regali", icona: "regalo", colore: "var(--blue)" },
  { chiave: "palloncini", nome: "Palloncini", icona: "palloncino", colore: "var(--red)" },
  { chiave: "consegna", nome: "Consegna generica", icona: "destinazioni", colore: "var(--green)" },
  { chiave: "altro", nome: "Altro", icona: "pagina", colore: "var(--text-tertiary)" },
];

const ORDINAMENTI: Record<string, string> = {
  incasso: "Incasso",
  spesa: "Spesa",
  resa: "Resa (incasso/spesa)",
  keyword: "Keyword (A-Z)",
};

type KwAggregata = {
  testo: string;
  categoria: string;
  stato: string;
  campagne: string[];
  incasso: number;
  spesa: number;
  resa: number | null;
  clic: number;
  impressioni: number;
  conversioni: number;
  qualita: number | null;
  viva: boolean;
};

// Keywords per tema: si sceglie un tema e lo si espande. La stessa keyword su
// più campagne è una riga sola; lo stato si governa da qui.
export default async function PaginaKeywords({
  searchParams,
}: {
  searchParams: Promise<{ ordina?: string; q?: string; campagna?: string; tema?: string; stato?: string; bloccata?: string; esito?: string; saltate?: string; vista?: string; resa?: string; match?: string; lingua?: string }>;
}) {
  const p = await searchParams;
  const destinazione = await destinazionePredefinita("keywords", "/keywords", p);
  if (destinazione) redirect(destinazione);
  const ordina = Object.keys(ORDINAMENTI).includes(p.ordina ?? "") ? p.ordina! : "incasso";
  const temaAperto = p.tema ?? null;

  const keyword = await prisma.copyAnnuncio.findMany({
    where: {
      tipo: "keyword",
      ...(p.q ? { testo: { contains: p.q } } : {}),
      ...(p.campagna ? { campagna: p.campagna } : {}),
    },
  });
  const campagneCensite = await prisma.campagna.findMany({
    where: { canale: "google_ads", stato: { in: ["attiva", "in_pausa"] } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, classe: true, stato: true },
  });
  // Portare una keyword su una campagna FERMA non serve a niente: resterebbe
  // lì a non comparire finché qualcuno non riaccende la campagna. Nel dialogo
  // vanno solo quelle che stanno erogando.
  // `stato` qui è il fatto, non un giudizio: lo scrive l'import da Google
  // ("attiva" = ENABLED, vedi `statoCampagna()` nello script).
  const campagneVive = campagneCensite.filter((c) => c.stato === "attiva");
  // I gruppi di annunci di quelle campagne, in UNA query sola: servono al
  // dialogo per far scegliere DOVE finisce la keyword. Senza, lo script la
  // infila nel primo gruppo attivo che incontra — una scelta presa dal caso,
  // su una parola che comincia a comprare ricerche vere.
  const gruppiDelle = await prisma.gruppo.findMany({
    where: {
      campagnaId: { in: campagneVive.map((c) => c.id) },
      stato: { notIn: [...STATI_GRUPPO_IGNORATI] },
    },
    orderBy: { nome: "asc" },
    select: { campagnaId: true, nome: true },
  });
  const gruppiPerCampagna = new Map<string, string[]>();
  for (const g of gruppiDelle) {
    const lista = gruppiPerCampagna.get(g.campagnaId) ?? [];
    lista.push(g.nome);
    gruppiPerCampagna.set(g.campagnaId, lista);
  }
  // La lingua viaggia col nome della campagna: serve al dialogo per avvisare
  // quando si porta una parola inglese su una campagna italiana.
  const campagneAttive = campagneVive.map((c) => ({
    ...c,
    lingua: linguaDaNome(c.nome),
    citta: cittaDaTesto(c.nome),
    gruppi: gruppiPerCampagna.get(c.id) ?? [],
  }));
  // ⚠️ Le campagne del selettore sono solo quelle VIVE. L'elenco nasceva dalle
  // keyword, e le keyword sopravvivono alla campagna: si finiva per scegliere
  // una campagna spenta nel 2025 e guardare parole che non comprano più niente.
  // Il confronto è sui nomi, perché CopyAnnuncio tiene il nome, non l'id.
  const nomiVivi = new Set(
    (
      await prisma.campagna.findMany({
        where: { stato: { in: [...STATI_CAMPAGNA_VIVE] } },
        select: { nome: true },
      })
    ).map((c) => c.nome)
  );
  const campagneDisponibili = (
    await prisma.copyAnnuncio.groupBy({
      by: ["campagna"],
      where: { tipo: "keyword" },
      orderBy: { campagna: "asc" },
    })
  ).filter((c) => nomiVivi.has(c.campagna));

  // Nome → id, per rendere cliccabili i tag delle campagne su ogni riga.
  // TUTTE le campagne, non solo le vive: una keyword sopravvive alla campagna
  // e il tag va aperto lo stesso. Le campagne che non stanno qui restano
  // etichette mute — meglio nessun link che un link che porta a un 404.
  // ⚠️ Le campagne DEFUNTE restano nei tag, ma spente. Nasconderle
  // farebbe dire alla riga "su 2 campagne" quando in archivio ne ha 3: una
  // parola sopravvive alla campagna, e togliere il terzo tag non cancella il
  // fatto, cancella solo la possibilita di accorgersene.
  const idPerNomeCampagna = new Map(
    (await prisma.campagna.findMany({ select: { id: true, nome: true } })).map((c) => [c.nome, c.id])
  );

  // Come l'AI ha classificato ogni parola: ideale (descrive cosa vendiamo,
  // vale anche altrove) o specifica (vale solo dov'è). Serve a decidere se la
  // si può proporre su altre campagne — e nel dubbio non si propone.
  // La corrispondenza sta nel testo, come la scrive l'import
  // Una sola lettura della corrispondenza in tutta l'app: vedi
  // `corrispondenzaDiTesto` in dominio.ts, che riconosce anche le forme del
  // Monitoraggio («match esatto») su cui la vecchia regex qui falliva.
  const matchDiTesto = corrispondenzaDiTesto;

  const classiParola = new Map<string, string>();
  for (const pr of await prisma.propostaAi.findMany({
    where: { classe: { not: null } },
    select: { testo: true, classe: true },
  })) {
    const chiave = pr.testo.toLowerCase().replace(/\s*\((exact|phrase|broad)\)\s*$/i, "").trim();
    if (pr.classe) classiParola.set(chiave, pr.classe);
  }
  const classeDi = (testo: string) =>
    classiParola.get(testo.toLowerCase().replace(/\s*\((exact|phrase|broad)\)\s*$/i, "").trim()) ?? null;

  // stessa keyword in più campagne → una riga aggregata
  const perTesto = new Map<string, KwAggregata>();
  for (const k of keyword) {
    const chiave = k.testo.trim().toLowerCase();
    const agg = perTesto.get(chiave) ?? {
      testo: k.testo.trim(),
      categoria: categoriaKeyword(k.testo),
      stato: k.stato === "attivo" ? "attiva" : k.stato,
      campagne: [],
      incasso: 0,
      spesa: 0,
      resa: null,
      clic: 0,
      impressioni: 0,
      conversioni: 0,
      qualita: null,
      viva: false,
    };
    if (!agg.campagne.includes(k.campagna)) agg.campagne.push(k.campagna);
    agg.incasso += k.incasso ?? 0;
    agg.spesa += k.spesa ?? 0;
    agg.clic += k.clic ?? 0;
    agg.impressioni += k.impressioni ?? 0;
    agg.conversioni += k.conversioni ?? 0;
    if (k.punteggioQualita != null) agg.qualita = Math.max(agg.qualita ?? 0, k.punteggioQualita);
    if (k.metricheAl) agg.viva = true;
    perTesto.set(chiave, agg);
  }
  let tutte = [...perTesto.values()].map((k) => ({
    ...k,
    resa: k.spesa > 0 ? k.incasso / k.spesa : null,
  }));
  // Le defunte spariscono da ogni vista, come le campagne: si rivedono solo
  // scegliendo «Defunta» nel filtro di stato.
  if (p.stato) tutte = tutte.filter((k) => k.stato === p.stato);
  else tutte = tutte.filter((k) => k.stato !== "defunta");

  // Rendimento: le fasce sono quelle su cui si agisce davvero.
  if (p.resa === "rendono") tutte = tutte.filter((k) => k.incasso > 0 && k.resa != null && k.resa >= 1);
  else if (p.resa === "a_vuoto") tutte = tutte.filter((k) => k.spesa >= 20 && k.incasso === 0);
  else if (p.resa === "sotto") tutte = tutte.filter((k) => k.spesa >= 20 && k.resa != null && k.resa > 0 && k.resa < 1);
  else if (p.resa === "poca_storia") tutte = tutte.filter((k) => k.spesa < 20);
  else if (p.resa === "spendono") tutte = tutte.filter((k) => k.spesa > 0);

  // Lingua delle campagne su cui la parola gira. La stessa parola può stare su
  // una campagna ITA e una ENG: in quel caso compare filtrando per entrambe,
  // perché è vero per entrambe.
  //
  // ⚠️ **La scelta a mano vince sul nome.** La lingua si può correggere dalla
  // scheda campagna («Contesto» → *Clienti (lingua della campagna)* → Correggi
  // il legame), e quella scelta è esattamente il caso in cui il nome sbaglia:
  // ignorarla qui avrebbe fatto filtrare per la deduzione proprio dove
  // qualcuno era già intervenuto per smentirla.
  if (p.lingua) {
    const legami = await prisma.legameCampagnaShopify.findMany({
      where: { NOT: { lingua: null } },
      select: { lingua: true, campagna: { select: { nome: true } } },
    });
    const linguaScelta = new Map(legami.map((l) => [l.campagna.nome, l.lingua]));
    const linguaDi = (nomeC: string) => linguaScelta.get(nomeC) ?? linguaDaNome(nomeC);
    tutte = tutte.filter((k) => {
      const lingue = k.campagne.map(linguaDi);
      return p.lingua === "ignota"
        ? lingue.every((l) => l == null)
        : lingue.includes(p.lingua!);
    });
  }

  // Corrispondenza: sta scritta nel testo fra parentesi, come la conserva
  // l'import ("fiori milano (phrase)").
  if (p.match) {
    tutte = tutte.filter((k) => {
      const m = k.testo.match(/\((exact|phrase|broad)\)\s*$/i);
      return (m?.[1]?.toLowerCase() ?? "") === p.match;
    });
  }

  const confronta = (a: KwAggregata, b: KwAggregata) => {
    if (ordina === "keyword") return a.testo.localeCompare(b.testo);
    if (ordina === "spesa") return b.spesa - a.spesa;
    if (ordina === "resa") return (b.resa ?? -1) - (a.resa ?? -1);
    return b.incasso - a.incasso;
  };

  const totIncasso = tutte.reduce((s, k) => s + k.incasso, 0);
  const totSpesa = tutte.reduce((s, k) => s + k.spesa, 0);

  // link che conserva i filtri correnti cambiando un solo parametro
  const link = (cambi: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      q: p.q, campagna: p.campagna, ordina: p.ordina, tema: p.tema, stato: p.stato,
      resa: p.resa, match: p.match, lingua: p.lingua,
    };
    for (const [k, v] of Object.entries({ ...base, ...cambi })) {
      if (v) q.set(k, v);
    }
    const s = q.toString();
    return `/keywords${s ? `?${s}` : ""}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="keywords" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Keywords</h1>
            <p className="page-sub">
              Le parole chiave raggruppate per tema: scegli un tema per aprirlo. La stessa keyword
              usata da più campagne è una riga sola, e lo stato che imposti vale su tutte.
            </p>
          </div>
        </div>

        {/* L'esito di «metti in coda» arriva QUI, non su /operazioni: si resta
            dove si stava lavorando. Il link alla coda c'è, ma lo si segue
            quando si vuole — non si viene portati via a ogni parola. */}
        {p.esito && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              {p.esito}
              {p.saltate && (
                <>
                  {" "}· <b>saltate</b>: {p.saltate}
                </>
              )}
              {" — "}
              <a href="/operazioni">vai alla coda per approvare</a>
            </span>
          </div>
        )}

        {p.bloccata && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
            <span><b>Operazione bloccata dal guardrail:</b> {p.bloccata}</span>
          </div>
        )}

        <VisteSalvate pagina="keywords" base="/keywords" parametri={p} />

        {campagneCensite.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Metti in coda su Google Ads</div>
            <p className="cella-sub" style={{ marginBottom: 12 }}>
              Aggiungi una keyword, una negativa, o metti in pausa/riattiva una keyword esistente.
              Niente parte subito: l&apos;operazione va approvata in{" "}
              <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a> e la esegue lo
              script alla prossima corsa. Livelli: negativa L0 · aggiunta L1 · pausa/riattiva L2.
            </p>
            <form className="modulo" action={creaOperazioneKeyword}>
              <div className="campo-modulo">
                <label>Operazione</label>
                <select name="tipo" defaultValue="nuova_keyword">
                  <option value="nuova_keyword">Aggiungi keyword</option>
                  <option value="negativa">Aggiungi negativa</option>
                  <option value="pausa_keyword">Metti in pausa keyword</option>
                  <option value="attiva_keyword">Riattiva keyword</option>
                </select>
              </div>
              <div className="campo-modulo">
                <label>Campagna <span className="obbligatorio">*</span></label>
                <select name="campagnaId" required defaultValue="">
                  <option value="" disabled>Scegli…</option>
                  {campagneCensite.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}{c.classe === "traino" ? " · TRAINO" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo largo">
                <label>Keyword <span className="obbligatorio">*</span></label>
                <input name="testo" required placeholder="es. consegna fiori roma" />
              </div>
              <div className="campo-modulo">
                <label>Corrispondenza</label>
                <select name="corrispondenza" defaultValue="broad">
                  <option value="broad">Broad</option>
                  <option value="phrase">Phrase</option>
                  <option value="exact">Exact</option>
                </select>
              </div>
              <div className="campo-modulo">
                <label>Gruppo di annunci (per l&apos;aggiunta)</label>
                <input name="gruppo" placeholder="vuoto = primo gruppo attivo" />
              </div>
              <div className="campo-modulo largo">
                <label>Perché</label>
                <input name="motivo" placeholder="Il motivo resta nello storico" />
              </div>
              <div className="campo-modulo largo">
                <label>Rollback (per pausa/riattiva su traino)</label>
                <input name="rollbackPiano" placeholder="Come si torna indietro se peggiora" />
              </div>
              <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                <button className="btn" type="submit">Metti in coda</button>
              </div>
            </form>
          </section>
        )}

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{tutte.length}</div>
            <div className="kpi-etichetta">Keyword uniche</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totIncasso)}</div>
            <div className="kpi-etichetta">Incasso attribuito</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totSpesa)}</div>
            <div className="kpi-etichetta">Spesa</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{totSpesa > 0 ? `${(totIncasso / totSpesa).toFixed(1)}×` : "—"}</div>
            <div className="kpi-etichetta">Resa complessiva</div>
          </div>
        </div>

        <form className="filtri" method="get">
          {temaAperto && <input type="hidden" name="tema" value={temaAperto} />}
          <input type="search" name="q" placeholder="Cerca una keyword…" defaultValue={p.q ?? ""} />
          <select name="campagna" defaultValue={p.campagna ?? ""}>
            <option value="">Tutte le campagne</option>
            {campagneDisponibili.map((c) => (
              <option key={c.campagna} value={c.campagna}>{c.campagna}</option>
            ))}
          </select>
          <select name="stato" defaultValue={p.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {STATI_KEYWORD.map((s) => (
              <option key={s} value={s}>{ETICHETTA_STATO_KEYWORD[s]}</option>
            ))}
          </select>
          {/* Il rendimento in fasce su cui si può decidere qualcosa. «Poca
              storia» esiste apposta: sotto i 20 € non c'è statistica, e
              chiamare perdente una parola con 4 € di spesa è una condanna
              senza prove. */}
          <select name="resa" defaultValue={p.resa ?? ""}>
            <option value="">Qualsiasi rendimento</option>
            <option value="rendono">Rendono (incasso ≥ spesa)</option>
            <option value="sotto">Sotto il costo (rendono, ma poco)</option>
            <option value="a_vuoto">Spendono a vuoto (≥20 €, zero incasso)</option>
            <option value="spendono">Che spendono (qualsiasi cifra)</option>
            <option value="poca_storia">Poca storia (meno di 20 €)</option>
          </select>
          <select name="match" defaultValue={p.match ?? ""}>
            <option value="">Ogni corrispondenza</option>
            <option value="exact">Esatta</option>
            <option value="phrase">A frase</option>
            <option value="broad">Generica</option>
          </select>
          {/* ⚠️ La lingua è quella della CAMPAGNA su cui la parola gira, letta
              dal suo nome — non la lingua in cui la parola è scritta. «flower
              delivery milan» dentro una campagna ITA resta ITA: qui lingua
              vuol dire *a chi parla la campagna*. Le campagne che nel nome non
              lo dicono finiscono in «non dichiarata», che è una risposta
              onesta e non un quarto idioma. */}
          <select name="lingua" defaultValue={p.lingua ?? ""}>
            <option value="">Ogni lingua</option>
            {LINGUE_CAMPAGNA.map((l) => (
              <option key={l} value={l}>{ETICHETTA_LINGUA[l]}</option>
            ))}
            <option value="ignota">Lingua non dichiarata nel nome</option>
          </select>
          <select name="ordina" defaultValue={ordina}>
            {Object.entries(ORDINAMENTI).map(([v, e]) => (
              <option key={v} value={v}>Ordina per {e}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Applica</button>
        </form>

        {/* Scelta del tema: tessere cliccabili, quella aperta resta evidenziata */}
        <div className="griglia-temi">
          {CATEGORIE.map((cat) => {
            const del = tutte.filter((k) => k.categoria === cat.chiave);
            if (del.length === 0) return null;
            const incasso = del.reduce((s, k) => s + k.incasso, 0);
            const spesa = del.reduce((s, k) => s + k.spesa, 0);
            const aperto = temaAperto === cat.chiave;
            return (
              <a
                className={`tessera-tema${aperto ? " aperta" : ""}`}
                key={cat.chiave}
                href={link({ tema: aperto ? null : cat.chiave })}
              >
                <span className="tessera-icona" style={{ color: cat.colore }}>
                  <Icona nome={cat.icona} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="tessera-nome">{cat.nome}</span>
                  <span className="tessera-conta">{del.length} keyword</span>
                </span>
                <span className="tessera-resa">
                  <b>{spesa > 0 ? `${(incasso / spesa).toFixed(1)}×` : "—"}</b>
                  <i>{formattaEuro(incasso)}</i>
                </span>
              </a>
            );
          })}
        </div>

        {/* ⚠️ Senza tema scelto la pagina diceva «scegli un tema» e nascondeva
            TUTTO: chi arriva da una ricerca («porto cervo») trovava i totali
            in cima — 6 keyword, 1.260 € — e sotto il vuoto, come se la
            ricerca non avesse prodotto niente. I temi restano un modo di
            raggruppare, non un cancello: senza sceglierne uno si vede
            l'elenco intero. */}
        {!temaAperto && CATEGORIE.every((c) => tutte.filter((k) => k.categoria === c.chiave).length === 0) && (
          <div className="vuoto">Nessuna keyword con questi filtri.</div>
        )}

        {(temaAperto ? CATEGORIE.filter((c) => c.chiave === temaAperto) : CATEGORIE)
          .filter((c) => temaAperto != null || tutte.some((k) => k.categoria === c.chiave))
          .map((cat) => {
          const del = tutte.filter((k) => k.categoria === cat.chiave).sort(confronta);
          const incassoCat = del.reduce((s, k) => s + k.incasso, 0);
          const spesaCat = del.reduce((s, k) => s + k.spesa, 0);
          return (
            <section className="scheda" key={cat.chiave} style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 24px 0", flexWrap: "wrap" }}>
                <span className="tessera-icona" style={{ color: cat.colore }}>
                  <Icona nome={cat.icona} />
                </span>
                {cat.nome} ({del.length})
                <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  {formattaEuro(incassoCat)} incasso · {formattaEuro(spesaCat)} spesa ·{" "}
                  {spesaCat > 0 ? `${(incassoCat / spesaCat).toFixed(1)}×` : "—"}
                </span>
                <a className="btn small btn-secondario" href={link({ tema: null })}>Chiudi</a>
              </div>
              <div style={{ overflowX: "auto", paddingBottom: 6 }}>
                <table>
                  <thead>
                    <tr>
                      <th><a href={link({ ordina: "keyword" })}>Keyword {ordina === "keyword" ? "↓" : ""}</a></th>
                      <th style={{ minWidth: 150 }}>Valutazione</th>
                      <th style={{ minWidth: 140 }}>Stato</th>
                      <th>Campagne</th>
                      <th className="num"><a href={link({ ordina: "incasso" })}>Incasso {ordina === "incasso" ? "↓" : ""}</a></th>
                      <th className="num" title="Quante volte è comparso un annuncio per questa keyword">Comparse</th>
                      <th className="num">Clic</th>
                      <th className="num" title="Clic ÷ comparse">CTR</th>
                      <th className="num" title="Costo per clic">CPC</th>
                      <th className="num">Conv.</th>
                      <th className="num" title="Costo per conversione">CPA</th>
                      <th className="num" title="Punteggio di qualità Google (1-10)">QS</th>
                      <th className="num"><a href={link({ ordina: "spesa" })}>Spesa {ordina === "spesa" ? "↓" : ""}</a></th>
                      <th className="num"><a href={link({ ordina: "resa" })}>Resa {ordina === "resa" ? "↓" : ""}</a></th>
                    </tr>
                  </thead>
                  <tbody>
                    {del.map((k) => {
                      const g = giudizioKeyword(k.incasso, k.spesa);
                      return (
                      <tr key={k.testo}>
                        <td style={{ maxWidth: 340 }}>
                          <div className="cella-nome">{k.testo}</div>
                          {/* Portarla dove ancora non c'è: è il gesto che fa
                              crescere un account. Ma solo se è una parola
                              IDEALE — le specifiche valgono solo dove stanno. */}
                          {(() => {
                            const cl = classeDi(k.testo);
                            const altre = campagneAttive.filter((c) => !k.campagne.includes(c.nome));
                            if (cl === "specific") {
                              return (
                                <div className="cella-sub">
                                  parola specifica: vale solo dove sta
                                </div>
                              );
                            }
                            if (altre.length === 0) return null;
                            // Bottone leggero: apre l'unico dialogo della
                            // pagina (vedi <PortaKeyword> in fondo), che
                            // legge da qui su cosa sta lavorando.
                            return (
                              <button
                                type="button"
                                className="kw-porta-apri"
                                {...attributiPortaKeyword({
                                  testo: k.testo,
                                  // ⚠️ Quando non si sa, si va sulla PIÙ
                                  // STRETTA, non sulla più larga. Il ripiego
                                  // era «generica», che su una parola nata
                                  // esatta moltiplica le ricerche comprate.
                                  corrispondenza: matchDiTesto(k.testo) ?? "exact",
                                  giaSu: k.campagne,
                                  // Le lingue delle campagne su cui la parola
                                  // gira già: servono ad avvisare quando la si
                                  // porta su una campagna che parla un'altra
                                  // lingua, invece di accodarla e basta.
                                  lingueDiOra: k.campagne
                                    .map((c) => linguaDaNome(c))
                                    .filter((l): l is string => l != null),
                                  classificata: cl != null,
                                })}
                              >
                                Porta su altre campagne
                                {cl === "ideal" && <span className="kw-ideale">ideale</span>}
                              </button>
                            );
                          })()}
                        </td>
                        <td>
                          <span className="tag-salute" style={{ color: g.colore }} title={g.spiega}>
                            <span className="dot" />
                            {g.etichetta}
                          </span>
                        </td>
                        <td>
                          <form action={cambiaStatoKeyword}>
                            <input type="hidden" name="keyword" value={k.testo} />
                            <SelettoreStato
                              valore={k.stato}
                              colore={COLORE_STATO_KEYWORD[k.stato]}
                              opzioni={STATI_KEYWORD.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO_KEYWORD[s] }))}
                            />
                          </form>
                        </td>
                        <td>
                          {/* Il tag apre la campagna in una finestra nuova: si
                              sta leggendo un elenco di parole e si vuole
                              sbirciare la campagna senza perdere il posto —
                              tornare indietro qui vuol dire ricaricare 1.500
                              righe e riaprire il tema. */}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {k.campagne.map((c) => {
                              const idCampagna = idPerNomeCampagna.get(c);
                              const viva = nomiVivi.has(c);
                              if (!viva) {
                                return (
                                  <span
                                    className="tag-neutro"
                                    key={c}
                                    style={{ opacity: 0.5, textDecoration: "line-through" }}
                                    title={`«${c}» e defunta: la parola resta in archivio ma quella campagna non gira piu`}
                                  >
                                    {c}
                                  </span>
                                );
                              }
                              return idCampagna ? (
                                <a
                                  className="tag-neutro tag-link"
                                  key={c}
                                  href={`/campagne/${idCampagna}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Apri «${c}» in una finestra nuova`}
                                >
                                  {c}
                                  <span aria-hidden="true" className="tag-link-freccia">↗</span>
                                </a>
                              ) : (
                                <span className="tag-neutro" key={c}>{c}</span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="num" style={{ color: k.incasso > 0 ? "var(--green)" : "var(--text-tertiary)", fontWeight: k.incasso > 0 ? 600 : 400 }}>
                          {formattaEuro(k.incasso)}
                        </td>
                        <td className="num cella-muta">{k.impressioni > 0 ? formattaNumero(k.impressioni) : "—"}</td>
                        <td className="num cella-muta">{k.clic > 0 ? formattaNumero(k.clic) : "—"}</td>
                        <td className="num cella-muta">
                          {k.impressioni > 0 ? `${((k.clic / k.impressioni) * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="num cella-muta">{k.clic > 0 ? formattaEuro(k.spesa / k.clic) : "—"}</td>
                        <td className="num cella-muta">{k.conversioni > 0 ? k.conversioni.toFixed(1) : "—"}</td>
                        <td className="num cella-muta">
                          {k.conversioni > 0 ? formattaEuro(k.spesa / k.conversioni) : "—"}
                        </td>
                        <td className="num" style={k.qualita != null && k.qualita < 5 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                          {k.qualita ?? "—"}
                        </td>
                        <td className="num cella-muta">{formattaEuro(k.spesa)}</td>
                        <td className="num" style={k.resa != null && k.resa < 1 && k.spesa > 30 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                          {k.resa != null ? `${k.resa.toFixed(1)}×` : "—"}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {/* Uno solo per tutta la pagina: l'elenco delle campagne è lo stesso
            per ogni riga, e ripeterlo 1.531 volte costava 68 MB di HTML. */}
        <PortaKeyword
          campagne={campagneAttive}
          ritorno="/keywords"
          azione={applicaKeywordAdAltreCampagne}
        />
      </main>
    </div>
  );
}
