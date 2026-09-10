import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { tutteLeRicorrenze } from "@/lib/orders";
import { cambiaStatoProgrammazione } from "@/lib/actions";
import {
  chiaveGiorno,
  dataBreve,
  dataProspettica,
  MESI,
  oraIt,
  statoProgrammazione,
  tipoRicorrenza,
} from "@/lib/etichette";

export const dynamic = "force-dynamic";

type Query = { mese?: string; esito?: string; errore?: string };

// CALENDARIO — il mese del client advisor: le cose programmate con i clienti
// (vivono qui), gli eventi Deluxy (qui) e i compleanni/ricorrenze dei clienti
// (in Orders, lette in prospettiva: da oggi in avanti). Tre colori, una griglia.
//
// ⚠️ Le ricorrenze sono prospettiche: nei giorni PASSATI del mese non ci sono,
// perché Orders le calcola sempre «da oggi in avanti».

type Voce = {
  chiave: string; // "2026-09-15"
  ordine: number; // per ordinare dentro il giorno
  tipo: "programmazione" | "evento" | "ricorrenza";
  colore: string;
  ora: string | null;
  titolo: string;
  sotto: string | null;
  href: string;
  chiuso?: boolean;
  id: string;
  stato?: string;
};

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MAX_PER_GIORNO = 4;

function chiaveUtc(y: number, m0: number, d: number): string {
  const mm = String(m0 + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export default async function Calendario({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;

  // Il mese mostrato, in ora di Roma. Default: quello di oggi.
  const oggiChiave = chiaveGiorno(new Date());
  const [oy, om] = oggiChiave.split("-").map(Number);
  const m = /^(\d{4})-(\d{2})$/.exec(sp.mese ?? "");
  const anno = m ? Number(m[1]) : oy;
  const mese0 = m ? Math.min(11, Math.max(0, Number(m[2]) - 1)) : om - 1;

  // La griglia: da lunedì della prima settimana a domenica dell'ultima.
  const primo = new Date(Date.UTC(anno, mese0, 1));
  const ultimoGiorno = new Date(Date.UTC(anno, mese0 + 1, 0)).getUTCDate();
  const scarto = (primo.getUTCDay() + 6) % 7; // 0 = lunedì
  const settimane: { y: number; m0: number; d: number; chiave: string; fuori: boolean }[][] = [];
  let cursore = new Date(Date.UTC(anno, mese0, 1 - scarto));
  while (true) {
    const settimana = [];
    for (let i = 0; i < 7; i++) {
      const y = cursore.getUTCFullYear();
      const mm = cursore.getUTCMonth();
      const d = cursore.getUTCDate();
      settimana.push({ y, m0: mm, d, chiave: chiaveUtc(y, mm, d), fuori: mm !== mese0 });
      cursore = new Date(cursore.getTime() + 86_400_000);
    }
    settimane.push(settimana);
    if (cursore.getUTCMonth() !== mese0 || cursore.getUTCDate() > ultimoGiorno) {
      if (cursore.getUTCMonth() !== mese0) break;
    }
    if (settimane.length > 6) break;
  }
  const primaChiave = settimane[0][0].chiave;
  const ultimaChiave = settimane[settimane.length - 1][6].chiave;

  // Intervallo per le letture dal DB: dal primo giorno in griglia (00:00 Roma,
  // approssimato a UTC-2h) all'ultimo (fine giornata).
  const da = new Date(`${primaChiave}T00:00:00+02:00`);
  const a = new Date(`${ultimaChiave}T23:59:59+02:00`);

  // Quanti giorni da oggi all'ultimo giorno in griglia: la finestra per Orders.
  const giorniFinoAllaFine = Math.max(
    0,
    Math.round((new Date(`${ultimaChiave}T12:00:00Z`).getTime() - new Date(`${oggiChiave}T12:00:00Z`).getTime()) / 86_400_000),
  );

  const [programmazioni, eventi, ricorr] = await Promise.all([
    prisma.programmazione.findMany({
      where: { quando: { gte: da, lte: a }, stato: { not: "annullata" } },
      orderBy: { quando: "asc" },
    }),
    prisma.evento.findMany({
      where: { dataInizio: { gte: da, lte: a }, stato: { not: "annullato" } },
      orderBy: { dataInizio: "asc" },
      select: { id: true, titolo: true, dataInizio: true, luogo: true, stato: true },
    }),
    // Solo se la griglia arriva a oggi o oltre: nel passato non ce ne sono.
    ultimaChiave >= oggiChiave ? tutteLeRicorrenze({ prossimi: giorniFinoAllaFine }) : Promise.resolve(null),
  ]);

  const adesso = new Date();
  const voci: Voce[] = [];
  for (const p of programmazioni) {
    voci.push({
      chiave: chiaveGiorno(p.quando),
      ordine: p.conOra ? p.quando.getTime() : 0,
      tipo: "programmazione",
      colore: p.stato === "fatta" ? "var(--green)" : "var(--blue)",
      ora: p.conOra ? oraIt(p.quando) : null,
      titolo: p.titolo,
      sotto: p.nomeCliente || null,
      href: `/clienti/${encodeURIComponent(p.chiaveCliente)}`,
      chiuso: p.stato === "fatta",
      id: p.id,
      stato: p.stato,
    });
  }
  for (const e of eventi) {
    voci.push({
      chiave: chiaveGiorno(e.dataInizio),
      ordine: e.dataInizio.getTime(),
      tipo: "evento",
      colore: "var(--gold-strong)",
      ora: oraIt(e.dataInizio),
      titolo: e.titolo,
      sotto: e.luogo || "Evento Deluxy",
      href: `/eventi/${e.id}`,
      chiuso: e.stato === "concluso",
      id: e.id,
    });
  }
  let ricorrenzeTroncate = false;
  let erroreRicorrenze: string | null = null;
  if (ricorr) {
    if (!ricorr.ok) erroreRicorrenze = ricorr.errore;
    else {
      ricorrenzeTroncate = ricorr.dati.troncato;
      for (const r of ricorr.dati.eventi) {
        const chiave = chiaveGiorno(dataProspettica(r.fraGiorni, adesso));
        if (chiave < primaChiave || chiave > ultimaChiave) continue;
        const t = tipoRicorrenza(r.tipo);
        voci.push({
          chiave,
          ordine: -1, // le ricorrenze in cima al giorno: sono l'occasione
          tipo: "ricorrenza",
          colore: t.colore,
          ora: null,
          titolo: `${r.clienteNome}${r.destinatario ? ` → ${r.destinatario}` : ""}`,
          sotto: r.titolo || t.nome,
          href: `/clienti/${r.cliente}`,
          id: r.id,
        });
      }
    }
  }
  voci.sort((x, y) => x.chiave.localeCompare(y.chiave) || x.ordine - y.ordine);
  const perGiorno = new Map<string, Voce[]>();
  for (const v of voci) perGiorno.set(v.chiave, [...(perGiorno.get(v.chiave) ?? []), v]);

  const meseLink = (delta: number) => {
    const d = new Date(Date.UTC(anno, mese0 + delta, 1));
    return `/calendario?mese=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const titoloMese = `${MESI[mese0 + 1].charAt(0).toUpperCase()}${MESI[mese0 + 1].slice(1)} ${anno}`;
  const qui = `/calendario?mese=${anno}-${String(mese0 + 1).padStart(2, "0")}`;

  // L'elenco del mese (sotto la griglia, e l'unica vista comoda su mobile):
  // solo i giorni del mese, in ordine.
  const giorniDelMese = [...perGiorno.keys()].filter((k) => k.startsWith(`${anno}-${String(mese0 + 1).padStart(2, "0")}`)).sort();
  const conteggi = {
    programmazioni: voci.filter((v) => v.tipo === "programmazione" && !v.chiave.slice(0, 7).localeCompare(qui.slice(-7))).length,
    ricorrenze: voci.filter((v) => v.tipo === "ricorrenza" && v.chiave.slice(0, 7) === qui.slice(-7)).length,
    eventi: voci.filter((v) => v.tipo === "evento" && v.chiave.slice(0, 7) === qui.slice(-7)).length,
  };

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Calendario</h1>
          <p className="page-sub">
            Le cose programmate con i clienti, i loro compleanni e ricorrenze (prospettiche, da oggi in avanti) e gli
            eventi Deluxy, mese per mese. Le programmazioni nascono dalla scheda del cliente.
          </p>
        </div>
        <div className="azioni">
          <a className="btn ghost" href={meseLink(-1)} aria-label="Mese precedente">←</a>
          <a className="btn ghost" href="/calendario">Oggi</a>
          <a className="btn ghost" href={meseLink(1)} aria-label="Mese successivo">→</a>
        </div>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Fatto.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}
      {erroreRicorrenze ? <div className="errore-card">Ricorrenze non lette: {erroreRicorrenze}</div> : null}
      {ricorrenzeTroncate ? (
        <div className="errore-card">Ricorrenze troppe per questa finestra: l&apos;elenco è troncato oltre le prime 3000.</div>
      ) : null}

      <div className="cal-testata">
        <h2 className="cal-mese">{titoloMese}</h2>
        <div className="cal-legenda">
          <span><span className="dot" style={{ background: "var(--blue)" }} /> {conteggi.programmazioni} programmate</span>
          <span><span className="dot" style={{ background: "var(--purple)" }} /> {conteggi.ricorrenze} ricorrenze</span>
          <span><span className="dot" style={{ background: "var(--gold-strong)" }} /> {conteggi.eventi} eventi</span>
        </div>
      </div>

      <div className="mese-griglia">
        <div className="mese-intestazioni">
          {GIORNI_SETTIMANA.map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
        {settimane.map((settimana, i) => (
          <div className="mese-settimana" key={i}>
            {settimana.map((g) => {
              const lista = perGiorno.get(g.chiave) ?? [];
              const visibili = lista.slice(0, MAX_PER_GIORNO);
              const extra = lista.length - visibili.length;
              return (
                <div className={`giorno${g.fuori ? " fuori" : ""}${g.chiave === oggiChiave ? " oggi" : ""}`} key={g.chiave}>
                  <span className="giorno-num">{g.d}</span>
                  {visibili.map((v) => (
                    <a key={`${v.tipo}-${v.id}`} className={`ev${v.chiuso ? " chiuso" : ""}`} href={v.href} title={`${v.titolo}${v.sotto ? ` — ${v.sotto}` : ""}`}>
                      <span className="dot" style={{ background: v.colore }} />
                      {v.ora ? <span className="ev-ora">{v.ora}</span> : null}
                      <span className="ev-testo">{v.titolo}</span>
                    </a>
                  ))}
                  {extra > 0 ? <a className="ev-altri" href={`#g-${g.chiave}`}>+{extra} altri</a> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-titolo">Giorno per giorno</div>
        <div className="card-sub">Tutto il mese in elenco: le programmazioni si chiudono da qui.</div>
        {giorniDelMese.length === 0 ? (
          <p className="secondario piccolo">Niente in questo mese. Le programmazioni si creano dalla scheda di un cliente.</p>
        ) : (
          giorniDelMese.map((k) => (
            <div className="cal-giorno-elenco" key={k} id={`g-${k}`}>
              <div className={`cal-giorno-titolo${k === oggiChiave ? " oggi" : ""}`}>
                {dataBreve(new Date(`${k}T12:00:00Z`))}
                {k === oggiChiave ? <span className="chip oro" style={{ marginLeft: 8 }}>oggi</span> : null}
              </div>
              <div className="timeline">
                {(perGiorno.get(k) ?? []).map((v) => {
                  const st = v.tipo === "programmazione" && v.stato ? statoProgrammazione(v.stato) : null;
                  return (
                    <div className="timeline-voce" key={`${v.tipo}-${v.id}`}>
                      <div className="timeline-corpo">
                        <div className="timeline-titolo">
                          <span className="dot-inline" style={{ background: v.colore }} />
                          {v.ora ? <span className="mono secondario">{v.ora} · </span> : null}
                          <a href={v.href}>{v.titolo}</a>{" "}
                          <span className="chip">
                            {v.tipo === "programmazione" ? "programmata" : v.tipo === "evento" ? "evento" : "ricorrenza"}
                          </span>
                        </div>
                        {v.sotto ? <div className="timeline-dettaglio">{v.sotto}</div> : null}
                      </div>
                      {st ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", alignSelf: "center" }}>
                          <span className="badge colorato" style={{ ["--badge-colore" as string]: st.colore }}>
                            <span className="dot" />
                            {st.nome}
                          </span>
                          {v.stato === "da_fare" ? (
                            <form action={cambiaStatoProgrammazione}>
                              <input type="hidden" name="id" value={v.id} />
                              <input type="hidden" name="stato" value="fatta" />
                              <input type="hidden" name="torna" value={qui} />
                              <button className="btn ghost mini" type="submit">Fatta</button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
