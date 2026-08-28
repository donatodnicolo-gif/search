import Link from "next/link";
import { ANNO_CORRENTE } from "@/lib/calc";
import { caricaCategorie, ricostruisci } from "@/lib/cfo";
import { fetchSpeseBanca } from "@/lib/finance";
import { trovaRicorrenti, type CostoRicorrente } from "@/lib/ricorrenti";

export const dynamic = "force-dynamic";

const PERIODI = [
  { key: "anno", label: "Anno", dal: 1, al: 12 },
  { key: "s1", label: "1° semestre", dal: 1, al: 6 },
  { key: "s2", label: "2° semestre", dal: 7, al: 12 },
];

// I filtri sono la ragione per cui la pagina esiste: fra i ricorrenti le voci
// grosse sono partner e stipendi (che nessuno taglia), mentre i risparmi stanno
// nei canoni piccoli. Senza un modo di isolarli si torna a leggere per importo.
const FILTRI = [
  { key: "tutti", label: "Tutti" },
  { key: "canoni", label: "Canoni fissi" },
  { key: "piccoli", label: "Sotto 500 €/mese" },
  { key: "cessati", label: "Forse cessati" },
];

const SOTTO = 500;

const eur = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("it-IT") + " €";

// Tre lettere, non una: con le iniziali «G F M A M G L A S O N D» gennaio e
// giugno sono la stessa lettera, e «A in corso» non si capisce che è agosto.
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

const BADGE_PL: Record<string, string> = {
  COGS: "blue",
  ADV: "purple",
  PERSONALE: "gold",
  STRUTTURA: "neutral",
  ESCLUSA: "neutral",
};

const BADGE_REG: Record<CostoRicorrente["regolarita"], string> = {
  fisso: "green",
  regolare: "blue",
  variabile: "neutral",
};

function Sparkline({ v, mesiChiusi, meseAperto }: { v: number[]; mesiChiusi: number; meseAperto: number | null }) {
  const max = Math.max(...v, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 26 }} aria-hidden>
      {v.map((x, i) => {
        // Il mese in corso si disegna sbiadito: è mezzo mese, e una barra bassa
        // lì dentro non vuol dire «è calato».
        const aperto = meseAperto === i + 1;
        const futuro = i + 1 > mesiChiusi && !aperto;
        return (
          <div
            key={i}
            title={`${MESI[i]}: ${eur(x)}`}
            style={{
              width: 6,
              height: Math.max(2, Math.round((x / max) * 24)),
              borderRadius: 2,
              background: futuro ? "var(--fill)" : aperto ? "var(--hairline-strong)" : "var(--blue)",
              opacity: x > 0 ? 1 : 0.35,
            }}
          />
        );
      })}
    </div>
  );
}

export default async function RicorrentiPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; filtro?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const periodo = PERIODI.find((p) => p.key === sp.periodo) ?? PERIODI[0];
  const filtro = FILTRI.find((f) => f.key === sp.filtro) ?? FILTRI[0];
  const q = sp.q?.trim() ?? "";

  const [res, categorie] = await Promise.all([
    fetchSpeseBanca({ anno: ANNO_CORRENTE, dal: periodo.dal, al: periodo.al }),
    caricaCategorie(),
  ]);

  if (!res.ok) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Costi ricorrenti</h1>
        </div>
        <div className="avviso-errore">{res.errore}</div>
      </>
    );
  }

  const righe = ricostruisci(res.dati.controparti, categorie);
  // Il numero di movimenti sta sull'elenco grezzo, non sui pezzi per categoria:
  // serve a distinguere un canone (un addebito al mese) da una carta usata
  // ottanta volte, e senza si leggerebbero uguali.
  const movimenti = new Map(res.dati.controparti.map((c) => [c.controparte, c.movimenti]));
  const oggi = new Date();
  const r = trovaRicorrenti(righe, {
    anno: ANNO_CORRENTE,
    dal: periodo.dal,
    al: periodo.al,
    annoInCorso: oggi.getFullYear(),
    meseInCorso: oggi.getMonth() + 1,
    movimenti,
  });

  const attivi = r.voci.filter((v) => v.stato === "attivo");
  const canoni = attivi.filter((v) => v.regolarita === "fisso");
  const piccoli = attivi.filter((v) => v.mediaMese < SOTTO);
  const cessati = r.voci.filter((v) => v.stato === "forse-cessato");

  const perFiltro =
    filtro.key === "canoni" ? canoni : filtro.key === "piccoli" ? piccoli : filtro.key === "cessati" ? cessati : r.voci;
  // La ricerca (Libro v1.9 §8-bis): sul nome della controparte, l'unico campo
  // con cui la si riconosce. Restringe SOLO la tabella: i KPI raccontano la
  // fotografia intera, e una ricerca non deve farli sembrare cambiati.
  // I dati sono già tutti in memoria (arrivano aggregati da Finance), quindi
  // il confronto insensibile alle maiuscole si fa qui, non in una query.
  const elenco = q
    ? perFiltro.filter((v) => v.controparte.toLowerCase().includes(q.toLowerCase()))
    : perFiltro;

  const annuo = (vs: CostoRicorrente[]) => vs.reduce((s, v) => s + (v.annuoAQuestoRitmo ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Costi ricorrenti</h1>
          <p className="page-caption">
            Le controparti che tornano <strong>mese dopo mese</strong>, messe in fila per regolarità e non
            per importo. Le voci grosse (partner, stipendi) si conoscono già: qui servono a fare da metro
            ai canoni piccoli — l&apos;abbonamento che nessuno ricorda di aver sottoscritto, il software
            pagato due volte, il noleggio finito che addebita ancora.
          </p>
          <p className="page-caption" style={{ marginTop: 6 }}>
            Sono le stesse uscite del <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>, con la
            categoria decisa da Finance. Una controparte divisa fra più categorie (PayPal: banca, partner,
            consegne) qui si <strong>ricompone in una riga sola</strong>: la domanda è «chi paghiamo ogni
            mese», non «in quale casella».
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {PERIODI.map((p) => (
              <Link
                key={p.key}
                href={`/ricorrenti?periodo=${p.key}${filtro.key === "tutti" ? "" : `&filtro=${filtro.key}`}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={p.key === periodo.key ? "on" : ""}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {r.mesiChiusi < r.soglie.MIN_MESI ? (
        <div className="card">
          <div className="empty">
            <div className="empty-title">Troppi pochi mesi chiusi</div>
            <div className="empty-text">
              In questo periodo ci sono {r.mesiChiusi} mesi conclusi: sotto {r.soglie.MIN_MESI} una spesa che
              si ripete è una coincidenza, non un&apos;abitudine. Scegli un periodo più lungo.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Ricorrenti trovati</div>
              <div className="kpi-value">{r.voci.length}</div>
              <div className="kpi-sub">
                su {res.dati.controparti.length} controparti · {r.mesiChiusi} mesi chiusi
                {r.meseAperto ? `, ${MESI[r.meseAperto - 1]} in corso escluso dal conteggio` : ""}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Valgono in un anno, a questo ritmo</div>
              <div className="kpi-value">{eur(annuo(attivi))}</div>
              <div className="kpi-sub">solo i vivi: quello che ha smesso non si proietta</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Canoni fissi</div>
              <div className="kpi-value">{canoni.length}</div>
              <div className="kpi-sub">stessa cifra ogni mese → {eur(annuo(canoni))} l&apos;anno</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Forse cessati</div>
              <div className="kpi-value">{cessati.length}</div>
              <div className="kpi-sub">
                niente da {r.soglie.MESI_SILENZIO}+ mesi · {eur(cessati.reduce((s, v) => s + v.uscite, 0))} spesi
                finché c&apos;erano
              </div>
            </div>
          </div>

          {/* La ricerca (Libro v1.9 §8-bis): il periodo qui NON prende le
              chips standard (mese/trimestre/anno) — anno e semestri sono il
              periodo strutturale della pagina, legato ai mesi chiusi che il
              riconoscimento dei ricorrenti richiede. Il submit conserva
              periodo e filtro nei campi nascosti. */}
          <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {periodo.key !== "anno" && <input type="hidden" name="periodo" value={periodo.key} />}
            {filtro.key !== "tutti" && <input type="hidden" name="filtro" value={filtro.key} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Cerca una controparte…"
              style={{ flex: "1 1 260px", maxWidth: 420 }}
            />
            <button className="btn secondary" type="submit">Cerca</button>
          </form>

          <div className="chips" style={{ marginBottom: 16 }}>
            {FILTRI.map((f) => (
              <Link
                key={f.key}
                href={`/ricorrenti?periodo=${periodo.key}&filtro=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`chip${f.key === filtro.key ? " on" : ""}`}
              >
                {f.label}
              </Link>
            ))}
          </div>

          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Controparte</th>
                    <th>Categoria</th>
                    <th>Andamento</th>
                    <th>Ritmo</th>
                    <th className="num">Media/mese</th>
                    <th className="num">Da–a</th>
                    <th className="num">Nel periodo</th>
                    <th className="num">All&apos;anno</th>
                  </tr>
                </thead>
                <tbody>
                  {elenco.map((v) => (
                    <tr key={v.controparte}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{v.controparte}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {v.movimenti > 0 ? `${v.movimenti} movimenti · ` : ""}
                          {MESI[v.primoMese - 1]}→{MESI[v.ultimoMese - 1]}
                          {v.stato === "forse-cessato" ? " · niente da mesi" : ""}
                        </div>
                      </td>
                      <td>
                        {v.categoriaNome ? (
                          <span className={`badge ${BADGE_PL[v.tipoPL ?? ""] ?? "neutral"}`}>
                            <span className="dot" />
                            {v.categoriaNome}
                          </span>
                        ) : (
                          <span className="badge red">
                            <span className="dot" />
                            senza categoria
                          </span>
                        )}
                        {v.categorie.length > 1 && (
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                            + {v.categorie.length - 1} altre: {v.categorie.slice(1).map((c) => c.nome ?? "—").join(", ")}
                          </div>
                        )}
                      </td>
                      <td>
                        <Sparkline v={v.perMese} mesiChiusi={r.ultimoChiuso ?? 12} meseAperto={r.meseAperto} />
                      </td>
                      <td>
                        <span className={`badge ${BADGE_REG[v.regolarita]}`}>
                          <span className="dot" />
                          {v.regolarita}
                        </span>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                          {v.mesiAttivi} mesi su {v.mesiChiusi}
                        </div>
                      </td>
                      <td className="num">{eur(v.mediaMese)}</td>
                      <td className="num muted">
                        {eur(v.minMese)}–{eur(v.maxMese)}
                      </td>
                      <td className="num">{eur(v.uscite)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {v.annuoAQuestoRitmo == null ? (
                          <span className="muted" title="Ha smesso: proiettarlo direbbe che costa ancora">
                            —
                          </span>
                        ) : (
                          eur(v.annuoAQuestoRitmo)
                        )}
                      </td>
                    </tr>
                  ))}
                  {elenco.length === 0 && (
                    <tr>
                      <td colSpan={8} className="muted" style={{ padding: 24, textAlign: "center" }}>
                        {q ? <>Nessuna controparte che contenga «{q}» con questo filtro.</> : "Nessuna voce con questo filtro."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Le soglie si scrivono: chi legge deve sapere cosa NON vede, o
              prenderà «non c'è» per «non esiste». */}
          <p className="page-caption" style={{ marginTop: 16 }}>
            <strong>Cosa entra in questa lista</strong>: una controparte con almeno {r.soglie.MIN_MESI} mesi di
            uscite, presente in almeno metà dei mesi chiusi <em>oppure</em> negli ultimi{" "}
            {r.soglie.ULTIMI_DI_FILA} di fila (un canone partito da poco deve entrare comunque).{" "}
            <strong>Fisso</strong> = la cifra oscilla meno del {Math.round(r.soglie.CV_FISSO * 100)}% da un mese
            all&apos;altro; <strong>regolare</strong> sotto il {Math.round(r.soglie.CV_REGOLARE * 100)}%; sopra è
            variabile. <strong>Forse cessato</strong> = niente da {r.soglie.MESI_SILENZIO} mesi chiusi e niente nel
            mese in corso: può voler dire disdetto, o pagato in un altro modo (PayPal, un&apos;altra carta) — in
            entrambi i casi è una cosa da sapere.
          </p>
          <p className="page-caption" style={{ marginTop: 8 }}>
            <strong>Limiti dichiarati</strong>: il <em>mese in corso</em> non conta né a favore né contro (a metà
            mese un canone «assente» è solo un canone non ancora passato); «all&apos;anno a questo ritmo» è una
            proiezione, non un impegno; e la banca dice <em>a chi</em> hai pagato, non <em>cosa</em> hai comprato —
            due abbonamenti sullo stesso circuito (`SUMUP *`, PayPal) restano due nomi diversi. Chi paga con
            nomi che cambiano ogni volta non compare qui: non è che non c&apos;è, è che non si riconosce.
          </p>
        </>
      )}
    </>
  );
}
