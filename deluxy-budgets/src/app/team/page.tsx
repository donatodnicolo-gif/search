import Link from "next/link";
import {
  AMBITO_COMMERCIALE,
  ANNO_CORRENTE,
  caricaAnno,
  contoEconomicoTeam,
  costoPersonaAnno,
  costoPersonaMese,
  personeDelTeam,
} from "@/lib/calc";
import { quotaDeluxyAnno } from "@/lib/quota";
import { primoMeseAperto } from "@/lib/periodo";
import { eur, MESI } from "@/lib/format";
import { TeamEditor } from "@/components/TeamEditor";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  // Il conto economico per team (29/08/2026): stessa quota D2C del P&L — il
  // venduto pieno confronterebbe una provvigione con un prezzo di vendita.
  const quotaDeluxy = await quotaDeluxyAnno(dati.year, dati.maisons);
  const plTeam = contoEconomicoTeam(dati, quotaDeluxy);
  const squadreRicavo = plTeam.filter((t) => t.tipo === "ricavo");
  const squadreStruttura = plTeam.filter((t) => t.tipo === "struttura");
  const squadreDaDichiarare = plTeam.filter((t) => t.tipo === "da-dichiarare");

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
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <h2 className="card-title">Conto economico per team</h2>
          <p className="card-sub">
            Budget {dati.year} al livello raggiungibile, col D2C alla quota Deluxy. L&apos;associazione
            si sceglie sul team (Modifica → Ruolo economico).
          </p>
        </div>

        {squadreRicavo.length > 0 ? (
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

        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Il <strong>contributo</strong> è: ricavi degli ambiti − costi di prodotto e servizio (dal
          margine per tipologia, come nel <a href="/pl" style={{ color: "var(--blue)" }}>P&amp;L</a>) −
          costo delle persone del team. <strong>Di proposito non si tolgono</strong> né i costi di
          struttura né la pubblicità né i team di struttura: si pagano col contributo di tutte le
          squadre, e ripartirli qui vorrebbe dire scegliere un criterio che nessuno ha deciso. Per
          questo la somma dei contributi <strong>non è l&apos;EBITDA</strong>.
        </p>
      </div>

      <TeamEditor team={team} senzaTeam={senzaTeam} ambitiDisponibili={ambitiDisponibili} />
    </>
  );
}
