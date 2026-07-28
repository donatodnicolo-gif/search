import { Sidebar } from "@/components/Sidebar";
import { TabellaGruppi } from "@/components/TabellaGruppi";
import { salvaFasciaAzione, eliminaFasciaAzione } from "@/lib/azioni-fasce";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { euro } from "@/lib/dominio";
import { confini, elencoFasce, problemi } from "@/lib/fasce";
import { calcolaGruppi, type Gruppo } from "@/lib/gruppi";

export const dynamic = "force-dynamic";

// Le fasce di prezzo: gli scalini in cui si legge il catalogo.
//
// La fascia di un prodotto **non si assegna a mano**: è quella in cui cade il
// suo prezzo. Qui si decidono i confini — che è la scelta commerciale vera — e
// si vede subito come si spartiscono prodotti e venduto.
export default async function FascePage({
  searchParams,
}: {
  searchParams: Promise<{ ordina?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();
  // Di norma la scala si legge dal prezzo più basso al più alto: è una scala.
  const ordina = sp.ordina ?? "nome";

  const where = { ...filtroProdotti(brand) } as Record<string, unknown>;
  const [gruppi, fasce] = await Promise.all([
    calcolaGruppi({ where, brand, per: "fascia", ordina }),
    elencoFasce(),
  ]);

  const prodottiTotali = gruppi.reduce((s, g) => s + g.prodotti, 0);
  const ricavoTotale = gruppi.reduce((s, g) => s + g.ricavo, 0);
  const senzaPrezzo = gruppi.find((g) => g.etichetta.startsWith("—"));
  const avvisi = problemi(fasce);

  const link = (o: string) => (o === "nome" ? "/fasce" : `/fasce?ordina=${o}`);
  const linkGruppo = (g: Gruppo) => `/anagrafica?${new URLSearchParams(g.filtro).toString()}`;

  return (
    <div className="layout">
      <Sidebar attiva="fasce" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Fasce di prezzo{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Gli scalini di prezzo del catalogo. La fascia di un prodotto è quella in cui <strong>cade il suo
              prezzo</strong>: non si assegna a mano, e se il prezzo cambia la fascia lo segue da sola. Qui si
              decidono i confini.
            </p>
          </div>
        </div>

        {sp.errore && <div className="avviso avviso-errore">{sp.errore}</div>}
        {avvisi.length > 0 && (
          <div className="avviso avviso-attenzione">
            {avvisi.map((a) => (
              <div key={a}>{a}</div>
            ))}
          </div>
        )}

        <p className="page-sub" style={{ margin: "0 0 12px" }}>
          {fasce.length} fasce · {prodottiTotali} prodotti · venduto 90gg {euro(ricavoTotale)}
          {senzaPrezzo ? (
            <>
              {" "}
              · <strong>{senzaPrezzo.prodotti}</strong> senza prezzo: non sono economici, non hanno prezzo
            </>
          ) : null}
        </p>

        {gruppi.length === 0 ? (
          <div className="vuoto">Nessun prodotto in questo ambito.</div>
        ) : (
          <TabellaGruppi
            gruppi={gruppi}
            titoloColonna="Fascia"
            ordina={ordina}
            linkOrdine={link}
            linkGruppo={linkGruppo}
          />
        )}

        <h2 className="sezione-titolo" style={{ marginTop: 28 }}>
          I confini
        </h2>
        <p className="page-sub" style={{ margin: "0 0 12px" }}>
          Il primo estremo è compreso, il secondo escluso: così un prodotto da 49,90 € non cade nel buco fra due
          fasce. Lasciare vuoto il «fino a» dell&apos;ultima vuol dire «da qui in su».
        </p>
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th className="num">Da (compreso)</th>
                <th className="num">Fino a (escluso)</th>
                <th style={{ minWidth: 320 }}>A chi parla — lo legge anche l&apos;AI</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fasce.map((f) => (
                <tr key={f.id}>
                  <td>
                    <form action={salvaFasciaAzione.bind(null, f.id)} className="riga-classifica" id={`f-${f.id}`}>
                      <input name="nome" defaultValue={f.nome} aria-label={`Nome di ${f.nome}`} />
                    </form>
                  </td>
                  <td className="num">
                    <input form={`f-${f.id}`} name="da" type="number" step="1" defaultValue={f.da} style={{ width: 90 }} />
                  </td>
                  <td className="num">
                    <input
                      form={`f-${f.id}`}
                      name="a"
                      type="number"
                      step="1"
                      defaultValue={f.a ?? ""}
                      placeholder="∞"
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>
                    <textarea form={`f-${f.id}`} name="descrizione" rows={2} defaultValue={f.descrizione ?? ""} />
                  </td>
                  <td>
                    <button form={`f-${f.id}`} className="btn small" type="submit">
                      Salva
                    </button>
                    <form action={eliminaFasciaAzione.bind(null, f.id)} style={{ marginTop: 6 }}>
                      <button className="btn small btn-secondario" type="submit" title={`Elimina ${confini(f)}`}>
                        Elimina
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <form action={salvaFasciaAzione.bind(null, null)} className="riga-classifica" id="f-nuova">
                    <input name="nome" placeholder="Nuova fascia…" aria-label="Nome della nuova fascia" />
                  </form>
                </td>
                <td className="num">
                  <input form="f-nuova" name="da" type="number" step="1" defaultValue={0} style={{ width: 90 }} />
                </td>
                <td className="num">
                  <input form="f-nuova" name="a" type="number" step="1" placeholder="∞" style={{ width: 90 }} />
                </td>
                <td>
                  <textarea form="f-nuova" name="descrizione" rows={2} placeholder="A chi parla questa fascia…" />
                </td>
                <td>
                  <button form="f-nuova" className="btn small" type="submit">
                    Aggiungi
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
