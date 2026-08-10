"use client";

// «Seleziona tutte / nessuna» per le caselle di una tabella: prende quelle
// PRESENTI nel DOM, cioè le righe del filtro corrente — su «In pausa» spunta
// le in pausa, non tutte le keyword del gruppo. Un click spunta tutto, il
// successivo svuota (se sono già tutte spuntate).
export function SelezionaTutte({ formId }: { formId: string }) {
  return (
    <button
      type="button"
      className="btn small btn-secondario"
      title="Spunta tutte le righe mostrate dal filtro corrente; se sono già tutte spuntate, le toglie"
      onClick={() => {
        const caselle = [
          ...document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="scelte"]`),
        ];
        const tutteSpuntate = caselle.length > 0 && caselle.every((c) => c.checked);
        for (const c of caselle) c.checked = !tutteSpuntate;
      }}
    >
      Tutte / nessuna
    </button>
  );
}
