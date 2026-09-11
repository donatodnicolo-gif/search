import { tutteLeRicorrenze, type RicorrenzaCliente } from "@/lib/orders";
import { dentroOppureFuori } from "@/lib/sessione-server";
import {
  dataBreve,
  dataProspettica,
  euro,
  giornoMese,
  quandoLeggibile,
  tipoRicorrenza,
  TIPI_RICORRENZA,
} from "@/lib/etichette";
import { ThSort, ordina } from "@/components/ThSort";

export const dynamic = "force-dynamic";

type Params = {
  giorni?: string;
  q?: string;
  tipo?: string;
  stato?: string;
  perchi?: string;
  sito?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

const FINESTRE = [0, 7, 14, 30, 60, 90];
const PER_PAGINA = 100;

// RICORRENZE — il calendario affettivo dei clienti: compleanni, anniversari,
// occasioni lette dagli ordini degli anni passati e confermate da una persona.
// Le date sono PROSPETTICHE: «7 giorni» = chi festeggia da oggi a fra 7
// giorni, calcolato su giorno/mese di ciò che ha ordinato negli anni scorsi.
// La fonte è il registro di Deluxy Orders; qui si decide CHI sentire e QUANDO.
//
// Orders ordina per prossimità e non filtra per città/sito/parola: si leggono
// tutte le ricorrenze della finestra (a pagine di 500) e si filtrano e
// ordinano qui. Se si supera il tetto, lo si dice in pagina.
export default async function Ricorrenze({ searchParams }: { searchParams: Promise<Params> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const giorni = FINESTRE.includes(Number(sp.giorni)) ? Number(sp.giorni) : 30;
  const q = (sp.q ?? "").trim().toLowerCase();
  const tipo = sp.tipo && sp.tipo in TIPI_RICORRENZA ? sp.tipo : "";
  const stato = ["da-confermare", "confermato", "tutti"].includes(sp.stato ?? "") ? sp.stato! : "";
  const perchi = sp.perchi === "cliente" || sp.perchi === "altri" ? sp.perchi : "";
  const sito = (sp.sito ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const elenco = await tutteLeRicorrenze({ prossimi: giorni, stato: stato || undefined });
  const adesso = new Date();

  const link = (mod: Partial<Record<keyof Params, string>>) => {
    const valori: Record<string, string | undefined> = { ...sp, ...mod };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(valori)) if (v) p.set(k, v);
    const s = p.toString();
    return `/ricorrenze${s ? `?${s}` : ""}`;
  };

  let righe: RicorrenzaCliente[] = elenco.ok ? elenco.dati.eventi : [];
  const siti = [...new Set(righe.flatMap((r) => r.brand ?? []))].sort();

  if (q) {
    righe = righe.filter((r) =>
      [r.clienteNome, r.clienteEmail ?? "", r.citta, r.destinatario, r.titolo].some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (tipo) righe = righe.filter((r) => r.tipo === tipo);
  if (perchi === "cliente") righe = righe.filter((r) => !r.destinatario);
  if (perchi === "altri") righe = righe.filter((r) => Boolean(r.destinatario));
  if (sito) righe = righe.filter((r) => (r.brand ?? []).includes(sito));

  const sort = sp.sort ?? "quando";
  const dir = sp.dir ?? (sort === "quando" ? "asc" : "desc");
  righe = ordina(
    righe,
    (r) => {
      switch (sort) {
        case "cliente":
          return r.clienteNome;
        case "occasione":
          return r.titolo || tipoRicorrenza(r.tipo).nome;
        case "perchi":
          return r.destinatario || "";
        case "sito":
          return (r.brand ?? []).join(", ");
        case "spesa":
          return r.ultimaSpesa;
        case "visto":
          return r.ricorrenze;
        default:
          return r.fraGiorni;
      }
    },
    dir,
  );

  const totale = righe.length;
  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const pagina = righe.slice((page - 1) * PER_PAGINA, page * PER_PAGINA);

  // I filtri «secondari» contati per la disclosure (Libro §8: N = filtri attivi
  // fuori dalla riga sempre visibile; l'ordinamento non conta).
  const filtriAttivi = [tipo, stato, perchi, sito].filter(Boolean).length;

  const spSort: Record<string, string | undefined> = { ...sp };
  delete spSort.page;

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Ricorrenze</h1>
          <p className="page-sub">
            {giorni === 0 ? "Chi festeggia oggi" : `Chi festeggia da oggi a fra ${giorni} giorni`}: le date sono
            prospettiche, dedotte da giorno e mese di ciò che ogni cliente ha ordinato negli anni passati (fonte: Deluxy
            Orders). Un pensiero puntuale è il gesto che i clienti top ricordano.
          </p>
        </div>
      </div>

      {/* Zona filtri (Libro §8): prima riga = finestra + ricerca; il resto dietro
          «Filtri (N)». Su mobile le pillole scorrono su UNA riga (§8.9). */}
      <div className="filtri riga-chips-scorri">
        {FINESTRE.map((g) => (
          <a key={g} className={`filtro-pillola${g === giorni ? " attivo" : ""}`} href={link({ giorni: String(g), page: "" })}>
            {g === 0 ? "Oggi" : `${g} giorni`}
          </a>
        ))}
      </div>
      <form className="filtri-form" method="get" action="/ricorrenze">
        <input type="hidden" name="giorni" value={giorni} />
        {sp.sort ? <input type="hidden" name="sort" value={sp.sort} /> : null}
        {sp.dir ? <input type="hidden" name="dir" value={sp.dir} /> : null}
        <div className="filtri-riga">
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Cerca per nome, email, città, per chi…"
            aria-label="Cerca"
          />
          <details className="filtri-altri" open={filtriAttivi > 0}>
            <summary className="btn ghost">Filtri{filtriAttivi ? ` (${filtriAttivi})` : ""}</summary>
            <div className="filtri-pannello">
              <div className="campo">
                <label>Occasione</label>
                <select name="tipo" defaultValue={tipo}>
                  <option value="">Tutte</option>
                  {Object.entries(TIPI_RICORRENZA).map(([k, t]) => (
                    <option key={k} value={k}>{t.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label>Stato</label>
                <select name="stato" defaultValue={stato}>
                  <option value="">Da confermare + confermate</option>
                  <option value="confermato">Solo confermate</option>
                  <option value="da-confermare">Solo da confermare</option>
                  <option value="tutti">Tutte, anche ignorate</option>
                </select>
              </div>
              <div className="campo">
                <label>Per chi</label>
                <select name="perchi" defaultValue={perchi}>
                  <option value="">Chiunque</option>
                  <option value="cliente">Il cliente stesso</option>
                  <option value="altri">Un&apos;altra persona</option>
                </select>
              </div>
              <div className="campo">
                <label>Sito</label>
                <select name="sito" defaultValue={sito}>
                  <option value="">Tutti i siti</option>
                  {siti.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {siti.length === 0 ? <span className="aiuto">Il sito arriva da Orders (versione del 10/09).</span> : null}
              </div>
            </div>
          </details>
          <button className="btn" type="submit">Filtra</button>
          {q || filtriAttivi ? (
            <a className="link-quieto" href={link({ q: "", tipo: "", stato: "", perchi: "", sito: "", page: "" })}>
              Azzera
            </a>
          ) : null}
        </div>
      </form>

      {!elenco.ok ? (
        <div className="errore-card">{elenco.errore}</div>
      ) : totale === 0 ? (
        <div className="card vuoto">
          <div className="quadratino">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 8v13M5 11h14M6 21h12M6 11V8.5C6 6 9 5.5 12 8c3-2.5 6-2 6 .5V11" />
            </svg>
          </div>
          <h3>Nessuna ricorrenza {giorni === 0 ? "oggi" : "in vista"}</h3>
          <p>
            {q || filtriAttivi
              ? "Con questi filtri non c'è nessuno: prova ad allargare."
              : "Allarga la finestra, o aggiungi le ricorrenze che conosci dalle schede dei clienti."}
          </p>
        </div>
      ) : (
        <>
          {elenco.dati.troncato ? (
            <div className="errore-card">
              Sono più di {elenco.dati.eventi.length} ricorrenze in questa finestra: l&apos;elenco è troncato. Stringi la
              finestra per vederle tutte.
            </div>
          ) : null}
          <div className="card tabella-card">
            <div className="tabella-scroll">
              <table>
                <thead>
                  <tr>
                    <ThSort label="Quando" campo="quando" sp={spSort} path="/ricorrenze" defaultAttivo defaultDir="asc" />
                    <ThSort label="Cliente" campo="cliente" sp={spSort} path="/ricorrenze" />
                    <ThSort label="Sito" campo="sito" sp={spSort} path="/ricorrenze" />
                    <ThSort label="Occasione" campo="occasione" sp={spSort} path="/ricorrenze" />
                    <ThSort label="Per chi" campo="perchi" sp={spSort} path="/ricorrenze" />
                    <ThSort label="Ultima spesa" campo="spesa" sp={spSort} path="/ricorrenze" num />
                    <ThSort label="Visto" campo="visto" sp={spSort} path="/ricorrenze" />
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((r) => {
                    const t = tipoRicorrenza(r.tipo);
                    const quando = dataProspettica(r.fraGiorni, adesso);
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="cella-principale">
                            {dataBreve(quando)}
                            <span className="secondario" style={{ fontWeight: 400 }}> · per {r.destinatario || "il cliente"}</span>
                          </div>
                          <div className="cella-sotto">
                            {giornoMese(r.giorno, r.mese)} · {quandoLeggibile(r.fraGiorni)}
                          </div>
                        </td>
                        <td>
                          <a href={`/clienti/${r.cliente}`}>
                            <div className="cella-principale">{r.clienteNome}</div>
                            {r.citta ? <div className="cella-sotto">{r.citta}</div> : null}
                          </a>
                        </td>
                        <td>
                          {r.brand?.length ? (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {r.brand.map((b) => (
                                <span key={b} className="chip">{b}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="terziario">—</span>
                          )}
                        </td>
                        <td>
                          <span className="badge colorato" style={{ ["--badge-colore" as string]: t.colore }}>
                            <span className="dot" />
                            {r.titolo || t.nome}
                          </span>
                          {r.stato === "da-confermare" ? <div className="cella-sotto">da confermare</div> : null}
                          {r.stato === "ignorato" ? <div className="cella-sotto">ignorata</div> : null}
                        </td>
                        <td>{r.destinatario || <span className="terziario">il cliente</span>}</td>
                        <td className="num">{r.ultimaSpesa ? euro(r.ultimaSpesa) : "—"}</td>
                        <td className="secondario piccolo">
                          {r.ricorrenze} {r.ricorrenze === 1 ? "volta" : "volte"}
                          {r.ricorrenze > 1 ? ` (${r.primoAnno}–${r.ultimoAnno})` : ` (${r.ultimoAnno})`}
                        </td>
                        <td>
                          {!r.delicato ? (
                            <a
                              className="btn ghost mini"
                              href={`/mail/componi?cliente=${encodeURIComponent(r.cliente)}&occasione=${encodeURIComponent(r.titolo || t.nome)}`}
                            >
                              Fai gli auguri
                            </a>
                          ) : (
                            <span className="chip" title="Ricorrenza delicata: niente messaggi di festa">delicata</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="paginazione">
            <span>
              {totale} ricorrenze · pagina {page} di {pagine}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              {page > 1 ? (
                <a className="btn ghost mini" href={link({ page: String(page - 1) })}>← Precedente</a>
              ) : null}
              {page < pagine ? (
                <a className="btn ghost mini" href={link({ page: String(page + 1) })}>Successiva →</a>
              ) : null}
            </span>
          </div>
        </>
      )}
    </>
  );
}
