import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataBreve } from "@/lib/ordini";
import { brandConColore, mappaColori, coloreBrand } from "@/lib/brand";
import { clienteSingolo, decodificaChiave, whereOrdiniCliente } from "@/lib/clienti";
import { LISTE, TIPOLOGIE, consensoLeggibile, nomeTipologia } from "@/lib/segmenti";
import {
  coloreTipoEvento,
  dataEvento,
  fraQuantiGiorni,
  nomeTipoEvento,
  quandoLeggibile,
} from "@/lib/eventi";
import { statiOrdinati } from "@/lib/stati";
import { CambiaStatoSelect } from "@/components/CambiaStatoSelect";
import { PillAttivita, PillPrivacy, PillSegmento, PillTipologia, giorniFa } from "@/components/TabellaClienti";
import { impostaPrivacyCliente, impostaTipologiaCliente, riepilogaClienteAI } from "@/app/actions";
import { aiConfigurata } from "@/lib/ai";
import { MAX_ORDINI } from "@/lib/clienti-ai";

export const dynamic = "force-dynamic";

export default async function SchedaCliente({
  params,
  searchParams,
}: {
  params: Promise<{ chiave: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { chiave: codice } = await params;
  const sp = await searchParams;
  const chiave = decodificaChiave(codice);
  const where = whereOrdiniCliente(chiave);

  const [ordini, somma, brand, stati, cliente, riepilogo, eventi] = await Promise.all([
    prisma.ordine.findMany({
      where,
      include: { stato: true, etichette: true },
      orderBy: { data: "desc" },
      take: 300,
    }),
    prisma.ordine.aggregate({ where, _sum: { totale: true }, _count: { _all: true } }),
    brandConColore(),
    statiOrdinati(),
    clienteSingolo(chiave),
    prisma.riepilogoCliente.findUnique({ where: { chiave } }),
    prisma.eventoCliente.findMany({
      where: { chiave, stato: { not: "ignorato" } },
      orderBy: [{ ricorrenze: "desc" }, { mese: "asc" }, { giorno: "asc" }],
    }),
  ]);

  if (ordini.length === 0) notFound();

  const colori = mappaColori(brand);
  const statiOpt = stati.map((s) => ({ id: s.id, nome: s.nome }));
  const primo = ordini[ordini.length - 1];
  const ultimo = ordini[0];
  const speso = somma._sum.totale ?? 0;
  const quanti = somma._count._all;

  // I dati anagrafici più completi fra tutti i suoi ordini
  const nome = ordini.find((o) => o.clienteNome)?.clienteNome ?? ultimo.spedizioneNome ?? chiave;
  const email = ordini.find((o) => o.clienteEmail)?.clienteEmail ?? null;
  const telefono = ordini.find((o) => o.clienteTelefono)?.clienteTelefono ?? null;
  const indirizzo = ordini.find((o) => o.indirizzo);
  const brandUsati = [...new Set(ordini.map((o) => o.brand))];

  // Le liste in cui questo cliente compare: è il modo più onesto di mostrare la
  // classificazione — non un'etichetta calata dall'alto, ma «ecco dove finisci».
  const sueListe = cliente
    ? LISTE.filter((l) => {
        switch (l.famiglia) {
          case "valore":
            return l.chiave === segmentoALista(cliente.segmento);
          case "tipologia":
            return l.chiave === tipologiaALista(cliente.tipologia);
          default:
            return false;
        }
      })
    : [];

  return (
    <main className="main">
      <Link href="/clienti" className="ritorno">← Tutti i clienti</Link>

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}
      {sp.errore && <div className="avviso-errore">{sp.errore}</div>}

      <div className="page-head">
        <div>
          <h1 className="page-title">{nome}</h1>
          <p className="page-sub">
            {quanti === 1 ? "1 ordine" : `${quanti.toLocaleString("it-IT")} ordini`} · {euro(speso)} totali
          </p>
          {cliente && (
            <span className="etichette" style={{ marginTop: 10 }}>
              <PillTipologia cliente={cliente} />
              <PillSegmento segmento={cliente.segmento} />
              <PillAttivita attivita={cliente.attivita} giorni={cliente.giorni} />
              <PillPrivacy cliente={cliente} />
              {cliente.annullati > 0 && (
                <span className="tag" style={{ color: "var(--red)" }}>
                  <span className="dot" />
                  <span className="tag-label">{cliente.annullati} annullati</span>
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{(cliente?.ordini ?? quanti).toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Ordini validi</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(cliente?.speso ?? speso)}</div>
          <div className="kpi-etichetta">Speso in totale</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(cliente?.medio ?? (quanti ? speso / quanti : 0))}</div>
          <div className="kpi-etichetta">Ordine medio</div>
        </div>
        {cliente && (
          <div className="kpi">
            <div className="kpi-valore">{giorniFa(cliente.giorni)}</div>
            <div className="kpi-etichetta">Ultimo ordine</div>
          </div>
        )}
      </div>

      {/* ---- Classificazione: tipologia (correggibile) e liste ---- */}
      {cliente && (
        <div className="scheda">
          <div className="scheda-titolo">Tipologia di cliente</div>
          <form action={impostaTipologiaCliente} className="modulo">
            <input type="hidden" name="chiave" value={chiave} />
            <div className="campo-modulo">
              <label htmlFor="tipo">Tipologia</label>
              <select id="tipo" name="tipo" defaultValue={cliente.tipoManuale ?? ""}>
                <option value="">
                  Automatica — dedotta: {nomeTipologia(cliente.tipologiaAuto)}
                </option>
                {TIPOLOGIE.map((t) => (
                  <option key={t.chiave} value={t.chiave}>
                    {t.nome} — {t.spiega}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label htmlFor="note">Perché (facoltativo)</label>
              <input id="note" name="note" defaultValue={cliente.notaTag ?? ""} placeholder="es. cliente B2B, fattura a fine mese" />
            </div>
            <div className="azioni-modulo campo-modulo largo">
              <button className="btn" type="submit">Salva tipologia</button>
            </div>
          </form>
          <p className="testo-guida" style={{ marginTop: 6 }}>
            {cliente.tipoManuale
              ? "Impostata a mano: la deduzione automatica non la tocca più."
              : `Dedotta dal nome di chi ordina (mai dal destinatario). ${cliente.dominioAziendale ? "L'email ha un dominio proprio: potrebbe essere un'azienda." : ""}`}
          </p>

          <div className="scheda-titolo" style={{ marginTop: 22 }}>Privacy: si può contattare?</div>
          <form action={impostaPrivacyCliente} className="modulo">
            <input type="hidden" name="chiave" value={chiave} />
            {(
              [
                { campo: "email", nome: "Email", shopify: cliente.consensoEmail, valore: cliente.privacyEmail },
                { campo: "sms", nome: "WhatsApp / SMS", shopify: cliente.consensoSms, valore: cliente.privacySms },
                { campo: "telefono", nome: "Telefonate", shopify: null, valore: cliente.privacyTelefono },
              ] as const
            ).map((c) => (
              <div className="campo-modulo" key={c.campo}>
                <label htmlFor={`privacy-${c.campo}`}>{c.nome}</label>
                <select id={`privacy-${c.campo}`} name={c.campo} defaultValue={c.valore ?? ""}>
                  <option value="">
                    {c.shopify != null
                      ? `Come dice Shopify — ${consensoLeggibile(c.shopify)}`
                      : "Non lo sappiamo (quindi non si contatta)"}
                  </option>
                  <option value="si">Sì, si può contattare</option>
                  <option value="no">No, non si può</option>
                </select>
              </div>
            ))}
            <div className="campo-modulo">
              <label htmlFor="nota-privacy">Perché (facoltativo)</label>
              <input
                id="nota-privacy"
                name="note"
                defaultValue={cliente.notaPrivacy ?? ""}
                placeholder="es. ha chiesto per telefono di non ricevere più email"
              />
            </div>
            <div className="campo-modulo largo">
              <label style={{ textTransform: "none", letterSpacing: 0, fontSize: 13.5, fontWeight: 400, color: "var(--text)" }}>
                <input type="checkbox" name="bloccato" defaultChecked={cliente.bloccato} style={{ marginRight: 8 }} />
                <strong>Non contattare mai</strong> — vale su tutti i canali e nessuna automazione lo scavalca
              </label>
            </div>
            <div className="azioni-modulo campo-modulo largo">
              <button className="btn" type="submit">Salva privacy</button>
            </div>
          </form>
          <p className="testo-guida" style={{ marginTop: 6 }}>
            Stato di oggi:{" "}
            <strong>
              {cliente.bloccato
                ? "non contattare (bloccato)"
                : [cliente.contattabileEmail ? "email" : null, cliente.contattabileSms ? "WhatsApp/SMS" : null]
                    .filter(Boolean)
                    .join(" + ") || "nessun canale consentito"}
            </strong>
            . Da Shopify: email «{consensoLeggibile(cliente.consensoEmail)}», SMS «
            {consensoLeggibile(cliente.consensoSms)}». Quello che scrivi qui vince sempre su Shopify,
            e se non sappiamo niente non si contatta.
          </p>

          {sueListe.length > 0 && (
            <>
              <div className="scheda-titolo" style={{ marginTop: 18 }}>Liste in cui compare</div>
              <div className="etichette">
                {sueListe.map((l) => (
                  <Link key={l.chiave} href={`/liste/${l.chiave}`} className="tag" style={{ color: l.colore }}>
                    <span className="dot" />
                    <span className="tag-label">{l.nome}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Il riepilogo scritto dall'AI leggendo i suoi ordini: chi è, cosa
          compra, cosa gli piace. Sta in cima perché è la risposta alla domanda
          che ci si fa aprendo una scheda. */}
      {cliente && (
        <div className="scheda scheda-riepilogo">
          <div className="scheda-titolo">
            Riepilogo del cliente {riepilogo ? `· scritto con ${riepilogo.modello || "l'AI"}` : ""}
          </div>

          {riepilogo ? (
            <>
              <p className="riepilogo-testo">{riepilogo.testo}</p>

              {riepilogo.gusti && (
                <>
                  <div className="scheda-titolo" style={{ marginTop: 16 }}>Preferenze e gusti</div>
                  <p className="riepilogo-gusti">{riepilogo.gusti}</p>
                </>
              )}

              {riepilogo.punti && (
                <>
                  <div className="scheda-titolo" style={{ marginTop: 16 }}>
                    La sua storia, un punto per ordine
                  </div>
                  <ul className="motivi-rischio">
                    {riepilogo.punti
                      .split("\n")
                      .filter(Boolean)
                      .map((p, i) => (
                        <li key={`${i}-${p.slice(0, 20)}`}>{p}</li>
                      ))}
                  </ul>
                </>
              )}

              <p className="testo-guida" style={{ marginTop: 10 }}>
                Aggiornato il {dataBreve(riepilogo.aggiornatoIl)}, quando i suoi ordini erano{" "}
                {riepilogo.ordiniConsiderati}
                {riepilogo.ordiniConsiderati > MAX_ORDINI
                  ? ` (l'AI ne legge in dettaglio i ${MAX_ORDINI} più recenti)`
                  : ""}
                .
                {cliente.ordini > riepilogo.ordiniConsiderati ? (
                  <>
                    {" "}
                    <strong>
                      Da allora sono arrivati {cliente.ordini - riepilogo.ordiniConsiderati} ordini
                      nuovi
                    </strong>
                    : aggiornalo per aggiungerli.
                  </>
                ) : null}{" "}
                L&apos;AI legge solo gli ordini veri di questa persona e non inventa: se una cosa
                non si capisce dagli ordini, lo scrive.
              </p>
            </>
          ) : (
            <p className="testo-guida">
              Ancora nessun riepilogo. L&apos;AI legge i suoi ordini — prodotti, date,
              destinatari, biglietti — e scrive chi è questo cliente, cosa compra e{" "}
              <strong>cosa gli piace</strong>. Poi, a ogni ordine nuovo, aggiunge un punto invece
              di riscrivere tutto.
            </p>
          )}

          {aiConfigurata() ? (
            <div className="azioni-riga" style={{ marginTop: 12 }}>
              {(!riepilogo || cliente.ordini > riepilogo.ordiniConsiderati) && (
                <form action={riepilogaClienteAI}>
                  <input type="hidden" name="chiave" value={chiave} />
                  <button className="btn" type="submit">
                    {riepilogo
                      ? `Aggiungi i ${cliente.ordini - riepilogo.ordiniConsiderati} ordini nuovi`
                      : "Fai il riepilogo con l'AI"}
                  </button>
                </form>
              )}
              {riepilogo && (
                <form action={riepilogaClienteAI}>
                  <input type="hidden" name="chiave" value={chiave} />
                  <input type="hidden" name="rifai" value="si" />
                  <button className="btn btn-secondario" type="submit">
                    Riscrivi da capo
                  </button>
                </form>
              )}
            </div>
          ) : (
            <p className="testo-guida">
              L&apos;AI non è configurata: manca <code className="inline">OPENAI_API_KEY</code>.
            </p>
          )}
        </div>
      )}

      {/* Le occasioni di questo cliente: quando ordina, e per chi. */}
      {eventi.length > 0 && (
        <div className="scheda">
          <div className="scheda-titolo">Le sue occasioni</div>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th><th>Per chi</th><th>Tipo</th><th className="num">Volte</th><th>Anni</th>
                </tr>
              </thead>
              <tbody>
                {eventi.map((e) => {
                  const fra = fraQuantiGiorni(e.giorno, e.mese);
                  return (
                    <tr key={e.id}>
                      <td>
                        <span className="cella-nome">{dataEvento(e.giorno, e.mese)}</span>
                        <div className={`cella-sub${fra <= 14 ? " evento-vicino" : ""}`}>{quandoLeggibile(fra)}</div>
                      </td>
                      <td>{e.titolo || e.destinatario || "—"}</td>
                      <td>
                        <span className="tag" style={{ color: coloreTipoEvento(e.tipo) }}>
                          <span className="dot" />
                          <span className="tag-label">{nomeTipoEvento(e.tipo)}</span>
                        </span>
                      </td>
                      <td className="cella-num">{e.ricorrenze}</td>
                      <td className="cella-muta">
                        {e.primoAnno === e.ultimoAnno ? e.primoAnno : `${e.primoAnno}–${e.ultimoAnno}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="testo-guida" style={{ marginTop: 8 }}>
            Ricavate dalle date di consegna e dai destinatari dei suoi ordini. Si confermano e si
            precisano in <Link href="/eventi" className="ritorno">Eventi clienti</Link>.
          </p>
        </div>
      )}

      <div className="scheda">
        <div className="scheda-titolo">Anagrafica</div>
        <dl className="griglia-campi">
          <div className="campo"><dt>Email</dt><dd>{email ?? "—"}</dd></div>
          <div className="campo"><dt>Telefono</dt><dd>{telefono ?? "—"}</dd></div>
          <div className="campo"><dt>Primo ordine</dt><dd>{dataBreve(primo.data)}</dd></div>
          <div className="campo"><dt>Ultimo ordine</dt><dd>{dataBreve(ultimo.data)}</dd></div>
          <div className="campo campo-largo"><dt>Ultimo indirizzo</dt><dd>
            {indirizzo
              ? [indirizzo.spedizioneNome, indirizzo.indirizzo, [indirizzo.cap, indirizzo.citta, indirizzo.provincia].filter(Boolean).join(" "), indirizzo.paese]
                  .filter(Boolean)
                  .join(" · ")
              : "—"}
          </dd></div>
          <div className="campo campo-largo"><dt>Brand</dt><dd>
            <span className="etichette">
              {brandUsati.map((b) => (
                <span key={b} className="tag" style={{ color: coloreBrand(colori, b) }}>
                  <span className="dot" /><span className="tag-label">{b}</span>
                </span>
              ))}
            </span>
          </dd></div>
        </dl>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">
          I suoi ordini{quanti > ordini.length ? ` (ultimi ${ordini.length} di ${quanti})` : ""}
        </div>
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Ordine</th><th>Data</th><th className="num">Totale</th><th>Pagamento</th><th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {ordini.map((o) => (
                <tr key={o.id} className="riga-brand" style={{ ["--brand" as string]: coloreBrand(colori, o.brand) }}>
                  <td>
                    <Link href={`/ordini/${o.id}`} className="cella-nome">{o.numero}</Link>
                    <div className="cella-sub cella-brand"><span className="brand-dot" />{o.brand}</div>
                  </td>
                  <td className="cella-muta">{dataBreve(o.data)}</td>
                  <td className="cella-num">{euro(o.totale, o.valuta)}</td>
                  <td><span className="badge neutro">{o.categoriaPagamento}</span></td>
                  <td>
                    <CambiaStatoSelect ordineId={o.id} statoAttualeId={o.statoId} stati={statiOpt} compatto />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

// I segmenti e le tipologie hanno una lista con lo stesso significato ma un
// nome al plurale: qui si fa il ponte, in un punto solo.
function segmentoALista(segmento: string): string {
  const mappa: Record<string, string> = {
    vip: "vip",
    "da-non-perdere": "da-non-perdere",
    fedele: "fedeli",
    ricorrente: "ricorrenti",
    nuovo: "nuovi",
    "una-tantum": "una-tantum",
    "da-riattivare": "da-riattivare",
    perso: "persi",
  };
  return mappa[segmento] ?? segmento;
}

function tipologiaALista(tipologia: string): string {
  const mappa: Record<string, string> = {
    azienda: "aziende",
    horeca: "horeca",
    eventi: "eventi",
    rivenditore: "rivenditori",
    privato: "privati",
  };
  return mappa[tipologia] ?? tipologia;
}
