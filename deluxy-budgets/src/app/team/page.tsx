import Link from "next/link";
import {
  AMBITO_COMMERCIALE,
  ANNO_CORRENTE,
  LIVELLI,
  type Livello,
  caricaAnno,
  contoEconomico,
  contoEconomicoTeam,
  contoEconomicoTeamConsuntivo,
  costoPersonaAnno,
  costoPersonaMese,
  margineDi,
  personeDelTeam,
} from "@/lib/calc";
import { caricaConsuntivo } from "@/lib/consuntivo";
import { quotaDeluxyAnno } from "@/lib/quota";
import { primoMeseAperto } from "@/lib/periodo";
import { eur, MESI } from "@/lib/format";
import { TeamEditor } from "@/components/TeamEditor";

export const dynamic = "force-dynamic";

// Le stesse scorciatoie di periodo del Consuntivo (Libro §8-bis): qui però il
// periodo si ferma sempre all'ultimo mese CHIUSO — il mese in corso è a metà,
// e mezzo mese di ricavi contro un mese intero di stipendi non è un dato.
const PERIODI = [
  { key: "ytd", label: "YTD", dal: 1, al: 12 },
  { key: "t1", label: "T1", dal: 1, al: 3 },
  { key: "t2", label: "T2", dal: 4, al: 6 },
  { key: "t3", label: "T3", dal: 7, al: 9 },
  { key: "t4", label: "T4", dal: 10, al: 12 },
  { key: "s1", label: "1° sem", dal: 1, al: 6 },
  { key: "s2", label: "2° sem", dal: 7, al: 12 },
];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; livello?: string; periodo?: string }>;
}) {
  const sp = await searchParams;
  const dati = await caricaAnno(ANNO_CORRENTE);

  // Il conto economico per team (29/08/2026): stessa quota D2C del P&L — il
  // venduto pieno confronterebbe una provvigione con un prezzo di vendita.
  // Dal 29/08 sera la card ha due viste (richiesta dell'utente: «scegliere se
  // consuntivo, con specifica del periodo, o tipologia di budget»):
  // BUDGET a uno dei tre livelli, oppure CONSUNTIVO di un periodo chiuso.
  const vista = sp.vista === "consuntivo" ? "consuntivo" : "budget";
  const livello = (LIVELLI.some((l) => l.key === sp.livello) ? sp.livello : "RAGGIUNGIBILE") as Livello;
  const periodoCard = PERIODI.find((p) => p.key === sp.periodo) ?? PERIODI[0];

  const quotaDeluxy = await quotaDeluxyAnno(dati.year, dati.maisons);

  // Gli ambiti selezionabili nell'editor: le tipologie di servizio, più le
  // linee del team commerciale.
  const ambitiDisponibili = [
    ...dati.tipologie.map((t) => ({ slug: t.slug, nome: t.nome })),
    { slug: AMBITO_COMMERCIALE, nome: "Linee commerciali" },
  ];
  const nomeAmbito = (slug: string) => ambitiDisponibili.find((a) => a.slug === slug)?.nome ?? slug;

  // I mesi già chiusi: quelli in cui il costo del personale è **sostenuto**,
  // non previsto. Il mese in corso resta fuori — è a metà, e accanto a mesi
  // interi farebbe sembrare che si spenda meno.
  const aperto = primoMeseAperto(dati.year);
  const mesiChiusi = Array.from({ length: Math.max(0, Math.min(aperto - 1, 12)) }, (_, i) => i + 1);
  const etichettaChiusi = mesiChiusi.length
    ? `${MESI[mesiChiusi[0] - 1]}–${MESI[mesiChiusi[mesiChiusi.length - 1] - 1]}`
    : "nessun mese chiuso";

  // ── La card «Conto economico per team», nella vista scelta ──
  // Nel consuntivo il periodo si interseca coi mesi chiusi: chiedere T3 a
  // settembre dà solo luglio–agosto, e si dichiara.
  const mesiCard = mesiChiusi.filter((m) => m >= periodoCard.dal && m <= periodoCard.al);
  const etichettaCard = mesiCard.length
    ? mesiCard.length === 1
      ? MESI[mesiCard[0] - 1]
      : `${MESI[mesiCard[0] - 1]}–${MESI[mesiCard[mesiCard.length - 1] - 1]}`
    : "nessun mese chiuso";
  const cons = vista === "consuntivo" && mesiCard.length ? await caricaConsuntivo(dati, mesiCard) : null;
  const plTeam =
    vista === "consuntivo"
      ? cons
        ? contoEconomicoTeamConsuntivo(dati, cons.ricaviPerTipologia, mesiCard)
        : []
      : contoEconomicoTeam(dati, quotaDeluxy, livello);
  const squadreRicavo = plTeam.filter((t) => t.tipo === "ricavo");
  const squadreStruttura = plTeam.filter((t) => t.tipo === "struttura");
  const squadreDaDichiarare = plTeam.filter((t) => t.tipo === "da-dichiarare");

  // ── Il risultato DOPO la struttura (richiesta dell'utente, 29/08 sera) ──
  // La somma dei contributi non è l'EBITDA, di proposito: i costi comuni non si
  // ripartiscono. Ma qui sotto si tolgono UNA volta, sul totale — così il conto
  // si chiude sull'EBITDA della vista scelta, e ogni riga dice che cosa passa
  // fra la somma dei contributi e il risultato.
  const totContributi = squadreRicavo.reduce((s, t) => s + t.contributo, 0);
  const costoStrutturaTeam = squadreStruttura.reduce((s, t) => s + t.costoTeam, 0);
  const costoDaDichiarare = squadreDaDichiarare.reduce((s, t) => s + t.costoTeam, 0);
  const costoTuttiITeam = plTeam.reduce((s, t) => s + t.costoTeam, 0);
  const margineSquadre = squadreRicavo.reduce((s, t) => s + t.margineLordo, 0);

  let righeRisultato: { label: string; valore: number }[] = [];
  let notaRisultato = "";
  if (vista === "budget") {
    const pl = contoEconomico(dati, livello, undefined, quotaDeluxy);
    righeRisultato = [
      { label: "Totale contributi delle squadre", valore: totContributi },
      { label: "Margine degli ambiti senza squadra", valore: pl.margineLordo - margineSquadre },
      { label: "Pubblicità", valore: -pl.adv },
      { label: "Costi di struttura", valore: -pl.costiFissi },
      { label: "Team di struttura", valore: -costoStrutturaTeam },
      { label: "Team col ruolo da dichiarare", valore: -costoDaDichiarare },
      { label: "Persone senza team", valore: -(pl.personale - costoTuttiITeam) },
    ];
    notaRisultato = `È l'EBITDA del P&L al livello ${
      LIVELLI.find((l) => l.key === livello)?.label ?? livello
    }: i costi comuni si tolgono qui, una volta sola, non squadra per squadra.`;
  } else if (cons) {
    // Il COGS per ambito viene dal margine per tipologia (la banca conosce il
    // totale ma non sa dividerlo): lo scarto fra i due ha una riga sua, così il
    // conto si chiude comunque sull'EBITDA vero del Consuntivo.
    const cogsMargine = Object.entries(cons.ricaviPerTipologia).reduce(
      (s, [slug, v]) => s + v * (1 - margineDi(dati, slug) / 100),
      0
    );
    const margineDerivato = cons.ricavi - cogsMargine;
    // Il verso dello scarto sta nell'etichetta, non solo nel segno: un numero
    // positivo con scritto «oltre» direbbe il contrario di quello che è.
    const scartoCogs = cons.cogs - cogsMargine;
    righeRisultato = [
      { label: "Totale contributi delle squadre", valore: totContributi },
      { label: "Margine degli ambiti senza squadra", valore: margineDerivato - margineSquadre },
      {
        label:
          scartoCogs >= 0
            ? "Costo del venduto di banca oltre quello dal margine per tipologia"
            : "Costo del venduto di banca sotto quello dal margine per tipologia",
        valore: -scartoCogs,
      },
      { label: "Pubblicità (banca)", valore: -cons.adv },
      { label: "Costi di struttura (banca)", valore: -cons.struttura },
      { label: "Team di struttura", valore: -costoStrutturaTeam },
      { label: "Team col ruolo da dichiarare", valore: -costoDaDichiarare },
      { label: "Persone senza team", valore: -(cons.personale - costoTuttiITeam) },
    ];
    notaRisultato =
      "È l'EBITDA del Consuntivo sugli stessi mesi: ogni riga dice che cosa passa fra la somma dei contributi e il risultato.";
  }
  // Una riga a zero non dice niente: si toglie (e togliendola il totale non cambia).
  righeRisultato = righeRisultato.filter((r) => Math.abs(r.valore) >= 0.5);
  const risultato = righeRisultato.reduce((s, r) => s + r.valore, 0);

  const linkCard = (x: { vista?: string; livello?: string; periodo?: string }) =>
    `/team?vista=${x.vista ?? vista}&livello=${x.livello ?? livello}&periodo=${x.periodo ?? periodoCard.key}#conto-team`;

  const sostenuto = (p: Parameters<typeof costoPersonaAnno>[0]) =>
    mesiChiusi.reduce((s, m) => s + costoPersonaMese(p, m), 0);

  // Ogni team con il suo organico e il costo del lavoro dell'anno.
  const team = dati.team.map((t) => {
    const persone = personeDelTeam(dati, t.id);
    return {
      ...t,
      persone: persone.map((p) => ({
        id: p.id,
        nome: p.nome,
        ruolo: p.ruolo,
        tipo: p.tipo,
        costo: costoPersonaAnno(p),
      })),
      costo: persone.reduce((s, p) => s + costoPersonaAnno(p), 0),
      sostenuto: persone.reduce((s, p) => s + sostenuto(p), 0),
      teste: persone.length,
    };
  });

  const persSenzaTeam = personeDelTeam(dati, null);
  const senzaTeam = persSenzaTeam.map((p) => ({
    id: p.id,
    nome: p.nome,
    ruolo: p.ruolo,
    tipo: p.tipo,
    costo: costoPersonaAnno(p),
  }));

  const righe = [
    ...team.map((t) => ({ nome: t.nome, teste: t.teste, sostenuto: t.sostenuto, anno: t.costo })),
    ...(persSenzaTeam.length
      ? [
          {
            nome: "Senza team",
            teste: persSenzaTeam.length,
            sostenuto: persSenzaTeam.reduce((s, p) => s + sostenuto(p), 0),
            anno: persSenzaTeam.reduce((s, p) => s + costoPersonaAnno(p), 0),
          },
        ]
      : []),
  ].sort((a, b) => b.anno - a.anno);

  const totSostenuto = righe.reduce((s, r) => s + r.sostenuto, 0);
  const totAnno = righe.reduce((s, r) => s + r.anno, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-caption">
            Le squadre aziendali con il loro responsabile e il costo del lavoro {dati.year}.
            Le persone si assegnano a un team dalla scheda in Dipendenti.
          </p>
        </div>
      </div>

      {/* ⭐ 27/08/2026, richiesta dell'utente: «devi farmi vedere i costi
          consuntivati e la proiezione a tutto il 2026». Qui c'erano solo i
          totali dell'anno: non si poteva sapere quanto era già uscito. */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <h2 className="card-title">Quanto è già costato, e quanto costerà</h2>
          <p className="card-sub">
            Il <strong>sostenuto</strong> sono i mesi chiusi ({etichettaChiusi}); l&apos;<strong>anno</strong> è
            il costo di tutti e dodici i mesi.
          </p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th className="num">Persone</th>
                <th className="num">Sostenuto {etichettaChiusi}</th>
                <th className="num">Ancora da sostenere</th>
                <th className="num">Anno {dati.year}</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.nome}>
                  <td>{r.nome}</td>
                  <td className="num muted">{r.teste}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{eur(r.sostenuto)}</td>
                  <td className="num muted">{eur(r.anno - r.sostenuto)}</td>
                  <td className="num">{eur(r.anno)}</td>
                </tr>
              ))}
              <tr className="tot">
                <td style={{ fontWeight: 600 }}>Totale</td>
                <td className="num">{righe.reduce((s, r) => s + r.teste, 0)}</td>
                <td className="num" style={{ fontWeight: 600 }}>{eur(totSostenuto)}</td>
                <td className="num">{eur(totAnno - totSostenuto)}</td>
                <td className="num" style={{ fontWeight: 600 }}>{eur(totAnno)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          ⚠️ <strong>L&apos;anno non è la media dei mesi chiusi moltiplicata per dodici</strong>, ed è la
          differenza che conta: il roster sa in quali mesi ciascuno è a carico — chi è entrato a
          settembre, chi ha smesso a maggio, il TFR che cade nel mese in cui il rapporto finisce.
          Proiettare una media qui direbbe che un assunto di settembre è costato anche a gennaio.
          Per lo stesso motivo il <strong>mese in corso resta fuori</strong> dal sostenuto: è a metà.
          Il costo è quello a budget dall&apos;anagrafica{" "}
          <Link href="/dipendenti" style={{ color: "var(--blue)" }}>Dipendenti</Link> (lordo +
          contributi + TFR), non quello che è uscito dalla banca: i due numeri si confrontano in{" "}
          <Link href="/consuntivo/personale" style={{ color: "var(--blue)" }}>Consuntivo → personale</Link>.
        </p>
      </div>

      {/* ⭐ 29/08/2026, richiesta dell'utente: «consentimi di associare team con
          ricavi e budget (esempio maison con D2C) o indica se il team è di
          struttura, e stima così il conto economico per team». La regola: ai
          team di ricavo si tolgono i costi di PRODOTTO e SERVIZIO (il COGS, dal
          margine per tipologia) e il costo delle loro persone — MAI i costi di
          struttura; i team di struttura SONO il costo di struttura. */}
      <div className="card" id="conto-team" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <h2 className="card-title">Conto economico per team</h2>
          <p className="card-sub">
            {vista === "budget" ? (
              <>Budget {dati.year} al livello scelto, col D2C alla quota Deluxy.</>
            ) : (
              <>
                Consuntivo {etichettaCard} {dati.year}: ricavi veri (Finance, e l&apos;economia misurata
                per il D2C), costo delle persone dei mesi del periodo.
              </>
            )}{" "}
            L&apos;associazione si sceglie sul team (Modifica → Ruolo economico).
          </p>
        </div>

        {/* Su mobile la fila dei selettori SCORRE su una riga (Libro v1.3),
            non manda in overflow la pagina. */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
          <div className="seg" style={{ flexShrink: 0 }}>
            <Link href={linkCard({ vista: "budget" })} className={vista === "budget" ? "on" : ""}>
              Budget
            </Link>
            <Link href={linkCard({ vista: "consuntivo" })} className={vista === "consuntivo" ? "on" : ""}>
              Consuntivo
            </Link>
          </div>
          {vista === "budget" ? (
            <div className="seg" style={{ flexShrink: 0 }}>
              {LIVELLI.map((l) => (
                <Link key={l.key} href={linkCard({ livello: l.key })} className={l.key === livello ? "on" : ""}>
                  {l.label}
                </Link>
              ))}
            </div>
          ) : (
            <div className="seg" style={{ flexShrink: 0 }}>
              {PERIODI.map((p) => (
                <Link key={p.key} href={linkCard({ periodo: p.key })} className={p.key === periodoCard.key ? "on" : ""}>
                  {p.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {vista === "consuntivo" && mesiCard.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            In questo periodo non c&apos;è nessun mese chiuso: il consuntivo per team si legge solo sui
            mesi finiti — il mese in corso è a metà, e mezzo mese di ricavi contro un mese intero di
            stipendi non è un dato.
          </p>
        ) : vista === "consuntivo" && cons && !cons.ok ? (
          <p style={{ fontSize: 13, color: "var(--red)" }}>
            Il consuntivo non è arrivato ({cons.mancanti.join("; ") || "le fonti non rispondono"}):
            senza, questa tabella direbbe zero e sembrerebbe un fatto. Riprovare fra poco.
          </p>
        ) : squadreRicavo.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Ambiti di ricavo</th>
                  <th className="num">Ricavi</th>
                  <th className="num">Costi prodotto e servizio</th>
                  <th className="num">Margine lordo</th>
                  <th className="num">Costo del team</th>
                  <th className="num">Contributo</th>
                </tr>
              </thead>
              <tbody>
                {squadreRicavo.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className={`badge ${t.colore ?? "neutral"}`}>{t.nome}</span>
                    </td>
                    <td className="muted">{t.ambiti.map(nomeAmbito).join(" · ")}</td>
                    <td className="num">{eur(t.ricavi)}</td>
                    <td className="num muted">− {eur(t.cogs)}</td>
                    <td className="num">{eur(t.margineLordo)}</td>
                    <td className="num muted">− {eur(t.costoTeam)}</td>
                    <td className="num" style={{ fontWeight: 600, color: t.contributo < 0 ? "var(--red)" : undefined }}>
                      {eur(t.contributo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>
            Nessun team è ancora associato a un ambito di ricavo: si fa da «Modifica» sul team,
            scegliendo gli ambiti (es. Maison → D2C).
          </p>
        )}

        {(squadreStruttura.length > 0 || squadreDaDichiarare.length > 0) && (
          <div style={{ marginTop: 14 }}>
            {squadreStruttura.length > 0 && (
              <p style={{ fontSize: 13.5, margin: "0 0 4px" }}>
                <strong>Team di struttura</strong> (il loro costo è un costo comune, nessun ricavo
                attribuito):{" "}
                {squadreStruttura.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && " · "}
                    {t.nome} <span className="muted">{eur(t.costoTeam)}</span>
                  </span>
                ))}
                {" — totale "}
                <strong>{eur(squadreStruttura.reduce((s, t) => s + t.costoTeam, 0))}</strong>
              </p>
            )}
            {squadreDaDichiarare.length > 0 && (
              <p style={{ fontSize: 13.5, margin: 0, color: "var(--orange)" }}>
                <strong>Ruolo da dichiarare</strong> ({squadreDaDichiarare.map((t) => t.nome).join(", ")}):
                finché non si sceglie, questi team non compaiono né fra i ricavi né fra la
                struttura — dichiararlo è un clic su «Modifica».
              </p>
            )}
          </div>
        )}

        {/* Il risultato dopo la struttura (29/08 sera): i costi comuni tolti
            UNA volta, sul totale — mai ripartiti — fino all'EBITDA della vista. */}
        {righeRisultato.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 14, maxWidth: 560 }}>
            <table>
              <thead>
                <tr>
                  <th>Il risultato dopo la struttura</th>
                  <th className="num">{vista === "budget" ? `Budget ${dati.year}` : etichettaCard}</th>
                </tr>
              </thead>
              <tbody>
                {righeRisultato.map((r) => (
                  <tr key={r.label}>
                    <td className={r.valore < 0 ? "muted" : undefined}>{r.label}</td>
                    <td className="num">{r.valore < 0 ? <>− {eur(-r.valore)}</> : eur(r.valore)}</td>
                  </tr>
                ))}
                <tr className="tot">
                  <td style={{ fontWeight: 600 }}>Risultato (EBITDA)</td>
                  <td className="num" style={{ fontWeight: 600, color: risultato < 0 ? "var(--red)" : undefined }}>
                    {eur(risultato)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {righeRisultato.length > 0 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{notaRisultato}</p>
        )}

        {vista === "consuntivo" && cons && cons.mancanti.length > 0 && (
          <p style={{ fontSize: 12, marginTop: 8, color: "var(--orange)" }}>
            ⚠️ Non è arrivato tutto: {cons.mancanti.join("; ")}.
          </p>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Il <strong>contributo</strong> è: ricavi degli ambiti − costi di prodotto e servizio (dal
          margine per tipologia, come nel <a href="/pl" style={{ color: "var(--blue)" }}>P&amp;L</a>) −
          costo delle persone del team. <strong>Di proposito non si ripartiscono</strong> né i costi di
          struttura né la pubblicità né i team di struttura: si pagano col contributo di tutte le
          squadre, e dividerli per squadra vorrebbe dire scegliere un criterio che nessuno ha deciso —
          per questo si tolgono <strong>una volta sola, sul totale</strong>, nel «risultato dopo la
          struttura» qui sopra.
          {vista === "consuntivo" && (
            <>
              {" "}Nel consuntivo il D2C entra già alla presa Deluxy (l&apos;economia misurata da
              Orders), le <strong>linee commerciali non hanno una riga propria</strong> (il loro
              fatturato arriva dalle voci di Finance mappate sulle tipologie) e il COGS per ambito
              viene dal margine per tipologia: lo scarto con la banca è dichiarato nella tabella del
              risultato.
            </>
          )}
        </p>
      </div>

      <TeamEditor team={team} senzaTeam={senzaTeam} ambitiDisponibili={ambitiDisponibili} />
    </>
  );
}
