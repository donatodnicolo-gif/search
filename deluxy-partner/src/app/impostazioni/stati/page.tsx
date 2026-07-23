import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { euro } from "@/lib/format";
import {
  leggiRegole, salvaRegola, ripristinaRegole,
  CAMPI_CREDITO, CAMPI_ANALISI, REGOLE_CREDITO_DEFAULT, REGOLE_ANALISI_DEFAULT,
  type RegoleCredito, type RegoleAnalisi,
} from "@/lib/regole-stati";
import { schedeTutti, GRAVITA, type StatoCredito } from "@/lib/stato-credito";
import { analisiTutti } from "@/lib/stato-analisi";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

export const dynamic = "force-dynamic";

// Regole degli stati del cliente: qui si cambiano le CONDIZIONI, non il codice.
// Ogni campo salva in `Impostazione` (chiavi regole.*); lasciandolo vuoto si
// torna al default. Sotto ogni gruppo c'è l'effetto reale sui clienti di oggi,
// così una soglia si sceglie guardando quanti clienti sposta.

async function salvaCredito(fd: FormData) {
  "use server";
  for (const { campo } of CAMPI_CREDITO) await salvaRegola("credito", campo, String(fd.get(campo) ?? ""));
  await registra({ azione: "Modificate le regole dello stato finanziario (credito)", categoria: "impostazioni" });
  revalidateTutto();
  redirect("/impostazioni/stati?salvato=credito");
}

async function salvaAnalisi(fd: FormData) {
  "use server";
  for (const { campo } of CAMPI_ANALISI) await salvaRegola("analisi", campo, String(fd.get(campo) ?? ""));
  await registra({ azione: "Modificate le regole dello stato analisi (P.P./Nuovo/Dismesso)", categoria: "impostazioni" });
  revalidateTutto();
  redirect("/impostazioni/stati?salvato=analisi");
}

async function ripristina(gruppo: "credito" | "analisi") {
  "use server";
  await ripristinaRegole(gruppo);
  await registra({ azione: `Ripristinate ai default le regole dello stato ${gruppo === "credito" ? "finanziario" : "analisi"}`, categoria: "impostazioni" });
  revalidateTutto();
  redirect(`/impostazioni/stati?ripristinato=${gruppo}`);
}

function revalidateTutto() {
  // gli stati si vedono un po' ovunque: cambiando le regole cambiano tutte le viste
  for (const p of ["/", "/partner", "/scadenzario", "/impostazioni/stati", "/fatture"]) {
    revalidatePath(p, "layout");
  }
}

const ETICHETTE_CREDITO: Record<StatoCredito, string> = {
  nessuna: "Nessuna esposizione", regolare: "Regolare", monitorare: "Da monitorare",
  ritardo: "In ritardo", grave: "Scaduto grave", insoluto: "Insoluto",
};
const COLORI_CREDITO: Record<StatoCredito, string> = {
  nessuna: "neutral", regolare: "green", monitorare: "gold",
  ritardo: "orange", grave: "red", insoluto: "purple",
};

export default async function RegoleStatiPage({
  searchParams,
}: {
  searchParams: Promise<{ salvato?: string; ripristinato?: string }>;
}) {
  const sp = await searchParams;
  const { credito, analisi } = await leggiRegole();
  const [schede, analisiMap, partners] = await Promise.all([
    schedeTutti({ regole: credito }),
    analisiTutti({ regole: analisi }),
    prisma.partner.findMany({ select: { id: true, nome: true, clienteAnno: true }, orderBy: { nome: "asc" } }),
  ]);

  // Effetto delle regole di credito: quanti clienti (e quanto esposto) per stato.
  const perStato = new Map<StatoCredito, { n: number; esposto: number; scaduto: number }>();
  for (const p of partners) {
    const s = schede.get(p.id);
    if (!s) continue;
    const acc = perStato.get(s.stato) ?? { n: 0, esposto: 0, scaduto: 0 };
    perStato.set(s.stato, { n: acc.n + 1, esposto: acc.esposto + s.esposizione, scaduto: acc.scaduto + s.scaduto });
  }
  const statiOrdinati = ([...perStato.keys()] as StatoCredito[]).sort((a, b) => GRAVITA[b] - GRAVITA[a]);

  // Effetto delle regole di analisi: dove il campo scritto a mano non coincide.
  const discordanti = partners
    .map((p) => ({ p, a: analisiMap.get(p.id) }))
    .filter((x) => x.a?.discordante)
    .slice(0, 25);
  const conteggioAnalisi = { "P.P.": 0, Nuovo: 0, Dismesso: 0, senza: 0 } as Record<string, number>;
  for (const p of partners) {
    const c = analisiMap.get(p.id)?.calcolato;
    conteggioAnalisi[c ?? "senza"] = (conteggioAnalisi[c ?? "senza"] ?? 0) + 1;
  }

  const campo = (
    valore: number,
    def: number,
    c: { campo: string; etichetta: string; aiuto: string; unita: string }
  ) => (
    <div key={c.campo} className="info-item">
      <div className="k">{c.etichetta}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <input
          type="number"
          name={c.campo}
          defaultValue={valore}
          step="1"
          min="0"
          style={{ width: 110 }}
          aria-label={c.etichetta}
        />
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{c.unita}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>
        {c.aiuto} <em>Default {def} {c.unita}.</em>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Regole degli stati</h1>
          <p className="page-caption">
            Le condizioni con cui l&apos;app classifica i clienti. Si cambiano da qui: valgono subito
            ovunque (elenco partner, scadenzario, scheda cliente e API verso le altre app).
          </p>
        </div>
        <div className="page-actions">
          <Link href="/impostazioni" className="btn secondary">← Impostazioni</Link>
        </div>
      </div>

      {(sp.salvato || sp.ripristinato) && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green">
            <span className="dot" />
            {sp.ripristinato ? "Regole riportate ai valori di default" : "Regole salvate: gli stati sono stati ricalcolati"}
          </span>
        </div>
      )}

      {/* ---------------- Stato finanziario ---------------- */}
      <h2 className="section-title">Stato finanziario (credito)</h2>
      <div className="card">
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14 }}>
          Lo stato lo decide la <strong>fascia di scaduto più vecchia</strong> con un importo sopra la
          soglia di materialità; se non c&apos;è nulla di scaduto conta il <strong>ritardo medio</strong> con
          cui il cliente ha pagato in passato.
        </p>
        <form action={salvaCredito}>
          <div className="info-grid">
            {CAMPI_CREDITO.map((c) =>
              campo(credito[c.campo as keyof RegoleCredito], REGOLE_CREDITO_DEFAULT[c.campo as keyof RegoleCredito], c)
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
            <button className="btn primary" type="submit">Salva regole del credito</button>
            <button className="btn secondary" type="submit" formAction={ripristina.bind(null, "credito")}>
              Ripristina default
            </button>
          </div>
        </form>

        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table>
            <thead>
              <tr>
                <th>Con queste regole, oggi</th>
                <th>Condizione</th>
                <th className="num">Clienti</th>
                <th className="num">Esposizione</th>
                <th className="num">Scaduto</th>
              </tr>
            </thead>
            <tbody>
              {statiOrdinati.map((s) => {
                const v = perStato.get(s)!;
                return (
                  <tr key={s}>
                    <td><span className={`badge ${COLORI_CREDITO[s]}`}><span className="dot" />{ETICHETTE_CREDITO[s]}</span></td>
                    <td className="muted" style={{ fontSize: 13 }}>{condizione(s, credito)}</td>
                    <td className="num">{v.n}</td>
                    <td className="num">{euro(v.esposto)}</td>
                    <td className={`num ${v.scaduto >= 0.01 ? "neg" : ""}`}>{euro(v.scaduto)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- Stato analisi ---------------- */}
      <h2 className="section-title">Stato analisi (P.P. · Nuovo · Dismesso)</h2>
      <div className="card">
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14 }}>
          Oggi questo stato è <strong>scritto a mano</strong> nella scheda partner (campo «Cliente per
          l&apos;anno»). Qui si definiscono le regole con cui l&apos;app lo <strong>ricalcola dai movimenti
          reali</strong> (fatture servizi e vendite vendor): il calcolo non sovrascrive niente, serve a
          vedere dove il dato scritto a mano non torna più.
        </p>
        <form action={salvaAnalisi}>
          <div className="info-grid">
            {CAMPI_ANALISI.map((c) =>
              campo(analisi[c.campo as keyof RegoleAnalisi], REGOLE_ANALISI_DEFAULT[c.campo as keyof RegoleAnalisi], c)
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn primary" type="submit">Salva regole dello stato analisi</button>
            <button className="btn secondary" type="submit" formAction={ripristina.bind(null, "analisi")}>
              Ripristina default
            </button>
          </div>
        </form>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <span className="badge green"><span className="dot" />P.P. calcolati: {conteggioAnalisi["P.P."] ?? 0}</span>
          <span className="badge blue"><span className="dot" />Nuovo: {conteggioAnalisi.Nuovo ?? 0}</span>
          <span className="badge red"><span className="dot" />Dismesso: {conteggioAnalisi.Dismesso ?? 0}</span>
          <span className="badge neutral"><span className="dot" />Senza movimenti: {conteggioAnalisi.senza ?? 0}</span>
        </div>

        {discordanti.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 14 }}>
            Nessuna differenza tra lo stato scritto a mano e quello calcolato con queste regole.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 18, marginBottom: 8 }}>
              <strong>Da rivedere</strong>: qui il campo scritto a mano dice una cosa e i movimenti un&apos;altra.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th><th>Scritto a mano</th><th>Calcolato</th><th>Perché</th>
                  </tr>
                </thead>
                <tbody>
                  {discordanti.map(({ p, a }) => (
                    <tr key={p.id}>
                      <td><Link href={`/partner/${p.id}`} style={{ fontWeight: 500 }}>{p.nome}</Link></td>
                      <td>{p.clienteAnno ?? "—"}</td>
                      <td><span className="badge neutral"><span className="dot" />{a!.calcolato ?? "—"}</span></td>
                      <td className="muted" style={{ fontSize: 13 }}>{a!.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function condizione(s: StatoCredito, r: RegoleCredito): string {
  switch (s) {
    case "nessuna": return `Esposizione sotto ${r.materialita} €`;
    case "regolare": return `Nulla di scaduto e ritardo medio entro ${r.ritardoTollerato} giorni`;
    case "monitorare": return `Scaduto 1-${r.fascia1} gg, oppure ritardo medio oltre ${r.ritardoTollerato} gg`;
    case "ritardo": return `Scaduto ${r.fascia1 + 1}-${r.fascia2} giorni`;
    case "grave": return `Scaduto ${r.fascia2 + 1}-${r.fascia3} giorni`;
    case "insoluto": return `Scaduto oltre ${r.fascia3} giorni`;
  }
}
