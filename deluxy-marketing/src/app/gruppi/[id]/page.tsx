import { notFound } from "next/navigation";
import { AndamentoMensile } from "@/components/AndamentoMensile";
import { AzioneGruppo } from "@/components/AzioneGruppo";
import { Badge } from "@/components/Badge";
import { EstendiConAi } from "@/components/EstendiConAi";
import { PortaKeyword } from "@/components/PortaKeyword";
import { PortaSelezionate } from "@/components/PortaSelezionate";
import { RinominaInline } from "@/components/RinominaInline";
import { TestiAnnuncio } from "@/components/TestiAnnuncio";
import { estendiKeywordConAi } from "@/lib/azioni-estendi";
import { campagnePerDialogo } from "@/lib/campagne-dialogo";
import { attributiPortaKeyword } from "@/lib/porta-keyword";
import { giudicabilita, LIVELLI_CHE_PESANO } from "@/lib/guardrail";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { SceltaPeriodo } from "@/components/SceltaPeriodo";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Stagionalita } from "@/components/Stagionalita";
import { Sidebar } from "@/components/Sidebar";
import { cambiaStatoGruppo, cambiaStatoKeyword, creaOperazioneGruppo, creaOperazioneKeyword, annullaOperazioneParola, escludiParoleSelezionate, rinominaGruppo, vaiAlGruppo,
  impostaLinguaGruppo, applicaKeywordAdAltreCampagne,
} from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { periodoApp } from "@/lib/periodo-condiviso";
import { giudizioKeyword } from "@/lib/salute";
import {
  ETICHETTA_LINGUA,
  LINGUE_CAMPAGNA,
  lingueDa,
  linguaDaNome,
} from "@/lib/vendite-campagna";
import {
  COLORE_BRAND,
  ETICHETTA_BRAND,
  formattaData,
  formattaDataOra,
  formattaEuro,
  formattaNumero,
  testoKeywordGoogle,
  testoKeywordPulito,
  roas as calcolaRoas,
  STATI_KEYWORD,
  ETICHETTA_STATO_KEYWORD,
  ETICHETTA_OPERAZIONE,
  ETICHETTA_GIUDIZIO_GOOGLE,
  GIUDIZI_GOOGLE,
} from "@/lib/dominio";
import {
  COLORE_STATO_GRUPPO,
  ETICHETTA_STATO_GRUPPO,
  ETICHETTA_STATO_PIATTAFORMA,
  ETICHETTA_TIPO_GRUPPO,

  letturaRoas,
  nomeGruppo,
  STATI_GRUPPO,
} from "@/lib/gruppi";

export const dynamic = "force-dynamic";

// Scheda di un gruppo di annunci: gli stessi occhi della scheda campagna, un
// piano più sotto. Qui si vede se il gruppo si merita la spesa che si prende,
// e da qui si mette in pausa — passando dalla coda approvata, mai a mano.
export default async function SchedaGruppo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bloccata?: string; preset?: string; da?: string; a?: string; kw?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { bloccata } = sp;

  // Il periodo è quello condiviso di tutta l'app, come sulla scheda campagna.
  // Prima qui era inchiodato agli ultimi 30 giorni: su un gruppo fermo da
  // settimane quella finestra è VUOTA, e la scheda mostrava tutti zeri senza
  // dire che era una questione di date. Un gruppo con 761 giorni di storia
  // sembrava non aver mai speso niente.
  const periodo = await periodoApp(sp);

  const gruppo = await prisma.gruppo.findUnique({
    where: { id },
    include: {
      campagna: {
        select: {
          id: true, nome: true, brand: true, classe: true, stato: true,
          // Su Google il budget sta sulla CAMPAGNA, mai sul gruppo: senza
          // saperlo qui non si capisce di quanto si sta parlando.
          budgetGiornaliero: true, strategiaOfferta: true,
        },
      },
      // Tutte le metriche: il filtro sul periodo si fa qui sotto, e serve
      // conoscere anche l'ultimo giorno con dati per poterlo dire.
      metriche: { orderBy: { data: "desc" } },
      operazioni: { orderBy: { creataIl: "desc" }, take: 10 },
    },
  });
  if (!gruppo) notFound();

  const da = periodo.corrente.da;
  const nelPeriodo = gruppo.metriche.filter((m) => m.data >= periodo.corrente.da && m.data < periodo.corrente.a);
  // L'ultimo giorno in cui questo gruppo ha davvero speso: è la risposta alla
  // domanda «perché è tutto a zero?».
  const ultimoConDati = gruppo.metriche.find((m) => (m.spesa ?? 0) > 0)?.data ?? null;
  const spesa = nelPeriodo.reduce((s, m) => s + (m.spesa ?? 0), 0);
  const ricavi = nelPeriodo.reduce((s, m) => s + (m.ricavi ?? 0), 0);
  const conversioni = nelPeriodo.reduce((s, m) => s + (m.conversioni ?? 0), 0);
  const click = nelPeriodo.reduce((s, m) => s + (m.click ?? 0), 0);
  const r = calcolaRoas(ricavi, spesa);
  const lettura = letturaRoas(r, spesa, gruppo.brand);
  const inPausa = gruppo.statoPiattaforma === "PAUSED";
  const pmax = gruppo.tipo === "asset_group_pmax";

  // Quanto pesa dentro la sua campagna, nello stesso periodo
  const totaleCampagna = await prisma.metricaGruppo.aggregate({
    where: { data: { gte: da }, gruppo: { campagnaId: gruppo.campagnaId } },
    _sum: { spesa: true, ricavi: true },
  });
  const spesaCampagna = totaleCampagna._sum.spesa ?? 0;
  const quota = spesaCampagna > 0 ? spesa / spesaCampagna : null;

  // I fratelli: quanti gruppi attivi ha la campagna madre.
  // Serve a leggere il budget. Il budget giornaliero è della campagna, non del
  // gruppo: se i gruppi attivi sono più d'uno se lo dividono in base all'asta,
  // e nessuno sa quanto ne prende ciascuno. Se invece questo è l'UNICO attivo,
  // quel budget è di fatto suo — e allora la domanda «sto spendendo tutto
  // quello che potrei?» ha una risposta.
  // ⚠️ Serve a DUE cose, e per questo porta anche nome e stato: contare gli
  // attivi (per leggere il budget, qui sotto) e riempire la tendina in cima con
  // cui si salta da un gruppo all'altro senza risalire alla campagna.
  const fratelli = await prisma.gruppo.findMany({
    where: { campagnaId: gruppo.campagnaId },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, nomeVisibile: true, statoPiattaforma: true, stato: true },
  });
  const attivi = fratelli.filter((g) => g.statoPiattaforma !== "PAUSED" && g.statoPiattaforma !== "REMOVED");
  const unicoAttivo = attivi.length === 1 && attivi[0].id === gruppo.id;

  // Con un solo gruppo attivo si può dire quanto del budget viene consumato:
  // spesa media al giorno contro budget giornaliero della campagna.
  const budget = gruppo.campagna.budgetGiornaliero;
  const giorniConSpesa = nelPeriodo.filter((m) => (m.spesa ?? 0) > 0).length;
  const spesaMediaGiorno = giorniConSpesa > 0 ? spesa / giorniConSpesa : null;
  const usoBudget = unicoAttivo && budget && spesaMediaGiorno != null ? spesaMediaGiorno / budget : null;

  // Le keyword e i testi che vivono in questo gruppo: il campo `gruppo` di
  // CopyAnnuncio può elencarne più d'uno ("Gruppo A, Gruppo B"), quindi si
  // cerca per contenuto.
  const copy = await prisma.copyAnnuncio.findMany({
    where: { campagna: gruppo.campagna.nome, gruppo: { contains: gruppo.nome } },
    orderBy: [{ tipo: "asc" }, { spesa: "desc" }],
    take: 200,
  });
  // ⚠️ Il nome del gruppo sulla riga può essere stantio (Monitoraggio, righe
  // separate); l'id per criterio (`account:gruppo:criterio`, dal 10/08) dice
  // la casa VERA. Quando la riga ce l'ha, comanda lui: una riga con l'id di
  // un altro gruppo qui non c'entra, qualunque cosa dica il suo campo
  // `gruppo`. Le righe senza id completo (legacy) restano col nome.
  const prefissoGruppo = gruppo.idEsterno ? `${gruppo.idEsterno}:` : null;
  const keywordDelGruppo = copy.filter((c) => {
    if (c.tipo !== "keyword") return false;
    if (!prefissoGruppo) return true;
    const idCompleto = /^[\d-]+:\d+:\d+$/.test(c.idEsterno ?? "");
    return idCompleto ? c.idEsterno!.startsWith(prefissoGruppo) : true;
  });
  // Le defunte non si vedono mai più, come le campagne: stanno dietro la
  // pillola «Defunte», che compare solo se ce ne sono. Conteggi, finestra e
  // ultima lettura si calcolano sulle vive: una riga che non si guarda più
  // non deve nemmeno contare.
  const keywordDefunte = keywordDelGruppo.filter((c) => c.stato === "defunta");
  const keyword = keywordDelGruppo.filter((c) => c.stato !== "defunta");

  // La STORIA giorno per giorno delle keyword (lavoro `keyword-giorni`, dal
  // 10/08/2026): quando copre il periodo scelto, spesa/incasso/resa della
  // tabella LO SEGUONO — la fotografia a finestra fissa resta il ripiego per
  // i periodi che la storia non copre e per le righe senza id per criterio.
  const [storiaKeyword, coperturaStoria] = await Promise.all([
    prisma.metricaKeyword.groupBy({
      by: ["idEsterno"],
      where: {
        campagna: gruppo.campagna.nome,
        ...(prefissoGruppo ? { idEsterno: { startsWith: prefissoGruppo } } : {}),
        data: { gte: periodo.corrente.da, lt: periodo.corrente.a },
      },
      _sum: { spesa: true, ricavi: true, clic: true },
    }),
    prisma.metricaKeyword.aggregate({
      where: {
        campagna: gruppo.campagna.nome,
        ...(prefissoGruppo ? { idEsterno: { startsWith: prefissoGruppo } } : {}),
      },
      _min: { data: true },
      _max: { data: true },
    }),
  ]);
  const sommaPerId = new Map(storiaKeyword.map((s) => [s.idEsterno, s._sum]));
  const inizioStoria = coperturaStoria._min.data;
  const fineStoria = coperturaStoria._max.data;
  // «Copre» = i due intervalli si toccano: un periodo tutto prima dell'inizio
  // della storia non ha giorni da sommare, e fingere zeri sarebbe falso.
  const storiaCopre =
    inizioStoria != null &&
    fineStoria != null &&
    inizioStoria < periodo.corrente.a &&
    fineStoria >= periodo.corrente.da;

  // I numeri da mostrare per una riga: dal PERIODO quando si può, altrimenti
  // la fotografia (con la sua data, dichiarata sulla riga).
  const numeriDi = (k: (typeof keyword)[number]) => {
    if (storiaCopre && /^[\d-]+:\d+:\d+$/.test(k.idEsterno ?? "")) {
      const st = sommaPerId.get(k.idEsterno!);
      return {
        delPeriodo: true,
        spesa: st?.spesa ?? 0,
        incasso: st?.ricavi ?? 0,
        ordinabile: (st?.spesa ?? 0) as number | null,
      };
    }
    return {
      delPeriodo: false,
      spesa: k.spesa ?? 0,
      incasso: k.incasso ?? 0,
      ordinabile: (k.spesa ?? null) as number | null,
    };
  };

  // Le parole cercate davvero, quelle che hanno fatto scattare gli annunci.
  // Anche queste sono a finestra (dal/al scritti dallo script), non giornaliere.
  const termini = await prisma.termineRicerca.findMany({
    where: { campagnaId: gruppo.campagnaId, gruppo: { contains: gruppo.nome } },
    orderBy: [{ spesa: "desc" }, { clic: "desc" }],
    take: 60,
  });
  const conFinestra = termini.find((t) => t.dal && t.al);
  const finestraTermini = conFinestra?.dal && conFinestra?.al
    ? `${formattaData(conFinestra.dal)} – ${formattaData(conFinestra.al)}`
    : null;

  // La card «Ricerche» della colonna destra, come il widget di Google ma coi
  // numeri VERI: entrano SOLO le righe dell'ultima finestra consegnata dalla
  // diagnosi — è l'unico modo di mettere KPI reali su una card senza date per
  // riga. Le righe d'epoca restano nella tabella grande, con la loro
  // finestra. Ordinate per comparse, come ordina Google.
  const ultimaFinestraTermine = await prisma.termineRicerca.aggregate({
    where: { campagnaId: gruppo.campagnaId, gruppo: { contains: gruppo.nome } },
    _max: { al: true },
  });
  const alFresco = ultimaFinestraTermine._max.al;
  const ricercheFresche = alFresco
    ? await prisma.termineRicerca.findMany({
        where: {
          campagnaId: gruppo.campagnaId,
          gruppo: { contains: gruppo.nome },
          al: { gte: new Date(alFresco.getTime() - 2 * 86_400_000) },
        },
        orderBy: { impressioni: "desc" },
        take: 24,
      })
    : [];
  const dalFresco = ricercheFresche.reduce<Date | null>(
    (min, t) => (t.dal && (!min || t.dal < min) ? t.dal : min),
    null
  );

  // Quando è stata scattata la fotografia delle keyword: serve a dire che NON
  // seguono il periodo scelto in cima alla pagina.
  const ultimaLetturaKeyword = keyword.reduce<Date | null>(
    (max, k) => (k.metricheAl && (!max || k.metricheAl > max) ? k.metricheAl : max),
    null
  );
  // Su quanti giorni sono i numeri: lo dice il dato, non una costante.
  //
  // ⚠️ Qui c'era «30 giorni» scritto a mano, e sarebbe diventato falso al primo
  // giro con un `GIORNI_COPY` diverso — cioè al primo caricamento storico.
  // Se le righe non concordano si mostrano tutte le finestre presenti: un
  // archivio misto è un'informazione, non un dettaglio da nascondere dietro
  // un numero solo.
  const finestreKeyword = [
    ...new Set(keyword.map((k) => k.metricheGiorni).filter((g): g is number => g != null)),
  ].sort((a, b) => a - b);
  const testi = copy.filter((c) => c.tipo === "titolo" || c.tipo === "descrizione");

  // La lingua a cui parla il gruppo: prima il suo nome, poi quello della
  // campagna. Un gruppo "Fiori Milano ENG" parla inglese anche se sta in una
  // campagna senza lingua nel nome.
  const linguaDa = (testo: string): string | null => {
    const t = testo.toLowerCase();
    // I confini di parola non sono un dettaglio: senza di loro "en" aggancia
    // dentro "Consegna" e un gruppo italiano risulterebbe inglese.
    if (/\beng\b|\benglish\b|\ben\b/.test(t)) return "eng";
    if (/\bita\b|\bitalian\b|\bitaliano\b/.test(t)) return "ita";
    if (/\bfra?\b|\bfrench\b|\bfrancia\b|\bfrance\b/.test(t)) return "fra";
    if (/\besp?\b|\bspanish\b|\bspagnolo\b/.test(t)) return "spa";
    if (/\bde\b|\bger\b|\bgerman\b|\btedesco\b/.test(t)) return "ted";
    return null;
  };
  // La corrispondenza sta scritta nel testo della keyword, fra parentesi:
  // "fiori milano (phrase)". È così che l'import la conserva, perché il
  // Monitoraggio e Google la scrivono in modi diversi e il testo le riconcilia.
  const matchDi = (testo: string): string | null => {
    const m = testo.match(/\((exact|phrase|broad|esatta|frase|generica)\)\s*$/i);
    if (!m) return null;
    const v = m[1].toLowerCase();
    if (v === "esatta") return "exact";
    if (v === "frase") return "phrase";
    if (v === "generica") return "broad";
    return v;
  };
  const ETICHETTA_MATCH_KW: Record<string, string> = {
    exact: "esatta",
    phrase: "a frase",
    broad: "generica",
  };

  const codiceGruppo = linguaDa(gruppo.nome);
  const codiceCampagna = linguaDa(gruppo.campagna.nome);
  const lingua = codiceGruppo
    ? { codice: codiceGruppo, da: "dal nome del gruppo" }
    : codiceCampagna
      ? { codice: codiceCampagna, da: "ereditata dalla campagna" }
      : null;

  // Le operazioni già decise su questa campagna, indicizzate per parola: la
  // tabella deve poter dire «su questa hai già deciso», altrimenti la si
  // riaccoda una seconda volta senza accorgersene.
  const opCampagna = await prisma.operazioneAdv.findMany({
    where: {
      campagnaId: gruppo.campagnaId,
      tipo: { in: ["negativa", "pausa_keyword", "attiva_keyword", "nuova_keyword"] },
    },
    orderBy: { creataIl: "desc" },
    take: 300,
  });
  const azioniPerParola = new Map<string, { tipo: string; stato: string; creataIl: Date }>();
  for (const o of opCampagna) {
    let parola = "";
    try {
      parola = String(JSON.parse(o.parametri ?? "{}").testo ?? "");
    } catch {
      parola = "";
    }
    const chiave = (parola || o.bersaglio).toLowerCase().replace(/\s*\((exact|phrase|broad)\)\s*$/i, "").trim();
    // La più recente vince: è quella che descrive lo stato attuale della coda
    if (chiave && !azioniPerParola.has(chiave)) {
      azioniPerParola.set(chiave, { tipo: o.tipo, stato: o.stato, creataIl: o.creataIl });
    }
  }
  const azioneDi = (testo: string) =>
    azioniPerParola.get(testo.toLowerCase().replace(/\s*\((exact|phrase|broad)\)\s*$/i, "").trim()) ?? null;

  // Filtro delle keyword per stato: su gruppi con centinaia di parole,
  // guardarle tutte insieme non serve a niente. "attive" è il caso comune.
  const filtroKw = sp.kw ?? "tutte";
  const keywordMostrate = (filtroKw === "defunte" ? keywordDefunte : keyword).filter((k) => {
    if (filtroKw === "tutte" || filtroKw === "defunte") return true;
    if (filtroKw === "attive") return k.statoPiattaforma !== "PAUSED";
    if (filtroKw === "in_pausa") return k.statoPiattaforma === "PAUSED";
    if (filtroKw === "spendono") return numeriDi(k).spesa > 0;
    if (filtroKw === "a_vuoto") return numeriDi(k).spesa >= 20 && numeriDi(k).incasso === 0;
    if (filtroKw === "decise") return azioneDi(k.testo) != null;
    return true;
  })
    // ⚠️ Ordine di partenza: per SPESA, dalla più ALTA (deciso dall'utente
    // l'08/08/2026). Per un giorno era stato il contrario — le parole che
    // spendono poco in cima, perché è lì che si taglia — ma la tabella si apre
    // su quello che costa: i soldi che escono si guardano prima di quelli che
    // non escono, e le parole da tagliare si trovano col filtro «spendono a
    // vuoto», che esiste apposta.
    //
    // I vuoti restano in fondo in ogni caso: «nessun dato» non è né il massimo
    // né il minimo, e in cima riempirebbe lo schermo di trattini (337 righe su
    // 491 senza numeri, misurato il 07/08). È la stessa regola del riordino a
    // click in TabelleOrdinabili.
    .slice()
    .sort((a, b) => {
      const sa = numeriDi(a).ordinabile;
      const sb = numeriDi(b).ordinabile;
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1; // «nessun dato» in fondo, sempre
      if (sb == null) return -1;
      return sb - sa;
    });

  const operazioneAperta = gruppo.operazioni.find((o) => o.stato === "in_attesa" || o.stato === "approvata");

  // Le lingue dichiarate dalla campagna: servono solo come ripiego per dedurre
  // quella del gruppo quando il nome del gruppo non la dice.
  const legameCampagna = await prisma.legameCampagnaShopify.findUnique({
    where: { campagnaId: gruppo.campagnaId },
    select: { lingua: true },
  });

  // Il blackout si sa PRIMA di premere: mettere in coda un'operazione che il
  // guardrail rifiuterà di sicuro è un giro a vuoto, e chi lo fa lo scopre da
  // un messaggio dopo il redirect. Le L0 non contano (vedi MODIFICHE_CHE_PESANO).
  const ultimaChePesa = await prisma.modifica.findFirst({
    where: { campagnaId: gruppo.campagnaId, livello: { in: LIVELLI_CHE_PESANO } },
    orderBy: { eseguitaIl: "desc" },
    select: { eseguitaIl: true, descrizione: true },
  });
  const giud = giudicabilita(ultimaChePesa?.eseguitaIl ?? null);

  // La lingua dedotta, usata solo quando nessuno l'ha scelta: prima il nome del
  // GRUPPO («Regali Inglese»), poi quello della campagna. Se la campagna ne
  // dichiara due la deduzione tace — indovinare fra due dichiarate è peggio che
  // non dire niente.
  const lingueDellaCampagna = lingueDa(legameCampagna?.lingua ?? null);
  const linguaDedotta =
    linguaDaNome(gruppo.nome) ??
    (lingueDellaCampagna.length === 1 ? lingueDellaCampagna[0] : null);

  // «Porta altrove» ed «Estendi con AI», le stesse logiche della scheda
  // campagna: le campagne di destinazione per il dialogo, chi ha GIÀ ogni
  // parola (saputo prima di premere), e le lingue per l'avviso di lingua.
  const campagneDialogo = await campagnePerDialogo();
  const tutteLeKeyword = await prisma.copyAnnuncio.findMany({
    where: { tipo: "keyword" },
    select: { testo: true, campagna: true },
  });
  const campagneDiParola = new Map<string, Set<string>>();
  for (const k of tutteLeKeyword) {
    const chiave = testoKeywordPulito(k.testo).toLowerCase();
    const v = campagneDiParola.get(chiave) ?? new Set<string>();
    v.add(k.campagna);
    campagneDiParola.set(chiave, v);
  }
  const giaSuDi = (testo: string) => [
    ...(campagneDiParola.get(testoKeywordPulito(testo).toLowerCase()) ?? new Set<string>()),
  ];
  const lingueQui = linguaDedotta ? [linguaDedotta] : lingueDellaCampagna;

  return (
    <div className="layout">
      <Sidebar attiva="gruppi" brandAttivo={gruppo.brand} />
      <main className="main">
        {/* Si arriva quasi sempre da una campagna, non dall elenco: tornare
            all elenco fa ripartire la ricerca da capo. La campagna madre e il
            ritorno naturale, l elenco resta a fianco. */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <a className="ritorno" href={`/campagne/${gruppo.campagnaId}`}>← {gruppo.campagna.nome}</a>
          <a className="ritorno" href="/gruppi" style={{ opacity: .7, marginLeft: "auto" }}>
            Tutti i gruppi
          </a>
        </div>
        <div className="page-head">
          <div>
            {/* La matita è FUORI dall'<h1>, non dentro: il componente si porta
                dietro il suo <dialog>, e un dialog dentro un titolo è HTML
                non valido — il titolo finiva per "contenere" tutto il testo
                del modulo, compreso quello che legge uno screen reader. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 className="page-title">{nomeGruppo(gruppo)}</h1>
              {/* Saltare da un gruppo all'altro della stessa campagna senza
                  risalire e ridiscendere. Sta accanto al titolo perché è quello
                  che si sta cambiando: il titolo È il gruppo.
                  Il colore è quello dello stato SU GOOGLE, non del giudizio
                  dell'app: nella tendina si sceglie dove andare, e sapere quali
                  girano e quali no è metà della scelta. */}
              {fratelli.length > 1 && (
                <form action={vaiAlGruppo}>
                  <SelettoreStato
                    nome="id"
                    valore={gruppo.id}
                    colore={inPausa ? "var(--orange)" : "var(--green)"}
                    opzioni={fratelli.map((f) => ({
                      valore: f.id,
                      etichetta:
                        nomeGruppo(f) +
                        (f.stato === "defunto"
                          ? " · defunto"
                          : f.statoPiattaforma === "PAUSED"
                            ? " · in pausa"
                            : ""),
                    }))}
                  />
                </form>
              )}
              <RinominaInline
                id={gruppo.id}
                nomeVisibile={gruppo.nomeVisibile}
                nomeDiPiattaforma={gruppo.nome}
                cosa="il gruppo"
                azione={rinominaGruppo}
              />
            </div>
            {/* ⚠️ <div>, non <p>: più sotto c'è un <form> (il selettore di
                stato), e un form dentro un paragrafo è HTML non valido — il
                browser chiude il <p> da solo e React fallisce l'idratazione,
                ririsegnando la pagina. Qui si vedeva sulla tabella delle
                keyword: gli ascoltatori dell'ordinamento restavano agganciati
                a nodi buttati via e cliccare l'intestazione non faceva niente. */}
            <div className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {/* Quando il nome è nostro, quello di Google resta a vista: è
                  quello da cercare nell'interfaccia di Google Ads, e senza si
                  perderebbe l'unico modo di ritrovare il gruppo di là. */}
              {gruppo.nomeVisibile && (
                <span className="tag-neutro" title="Il nome che ha su Google Ads">
                  su Google: {gruppo.nome}
                </span>
              )}
              <a href={`/campagne/${gruppo.campagnaId}`}>{gruppo.campagna.nome}</a>
              <Badge testo={ETICHETTA_BRAND[gruppo.brand] ?? gruppo.brand} colore={COLORE_BRAND[gruppo.brand] ?? "var(--text-tertiary)"} />
              {gruppo.tipo && <span className="tag-neutro">{ETICHETTA_TIPO_GRUPPO[gruppo.tipo] ?? gruppo.tipo}</span>}
              {/* Lo stato di Google sta sempre in testa, non solo quando è un
                  problema: quello è il fatto, il giudizio dell'app è un'altra
                  cosa e sta nel suo riquadro più sotto. */}
              <Badge
                testo={
                  ETICHETTA_STATO_PIATTAFORMA[gruppo.statoPiattaforma?.toUpperCase() ?? ""] ??
                  "stato su Google non ancora letto"
                }
                colore={
                  inPausa
                    ? "var(--orange)"
                    : gruppo.statoPiattaforma === "ENABLED"
                      ? "var(--green)"
                      : "var(--text-tertiary)"
                }
              />
              {/* Il giudizio dell'app accanto al fatto di Google: sono due
                  cose diverse e si leggono bene solo una di fianco all'altra.
                  Prima il fatto stava qui in cima e il giudizio in fondo alla
                  colonna destra, e per confrontarli si scorreva la pagina. */}
              {/* ⚠️ La lingua VERA sta qui, non sulla campagna: è a questo
                  livello che gli annunci sono scritti, e quindi l'unico a cui
                  la domanda ha una risposta secca. La campagna può dichiararne
                  due (serve due pubblici); il gruppo ne parla una.
                  Se non è stata scelta si mostra quella DEDOTTA, dicendo che è
                  dedotta: un valore indovinato che si presenta come deciso è
                  peggio di un campo vuoto. */}
              <span className="stato-app-inline">
                <span className="stato-app-etichetta">lingua</span>
                <form action={impostaLinguaGruppo.bind(null, gruppo.id)}>
                  <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                  <SelettoreStato
                    nome="lingua"
                    valore={gruppo.lingua ?? ""}
                    opzioni={[
                      {
                        valore: "",
                        etichetta: linguaDedotta
                          ? `${ETICHETTA_LINGUA[linguaDedotta] ?? linguaDedotta} — dedotta`
                          : "non dichiarata",
                      },
                      ...LINGUE_CAMPAGNA.map((l) => ({ valore: l, etichetta: ETICHETTA_LINGUA[l] })),
                    ]}
                  />
                </form>
              </span>
              <span className="stato-app-inline">
                <span className="stato-app-etichetta">nell&apos;app</span>
                <form action={cambiaStatoGruppo}>
                  <input type="hidden" name="id" value={gruppo.id} />
                  <SelettoreStato
                    valore={gruppo.stato}
                    colore={COLORE_STATO_GRUPPO[gruppo.stato]}
                    opzioni={STATI_GRUPPO.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO_GRUPPO[s] }))}
                  />
                </form>
              </span>
            </div>
          </div>
          {/* Fermare il gruppo è la cosa che si viene a fare qui: sta accanto
              al titolo, non in fondo alla colonna destra. Quando non si può,
              al posto del bottone c'è il motivo — un bottone che non funziona
              è peggio di nessun bottone. */}
          {/* In COLONNA: la nota del blackout sta sotto il bottone, non di
              fianco. Di fianco allargava la testata e spingeva il bottone
              verso il centro, e la nota si leggeva come un'etichetta del
              bottone invece che come quello che è — un avviso su quando i
              risultati torneranno leggibili. */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {pmax ? (
              <span className="cella-sub" style={{ maxWidth: 260, whiteSpace: "normal" }}>
                I gruppi di asset delle Performance Max non si fermano da script: si gestiscono
                in Google Ads.
              </span>
            ) : operazioneAperta ? (
              <a className="btn small btn-secondario" href="/operazioni">
                {operazioneAperta.stato === "approvata"
                  ? "Già in coda, approvata"
                  : "Già in coda, da approvare"}
              </a>
            ) : (
              <>
                <AzioneGruppo gruppoId={gruppo.id} inPausa={inPausa} azione={creaOperazioneGruppo} />
                {/* Non è più un divieto: è un'informazione. Si può fare, e si
                    fa sapendo che i risultati saranno difficili da leggere. */}
                {giud.stato === "blackout" && giud.fino && (
                  <span
                    className="tag-neutro"
                    style={{ color: "var(--orange)", whiteSpace: "normal" }}
                    title={ultimaChePesa?.descrizione ?? undefined}
                  >
                    già toccata di recente · giudicabile dal {formattaDataOra(giud.fino)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* ⚠️ L'avviso stava SOTTO il selettore del periodo. Chi premeva il
            bottone in cima leggeva «non è successo niente»: l'operazione era
            stata bloccata e il motivo compariva a due schermate di distanza
            da dove aveva cliccato. Il messaggio di un'azione va dove si è
            fatta l'azione. */}
        {bloccata && (
          <div className="avviso-errore">
            <strong>Bloccata dal change control:</strong> {bloccata}
          </div>
        )}

        <SceltaPeriodo periodo={periodo} da={sp.da} a={sp.a} azione={`/gruppi/${gruppo.id}`} />

        {/* Zero speso in un periodo non vuol dire zero speso mai. Senza questa
            riga la scheda di un gruppo fermo è indistinguibile da quella di un
            gruppo che non ha mai funzionato — e la differenza è tutta. */}
        {nelPeriodo.length === 0 && (
          <div className="nota-info">
            <span className="nota-icona">📅</span>
            <span>
              <b>In questo periodo il gruppo non ha dati.</b>{" "}
              {ultimoConDati ? (
                <>
                  L&apos;ultimo giorno in cui ha speso è il <b>{formattaData(ultimoConDati)}</b>: i numeri
                  qui sotto sono a zero per le date scelte, non perché il gruppo non abbia mai lavorato
                  (ne ha {formattaNumero(gruppo.metriche.length)} giorni in archivio). Allarga il periodo
                  qui sopra per vederli.
                </>
              ) : (
                <>Non risulta spesa in nessun giorno: questo gruppo non ha mai erogato.</>
              )}
            </span>
          </div>
        )}


        {/* Lo stato nell'app dice "in pausa" ma su Google gira ancora: è la
            situazione che genera la domanda «e adesso come lo fermo davvero?».
            L'avviso la anticipa e porta dritto al posto giusto. */}
        {gruppo.stato === "in_pausa" && !inPausa && !operazioneAperta && (
          <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
            <span>
              <b>Nell&apos;app è in pausa, su Google sta ancora girando</b> — e continua a spendere.
              Lo stato qui è il tuo giudizio di lavoro: non tocca Google, apposta. Per fermarlo
              davvero usa <b>Agire su Google</b> qui sotto: mette l&apos;operazione in coda, tu la
              approvi in <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a> e la
              esegue lo script alla corsa successiva.
            </span>
          </div>
        )}
        {gruppo.stato === "in_pausa" && !inPausa && operazioneAperta && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>La pausa è già in coda</b> ({operazioneAperta.stato === "in_attesa" ? "da approvare" : "approvata, aspetta lo script"}).
              Su Google il gruppo gira ancora finché lo script non passa.
              {operazioneAperta.stato === "in_attesa" && (
                <> Vai a <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a> per approvarla.</>
              )}
            </span>
          </div>
        )}

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(spesa)}</div>
            <div className="kpi-etichetta">
              Spesa nel periodo{quota != null ? ` · ${Math.round(quota * 100)}% della campagna` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(ricavi)}</div>
            <div className="kpi-etichetta">Ricavi attribuiti</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaNumero(Math.round(conversioni * 10) / 10)}</div>
            <div className="kpi-etichetta">
              Conversioni{conversioni > 0 ? ` · CPA ${formattaEuro(spesa / conversioni)}` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaNumero(click)}</div>
            <div className="kpi-etichetta">Click</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ color: lettura.colore }}>{lettura.testo}</div>
            <div className="kpi-etichetta">ROAS · {lettura.spiega}</div>
          </div>
          {/* Il budget è della campagna, non del gruppo: qui si dice di chi è
              e se questo gruppo se lo prende tutto. */}
          <div className="kpi">
            <div className="kpi-valore">{budget != null ? `${formattaEuro(budget)}/g` : "—"}</div>
            <div className="kpi-etichetta">
              Budget della campagna
              {unicoAttivo
                ? " · tutto suo: è l'unico gruppo attivo"
                : attivi.length > 1
                  ? ` · diviso con altri ${attivi.length - 1} gruppi attivi`
                  : ""}
            </div>
          </div>
        </div>

        {/* Il flag che l'utente ha chiesto: cambia come si legge tutto il resto */}
        {unicoAttivo ? (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>È l&apos;unico gruppo attivo della campagna.</b> Il budget giornaliero di{" "}
              <a href={`/campagne/${gruppo.campagnaId}`} style={{ color: "var(--blue)" }}>{gruppo.campagna.nome}</a>
              {budget != null ? <> — <b>{formattaEuro(budget)}</b> — </> : " "}
              va tutto qui, quindi spesa del gruppo e spesa della campagna coincidono
              {usoBudget != null && (
                <>
                  : nei giorni in cui ha speso ne ha usato in media il{" "}
                  <b style={{ color: usoBudget >= 0.9 ? "var(--orange)" : undefined }}>{Math.round(usoBudget * 100)}%</b>
                  {usoBudget >= 0.9
                    ? " — è al tetto, e con un budget più alto probabilmente spenderebbe di più"
                    : usoBudget < 0.5
                      ? " — resta larga metà del budget: non è il budget a frenarlo"
                      : ""}
                </>
              )}
              . Mettere in pausa questo gruppo ferma la campagna.
            </span>
          </div>
        ) : attivi.length > 1 ? (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              La campagna ha <b>{attivi.length} gruppi attivi</b> che si dividono lo stesso budget
              {budget != null ? <> di <b>{formattaEuro(budget)}</b> al giorno</> : ""}: quanto ne
              prenda ciascuno lo decide l&apos;asta, non una ripartizione fissa. Qui sopra la quota
              vera, misurata sulla spesa. Gli altri attivi:{" "}
              {attivi
                .filter((g) => g.id !== gruppo.id)
                .map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && " · "}
                    <a href={`/gruppi/${g.id}`} style={{ color: "var(--blue)" }}>{g.nomeVisibile ?? g.nome}</a>
                  </span>
                ))}
              .
            </span>
          </div>
        ) : null}

        <div className="due-colonne">
          <div>
            {/* Stagionalità, andamento e metriche per mese sono SCESI nella
                colonna destra (10/08, deciso dall'utente): la sinistra parte
                dal lavoro operativo — keyword, parole cercate, annunci. */}
            {keyword.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Keyword del gruppo ({keyword.length})</div>

                {/* Questi numeri NON seguono il periodo scelto in cima, e va
                    detto prima della tabella: chi guarda "anno" e legge una
                    spesa di 30 giorni sbaglia di un ordine di grandezza. */}
                <div className="nota-info" style={{ marginBottom: 12 }}>
                  <span className="nota-icona">◈</span>
                  {/* Tre verità possibili, e la nota dice quella giusta: la
                      storia giornaliera copre il periodo (i numeri lo
                      seguono), lo copre solo in parte (lo seguono ma mancano
                      i giorni prima dell'inizio della raccolta), o non c'è
                      (resta la fotografia a finestra fissa). */}
                  {storiaCopre ? (
                    <span>
                      <b>Spesa, incasso e resa seguono il periodo scelto</b>: dal 10/08/2026 lo
                      script manda la storia giorno per giorno delle keyword
                      {inizioStoria && inizioStoria > periodo.corrente.da && (
                        <>
                          {" "}— ma la storia raccolta <b>parte dal {formattaData(inizioStoria)}</b>:
                          i giorni del periodo precedenti a quella data non esistono nell&apos;archivio
                          e non entrano nelle somme (per averli serve un giro con
                          <code> GIORNI_INDIETRO</code> più alto, una volta sola)
                        </>
                      )}
                      . QS, stati e giudizi del Monitoraggio restano l&apos;ultima fotografia; le righe
                      senza id per criterio mostrano ancora la fotografia con la sua data.
                    </span>
                  ) : (
                  <span>
                    <b>Questi numeri non seguono il periodo scelto.</b> Le keyword non hanno una
                    storia giorno per giorno{inizioStoria ? (
                      <> in questo periodo (la storia raccolta parte dal <b>{formattaData(inizioStoria)}</b>)</>
                    ) : null}: l&apos;app conserva l&apos;ultima fotografia mandata dallo
                    script, che copre una <b>finestra fissa</b>
                    {finestreKeyword.length === 1 ? (
                      // Le DATE, non solo «30 giorni»: la finestra include il
                      // giorno del giro, quindi anche OGGI se lo script è
                      // appena passato — ed è il giorno che la vista standard
                      // di Google Ads non mostra. Senza le date, 412 € qui
                      // contro 389 € di là sembrano un errore di sync
                      // (successo davvero, 10/08).
                      <>
                        {" "}di <b>{finestreKeyword[0]} giorni</b>
                        {ultimaLetturaKeyword && (
                          <>
                            {" "}— qui{" "}
                            <b>
                              {formattaData(new Date(ultimaLetturaKeyword.getTime() - finestreKeyword[0] * 86_400_000))}{" "}
                              → {formattaData(ultimaLetturaKeyword)}
                            </b>
                            , il giorno del giro compreso: per confrontare con Google Ads porta
                            anche là la finestra fino a quel giorno
                          </>
                        )}
                      </>
                    ) : finestreKeyword.length > 1 ? (
                      <>
                        {" "}che qui <b>non è la stessa per tutte le righe</b> — ce ne sono di{" "}
                        <b>{finestreKeyword.join(", ")} giorni</b>: i numeri di righe diverse non
                        si possono confrontare fra loro
                      </>
                    ) : (
                      <> che lo script non ha dichiarato</>
                    )}
                    {ultimaLetturaKeyword && finestreKeyword.length !== 1 && (
                      <> ed è aggiornata al <b>{formattaData(ultimaLetturaKeyword)}</b></>
                    )}.
                    Le metriche di gruppo qui sopra, invece, sono giornaliere e seguono il periodo.
                  </span>
                  )}
                </div>


              {/* Il filtro: su gruppi con centinaia di parole guardarle tutte
                  insieme non serve. Sta nell'indirizzo, quindi il filtro scelto
                  sopravvive al salvataggio di un'operazione e al tasto indietro. */}
              <div className="pill-scelta" style={{ marginBottom: 12 }}>
                {[
                  ["tutte", `Tutte (${keyword.length})`],
                  ["attive", "Solo attive"],
                  ["in_pausa", "In pausa"],
                  ["spendono", "Che spendono"],
                  ["a_vuoto", "Spendono a vuoto"],
                  ["decise", "Con azione decisa"],
                  ...(keywordDefunte.length > 0 ? [["defunte", `Defunte (${keywordDefunte.length})`]] : []),
                ].map(([chiave, etichetta]) => (
                  <a
                    key={chiave}
                    className={`pill-opt${filtroKw === chiave ? " attuale" : ""}`}
                    href={`/gruppi/${gruppo.id}?kw=${chiave}`}
                  >
                    {etichetta}
                  </a>
                ))}
              </div>

              {/* Il form vive FUORI dalla tabella: le caselle dentro le righe lo
                  raggiungono con l'attributo form=. Nidificare un form dentro le
                  celle — dove ci sono già quelli di pausa e riattiva — non si può,
                  e il browser scarterebbe silenziosamente l'uno o l'altro. */}
              <form
                id="escludi-kw"
                action={escludiParoleSelezionate}
                className="barra-multipla"
              >
                <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                <span className="cella-sub">
                  Spunta le parole che non c&apos;entrano e mettile in coda tutte insieme:
                </span>
                {/* La corrispondenza decide QUANTO blocca la negativa, ed è la
                    differenza fra togliere una ricerca e spegnere una campagna.
                    Default esatta: si esclude quella ricerca, non tutto ciò che
                    le somiglia. */}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  come
                  <select name="corrispondenza" defaultValue="exact" style={{ font: "inherit", padding: "4px 8px", borderRadius: 8, border: "1px solid var(--hairline-strong)" }}>
                    <option value="exact">esatta — solo questa ricerca</option>
                    <option value="phrase">a frase — questa sequenza di parole</option>
                    <option value="broad">generica — ogni ricerca con queste parole</option>
                  </select>
                </label>
                <button className="btn small btn-secondario" type="submit">
                  Escludi le selezionate
                </button>
                <PortaSelezionate formId="escludi-kw" lingue={lingueQui} />
                {/* Apre il dialogo AI leggendo le spuntate di QUESTO form; il
                    gruppo di default è questo. */}
                <button
                  type="button"
                  className="btn small fantasma"
                  data-estendi-ai
                  data-estendi-form="escludi-kw"
                  data-estendi-gruppo={gruppo.nome}
                >
                  Estendi con AI
                </button>
              </form>
                <div style={{ overflowX: "auto" }}>
                  {/* La tabella arriva già ordinata per spesa decrescente (vedi
                      `keywordMostrate`), ma finché non lo DICEVA sembrava non
                      ordinata: la colonna non aveva la freccia, e il primo
                      click su Spesa rifaceva lo stesso ordine invece di
                      rovesciarlo. Qui si dichiara com'è ordinata; il resto lo
                      fa TabelleOrdinabili, senza riordinare di nuovo.
                      ⚠️ Questo `verso` deve seguire il `.sort()` di sopra: se
                      dicesse il contrario, il primo click non rovescerebbe
                      niente e la tabella sembrerebbe di nuovo rotta. */}
                  <table data-ordinata-per="Spesa" data-ordinata-verso="desc">
                    <thead>
                      <tr>
                        <th data-no-ordina></th>
                        <th>Keyword</th>
                        <th>Stato</th>
                        <th className="num">Spesa</th>
                        <th className="num">Incasso</th>
                        {/* Il ritorno di ogni parola: incasso ÷ spesa, letto
                            sul break-even del brand. Spesa e incasso da soli
                            costringono a fare la divisione a mente riga per
                            riga, ed è la divisione che decide. */}
                        <th className="num">Resa</th>
                        <th className="num">QS</th>
                        <th>Azione decisa</th>
                        <th>Su Google</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keywordMostrate.map((k) => {
                        const inPausaGoogle = k.statoPiattaforma === "PAUSED";
                        // I numeri della riga: dal periodo quando la storia
                        // giornaliera lo copre, altrimenti la fotografia.
                        const n = numeriDi(k);
                        // Il giudizio e lo stesso della pagina Keywords: una
                        // parola che spende senza rendere si vede in rosso da
                        // qui, senza doverla cercare altrove.
                        const g = giudizioKeyword(n.incasso, n.spesa);
                        const az = azioneDi(k.testo);
                        return (
                          <tr key={k.id}>
                            <td>
                              <input
                                type="checkbox"
                                name="scelte"
                                value={k.testo}
                                form="escludi-kw"
                                aria-label={`Seleziona ${k.testo}`}
                              />
                            </td>
                            <td>
                              <div className="cella-nome" style={g.colore === "var(--red)" ? { color: "var(--red)" } : undefined} title={g.spiega}>
                                {g.colore === "var(--red)" && <span aria-hidden="true">● </span>}
                                {testoKeywordGoogle(k.testo)}
                              </div>
                              <div className="cella-sub" style={{ color: g.colore }}>{g.etichetta}</div>
                              {k.gruppo && k.gruppo !== gruppo.nome && (
                                <div className="cella-sub">anche in: {k.gruppo}</div>
                              )}
                            </td>
                            <td>
                              {/* Lo stato deciso qui: è una nostra etichetta di
                                  lavoro, non tocca Google. */}
                              <form action={cambiaStatoKeyword}>
                                <input type="hidden" name="id" value={k.id} />
                                <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                                <SelettoreStato
                                  valore={k.stato}
                                  opzioni={STATI_KEYWORD.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO_KEYWORD[s] ?? s }))}
                                />
                              </form>
                            </td>
                            <td className="num">
                              {formattaEuro(n.spesa)}
                              {/* ⚠️ Numeri d'epoca accanto a uno stato fresco,
                                  senza data: così 140 € qui contro 0 € su
                                  Google sembravano un errore di sync (successo
                                  il 10/08 su «pasticceria a domicilio», ferma
                                  da prima della finestra). Una keyword in
                                  pausa non produce numeri nuovi: i suoi sono
                                  l'ultima fotografia in cui girava, e la data
                                  va detta sulla riga. Quando invece i numeri
                                  sono del periodo, la data non serve. */}
                              {!n.delPeriodo &&
                                k.metricheAl &&
                                ultimaLetturaKeyword &&
                                ultimaLetturaKeyword.getTime() - k.metricheAl.getTime() > 2 * 86_400_000 && (
                                  <div
                                    className="cella-sub"
                                    style={{ whiteSpace: "normal" }}
                                    title="Da allora questa parola non ha più prodotto numeri (di solito perché è ferma): su Google, nella finestra recente, la vedrai a zero"
                                  >
                                    numeri al {formattaData(k.metricheAl)}
                                  </div>
                                )}
                            </td>
                            <td className="num">{formattaEuro(n.incasso)}</td>
                            <td
                              className="num"
                              style={{ color: g.colore, fontWeight: 600 }}
                              title={g.spiega}
                            >
                              {n.spesa > 0 ? `${(n.incasso / n.spesa).toFixed(2)}×` : "—"}
                            </td>
                            <td className="num cella-muta">{k.punteggioQualita ?? "—"}</td>
                            <td>
                              {az ? (
                                <span
                                  className="tag-salute"
                                  style={{ color: az.stato === "eseguita" ? "var(--green)" : az.stato === "in_attesa" ? "var(--orange)" : "var(--text-tertiary)" }}
                                  title={`${ETICHETTA_OPERAZIONE[az.tipo] ?? az.tipo} · ${formattaDataOra(az.creataIl)}`}
                                >
                                  <span className="dot" />
                                  {ETICHETTA_OPERAZIONE[az.tipo] ?? az.tipo}
                                  {az.stato === "in_attesa" ? " (da approvare)" : ""}
                                </span>
                              ) : (
                                <span className="cella-muta">—</span>
                              )}
                            </td>
                            <td>
                              {/* Questo invece cambia Google davvero, quindi
                                  passa dalla coda: mette in attesa, non esegue. */}
                              {/* Se su questa parola c'è già un'operazione
                                  APERTA, l'unica cosa sensata è annullarla:
                                  riproporre lo stesso bottone creava doppioni
                                  in coda. Una volta eseguita non si annulla
                                  più — si fa l'operazione opposta. */}
                              {az && (az.stato === "in_attesa" || az.stato === "approvata") ? (
                                <form action={annullaOperazioneParola} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                                  <input type="hidden" name="testo" value={k.testo} />
                                  <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}?kw=${filtroKw}`} />
                                  <span className="tag-salute" style={{ color: "var(--ardesia)" }}>
                                    <span className="dot" />
                                    {ETICHETTA_OPERAZIONE[az.tipo] ?? az.tipo}
                                    {az.stato === "in_attesa" ? " · da approvare" : " · approvata"}
                                  </span>
                                  <button className="btn small btn-secondario" type="submit" title="Toglie l'operazione dalla coda: su Google non cambia niente perché non è ancora stata eseguita">
                                    Annulla
                                  </button>
                                </form>
                              ) : (
                                <>
                                  <form action={creaOperazioneKeyword} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                                    <input type="hidden" name="testo" value={k.testo} />
                                    <input type="hidden" name="gruppo" value={gruppo.nome} />
                                    <input type="hidden" name="idEsternoKeyword" value={k.idEsterno ?? ""} />
                                    <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}?kw=${filtroKw}`} />
                                    <input type="hidden" name="tipo" value={inPausaGoogle ? "attiva_keyword" : "pausa_keyword"} />
                                    <span className="tag-salute" style={{ color: inPausaGoogle ? "var(--ardesia)" : "var(--green)" }}>
                                      <span className="dot" />
                                      {inPausaGoogle ? "in pausa" : "attiva"}
                                    </span>
                                    <button className="btn small btn-secondario" type="submit">
                                      {inPausaGoogle ? "Riattiva" : "Metti in pausa"}
                                    </button>
                                  </form>
                                  <form action={creaOperazioneKeyword} style={{ marginTop: 6 }}>
                                    <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                                    <input type="hidden" name="testo" value={k.testo} />
                                    <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}?kw=${filtroKw}`} />
                                    <input type="hidden" name="tipo" value="negativa" />
                                    {/* La corrispondenza con cui questa parola è
                                        stata comprata: la negativa la eredita,
                                        così esclude esattamente quello che la
                                        keyword stava intercettando. */}
                                    <input type="hidden" name="corrispondenzaOrigine" value={matchDi(k.testo) ?? "exact"} />
                                    <button className="btn small btn-secondario" type="submit" title={`Esclude come negativa ${ETICHETTA_MATCH_KW[matchDi(k.testo) ?? "exact"]}: non farà più scattare gli annunci di questa campagna`}>
                                      Escludi
                                    </button>
                                  </form>
                                </>
                              )}
                              {/* Le stesse logiche della scheda campagna,
                                  parola per parola: si porta altrove (stesso
                                  dialogo unico della pagina) o si estende con
                                  l'AI partendo da QUESTA, col gruppo e la
                                  corrispondenza già impostati su questa. */}
                              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                <button
                                  type="button"
                                  className="btn small fantasma"
                                  {...attributiPortaKeyword({
                                    testo: k.testo,
                                    corrispondenza: matchDi(k.testo) ?? "exact",
                                    giaSu: giaSuDi(k.testo),
                                    classificata: true,
                                    lingueDiOra: lingueQui,
                                  })}
                                >
                                  Porta altrove
                                </button>
                                <button
                                  type="button"
                                  className="btn small fantasma"
                                  data-estendi-ai
                                  data-estendi-seme={k.testo}
                                  data-estendi-gruppo={gruppo.nome}
                                  data-estendi-corrispondenza={matchDi(k.testo) ?? "exact"}
                                  title="L'AI propone parole correlate a questa, da mettere in coda dopo averle guardate"
                                >
                                  Estendi con AI
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="cella-sub" style={{ marginTop: 8 }}>
                  «Riattiva» e «Metti in pausa» non toccano Google adesso: mettono l&apos;operazione in
                  coda, il guardrail la controlla e parte solo dopo la tua approvazione in{" "}
                  <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a>.
                </p>
              </section>
            )}

            {termini.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">
                  Parole cercate davvero ({termini.length})
                </div>
                <p className="cella-sub" style={{ marginBottom: 12, whiteSpace: "normal" }}>
                  Cosa ha digitato la gente per far comparire questi annunci — non le keyword che
                  abbiamo scritto noi, ma le ricerche vere che le hanno attivate. È qui che si
                  trovano le parole da aggiungere e quelle da escludere.
                  {finestraTermini && (
                    <> Finestra: <b>{finestraTermini}</b>.</>
                  )}
                </p>
                {/* Le azioni di massa, come sulla scheda campagna. Il form
                    vive fuori dalla tabella e le caselle lo raggiungono con
                    `form=`: dentro le celle c'è già il form di «Escludi». */}
                <form id="scelte-termini" action={escludiParoleSelezionate} className="barra-multipla">
                  <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                  <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                  <span className="cella-sub">Spunta più parole e agisci su tutte insieme:</span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    come
                    <select name="corrispondenza" defaultValue="exact" style={{ font: "inherit", padding: "4px 8px", borderRadius: 8, border: "1px solid var(--hairline-strong)" }}>
                      <option value="exact">esatta — solo questa ricerca</option>
                      <option value="phrase">a frase — questa sequenza di parole</option>
                      <option value="broad">generica — ogni ricerca con queste parole</option>
                    </select>
                  </label>
                  <button className="btn small btn-secondario" type="submit">
                    Escludi le selezionate
                  </button>
                  <PortaSelezionate lingue={lingueQui} />
                  <button
                    type="button"
                    className="btn small fantasma"
                    data-estendi-ai
                    data-estendi-gruppo={gruppo.nome}
                  >
                    Estendi con AI
                  </button>
                </form>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th data-no-ordina></th>
                        <th>Parola cercata</th>
                        <th className="num">Spesa</th>
                        <th className="num">Clic</th>
                        <th className="num">Conv.</th>
                        <th className="num">Ricavi</th>
                        <th>Intercettata da</th>
                        <th data-no-ordina>Azione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {termini.map((t) => {
                        // Una parola cercata che spende e non converte e il
                        // caso da guardare per primo: si segna in rosso qui,
                        // invece di lasciarla in mezzo alle altre.
                        const brucia = (t.spesa ?? 0) >= 15 && (t.conversioni ?? 0) === 0;
                        const gia = t.stato === "escluso" || t.stato === "da_escludere";
                        return (
                        <tr key={t.id}>
                          <td>
                            <input
                              type="checkbox"
                              form="scelte-termini"
                              name="scelte"
                              value={t.testo}
                              aria-label={`Seleziona «${t.testo}»`}
                            />
                          </td>
                          <td style={{ maxWidth: 260 }}>
                            <div className="cella-nome" style={brucia ? { color: "var(--red)" } : undefined} title={brucia ? `${(t.spesa ?? 0).toFixed(0)} EUR spesi e nessuna conversione` : undefined}>
                              {brucia && <span aria-hidden="true">● </span>}
                              {t.testo}
                            </div>
                            {t.stato !== "nuovo" && (
                              <div className="cella-sub">{t.stato.replace("_", " ")}</div>
                            )}
                          </td>
                          <td className="num">{formattaEuro(t.spesa)}</td>
                          <td className="num">{formattaNumero(t.clic)}</td>
                          <td className="num">{formattaNumero(t.conversioni)}</td>
                          <td className="num">{formattaEuro(t.ricavi)}</td>
                          <td className="cella-muta" style={{ maxWidth: 200 }}>
                            {t.keyword ?? "—"}
                            {t.keywordDiverse && t.keywordDiverse > 1 && (
                              <div className="cella-sub">
                                e altre {t.keywordDiverse - 1}: i numeri sono la somma
                              </div>
                            )}
                          </td>
                          <td>
                            {gia ? (
                              <span className="cella-sub">già segnata</span>
                            ) : (
                              <form action={creaOperazioneKeyword}>
                                <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                                <input type="hidden" name="testo" value={t.testo} />
                                <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                                <input type="hidden" name="tipo" value="negativa" />
                                {/* Eredita la corrispondenza della keyword che
                                    ha intercettato questa ricerca: escluderla
                                    in esatta quando era entrata in frase
                                    lascerebbe passare tutte le varianti. */}
                                <input type="hidden" name="corrispondenzaOrigine" value={(t.corrispondenza ?? "exact").toLowerCase()} />
                                <input type="hidden" name="motivo" value={`Parola cercata: ${(t.spesa ?? 0).toFixed(0)} EUR, ${t.clic ?? 0} clic, ${t.conversioni ?? 0} conversioni`} />
                                <button className="btn small btn-secondario" type="submit" title="Mette in coda la negativa: la parola non fara piu scattare gli annunci">
                                  Escludi
                                </button>
                              </form>
                            )}
                            {/* Una ricerca che rende è una keyword non ancora
                                comprata: da qui si porta dove manca o si
                                estende con l'AI — gruppo e corrispondenza
                                partono da questa riga. */}
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              <button
                                type="button"
                                className="btn small fantasma"
                                {...attributiPortaKeyword({
                                  testo: t.testo,
                                  corrispondenza: "exact",
                                  giaSu: giaSuDi(t.testo),
                                  classificata: true,
                                  lingueDiOra: lingueQui,
                                })}
                              >
                                Porta altrove
                              </button>
                              <button
                                type="button"
                                className="btn small fantasma"
                                data-estendi-ai
                                data-estendi-seme={t.testo}
                                data-estendi-gruppo={gruppo.nome}
                                data-estendi-corrispondenza={(t.corrispondenza ?? "exact").toLowerCase()}
                                title="L'AI propone parole correlate a questa, da mettere in coda dopo averle guardate"
                              >
                                Estendi con AI
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12 }}>
                  <a className="btn small btn-secondario" href={`/termini?campagna=${encodeURIComponent(gruppo.campagna.nome)}`}>
                    Tutte le parole cercate della campagna
                  </a>
                </div>
              </section>
            )}

            {testi.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Titoli e descrizioni usati qui ({testi.length})</div>
                {/* Stessa forma di Google Ads del blocco gemello sulla scheda
                    campagna: una scheda per testo col conteggio caratteri. */}
                <TestiAnnuncio testi={testi} />
              </section>
            )}
          </div>

          <div>
            {ricercheFresche.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">
                  Ricerche{dalFresco && alFresco ? ` (${formattaData(dalFresco)} → ${formattaData(alFresco)})` : ""}
                </div>
                <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
                  Cosa digita la gente, ordinato per quante volte siamo comparsi — come la card di
                  Google, ma coi numeri veri della finestra. Verde = ha convertito, rosso = spende
                  senza convertire.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ricercheFresche.map((t) => {
                    const conv = t.conversioni ?? 0;
                    const spesa = t.spesa ?? 0;
                    const colore =
                      conv > 0 ? "var(--green)" : spesa >= 10 ? "var(--red)" : "var(--text-tertiary)";
                    return (
                      <span
                        key={t.id}
                        title={`«${t.testo}» — ${t.impressioni ?? 0} comparse · ${t.clic ?? 0} clic · ${formattaEuro(spesa)} · ${conv} conversioni${(t.ricavi ?? 0) > 0 ? ` · ${formattaEuro(t.ricavi)} di incasso` : ""}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "baseline",
                          gap: 6,
                          border: "1px solid var(--hairline-strong)",
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 12,
                        }}
                      >
                        {t.testo}
                        <span style={{ color: colore, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {formattaEuro(spesa)} · {t.clic ?? 0} clic
                          {conv > 0 ? ` · ${Number.isInteger(conv) ? conv : conv.toFixed(1)} conv` : ""}
                          {/* Il VALORE delle conversioni: la freccia dice che
                              è quello che torna indietro, contro la spesa a
                              sinistra. */}
                          {(t.ricavi ?? 0) > 0 ? ` → ${formattaEuro(t.ricavi)}` : ""}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="scheda">
              <div className="scheda-titolo">Quando si vende — i dodici mesi</div>
              <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
                I mesi già passati sono dati veri; per quelli che restano c&apos;è la media degli anni
                precedenti. Non è una previsione: è quello che è successo, e serve a sapere quando
                conviene avere budget pronto.
              </p>
              <Stagionalita
                punti={gruppo.metriche.map((m) => ({
                  data: m.data,
                  spesa: m.spesa,
                  ricavi: m.ricavi,
                  conversioni: m.conversioni,
                }))}
              />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Andamento spesa nel periodo</div>
              <GraficoSpesa punti={[...nelPeriodo].reverse().map((m) => ({ data: m.data, valore: m.spesa ?? 0 }))} />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">
                Metriche per mese ({gruppo.metriche.length} giorni)
              </div>
              <AndamentoMensile
                metriche={gruppo.metriche}
                vuoto={
                  <>
                    Nessuna metrica: le manda lo script di Google Ads con <code>AZIONE = &quot;gruppi&quot;</code>.
                  </>
                }
              />
            </section>

            {/* «Come si chiama qui» stava qui: ora è la matita accanto al
                titolo. La spiegazione di cosa vale quel nome è dentro il
                dialogo, non serve ripeterla in pagina. */}

            {/* «Stato nell'app» stava qui: è salito accanto allo stato di
                Google, che è l'unico posto dove i due si leggono insieme. La
                spiegazione di cosa siano resta, perché la distinzione è il
                punto: il giudizio è tuo e l'import non lo tocca mai. */}
            <section className="scheda">
              <div className="scheda-titolo">Il giudizio e il fatto</div>
              <p className="cella-sub">
                In cima ci sono due stati e non è un doppione. <b>Su Google</b> è il fatto
                ({gruppo.statoPiattaforma ?? "non ancora letto"}), lo scrive l&apos;import.{" "}
                <b>Nell&apos;app</b> è il tuo giudizio, e l&apos;import non lo sovrascrive mai: un
                gruppo può essere acceso su Google e «da valutare» per te.
              </p>
            </section>

            {/* «Agire su Google» stava qui: il comando è salito accanto al
                titolo. Duplicarlo in due punti vorrebbe dire due moduli che
                mandano la stessa operazione, e prima o poi due operazioni. */}

            <section className="scheda">
              <div className="scheda-titolo">Dettagli</div>
              <div className="griglia-campi" style={{ gridTemplateColumns: "1fr" }}>
                <dl className="campo">
                  <dt>Campagna</dt>
                  <dd>
                    <a href={`/campagne/${gruppo.campagnaId}`}>{gruppo.campagna.nome}</a> ({gruppo.campagna.classe})
                  </dd>
                </dl>
                <dl className="campo">
                  <dt>Id sulla piattaforma</dt>
                  <dd style={{ overflowWrap: "anywhere" }}>{gruppo.idEsterno ?? "—"}</dd>
                </dl>
                {/* La lingua a cui parla: dedotta dal nome del gruppo, e se il
                    gruppo non la dice si eredita dalla campagna. Nel gifting
                    conta piu di quanto sembri — chi compra e il MITTENTE, spesso
                    fuori dal paese di consegna, e la lingua degli annunci e la
                    sua, non quella della destinazione (ISTRUZIONI di progetto). */}
                <dl className="campo">
                  <dt>Lingua obiettivo</dt>
                  <dd>
                    {lingua ? (
                      <>
                        {ETICHETTA_LINGUA[lingua.codice] ?? lingua.codice}
                        <span className="cella-sub"> · {lingua.da}</span>
                      </>
                    ) : (
                      <span className="cella-muta">
                        non dichiarata nel nome — gli annunci vanno a chiunque
                      </span>
                    )}
                  </dd>
                </dl>
                <dl className="campo">
                  <dt>Ultimo giorno con dati</dt>
                  <dd>{gruppo.metriche[0] ? formattaData(gruppo.metriche[0].data) : "—"}</dd>
                </dl>
                <dl className="campo">
                  <dt>Aggiornato</dt>
                  <dd>{formattaDataOra(gruppo.aggiornatoIl)}</dd>
                </dl>
                {gruppo.note && (
                  <dl className="campo">
                    <dt>Note</dt>
                    <dd>{gruppo.note}</dd>
                  </dl>
                )}
              </div>
            </section>

            {gruppo.operazioni.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Operazioni su questo gruppo</div>
                <ul className="storia">
                  {gruppo.operazioni.map((o) => (
                    <li key={o.id}>
                      <span className="storia-data">{formattaData(o.creataIl)}</span>
                      <span className="storia-testo">
                        {o.tipo === "pausa_gruppo" ? "Pausa" : "Riattivazione"}
                        {o.esito ? ` — ${o.esito}` : ""}
                      </span>
                      <span className="storia-autore">{o.stato}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        {/* Uno per pagina, come su Keywords e sulla scheda campagna: i
            bottoni delle righe e delle barre li aprono via ascoltatore
            delegato. Il gruppo di default di «Estendi» è QUESTO gruppo
            (viaggia sui bottoni con data-estendi-gruppo). */}
        <PortaKeyword
          campagne={campagneDialogo}
          ritorno={`/gruppi/${gruppo.id}`}
          azione={applicaKeywordAdAltreCampagne}
        />
        <EstendiConAi
          campagnaId={gruppo.campagna.id}
          nomeCampagna={gruppo.campagna.nome}
          gruppi={fratelli.map((f) => f.nome)}
          ritorno={`/gruppi/${gruppo.id}`}
          azioneAi={estendiKeywordConAi}
          azioneAccoda={applicaKeywordAdAltreCampagne}
        />
      </main>
    </div>
  );
}
