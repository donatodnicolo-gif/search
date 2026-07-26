import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/ordini";
import { codificaChiave } from "@/lib/clienti";
import {
  STATI_EVENTO,
  TIPI_EVENTO,
  coloreStatoEvento,
  coloreTipoEvento,
  dataEvento,
  fraQuantiGiorni,
  nomeStatoEvento,
  nomeTipoEvento,
  quandoLeggibile,
  riepilogoEventi,
} from "@/lib/eventi";
import { aggiornaEventoCliente, leggiBigliettiConAI, rilevaEventiClienti } from "@/app/actions";
import { aiConfigurata, modelloAI } from "@/lib/ai";

export const dynamic = "force-dynamic";

const PER_PAGINA = 100;

// Eventi clienti: le occasioni per cui ordinano, ricavate dagli ordini.
// La vista predefinita è **quello che sta arrivando**, perché è l'unica che si
// guarda tutti i giorni; il resto si raggiunge coi filtri.
export default async function Eventi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const vista = sp.vista ?? "prossimi";
  const q = sp.q?.trim() || undefined;
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);

  const dove = {
    ...(vista === "ricorrenti" ? { ricorrenze: { gte: 2 } } : {}),
    ...(vista === "da-confermare" ? { stato: "da-confermare" } : {}),
    ...(vista === "confermati" ? { stato: "confermato" } : {}),
    ...(vista === "ignorati" ? { stato: "ignorato" } : { stato: { not: "ignorato" } }),
    ...(q
      ? {
          OR: [
            { destinatario: { contains: q, mode: "insensitive" as const } },
            { chiave: { contains: q, mode: "insensitive" as const } },
            { titolo: { contains: q, mode: "insensitive" as const } },
            { citta: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [riepilogo, tutti] = await Promise.all([
    riepilogoEventi(),
    prisma.eventoCliente.findMany({
      where: dove,
      orderBy: [{ ricorrenze: "desc" }, { mese: "asc" }, { giorno: "asc" }],
      take: 4000,
    }),
  ]);

  // «In arrivo» si ordina per quanto manca, e quello si calcola qui: in SQL
  // sarebbe una data che cambia ogni giorno.
  const conQuando = tutti.map((e) => ({ ...e, fra: fraQuantiGiorni(e.giorno, e.mese) }));
  const ordinati =
    vista === "prossimi"
      ? conQuando.filter((e) => e.fra <= 60).sort((a, b) => a.fra - b.fra)
      : conQuando;
  const pagine = Math.max(1, Math.ceil(ordinati.length / PER_PAGINA));
  const mostrati = ordinati.slice((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA);

  function conFiltro(extra: Record<string, string>): string {
    const p = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    return `/eventi${qs ? `?${qs}` : ""}`;
  }

  const viste = [
    { chiave: "prossimi", nome: "In arrivo (60 giorni)" },
    { chiave: "ricorrenti", nome: "Ricorrenti (2+ anni)" },
    { chiave: "da-confermare", nome: "Da confermare" },
    { chiave: "confermati", nome: "Confermati" },
    { chiave: "tutti", nome: "Tutti" },
    { chiave: "ignorati", nome: "Ignorati" },
  ];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Eventi clienti</h1>
          <p className="page-sub">
            Le occasioni per cui i clienti ordinano, ricavate dagli ordini: stesso destinatario,
            stessa data, anno dopo anno. È l&apos;informazione più utile del registro, e c&apos;è
            sempre stata dentro senza che nessuno la leggesse.
          </p>
        </div>
        <div className="topbar-azioni">
          {aiConfigurata() && (
            <form action={leggiBigliettiConAI}>
              <input type="hidden" name="quanti" value="100" />
              <button className="btn" type="submit">Leggi i biglietti con l&apos;AI</button>
            </form>
          )}
          <form action={rilevaEventiClienti}>
            <button className="btn btn-secondario" type="submit">Rileggi gli ordini</button>
          </form>
        </div>
      </div>

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}
      {sp.errore && <div className="avviso-errore">{sp.errore}</div>}

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{riepilogo.prossimi30.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Ricorrono nei prossimi 30 giorni</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{riepilogo.ricorrenti.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Confermate dai fatti (2+ anni)</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{riepilogo.totale.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Occasioni trovate</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{riepilogo.daConfermare.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Da confermare</div>
        </div>
      </div>

      <div className="consiglio" style={{ ["--lista" as string]: "var(--gold)" }}>
        <span className="consiglio-titolo">Cosa c&apos;è qui dentro, e cosa no</span>
<strong>Quando</strong> ricorre si ricava da due dati strutturati — data di consegna e
        destinatario — e mai dal testo libero: se la stessa persona riceve qualcosa negli stessi
        giorni di <strong>anni diversi</strong>, la ricorrenza è un fatto. <strong>Perché</strong>
        ricorre, invece, sta scritto solo nel biglietto: lo legge l&apos;AI ({modelloAI()}) e lo
        <strong>propone</strong>, con la frase su cui ha deciso scritta sotto. Se il testo non lo
        dice — spesso nelle note ci sono tag e istruzioni per il corriere — resta «da precisare»,
        che è la risposta onesta. Quello che scrivi tu vince e non viene più toccato: sbagliare qui
        significa augurare buon compleanno a chi ha avuto un lutto.
      </div>

      <form className="ricerca" method="get">
        {sp.vista && <input type="hidden" name="vista" value={sp.vista} />}
        <span className="ricerca-icona" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        <input type="search" name="q" placeholder="Cerca: destinatario, cliente, città, titolo…" defaultValue={sp.q ?? ""} />
        <button className="btn" type="submit">Cerca</button>
        {q && <Link className="btn btn-secondario" href={conFiltro({ q: "" })}>Annulla</Link>}
      </form>

      <div className="filtri">
        <span className="etichetta-ordina">Vista</span>
        {viste.map((v) => (
          <Link key={v.chiave} className={`stato-pill${vista === v.chiave ? " attuale" : ""}`} href={conFiltro({ vista: v.chiave, page: "" })}>
            <span className="stato-label">{v.nome}</span>
          </Link>
        ))}
      </div>

      {mostrati.length === 0 ? (
        <div className="vuoto">
          {riepilogo.totale === 0
            ? "Nessun evento ancora: premi «Rileggi gli ordini» per cercarli."
            : "Nessun evento in questa vista."}
        </div>
      ) : (
        <>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Per chi</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th className="num">Volte</th>
                  <th>Anni</th>
                  <th className="num">Ultima spesa</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {mostrati.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className="cella-nome">{dataEvento(e.giorno, e.mese)}</span>
                      <div className={`cella-sub${e.fra <= 14 ? " evento-vicino" : ""}`}>{quandoLeggibile(e.fra)}</div>
                    </td>
                    <td>
                      {e.titolo || e.destinatario || "—"}
                      {e.citta && <div className="cella-sub">{e.citta}</div>}
                    </td>
                    <td className="cella-muta">
                      <Link href={`/clienti/${codificaChiave(e.chiave)}`}>{e.chiave}</Link>
                    </td>
                    <td>
                      <span
                        className="tag"
                        style={{ color: coloreTipoEvento(e.tipo) }}
                        title={e.motivoTipo ?? undefined}
                      >
                        <span className="dot" />
                        <span className="tag-label">{nomeTipoEvento(e.tipo)}</span>
                        {e.tipoDa === "ai" && <span className="tag-manuale">AI</span>}
                        {e.tipoDa === "manuale" && <span className="tag-manuale">✓</span>}
                      </span>
                      {e.prova && <div className="cella-sub prova-biglietto">«{e.prova}»</div>}
                    </td>
                    <td className="cella-num">{e.ricorrenze}</td>
                    <td className="cella-muta">
                      {e.primoAnno === e.ultimoAnno ? e.primoAnno : `${e.primoAnno}–${e.ultimoAnno}`}
                      <div className="cella-sub">{e.ordini.split(" ").slice(0, 3).join(" ")}</div>
                    </td>
                    <td className="cella-num">{euro(e.ultimaSpesa)}</td>
                    <td>
                      <form action={aggiornaEventoCliente} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="id" value={e.id} />
                        <select name="tipo" defaultValue={e.tipo} style={{ fontSize: 12 }}>
                          {TIPI_EVENTO.map((t) => (
                            <option key={t.chiave} value={t.chiave}>{t.nome}</option>
                          ))}
                        </select>
                        <select name="stato" defaultValue={e.stato} style={{ fontSize: 12 }}>
                          {STATI_EVENTO.map((s) => (
                            <option key={s.chiave} value={s.chiave}>{s.nome}</option>
                          ))}
                        </select>
                        <button className="btn btn-secondario small" type="submit">Salva</button>
                      </form>
                      <div className="cella-sub" style={{ color: coloreStatoEvento(e.stato) }}>
                        {nomeStatoEvento(e.stato)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="paginazione">
            <span>
              {ordinati.length.toLocaleString("it-IT")} eventi · pagina {pagina} di {pagine}
            </span>
            <nav>
              {pagina > 1 && (
                <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina - 1) })}>← Precedente</Link>
              )}
              {pagina < pagine && (
                <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina + 1) })}>Successiva →</Link>
              )}
            </nav>
          </div>
        </>
      )}
    </main>
  );
}
