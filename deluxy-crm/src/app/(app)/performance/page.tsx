import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { elencoClienti, type ClienteRiga } from "@/lib/orders";
import { clusterDi, impostazioniClienti, inSoglia, metriche } from "@/lib/cluster";
import { dataIt, euro, segmento, SEGMENTI } from "@/lib/etichette";

export const dynamic = "force-dynamic";

type Query = { sito?: string };

// Quanti clienti si leggono per le cifre: a pagine di 500 da Orders (cache
// 60 s lato server). Oltre il tetto lo si dice in pagina.
const MAX_PAGINE = 6;

// PERFORMANCE — come vanno i clienti, visti dal CRM: valore, distribuzione
// per cluster (Impostazioni) e per segmento (Orders), i migliori, chi cresce
// e chi si sta allontanando. Le cifre sono quelle di Orders (speso, ordini,
// primo/ultimo ordine); la spesa annua e la frequenza sono stime (cluster.ts).
export default async function Performance({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const sito = (sp.sito ?? "").trim();

  const clienti: ClienteRiga[] = [];
  let troncato = false;
  let errore: string | null = null;
  let totaleOrders = 0;
  for (let page = 1; page <= MAX_PAGINE; page++) {
    const r = await elencoClienti({ ordina: "speso", page, limit: 500 });
    if (!r.ok) {
      errore = r.errore;
      break;
    }
    totaleOrders = r.dati.totale;
    clienti.push(...r.dati.clienti);
    if (page >= r.dati.pagine) break;
    if (page === MAX_PAGINE) troncato = true;
  }

  const [imp, profili] = await Promise.all([
    impostazioniClienti(),
    prisma.profiloCliente.findMany({ where: { punteggio: { not: null } }, select: { chiaveCliente: true, punteggio: true } }),
  ]);
  const punteggi = new Map(profili.map((p) => [p.chiaveCliente, p.punteggio!]));

  const siti = [...new Set(clienti.flatMap((c) => c.brand))].sort();
  const base = sito ? clienti.filter((c) => c.brand.includes(sito)) : clienti;

  // Le cifre d'insieme.
  const valore = base.reduce((s, c) => s + c.speso, 0);
  const ordini = base.reduce((s, c) => s + c.ordini, 0);
  const inSogliaN = base.filter((c) => inSoglia(c, imp)).length;
  const conPunteggio = base.filter((c) => punteggi.has(c.cliente)).length;

  // Per cluster e per segmento: quanti e quanto valgono.
  type Fetta = { nome: string; colore: string; clienti: number; valore: number; descr?: string };
  const perCluster = new Map<string, Fetta>();
  for (const k of imp.cluster) perCluster.set(k.chiave, { nome: k.nome, colore: k.colore, clienti: 0, valore: 0 });
  let senzaCluster = 0;
  for (const c of base) {
    const k = clusterDi(c, imp, punteggi.get(c.cliente) ?? null);
    if (!k) {
      senzaCluster++;
      continue;
    }
    const f = perCluster.get(k.chiave)!;
    f.clienti++;
    f.valore += c.speso;
  }
  const perSegmento = new Map<string, Fetta>();
  for (const c of base) {
    const s = segmento(c.segmento);
    const f = perSegmento.get(c.segmento) ?? { nome: s.nome, colore: s.colore, clienti: 0, valore: 0 };
    f.clienti++;
    f.valore += c.speso;
    perSegmento.set(c.segmento, f);
  }
  const ordineSegmenti = Object.keys(SEGMENTI);
  const segmentiOrdinati = [...perSegmento.entries()].sort(
    (a, b) => (ordineSegmenti.indexOf(a[0]) + 1 || 99) - (ordineSegmenti.indexOf(b[0]) + 1 || 99),
  );

  // Per sito e per città (le prime 8).
  const perSito = new Map<string, Fetta>();
  for (const c of base)
    for (const b of c.brand) {
      const f = perSito.get(b) ?? { nome: b, colore: "var(--text-secondary)", clienti: 0, valore: 0 };
      f.clienti++;
      f.valore += c.speso / Math.max(1, c.brand.length);
      perSito.set(b, f);
    }
  const perCitta = new Map<string, Fetta>();
  for (const c of base) {
    const k = (c.citta ?? "").trim() || "—";
    const f = perCitta.get(k) ?? { nome: k, colore: "var(--text-secondary)", clienti: 0, valore: 0 };
    f.clienti++;
    f.valore += c.speso;
    perCitta.set(k, f);
  }
  const cittaTop = [...perCitta.values()].sort((a, b) => b.valore - a.valore).slice(0, 8);

  // Le classifiche: i migliori per valore, i più frequenti, chi si allontana.
  const migliori = [...base].sort((a, b) => b.speso - a.speso).slice(0, 10);
  const frequenti = [...base]
    .filter((c) => c.ordini >= 3)
    .sort((a, b) => metriche(b).ordiniAnno - metriche(a).ordiniAnno)
    .slice(0, 10);
  const inAllontanamento = [...base]
    .filter((c) => c.ordini >= 2 && (c.giorniDallUltimo ?? 0) > 365)
    .sort((a, b) => b.speso - a.speso)
    .slice(0, 10);

  const Barra = ({ fette, totale }: { fette: Fetta[]; totale: number }) => (
    <div className="barra-fette" aria-hidden>
      {fette.map((f) => (
        <span
          key={f.nome}
          style={{ width: `${totale ? (f.valore / totale) * 100 : 0}%`, background: f.colore }}
          title={`${f.nome}: ${euro(f.valore)}`}
        />
      ))}
    </div>
  );

  const TabellaFette = ({ fette, totaleValore, totaleClienti }: { fette: Fetta[]; totaleValore: number; totaleClienti: number }) => (
    <table className="tabella-fette">
      <thead>
        <tr>
          <th></th>
          <th className="num">Clienti</th>
          <th className="num">Valore</th>
          <th className="num">Quota</th>
          <th className="num">Medio</th>
        </tr>
      </thead>
      <tbody>
        {fette.map((f) => (
          <tr key={f.nome}>
            <td>
              <span className="badge colorato" style={{ ["--badge-colore" as string]: f.colore }}>
                <span className="dot" />
                {f.nome}
              </span>
              {f.descr ? <div className="cella-sotto">{f.descr}</div> : null}
            </td>
            <td className="num">
              {f.clienti}
              <div className="cella-sotto">{totaleClienti ? Math.round((f.clienti / totaleClienti) * 100) : 0}%</div>
            </td>
            <td className="num">{euro(f.valore)}</td>
            <td className="num">{totaleValore ? Math.round((f.valore / totaleValore) * 100) : 0}%</td>
            <td className="num">{f.clienti ? euro(f.valore / f.clienti) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const Classifica = ({ righe, sotto }: { righe: ClienteRiga[]; sotto: (c: ClienteRiga) => string }) =>
    righe.length === 0 ? (
      <p className="secondario piccolo">Nessuno.</p>
    ) : (
      <div className="timeline">
        {righe.map((c, i) => (
          <div className="timeline-voce" key={c.cliente}>
            <div className="timeline-corpo">
              <div className="timeline-titolo">
                <span className="terziario mono" style={{ marginRight: 8 }}>{i + 1}.</span>
                <a href={`/clienti/${c.cliente}`}>{c.nome ?? c.email ?? "Senza nome"}</a>
                {punteggi.has(c.cliente) ? <span className="chip oro" style={{ marginLeft: 6 }}>{punteggi.get(c.cliente)}</span> : null}
              </div>
              <div className="timeline-quando">{sotto(c)}</div>
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Performance</h1>
          <p className="page-sub">
            Come vanno i clienti: valore, cluster (i tuoi, da Impostazioni), segmenti (di Orders), i migliori, chi cresce
            e chi si allontana. Cifre da Deluxy Orders; spesa annua e frequenza sono stime sugli anni di vita del cliente.
          </p>
        </div>
        <div className="azioni">
          <a className="btn ghost" href="/impostazioni#clienti">Soglie e cluster</a>
        </div>
      </div>

      {errore ? <div className="errore-card">{errore}</div> : null}
      {troncato ? (
        <div className="errore-card">
          Letti i primi {clienti.length} clienti per spesa su {totaleOrders}: le cifre sono su questi, non su tutti.
        </div>
      ) : null}

      <div className="filtri riga-chips-scorri">
        <a className={`filtro-pillola${!sito ? " attivo" : ""}`} href="/performance">Tutti i siti</a>
        {siti.map((s) => (
          <a key={s} className={`filtro-pillola${sito === s ? " attivo" : ""}`} href={`/performance?sito=${encodeURIComponent(s)}`}>
            {s}
          </a>
        ))}
      </div>

      <div className="griglia quattro" style={{ marginBottom: 16 }}>
        <div className="card stretta stat">
          <span className="valore">{base.length}</span>
          <span className="etichetta">Clienti</span>
          <span className="nota">{totaleOrders && !sito ? `${totaleOrders} nel registro di Orders` : ""}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{euro(valore)}</span>
          <span className="etichetta">Valore complessivo</span>
          <span className="nota">{base.length ? `${euro(valore / base.length)} a cliente` : ""}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{ordini}</span>
          <span className="etichetta">Ordini</span>
          <span className="nota">{ordini ? `${euro(valore / ordini)} l'ordine medio` : ""}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{inSogliaN}</span>
          <span className="etichetta">In soglia</span>
          <span className="nota">
            {imp.soglie.spesaTotaleMin || imp.soglie.spesaAnnuaMin || imp.soglie.ordiniAnnoMin
              ? `${base.length ? Math.round((inSogliaN / base.length) * 100) : 0}% · ${conPunteggio} con punteggio`
              : `nessuna soglia impostata · ${conPunteggio} con punteggio`}
          </span>
        </div>
      </div>

      <div className="griglia due">
        <div className="card">
          <div className="card-titolo">Per cluster</div>
          <div className="card-sub">I gruppi decisi in Impostazioni, nel loro ordine di priorità.</div>
          <Barra fette={[...perCluster.values()]} totale={valore} />
          <TabellaFette
            fette={[...perCluster.values()].map((f) => ({
              ...f,
              descr: imp.cluster.find((k) => k.nome === f.nome) ? undefined : undefined,
            }))}
            totaleValore={valore}
            totaleClienti={base.length}
          />
          {senzaCluster ? <p className="terziario piccolo">{senzaCluster} clienti non entrano in nessun cluster.</p> : null}
        </div>
        <div className="card">
          <div className="card-titolo">Per segmento di Orders</div>
          <div className="card-sub">La lettura del registro ordini: VIP, fedeli, nuovi, da riattivare…</div>
          <Barra fette={segmentiOrdinati.map(([, f]) => f)} totale={valore} />
          <TabellaFette fette={segmentiOrdinati.map(([, f]) => f)} totaleValore={valore} totaleClienti={base.length} />
        </div>
      </div>

      <div className="griglia due" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-titolo">Per sito</div>
          <div className="card-sub">Chi compra su più siti conta su ciascuno; il valore è diviso fra i suoi siti.</div>
          <TabellaFette fette={[...perSito.values()].sort((a, b) => b.valore - a.valore)} totaleValore={valore} totaleClienti={base.length} />
        </div>
        <div className="card">
          <div className="card-titolo">Le città che valgono di più</div>
          <div className="card-sub">Le prime otto per valore dei clienti.</div>
          <TabellaFette fette={cittaTop} totaleValore={valore} totaleClienti={base.length} />
        </div>
      </div>

      <div className="griglia tre" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-titolo">I migliori per valore</div>
          <div className="card-sub">Chi ha speso di più in tutto.</div>
          <Classifica righe={migliori} sotto={(c) => `${euro(c.speso)} in ${c.ordini} ordini · ultimo ${dataIt(c.ultimoOrdine)}`} />
        </div>
        <div className="card">
          <div className="card-titolo">I più assidui</div>
          <div className="card-sub">Ordini all&apos;anno stimati, fra chi ne ha almeno tre.</div>
          <Classifica
            righe={frequenti}
            sotto={(c) => `${metriche(c).ordiniAnno.toFixed(1)} ordini/anno · ${euro(c.speso)} in ${c.ordini} ordini`}
          />
        </div>
        <div className="card">
          <div className="card-titolo">Si stanno allontanando</div>
          <div className="card-sub">Clienti con almeno due ordini, fermi da più di un anno: i primi da risentire.</div>
          <Classifica righe={inAllontanamento} sotto={(c) => `${euro(c.speso)} · fermo da ${c.giorniDallUltimo} giorni`} />
        </div>
      </div>
    </>
  );
}
