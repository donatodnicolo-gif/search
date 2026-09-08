// La **tipologia di risposta al bisogno** di un prodotto: quanto in fretta
// l'azienda sa rispondere a chi lo ordina. Non è un dato nuovo da mantenere a
// mano — si ricava dai **giorni minimi di evasione** (`gg_disp_min`, il metafield
// Shopify `prodotto.consegna`): un numero che chi cura il negozio già tiene
// aggiornato. Così la lente è sempre allineata al negozio, senza una seconda
// verità da curare.
//
// La scala l'ha decisa l'utente:
//   0        → Urgenze      (pronto, si consegna anche adesso)
//   1        → Da domani    (un giorno di preparazione)
//   2–3      → Pianificato  (qualche giorno, va programmato)
//   4–10     → Su misura    (si fa apposta, richiede tempo)
//   > 10     → Su misura    (idem, tempi lunghi)
//   null     → non indicato (nessun gg_disp_min: non si deduce)
// ⚠️ 08/09/2026 — i colori qui erano quattro hex scritti a mano, fra cui l'oro.
// Il Libro §5 dice due cose che qui erano violate: **l'oro non è mai uno stato**,
// e una **classificazione** (questa lo è: dice quanto ci vuole a preparare il
// prodotto, non a che punto è una pratica) si rende **neutra** finché il design
// system non ha una palette categoriale. In più gli hex erano *quasi* i token
// (#2E7D32 contro --green #248A3D): deriva silenziosa della palette.
// Effetto pratico: «Da domani» in oro accanto a «Pubblico» si leggeva come una
// finestra di pubblicazione — è successo davvero, a chi guardava la scheda.

export type TipologiaRisposta = {
  chiave: "urgenze" | "da_domani" | "pianificato" | "su_misura";
  etichetta: string;
  spiega: string;
  colore: string;
};

export const TIPOLOGIE_RISPOSTA: TipologiaRisposta[] = [
  { chiave: "urgenze", etichetta: "Urgenze", spiega: "Pronto in giornata (gg_disp_min 0).", colore: "var(--grey)" },
  { chiave: "da_domani", etichetta: "Da domani", spiega: "Un giorno di preparazione (gg_disp_min 1).", colore: "var(--grey)" },
  { chiave: "pianificato", etichetta: "Pianificato", spiega: "Qualche giorno, va programmato (gg_disp_min 2–3).", colore: "var(--grey)" },
  { chiave: "su_misura", etichetta: "Su misura", spiega: "Si fa apposta, richiede tempo (gg_disp_min 4+).", colore: "var(--grey)" },
];

const PER_CHIAVE = new Map(TIPOLOGIE_RISPOSTA.map((t) => [t.chiave, t]));

/**
 * La tipologia di risposta dato `gg_disp_min`. `null`/non numerico → `null`:
 * senza il dato non si inventa una categoria (meglio «non indicato» che una
 * tipologia sbagliata).
 */
export function tipologiaRisposta(ggDispMin: number | null | undefined): TipologiaRisposta | null {
  if (ggDispMin == null || !Number.isFinite(ggDispMin)) return null;
  if (ggDispMin <= 0) return PER_CHIAVE.get("urgenze")!;
  if (ggDispMin === 1) return PER_CHIAVE.get("da_domani")!;
  if (ggDispMin <= 3) return PER_CHIAVE.get("pianificato")!;
  return PER_CHIAVE.get("su_misura")!;
}

export function etichettaRisposta(ggDispMin: number | null | undefined): string {
  return tipologiaRisposta(ggDispMin)?.etichetta ?? "Non indicato";
}
