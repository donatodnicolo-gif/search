import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno, contoEconomico } from "@/lib/calc";
import { quotaDeluxyAnno } from "@/lib/quota";
import { prisma } from "@/lib/db";
import { primoMeseAperto } from "@/lib/periodo";
import { eur, MESI } from "@/lib/format";
import { mesiChiusiMossi } from "@/lib/sentinella-consegne";

export const dynamic = "force-dynamic";

// **La home dell'app: cosa manca.** Nata dalla revisione del 24/08/2026
// («l'app è troppo complessa per il suo obiettivo»): l'obiettivo numero uno è
// *individuare i budget che i responsabili devono inserire e monitorare*, e
// prima nessuna pagina rispondeva a «cosa manca?» — il buco dei sei mesi di
// Deluxy.it è rimasto invisibile per settimane proprio per questo.
//
// La regola della pagina: **ogni riga è un'azione con un link**, non un dato.
// Quello che è a posto non compare — una lista di cose fatte è rumore che
// nasconde le cose da fare.

type Voce = {
  titolo: string;
  dettaglio: string;
  href: string;
  azione: string;
  grave: boolean;
};

export default async function DaFare() {
  const [dati, premiDb] = await Promise.all([
    caricaAnno(ANNO_CORRENTE),
    prisma.premio.findMany({ where: { year: ANNO_CORRENTE } }),
  ]);
  const aperto = primoMeseAperto(ANNO_CORRENTE);
  const mesiChiusi = Array.from({ length: Math.min(aperto - 1, 12) }, (_, i) => i + 1);
  const q = await quotaDeluxyAnno(ANNO_CORRENTE, dati.maisons);
  const voci: Voce[] = [];

  // ---- 0. I mesi chiusi che si sono mossi ----
  //
  // ⭐ Sta per prima perché è l'unica voce che parla del **passato**: le altre
  // dicono cosa manca da fare, questa dice che una cosa che credevi ferma si è
  // mossa. Il costo delle consegne si legge dal vivo dalla piattaforma, quindi
  // una correzione su una consegna di marzo cambia il marzo del conto economico
  // senza che nessuno lo chieda — ed è giusto che passi, non che passi in
  // silenzio.
  //
  // ⚠️ Qui si **guarda e basta**: la fotografia la registra il cron notturno
  // (`/api/cron/sentinella-consegne`). Una pagina che scrive mentre la si apre
  // cambia il risultato della prossima apertura, e l'avviso sparirebbe da solo
  // appena qualcuno lo legge.
  const mossi = await mesiChiusiMossi(ANNO_CORRENTE).catch(() => []);
  for (const m of mossi) {
    const su = m.differenza > 0;
    voci.push({
      titolo: `${MESI[m.month - 1]} è cambiato dopo essere stato chiuso: ${su ? "+" : ""}${eur(m.differenza)} di consegne`,
      dettaglio: `Valeva ${eur(m.prima)}, adesso vale ${eur(m.adesso)}. Il costo delle consegne si legge dal vivo dalla piattaforma: qualcuno ha corretto una consegna di quel mese — una paga, un plus, una consegna resa pagabile — e il conto economico di ${MESI[m.month - 1]} si è mosso con lei. Non è un errore da correggere: è una cosa da sapere, perché i numeri di quel mese che hai già letto o mandato a qualcuno adesso sono diversi.`,
      href: "/consuntivo",
      azione: "Guarda il mese",
      grave: Math.abs(m.differenza) >= 500,
    });
  }

  // ---- 1. Budget di vendita mancanti: mesi chiusi con vendite vere e budget a zero ----
  for (const m of dati.maisons) {
    if (!m.vendutoMesi) continue;
    const buchi = mesiChiusi.filter(
      (mm) => (m.mesi.find((x) => x.month === mm)?.vendite.D2C ?? 0) === 0 && (m.vendutoMesi![mm - 1] ?? 0) > 0
    );
    if (buchi.length === 0) continue;
    const venduto = buchi.reduce((s, mm) => s + (m.vendutoMesi![mm - 1] ?? 0), 0);
    voci.push({
      titolo: `${m.nome}: budget D2C mai scritto su ${buchi.length} ${buchi.length === 1 ? "mese" : "mesi"}`,
      dettaglio: `${buchi.map((mm) => MESI[mm - 1]).join(", ")} — in quei mesi il negozio ha venduto ${eur(venduto)}, e finché il budget manca ogni percentuale di realizzazione è illeggibile.`,
      href: "/maison",
      azione: "Scrivi il budget",
      grave: true,
    });
  }

  // ---- 2. Quote ADV che non distribuiscono il monte ----
  for (const m of dati.maisons) {
    if (!m.faPubblicita) continue;
    const somma = m.mesi.reduce((s, x) => s + x.advPercent, 0);
    if (Math.abs(somma - 100) <= 0.5) continue;
    voci.push({
      titolo: `${m.nome}: le quote pubblicitarie fanno ${somma.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% invece di 100%`,
      dettaglio:
        somma < 100
          ? `${(100 - somma).toLocaleString("it-IT", { maximumFractionDigits: 1 })} punti di budget pubblicitario non sono assegnati a nessun mese.`
          : `Si sta impegnando pubblicità oltre il monte dell'anno.`,
      href: "/spese",
      azione: "Sistema le quote",
      grave: somma > 100,
    });
  }

  // ---- 3. Linee commerciali senza margine o senza consuntivo ----
  const senzaMargine = dati.linee.filter((l) => l.marginePct === null);
  if (senzaMargine.length > 0) {
    voci.push({
      titolo: `${senzaMargine.length} linee commerciali senza margine`,
      dettaglio: `${senzaMargine.map((l) => l.nome).join(", ")}: entrano nel conto economico a margine zero — il ricavo si conta ma non lascia niente.`,
      href: "/margini",
      azione: "Scrivi i margini",
      grave: false,
    });
  }
  const lineeDb = await prisma.lineaCommerciale.findMany({ select: { nome: true, vociFinance: true } });
  const scollegate = lineeDb.filter((l) => !l.vociFinance);
  if (scollegate.length >= lineeDb.length - 1 && lineeDb.length > 0) {
    voci.push({
      titolo: `${scollegate.length} linee commerciali senza consuntivo`,
      dettaglio:
        "Non sono collegate alle tipologie di Finance: sui mesi passati il loro fatturato resta «n.d.», che non vuol dire zero. Il collegamento non si indovina — lo sa chi conosce la fatturazione.",
      href: "/commerciale",
      azione: "Collega a Finance",
      grave: false,
    });
  }

  // ---- 4. Target da confermare ----
  // Un premio MANUALE senza decisione aspetta una persona per definizione: non
  // serve misurare niente per saperlo.
  const daConfermare = premiDb.filter((p) => p.obiettivoTipo === "MANUALE" && p.riconosciuto === null);
  if (daConfermare.length > 0) {
    voci.push({
      titolo: `${daConfermare.length} ${daConfermare.length === 1 ? "premio aspetta" : "premi aspettano"} una conferma`,
      dettaglio: `${daConfermare.map((p) => p.nome).join(", ")}: l'app non sa misurarli — deve dirlo una persona.`,
      href: "/premi",
      azione: "Conferma o nega",
      grave: false,
    });
  }

  // ---- Il quadro, per contesto (non è una voce da fare) ----
  const pl = contoEconomico(dati, "RAGGIUNGIBILE", undefined, q);

  const gravi = voci.filter((v) => v.grave);
  const normali = voci.filter((v) => !v.grave);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Da fare</h1>
          <p className="page-caption">
            Quello che aspetta una mano, {ANNO_CORRENTE}. Quando questa pagina è vuota, i budget sono
            completi e i target confermati: quello che è a posto non compare.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Cose da fare</div>
          <div className="kpi-value" style={voci.length > 0 ? { color: "var(--orange)" } : undefined}>
            {voci.length}
          </div>
          <div className="kpi-sub">{gravi.length > 0 ? `${gravi.length} urgenti` : "niente di urgente"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ricavi a budget</div>
          <div className="kpi-value">{eur(pl.ricavi)}</div>
          <div className="kpi-sub">
            <Link href="/pl" style={{ color: "var(--blue)" }}>il conto economico completo →</Link>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">EBITDA a budget</div>
          <div className={`kpi-value ${pl.ebitda >= 0 ? "pos" : "neg"}`}>{eur(pl.ebitda)}</div>
          <div className="kpi-sub" title={q.spiegazione}>quota D2C {q.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% · {q.etichetta ?? (q.misurata ? "misurata" : "stimata")}</div>
        </div>
      </div>

      {voci.length === 0 && (
        <div className="card">
          <p className="page-caption" style={{ margin: 0 }}>
            <strong>Tutto compilato.</strong> I budget coprono i mesi, le quote tornano, i target che
            aspettavano una persona sono stati decisi. Da qui si <Link href="/budget" style={{ color: "var(--blue)" }}>monitora il budget</Link> o
            si guarda <Link href="/pl" style={{ color: "var(--blue)" }}>il conto economico</Link>.
          </p>
        </div>
      )}

      {[...gravi, ...normali].map((v) => (
        <div
          className="card"
          key={v.titolo}
          style={v.grave ? { borderColor: "var(--orange)", background: "rgba(201,52,0,0.03)" } : undefined}
        >
          <div className="page-head" style={{ marginBottom: 0 }}>
            <div>
              <strong>{v.titolo}</strong>
              <p className="page-caption" style={{ margin: "4px 0 0" }}>{v.dettaglio}</p>
            </div>
            <div className="page-actions">
              <Link className="btn secondary" href={v.href}>{v.azione} →</Link>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
