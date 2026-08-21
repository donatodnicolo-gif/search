import { etichettaRisposta } from "@/lib/risposta-bisogno";

// **Come il negozio descrive questo prodotto.**
//
// Sono i metafield di Shopify: l'anagrafica merceologica vera — di che materia è
// fatto, che forma ha, chi lo produce, quando si consegna. Non è roba nostra e
// non si modifica da qui: l'import la rilegge a ogni giro e la riscriverebbe.
// Per questo il riquadro è in **sola lettura** e lo dice.
//
// Si mostrano **solo le voci che hanno un valore**, e in fondo si dichiara
// quante mancano: con quindici righe di «—» il riquadro sarebbe illeggibile
// proprio sui prodotti che hanno poco, e il buco non si vedrebbe comunque
// meglio. Chi manca è nominato, non nascosto.

export type CampiNegozio = {
  tipoShopify: string | null;
  vendorShopify: string | null;
  categoriaShopifyNome: string | null;
  tagShopify: string | null;
  modelloShopify: string | null;
  fioriShopify: string | null;
  coloreFioriShopify: string | null;
  gustiShopify: string | null;
  dolciShopify: string | null;
  daChiFattoShopify: string | null;
  claimShopify: string | null;
  occasioniShopify: string | null;
  tipologiaShopify: string | null;
  classificazioneShopify: string | null;
  dataShopify: string | null;
  orarioShopify: string | null;
  zoneConsegna: string | null;
  cittaShopify: string | null;
  ggDispMin: number | null;
  minimoOrario: number | null;
  bestSellerShopify: boolean | null;
  pezzoUnicoShopify: boolean | null;
  nonFisicoShopify: boolean | null;
  partnerIdShopify: string | null;
  partnerIndirizzoShopify: string | null;
  statoShopify: string | null;
};

/** Un valore a lista («Rose, Dalie») diventa una riga di pillole. */
function Pillole({ valore }: { valore: string }) {
  const voci = valore.split(",").map((v) => v.trim()).filter(Boolean);
  return (
    <span className="pill-valori">
      {voci.map((v) => (
        <span key={v} className="pill-valore">{v}</span>
      ))}
    </span>
  );
}

export function DalNegozio({ p }: { p: CampiNegozio }) {
  const siNo = (v: boolean | null) => (v == null ? null : v ? "Sì" : "No");

  // Ogni voce: etichetta, valore, e da quale metafield viene — il nome tecnico
  // serve a chi deve andarlo a correggere sull'admin di Shopify.
  const voci: { etichetta: string; valore: string | null; da: string; lista?: boolean }[] = [
    { etichetta: "Tipo", valore: p.tipoShopify, da: "Tipo di prodotto" },
    { etichetta: "Venditore", valore: p.vendorShopify, da: "Venditore" },
    { etichetta: "Categoria del negozio", valore: p.categoriaShopifyNome, da: "tassonomia Shopify" },
    { etichetta: "Modello", valore: p.modelloShopify, da: "custom.modello / modelli", lista: true },
    { etichetta: "Fiori", valore: p.fioriShopify, da: "custom.fiori", lista: true },
    { etichetta: "Colore", valore: p.coloreFioriShopify, da: "custom.colore_fiori", lista: true },
    { etichetta: "Gusti", valore: p.gustiShopify, da: "custom.gusti", lista: true },
    { etichetta: "Dolci", valore: p.dolciShopify, da: "custom.dolci", lista: true },
    { etichetta: "Occasioni", valore: p.occasioniShopify, da: "custom.occasioni", lista: true },
    { etichetta: "Classificazione", valore: p.classificazioneShopify, da: "custom.classificazione", lista: true },
    { etichetta: "Tipologia", valore: p.tipologiaShopify, da: "custom.tipologia", lista: true },
    { etichetta: "Chi lo fa", valore: p.daChiFattoShopify, da: "custom.da_chi_fatto" },
    { etichetta: "Claim", valore: p.claimShopify, da: "custom.descrizione_cattura_vendite" },
    {
      etichetta: "Giorni per consegnare",
      valore: p.ggDispMin == null ? null : `${p.ggDispMin} — ${etichettaRisposta(p.ggDispMin)}`,
      da: "prodotto.consegna",
    },
    { etichetta: "Consegna dalle", valore: p.minimoOrario == null ? null : `${p.minimoOrario}:00`, da: "custom.minimo_orario" },
    { etichetta: "Giorni di consegna", valore: p.dataShopify, da: "custom.data", lista: true },
    { etichetta: "Fasce orarie", valore: p.orarioShopify, da: "custom.orario_consegna", lista: true },
    { etichetta: "Città", valore: p.cittaShopify, da: "custom.citta", lista: true },
    { etichetta: "Zone di consegna", valore: p.zoneConsegna, da: "custom.nations_availability", lista: true },
    { etichetta: "Best seller sul sito", valore: siNo(p.bestSellerShopify), da: "custom.best_seller" },
    { etichetta: "Pezzo unico", valore: siNo(p.pezzoUnicoShopify), da: "custom.is_unique" },
    { etichetta: "Non fisico", valore: siNo(p.nonFisicoShopify), da: "custom.not_physical" },
    { etichetta: "Tag", valore: p.tagShopify, da: "Tag", lista: true },
  ];

  const piene = voci.filter((v) => v.valore != null && v.valore !== "");
  const vuote = voci.filter((v) => v.valore == null || v.valore === "");
  const partner = p.partnerIdShopify || p.partnerIndirizzoShopify;

  // Mai riconosciuto sul negozio: è un'informazione diversa da «il negozio non
  // ha compilato niente», e va detta diversamente.
  if (piene.length === 0 && !partner && !p.statoShopify) {
    return (
      <details className="scheda">
        <summary className="scheda-titolo">
          Come lo descrive il negozio
          <span className="scheda-stato">mai riconosciuto su Shopify</span>
        </summary>
        <p className="page-sub" style={{ marginBottom: 0 }}>
          Questa scheda non risulta collegata a nessun prodotto dei negozi: non ha stato, né tipo, né
          metafield. È il caso delle schede nate dal venduto o dai dati dimostrativi. Si collega
          rilanciando l&apos;import delle collezioni da <b>Collezioni</b>, che riaggancia per SKU o
          per id Shopify.
        </p>
      </details>
    );
  }

  return (
    <details className="scheda" open>
      <summary className="scheda-titolo">
        Come lo descrive il negozio
        <span className="scheda-stato">{piene.length} campi su {voci.length}</span>
      </summary>

      <p className="page-sub" style={{ marginTop: 0 }}>
        I <b>metafield di Shopify</b>: si leggono a ogni import e <b>non si modificano da qui</b> —
        il negozio è la fonte, e riscriverli in app durerebbe fino al giro successivo. Fra parentesi
        il nome tecnico, per ritrovarli nell&apos;admin.
      </p>

      <dl className="dati-negozio">
        {piene.map((v) => (
          <div key={v.etichetta}>
            <dt>
              {v.etichetta}
              <span className="dato-da">{v.da}</span>
            </dt>
            <dd>{v.lista ? <Pillole valore={v.valore as string} /> : v.valore}</dd>
          </div>
        ))}
      </dl>

      {/* **Chi lo produce, secondo il negozio.** Sta a parte perché non è una
          caratteristica del prodotto ma un collegamento a un'altra anagrafica —
          ed è il dato che qui manca di più (1.377 schede senza fornitore). */}
      {partner && (
        <div className="nota-info" style={{ marginTop: 14, marginBottom: 0 }}>
          <span className="nota-icona">◆</span>
          <span>
            <b>Lo produce il partner {p.partnerIdShopify ?? "(senza id)"}</b>
            {p.partnerIndirizzoShopify ? ` — ${p.partnerIndirizzoShopify}` : ""}. È il partner della
            piattaforma consegne, scritto sul negozio. Resta <b>separato dal fornitore</b> deciso qui
            dentro: finché nessuno li ha confrontati, sovrapporli sarebbe una deduzione.
          </span>
        </div>
      )}

      {vuote.length > 0 && (
        <p className="page-sub" style={{ marginTop: 12, marginBottom: 0 }}>
          Non compilati sul negozio: {vuote.map((v) => v.etichetta.toLowerCase()).join(", ")}.
        </p>
      )}
    </details>
  );
}
