// Calcolo puro della fee: niente database, così lo possono usare anche i
// componenti client (il form della vendita mostra la fee mentre si compila).
export type Tariffa = { dalAnno: number; dalMese: number; feePercent: number };

// Fee valida per un dato mese: la tariffa più recente con decorrenza <= (anno,
// mese); se nessuna tariffa la copre, la fee base del partner.
export function feeDaTariffe(
  tariffe: Tariffa[],
  anno: number,
  mese: number,
  feeBase: number
): number {
  return tariffeApplicabili(tariffe, anno, mese)[0]?.feePercent ?? feeBase;
}

// Le decorrenze già entrate in vigore, dalla più recente: serve anche per dire
// all'operatore DA DOVE arriva la percentuale che sta per applicare.
export function tariffeApplicabili(tariffe: Tariffa[], anno: number, mese: number): Tariffa[] {
  return tariffe
    .filter((t) => t.dalAnno < anno || (t.dalAnno === anno && t.dalMese <= mese))
    .sort((a, b) => b.dalAnno - a.dalAnno || b.dalMese - a.dalMese);
}
