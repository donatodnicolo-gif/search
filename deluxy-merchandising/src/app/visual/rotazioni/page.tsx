import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { FREQUENZE, MAX_OGNI_QUANTI, MODI, etichettaFrequenza, etichettaModo, eScaduta, prossimaVolta } from "@/lib/rotazione";
import { TabsVetrina } from "@/components/TabsVetrina";
import {
  aggiornaRotazione,
  assegnaCollezioniARotazione,
  creaRotazione,
  eliminaRotazione,
  eseguiRotazioneAdesso,
} from "@/lib/azioni-rotazione";

export const dynamic = "force-dynamic";

// Le **rotazioni periodiche**: ogni quanto l'ordine delle collezioni iscritte si
// rifà da solo. Una regola vale per più collezioni: si decide il ritmo una volta.
export default async function RotazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string }>;
}) {
  const sp = await searchParams;
  const [regole, pubblicate, cronAttivo] = await Promise.all([
    prisma.regolaRotazione.findMany({
      orderBy: { nome: "asc" },
      include: { collezioni: { select: { id: true, titolo: true, negozio: true, tipo: true } } },
    }),
    prisma.collezioneShopify.findMany({
      where: { pubblicataShopify: true },
      orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
      select: { id: true, titolo: true, negozio: true, rotazioneId: true },
    }),
    Promise.resolve(Boolean(process.env.CRON_SECRET)),
  ]);

  const dataIt = (d: Date | null) =>
    d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Rome" }) : "mai";

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 1000 }}>
        <TabsVetrina attiva="rotazioni" />
        <div className="page-head">
          <div>
            <h1 className="page-title">Rotazioni periodiche</h1>
            <p className="page-sub">
              Ogni quanto l&apos;ordine si rifà da solo: una vetrina identica per settimane smette di essere guardata.
              Una regola vale per <b>più collezioni</b> — decidi il ritmo una volta.
            </p>
          </div>
        </div>

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        {!cronAttivo && (
          <div className="nota-info">
            <span className="nota-icona">△</span>
            <span>
              <b>Il giro automatico non è attivo</b>: manca <code>CRON_SECRET</code> sul progetto Vercel. Le regole si
              salvano e si possono lanciare a mano con «Esegui adesso», ma non scattano da sole finché quella variabile
              non c&apos;è.
            </span>
          </div>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Nuova rotazione</div>
          <form action={creaRotazione} className="modulo" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <div className="campo-modulo">
              <label>Nome <span className="obbligatorio">*</span></label>
              <input name="nome" required placeholder="Vetrine settimanali" />
            </div>
            {/* **Ogni quante unità.** Con le sole tre frequenze fisse non si
                poteva dire «ogni dieci giorni», e il ritmo di una vetrina non è
                sempre uno dei tre (chiesto dall'utente). */}
            <div className="campo-modulo">
              <label>Ogni quanto</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input name="ogniQuanti" type="number" min={1} max={MAX_OGNI_QUANTI} step={1} defaultValue={1} style={{ width: 72 }} />
                <select name="frequenza" defaultValue="settimanale" style={{ flex: 1 }}>
                  {FREQUENZE.map((f) => (
                    <option key={f.chiave} value={f.chiave}>{f.tanti}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="campo-modulo">
              <label>Cosa fa</label>
              <select name="modo" defaultValue="rinfresca">
                {MODI.map((m) => (
                  <option key={m.chiave} value={m.chiave}>{m.nome}</option>
                ))}
              </select>
            </div>
            {/* **Il numero non spiegava sé stesso** (segnalato dall'utente:
                «non capisco il numero a cosa serve»): dice quanti prodotti
                passano in fondo a ogni giro, e serve solo al modo «Ruota». */}
            <div className="campo-modulo">
              <label>Quanti ne manda in fondo</label>
              <input name="passo" type="number" min={1} step={1} defaultValue={1} />
              <div className="cella-sub">A ogni giro, solo per «Ruota le posizioni». Con 1 scala di uno per volta.</div>
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn">Crea rotazione</button>
              <span className="page-sub" style={{ margin: 0 }}>
                {MODI.map((m) => `${m.nome}: ${m.spiega}`).join(" · ")}
              </span>
            </div>
          </form>
        </div>

        {regole.length === 0 ? (
          <div className="vuoto-mini">Nessuna rotazione ancora. Creane una qui sopra.</div>
        ) : (
          regole.map((r) => (
            <div className="scheda" key={r.id}>
              <div
                className="scheda-titolo"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}
              >
                <span>{r.nome}</span>
                <span className="page-sub" style={{ margin: 0 }}>
                  {etichettaFrequenza(r.frequenza, r.ogniQuanti)} · {etichettaModo(r.modo)}
                  {r.modo === "ruota" ? ` (${r.passo} in fondo per volta)` : ""} · {r.collezioni.length} collezioni
                </span>
              </div>

              <p className="page-sub" style={{ marginTop: 0 }}>
                Ultima volta: <b>{dataIt(r.ultimaEsecuzioneIl)}</b>
                {r.attiva && (
                  <>
                    {" "}· prossima: <b>{eScaduta(r) ? "al prossimo giro" : dataIt(prossimaVolta(r))}</b>
                  </>
                )}
                {!r.attiva && " · in pausa"}
                {r.ultimoEsito && <> · esito: {r.ultimoEsito}</>}
              </p>

              <form action={aggiornaRotazione.bind(null, r.id)} className="modulo" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr", marginBottom: 10 }}>
                <div className="campo-modulo">
                  <label>Nome</label>
                  <input name="nome" defaultValue={r.nome} />
                </div>
                <div className="campo-modulo">
                  <label>Ogni quanto</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input name="ogniQuanti" type="number" min={1} max={MAX_OGNI_QUANTI} step={1} defaultValue={r.ogniQuanti} style={{ width: 72 }} />
                    <select name="frequenza" defaultValue={r.frequenza} style={{ flex: 1 }}>
                      {FREQUENZE.map((f) => (
                        <option key={f.chiave} value={f.chiave}>{f.tanti}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="campo-modulo">
                  <label>Cosa fa</label>
                  <select name="modo" defaultValue={r.modo}>
                    {MODI.map((m) => (
                      <option key={m.chiave} value={m.chiave}>{m.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo-modulo">
                  <label>Quanti ne manda in fondo</label>
                  <input name="passo" type="number" min={1} step={1} defaultValue={r.passo} />
                  <div className="cella-sub">A ogni giro, solo per «Ruota le posizioni».</div>
                </div>
                <div className="campo-modulo" style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" name="attiva" defaultChecked={r.attiva} /> Attiva
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                    <input type="checkbox" name="spingiSuShopify" defaultChecked={r.spingiSuShopify} /> Manda
                    l&apos;ordine <b>anche a Shopify</b> a ogni giro
                  </label>
                  <span className="page-sub" style={{ margin: "4px 0 0", fontSize: 12 }}>
                    Senza la spunta l&apos;ordine si rifà qui e la collezione resta segnata «da sincronizzare»: scrivere
                    da soli sul negozio vero è una decisione da prendere apposta. Vale solo per le collezioni manuali.
                  </span>
                </div>
                <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="btn btn-secondario">Salva</button>
                </div>
              </form>

              <div style={{ display: "grid", gap: 8 }}>
                <label className="page-sub" style={{ margin: 0 }}>
                  Collezioni che ruotano con questa regola (Ctrl/Cmd per più d&apos;una; togliendole dalla selezione
                  escono)
                </label>
                <form action={assegnaCollezioniARotazione} style={{ display: "grid", gap: 8, maxWidth: 560 }}>
                  <input type="hidden" name="rotazioneId" value={r.id} />
                  <select
                    multiple
                    name="collezioni"
                    size={6}
                    defaultValue={r.collezioni.map((c) => c.id)}
                    style={{ font: "inherit", padding: 8, borderRadius: "var(--radius-m)", background: "var(--fill)", border: "1px solid transparent" }}
                  >
                    {pubblicate.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titolo} ({c.negozio})
                        {c.rotazioneId && c.rotazioneId !== r.id ? " · già in un'altra rotazione" : ""}
                      </option>
                    ))}
                  </select>
                  <div>
                    <button type="submit" className="btn" disabled={pubblicate.length === 0}>
                      Salva le collezioni
                    </button>
                  </div>
                </form>
                <div style={{ display: "flex", gap: 8 }}>
                  <form action={eseguiRotazioneAdesso.bind(null, r.id)}>
                    <button type="submit" className="btn btn-secondario" disabled={r.collezioni.length === 0}>
                      Esegui adesso
                    </button>
                  </form>
                  <form action={eliminaRotazione.bind(null, r.id)}>
                    <button type="submit" className="btn btn-secondario">Elimina</button>
                  </form>
                </div>
              </div>
            </div>
          ))
        )}

        <p className="page-sub">
          Il giro automatico parte una volta al giorno e fa scattare <b>solo le regole scadute</b>: giornaliera,
          settimanale e mensile convivono con un cron solo. Se un giorno salta, quello dopo recupera.{" "}
          <Link href="/visual">Torna alle collezioni</Link>.
        </p>
      </main>
    </div>
  );
}
