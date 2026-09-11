import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { redirect } from "next/navigation";
import { euro, importoDaIncollare } from "@/lib/denaro";
import { formattaIban } from "@/lib/iban";
import { motiviDa } from "@/lib/richieste";
import { METODI } from "@/lib/metodi";
import { BadgeRischio, BadgeStato, Firme, quando } from "@/components/Etichette";
import { ChiusuraRapida } from "@/components/ChiusuraRapida";
import { RigaCliccabile } from "@/components/RigaCliccabile";
import { leggiRegole } from "@/lib/impostazioni";
import { cifraturaPronta } from "@/lib/crypto";

// La coda di lavoro: le richieste che aspettano una firma. È la prima cosa che
// si vede entrando, perché è l'unica che richiede una persona.

export const dynamic = "force-dynamic";

export default async function Coda({
  searchParams,
}: {
  searchParams: Promise<{ chiuso?: string; esito?: string; q?: string; periodo?: string; ord?: string; dir?: string }>;
}) {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");

  // Esito di una chiusura fatta da questa pagina. Nell'indirizzo viaggiano solo
  // il riferimento e quale delle due strade è stata presa: la frase la scrive
  // qui l'app, e il riferimento si mostra solo se ha la forma di un
  // riferimento — un link non deve poter far comparire un testo qualsiasi
  // dentro un'app che muove denaro.
  const sp = await searchParams;
  const chiuso = /^[A-Z0-9-]{3,30}$/.test(sp.chiuso ?? "") ? sp.chiuso! : "";
  const esitoChiusura = sp.esito === "pagata_fuori" || sp.esito === "annullata" ? sp.esito : "";

  // Ricerca + scorciatoie di periodo (Libro UX&UI §8-bis; set chiesto
  // dall'utente per la coda: Oggi · Ultimi 7 giorni · Mese · Trimestre ·
  // Anno). Il periodo si applica alla data di ARRIVO della richiesta
  // (`creataIl`): è la domanda che si fa davanti alla coda — «cosa è arrivato
  // oggi?». Chips come link GET fuori dal form, un parametro solo.
  const q = (sp.q ?? "").trim();
  const PERIODI = ["oggi", "7g", "mese", "trimestre", "anno"] as const;
  const periodo = PERIODI.includes(sp.periodo as (typeof PERIODI)[number]) ? sp.periodo! : "";
  const adesso = new Date();
  const inizioOggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const intervallo =
    periodo === "oggi" ? { gte: inizioOggi }
    : periodo === "7g" ? { gte: new Date(inizioOggi.getTime() - 6 * 24 * 60 * 60 * 1000) }
    : periodo === "mese" ? { gte: new Date(adesso.getFullYear(), adesso.getMonth(), 1) }
    : periodo === "trimestre" ? { gte: new Date(adesso.getFullYear(), adesso.getMonth() - 2, 1) }
    : periodo === "anno" ? { gte: new Date(adesso.getFullYear(), 0, 1) }
    : null;

  // ORDINAMENTO (11/09/2026, chiesto dall'utente: «la tabella non è
  // ordinabile»). Le intestazioni sono link GET come le scorciatoie di periodo:
  // niente stato nel browser, l'ordine sta nell'indirizzo — quindi si può
  // mandare a qualcuno, e sopravvive alla chiusura di una riga (che torna qui
  // con i parametri). Le colonne ordinabili sono solo quelle che il DATABASE sa
  // ordinare: «Firme» si conta dopo, sulle righe già lette, e ordinarci sopra
  // darebbe un ordine giusto solo dentro la pagina.
  const COLONNE = {
    riferimento: "riferimento",
    beneficiario: "beneficiario",
    importo: "importoCent",
    origine: "origine",
    stato: "stato",
    arrivata: "creataIl",
  } as const;
  type Colonna = keyof typeof COLONNE;
  const ord = (Object.keys(COLONNE) as string[]).includes(sp.ord ?? "") ? (sp.ord as Colonna) : "";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "asc";
  // Senza una scelta esplicita resta l'ordine di lavoro: prima il rischio, poi
  // le più vecchie. È una coda da smaltire, non un archivio da sfogliare.
  const ordinamento = ord
    ? [{ [COLONNE[ord]]: dir }, { creataIl: "asc" as const }]
    : [{ rischio: "desc" as const }, { creataIl: "asc" as const }];

  const [richieste, approvate, pagateOggi, regole] = await Promise.all([
    prisma.richiesta.findMany({
      where: {
        stato: { in: ["in_attesa", "sospesa"] },
        ...(q
          ? {
              OR: [
                { riferimento: { contains: q, mode: "insensitive" as const } },
                { beneficiario: { contains: q, mode: "insensitive" as const } },
                { causale: { contains: q, mode: "insensitive" as const } },
                { origine: { contains: q, mode: "insensitive" as const } },
                { iban: { contains: q.replace(/\s/g, "").toUpperCase() } },
              ],
            }
          : {}),
        ...(intervallo ? { creataIl: intervallo } : {}),
      },
      orderBy: ordinamento,
      include: { approvazioni: { select: { esito: true, operatoreId: true } } },
      take: 200,
    }),
    prisma.richiesta.aggregate({ where: { stato: "approvata" }, _sum: { importoCent: true }, _count: true }),
    prisma.richiesta.aggregate({
      where: { pagataIl: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      _sum: { importoCent: true },
      _count: true,
    }),
    leggiRegole(),
  ]);

  const totaleInAttesa = richieste.reduce((s, r) => s + r.importoCent, 0);
  const oggi = new Date().toLocaleDateString("sv-SE"); // 2026-08-03, ora locale

  /** Un indirizzo per questa stessa pagina che CONSERVA i filtri in corso e
   *  cambia solo quello che gli si passa. Senza, ogni clic su un'intestazione
   *  butterebbe via ricerca e periodo — lo stesso difetto appena corretto sulla
   *  chiusura di una riga. */
  const indirizzo = (cambi: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (periodo) p.set("periodo", periodo);
    if (ord) p.set("ord", ord);
    if (ord) p.set("dir", dir);
    for (const [chiave, valore] of Object.entries(cambi)) {
      if (valore) p.set(chiave, valore);
      else p.delete(chiave);
    }
    const stringa = p.toString();
    return stringa ? `/?${stringa}` : "/";
  };

  /** Intestazione che ordina. Un clic sulla colonna già attiva rovescia il
   *  verso; su una colonna nuova si parte dal verso che serve più spesso —
   *  importi e date dal più alto, i testi dalla A. */
  const intestazione = (colonna: Colonna, etichetta: string, classe?: string) => {
    const attiva = ord === colonna;
    const prossimo = attiva
      ? dir === "asc"
        ? "desc"
        : "asc"
      : colonna === "importo" || colonna === "arrivata"
        ? "desc"
        : "asc";
    return (
      <th className={classe} aria-sort={attiva ? (dir === "desc" ? "descending" : "ascending") : "none"}>
        <a className={`ordina${attiva ? " attiva" : ""}`} href={indirizzo({ ord: colonna, dir: prossimo })}>
          {etichetta}
          <span className="ordina-freccia" aria-hidden="true">
            {attiva ? (dir === "desc" ? "↓" : "↑") : "↕"}
          </span>
        </a>
      </th>
    );
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Da autorizzare</h1>
          <p className="page-sub">
            Le richieste arrivate dalle altre app Deluxy. Nessun pagamento parte da solo: parte da una firma.
          </p>
        </div>
        <a className="btn btn-secondario" href="/richieste/nuova">
          Nuova richiesta
        </a>
      </div>

      {chiuso && esitoChiusura && (
        <div className="avviso-ok">
          {esitoChiusura === "pagata_fuori" ? (
            <>
              <strong>{chiuso}</strong> è segnata pagata fuori da questa app: è uscita dalla coda e l&apos;app che
              l&apos;aveva chiesta è stata avvisata. Di questo pagamento l&apos;app non ha una prova propria — resta nel
              registro chi l&apos;ha registrato.
            </>
          ) : (
            <>
              <strong>{chiuso}</strong> è annullata: nessun pagamento, e l&apos;app che l&apos;aveva chiesta è stata
              avvisata (potrà richiederla di nuovo).
            </>
          )}
        </div>
      )}

      {!cifraturaPronta() && (
        <div className="avviso-errore">
          TRANSACTIONS_ENC_KEY non è configurata: senza non si leggono i segreti di firma né i secondi fattori.
        </div>
      )}
      {!regole.ordinanteIban && (
        <div className="avviso-attenzione">
          Manca l&apos;IBAN aziendale ordinante in <a href="/impostazioni">Impostazioni</a>: senza, le distinte SEPA non si
          generano.
        </div>
      )}

      {/* Le scorciatoie di periodo (Libro §8-bis): link GET fuori dal form,
          così il submit della ricerca non le azzera e viceversa. */}
      <div className="filtri riga-chips-scorri" style={{ marginBottom: 10 }}>
        {([
          { v: "oggi", l: "Oggi" },
          { v: "7g", l: "Ultimi 7 giorni" },
          { v: "mese", l: "Mese in corso" },
          { v: "trimestre", l: "Trimestre" },
          { v: "anno", l: "Anno" },
        ] as const).map((p) => (
          <a
            key={p.v}
            href={indirizzo({ periodo: p.v })}
            className={`chip-link${periodo === p.v ? " attiva" : ""}`}
          >
            {p.l}
          </a>
        ))}
        {periodo && (
          <a href={indirizzo({ periodo: "" })} className="chip-link azzera">
            Tutte le date
          </a>
        )}
      </div>

      <form className="filtri" method="get" style={{ marginBottom: 14 }}>
        {/* Periodo e ordinamento sopravvivono al submit della ricerca. */}
        {periodo && <input type="hidden" name="periodo" value={periodo} />}
        {ord && <input type="hidden" name="ord" value={ord} />}
        {ord && <input type="hidden" name="dir" value={dir} />}
        <input type="search" name="q" defaultValue={q} placeholder="Riferimento, beneficiario, causale, IBAN, app…" />
        <button className="btn" type="submit">
          Cerca
        </button>
        {q && (
          <a className="btn btn-secondario" href={indirizzo({ q: "" })}>
            Azzera
          </a>
        )}
      </form>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{richieste.length}</div>
          <div className="kpi-etichetta">in attesa di firma</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(totaleInAttesa)}</div>
          <div className="kpi-etichetta">importo in attesa</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{approvate._count}</div>
          <div className="kpi-etichetta">approvate, pronte per la distinta</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(pagateOggi._sum.importoCent ?? 0)}</div>
          <div className="kpi-etichetta">pagate oggi ({pagateOggi._count})</div>
        </div>
      </div>

      {richieste.length === 0 ? (
        // ⚠️ Con un filtro attivo «tutto autorizzato» sarebbe una bugia: il
        // vuoto dice se è il filtro o se è davvero finito il lavoro.
        <div className="vuoto">
          {q || periodo ? "Nessuna richiesta in attesa con questi filtri." : "Nessuna richiesta in attesa. Tutto autorizzato."}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                {intestazione("riferimento", "Riferimento")}
                {intestazione("beneficiario", "Beneficiario")}
                {intestazione("importo", "Importo", "num")}
                {intestazione("origine", "Origine")}
                {intestazione("stato", "Stato")}
                {/* «Firme» non si ordina: il conteggio nasce dalle righe già
                    lette, quindi l'ordine varrebbe solo dentro questa pagina. */}
                <th>Firme</th>
                {intestazione("arrivata", "Arrivata")}
                {operatore.ruolo !== "osservatore" && <th>Chiudi</th>}
              </tr>
            </thead>
            <tbody>
              {richieste.map((r) => {
                const firme = r.approvazioni.filter((a) => a.esito === "approvata").length;
                const tuaFirma = r.approvazioni.some((a) => a.operatoreId === operatore.id);
                const motivi = motiviDa(r.motiviRischio);
                return (
                  <RigaCliccabile key={r.id} href={`/richieste/${r.id}`}>
                    <td>
                      <a href={`/richieste/${r.id}`} className="cella-nome">
                        {r.riferimento}
                      </a>
                      <div className="cella-sub">{r.causale}</div>
                    </td>
                    <td>
                      <div>{r.beneficiario}</div>
                      <div className="cella-sub iban">
                        {r.metodo === "iban" ? formattaIban(r.iban) : `${METODI[r.metodo] ?? r.metodo} · si paga a mano`}
                      </div>
                      {motivi.length > 0 && <BadgeRischio punteggio={r.rischio} />}
                    </td>
                    <td className="cella-num importo">{euro(r.importoCent)}</td>
                    <td className="cella-muta">{r.origine}</td>
                    <td>
                      <BadgeStato stato={r.stato} />
                    </td>
                    <td>
                      <Firme raccolte={firme} necessarie={r.doppiaFirma ? 2 : 1} />
                      {tuaFirma && <div className="cella-sub">hai già votato</div>}
                    </td>
                    <td className="cella-muta">{quando(r.creataIl)}</td>
                    {operatore.ruolo !== "osservatore" && (
                      <td>
                        <ChiusuraRapida
                          id={r.id}
                          riferimento={r.riferimento}
                          beneficiario={r.beneficiario}
                          importo={euro(r.importoCent)}
                          oggi={oggi}
                          filtri={{ q, periodo, ord, dir: ord ? dir : "" }}
                          daCopiare={[
                            ...(r.metodo === "iban"
                              ? [{ etichetta: "IBAN", mostra: formattaIban(r.iban), copia: r.iban, mono: true }]
                              : r.riferimentoPagamento
                                ? [{ etichetta: METODI[r.metodo] ?? r.metodo, mostra: r.riferimentoPagamento, copia: r.riferimentoPagamento, mono: true }]
                                : []),
                            { etichetta: "Intestatario", mostra: r.beneficiario, copia: r.beneficiario },
                            {
                              etichetta: "Importo",
                              mostra: euro(r.importoCent),
                              copia: importoDaIncollare(r.importoCent),
                              mono: true,
                            },
                            { etichetta: "Causale", mostra: r.causale, copia: r.causale },
                          ]}
                        />
                      </td>
                    )}
                  </RigaCliccabile>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
