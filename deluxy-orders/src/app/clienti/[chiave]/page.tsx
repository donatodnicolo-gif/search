import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataBreve } from "@/lib/ordini";
import { brandConColore, mappaColori, coloreBrand } from "@/lib/brand";
import { clienteSingolo, decodificaChiave, whereOrdiniCliente } from "@/lib/clienti";
import { LISTE, TIPOLOGIE, nomeTipologia } from "@/lib/segmenti";
import { statiOrdinati } from "@/lib/stati";
import { CambiaStatoSelect } from "@/components/CambiaStatoSelect";
import { PillSegmento, PillTipologia, giorniFa } from "@/components/TabellaClienti";
import { impostaTipologiaCliente } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function SchedaCliente({ params }: { params: Promise<{ chiave: string }> }) {
  const { chiave: codice } = await params;
  const chiave = decodificaChiave(codice);
  const where = whereOrdiniCliente(chiave);

  const [ordini, somma, brand, stati, cliente] = await Promise.all([
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
