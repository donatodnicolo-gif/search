import { Sidebar } from "@/components/Sidebar";
import { lanciaCampagna } from "@/lib/azioni";
import { BRANDS, ETICHETTA_BRAND } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Lancio di una campagna NUOVA su Google Ads, tutto dall'app.
// Il percorso è quello sicuro: qui si prepara, in /operazioni si approva, lo
// script la crea via bulk upload e la campagna nasce IN PAUSA — si accende a
// mano in interfaccia solo dopo la checklist 4.1. Il copy passa dal lint
// 7.2/7.3 prima ancora di entrare in coda.
export default async function LanciaCampagna({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="layout">
      <Sidebar attiva="campagne" />
      <main className="main">
        <a className="ritorno" href="/campagne">← Campagne</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Lancia una campagna su Google Ads</h1>
            <p className="page-sub">
              Si prepara qui, si approva in Operazioni, la crea lo script — e nasce <b>in pausa</b>:
              l&apos;accensione resta un gesto manuale dopo la checklist 4.1 (mai lanciare al buio).
            </p>
          </div>
        </div>

        {sp.errore && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
            <span><b>Non accodata:</b> {sp.errore}</span>
          </div>
        )}

        <section className="scheda">
          <div className="scheda-titolo">La campagna</div>
          <form className="modulo" action={lanciaCampagna}>
            <div className="campo-modulo largo">
              <label>Nome <span className="obbligatorio">*</span></label>
              <input name="nome" required placeholder='es. [Deluxy] Fiori Napoli' />
            </div>
            <div className="campo-modulo">
              <label>Brand <span className="obbligatorio">*</span></label>
              <select name="brand" defaultValue="gifts">
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Budget €/giorno <span className="obbligatorio">*</span></label>
              <input name="budget" type="number" step="0.5" min="1" required placeholder="15" />
            </div>
            <div className="campo-modulo">
              <label>Obiettivo</label>
              <input name="obiettivo" placeholder="es. vendite fiori Napoli" />
            </div>
            <div className="campo-modulo">
              <label>Gruppo di annunci</label>
              <input name="gruppo" placeholder="Gruppo 1" />
            </div>

            <div className="campo-modulo largo">
              <label>Keyword — una per riga, con corrispondenza dopo la barra (broad se omessa)</label>
              <textarea
                name="keywords"
                rows={6}
                placeholder={"consegna fiori napoli | phrase\nfiorista napoli domicilio | exact\nfiori a domicilio napoli"}
              />
            </div>

            <div className="campo-modulo largo">
              <label>Titoli RSA — uno per riga, max 30 caratteri (min 3, meglio 8-10)</label>
              <textarea
                name="titoli"
                rows={6}
                placeholder={"Fiori a Napoli in Giornata\nConsegna in Guanti Bianchi\nBouquet dell'Atelier Deluxy"}
              />
            </div>
            <div className="campo-modulo largo">
              <label>Descrizioni RSA — una per riga, max 90 caratteri (min 2)</label>
              <textarea
                name="descrizioni"
                rows={4}
                placeholder={"Composizioni dell'atelier consegnate con cura, anche in giornata. Ordina entro le 20."}
              />
            </div>
            <div className="campo-modulo largo">
              <label>URL finale (obbligatoria se metti i titoli)</label>
              <input name="finalUrl" placeholder="https://deluxyflowers.com/collections/napoli" />
            </div>
            <div className="campo-modulo largo">
              <label>Perché questa campagna</label>
              <input name="motivo" placeholder="La baseline e il motivo restano nello storico (doc 10 §1)" />
            </div>

            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Metti in coda per l&apos;approvazione</button>
            </div>
          </form>
        </section>

        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Il copy viene controllato col lint dei documenti 7.2/7.3 <b>prima</b> di entrare in coda:
            parole vietate per il brand (es. «gratis» fuori Flowers, «last minute», sconti urlati)
            bloccano l&apos;accodamento con il suggerimento di sostituzione. Il tono è il maggiordomo
            dell&apos;emozione: l&apos;urgenza è affidabilità del servizio, non corsa.
          </span>
        </div>
      </main>
    </div>
  );
}
