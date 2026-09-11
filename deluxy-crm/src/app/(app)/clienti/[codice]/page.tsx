import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { ordiniCliente, ricorrenze, schedaCliente, type OrdineCliente, type RicorrenzaCliente } from "@/lib/orders";
import {
  aggiungiRicorrenze,
  cambiaStatoProgrammazione,
  eliminaNota,
  eliminaProgrammazione,
  modificaRicorrenza,
  programmaConCliente,
  registraAttivita,
  salvaNota,
  salvaProfilo,
  salvaPunteggio,
  salvaChiE,
  salvaConsensoCrm,
  salvaConsensoMarketing,
  separaCliente,
  unisciClienti,
} from "@/lib/actions";
import TestoModificabile from "@/components/TestoModificabile";
import { clusterDi, descriviCluster, impostazioniClienti } from "@/lib/cluster";
import { TornaIndietro } from "@/components/TornaIndietro";
import FotoInput from "@/components/FotoInput";
import RicorrenzeMultiple from "@/components/RicorrenzeMultiple";
import Modale from "@/components/Modale";
import DettaglioReclamo from "@/components/DettaglioReclamo";
import { baseCS, gravitaReclamo, reclamiDelCliente, reclamoAperto, statoReclamo } from "@/lib/reclami";
import ConfermaElimina from "@/components/ConfermaElimina";
import {
  chiaveGiorno,
  dataBreve,
  dataIt,
  euro,
  giornoMese,
  oraIt,
  quandoLeggibile,
  segmento,
  statoInvito,
  statoProgrammazione,
  tipoRicorrenza,
  TIPI_ATTIVITA,
  TIPI_RICORRENZA,
} from "@/lib/etichette";

export const dynamic = "force-dynamic";

type Params = { codice: string };
type Query = { esito?: string; errore?: string; modifica?: string; nota?: string };

// LA SCHEDA A 360 GRADI — quello che un client advisor deve sapere prima di
// alzare il telefono: chi è, cosa compra, cosa le piace, quando festeggia,
// cosa ci siamo detti. Ordini, segmento, gusti e ricorrenze arrivano da
// Deluxy Orders; il diario, le note, il profilo di relazione (foto,
// professione), la programmazione, le mail e gli inviti vivono qui.
export default async function Scheda({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Query>;
}) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  // Il segmento può arrivare ancora percent-encoded (monica%40…): si
  // normalizza una volta qui, così ogni encodeURIComponent a valle ne fa UNA.
  const { codice: codiceRaw } = await params;
  const codice = decodeURIComponent(codiceRaw);
  const sp = await searchParams;
  const qui = `/clienti/${encodeURIComponent(codice)}`;

  // Unioni: se questa chiave è l'alias di un'altra, la scheda è quella del
  // principale; se è un principale, dentro ci sono anche i suoi alias.
  const unione = await prisma.unioneClienti.findUnique({ where: { chiaveAlias: codice } });
  if (unione) redirect(`/clienti/${encodeURIComponent(unione.chiavePrincipale)}`);
  const alias = (await prisma.unioneClienti.findMany({ where: { chiavePrincipale: codice } })).map((u) => u.chiaveAlias);
  const tutteLeChiavi = [codice, ...alias];

  const [scheda, ordini, ricorr, attivita, mail, inviti, profilo, note, programmate, imp, datiAlias] = await Promise.all([
    schedaCliente(codice),
    ordiniCliente(codice, 1, 30),
    ricorrenze({ cliente: codice, stato: "tutti", limit: 50 }),
    prisma.attivita.findMany({ where: { chiaveCliente: { in: tutteLeChiavi } }, orderBy: { quando: "desc" }, take: 50 }),
    prisma.mailInviata.findMany({ where: { chiaveCliente: { in: tutteLeChiavi } }, orderBy: { inviataIl: "desc" }, take: 50 }),
    prisma.invito.findMany({
      where: { chiaveCliente: { in: tutteLeChiavi } },
      include: { evento: { select: { id: true, titolo: true, dataInizio: true } } },
      orderBy: { creatoIl: "desc" },
    }),
    prisma.profiloCliente.findUnique({
      where: { chiaveCliente: codice },
      select: { nome: true, professione: true, fotoTipo: true, aggiornatoIl: true, autore: true, punteggio: true, chiE: true, consensoCrm: true },
    }),
    prisma.notaCliente.findMany({ where: { chiaveCliente: { in: tutteLeChiavi } }, orderBy: { creatoIl: "desc" } }),
    prisma.programmazione.findMany({
      where: { chiaveCliente: { in: tutteLeChiavi } },
      orderBy: { quando: "asc" },
      take: 60,
    }),
    impostazioniClienti(),
    Promise.all(
      alias.map(async (a) => {
        const [s, o, r] = await Promise.all([
          schedaCliente(a),
          ordiniCliente(a, 1, 30),
          ricorrenze({ cliente: a, stato: "tutti", limit: 50 }),
        ]);
        return { chiave: a, scheda: s, ordini: o, ricorr: r };
      }),
    ),
  ]);

  if (!scheda.ok) {
    return (
      <>
        <div className="intestazione">
          <div>
            <h1 className="page-title">Cliente</h1>
            <p className="page-sub">La scheda non si può aprire.</p>
          </div>
          <TornaIndietro fallback="/clienti" label="Libro clienti" />
        </div>
        <div className="errore-card">{scheda.errore}</div>
      </>
    );
  }

  const c = scheda.dati;
  const seg = segmento(c.segmento);

  // I RECLAMI di questa persona, dal Customer Service (casa del reclamo).
  // ⚠️ Si cercano per email e telefono — che si sanno solo dopo aver letto la
  // scheda: è un secondo giro, non evitabile senza indovinare i contatti. Si
  // cercano anche quelli delle schede unite: è la stessa persona.
  const contatti = [
    { email: c.email, telefono: c.telefono },
    ...datiAlias.filter((a) => a.scheda.ok).map((a) => ({ email: a.scheda.ok ? a.scheda.dati.email : null, telefono: a.scheda.ok ? a.scheda.dati.telefono : null })),
  ];
  const [reclamiCliente, csBase] = await Promise.all([reclamiDelCliente(contatti), baseCS()]);
  const reclamiAperti = reclamiCliente.ok ? reclamiCliente.dati.filter((r) => reclamoAperto(r.stato)) : [];

  // La vista UNITA: i numeri del principale più quelli degli alias (ordini,
  // spesa, date), gli ordini e le ricorrenze di tutti, dal più recente.
  const schedeAlias = datiAlias.map((d) => d.scheda).filter((s) => s.ok).map((s) => s.dati);
  const kpi = {
    speso: c.speso + schedeAlias.reduce((t, a) => t + a.speso, 0),
    ordini: c.ordini + schedeAlias.reduce((t, a) => t + a.ordini, 0),
    annullati: c.annullati + schedeAlias.reduce((t, a) => t + a.annullati, 0),
    primoOrdine: [c.primoOrdine, ...schedeAlias.map((a) => a.primoOrdine)].filter(Boolean).sort()[0] ?? c.primoOrdine,
    ultimoOrdine: [c.ultimoOrdine, ...schedeAlias.map((a) => a.ultimoOrdine)].filter(Boolean).sort().reverse()[0] ?? c.ultimoOrdine,
    giorniDallUltimo: Math.min(...[c.giorniDallUltimo, ...schedeAlias.map((a) => a.giorniDallUltimo)].filter((g): g is number => g != null), Infinity),
    brand: [...new Set([...c.brand, ...schedeAlias.flatMap((a) => a.brand)])],
    contattiAlias: schedeAlias.map((a) => a.email ?? a.telefono ?? a.nome ?? "").filter(Boolean),
  };
  kpi.giorniDallUltimo = Number.isFinite(kpi.giorniDallUltimo) ? kpi.giorniDallUltimo : (c.giorniDallUltimo ?? 0);
  const ordineMedio = kpi.ordini ? kpi.speso / kpi.ordini : 0;
  const ordiniVista: { ok: true; dati: { totale: number; ordini: OrdineCliente[] } } | { ok: false; errore: string } = ordini.ok
    ? {
        ok: true,
        dati: {
          totale: ordini.dati.totale + datiAlias.reduce((t, d) => t + (d.ordini.ok ? d.ordini.dati.totale : 0), 0),
          ordini: [...ordini.dati.ordini, ...datiAlias.flatMap((d) => (d.ordini.ok ? d.ordini.dati.ordini : []))].sort((a, b) =>
            String(b.data).localeCompare(String(a.data)),
          ),
        },
      }
    : ordini;
  const ricorrVista: { ok: true; dati: { eventi: RicorrenzaCliente[] } } | { ok: false; errore: string } = ricorr.ok
    ? { ok: true, dati: { eventi: [...ricorr.dati.eventi, ...datiAlias.flatMap((d) => (d.ricorr.ok ? d.ricorr.dati.eventi : []))] } }
    : ricorr;
  const cluster = clusterDi({ ...c, speso: kpi.speso, ordini: kpi.ordini, ultimoOrdine: kpi.ultimoOrdine }, imp, profilo?.punteggio ?? null);
  const nomeOrdini = c.nome ?? c.email ?? c.telefono ?? "Senza nome";
  // Come lo chiamiamo noi vince sul nome degli ordini (ma quello resta visibile).
  const nomeMostrato = profilo?.nome || nomeOrdini;
  const fotoUrl = profilo?.fotoTipo ? `/api/interno/foto/${encodeURIComponent(codice)}?v=${profilo.aggiornatoIl.getTime()}` : null;
  const iniziali = nomeMostrato
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const modificaProfilo = sp.modifica === "profilo";
  const notaInModifica = sp.nota ? note.find((n) => n.id === sp.nota) : undefined;

  const oggiChiave = chiaveGiorno(new Date());
  const daFare = programmate.filter((p) => p.stato === "da_fare");
  const chiuse = programmate.filter((p) => p.stato !== "da_fare").slice(-10).reverse();

  // La timeline della relazione: diario + mail + inviti, fusi per data.
  type Voce = { quando: Date; tipo: string; titolo: string; dettaglio: string | null; extra?: string };
  const timeline: Voce[] = [
    ...attivita.map((a) => ({
      quando: a.quando,
      tipo: TIPI_ATTIVITA[a.tipo] ?? a.tipo,
      titolo: a.titolo,
      dettaglio: a.dettaglio,
      extra: a.autore || undefined,
    })),
    ...mail.map((m) => ({
      quando: m.inviataIl,
      tipo: m.esito === "inviata" ? "Mail inviata" : "Mail non partita",
      titolo: m.oggetto,
      dettaglio: m.esito === "errore" ? m.errore : null,
      extra: m.autore || undefined,
    })),
    ...inviti
      .filter((i) => i.invitatoIl)
      .map((i) => ({
        quando: i.invitatoIl!,
        tipo: "Invito",
        titolo: `Invito a «${i.evento.titolo}»`,
        dettaglio: null,
      })),
    ...programmate
      .filter((p) => p.stato === "fatta" && p.fattaIl)
      .map((p) => ({
        quando: p.fattaIl!,
        tipo: "Programmata, fatta",
        titolo: p.titolo,
        dettaglio: p.dettaglio,
        extra: p.autore || undefined,
      })),
  ].sort((a, b) => b.quando.getTime() - a.quando.getTime());

  return (
    <>
      <TornaIndietro fallback="/clienti" label="Libro clienti" />
      <div className="intestazione">
        <div className="intestazione-cliente">
          <div className="foto-cliente grande" aria-hidden>
            {fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoUrl} alt="" />
            ) : (
              iniziali || "D"
            )}
          </div>
          <div>
            <h1 className="page-title">{nomeMostrato}</h1>
            {profilo?.professione || (profilo?.nome && profilo.nome !== nomeOrdini) ? (
              <p className="professione">
                {profilo?.professione}
                {profilo?.professione && profilo?.nome && profilo.nome !== nomeOrdini ? " · " : ""}
                {profilo?.nome && profilo.nome !== nomeOrdini ? `negli ordini: ${nomeOrdini}` : ""}
              </p>
            ) : null}
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="badge colorato" style={{ ["--badge-colore" as string]: seg.colore }}>
                <span className="dot" />
                {seg.nome}
              </span>
              {cluster ? (
                <span className="badge colorato" style={{ ["--badge-colore" as string]: cluster.colore }} title={`Cluster: ${descriviCluster(cluster)}`}>
                  <span className="dot" />
                  {cluster.nome}
                </span>
              ) : null}
              {profilo?.punteggio != null ? <span className="chip oro" title="Punteggio dato da noi">{profilo.punteggio}/100</span> : null}
              {c.tipologia ? <span className="chip">{c.tipologia}</span> : null}
              {c.citta ? <span>{c.citta}</span> : null}
              {c.email ? <span>{c.email}</span> : null}
              {c.telefono ? <span>{c.telefono}</span> : null}
              {kpi.brand.length ? <span className="terziario">{kpi.brand.join(" · ")}</span> : null}
              {kpi.contattiAlias.map((a) => (
                <span key={a} className="chip" title="Scheda unita a questa">+ {a}</span>
              ))}
              <a className="btn ghost mini" href={`${qui}?modifica=profilo#profilo`} title="Modifica nome, professione e foto">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
                  <path d="M13.5 6.5l3 3" />
                </svg>
                <span style={{ marginLeft: 6 }}>Modifica</span>
              </a>
            </p>
          </div>
        </div>
        <div className="azioni">
          <a className="btn ghost" href={`/clienti/${encodeURIComponent(codice)}/nuovo-ordine`}>Crea ordine</a>
          {c.telefono ? (
            <a className="btn ghost" href={`/whatsapp/componi?cliente=${encodeURIComponent(codice)}`}>WhatsApp</a>
          ) : null}
          {c.email ? (
            <a className="btn" href={`/mail/componi?cliente=${encodeURIComponent(codice)}`}>Scrivi una mail</a>
          ) : (
            <span className="chip" title="Questo cliente non ha un'email negli ordini">senza email</span>
          )}
        </div>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Fatto.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="griglia quattro" style={{ marginBottom: 16 }}>
        <div className="card stretta stat">
          <span className="valore">{euro(kpi.speso)}</span>
          <span className="etichetta">Valore del cliente</span>
          <span className="nota">medio {euro(ordineMedio)} a ordine{alias.length ? ` · con ${alias.length} ${alias.length === 1 ? "scheda unita" : "schede unite"}` : ""}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{kpi.ordini}</span>
          <span className="etichetta">Ordini</span>
          <span className="nota">{kpi.annullati ? `più ${kpi.annullati} annullati` : "nessun annullato"}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{dataIt(kpi.primoOrdine)}</span>
          <span className="etichetta">Cliente da</span>
          <span className="nota">{c.acquisizione?.canale ? `arrivato da ${c.acquisizione.canale}` : "provenienza non indicata"}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{dataIt(kpi.ultimoOrdine)}</span>
          <span className="etichetta">Ultimo ordine</span>
          <span className="nota">{kpi.giorniDallUltimo != null ? `${kpi.giorniDallUltimo} giorni fa` : ""}</span>
        </div>
      </div>

      <div className="griglia scheda">
        {/* -------- colonna principale -------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {modificaProfilo ? (
            <div className="card" id="profilo">
              <div className="card-titolo">Profilo di relazione</div>
              <div className="card-sub">
                Come lo chiamiamo, cosa fa, la sua foto. Nome degli ordini, email, telefono e città restano in Orders: qui
                si aggiunge, non si sovrascrive.{" "}
                <a className="link-quieto" href={qui}>Annulla</a>
              </div>
              <form action={salvaProfilo}>
                <input type="hidden" name="chiaveCliente" value={codice} />
                <input type="hidden" name="torna" value={qui} />
                <div className="form-riga">
                  <div className="campo">
                    <label>Come lo chiamiamo <span className="aiuto">(vuoto = {nomeOrdini})</span></label>
                    <input type="text" name="nome" defaultValue={profilo?.nome ?? ""} placeholder={nomeOrdini} maxLength={120} />
                  </div>
                  <div className="campo">
                    <label>Professione</label>
                    <input type="text" name="professione" defaultValue={profilo?.professione ?? ""} placeholder="es. Notaio, imprenditrice, medico" maxLength={120} />
                  </div>
                </div>
                <FotoInput fotoAttuale={fotoUrl} />
                <div className="form-piede">
                  <button className="btn" type="submit">Salva il profilo</button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="card">
            <div className="card-titolo">Chi è, in una riga</div>
            <div className="card-sub">
              Lo scriviamo noi con la matitina; finché non c&apos;è, vale il riassunto dell&apos;AI di Orders
              {c.riepilogo ? ` (su ${c.riepilogo.ordiniConsiderati} ordini)` : ""}.
            </div>
            <TestoModificabile
              testo={profilo?.chiE ?? null}
              vuoto={c.riepilogo?.riassunto ?? "Nessun riassunto ancora: scrivi tu chi è."}
              action={salvaChiE}
              campi={{ chiaveCliente: codice, torna: qui }}
              etichettaSalva="Salva chi è"
              segnaposto={c.riepilogo?.riassunto ?? "es. Imprenditrice milanese, ordina peonie per la madre a ogni ricorrenza…"}
            />
            {profilo?.chiE && c.riepilogo ? (
              <p className="terziario piccolo" style={{ marginTop: 10 }}>AI di Orders: {c.riepilogo.riassunto}</p>
            ) : null}
            {c.riepilogo?.gusti ? (
              <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 10 }}>
                <span className="chip oro">Gusti</span> {c.riepilogo.gusti}
              </p>
            ) : null}
          </div>

          {/* -------- Consensi -------- */}
          <div className="card" id="consensi">
            <div className="card-titolo">Consensi</div>
            <div className="card-sub">
              Il consenso <strong>marketing</strong> vive in Orders (e sui siti): da qui si spegne o si accende per canale.
              Il consenso <strong>CRM</strong> è nostro: vuol dire «ha voglia di sentire Eva», e tutti partono a sì.
            </div>
            <div className="consensi">
              {(
                [
                  ["email", "Email marketing", c.privacy?.email],
                  ["sms", "SMS e WhatsApp", c.privacy?.sms],
                  ["telefono", "Chiamate", c.privacy?.telefono],
                ] as const
              ).map(([canale, nome, valore]) => (
                <div className="consenso-riga" key={canale}>
                  <span className="consenso-nome">{nome}</span>
                  <span className={`badge colorato`} style={{ ["--badge-colore" as string]: valore === "si" ? "var(--green)" : valore === "no" ? "var(--red)" : "var(--text-tertiary)" }}>
                    <span className="dot" />
                    {valore === "si" ? "sì" : valore === "no" ? "no" : "mai detto"}
                  </span>
                  <form action={salvaConsensoMarketing} style={{ display: "inline" }}>
                    <input type="hidden" name="chiaveCliente" value={codice} />
                    <input type="hidden" name="torna" value={`${qui}#consensi`} />
                    <input type="hidden" name="canale" value={canale} />
                    <input type="hidden" name="valore" value={valore === "si" ? "no" : "si"} />
                    <button className="btn ghost mini" type="submit">{valore === "si" ? "Disattiva" : "Attiva"}</button>
                  </form>
                </div>
              ))}
              <div className="consenso-riga">
                <span className="consenso-nome">Non contattare più</span>
                <span className="badge colorato" style={{ ["--badge-colore" as string]: c.privacy?.bloccato ? "var(--red)" : "var(--green)" }}>
                  <span className="dot" />
                  {c.privacy?.bloccato ? "bloccato" : "contattabile"}
                </span>
                <form action={salvaConsensoMarketing} style={{ display: "inline" }}>
                  <input type="hidden" name="chiaveCliente" value={codice} />
                  <input type="hidden" name="torna" value={`${qui}#consensi`} />
                  <input type="hidden" name="canale" value="bloccato" />
                  <input type="hidden" name="valore" value={c.privacy?.bloccato ? "no" : "si"} />
                  <button className="btn ghost mini" type="submit">{c.privacy?.bloccato ? "Sblocca" : "Blocca"}</button>
                </form>
              </div>
              <div className="consenso-riga" style={{ borderTop: "1px solid var(--hairline)", paddingTop: 10, marginTop: 4 }}>
                <span className="consenso-nome">Consenso CRM (vuole sentire Eva)</span>
                <span className="badge colorato" style={{ ["--badge-colore" as string]: profilo?.consensoCrm === false ? "var(--red)" : "var(--gold-strong)" }}>
                  <span className="dot" />
                  {profilo?.consensoCrm === false ? "no" : "sì"}
                </span>
                <form action={salvaConsensoCrm} style={{ display: "inline" }}>
                  <input type="hidden" name="chiaveCliente" value={codice} />
                  <input type="hidden" name="torna" value={`${qui}#consensi`} />
                  <input type="hidden" name="consensoCrm" value={profilo?.consensoCrm === false ? "si" : "no"} />
                  <button className="btn ghost mini" type="submit">{profilo?.consensoCrm === false ? "Riattiva" : "Disattiva"}</button>
                </form>
              </div>
              {c.privacy?.note ? <p className="terziario piccolo" style={{ marginTop: 8 }}>Nota in Orders: {c.privacy.note}</p> : null}
            </div>
          </div>

          {/* -------- Programmazione -------- */}
          <div className="card" id="programmazione">
            <div className="card-titolo">Programmazione</div>
            <div className="card-sub">
              Cosa faremo con {nomeMostrato.split(" ")[0]} e quando: una chiamata, una visita, un pensiero da mandare.
              Finisce nel <a className="link-quieto" href="/calendario">Calendario</a>.
            </div>
            {daFare.length === 0 ? (
              <p className="secondario piccolo">Niente in programma.</p>
            ) : (
              <div className="timeline">
                {daFare.map((p) => {
                  const k = chiaveGiorno(p.quando);
                  const inRitardo = k < oggiChiave;
                  return (
                    <div className="timeline-voce" key={p.id}>
                      <div className="timeline-corpo">
                        <div className="timeline-titolo">
                          {p.titolo}{" "}
                          {inRitardo ? <span className="chip" style={{ color: "var(--red)" }}>in ritardo</span> : k === oggiChiave ? <span className="chip oro">oggi</span> : null}
                        </div>
                        {p.dettaglio ? <div className="timeline-dettaglio">{p.dettaglio}</div> : null}
                        <div className="timeline-quando">
                          {dataBreve(p.quando)}
                          {p.conOra ? ` alle ${oraIt(p.quando)}` : ""}
                          {p.autore ? ` · ${p.autore}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignSelf: "center" }}>
                        <form action={cambiaStatoProgrammazione}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="stato" value="fatta" />
                          <input type="hidden" name="torna" value={qui} />
                          <button className="btn ghost mini" type="submit">Fatta</button>
                        </form>
                        <form action={eliminaProgrammazione}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="torna" value={qui} />
                          <button className="btn ghost mini" type="submit" title="Toglie la programmazione (nel Calendario resta come annullata)">Togli</button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <form action={programmaConCliente} style={{ marginTop: 12 }}>
              <input type="hidden" name="chiaveCliente" value={codice} />
              <input type="hidden" name="nomeCliente" value={nomeMostrato} />
              <input type="hidden" name="torna" value={qui} />
              <div className="form-riga">
                <div className="campo">
                  <label>Giorno <span className="ob">*</span></label>
                  <input type="date" name="giorno" required min={oggiChiave} />
                </div>
                <div className="campo">
                  <label>Ora <span className="aiuto">(facoltativa)</span></label>
                  <input type="time" name="ora" />
                </div>
              </div>
              <div className="campo">
                <label>Cosa fare <span className="ob">*</span></label>
                <input type="text" name="titolo" placeholder="es. Chiamare per proporre la cena in boutique" required maxLength={200} />
              </div>
              <div className="campo">
                <label>Dettaglio</label>
                <textarea name="dettaglio" rows={2} placeholder="Cosa proporre, cosa ricordare…" style={{ minHeight: 60 }} />
              </div>
              <div className="form-piede">
                <button className="btn" type="submit">Programma</button>
              </div>
            </form>
            {chiuse.length ? (
              <details style={{ marginTop: 8 }}>
                <summary className="link-quieto" style={{ cursor: "pointer" }}>Le ultime chiuse ({chiuse.length})</summary>
                <div className="timeline" style={{ marginTop: 8 }}>
                  {chiuse.map((p) => {
                    const st = statoProgrammazione(p.stato);
                    return (
                      <div className="timeline-voce" key={p.id}>
                        <div className="timeline-corpo">
                          <div className="timeline-titolo">{p.titolo}</div>
                          <div className="timeline-quando">{dataBreve(p.quando)}</div>
                        </div>
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: st.colore, alignSelf: "center" }}>
                          <span className="dot" />
                          {st.nome}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div className="card-titolo">Ordini</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>
                  {ordiniVista.ok
                    ? `${ordiniVista.dati.totale} ordini validi (gli annullati non compaiono). Fonte: Deluxy Orders.`
                    : "Fonte: Deluxy Orders."}
                  {ordiniVista.ok && ordiniVista.dati.ordini.length > 0 ? (
                    <>
                      {" "}Ultimo: {ordiniVista.dati.ordini[0].numero} del {dataIt(ordiniVista.dati.ordini[0].data)},{" "}
                      {ordiniVista.dati.ordini[0].righe
                        .slice(0, 2)
                        .map((r) => r.titolo)
                        .join(", ")}
                      {ordiniVista.dati.ordini[0].righe.length > 2 ? "…" : ""} ({euro(ordiniVista.dati.ordini[0].totale)}).
                    </>
                  ) : null}
                </div>
              </div>
              {ordiniVista.ok && ordiniVista.dati.ordini.length > 0 ? (
                <Modale
                  bottone={`Vedi gli ordini (${ordiniVista.dati.totale})`}
                  titolo={`Ordini di ${nomeMostrato}`}
                  sotto={`${ordiniVista.dati.totale} ordini validi, dal più recente. Fonte: Deluxy Orders.`}
                >
                  <div className="tabella-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ordine</th>
                      <th>Cosa</th>
                      <th>Per chi / dove</th>
                      <th>Dedica</th>
                      <th className="num">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordiniVista.dati.ordini.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div className="cella-principale">{o.numero}</div>
                          <div className="cella-sotto">
                            {dataIt(o.data)} · {o.brand}
                          </div>
                        </td>
                        <td>
                          <div className="riga-prodotti">
                            {o.righe.slice(0, 3).map((r, i) => (
                              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                {r.immagine ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img className="mini-foto" src={r.immagine} alt="" />
                                ) : null}
                                <span className="piccolo">
                                  {r.quantita > 1 ? `${r.quantita}× ` : ""}
                                  {r.titolo}
                                </span>
                              </span>
                            ))}
                            {o.righe.length > 3 ? <span className="terziario piccolo">+{o.righe.length - 3}</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className="piccolo">{o.spedizione?.nome ?? "—"}</div>
                          <div className="cella-sotto">
                            {[o.spedizione?.citta, o.consegna?.data ? `consegna ${dataIt(o.consegna.data)}` : null]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                        </td>
                        <td>
                          {o.biglietto ? (
                            <span className="piccolo" title={o.biglietto}>
                              “{o.biglietto.length > 60 ? `${o.biglietto.slice(0, 60)}…` : o.biglietto}”
                            </span>
                          ) : (
                            <span className="terziario">—</span>
                          )}
                        </td>
                        <td className="num">{euro(o.totale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                  </div>
                </Modale>
              ) : null}
            </div>
            {!ordiniVista.ok ? (
              <p className="secondario piccolo" style={{ marginTop: 8 }}>{ordiniVista.errore}</p>
            ) : ordiniVista.dati.ordini.length === 0 ? (
              <p className="secondario piccolo" style={{ marginTop: 8 }}>Nessun ordine valido.</p>
            ) : null}
          </div>

          {/* RECLAMI — quello che è andato storto con questa persona. Sta
              sotto gli ordini perché è degli ordini che parla, e prima del
              diario perché chi sta per telefonare deve vederlo per primo.
              Si legge dal Customer Service: lì si lavora. */}
          <div className="card" id="reclami">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div className="card-titolo">Reclami</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>
                  {reclamiCliente.ok
                    ? reclamiCliente.dati.length === 0
                      ? "Nessun reclamo: con questa persona non è mai andato storto niente."
                      : `${reclamiCliente.dati.length} in tutto${reclamiAperti.length ? `, ${reclamiAperti.length} ancora da lavorare` : ", tutti chiusi"}. Fonte: Customer Service.`
                    : "Fonte: Customer Service."}
                </div>
              </div>
              {reclamiAperti.length > 0 ? (
                <span className="badge colorato" style={{ ["--badge-colore" as string]: "var(--orange)" }}>
                  <span className="dot" />
                  {reclamiAperti.length} da lavorare
                </span>
              ) : null}
            </div>
            {!reclamiCliente.ok ? (
              <p className="secondario piccolo" style={{ marginTop: 8 }}>{reclamiCliente.errore}</p>
            ) : reclamiCliente.dati.length > 0 ? (
              <div className="timeline" style={{ marginTop: 10 }}>
                {reclamiCliente.dati.map((r) => {
                  const st = statoReclamo(r.stato);
                  const gr = gravitaReclamo(r.gravita);
                  return (
                    <div className="timeline-voce" key={r.id}>
                      <div className="timeline-corpo">
                        <DettaglioReclamo
                          id={r.id}
                          titolo={`${r.casistica || "Reclamo"}${r.ordineNumero ? ` · ordine ${r.ordineNumero}` : ""}`}
                          sotto={r.clienteNome || undefined}
                          baseCS={csBase}
                          className="riga-apri inline"
                          bottone={<span className="timeline-titolo">{r.casistica || "Reclamo"}</span>}
                        />
                        <div className="timeline-quando" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span className="badge colorato" style={{ ["--badge-colore" as string]: st.colore }}>
                            <span className="dot" />
                            {st.nome}
                          </span>
                          <span className="badge colorato" style={{ ["--badge-colore" as string]: gr.colore }}>
                            <span className="dot" />
                            {gr.nome}
                          </span>
                          <span>
                            {dataIt(r.creatoIl)}
                            {r.ordineNumero ? ` · ordine ${r.ordineNumero}` : ""}
                            {r.colpaNome ? ` · colpa: ${r.colpaNome}` : ""}
                            {r.domandeAperte > 0 ? ` · ${r.domandeAperte} ${r.domandeAperte === 1 ? "domanda aperta" : "domande aperte"}` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="card-titolo">La relazione</div>
            <div className="card-sub">Diario di chiamate, incontri, note, mail e inviti — il più recente in alto.</div>
            {timeline.length === 0 ? (
              <p className="secondario piccolo">Ancora niente: la prima nota si scrive qui a destra.</p>
            ) : (
              <div className="timeline">
                {timeline.map((v, i) => (
                  <div className="timeline-voce" key={i}>
                    <div className="timeline-corpo">
                      <div className="timeline-titolo">
                        {v.titolo} <span className="chip">{v.tipo}</span>
                      </div>
                      {v.dettaglio ? <div className="timeline-dettaglio">{v.dettaglio}</div> : null}
                      <div className="timeline-quando">
                        {dataIt(v.quando, true)}
                        {v.extra ? ` · ${v.extra}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* -------- colonna laterale -------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-titolo">Punteggio</div>
            <div className="card-sub">Il voto del client advisor, da 0 a 100: entra nei cluster decisi in Impostazioni.</div>
            <form action={salvaPunteggio} className="form-riga" style={{ alignItems: "flex-end" }}>
              <input type="hidden" name="chiaveCliente" value={codice} />
              <input type="hidden" name="torna" value={qui} />
              <div className="campo" style={{ marginBottom: 0 }}>
                <label>Punteggio</label>
                <input type="number" name="punteggio" min={0} max={100} step="1" defaultValue={profilo?.punteggio ?? ""} placeholder="—" />
              </div>
              <button className="btn ghost mini" type="submit" style={{ flex: "0 0 auto" }}>Salva</button>
            </form>
          </div>

          {/* -------- Note -------- */}
          <div className="card" id="note">
            <div className="card-titolo">Note</div>
            <div className="card-sub">Quello che vale la pena ricordare: quante si vuole, ognuna si modifica.</div>
            {note.length === 0 ? (
              <p className="secondario piccolo">Nessuna nota.</p>
            ) : (
              <div className="timeline">
                {note.map((n) =>
                  notaInModifica?.id === n.id ? (
                    <div className="timeline-voce" key={n.id}>
                      <form action={salvaNota} style={{ width: "100%" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="chiaveCliente" value={codice} />
                        <input type="hidden" name="torna" value={`${qui}#note`} />
                        <div className="campo" style={{ marginBottom: 8 }}>
                          <textarea name="testo" rows={3} defaultValue={n.testo} required style={{ minHeight: 70 }} autoFocus />
                        </div>
                        <div className="form-piede" style={{ justifyContent: "space-between" }}>
                          <a className="link-quieto" href={`${qui}#note`}>Annulla</a>
                          <button className="btn mini" type="submit">Salva la nota</button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="timeline-voce" key={n.id}>
                      <div className="timeline-corpo">
                        <div className="timeline-dettaglio" style={{ whiteSpace: "pre-wrap", color: "var(--text)" }}>{n.testo}</div>
                        <div className="timeline-quando">
                          {dataIt(n.creatoIl, true)}
                          {n.aggiornatoIl.getTime() - n.creatoIl.getTime() > 60_000 ? ` · modificata ${dataIt(n.aggiornatoIl)}` : ""}
                          {n.autore ? ` · ${n.autore}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignSelf: "flex-start" }}>
                        <a className="btn ghost mini" href={`${qui}?nota=${n.id}#note`}>Modifica</a>
                        <ConfermaElimina mini titolo="Elimino questa nota?" conseguenza="La nota sparisce dalla scheda, per sempre.">
                          <form action={eliminaNota}>
                            <input type="hidden" name="id" value={n.id} />
                            <input type="hidden" name="chiaveCliente" value={codice} />
                            <input type="hidden" name="torna" value={`${qui}#note`} />
                            <button className="btn rosso" type="submit">Elimina la nota</button>
                          </form>
                        </ConfermaElimina>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
            <form action={salvaNota} style={{ marginTop: 12 }}>
              <input type="hidden" name="chiaveCliente" value={codice} />
              <input type="hidden" name="torna" value={`${qui}#note`} />
              <div className="campo" style={{ marginBottom: 8 }}>
                <textarea name="testo" rows={2} placeholder="Una nota nuova…" required style={{ minHeight: 56 }} />
              </div>
              <div className="form-piede">
                <button className="btn ghost mini" type="submit">Aggiungi la nota</button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-titolo">Ricorrenze</div>
            <div className="card-sub">
              Compleanni e occasioni di questa persona: lette dagli ordini, confermate da noi. Vivono nel registro di
              Orders — aggiungerne qui le scrive lì.
            </div>
            {!ricorrVista.ok ? (
              <p className="secondario piccolo">{ricorrVista.errore}</p>
            ) : ricorrVista.dati.eventi.length === 0 ? (
              <p className="secondario piccolo">Nessuna ricorrenza conosciuta.</p>
            ) : (
              <div className="timeline">
                {ricorrVista.dati.eventi.map((r) => {
                  const tipo = tipoRicorrenza(r.tipo);
                  return (
                    <div className="timeline-voce" key={r.id}>
                      <div className="timeline-corpo">
                        <div className="timeline-titolo">
                          {r.titolo || tipo.nome}
                          {r.destinatario ? <span className="secondario"> → {r.destinatario}</span> : null}
                        </div>
                        <div className="timeline-dettaglio">
                          <span className="badge colorato" style={{ ["--badge-colore" as string]: tipo.colore }}>
                            <span className="dot" />
                            {tipo.nome}
                          </span>{" "}
                          <span className="terziario piccolo">
                            {giornoMese(r.giorno, r.mese)} · {quandoLeggibile(r.fraGiorni)}
                            {r.origine === "dedotto" ? ` · vista ${r.ricorrenze} ${r.ricorrenze === 1 ? "volta" : "volte"}` : ""}
                            {r.stato === "da-confermare" ? " · da confermare" : ""}
                            {r.ordini.length ? ` · ordini ${r.ordini.slice(0, 3).join(" ")}${r.ordini.length > 3 ? "…" : ""}` : ""}
                          </span>
                        </div>
                        {/* Correzione in loco: tipo e «per chi» si scrivono in Orders. */}
                        <details style={{ marginTop: 6 }}>
                          <summary className="link-quieto piccolo" style={{ cursor: "pointer" }}>
                            Precisa (occasione, per chi)
                          </summary>
                          <form action={modificaRicorrenza} style={{ marginTop: 8 }}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="torna" value={qui} />
                            <div className="form-riga">
                              <div className="campo" style={{ marginBottom: 8 }}>
                                <label>Occasione</label>
                                <select name="tipo" defaultValue={r.tipo}>
                                  {Object.entries(TIPI_RICORRENZA).map(([chiave, t]) => (
                                    <option key={chiave} value={chiave}>{t.nome}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="campo" style={{ marginBottom: 8 }}>
                                <label>Per chi <span className="aiuto">(vuoto = il cliente)</span></label>
                                <input type="text" name="destinatario" defaultValue={r.destinatario} placeholder="es. la moglie, Anna" />
                              </div>
                            </div>
                            <div className="campo" style={{ marginBottom: 8 }}>
                              <label>Come la chiamiamo</label>
                              <input type="text" name="titolo" defaultValue={r.titolo} placeholder="es. Compleanno di Anna" />
                            </div>
                            <div className="form-piede">
                              <button className="btn ghost mini" type="submit">Salva in Orders</button>
                            </div>
                          </form>
                        </details>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <details style={{ marginTop: 12 }}>
              <summary className="link-quieto" style={{ cursor: "pointer" }}>Aggiungi una o più ricorrenze</summary>
              <form action={aggiungiRicorrenze} style={{ marginTop: 12 }}>
                <input type="hidden" name="cliente" value={codice} />
                <input type="hidden" name="torna" value={qui} />
                <RicorrenzeMultiple tipi={Object.entries(TIPI_RICORRENZA).map(([chiave, t]) => ({ chiave, nome: t.nome }))} />
              </form>
            </details>
          </div>

          <div className="card">
            <div className="card-titolo">Registra un&apos;attività</div>
            <div className="card-sub">Una chiamata, un incontro, una nota: due righe oggi valgono una scheda domani.</div>
            <form action={registraAttivita}>
              <input type="hidden" name="chiaveCliente" value={codice} />
              <input type="hidden" name="nomeCliente" value={nomeMostrato} />
              <input type="hidden" name="torna" value={qui} />
              <div className="form-riga">
                <div className="campo">
                  <label>Tipo</label>
                  <select name="tipo" defaultValue="nota">
                    {Object.entries(TIPI_ATTIVITA).map(([chiave, nome]) => (
                      <option key={chiave} value={chiave}>{nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label>Quando</label>
                  <input type="datetime-local" name="quando" />
                </div>
              </div>
              <div className="campo">
                <label>Titolo <span className="ob">*</span></label>
                <input type="text" name="titolo" placeholder="es. Chiamata per il compleanno" required />
              </div>
              <div className="campo">
                <label>Dettaglio</label>
                <textarea name="dettaglio" rows={3} placeholder="Cosa ci siamo detti, cosa promesso…" />
              </div>
              <div className="form-piede">
                <button className="btn ghost" type="submit">Registra</button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-titolo">Schede unite</div>
            <div className="card-sub">
              La stessa persona con due chiavi in Orders (l&apos;email del lavoro e quella personale, o solo il telefono):
              unendole, questa scheda mostra anche i suoi ordini, ricorrenze e diario. Orders non cambia.
            </div>
            {alias.length ? (
              <div className="timeline">
                {datiAlias.map((d) => (
                  <div className="timeline-voce" key={d.chiave}>
                    <div className="timeline-corpo">
                      <div className="timeline-titolo">
                        {d.scheda.ok ? d.scheda.dati.nome ?? d.scheda.dati.email ?? d.chiave : d.chiave}
                      </div>
                      <div className="timeline-quando">
                        {d.scheda.ok
                          ? `${d.scheda.dati.email ?? d.scheda.dati.telefono ?? ""} · ${d.scheda.dati.ordini} ordini · ${euro(d.scheda.dati.speso)}`
                          : d.scheda.errore}
                      </div>
                    </div>
                    <form action={separaCliente} style={{ alignSelf: "center" }}>
                      <input type="hidden" name="alias" value={d.chiave} />
                      <input type="hidden" name="torna" value={qui} />
                      <button className="btn ghost mini" type="submit">Separa</button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="secondario piccolo">Nessuna scheda unita.</p>
            )}
            <details style={{ marginTop: 10 }}>
              <summary className="link-quieto" style={{ cursor: "pointer" }}>Unisci un&apos;altra scheda</summary>
              <form action={unisciClienti} style={{ marginTop: 10 }}>
                <input type="hidden" name="chiaveCliente" value={codice} />
                <input type="hidden" name="torna" value={qui} />
                <div className="campo">
                  <label>Email (o codice) dell&apos;altra scheda <span className="ob">*</span></label>
                  <input type="text" name="altro" placeholder="es. nome@lavoro.it" required />
                  <span className="aiuto">Deve esistere in Orders. Questa resta la scheda principale.</span>
                </div>
                <div className="form-piede">
                  <button className="btn ghost mini" type="submit">Unisci</button>
                </div>
              </form>
            </details>
          </div>

          <div className="card">
            <div className="card-titolo">Inviti</div>
            <div className="card-sub">Gli eventi a cui questa persona è stata invitata.</div>
            {inviti.length === 0 ? (
              <p className="secondario piccolo">
                Nessun invito. <a className="link-quieto" href="/eventi">Vai agli eventi →</a>
              </p>
            ) : (
              <div className="timeline">
                {inviti.map((i) => {
                  const st = statoInvito(i.stato);
                  return (
                    <div className="timeline-voce" key={i.id}>
                      <div className="timeline-corpo">
                        <div className="timeline-titolo">
                          <a href={`/eventi/${i.evento.id}`}>{i.evento.titolo}</a>
                        </div>
                        <div className="timeline-quando">{dataIt(i.evento.dataInizio, true)}</div>
                      </div>
                      <span
                        className="badge colorato"
                        style={{ ["--badge-colore" as string]: st.colore, alignSelf: "center" }}
                      >
                        <span className="dot" />
                        {st.nome}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
