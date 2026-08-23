// I **costi di struttura** presi dal consuntivo, con la media dei mesi chiusi
// estesa a quelli che restano (richiesta dell'utente, 23/08/2026: «costi di
// struttura prendi il consuntivo ed estendi la media ai restanti mesi»).
//
// ---- Perché non bastava il budget ----
//
// A budget i costi di struttura valevano **0 €**: c'era una sola riga di
// configurazione, «Costi di struttura mensili», ferma a zero. Il P&L quindi non
// li contava affatto, e un EBITDA senza affitti, software e servizi è un numero
// che si legge volentieri e non vuol dire niente. Il consuntivo invece li ha:
// **62.375 € da gennaio a luglio**, cioè 8.911 € al mese.
//
// ---- La regola ----
//
//   mesi chiusi   → quello che è **davvero uscito** dalla banca
//   mesi restanti → la **media** dei mesi chiusi
//
// ⚠️ Il **mese in corso non è un mese chiuso** e non entra nella media: ad
// agosto la banca ne ha registrati 1.363 € contro una media di 8.911, non
// perché la struttura sia costata meno ma perché il mese non è finito — e
// l'archivio di Finance di agosto è per conto suo incompleto. Un mese a un
// sesto dentro una media di sette la abbassa del 12% senza che si veda.
//
// ⚠️ Un mese chiuso con **zero movimenti** resta nella media a zero: è raro ma
// possibile, e sostituirlo con la media sarebbe inventare. Se succede, il conto
// lo dice contando i mesi usati.

import { caricaCategorie, ricostruisci } from "./cfo";
import { fetchSpeseBanca } from "./finance";
import { primoMeseAperto } from "./periodo";

export type StrutturaConsuntivo = {
  // Quanto è uscito ogni mese (1..12), zero dove non è ancora uscito niente.
  perMese: number[];
  // Quanti mesi chiusi hanno alimentato la media, e quali.
  mesiChiusi: number[];
  // La media mensile dei mesi chiusi: è quella che si estende in avanti.
  media: number;
  // Il totale dell'anno con la regola: chiusi veri + media sul resto.
  anno: number;
  // Quanto di quel totale è già uscito e quanto è una proiezione. Sono due cose
  // diverse e la pagina deve poterle dire separate.
  uscito: number;
  proiettato: number;
};

// Il valore del mese secondo la regola: vero dove il mese è chiuso, media dove
// non lo è ancora. Sta qui e non nelle pagine perché il P&L annuale e quello
// mensile devono dare lo stesso numero.
export function strutturaDelMese(s: StrutturaConsuntivo, month: number): number {
  return s.mesiChiusi.includes(month) ? s.perMese[month - 1] ?? 0 : s.media;
}

export async function caricaStruttura(year: number): Promise<StrutturaConsuntivo | null> {
  const aperto = primoMeseAperto(year);
  // Un anno che non è ancora cominciato non ha mesi chiusi: senza nemmeno un
  // mese vero non c'è una media da estendere, e restituire zero verrebbe letto
  // come «la struttura non costa niente».
  if (aperto <= 1) return null;

  const [categorie, spese] = await Promise.all([caricaCategorie(), fetchSpeseBanca({ anno: year, dal: 1, al: 12 })]);
  if (!spese.ok) return null;

  const perMese = Array(12).fill(0) as number[];
  for (const r of ricostruisci(spese.dati.controparti, categorie)) {
    if (r.categoria?.tipoPL !== "STRUTTURA") continue;
    for (let i = 0; i < 12; i++) perMese[i] += r.perMese[i] ?? 0;
  }

  const mesiChiusi = Array.from({ length: Math.min(aperto - 1, 12) }, (_, i) => i + 1);
  const uscito = mesiChiusi.reduce((s, m) => s + perMese[m - 1], 0);
  const media = mesiChiusi.length > 0 ? uscito / mesiChiusi.length : 0;
  const restanti = 12 - mesiChiusi.length;
  const proiettato = media * restanti;

  return { perMese, mesiChiusi, media, anno: uscito + proiettato, uscito, proiettato };
}
