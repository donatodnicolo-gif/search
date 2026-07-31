// **Il consuntivo dei mesi già chiusi cambia con l'ambito della proposta.**
//
// In `/proposte/nuova` i mesi passati non si propongono: si leggono. Ma fino al
// 30/07/2026 il numero letto era **sempre quello aziendale**, anche su una
// proposta di maison o di linea — cioè a un responsabile di Deluxyflowers
// veniva mostrato il fatturato di tutta Deluxy come se fosse il suo. Un numero
// giusto nel posto sbagliato è peggio di un numero mancante: quello mancante si
// va a cercare, quello sbagliato si usa.
//
// Le tre risposte non sono la stessa cosa perché **le fonti non sanno le stesse
// cose**:
//
//  - **azienda**: i ricavi reali del Consuntivo (fatturato Finance + ricavo
//    dell'ecommerce). È l'unica lettura completa che esiste;
//  - **maison**: solo il **venduto ecommerce** di quella maison, dal registro
//    ordini. Il fatturato di Finance è per *tipologia di servizio* (consegne,
//    eventi, B2B) e non per maison: ripartirlo vorrebbe dire inventare una
//    chiave di riparto. Quindi qui si dichiara che è **solo ecommerce**, invece
//    di far credere che sia tutto;
//  - **linea commerciale**: **niente**, e si scrive perché. Né Finance né Orders
//    sanno a quale linea appartiene una vendita.
//
// I mesi chiusi restano **bloccati anche dove il consuntivo non c'è**: sono
// passati comunque, e il motivo per cui non si propongono non era «tanto c'è il
// consuntivo», era che proporre un mese già successo scrive un numero che non
// conta niente.

import type { DatiAnno } from "./calc";
import { caricaConsuntivo } from "./consuntivo";
import { caricaVenduto } from "./venduto";

export type ConsuntivoAmbito = {
  // Dodici caselle, indice 0 = gennaio. `null` nella casella = mese non chiuso.
  // `null` al posto dell'array = per questo ambito un consuntivo non esiste.
  mesi: (number | null)[] | null;
  // Che cosa sono quei numeri, in due parole (etichetta accanto al mese).
  etichetta: string;
  // La riga che spiega cosa si sta guardando, o perché non c'è niente da
  // guardare. Non è decorazione: è quello che impedisce di leggere il venduto
  // di una maison come se fosse il suo fatturato.
  nota: string;
};

// Chiave = il valore della tendina dell'ambito: "GLOBALE", "MAISON:slug",
// "LINEA:slug".
export type ConsuntivoAmbiti = Record<string, ConsuntivoAmbito>;

export async function consuntivoPerAmbito(
  dati: DatiAnno,
  mesiChiusi: number[],
  linee: { slug: string; nome: string }[]
): Promise<ConsuntivoAmbiti> {
  const ambiti: ConsuntivoAmbiti = {};

  // Le linee non dipendono da nessuna fonte: la risposta è sempre la stessa.
  for (const l of linee) {
    ambiti[`LINEA:${l.slug}`] = {
      mesi: null,
      etichetta: "",
      nota:
        "Per le linee commerciali non esiste un consuntivo: né il fatturato di Finance né il registro ordini dicono a quale linea appartiene una vendita. I mesi già chiusi restano bloccati — sono passati — ma non c'è un numero vero da mostrare al posto della proposta.",
    };
  }

  if (mesiChiusi.length === 0) {
    ambiti.GLOBALE = {
      mesi: null,
      etichetta: "",
      nota: "Nessun mese ancora chiuso in questo anno: tutti i mesi sono da proporre.",
    };
    for (const m of dati.maisons) {
      ambiti[`MAISON:${m.slug}`] = { ...ambiti.GLOBALE };
    }
    return ambiti;
  }

  // Le due letture in parallelo. Costano una sola chiamata a Orders in più di
  // prima: `caricaConsuntivo` chiede già lo stesso `/api/v1/ricavi` dello stesso
  // anno, quindi la seconda cade nella cache di 60 secondi.
  const [cons, vend] = await Promise.all([
    caricaConsuntivo(dati, mesiChiusi),
    caricaVenduto(dati.year, dati.maisons),
  ]);

  const soloChiusi = (mesi: number[]): (number | null)[] => {
    const out = Array(12).fill(null) as (number | null)[];
    for (const m of mesiChiusi) out[m - 1] = mesi[m - 1] ?? 0;
    return out;
  };

  // ---- Azienda ----
  const aziendale = Array(12).fill(0) as number[];
  for (const r of cons.perMese) aziendale[r.month - 1] = r.ricavi;
  ambiti.GLOBALE = cons.ok
    ? {
        mesi: soloChiusi(aziendale),
        etichetta: "consuntivo",
        nota:
          "Ricavi reali di tutta l'azienda: fatturato di Finance più il ricavo dell'ecommerce, la stessa fonte del Consuntivo — così il numero che si legge qui è quello che legge l'amministratore là.",
      }
    : {
        mesi: null,
        etichetta: "",
        // Zero non è «nessun ricavo»: qui vorrebbe dire «non abbiamo chiesto a
        // nessuno». I mesi restano bloccati lo stesso, perché sono passati.
        nota: `Consuntivo non disponibile: manca ${cons.mancanti.join(", ") || "la risposta delle altre app"}. I mesi già chiusi restano bloccati, ma senza il numero vero.`,
      };

  // ---- Maison: solo ecommerce ----
  for (const m of dati.maisons) {
    const chiave = `MAISON:${m.slug}`;
    if (!vend.ok) {
      ambiti[chiave] = {
        mesi: null,
        etichetta: "",
        nota: `Venduto ecommerce non disponibile: ${vend.errore || "il registro ordini non ha risposto."} I mesi chiusi restano bloccati, ma senza il numero vero.`,
      };
      continue;
    }
    const mesi = vend.perMaison.get(m.slug);
    if (!mesi) {
      ambiti[chiave] = {
        mesi: null,
        etichetta: "",
        nota: `Nessun negozio ecommerce abbinato a ${m.nome}: l'unico consuntivo che esiste per maison è il venduto dei negozi Shopify, e questa maison non ne ha uno. Il fatturato di Finance è per tipologia di servizio, non per maison, quindi non c'è altro da leggere.`,
      };
      continue;
    }
    ambiti[chiave] = {
      mesi: soloChiusi(mesi),
      etichetta: "venduto ecommerce",
      nota: `Solo il venduto ecommerce di ${m.nome}, dal registro ordini — prezzo pieno pagato dal cliente, IVA e spedizione incluse, la stessa base su cui è scritto il budget D2C. Non è il fatturato della maison: quello di Finance è per tipologia di servizio (consegne, eventi, B2B) e non si può ripartire per maison senza inventare una chiave di riparto. Eventi e B2B di questa maison quindi qui non ci sono.`,
    };
  }

  return ambiti;
}
