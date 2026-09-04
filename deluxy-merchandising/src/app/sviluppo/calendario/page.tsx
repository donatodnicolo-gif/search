import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { dataIt, giornoRoma, isoRoma, mezzanotteRomaDi, primoDelMeseRoma, sommaGiorniRoma } from "@/lib/fuso";

export const dynamic = "force-dynamic";

// **Il calendario delle pubblicazioni** (chiesto dall'utente il 04/09/2026):
// mese per mese, i giorni in cui un prodotto **entra** sul negozio
// (`pubblicatoDal`) e quelli in cui **esce** (`pubblicatoFinoAl`). Un
// prodotto pubblico senza date non compare qui: non ha un evento, è sempre
// online — lo dice la lista sotto. Il calendario è quello di Roma.
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function meseValido(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export default async function CalendarioPubblicazioniPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const sp = await searchParams;
  const oggi = giornoRoma(new Date());
  const primo = meseValido(sp.mese) ? mezzanotteRomaDi(`${sp.mese}-01`) : primoDelMeseRoma(oggi);
  const [anno, mese] = isoRoma(primo).split("-").map(Number);
  const primoDelProssimo = mezzanotteRomaDi(mese === 12 ? `${anno + 1}-01-01` : `${anno}-${String(mese + 1).padStart(2, "0")}-01`);
  const ultimo = sommaGiorniRoma(primoDelProssimo, -1);
  const meseIso = isoRoma(primo).slice(0, 7);
  const mesePrec = isoRoma(sommaGiorniRoma(primo, -1)).slice(0, 7);
  const meseSucc = isoRoma(primoDelProssimo).slice(0, 7);

  // La griglia parte dal lunedì della settimana del primo e finisce alla
  // domenica della settimana dell'ultimo (5 o 6 righe).
  const inizioGriglia = sommaGiorniRoma(primo, -giornoSettimanaRoma(primo));
  const giorni: Date[] = [];
  for (let d = inizioGriglia; giorni.length < 42; d = sommaGiorniRoma(d, 1)) {
    giorni.push(d);
    if (d >= ultimo && giornoSettimanaRoma(d) === 6) break;
  }

  const prodotti = await prisma.prodotto.findMany({
    where: {
      OR: [
        { pubblicatoDal: { gte: inizioGriglia, lte: giorni[giorni.length - 1] } },
        { pubblicatoFinoAl: { gte: inizioGriglia, lte: giorni[giorni.length - 1] } },
      ],
    },
    select: { id: true, nome: true, negozioNome: true, fase: true, pubblicatoDal: true, pubblicatoFinoAl: true, shopifyStato: true },
    orderBy: { nome: "asc" },
  });
  const eventi = new Map<string, { id: string; nome: string; negozio: string | null; tipo: "inizio" | "fine" }[]>();
  const metti = (d: Date | null, e: { id: string; nome: string; negozio: string | null; tipo: "inizio" | "fine" }) => {
    if (!d) return;
    const k = isoRoma(d);
    eventi.set(k, [...(eventi.get(k) ?? []), e]);
  };
  for (const p of prodotti) {
    metti(p.pubblicatoDal, { id: p.id, nome: p.nome, negozio: p.negozioNome, tipo: "inizio" });
    metti(p.pubblicatoFinoAl, { id: p.id, nome: p.nome, negozio: p.negozioNome, tipo: "fine" });
  }

  const conFinestra = await prisma.prodotto.findMany({
    where: { OR: [{ pubblicatoDal: { not: null } }, { pubblicatoFinoAl: { not: null } }] },
    select: { id: true, nome: true, negozioNome: true, pubblicatoDal: true, pubblicatoFinoAl: true, shopifyStato: true, fase: true },
    orderBy: [{ pubblicatoDal: "asc" }, { nome: "asc" }],
    take: 200,
  });

  return (
    <div className="layout">
      <Sidebar attiva="sviluppo" />
      <main className="main">
        <Link className="ritorno" href="/sviluppo">
          ← Sviluppo prodotto
        </Link>
        <div className="page-head">
          <div>
            <h1 className="page-title">Calendario delle pubblicazioni</h1>
            <p className="page-sub">
              Quando un prodotto <b>entra</b> sul negozio e quando <b>esce</b>. Le date si impostano creando il
              prodotto come Pubblico; il giro delle 04:05 accende e spegne sul negozio.
            </p>
          </div>
          <div className="pill-scelta">
            <Link className="pill-opt" href={`/sviluppo/calendario?mese=${mesePrec}`}>
              ← {MESI[Number(mesePrec.slice(5)) - 1]}
            </Link>
            <Link className="pill-opt attuale" href={`/sviluppo/calendario?mese=${isoRoma(oggi).slice(0, 7)}`}>
              Oggi
            </Link>
            <Link className="pill-opt" href={`/sviluppo/calendario?mese=${meseSucc}`}>
              {MESI[Number(meseSucc.slice(5)) - 1]} →
            </Link>
          </div>
        </div>

        <div className="scheda">
          <div className="scheda-titolo" style={{ textTransform: "capitalize" }}>
            {MESI[mese - 1]} {anno}
          </div>
          <div className="calendario">
            {["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((g) => (
              <div key={g} className="giorno-nome">
                {g}
              </div>
            ))}
            {giorni.map((d) => {
              const k = isoRoma(d);
              const fuori = k.slice(0, 7) !== meseIso;
              const e = eventi.get(k) ?? [];
              return (
                <div key={k} className={`giorno${fuori ? " fuori-mese" : ""}${k === isoRoma(oggi) ? " oggi" : ""}`}>
                  <div className="numero">{Number(k.slice(8))}</div>
                  {e.map((x, i) => (
                    <Link
                      key={`${x.id}-${x.tipo}-${i}`}
                      href={`/prodotti/${x.id}`}
                      className={`evento ${x.tipo}`}
                      title={`${x.tipo === "inizio" ? "Entra" : "Esce"}: ${x.nome}${x.negozio ? ` · ${x.negozio}` : ""}`}
                    >
                      {x.tipo === "inizio" ? "▶ " : "■ "}
                      {x.nome}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="cella-sub" style={{ marginTop: 10 }}>
            ▶ entra sul negozio · ■ ultimo giorno online. I prodotti pubblici senza date non compaiono: sono sempre online.
          </p>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Prodotti con una finestra di pubblicazione · {conFinestra.length}</div>
          {conFinestra.length === 0 ? (
            <div className="vuoto-mini">Nessun prodotto ha ancora una data di pubblicazione: si imposta in «Nuovo prodotto», fase Pubblico.</div>
          ) : (
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Negozio</th>
                    <th>Dal</th>
                    <th>Fino al</th>
                    <th>Stato sul negozio</th>
                  </tr>
                </thead>
                <tbody>
                  {conFinestra.map((p) => (
                    <tr key={p.id} className="riga-cliccabile">
                      <td>
                        <Link href={`/prodotti/${p.id}`} className="cella-nome link-riga">
                          {p.nome}
                        </Link>
                      </td>
                      <td>{p.negozioNome ?? "—"}</td>
                      <td>{p.pubblicatoDal ? dataIt(p.pubblicatoDal) : "da subito"}</td>
                      <td>{p.pubblicatoFinoAl ? dataIt(p.pubblicatoFinoAl) : "per sempre"}</td>
                      <td>
                        {p.shopifyStato === "pubblicato" ? "attivo" : p.shopifyStato === "bozza" ? "bozza" : "non pubblicato"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** 0 = lunedì … 6 = domenica, nel calendario di Roma. */
function giornoSettimanaRoma(d: Date): number {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", weekday: "short" }).format(d);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(nome);
}
