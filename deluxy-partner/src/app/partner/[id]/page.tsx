import Link from "next/link";
import { ConfermaElimina } from "@/components/ConfermaElimina";
import { TornaIndietro } from "@/components/TornaIndietro";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { riepilogoPartner, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt, pctIt } from "@/lib/format";
import { nomeMese, commissione, dovutoVendita, ivato, residuoFattura, incassatoFattura, parzialmenteIncassata, MESI } from "@/lib/calc";
import { tokenPartner, matchPartner, frasiPartner, parolaPerCercare, frasePresente } from "@/lib/riconciliazione";
import { segnaFatturaPagata, segnaFatturaCompensata, deleteFattura, riallineaFeeVendite, aggiungiTariffa, eliminaTariffa, aggiungiExtra, eliminaExtra } from "@/lib/actions";
import { feeDaTariffe } from "@/lib/fee";
import { transactionsConfigurato } from "@/lib/transactions";
import { fattureFicDelPartner } from "@/lib/fic-partner";
import { FatturaLink } from "@/components/FatturaModale";
import { scollegaFatturaCommissioni } from "@/lib/fic-actions";
import { scollegaMovimentoAttribuito, escludiMovimentoDaPartner, ripristinaMovimentoEscluso } from "@/lib/movimenti-partner-actions";
import { BottoneInvio } from "@/components/BottoneInvio";
import { RigaMovimento, ApriDettaglio, type MovimentoDettaglio } from "@/components/MovimentoModale";
import { eFatturaVera } from "@/lib/fattura-vera";
import { datiBancariPartner } from "@/lib/dati-bancari";
import { TIPI_PL } from "@/lib/categorie-spesa";
import { CollegaFatturaCommissioni } from "@/components/CollegaFatturaCommissioni";
import { AnagraficaCard } from "@/components/AnagraficaCard";
import { FattureFicPartner } from "@/components/FattureFicPartner";
import { ContattoAmministrativo } from "@/components/ContattoAmministrativo";
import { smtpConfigurato } from "@/lib/mail";
import { condizioniVendorPartner } from "@/lib/condizioni-vendor";
import { CreditoCard } from "@/components/CreditoCard";
import { analisiPartner } from "@/lib/stato-analisi";
import { MailPartnerCard } from "@/components/MailPartnerCard";
import { aiMailConfigurata } from "@/lib/aimail";
import { PagamentoMese } from "@/components/PagamentoMese";
import { RecapAI } from "@/components/RecapAI";
import { costruisciRecapPrompt } from "@/lib/recap";

export const dynamic = "force-dynamic";

function siNo(v: boolean) {
  return v ? "Sì" : "No";
}

// I campi del movimento bancario che servono alla riga della tabella E alla
// finestra che si apre al click (stessa lista per le due tabelle: quella dei
// candidati e quella degli esclusi, così le due finestre mostrano le stesse
// cose). È il record di `/movimenti/[id]`, meno gli altri movimenti della
// stessa controparte, che restano un motivo per aprire la scheda intera.
const MOVIMENTO_SELECT = {
  id: true,
  data: true,
  importo: true,
  divisa: true,
  descrizione: true,
  controparte: true,
  ibanControparte: true,
  fonte: true,
  stato: true,
  esito: true,
  createdAt: true,
  partnerId: true,
  categoriaNome: true,
  categoriaTipoPL: true,
  categoriaDa: true,
  categoriaNota: true,
  partner: { select: { nome: true } },
} as const;

type MovimentoDalDb = {
  id: string;
  data: Date;
  importo: number;
  divisa: string;
  descrizione: string;
  controparte: string | null;
  ibanControparte: string | null;
  fonte: string | null;
  stato: string;
  esito: string | null;
  createdAt: Date;
  partnerId: string | null;
  categoriaNome: string | null;
  categoriaTipoPL: string | null;
  categoriaDa: string | null;
  categoriaNota: string | null;
  partner: { nome: string } | null;
};

// Il colore e il nome del tipo di costo si decidono QUI, sul server: la mappa
// `TIPI_PL` vive in un file che parla con Budgets, e un componente client non
// deve tirarselo dietro.
function perLaFinestra(m: MovimentoDalDb): MovimentoDettaglio {
  return {
    id: m.id,
    data: m.data,
    importo: m.importo,
    divisa: m.divisa,
    descrizione: m.descrizione,
    controparte: m.controparte,
    ibanControparte: m.ibanControparte,
    fonte: m.fonte,
    stato: m.stato,
    esito: m.esito,
    createdAt: m.createdAt,
    partnerId: m.partnerId,
    partnerNome: m.partner?.nome ?? null,
    categoriaNome: m.categoriaNome,
    categoriaDa: m.categoriaDa,
    categoriaNota: m.categoriaNota,
    categoriaBadge: m.categoriaTipoPL ? TIPI_PL[m.categoriaTipoPL]?.badge ?? "neutral" : null,
    categoriaEtichetta: m.categoriaTipoPL ? TIPI_PL[m.categoriaTipoPL]?.label ?? m.categoriaTipoPL : null,
  };
}

export default async function PartnerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    amm?: string; fic?: string; ficreg?: string; mail?: string; nota?: string; mese?: string; anag?: string;
    ficCollegata?: string; ficErrore?: string; errorePag?: string; richiesta?: string; fattEliminata?: string; extra?: string;
    ficEsito?: string; ficMsg?: string; emessa?: string; anno?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) notFound();
  // Il bottone «Richiedi pagamento» compare solo se Transactions e collegata.
  const trxAttiva = transactionsConfigurato();

  // L'app può DAVVERO mandare la mail di sollecito? Se la casella non è
  // configurata il bottone lo deve dire PRIMA del click, non dopo
  // (segnalazione dell'utente, 08/09/2026: «sembra non funzionare»).
  const smtpAttivo = await smtpConfigurato();
  // Le condizioni vendor le decide la PIATTAFORMA CONSEGNE: qui si leggono dal
  // registro, che le trasporta. La copia locale resta solo come ripiego.
  const condVendor = await condizioniVendorPartner(id);

  // ⭐ 12/09/2026 (richiesta dell'utente: «consenti anche qui di vedere il
  // 2025»). La scheda mostrava solo l'anno in corso: per guardare un mese del
  // 2025 — dove sta la maggior parte degli arretrati — non c'era strada. Si
  // sceglie l'anno; tutto il resto della scheda (rolling, confronto con l'anno
  // prima, extra, pagamenti) lo segue.
  const anniDisponibili = [ANNO_CORRENTE, ANNO_CORRENTE - 1];
  const anno = anniDisponibili.includes(Number(sp.anno)) ? Number(sp.anno) : ANNO_CORRENTE;
  const annoPrec = anno - 1;
  const [{ mesi, rolling, nonEmesse }, prec, tariffe, fattureAperte, extra, analisi, , banca] = await Promise.all([
    riepilogoPartner(id, anno, condVendor.condizioni?.compensazioneIncassi ?? null),
    riepilogoPartner(id, annoPrec, condVendor.condizioni?.compensazioneIncassi ?? null),
    prisma.tariffaPartner.findMany({ where: { partnerId: id }, orderBy: [{ dalAnno: "desc" }, { dalMese: "desc" }] }),
    // Le fatture aperte che il contatto amministrativo deve sollecitare: solo
    // quelle VERE. Una riga senza documento su FIC non si può sollecitare —
    // non esiste nulla da mandare al cliente.
    // ⚠️ `compensata: false` (08/09/2026, segnalato dall'utente su 142
    // RESTAURANT): la 459/2026 era già segnata compensata — la stessa pagina
    // diceva «Nessuna esposizione» dieci centimetri più su — eppure questo
    // riquadro la offriva con «Invia sollecito». Una fattura in compensazione
    // non si sollecita: non passa dalla banca, si scala da quello che Deluxy
    // deve al partner. Chiedere quei soldi è chiederli a chi non li deve
    // versare. `stato-credito.ts` questo filtro ce l'aveva già dal 04/09: qui
    // mancava, e le due metà della stessa scheda si contraddicevano.
    prisma.fatturaServizio
      .findMany({
        where: { partnerId: id, pagata: false, compensata: false, imponibile: { gt: 0 } },
        orderBy: [{ scadenza: "asc" }],
      })
      .then((ff) => ff.filter(eFatturaVera)),
    prisma.extraSaldo.findMany({ where: { partnerId: id, anno }, orderBy: { createdAt: "asc" } }),
    analisiPartner(id),
    analisiPartner(id),
    // I dati bancari: la copia locale se c'è, altrimenti il registro (che è la
    // fonte). Una chiamata di rete solo quando la copia manca — vedi `dati-bancari.ts`.
    datiBancariPartner(id),
  ]);

  // Ultimi 10 movimenti bancari della scheda: i CERTI (attribuiti a questo
  // partner in riconciliazione, `partnerId`) più i CANDIDATI per nome — movimenti
  // non ancora attribuiti a nessuno la cui controparte contiene un token forte
  // del nome partner. Il token lo dà lo stesso tokenizer della riconciliazione,
  // che scarta forme societarie, città e mesi; restano l'insegna e i cognomi.
  // ⚠️ Un nome comune (un partner «… PAOLO») può ancora pescare un omonimo: per
  // questo i candidati sono marcati «per nome — da confermare», non spacciati
  // per certi. I movimenti già attribuiti a un ALTRO partner non entrano.
  const tokenNome = tokenPartner(partner.nome);
  // 11/09/2026 — le frasi che identificano il partner anche quando ogni sua
  // parola, da sola, è una parola del mestiere (FLOR (FLOWER MARKET)). Entra
  // anche l'intestatario del conto del registro, che in banca è il nome che
  // compare davvero («FlowerMarket srls»).
  const frasi = [...new Set([...frasiPartner(partner.nome), ...(banca.intestatario ? frasiPartner(banca.intestatario) : [])])];
  const paroleFrase = [...new Set([...parolaPerCercare(partner.nome), ...(banca.intestatario ? parolaPerCercare(banca.intestatario) : [])])];
  const daCercare = [...new Set([...tokenNome, ...paroleFrase])];
  // Movimenti esclusi a mano da QUESTA scheda (omonimi «non è questo partner»):
  // si tolgono dai candidati per nome. Lettura non fatale (tabella dedicata,
  // via SQL raw): se fallisce si mostra tutto invece di rompere la scheda.
  const esclusi = await prisma
    .$queryRaw<{ movimentoId: string }[]>`SELECT "movimentoId" FROM "public"."EsclusioneMovimentoPartner" WHERE "partnerId" = ${id};`
    .catch(() => [] as { movimentoId: string }[]);
  const esclusiIds = esclusi.map((e) => e.movimentoId);
  // ⭐ 08/09/2026 — LA SCHEDA USA LA STESSA REGOLA DEL MOTORE (richiesta
  // dell'utente, dopo lo screenshot di ARTE E FIORI).
  //
  // Prima qui si cercava per SOTTOSTRINGA (`controparte contains 'ARTE'`),
  // mentre la riconciliazione confronta per PAROLE INTERE e pretende un token
  // di almeno 5 lettere o due token. Due regole diverse per la stessa domanda
  // danno due risposte diverse, e questa era la più debole: su ARTE E FIORI
  // pescava **103 movimenti, di cui 0 sarebbero stati attribuiti dal motore** —
  // «mARTEl gianluca», «dolciARTE sas», «pasticceria mARTEsana» (che è un ALTRO
  // partner). Un elenco di sospetti che non sospetta niente fa perdere tempo e,
  // peggio, fa credere che quei soldi c'entrino.
  //
  // Ora la sottostringa resta solo come PREFILTRO del database (non si può
  // chiedere a Postgres la regola del motore senza una regex per riga), e il
  // giudizio vero lo dà `matchPartner` sugli stessi partner e sullo stesso
  // testo che userebbe la riconciliazione: sopravvivono solo i movimenti che il
  // motore attribuirebbe DAVVERO a questa scheda.
  //
  // ⚠️ Due query invece di una, di proposito: i movimenti GIÀ ATTRIBUITI non
  // passano dal filtro (sono una certezza scritta da una persona, non un
  // sospetto) e non devono poter essere spinti fuori dal rumore dei candidati.
  const attribuiti = await prisma.transazioneBancaria.findMany({
    where: { partnerId: id, ...(esclusiIds.length ? { id: { notIn: esclusiIds } } : {}) },
    orderBy: [{ data: "desc" }, { id: "desc" }],
    take: 10,
    select: MOVIMENTO_SELECT,
  });
  // ⭐ 09/09/2026 (richiesta dell'utente: «apri in movimenti bancari dell'app
  // stessa se non è stato saldato tramite app Transactions»).
  // Il riepilogo «Pagato al partner …» sotto il mese deve portare dove quel
  // pagamento vive DAVVERO: su Transactions solo se di là risulta *pagata*;
  // altrimenti al movimento bancario di Finance. Lo stato «in attesa» non è una
  // prova di pagamento — su BOTTEGA 2E il mese di giugno mostrava 769,32 €
  // pagati e insieme «Pagamento in attesa»: il link portava a una richiesta che
  // quei soldi non li ha fatti uscire.
  //
  // L'aggancio è la coppia (data del bonifico, verso): `registraMovimento`
  // scrive `bonificoData = tx.data` sul mese e marca il movimento `registrata`.
  // ⚠️ Solo se il candidato è UNO: con due bonifici lo stesso giorno non si sa
  // quale mostrare, e un link che sceglie a caso è peggio di nessun link (vedi
  // il pagamento spezzato in due bonifici).
  const movimentiRegistrati = await prisma.transazioneBancaria.findMany({
    where: { partnerId: id, stato: "registrata" },
    select: { id: true, data: true, importo: true },
  });
  const movimentoPerData = new Map<string, string | null>();
  for (const m of movimentiRegistrati) {
    // In banca l'uscita è negativa; sul mese il bonifico inviato è positivo.
    const chiave = `${m.data.toISOString().slice(0, 10)}|${m.importo < 0 ? "uscita" : "entrata"}`;
    movimentoPerData.set(chiave, movimentoPerData.has(chiave) ? null : m.id);
  }
  const movimentoDelMese = (data: Date | null | undefined, importoMese: number | null | undefined) => {
    if (!data || importoMese == null || Math.abs(importoMese) < 0.005) return null;
    const chiave = `${new Date(data).toISOString().slice(0, 10)}|${importoMese > 0 ? "uscita" : "entrata"}`;
    return movimentoPerData.get(chiave) ?? null;
  };

  const tuttiPartner = daCercare.length
    ? await prisma.partner.findMany({ select: { id: true, nome: true } })
    : [];
  const candidatiGrezzi = daCercare.length
    ? await prisma.transazioneBancaria.findMany({
        where: {
          AND: [
            { partnerId: null, OR: daCercare.map((t) => ({ controparte: { contains: t, mode: "insensitive" as const } })) },
            ...(esclusiIds.length ? [{ id: { notIn: esclusiIds } }] : []),
          ],
        },
        orderBy: [{ data: "desc" }, { id: "desc" }],
        // Tetto al prefiltro: si giudicano i 200 più recenti. Chi ne ha di più
        // ha rumore, non candidati — e i movimenti veri, se ci sono, li ha
        // attribuiti la riconciliazione e stanno nella query qui sopra.
        take: 200,
        select: MOVIMENTO_SELECT,
      })
    : [];
  // ⚠️ «Il motore lo RICONOSCE», non «il motore lo ASSEGNA a lui». La prima
  // versione pretendeva che il partner VINCESSE il confronto globale, e
  // svuotava a torto quattro schede: CHANEL ROMA e CHANEL FIRENZE (perdono
  // contro CHANEL MILANO), Giada Cake Lab, e soprattutto VINCENZO D'ASCANIO —
  // dove «VINCENZO DASCANIO S.R.L.» è proprio lui, ma il token `VINCENZO` vale
  // uguale per MARYFLOR DI GERARDI VINCENZO e a parità di punteggio vince chi
  // sta prima nell'elenco. Perdere i movimenti VERI è peggio che mostrarne
  // qualcuno in più: questo elenco è fatto di sospetti da confermare, e ha il
  // bottone per dire di no. Misura: 3.209 candidati per sottostringa → 1.671
  // con questa regola (di cui 206 che il motore darebbe a un altro partner, e
  // che infatti la riga dichiara).
  const contesi = new Map<string, string>();
  const candidati = candidatiGrezzi.filter((m) => {
    const testo = `${m.descrizione} ${m.controparte ?? ""}`;
    // o lo riconosce il motore (token), o c'è la frase intera del nome
    if (matchPartner(testo, [partner])?.id !== id && !frasePresente(testo, frasi)) return false;
    const vincitore = matchPartner(testo, tuttiPartner as Parameters<typeof matchPartner>[1]);
    if (vincitore && vincitore.id !== id) contesi.set(m.id, vincitore.nome);
    return true;
  });
  const ultimiMovimenti = [...attribuiti, ...candidati]
    .sort((a, b) => b.data.getTime() - a.data.getTime() || (a.id < b.id ? 1 : -1))
    .slice(0, 10);
  // Quanti ne ha scartati il filtro: serve alla frase sotto la tabella, che
  // altrimenti non spiegherebbe perché un partner «non ha movimenti».
  const scartatiDalFiltro = candidatiGrezzi.length - candidati.length;
  // I movimenti esclusi a mano da questa scheda (per l'undo): dettagli dei soli
  // id esclusi, così si possono rimettere fra i candidati.
  const movimentiEsclusi = esclusiIds.length
    ? await prisma.transazioneBancaria.findMany({
        where: { id: { in: esclusiIds } },
        orderBy: [{ data: "desc" }],
        select: MOVIMENTO_SELECT,
      })
    : [];
  // Le fatture FIC intestate a questo partner: servono a proporre quale
  // collegare come «fattura commissioni» di un mese. Si caricano una volta per
  // scheda (non per riga) e non fanno mai fallire la pagina: se FIC è giù,
  // resta il campo dove scrivere il numero a mano.
  //
  // ⚠️ Solo se c'è davvero un mese da collegare: sui partner in regola —
  // la maggior parte — sarebbe una chiamata di rete per una tendina che
  // nessuno aprirà, pagata a ogni apertura della scheda.
  const daCollegare = mesi.some((m) => m.vendite.length > 0 && !m.saldo?.commFattEmessa);
  const candidateFic = daCollegare ? await fattureFicDelPartner(id, partner.nome, anno) : [];
  // dove tornano le azioni della scheda
  // ⚠️ Guardando il 2025, le azioni devono riportare al 2025: senza l'anno nel
  // link si torna sull'anno in corso e il mese su cui si stava lavorando
  // sparisce sotto gli occhi.
  // Nota onesta: alcune azioni in `actions.ts` hanno il ritorno scritto dentro
  // (`/partner/<id>`) e l'anno lo perdono ancora — i dati restano giusti, si
  // torna solo sull'anno corrente.
  const tornaA = anno === ANNO_CORRENTE ? `/partner/${id}` : `/partner/${id}?anno=${anno}`;
  // ⭐ 09/09/2026 — UNA SOLA RISPOSTA SULLA COMPENSAZIONE.
  // La decide la piattaforma; la colonna locale è il ripiego quando il registro
  // non risponde o nessuno ha deciso. Prima il badge leggeva la piattaforma e i
  // conti leggevano la colonna locale: la stessa pagina diceva «In
  // compensazione» e sotto calcolava a partite separate (FABBRICA DELLE FESTE).
  const compensazioneEffettiva =
    condVendor.condizioni?.compensazioneIncassi ?? (partner.compensazione ?? false);
  // voci extra raggruppate per mese, per la gestione nel blocco mensile
  const extraPerMese = new Map<number, typeof extra>();
  for (const e of extra) {
    const arr = extraPerMese.get(e.mese) ?? [];
    arr.push(e);
    extraPerMese.set(e.mese, arr);
  }
  const mesiConDati = mesi.filter(
    (m) => m.fatture.length || m.vendite.length || m.saldo
  );
  // valore mese = vendite + servizi fatturati (netto IVA), per il confronto anno su anno
  const valoreMese = (r: { vendite: number; serviziNetto: number }) => r.vendite + r.serviziNetto;

  // fee attesa per una vendita = fee valida nel suo mese secondo lo storico
  const feeBase = partner.feePercent ?? 0;
  const feeAttesaVendita = (v: { anno: number; mese: number }) => feeDaTariffe(tariffe, v.anno, v.mese, feeBase);
  const venditeDisallineate = mesi
    .flatMap((m) => m.vendite)
    .filter((v) => v.feePercent !== feeAttesaVendita(v)).length;

  const recapPrompt = costruisciRecapPrompt({
    partner,
    anno,
    annoPrec,
    mesi,
    mesiPrec: prec.mesi,
    rolling,
    rollingPrec: prec.rolling,
  });

  return (
    <>
      <TornaIndietro fallback="/partner" label="Partner" />
      <div className="page-head">
        <div>
          <h1 className="page-title">{partner.nome}</h1>
          <p className="page-caption">
            {[partner.categoria, partner.citta, partner.servizi].filter(Boolean).join(" · ") || "Scheda partner"}
          </p>
          {/* 08/09/2026, chiesto dall'utente: la compensazione si legge SUBITO,
              non in fondo alla griglia delle condizioni. Cambia come si leggono
              tutti i numeri della pagina — con la compensazione il mese è un
              saldo netto unico, senza sono due partite che non si toccano mai —
              quindi va saputo prima di guardarli, non dopo. */}
          {/* ⭐ 08/09/2026 — LA DECISIONE ARRIVA DALLA PIATTAFORMA CONSEGNE, che
              ne è la proprietaria. Finance la legge dal registro e la mostra
              dichiarando da dove viene; la sua colonna locale resta solo come
              ripiego quando il registro non risponde. Il caso: BOTTEGA
              LUNGARNO, deciso sulla piattaforma e qui ancora «mai deciso». */}
          <div style={{ marginTop: 6 }}>
            {condVendor.disponibile && condVendor.condizioni ? (
              (() => {
                const c = condVendor.condizioni!;
                const pezzi: string[] = [];
                if (c.pagamentoVendorGiorni != null) pezzi.push(`vendite a ${c.pagamentoVendorGiorni} gg`);
                if (c.incassoServiziGiorni != null) pezzi.push(`servizi a ${c.incassoServiziGiorni} gg`);
                if (c.incassoServiziFineMese) pezzi.push("decorrenza fine mese");
                const coda = pezzi.length ? <span className="muted" style={{ marginLeft: 8, fontSize: 12.5 }}>{pezzi.join(" · ")}</span> : null;
                // ⭐ 09/09/2026 — TRE SITUAZIONI, NON UNA. Un campo vuoto qui può
                // voler dire tre cose diverse, con tre rimedi opposti:
                //   · la scheda del registro è ARCHIVIATA (perdente di
                //     un'unione): Finance sta leggendo la scheda morta;
                //   · la scheda non è COLLEGATA alla piattaforma: la risposta
                //     esiste, ma non ha una strada per arrivare;
                //   · nessuno ha ancora deciso: la domanda è davvero aperta.
                // Dirle tutte «da valorizzare» manda a decidere una cosa già
                // decisa. È successo su ADOLFO STEFANELLI, e ci ho creduto io
                // per primo.
                return c.compensazioneIncassi == null ? (
                  condVendor.archiviata ? (
                    <>
                      <span className="badge red" title="Questa scheda del registro è la perdente di un'unione: è archiviata e non riceve più niente. Il partner va riagganciato alla scheda viva.">
                        <span className="dot" />Scheda del registro archiviata
                      </span>
                      {coda}
                    </>
                  ) : !condVendor.agganciata ? (
                    <>
                      <span className="badge red" title="La scheda del registro non è collegata a nessun partner della piattaforma consegne: le condizioni decise là non hanno una strada per arrivare qui. Si collega dalla piattaforma, sulla scheda del partner.">
                        <span className="dot" />Scheda non collegata alla piattaforma
                      </span>
                      {coda}
                    </>
                  ) : (
                    <>
                      <span className="badge orange" title="Sulla piattaforma consegne nessuno ha ancora scelto: la domanda è aperta, e si risponde lì — è lei la proprietaria del dato.">
                        <span className="dot" />Compensazione da valorizzare
                        <span style={{ opacity: 0.75, marginLeft: 6 }}>· dalla piattaforma</span>
                      </span>
                      {coda}
                    </>
                  )
                ) : (
                  <>
                    <span className={`badge ${c.compensazioneIncassi ? "blue" : "neutral"}`} title="Deciso sulla piattaforma consegne, che è la proprietaria del dato. Qui si legge soltanto.">
                      <span className="dot" />{c.compensazioneIncassi ? "In compensazione" : "Senza compensazione"}
                      <span style={{ opacity: 0.75, marginLeft: 6 }}>· dalla piattaforma</span>
                    </span>
                    {coda}
                  </>
                );
              })()
            ) : partner.compensazioneDecisa ? (
              partner.compensazione ? (
                <span className="badge blue" title="Le fatture non passano dalla banca: si scalano da quello che Deluxy deve al partner. Il mese è un saldo netto unico.">
                  <span className="dot" />In compensazione
                </span>
              ) : (
                <span className="badge neutral" title="Due partite separate: le fatture si incassano, il dovuto vendite si bonifica. Non si compensano mai.">
                  <span className="dot" />Senza compensazione
                </span>
              )
            ) : (
              <Link
                href={`/partner/${id}/modifica`} prefetch={false}
                className="badge orange"
                title="Nessuno ha ancora scelto se questo partner va in compensazione. I conti si comportano come «senza», ma la domanda è aperta: si decide da qui."
              >
                <span className="dot" />Compensazione mai decisa
              </Link>
            )}
          </div>
        </div>
        <div className="page-actions">
          {venditeDisallineate > 0 && (
            <form action={riallineaFeeVendite.bind(null, id, anno)}>
              <button
                className="btn secondary"
                type="submit"
                title={`Applica a ${venditeDisallineate} vendite ${anno} la fee prevista dallo storico per il loro mese`}
              >
                Riallinea fee vendite ({venditeDisallineate})
              </button>
            </form>
          )}
          {/* il partner viaggia nell'URL: la pagina lo preseleziona e, a fattura
              fatta, torna QUI sul mese giusto (10/09/2026: da questo bottone la
              648/2026 di CONLESTELLE è finita sotto un altro partner) */}
          <Link href={`/registrazioni/fatture/nuova?partnerId=${id}`} className="btn secondary">+ Fattura</Link>
          <Link href={`/vendite/nuova?partnerId=${id}`} className="btn secondary">+ Vendita vendor</Link>
          <Link href={`/partner/${id}/modifica`} prefetch={false} className="btn primary">Modifica</Link>
        </div>
      </div>

      <RecapAI partnerId={id} prompt={recapPrompt} />

      <div className="card">
        <div className="info-grid">
          <div className="info-item"><div className="k">Fee su vendite</div><div className="v">{pctIt(partner.feePercent)}</div></div>
          <div className="info-item">
            <div className="k">Cliente per l&apos;anno</div>
            <div className="v">
              {partner.clienteAnno ?? "—"}
              {/* se i movimenti dicono altro, lo si vede subito: le regole sono
                  in Impostazioni → Regole degli stati, il campo resta manuale */}
              {analisi.discordante && (
                <Link
                  href="/impostazioni/stati"
                  className="badge orange"
                  style={{ marginLeft: 8, fontSize: 11.5 }}
                  title={`${analisi.motivo} Le regole si cambiano in Impostazioni → Regole degli stati.`}
                >
                  <span className="dot" />dai movimenti: {analisi.calcolato}
                </Link>
              )}
            </div>
          </div>
          <div className="info-item"><div className="k">GG pagamento fatture</div><div className="v">{partner.ggPagamento}</div></div>
          {/* 08/09/2026: «mai deciso» si vede, non si traveste da «No». */}
          <div className="info-item">
            <div className="k">Compensazione</div>
            <div className="v">
              {partner.compensazioneDecisa ? (
                siNo(partner.compensazione)
              ) : (
                <span className="badge neutral" title="Nessuno ha ancora scelto: i conti si comportano come «no», ma la domanda è aperta. Si decide da «Modifica».">
                  <span className="dot" />mai deciso
                </span>
              )}
            </div>
          </div>
          <div className="info-item"><div className="k">Commissioni a detrazione</div><div className="v">{siNo(partner.commissioniADetrazione)}</div></div>
          <div className="info-item"><div className="k">Debiti 2025</div><div className="v">{euro(partner.debiti2025)}</div></div>
          <div className="info-item"><div className="k">Crediti 2025</div><div className="v">{euro(partner.crediti2025)}</div></div>
          {/* L'IBAN lo possiede il registro Anagrafiche: qui c'è al più una
              copia, e in 101 partner su 119 non c'è. Mostrare «—» faceva
              credere che mancasse, mentre nel registro c'era (segnalato il
              04/09/2026). Il registro si interroga SOLO se la copia manca. */}
          <div className="info-item">
            <div className="k">IBAN</div>
            <div className="v">
              {banca.iban || "—"}
              {banca.fonte === "registro" && (
                <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>dal registro</span>
              )}
              {!banca.iban && !banca.registroRisponde && (
                <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>registro non raggiungibile</span>
              )}
            </div>
          </div>
        </div>
        {partner.note && (
          <p style={{ marginTop: 14, fontSize: 13.5, color: "var(--text-secondary)" }}>{partner.note}</p>
        )}
      </div>

      {/* Esito di «Chiedi a Transactions» (richiediPagamento redirige qui):
          senza questi due blocchi il rifiuto finiva nell'URL e la pagina si
          ricaricava identica — il bottone sembrava rotto (visto su ARTE E
          FIORI senza IBAN, 24/08/2026). */}
      {/* ⭐ 09/09/2026 — l'extra rifiutato lo diceva solo l'URL. `aggiungiExtra`
          redirige con `?extra=…` da sempre, ma qui nessuno lo leggeva: il modulo
          tornava vuoto e sembrava che il salvataggio fosse andato. Stesso
          difetto già pagato su «Chiedi a Transactions» il 24/08. */}
      {sp.extra && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}
        >
          <span style={{ color: "var(--red)", fontSize: 14 }}>
            Extra non aggiunto —{" "}
            {sp.extra === "descrizione"
              ? "manca il perché. Da oggi la descrizione è obbligatoria: un importo senza causale, fra un anno, non se lo spiega più nessuno."
              : "l'importo manca o è zero. Positivo = aggiunta a favore del partner, negativo = detrazione."}
          </span>
        </div>
      )}
      {sp.errorePag && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}
        >
          <span style={{ color: "var(--red)", fontSize: 14 }}>Pagamento non richiesto — {sp.errorePag}</span>
        </div>
      )}
      {sp.richiesta && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--blue)" }}>
          <span className="badge blue">
            <span className="dot" />
            {sp.richiesta.split("|")[0] === "invio"
              ? `Richiesta in partenza verso Transactions (${sp.richiesta.split("|")[1] ?? ""})`
              : sp.richiesta.split("|")[1] === "gia"
                ? `Richiesta già inviata: ${sp.richiesta.split("|")[0]}`
                : `Richiesta inviata: ${sp.richiesta.split("|")[0]}`}
          </span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
            <strong>Non è uscito nessun denaro.</strong> L&apos;esito dell&apos;invio compare sul mese tra qualche
            istante (ricarica la pagina); il pagamento va poi autorizzato da una persona dentro{" "}
            <a href="https://deluxy-transactions.vercel.app" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Deluxy Transactions</a>,
            e il mese resta «da bonificare» finché non risulta pagata.
          </p>
        </div>
      )}

      {sp.amm && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          {sp.amm === "importato" ? (
            <span className="badge green"><span className="dot" />Contatto amministrativo importato dal registro</span>
          ) : (
            <span className="badge orange">
              <span className="dot" />Nessun contatto amministrativo trovato nel registro Anagrafiche
            </span>
          )}
        </div>
      )}

      {sp.anag && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className={`badge ${/Collegat|rimoss/i.test(sp.anag) ? "green" : "orange"}`}>
            <span className="dot" />{decodeURIComponent(sp.anag)}
          </span>
        </div>
      )}

      {/* si arriva qui dalla scheda della fattura appena eliminata: quella
          pagina non esiste più, e senza una parola l'operazione sembrerebbe
          non essere avvenuta */}
      {sp.fattEliminata && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Fattura eliminata</span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
            Non è più nei conti di questo partner.{" "}
            {sp.ficEsito === "eliminata"
              ? "Cancellata anche su Fatture in Cloud: non era ancora stata inviata allo SDI."
              : sp.ficEsito === "inviata"
                ? `Su Fatture in Cloud NON è stata toccata: era già andata allo SDI (stato «${sp.ficMsg ?? "?"}»). Per annullarla serve una nota di credito.`
                : sp.ficEsito === "diversa"
                  ? `Su Fatture in Cloud quel numero è ora un ALTRO documento (${sp.ficMsg ?? "?"}): non l'ho toccato. Succede quando si cancella una bozza su FIC e il numero viene riassegnato alla fattura successiva.`
                : sp.ficEsito === "non_trovata"
                  ? "Su Fatture in Cloud non c'era (già cancellata, o mai emessa lì)."
                  : sp.ficEsito === "scollegato"
                    ? "Fatture in Cloud non è collegato: là non è cambiato niente."
                    : sp.ficEsito === "errore"
                      ? `Su Fatture in Cloud NON sono riuscito a cancellarla: ${sp.ficMsg ?? "errore sconosciuto"}. Va tolta da lì a mano.`
                      : "Non aveva un numero singolo di Fatture in Cloud: là non c'era niente da cancellare."}
          </p>
        </div>
      )}

      {sp.emessa && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Fattura {decodeURIComponent(sp.emessa)} emessa su Fatture in Cloud</span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
            Registrata qui sotto{sp.mese ? ` nel mese di ${nomeMese(Number(sp.mese))}` : ""}. Non è stata inviata allo SDI: si
            controlla e si invia da Fatture in Cloud. Se è sbagliata, «Elimina» sulla sua riga la cancella anche di là.
          </p>
        </div>
      )}

      {sp.ficCollegata && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />
            Fattura commissioni collegata: {sp.ficCollegata}
          </span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
            Su Fatture in Cloud non è cambiato niente: è l&apos;app che ora sa qual è la fattura di quel mese.
          </p>
        </div>
      )}
      {sp.ficErrore && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}
        >
          <span style={{ color: "var(--red)", fontSize: 14 }}>{sp.ficErrore}</span>
        </div>
      )}

      {sp.ficreg && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          {sp.ficreg === "ok" ? (
            <span className="badge green"><span className="dot" />Fattura FIC registrata come «Servizio a fatturazione» — ora è nei conteggi</span>
          ) : sp.ficreg === "fee" ? (
            <span className="badge green">
              <span className="dot" />Agganciata come <strong>fattura commissioni</strong> del mese: la fee era già
              conteggiata sulle vendite, quindi non viene sommata di nuovo
            </span>
          ) : sp.ficreg === "gia" ? (
            <span className="badge neutral"><span className="dot" />Quella fattura era già registrata come servizio</span>
          ) : (
            <span className="badge orange"><span className="dot" />Dati insufficienti per registrare la fattura</span>
          )}
        </div>
      )}

      <Suspense
        fallback={
          <>
            <h2 className="section-title">Salute del credito</h2>
            <div className="card">
              <span className="muted" style={{ fontSize: 13.5 }}>Calcolo l&apos;aging del credito…</span>
            </div>
          </>
        }
      >
        <CreditoCard partnerId={id} />
      </Suspense>

      <ContattoAmministrativo partner={partner} fattureAperte={fattureAperte} smtpAttivo={smtpAttivo} />

      <Suspense
        fallback={
          <>
            <h2 className="section-title">Anagrafica dal registro centralizzato</h2>
            <div className="card">
              <span className="muted" style={{ fontSize: 13.5 }}>Carico l&apos;anagrafica dal registro…</span>
            </div>
          </>
        }
      >
        <AnagraficaCard nomePartner={partner.nome} anagraficaId={partner.anagraficaId} partnerId={partner.id} />
      </Suspense>

      <h2 className="section-title">Ultimi movimenti bancari</h2>
      <div className="card tight" style={{ marginBottom: 24 }}>
        {ultimiMovimenti.length === 0 ? (
          <p className="muted" style={{ fontSize: 13.5, padding: "16px 20px", margin: 0 }}>
            Nessun movimento bancario per questo partner: né attribuito in riconciliazione, né
            riconoscibile dal nome nella controparte. Compaiono qui appena arrivano da{" "}
            <Link href="/movimenti">Movimenti</Link> o si riconciliano in{" "}
            <Link href="/transazioni">Import &amp; riconciliazione</Link>.
            {/* ⚠️ 08/09/2026 — «vuoto» ha DUE motivi diversi, e vanno detti: non
                c'è niente, oppure il nome del partner non è riconoscibile. Il
                secondo capita a chi si chiama solo con parole del mestiere
                («ARTE E FIORI»: resta il solo token ARTE, di 4 lettere, che il
                motore non accetta mai) e non si risolve aspettando. */}
            {scartatiDalFiltro > 0 && (
              <>
                <br />
                <br />
                <strong>{scartatiDalFiltro} movimenti</strong> contengono «{tokenNome.join("», «")}» nella
                controparte ma <strong>non bastano a riconoscere questo partner</strong>: sono nomi diversi
                che condividono un pezzo di parola (per esempio «m<em>arte</em>l», «dolci<em>arte</em>»).
                Serve un token di almeno 5 lettere, o due token — e il nome di questo partner non ce li ha.
                Il modo di collegarli è attribuirne uno in{" "}
                <Link href="/transazioni">Import &amp; riconciliazione</Link>: da lì quella controparte
                resta imparata e i movimenti successivi arrivano da soli.
              </>
            )}
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th>Stato</th><th className="num">Importo</th><th></th></tr>
                </thead>
                <tbody>
                  {ultimiMovimenti.map((m) => (
                    // La riga si apre col click e mostra il movimento in una
                    // FINESTRA, senza cambiare pagina (chiesto il 04/09/2026):
                    // qui i movimenti si scorrono uno dopo l'altro, e cambiare
                    // pagina farebbe perdere il posto nell'elenco. I bottoni
                    // «Scollega» e «Non è di questo partner» restano loro.
                    <RigaMovimento key={m.id} movimento={perLaFinestra(m)}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <ApriDettaglio title="Apri il dettaglio del movimento">{dataIt(m.data)}</ApriDettaglio>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <ApriDettaglio forte title={m.descrizione}>{m.descrizione}</ApriDettaglio>
                        {m.controparte && <div className="muted" style={{ fontSize: 12 }}>{m.controparte}</div>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {m.partnerId === id ? (
                          m.stato === "registrata" ? (
                            <span className="badge green"><span className="dot" />registrata</span>
                          ) : m.stato === "ignorata" ? (
                            <span className="badge neutral"><span className="dot" />ignorata</span>
                          ) : (
                            <span className="badge orange"><span className="dot" />da lavorare</span>
                          )
                        ) : (
                          // ⚠️ Se la riconciliazione darebbe questo movimento a
                          // un ALTRO partner, la riga lo dice: è l'informazione
                          // che serve per decidere, non rumore da nascondere.
                          contesi.has(m.id) ? (
                            <span className="badge orange" title={`Il nome combacia anche con questo partner, ma la riconciliazione lo assegnerebbe a ${contesi.get(m.id)}. Guarda prima di confermarlo qui.`}>
                              <span className="dot" />per nome — il motore lo darebbe a {contesi.get(m.id)}
                            </span>
                          ) : (
                            <span className="badge neutral" title="Non ancora attribuito a questo partner: abbinato per nome della controparte con la stessa regola della riconciliazione (parole intere). Conferma in riconciliazione.">
                              <span className="dot" />per nome — da confermare
                            </span>
                          )
                        )}
                      </td>
                      <td className={`num ${m.importo > 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                        {m.importo > 0 ? "+" : "−"}{euro(Math.abs(m.importo))}
                      </td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        {m.partnerId === id ? (
                          // Attribuito: scollegare azzera il legame e lo rimette
                          // in coda alla riconciliazione.
                          <form action={scollegaMovimentoAttribuito.bind(null, id, m.id)} style={{ display: "inline" }}>
                            <ConfermaElimina
                              className="btn small secondary"
                              classeConferma="btn small danger-solid"
                              trigger="Scollega"
                              inCorso="Scollego…"
                              verbo="Scollega"
                              oggetto="questo movimento dal partner"
                              conseguenza="Il movimento non si cancella: torna fra quelli da riconciliare, per attribuirlo al partner giusto."
                            />
                          </form>
                        ) : (
                          // Candidato per nome (omonimo): non è collegato, lo si
                          // esclude in modo persistente SOLO da questa scheda.
                          <form action={escludiMovimentoDaPartner.bind(null, id, m.id)} style={{ display: "inline" }}>
                            <ConfermaElimina
                              className="btn small secondary"
                              classeConferma="btn small danger-solid"
                              trigger="Non è di questo partner"
                              inCorso="Escludo…"
                              verbo="Escludi"
                              oggetto="questo movimento da questa scheda"
                              conseguenza="È un omonimo: sparisce da qui in modo permanente, ma resta riconciliabile altrove e per il partner giusto."
                            />
                          </form>
                        )}
                      </td>
                    </RigaMovimento>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 12, padding: "10px 20px", margin: 0 }}>
              I movimenti <strong>attribuiti</strong> a questo partner in riconciliazione, più quelli che
              la riconciliazione attribuirebbe qui in base al nome (marcati «per nome — da confermare»):
              stessa regola del motore — parole intere, non pezzi di parola.{" "}
              {scartatiDalFiltro > 0 && (
                <>
                  Altri <strong>{scartatiDalFiltro}</strong> contengono «{tokenNome.join("», «")}» nella
                  controparte ma sono nomi diversi, e restano fuori.{" "}
                </>
              )}
              <Link href={`/movimenti?q=${encodeURIComponent(partner.nome)}`}>Cerca «{partner.nome}» in tutti i movimenti →</Link>
            </p>
          </>
        )}
        {movimentiEsclusi.length > 0 && (
          <details style={{ borderTop: "1px solid var(--hairline)" }}>
            <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--text-secondary)", padding: "10px 20px" }}>
              Movimenti esclusi da questa scheda ({movimentiEsclusi.length}) — omonimi nascosti a mano
            </summary>
            <div className="table-wrap">
              <table>
                <tbody>
                  {movimentiEsclusi.map((m) => (
                    // stessa regola della tabella sopra: la riga apre la finestra
                    <RigaMovimento key={m.id} movimento={perLaFinestra(m)}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <ApriDettaglio title="Apri il dettaglio del movimento">{dataIt(m.data)}</ApriDettaglio>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <ApriDettaglio title={m.descrizione}>{m.descrizione}</ApriDettaglio>
                        {m.controparte && <div className="muted" style={{ fontSize: 12 }}>{m.controparte}</div>}
                      </td>
                      <td className={`num ${m.importo > 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                        {m.importo > 0 ? "+" : "−"}{euro(Math.abs(m.importo))}
                      </td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <form action={ripristinaMovimentoEscluso.bind(null, id, m.id)} style={{ display: "inline" }}>
                          <BottoneInvio className="btn small secondary" inCorso="Ripristino…" title="Rimette questo movimento fra i candidati per nome di questa scheda">
                            Ripristina
                          </BottoneInvio>
                        </form>
                      </td>
                    </RigaMovimento>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      {aiMailConfigurata() && (
        <Suspense
          key={`mail-${sp.mail ?? ""}`}
          fallback={
            <>
              <h2 className="section-title">Posta con il cliente</h2>
              <div className="card">
                <span className="muted" style={{ fontSize: 13.5 }}>Cerco la posta su AI Mail…</span>
              </div>
            </>
          }
        >
          <MailPartnerCard
            partnerId={id}
            nomePartner={partner.nome}
            anagraficaId={partner.anagraficaId}
            q={sp.mail}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <FattureFicPartner partnerId={id} partnerNome={partner.nome} />
      </Suspense>

      <h2 className="section-title">Fee nel tempo</h2>
      <div className="card">
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12 }}>
          Fee base attuale <strong>{pctIt(partner.feePercent)}</strong>. Se la fee cambia da un certo
          mese, aggiungi una decorrenza: le vendite di quel mese in poi la useranno automaticamente,
          quelle precedenti restano invariate.
        </p>
        {tariffe.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="mini-table">
              <thead>
                <tr><th>Dal</th><th>Fee</th><th></th></tr>
              </thead>
              <tbody>
                {tariffe.map((t) => (
                  <tr key={t.id}>
                    <td>{nomeMese(t.dalMese)} {t.dalAnno}</td>
                    <td>{pctIt(t.feePercent)}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={eliminaTariffa.bind(null, t.id, id, anno)}>
                        <ConfermaElimina
                          oggetto="questa tariffa"
                          conseguenza="I mesi coperti da questa fee useranno la tariffa precedente al ricalcolo."
                        />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={aggiungiTariffa.bind(null, id, anno)} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="field-label">Dal mese</label>
            <select name="dalMese" defaultValue={new Date().getMonth() + 1} style={{ width: "auto" }}>
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Anno</label>
            <input type="number" name="dalAnno" defaultValue={anno} step="1" style={{ width: 90 }} />
          </div>
          <div>
            <label className="field-label">Fee %</label>
            <input type="number" name="feePercent" step="0.1" min="0" max="100" required style={{ width: 90 }} placeholder="es. 22" />
          </div>
          <button className="btn primary small" type="submit">Aggiungi decorrenza</button>
          {venditeDisallineate > 0 && (
            <span className="muted" style={{ fontSize: 12.5, alignSelf: "center", marginLeft: "auto" }}>
              {venditeDisallineate} vendite {anno} non allineate allo storico — usa «Riallinea fee vendite» in alto.
            </span>
          )}
        </form>
      </div>

      <h2 className="section-title">Rolling {anno}</h2>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite come vendor</div>
          <div className="kpi-value">{euro(rolling.vendite)}</div>
          <div className="kpi-sub">
            Commissioni {euro(rolling.commissioni)} · {annoPrec} intero: {euro(prec.rolling.vendite)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Servizi fatturati (netto IVA)</div>
          <div className="kpi-value">{euro(rolling.fatture)}</div>
          <div className="kpi-sub">
            Stima chiusura {euro(rolling.stimaChiusura)} · {annoPrec} intero: {euro(prec.rolling.fatture)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dovuto al partner (YTD)</div>
          <div className="kpi-value">{euro(rolling.incassiNettoCommissioni)}</div>
          <div className="kpi-sub">Bonificato {euro(rolling.pagatoAlPartner)} · incassato {euro(rolling.incassatoDalPartner)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{compensazioneEffettiva ? "Residuo (in compensazione)" : "Partite aperte"}</div>
          {compensazioneEffettiva ? (
            <>
              <div className={`kpi-value ${Math.abs(rolling.residuo) < 0.01 ? "" : rolling.residuo > 0 ? "pos" : "neg"}`}>
                {euro(rolling.residuo)}
              </div>
              <div className="kpi-sub">
                {rolling.residuo > 0.01 ? "il partner deve a Deluxy" : rolling.residuo < -0.01 ? "Deluxy deve al partner" : "pareggiato"}
              </div>
            </>
          ) : (
            <>
              <div className={`kpi-value ${rolling.daBonificare >= 0.01 ? "neg" : ""}`} style={{ fontSize: 22 }}>
                {euro(rolling.daBonificare)}
              </div>
              <div className="kpi-sub">
                da bonificare al partner · <strong>{euro(rolling.daIncassare)}</strong> da incassare (fatture)
              </div>
            </>
          )}
        </div>
      </div>

      {/* ⭐ 12/09/2026 — la scelta dell'anno sta QUI, attaccata ai mesi: è la
          parte della scheda che cambia, e un comando lontano da ciò che
          comanda si fa cercare. Il rolling e il confronto lo seguono. */}
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginTop: 24 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Movimenti mensili {anno}</h2>
        <span style={{ display: "flex", gap: 6 }}>
          {anniDisponibili.map((a) => (
            <Link
              key={a}
              href={a === ANNO_CORRENTE ? `/partner/${id}` : `/partner/${id}?anno=${a}`}
              prefetch={false}
              className={`chip-link${anno === a ? " attiva" : ""}`}
              title={a === ANNO_CORRENTE ? "L'anno in corso" : `Lo storico ${a}`}
            >
              {a}
            </Link>
          ))}
        </span>
      </div>
      {/* Le righe scritte in Finance che su Fatture in Cloud non esistono non
          entrano nei conti (regola dell'utente del 04/09/2026). Non spariscono
          in silenzio però: chi le ha scritte deve sapere che non contano, e
          poterci arrivare per emetterle o cancellarle. */}
      {nonEmesse.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12, borderColor: "rgba(224,138,0,0.25)", background: "rgba(224,138,0,0.06)" }}>
          <div style={{ fontSize: 13.5, marginBottom: nonEmesse.length ? 6 : 0 }}>
            <span className="badge orange"><span className="dot" />
              {nonEmesse.length === 1 ? "1 fattura senza documento" : `${nonEmesse.length} fatture senza documento`}
            </span>{" "}
            <span className="muted">
              {nonEmesse.length === 1
                ? "non ha un numero di Fatture in Cloud: non è una fattura vera, quindi resta fuori dai conti di questa scheda. Va emessa su FIC oppure tolta."
                : "non hanno un numero di Fatture in Cloud: non sono fatture vere, quindi restano fuori dai conti di questa scheda. Vanno emesse su FIC oppure tolte."}
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
            {nonEmesse.map((f) => (
              <li key={f.id} style={{ marginTop: 2 }}>
                <Link href={`/fatture/${f.id}`} style={{ color: "var(--blue)" }}>
                  {nomeMese(f.mese)} · {euro(f.imponibile)} +IVA → {euro(f.imponibile * (1 + f.aliquotaIva / 100))}
                </Link>
                {f.descrizione ? <span className="muted"> · {f.descrizione}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {mesiConDati.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun movimento</div>
            <div className="empty-text">Inserisci una fattura servizi o una vendita vendor per iniziare.</div>
          </div>
        </div>
      )}
      {mesiConDati.map(({ mese, fatture, vendite, saldo, riepilogo: r }) => (
        <div className="month-block" key={mese} id={`mese-${mese}`} style={{ background: "var(--surface)", scrollMarginTop: 20 }}>
          <div className="month-head">
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              {nomeMese(mese)} {anno}
              {(() => {
                const v25 = valoreMese(prec.mesi[mese - 1].riepilogo);
                const v26 = valoreMese(r);
                if (!v25) return <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{annoPrec}: —</span>;
                const dp = ((v26 - v25) / v25) * 100;
                return (
                  <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                    {annoPrec}: {euro(v25)} ·{" "}
                    <span style={{ color: dp >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                      {dp >= 0 ? "+" : ""}{dp.toFixed(1).replace(".", ",")}%
                    </span>
                  </span>
                );
              })()}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* stellina: questo mese ha una nota dell'operatore (il testo è nel
                  tooltip, la nota vera si legge e si modifica in fondo al blocco) */}
              {saldo?.note?.trim() && (
                <span className="badge gold" title={`Nota del mese: ${saldo.note.trim()}`}>
                  ★ Nota
                </span>
              )}
              {sp.nota && sp.mese === String(mese) && (
                <span className="badge green">
                  <span className="dot" />
                  {sp.nota === "ok" ? "Nota salvata" : "Nota rimossa"}
                </span>
              )}
              {r.pareggiato && <span className="badge green"><span className="dot" />Pareggiato</span>}
              {r.daBonificare >= 0.01 && (
                <span className="badge orange"><span className="dot" />Da bonificare {euro(r.daBonificare)}</span>
              )}
              {r.daIncassare >= 0.01 && (
                <span className="badge orange"><span className="dot" />Da incassare {euro(r.daIncassare)}</span>
              )}
              <Link href={`/saldi?anno=${anno}&mese=${mese}&q=${encodeURIComponent(partner.nome.slice(0, 12))}`} className="btn small secondary">
                Saldo mese
              </Link>
            </span>
          </div>
          <div className="month-body">
            <div className="table-wrap">
              <table className="mini-table">
                <tbody>
                  {fatture.map((f) => (
                    <tr key={f.id}>
                      <td style={{ width: 170 }} className="muted">Servizi a fatturazione</td>
                      <td>
                        {f.tipologia.nome} ·{" "}
                        {/* 08/09/2026: il numero apre una FINESTRA col documento
                            di Fatture in Cloud, non la pagina — nella scheda le
                            fatture si guardano una dopo l'altra e cambiare
                            pagina fa perdere il posto nei dodici mesi. Stessa
                            deroga al §8 già approvata per i movimenti bancari di
                            questa scheda. La pagina intera resta, dal piede
                            della finestra. */}
                        <FatturaLink
                          fattura={{
                            id: f.id,
                            numero: f.numero,
                            anno: f.anno,
                            mese: f.mese,
                            tipologia: f.tipologia.nome,
                            imponibile: f.imponibile,
                            aliquotaIva: f.aliquotaIva,
                            scadenza: f.scadenza,
                            emissione: f.emissione,
                            pagata: f.pagata,
                            dataPagamento: f.dataPagamento,
                            compensata: f.compensata,
                            incassato: f.incassato,
                            descrizione: f.descrizione,
                            partnerNome: partner.nome,
                          }}
                        >
                          fatt. {f.numero ?? "s.n."}
                        </FatturaLink>
                      </td>
                      <td>scad. {dataIt(f.scadenza)}</td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {f.pagata ? (
                            <>
                              <span className="badge green">
                                <span className="dot" />
                                Saldata{f.dataPagamento ? ` ${dataIt(f.dataPagamento)}` : ""}
                              </span>
                              <form action={segnaFatturaPagata.bind(null, f.id, false, undefined)}>
                                <button className="btn small secondary" type="submit" title="Riporta da incassare (storna anche l'incasso registrato)">
                                  Riapri
                                </button>
                              </form>
                            </>
                          ) : f.compensata ? (
                            <>
                              <span className="badge blue">
                                <span className="dot" />
                                In compensazione
                              </span>
                              <form action={segnaFatturaCompensata.bind(null, f.id, false)}>
                                <button className="btn small secondary" type="submit" title="Riporta da incassare">
                                  Riapri
                                </button>
                              </form>
                            </>
                          ) : (
                            <>
                              {parzialmenteIncassata(f) ? (
                                <span className="badge gold"><span className="dot" />Residuo {euro(residuoFattura(f))}</span>
                              ) : (
                                <span className="badge orange"><span className="dot" />Da incassare</span>
                              )}
                              <Link href={`/fatture/${f.id}`} className="btn small secondary" title="Registra un incasso totale o parziale">
                                Incassa…
                              </Link>
                              <form action={segnaFatturaPagata.bind(null, f.id, true, undefined)} style={{ display: "inline" }}>
                                <button
                                  className="btn small secondary"
                                  type="submit"
                                  title="Bonifico RICEVUTO in banca per l'intero importo: registra l'incasso; il dovuto vendite resta interamente da pagare al partner"
                                >
                                  Salda tutto
                                </button>
                              </form>
                              <form action={segnaFatturaCompensata.bind(null, f.id, true)} style={{ display: "inline" }}>
                                <button
                                  className="btn small secondary"
                                  type="submit"
                                  title="NIENTE bonifico: l'importo viene scalato dai prossimi dovuti al partner finché è coperto"
                                >
                                  Compensata
                                </button>
                              </form>
                            </>
                          )}
                          {/* Elimina: dalla riga, senza passare dalla scheda (10/09/2026).
                              Cancella anche su Fatture in Cloud se non è mai andata
                              allo SDI; l'esito lo dice il riquadro in cima. */}
                          <form action={deleteFattura.bind(null, f.id, `/partner/${id}?fattEliminata=1#mese-${f.mese}`)} style={{ display: "inline" }}>
                            <ConfermaElimina
                              className="btn small secondary"
                              trigger="Elimina"
                              inCorso="Elimino…"
                              oggetto={`la fattura ${f.numero ?? "senza numero"} (${euro(f.imponibile)})`}
                              conseguenza="Sparisce dai conti del partner. Su Fatture in Cloud viene cancellata solo se non è mai stata inviata allo SDI; se è partita resta lì e serve una nota di credito."
                              title="Elimina la fattura dall'app e, se non è ancora allo SDI, anche da Fatture in Cloud"
                            />
                          </form>
                        </span>
                      </td>
                      <td className="num">
                        {euro(f.imponibile)} <span className="muted">+IVA → {euro(ivato(f))}</span>
                        {parzialmenteIncassata(f) && (
                          <div className="muted" style={{ fontSize: 11 }}>incassato {euro(incassatoFattura(f))}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {vendite.map((v) => (
                    <tr key={v.id}>
                      <td className="muted">Vendite come vendor</td>
                      <td>
                        <Link href={`/vendite/${v.id}`} style={{ color: "var(--blue)" }} title="Apri e modifica la vendita (incasso, fee…)">
                          {v.descrizione ?? "Vendite"}
                        </Link>
                        {v.data ? ` · ${dataIt(v.data)}` : ""}
                      </td>
                      <td>
                        fee {pctIt(v.feePercent)} → comm. {euro(commissione(v))}
                        {v.feePercent !== feeAttesaVendita(v) && (
                          <Link href={`/vendite/${v.id}`} className="badge orange" style={{ marginLeft: 6 }} title={`Per ${nomeMese(v.mese)} la fee prevista è ${feeAttesaVendita(v)}%`}>
                            <span className="dot" />attesa {pctIt(feeAttesaVendita(v))}?
                          </Link>
                        )}
                      </td>
                      <td>
                        {saldo?.commFattEmessa ? (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span className="badge green"><span className="dot" />Fatt. comm. {saldo.commFattNumero ?? ""}</span>
                            {/* correggibile: collegare è un clic, e un numero
                                sbagliato non deve richiedere il database */}
                            <form
                              action={scollegaFatturaCommissioni.bind(null, partner.id, anno, mese, tornaA)}
                              style={{ display: "inline" }}
                            >
                              <button
                                className="btn small secondary"
                                type="submit"
                                title="Toglie il collegamento: il mese torna «da emettere». Non cancella niente su Fatture in Cloud."
                              >
                                Scollega
                              </button>
                            </form>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span className="badge neutral"><span className="dot" />Fatt. comm. da emettere</span>
                            <Link
                              className="btn small secondary"
                              href={`/fic/emetti?partnerId=${partner.id}&anno=${anno}&mese=${mese}`}
                              title="Crea la fattura commissioni su Fatture in Cloud"
                            >
                              Emetti
                            </Link>
                            {/* la fattura può essere già stata fatta a mano su FIC */}
                            <CollegaFatturaCommissioni
                              partnerId={partner.id}
                              partnerNome={partner.nome}
                              anno={anno}
                              mese={mese}
                              tornaA={tornaA}
                              candidate={candidateFic}
                            />
                          </span>
                        )}
                      </td>
                      <td className="num">{euro(v.incassoLordo)} <span className="muted">→ dovuto {euro(dovutoVendita(v))}</span></td>
                    </tr>
                  ))}
                  <tr>
                    <td className="muted" style={{ verticalAlign: "top" }}>Extra</td>
                    <td colSpan={3}>
                      {(extraPerMese.get(mese) ?? []).map((e) => (
                        <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "2px 0", fontSize: 13 }}>
                          <span style={{ color: e.importo >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500, minWidth: 78 }} className="num">
                            {e.importo >= 0 ? "+" : ""}{euro(e.importo)}
                          </span>
                          <span style={{ color: "var(--text-secondary)" }}>{e.descrizione ?? (e.importo >= 0 ? "aggiunta" : "detrazione")}</span>
                          {/* ⭐ 09/09/2026: da dove viene la voce. Un extra
                              importato dal foglio non l'ha deciso nessuno qui,
                              e chi lo cancella deve saperlo prima di premere. */}
                          {e.origine === "import" && (
                            <span className="badge neutral" style={{ fontSize: 11 }} title="Arriva da PARTNER.xlsx: nel foglio non aveva una causale.">
                              <span className="dot" />dal foglio
                            </span>
                          )}
                          <form action={eliminaExtra.bind(null, e.id, id)} style={{ display: "inline", marginLeft: "auto" }}>
                            <ConfermaElimina
                              oggetto="questa voce extra"
                              conseguenza="L'importo aggiunto o detratto sparisce dal saldo del mese."
                              title="Elimina questa voce extra"
                            />
                          </form>
                        </div>
                      ))}
                      <form action={aggiungiExtra.bind(null, id, anno, mese)} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                        {/* ⭐ 09/09/2026 (regola dell'utente): «per tutti gli
                            extra d'ora in poi la descrizione è obbligatoria».
                            Un numero senza causale è il motivo per cui 211 mesi
                            importati non si sanno più spiegare. */}
                        <input
                          type="text"
                          name="descrizione"
                          placeholder="perché (obbligatorio)"
                          required
                          maxLength={200}
                          style={{ fontSize: 12.5, padding: "5px 8px", flex: "1 1 160px" }}
                        />
                        <input type="number" name="importo" step="0.01" placeholder="+ o − €" title="Positivo = aggiunta a favore del partner · Negativo = detrazione" style={{ fontSize: 12.5, padding: "5px 8px", width: 110 }} required />
                        <button className="btn small secondary" type="submit">Aggiungi extra</button>
                      </form>
                    </td>
                    <td className="num" style={{ verticalAlign: "top", fontWeight: 600 }}>{euro(r.aggiunte - r.detrazioni)}</td>
                  </tr>
                  {r.compensazione ? (
                    <tr style={{ background: "var(--bg)" }}>
                      <td className="muted">Saldo del mese (compensazione)</td>
                      <td colSpan={2}>
                        Fatture IVATE {euro(r.serviziIvato)} − dovuto vendite {euro(r.dovutoPartner)} ={" "}
                        <strong>{euro(r.saldo)}</strong>{" "}
                        <span className="muted">
                          {Math.abs(r.saldo) < 0.01 ? "" : r.saldo > 0 ? "(il partner ci deve)" : "(dobbiamo al partner)"}
                        </span>
                      </td>
                      <td>
                        {saldo?.bonificoImporto != null &&
                          // Stessa cosa del blocco mensile: se c'è il
                          // riferimento, da qui si apre la richiesta su
                          // Transactions — dove il pagamento è stato
                          // autorizzato e dove sta la sua prova (08/09/2026).
                          (saldo.richiestaRif ? (
                            <a
                              className="muted"
                              href={`https://deluxy-transactions.vercel.app/richieste/${encodeURIComponent(saldo.richiestaRif)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Apri la richiesta ${saldo.richiestaRif} su Deluxy Transactions`}
                            >
                              {saldo.bonificoImporto > 0 ? "Pagato al partner" : "Incassato"}{" "}
                              {euro(Math.abs(saldo.bonificoImporto))}
                              {saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""} ↗
                            </a>
                          ) : (
                            <span className="muted">
                              {saldo.bonificoImporto > 0 ? "Pagato al partner" : "Incassato"}{" "}
                              {euro(Math.abs(saldo.bonificoImporto))}
                              {saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                            </span>
                          ))}
                      </td>
                      <td className={`num ${r.pareggiato ? "" : r.residuo > 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                        residuo {euro(r.residuo)}
                      </td>
                    </tr>
                  ) : (
                    <>
                      <tr style={{ background: "var(--bg)" }}>
                        <td className="muted">Da bonificare al partner</td>
                        <td colSpan={2}>
                          {/* ⚠️ 08/09/2026 (segnalazione dell'utente): qui c'era
                              scritto «Dovuto vendite» davanti a `dovutoPartner`,
                              che è dovuto vendite **più gli extra, meno le
                              detrazioni**. Sulla stessa pagina si leggeva 99,38 €
                              sulla riga delle vendite e 114,38 € qui, senza che
                              niente dicesse da dove venisse la differenza — e
                              sembrava che l'app si contraddicesse. Ora la somma
                              si vede pezzo per pezzo. */}
                          Dovuto vendite {euro(r.dovutoVendite)}
                          {r.commissioniAParte && (
                            <span className="muted"> (venduto pieno: la commissione si fattura a parte)</span>
                          )}
                          {!r.extraSospetto && r.aggiunte > 0.005 && <> + extra {euro(r.aggiunte)}</>}
                          {r.detrazioni > 0.005 && <> − detrazioni {euro(r.detrazioni)}</>}
                          {(( !r.extraSospetto && r.aggiunte > 0.005) || r.detrazioni > 0.005) && <> = {euro(r.dovutoEffettivo)}</>}
                          {r.bonificoInviato > 0 && <> − già bonificato {euro(r.bonificoInviato)}</>}
                          {/* Lo sforo, nei due versi. Si CALCOLA dal bonifico:
                              annullando il bonifico sparisce da sé, senza niente
                              da cancellare (regola dell'utente, 08/09/2026). */}
                          {r.pagatoInPiu > 0.005 && (
                            <div style={{ marginTop: 4 }}>
                              <span className="badge red" title="Uscito più del dovuto: è un errore, e va scalato dai prossimi bonifici a questo partner.">
                                <span className="dot" />inviato in più {euro(r.pagatoInPiu)} — da recuperare
                              </span>
                              {r.extraSospetto && (
                                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                  I {euro(r.aggiunte)} che il vecchio foglio portava come «extra» non erano un
                                  dovuto: non hanno una causale, e servivano a far quadrare il mese con quanto
                                  era uscito. Qui il dovuto è quello delle vendite.
                                </div>
                              )}
                            </div>
                          )}
                          {r.daBonificare > 0.005 && r.bonificoInviato > 0.005 && (
                            <div style={{ marginTop: 4 }}>
                              <span className="badge orange" title="Uscito meno del dovuto: il resto va aggiunto ai prossimi bonifici.">
                                <span className="dot" />inviato in meno {euro(r.daBonificare)} — ancora da versare
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          {saldo?.bonificoImporto != null && saldo.bonificoImporto > 0 && (
                            <span className="muted">
                              Bonifico inviato{saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                            </span>
                          )}
                        </td>
                        <td className={`num ${r.daBonificare >= 0.01 ? "neg" : ""}`} style={{ fontWeight: 600 }}>
                          {euro(r.daBonificare)}
                        </td>
                      </tr>
                      <tr style={{ background: "var(--bg)" }}>
                        <td className="muted">Da incassare dal partner</td>
                        <td colSpan={2}>
                          Fatture non saldate {euro(r.serviziNonPagatiNetto)}{" "}
                          <span className="muted">+IVA → {euro(r.serviziNonPagati)}</span>
                          {/* ⭐ 09/09/2026 (regola dell'utente): «senza
                              compensazione il dovuto è pari al venduto e si apre
                              una nuova riga per mese con il valore della fattura
                              delle commissioni che il partner dovrà pagare».
                              Vale SOLO per chi ha deciso di NON compensare: chi
                              non ha mai risposto resta col dovuto già al netto,
                              e qui non compare niente. */}
                          {r.commissioniAParte && r.commissioniDaIncassare > 0.005 && (
                            <>
                              {" "}+ commissioni {euro(r.commissioni)}{" "}
                              <span className="muted">+IVA → {euro(r.commissioniDaIncassare)}</span>
                              {saldo?.commFattNumero ? (
                                <span className="muted"> (fattura {saldo.commFattNumero})</span>
                              ) : (
                                <span className="muted"> (da fatturare)</span>
                              )}
                            </>
                          )}
                          {r.bonificoRicevuto > 0 && <> − acconti ricevuti {euro(r.bonificoRicevuto)}</>}
                          {/* Stesso principio nell'altro verso: se il partner ha
                              versato più di quello che doveva, la differenza si
                              dichiara invece di sparire nello zero. */}
                          {r.incassatoInPiu > 0.005 && (
                            <div style={{ marginTop: 2 }}>
                              <span className="badge orange">
                                <span className="dot" />incassato in più {euro(r.incassatoInPiu)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          {saldo?.bonificoImporto != null && saldo.bonificoImporto < 0 && (
                            <span className="muted">
                              Incasso registrato{saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                            </span>
                          )}
                        </td>
                        <td className={`num ${r.daIncassare >= 0.01 ? "pos" : ""}`} style={{ fontWeight: 600 }}>
                          {euro(r.daIncassare)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <PagamentoMese
              partnerId={partner.id}
              anno={anno}
              mese={mese}
              daBonificare={r.daBonificare}
              daIncassare={r.daIncassare}
              bonificoImporto={saldo?.bonificoImporto ?? null}
              bonificoData={saldo?.bonificoData ?? null}
              note={saldo?.note ?? null}
              noteAggiornateIl={saldo?.noteAggiornateIl ?? null}
              trxAttiva={trxAttiva}
              richiestaRif={saldo?.richiestaRif ?? null}
              richiestaStato={saldo?.richiestaStato ?? null}
              richiestaIl={saldo?.richiestaIl ?? null}
              pagatoInPiu={r.pagatoInPiu}
              incassatoInPiu={r.incassatoInPiu}
              movimentoId={movimentoDelMese(saldo?.bonificoData, saldo?.bonificoImporto)}
            />
          </div>
        </div>
      ))}

      {mesiConDati.length > 0 && (() => {
        // Totale YTD: somma dei mesi con dati, confrontata con lo stesso periodo 2025
        const ultimoMese = Math.max(...mesiConDati.map((m) => m.mese));
        const ytd = mesi.slice(0, ultimoMese).map((m) => m.riepilogo);
        const sum = (fn: (r: (typeof ytd)[number]) => number) => ytd.reduce((a, r) => a + fn(r), 0);
        const ytdPrec = prec.mesi.slice(0, ultimoMese).map((m) => m.riepilogo);
        const sumPrec = (fn: (r: (typeof ytdPrec)[number]) => number) => ytdPrec.reduce((a, r) => a + fn(r), 0);
        const totCur = sum((r) => r.vendite + r.serviziNetto);
        const totPrec = sumPrec((r) => r.vendite + r.serviziNetto);
        const dp = totPrec ? ((totCur - totPrec) / totPrec) * 100 : null;
        // ⚠️ 09/09/2026 — IL TOTALE SOMMAVA I MESI SENZA TOGLIERE LO SFORO.
        // Sulla stessa scheda si leggeva «Da bonificare 149,43 €» e, due righe
        // sotto, «Surplus da recuperare 549,42 €»: due numeri che si
        // contraddicono. Il motore la regola ce l'ha già (`rolling`): quello che
        // è uscito in più si TRATTIENE dai bonifici successivi, quindi va tolto
        // dal totale prima di dirlo. Qui si rifà lo stesso conto sul periodo
        // YTD (gennaio–ultimo mese), che è più corto dell'anno intero.
        const daBonificareLordoYtd = sum((r) => r.daBonificare);
        const inviatoInPiuYtd = sum((r) => r.pagatoInPiu);
        const daBonificareYtd = Math.max(0, daBonificareLordoYtd - inviatoInPiuYtd);
        const surplusYtd = Math.max(0, inviatoInPiuYtd - daBonificareLordoYtd);
        // Il surplus è denaro NOSTRO che sta dal partner: nel totale conta come
        // qualcosa da ricevere, non come qualcosa da pagare (richiesta
        // dell'utente: «su totale dovrebbe uscire che noi dobbiamo ricevere dei
        // soldi»).
        const daIncassareYtd = sum((r) => r.daIncassare);
        const daRicevereYtd = daIncassareYtd + surplusYtd;
        return (
          <div className="month-block" style={{ background: "var(--surface)" }}>
            <div className="month-head">
              <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                Totale YTD {anno} (Gennaio–{nomeMese(ultimoMese)})
                <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                  {annoPrec} stesso periodo: {totPrec ? euro(totPrec) : "—"}
                  {dp != null && (
                    <>
                      {" · "}
                      <span style={{ color: dp >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                        {dp >= 0 ? "+" : ""}{dp.toFixed(1).replace(".", ",")}%
                      </span>
                    </>
                  )}
                </span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {compensazioneEffettiva ? (
                  // in compensazione crediti e debiti si annullano: un solo netto
                  Math.abs(daIncassareYtd - daBonificareYtd) < 0.01 ? (
                    <span className="badge green"><span className="dot" />Compensato — pari</span>
                  ) : daIncassareYtd - daBonificareYtd > 0 ? (
                    <span className="badge orange"><span className="dot" />Da incassare {euro(daIncassareYtd - daBonificareYtd)} (netto)</span>
                  ) : (
                    <span className="badge orange"><span className="dot" />Da bonificare {euro(daBonificareYtd - daIncassareYtd)} (netto)</span>
                  )
                ) : (
                  <>
                    {daBonificareYtd < 0.01 && daRicevereYtd < 0.01 && (
                      <span className="badge green"><span className="dot" />Tutto pareggiato</span>
                    )}
                    {daBonificareYtd >= 0.01 && (
                      <span className="badge orange"><span className="dot" />Da bonificare {euro(daBonificareYtd)}</span>
                    )}
                    {daIncassareYtd >= 0.01 && (
                      <span className="badge orange"><span className="dot" />Da incassare {euro(daIncassareYtd)}</span>
                    )}
                    {surplusYtd >= 0.01 && (
                      <span className="badge red" title="Gli abbiamo mandato più del dovuto: quei soldi tornano indietro trattenendoli dai prossimi bonifici.">
                        <span className="dot" />Da recuperare {euro(surplusYtd)}
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
            <div className="month-body">
              <div className="table-wrap">
                <table className="mini-table">
                  <tbody>
                    <tr>
                      <td style={{ width: 170 }} className="muted">Vendite come vendor</td>
                      <td>commissioni {euro(sum((r) => r.commissioni))}</td>
                      <td className="num">{euro(sum((r) => r.vendite))} <span className="muted">→ dovuto {euro(sum((r) => r.dovutoPartner))}</span></td>
                    </tr>
                    <tr>
                      <td className="muted">Servizi a fatturazione</td>
                      <td>IVA inclusa {euro(sum((r) => r.serviziIvato))}</td>
                      <td className="num">{euro(sum((r) => r.serviziNetto))} <span className="muted">netto IVA</span></td>
                    </tr>
                    {compensazioneEffettiva ? (
                      <tr style={{ background: "var(--bg)" }}>
                        <td className="muted">Saldo compensato (netto)</td>
                        <td>Già incassato {euro(rolling.incassatoDalPartner)} · già bonificato {euro(rolling.pagatoAlPartner)}</td>
                        <td className={`num ${daIncassareYtd - daBonificareYtd > 0.01 ? "pos" : daIncassareYtd - daBonificareYtd < -0.01 ? "neg" : ""}`} style={{ fontWeight: 600 }}>
                          {euro(daIncassareYtd - daBonificareYtd)}{" "}
                          <span className="muted">
                            {daIncassareYtd - daBonificareYtd > 0.01 ? "(il partner ci deve)" : daIncassareYtd - daBonificareYtd < -0.01 ? "(dobbiamo bonificare)" : "(pari)"}
                          </span>
                        </td>
                      </tr>
                    ) : (
                      <>
                        <tr style={{ background: "var(--bg)" }}>
                          <td className="muted">Da bonificare al partner</td>
                          <td>
                            Già bonificato {euro(rolling.pagatoAlPartner)}
                            {/* Il credito si RECUPERA trattenendolo dai bonifici
                                successivi (regola dell'utente, 08/09/2026): il
                                totale qui accanto è già al netto, e la riga dice
                                di quanto — altrimenti sembrerebbe che il conto
                                non torni con la somma dei mesi. */}
                            {inviatoInPiuYtd > 0.005 && (
                              <> · <span className="neg">già scalato {euro(inviatoInPiuYtd - surplusYtd)}</span> di quanto era uscito in più</>
                            )}
                          </td>
                          <td className={`num ${daBonificareYtd >= 0.01 ? "neg" : ""}`} style={{ fontWeight: 600 }}>
                            {euro(daBonificareYtd)}
                          </td>
                        </tr>
                        {surplusYtd > 0.005 && (
                          <tr style={{ background: "var(--bg)" }}>
                            <td className="muted">Da recuperare dal partner</td>
                            <td>
                              Gli è uscito più del dovuto e non è ancora rientrato: <b>sono soldi che dobbiamo
                              ricevere</b>, e tornano trattenendoli dai prossimi bonifici a questo partner.
                            </td>
                            <td className="num pos" style={{ fontWeight: 600 }}>
                              {euro(surplusYtd)}
                            </td>
                          </tr>
                        )}
                        <tr style={{ background: "var(--bg)" }}>
                          <td className="muted">Da incassare dal partner</td>
                          <td>Già incassato {euro(rolling.incassatoDalPartner)}</td>
                          <td className={`num ${daIncassareYtd >= 0.01 ? "pos" : ""}`} style={{ fontWeight: 600 }}>
                            {euro(daIncassareYtd)}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
