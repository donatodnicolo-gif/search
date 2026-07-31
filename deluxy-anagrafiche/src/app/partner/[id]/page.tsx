import { notFound } from "next/navigation";
import { AggiungiReferente } from "@/components/AggiungiReferente";
import { AggiungiSede } from "@/components/AggiungiSede";
import { ReferentiDallaRubrica } from "@/components/ReferentiDallaRubrica";
import { UnisciAnagrafiche } from "@/components/UnisciAnagrafiche";
import { FormFeedbackD2C } from "@/components/FormFeedbackD2C";
import { GestioneGruppo } from "@/components/GestioneGruppo";
import type { RigaContatto } from "@/components/google-rubrica";
import { MenuInteressi } from "@/components/MenuInteressi";
import { SalvaRubricaAuto } from "@/components/SalvaRubricaAuto";
import { SelettoreStato } from "@/components/SelettoreStato";
import { SelettoreStatoAzienda } from "@/components/SelettoreStatoAzienda";
import { Sidebar } from "@/components/Sidebar";
import { FasciaD2C, StelleD2C } from "@/components/StelleD2C";
import {
  eliminaFeedbackD2C,
  impostaArchiviato,
  raggruppaSotto,
  spostaReferenteInSede,
  staccaContatto,
} from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  ETICHETTE_GRAVITA,
  ETICHETTE_MOTIVO,
  ETICHETTE_ORIGINE,
  SOGLIA_AFFIDABILE,
  formattaVoto,
  valutazioneD2C,
} from "@/lib/feedback-d2c";
import { linkContattoHubspot } from "@/lib/hubspot-link";
import { eAzione, etichettaCampo, etichettaOrigine } from "@/lib/log-modifiche";
import { COLORE_TIPO_LUOGO, etichettaTipoLuogo, isTipoLuogo } from "@/lib/luoghi";
import { datiFinanziariCondivisi } from "@/lib/insegna";
import { eAffiliatoReseller } from "@/lib/interessi";
import { getLinee } from "@/lib/linee";
import { ETICHETTE_STATO, isStato, nomeEventoStato } from "@/lib/stati";

export const dynamic = "force-dynamic";

function Campo({ etichetta, valore, largo }: { etichetta: string; valore?: string | null; largo?: boolean }) {
  if (!valore) return null;
  return (
    <div className={largo ? "campo campo-largo" : "campo"}>
      <dt>{etichetta}</dt>
      <dd>{valore}</dd>
    </div>
  );
}

export default async function Dettaglio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rubrica?: string }>;
}) {
  const { id } = await params;
  const { rubrica } = await searchParams;
  const p = await prisma.partner.findUnique({
    where: { id },
    include: {
      contatti: { where: { archiviato: false } },
      // Ultimi giudizi interni: la pagella (media) sta sul record, qui servono
      // i singoli feedback per capire *perché* quel voto.
      feedbackD2C: { orderBy: { dataFeedback: "desc" }, take: 30 },
      passaggi: { orderBy: { creatoIl: "desc" } },
      // Log delle modifiche: campo per campo, chi e quando. Gli ultimi 120 —
      // oltre non si legge, e la scheda non deve caricarsi un archivio.
      modifiche: { orderBy: { creatoIl: "desc" }, take: 120 },
      capogruppo: { select: { id: true, nome: true, citta: true } },
      sedi: {
        where: { attivo: true },
        select: {
          id: true,
          nome: true,
          citta: true,
          // Due sedi possono stare nella stessa città: a distinguerle è il nome
          // della sede, e in mancanza l'indirizzo.
          sede: true,
          tipoLuogo: true,
          indirizzo: true,
          stato: true,
          categoria: true,
          contatti: { select: { id: true } },
        },
        orderBy: [{ citta: "asc" }, { indirizzo: "asc" }],
      },
    },
  });
  if (!p) notFound();

  // ⚠️ PRESTAZIONI: tutto quello che serve DOPO aver letto l'anagrafica va in
  // un solo giro. Erano quattro await in fila (fatturazione dell'insegna,
  // altri luoghi, distribuzione dei voti, linee): quattro andate-e-ritorno
  // verso Francoforte, ~250 ms l'una, su una pagina che si riapre a ogni
  // cambio di stato.
  const haSedi = p.sedi.length > 0 || Boolean(p.capogruppo);
  // Le anagrafiche con la STESSA INSEGNA (stesso nome) sono già lo stesso
  // gruppo, anche senza legame manuale: è così che le mostra l'elenco ed è così
  // che condividono la fatturazione. Sulla scheda però non si vedevano, e chi
  // guardava una sede pensava di doverle collegare a mano — cercando di dare a
  // un'anagrafica due insegne, che il modello non permette e non deve.
  const nomeInsegna = (p.capogruppo?.nome ?? p.nome).trim();
  const [fin, altriLuoghi, perVoto, linee, stessaInsegna] = await Promise.all([
    // Fatturazione a livello di società: condivisa da tutte le sedi dell'insegna.
    datiFinanziariCondivisi(p),
    // Gli altri luoghi della stessa insegna: servono per spostare un referente
    // sulla sede dove lavora davvero. Da una sede si vedono la madre e le
    // sorelle; dalla madre, le sue sedi.
    p.capogruppo
    ? prisma.partner.findMany({
        where: {
          attivo: true,
          NOT: { id: p.id },
          OR: [{ id: p.capogruppo.id }, { capogruppoId: p.capogruppo.id }],
        },
        select: { id: true, nome: true, citta: true, sede: true, indirizzo: true },
        orderBy: [{ citta: "asc" }, { indirizzo: "asc" }],
      })
    : Promise.resolve(
        p.sedi.map((s) => ({ id: s.id, nome: s.nome, citta: s.citta, sede: s.sede, indirizzo: s.indirizzo })),
      ),
    // La distribuzione delle stelle conta TUTTI i feedback, non solo i 30 elencati.
    prisma.feedbackD2C.groupBy({ by: ["voto"], where: { partnerId: p.id }, _count: { _all: true } }),
    getLinee(),
    prisma.partner.findMany({
      where: {
        attivo: true,
        NOT: { id: p.id },
        nome: { equals: nomeInsegna, mode: "insensitive" },
        capogruppoId: null,
        ...(p.capogruppo ? { NOT: [{ id: p.id }, { id: p.capogruppo.id }] } : {}),
      },
      select: { id: true, nome: true, sede: true, citta: true, indirizzo: true, stato: true },
      orderBy: [{ citta: "asc" }],
    }),
  ]);
  // Tutti gli ALTRI luoghi della stessa insegna, comunque siano legati: le sedi
  // formali, la madre e le sorelle quando questa è una sede, e le anagrafiche
  // con lo stesso nome che stanno insieme senza legame manuale. Deduplicati:
  // una stessa anagrafica può arrivare da due strade.
  const luoghiInsegna = [...p.sedi, ...(p.capogruppo ? altriLuoghi : []), ...stessaInsegna].filter(
    (x, i, tutti) => tutti.findIndex((y) => y.id === x.id) === i,
  );
  const etichettaLuogo = (l: { nome: string; citta: string | null; sede: string | null; indirizzo: string | null }) =>
    [l.sede, l.citta, l.sede ? null : l.indirizzo].filter(Boolean).join(" · ") || l.nome;

  // Appena diventata cliente: i referenti vanno in rubrica Google in automatico
  const affiliatoReseller = eAffiliatoReseller(p.interessi);
  const righeRubrica: RigaContatto[] =
    rubrica === "1" && p.stato === "attivo"
      ? p.contatti.map((c) => ({
          id: c.id,
          nome: c.nome,
          ruolo: c.ruolo,
          telefono: c.telefono,
          email: c.email,
          fonte: c.fonte,
          hubspotId: c.hubspotId,
          nomeRubrica: c.nomeRubrica,
          partnerId: p.id,
          partnerNome: p.nome,
          categoria: p.categoria,
          citta: p.citta,
          stato: p.stato,
          statoLabel: isStato(p.stato) ? ETICHETTE_STATO[p.stato] : p.stato,
          provincia: p.provincia,
          indirizzo: p.indirizzo,
          ragioneSociale: p.ragioneSociale,
          affiliatoReseller,
        }))
      : [];

  const extra: Record<string, unknown> = p.datiExtra ? JSON.parse(p.datiExtra) : {};

  // Valutazione D2C: media dei feedback + distribuzione delle stelle. Senza
  // feedback non c'è voto (né zero): la sezione lo dice e basta.
  const valutazione = valutazioneD2C(p);
  // La distribuzione conta TUTTI i feedback, non solo quelli elencati sotto.

  const contaVoto = new Map(perVoto.map((v) => [v.voto, v._count._all]));
  const distribuzione = [5, 4, 3, 2, 1].map((stelle) => ({
    stelle,
    quanti: contaVoto.get(stelle) ?? 0,
  }));
  const maxDistribuzione = Math.max(...distribuzione.map((d) => d.quanti), 1);

  const ETICHETTE_FONTE: Record<string, string> = {
    excel: "dal tracker Excel",
    platform: "da app.deluxy.it",
    manuale: "via API",
    ui: "dal registro",
    hubspot: "da HubSpot",
  };
  // Nelle righe delle sedi conta lo stato commerciale; nello storico compaiono
  // anche i passaggi finanziari e di analisi (prefissati) → nomeEventoStato.
  const nomeStato = (s: string) =>
    s === "archiviata" ? "Archiviata" : isStato(s) ? ETICHETTE_STATO[s] : s;
  const dataOra = (d: Date) =>
    d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // La storia è UNA sola, letta da due tabelle: gli stati vivono in
  // `PassaggioStato` (lo leggono anche le API), tutto il resto nel log delle
  // modifiche. Qui si uniscono e si ordinano per data — duplicarli in una
  // tabella sola avrebbe voluto dire migrare uno storico che è già buono.
  const eventi = [
    ...p.passaggi.map((ev) => ({
      chiave: `stato-${ev.id}`,
      quando: ev.creatoIl,
      etichetta: "Stato",
      da: nomeEventoStato(ev.da),
      a: nomeEventoStato(ev.a),
      origine: ev.origine,
      autore: null as string | null,
      azione: false,
    })),
    // La creazione non si mostra due volte: in fondo alla lista c'è già la
    // riga «Creata» costruita da `creatoIl` + `fonte`. La riga di log resta nel
    // database per l'audit, ma qui sarebbe un doppione.
    ...p.modifiche.filter((m) => m.campo !== "creata").map((m) => ({
      chiave: `mod-${m.id}`,
      quando: m.creatoIl,
      etichetta: etichettaCampo(m.campo),
      da: m.da,
      a: m.a,
      origine: m.origine,
      autore: m.autore,
      azione: eAzione(m.campo),
    })),
  ].sort((x, y) => y.quando.getTime() - x.quando.getTime());

  return (
    <div className="layout">
      <Sidebar categoriaAttiva={p.categoria} />
      <main className="main">
      <a className="ritorno" href={`/?categoria=${encodeURIComponent(p.categoria)}`}>
        ← Tutte le anagrafiche {p.categoria.toLowerCase()}
      </a>

      <div className="page-head">
        <div>
          <h1 className="page-title">{p.nome}</h1>
          <p className="page-sub">
            {[p.categoria, p.citta, p.regione].filter(Boolean).join(" · ")}
            {p.tipoLuogo && (
              <>
                {" "}
                <span
                  className="badge"
                  style={{ color: isTipoLuogo(p.tipoLuogo) ? COLORE_TIPO_LUOGO[p.tipoLuogo] : undefined }}
                  title="Che cosa e questo luogo dentro l azienda"
                >
                  <span className="dot" />
                  {etichettaTipoLuogo(p.tipoLuogo)}
                </span>
              </>
            )}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {p.attivo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="etichetta-interessi">Interessi</span>
              <MenuInteressi partnerId={p.id} interessi={p.interessi} linee={linee} />
            </div>
          )}
          {p.attivo ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="etichetta-interessi">Commerciale</span>
                <SelettoreStato partnerId={p.id} statoAttuale={p.stato} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="etichetta-interessi">Finanziario</span>
                <SelettoreStatoAzienda
                  partnerId={p.id}
                  dimensione="finanziario"
                  statoAttuale={p.statoFinanziario}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="etichetta-interessi">Analisi</span>
                <SelettoreStatoAzienda
                  partnerId={p.id}
                  dimensione="analisi"
                  statoAttuale={p.statoAnalisi}
                />
              </div>
            </>
          ) : (
            <span className="badge" style={{ color: "var(--text-tertiary)" }}>
              <span className="dot" />
              <span style={{ color: "var(--text)" }}>Archiviata</span>
            </span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <a className="btn btn-secondario" href={`/partner/${p.id}/modifica`} style={{ fontSize: 12.5, padding: "6px 14px" }}>
              ✎ Modifica
            </a>
            {/* Innesco manuale del salvataggio referenti in rubrica Google:
                utile per i clienti diventati Attivi fuori dalla UI (Excel/API). */}
            {p.stato === "attivo" && p.contatti.length > 0 && (
              <a className="btn btn-secondario" href={`/partner/${p.id}?rubrica=1`} style={{ fontSize: 12.5, padding: "6px 14px" }}>
                ☎ Salva in rubrica
              </a>
            )}
            {/* Una sede non può avere sedi proprie: il gruppo è a un livello */}
            {p.attivo && !p.capogruppo && (
              <AggiungiSede
                madreId={p.id}
                nome={p.nome}
                citta={p.citta}
                provincia={p.provincia}
                ragioneSociale={p.ragioneSociale}
                categoria={p.categoria}
                compatto
              />
            )}
            {p.attivo && !p.capogruppo && p.sedi.length === 0 && (
              <GestioneGruppo partnerId={p.id} nome={p.nome} />
            )}
            {/* I doppioni non si raggruppano, si uniscono: due schede della
                stessa azienda vogliono dire due stati e due valutazioni. */}
            {p.attivo && <UnisciAnagrafiche partnerId={p.id} nome={p.nome} />}
            <form action={impostaArchiviato.bind(null, p.id, p.attivo)}>
              <button type="submit" className="btn btn-secondario" style={{ fontSize: 12.5, padding: "6px 14px" }}>
                {p.attivo ? "⌫ Archivia" : "↩ Ripristina"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {righeRubrica.length > 0 && <SalvaRubricaAuto contatti={righeRubrica} />}

      {p.capogruppo && (
        <section className="scheda" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 13.5 }}>
            Sede del gruppo{" "}
            <a href={`/partner/${p.capogruppo.id}`}>
              <strong>{p.capogruppo.nome}</strong>
            </a>
            {p.capogruppo.citta && <span className="cella-fonte"> · {p.capogruppo.citta}</span>}
          </p>
          <form action={raggruppaSotto.bind(null, p.id, null)}>
            <button type="submit" className="btn btn-secondario" style={{ fontSize: 12.5, padding: "6px 14px" }}>
              Togli dal gruppo
            </button>
          </form>
        </section>
      )}

      <section className="scheda">
        <h2 className="scheda-titolo">Anagrafica</h2>
        <dl className="griglia-campi">
          <Campo etichetta="Ragione sociale" valore={p.ragioneSociale} />
          <Campo etichetta="P. IVA" valore={fin.pIva} />
          <Campo etichetta="Codice fiscale" valore={fin.codiceFiscale} />
          <Campo etichetta="Tipo di luogo" valore={etichettaTipoLuogo(p.tipoLuogo)} />
          <Campo etichetta="Sede" valore={p.sede} />
          <Campo etichetta="Indirizzo" valore={p.indirizzo} />
          <Campo etichetta="Città" valore={p.citta} />
          <Campo etichetta="Provincia" valore={p.provincia} />
          <Campo etichetta="Regione" valore={p.regione} />
          <Campo etichetta="Email" valore={p.email} />
          <Campo etichetta="Telefono" valore={p.telefono} />
          <Campo etichetta="Account commerciale" valore={p.account} />
          <Campo etichetta="Tipo prospect" valore={p.tipoProspect} />
          <Campo
            etichetta="Ultima visita"
            valore={p.ultimaVisita ? p.ultimaVisita.toLocaleDateString("it-IT") : null}
          />
          <Campo etichetta="Fonte" valore={p.fonte} />
          <Campo
            etichetta="Collegamento piattaforma"
            valore={p.platformId ? `app.deluxy.it · ${p.platformId}` : null}
          />
        </dl>
      </section>

      <section className="scheda">
        <h2 className="scheda-titolo">
          Valutazione D2C{" "}
          <span className="scheda-sub">giudizio interno di Deluxy sulle consegne D2C servite da questo partner</span>
        </h2>
        <div className="d2c-testata">
          <div className="d2c-punteggio">
            {valutazione.voto == null ? (
              <>
                <div className="d2c-voto-grande d2c-vuoto">—</div>
                <div className="d2c-sotto">Da valutare · nessun feedback</div>
              </>
            ) : (
              <>
                <div className="d2c-voto-grande" style={{ color: valutazione.colore }}>
                  {formattaVoto(valutazione.voto)}
                  <span className="d2c-su">/5</span>
                </div>
                <div className="d2c-sotto">
                  {valutazione.feedback} feedback
                  {!valutazione.affidabile && ` · meno di ${SOGLIA_AFFIDABILE}: voto indicativo`}
                  {valutazione.ultimoFeedback && ` · ultimo ${valutazione.ultimoFeedback.toLocaleDateString("it-IT")}`}
                </div>
              </>
            )}
          </div>
          <div className="d2c-distribuzione">
            {valutazione.voto == null ? (
              <p className="testo-guida" style={{ margin: 0 }}>
                Nessun giudizio ancora registrato: il partner non ha un voto (che è diverso da un voto
                basso). Lo registra chi ha seguito l&apos;ordine con <strong>＋ Feedback</strong>, o
                un&apos;app interna via <code>POST /api/v1/feedback</code>.
              </p>
            ) : (
              distribuzione.map((d) => (
                <div className="dash-riga" key={d.stelle}>
                  <span className="dash-etichetta">{"★".repeat(d.stelle)}</span>
                  <span className="dash-track">
                    <span
                      className="dash-fill"
                      style={{
                        width: `${d.quanti > 0 ? Math.max(2, (d.quanti / maxDistribuzione) * 100) : 0}%`,
                        background: valutazione.colore,
                      }}
                    />
                  </span>
                  <span className="dash-valore">{d.quanti}</span>
                </div>
              ))
            )}
          </div>
          <div className="d2c-azioni">
            <FasciaD2C voto={valutazione.voto} feedback={valutazione.feedback} />
            {p.attivo && <FormFeedbackD2C partnerId={p.id} nome={p.nome} />}
          </div>
        </div>

        {p.feedbackD2C.length > 0 && (
          <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)", marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Voto</th>
                  <th>Origine</th>
                  <th>Ordine</th>
                  <th>Chi valuta</th>
                  <th>Cosa è successo</th>
                  <th>Registrato da</th>
                  <th aria-label="Elimina"></th>
                </tr>
              </thead>
              <tbody>
                {p.feedbackD2C.map((f) => (
                  <tr key={f.id}>
                    <td className="cella-muta">{f.dataFeedback.toLocaleDateString("it-IT")}</td>
                    <td>
                      <StelleD2C voto={f.voto} feedback={1} soloStelle />
                    </td>
                    <td className="cella-muta">
                      {f.origine ? (ETICHETTE_ORIGINE[f.origine] ?? f.origine) : "—"}
                    </td>
                    <td className="cella-muta">{f.ordine ?? "—"}</td>
                    <td className="cella-muta">{f.autore ?? "—"}</td>
                    <td className="cella-muta">
                      {/* Se il voto nasce da un reclamo, la casistica e la
                          gravità sono la spiegazione del voto: vanno lette
                          prima del commento. */}
                      {(f.casistica || f.gravita) && (
                        <div style={{ marginBottom: 4 }}>
                          <strong>{f.casistica ?? "Reclamo"}</strong>
                          {f.gravita && (
                            <span className="cella-fonte">
                              {" "}· {ETICHETTE_GRAVITA[f.gravita]?.toLowerCase()}
                              {f.reclamoRisolto != null && (f.reclamoRisolto ? ", risolto" : ", aperto")}
                            </span>
                          )}
                        </div>
                      )}
                      {f.motivi.length > 0 && (
                        <div className="interessi-pillole" style={{ marginBottom: f.commento ? 4 : 0 }}>
                          {f.motivi.map((m) => (
                            <span key={m} className="badge neutro">{ETICHETTE_MOTIVO[m] ?? m}</span>
                          ))}
                        </div>
                      )}
                      {f.commento ? (
                        <span className="cella-note" title={f.commento}>{f.commento}</span>
                      ) : f.motivi.length === 0 ? (
                        "—"
                      ) : null}
                    </td>
                    <td className="cella-muta">{f.sistema === "ui" ? "dal registro" : f.sistema}</td>
                    <td>
                      <form action={eliminaFeedbackD2C.bind(null, f.id)}>
                        <button type="submit" className="btn-archivia" title="Elimina questo feedback">
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {valutazione.feedback > p.feedbackD2C.length && (
              <p className="testo-guida" style={{ padding: "10px 14px", margin: 0 }}>
                Elencati gli ultimi {p.feedbackD2C.length} di {valutazione.feedback} feedback; media e
                distribuzione qui sopra li contano tutti.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="scheda">
        <h2 className="scheda-titolo">
          Dati finanziari{" "}
          <span className="scheda-sub">
            fatturazione e pagamenti{haSedi ? " · condivisi con le sedi dell'insegna" : ""}
          </span>
        </h2>
        {/* Il gruppo di pagamento è una risposta a «chi paga»: quando c'è, va
            letta prima dell'IBAN, non cercata in mezzo agli altri campi. */}
        {fin.gruppoPagamento && (
          <p className="avviso-pagamento">
            <strong>Pagamento centralizzato:</strong> paga <strong>{fin.gruppoPagamento}</strong> per
            tutte le sedi dell&apos;insegna — le singole sedi non si fatturano separatamente.
          </p>
        )}
        {[p.ragioneSociale, fin.pIva, fin.codiceFiscale, fin.pec, fin.codiceSdi, fin.iban, fin.banca,
          fin.metodoPagamento, fin.condizioniPagamento, fin.gruppoPagamento, fin.noteAmministrative,
          fin.amministrazioneNome, fin.amministrazioneTelefono, fin.amministrazioneEmail,
        ].every((v) => !v) ? (
          <p className="testo-guida" style={{ margin: 0 }}>
            Nessun dato finanziario ancora inserito — compila con ✎ Modifica.
          </p>
        ) : (
          <dl className="griglia-campi">
            <Campo etichetta="Ragione sociale" valore={p.ragioneSociale} />
            <Campo etichetta="P. IVA" valore={fin.pIva} />
            <Campo etichetta="Codice fiscale" valore={fin.codiceFiscale} />
            <Campo etichetta="PEC" valore={fin.pec} />
            <Campo etichetta="Codice SDI" valore={fin.codiceSdi} />
            <Campo etichetta="IBAN" valore={fin.iban} largo />
            <Campo etichetta="Banca" valore={fin.banca} />
            <Campo etichetta="Metodo di pagamento" valore={fin.metodoPagamento} />
            <Campo etichetta="Condizioni di pagamento" valore={fin.condizioniPagamento} />
            <Campo etichetta="Gruppo di pagamento" valore={fin.gruppoPagamento} />
            <Campo etichetta="Contatto amministrativo" valore={fin.amministrazioneNome} />
            <Campo etichetta="Telefono amministrazione" valore={fin.amministrazioneTelefono} />
            <Campo etichetta="Email amministrazione" valore={fin.amministrazioneEmail} />
            <Campo etichetta="Note amministrative" valore={fin.noteAmministrative} largo />
          </dl>
        )}
      </section>

      {/* La sezione c'è anche a zero sedi: è da qui che si aggiunge la seconda
          boutique in città, e senza il riquadro non si saprebbe che si può. */}
      {(luoghiInsegna.length > 0 || (p.attivo && !p.capogruppo)) && (
        <section className="scheda">
          <div className="testata-sezione">
            <h2 className="scheda-titolo" style={{ marginBottom: 0 }}>
              Sedi{" "}
              <span className="scheda-sub">
                {luoghiInsegna.length > 0
                  ? `${luoghiInsegna.length + 1} luoghi in tutto, questa compresa`
                  : "un solo luogo: questa anagrafica"}
              </span>
            </h2>
            {p.attivo && !p.capogruppo && (
              <AggiungiSede
                madreId={p.id}
                nome={p.nome}
                citta={p.citta}
                provincia={p.provincia}
                ragioneSociale={p.ragioneSociale}
                categoria={p.categoria}
                compatto
              />
            )}
          </div>
          {luoghiInsegna.length > 0 && (
            <p className="avviso-pagamento">
              <strong>Gli altri luoghi di questa insegna:</strong>{" "}
              {luoghiInsegna.map((x, i) => (
                <span key={x.id}>
                  {i > 0 && ", "}
                  <a href={"/partner/" + x.id}>
                    {[x.sede, x.citta].filter(Boolean).join(" · ") || x.nome}
                  </a>
                </span>
              ))}
              . Sono tutte la stessa insegna: l&apos;elenco le mostra come un gruppo solo e
              condividono i dati di fatturazione. Quelle che <strong>portano lo stesso nome stanno
              insieme da sé</strong>, senza collegarle a mano — il legame manuale serve solo quando
              l&apos;insegna è scritta in modo diverso.
            </p>
          )}
          {p.sedi.length === 0 ? (
            <p className="testo-guida" style={{ margin: 0 }}>
              Se l&apos;insegna ha più luoghi — anche due indirizzi nella stessa città — aggiungili con
              <strong> ＋ Sedi di questa</strong>: ognuno resta un&apos;anagrafica a sé per stato,
              referenti e feedback, mentre fatturazione e gruppo di pagamento restano quelli della
              società.
            </p>
          ) : (
            <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
              <table>
                <thead>
                  <tr>
                    <th>Sede</th>
                    <th>Tipo</th>
                    <th>Città</th>
                    <th>Indirizzo</th>
                    <th>Stato commerciale</th>
                    <th>Referenti</th>
                    <th aria-label="Azioni"></th>
                  </tr>
                </thead>
                <tbody>
                  {p.sedi.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <a href={`/partner/${s.id}`}>
                          <div className="cella-nome">{s.sede ?? s.nome}</div>
                          <div className="cella-sub">{s.sede ? s.nome : s.categoria}</div>
                        </a>
                      </td>
                      <td className="cella-muta">{etichettaTipoLuogo(s.tipoLuogo) ?? "—"}</td>
                      <td className="cella-muta">{s.citta ?? "—"}</td>
                      <td className="cella-muta">{s.indirizzo ?? "—"}</td>
                      <td className="cella-muta">{nomeStato(s.stato)}</td>
                      <td className="cella-muta">{s.contatti.length}</td>
                      <td>
                        <form action={raggruppaSotto.bind(null, s.id, null)}>
                          <button type="submit" className="btn-archivia" title="Togli questa sede dal gruppo">
                            ✕
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Anche a zero referenti: una sede appena aperta è esattamente il caso
          in cui bisogna poterne aggiungere uno. I referenti sono di QUESTA
          sede, non dell'insegna: due negozi hanno persone diverse. */}
      <section className="scheda">
          <div className="testata-sezione">
            <h2 className="scheda-titolo" style={{ marginBottom: 0 }}>
              Contatti{" "}
              <span className="scheda-sub">
                {p.contatti.length > 0
                  ? `${p.contatti.length} persone di riferimento${haSedi ? " di questa sede" : ""}`
                  : "nessun referente ancora"}
              </span>
            </h2>
            {p.attivo && (
              <span className="azioni-testata">
                <ReferentiDallaRubrica partnerId={p.id} nome={p.nome} citta={p.citta} />
                <AggiungiReferente partnerId={p.id} nome={p.nome} />
              </span>
            )}
          </div>
          {p.contatti.length === 0 ? (
            <p className="testo-guida" style={{ margin: 0 }}>
              {haSedi
                ? "Ogni sede ha i suoi referenti: aggiungi qui le persone che lavorano in questo luogo."
                : "Nessuna persona di riferimento: aggiungila con ＋ Referente."}
            </p>
          ) : (
          <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
            <table>
              <thead>
                <tr>
                  <th>Ruolo</th>
                  <th>Nome</th>
                  <th>Telefono</th>
                  <th>Email</th>
                  <th>Fonte</th>
                  {altriLuoghi.length > 0 && <th>Sposta in</th>}
                  <th aria-label="Rimuovi"></th>
                </tr>
              </thead>
              <tbody>
                {p.contatti.map((c) => (
                  <tr key={c.id}>
                    <td className="cella-muta">{c.ruolo ?? "—"}</td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
                        <a href={`/contatti/${c.id}`} title="Apri e modifica il contatto">
                          {c.nome ?? "—"}
                        </a>
                        {c.hubspotId && (
                          <a href={linkContattoHubspot(c.hubspotId)} target="_blank" rel="noreferrer" title="Apri il contatto in HubSpot">
                            ↗
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="cella-muta">
                      {c.telefono ? (
                        <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} title="Chiama">{c.telefono}</a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="cella-muta">{c.email ?? "—"}</td>
                    <td className="cella-muta">
                      {c.fonte === "hubspot" ? "HubSpot" : c.fonte ? c.fonte : "Excel"}
                      {c.salvatoInRubricaIl && (
                        <div
                          className="in-rubrica"
                          title={`In rubrica Google dal ${c.salvatoInRubricaIl.toLocaleDateString("it-IT")}`}
                        >
                          ✓ In rubrica
                        </div>
                      )}
                    </td>
                    {altriLuoghi.length > 0 && (
                      <td>
                        {/* Spostare, non ricreare: la persona porta con sé il
                            collegamento a HubSpot e lo storico. */}
                        <form action={spostaReferenteInSede.bind(null, c.id)} className="sposta-referente">
                          <select name="destinazione" defaultValue="" aria-label={`Sposta ${c.nome ?? "il referente"} in un'altra sede`}>
                            <option value="">—</option>
                            {altriLuoghi.map((l) => (
                              <option key={l.id} value={l.id}>{etichettaLuogo(l)}</option>
                            ))}
                          </select>
                          <button type="submit" className="btn-archivia" title="Sposta il referente nella sede scelta">
                            →
                          </button>
                        </form>
                      </td>
                    )}
                    <td>
                      <form action={staccaContatto.bind(null, c.id)}>
                        <button
                          type="submit"
                          className="btn-archivia"
                          title={`Rimuovi «${c.nome ?? "questo referente"}» da ${p.nome}`}
                        >
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>

      {(p.note || p.contattiRaw) && (
        <section className="scheda">
          <h2 className="scheda-titolo">Note</h2>
          <dl className="griglia-campi">
            <Campo etichetta="Note" valore={p.note} largo />
            <Campo etichetta="Contatti (testo originale)" valore={p.contattiRaw} largo />
          </dl>
        </section>
      )}

      {Object.keys(extra).length > 0 && (
        <section className="scheda">
          <h2 className="scheda-titolo">Dati del tracker</h2>
          <dl className="griglia-campi">
            {Object.entries(extra).map(([k, v]) => (
              <Campo key={k} etichetta={k} valore={String(v)} />
            ))}
          </dl>
        </section>
      )}

      <section className="scheda">
        <h2 className="scheda-titolo">
          Storia{" "}
          <span className="scheda-sub">
            ogni cambiamento registrato: campo, valore prima e dopo, e da dove è arrivato
          </span>
        </h2>
        <ol className="storia">
          {eventi.map((ev) => (
            <li key={ev.chiave}>
              <span className="storia-data">{dataOra(ev.quando)}</span>
              <span>
                <span className="storia-campo">{ev.etichetta}</span>
                {ev.azione ? (
                  ev.a || ev.da ? (
                    <>
                      {" "}
                      <strong>{ev.a ?? ev.da}</strong>
                    </>
                  ) : null
                ) : (
                  <>
                    {" "}
                    <span className="storia-da">{ev.da ?? "(vuoto)"}</span>{" "}
                    <span className="storia-freccia">→</span> <strong>{ev.a ?? "(vuoto)"}</strong>
                  </>
                )}
              </span>
              <span className="storia-origine">
                {etichettaOrigine(ev.origine)}
                {ev.autore ? ` · ${ev.autore}` : ""}
              </span>
            </li>
          ))}
          <li>
            <span className="storia-data">{dataOra(p.creatoIl)}</span>
            <span><strong>Creata</strong></span>
            <span className="storia-origine">{ETICHETTE_FONTE[p.fonte] ?? p.fonte}</span>
          </li>
        </ol>
        {p.modifiche.length >= 120 && (
          <p className="testo-guida" style={{ marginTop: 10 }}>
            Mostrate le ultime 120 modifiche: le più vecchie restano nel database.
          </p>
        )}
      </section>
      </main>
    </div>
  );
}
