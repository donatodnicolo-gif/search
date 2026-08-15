"use client";

// «← Indietro» che funziona sempre, anche arrivando dalla barra laterale:
// usa la cronologia del browser.
//
// ⚠️ Il link `?torna=` copre solo chi arriva qui dopo aver messo qualcosa in
// coda. Chi apre Operazioni dal menù non ha quel parametro e restava senza
// via d'uscita — la cronologia ce l'ha comunque.
export function TornaIndietro({ etichetta = "← Indietro" }: { etichetta?: string }) {
  return (
    <button
      type="button"
      className="btn small btn-secondario"
      onClick={() => history.back()}
      title="Torna alla pagina da cui sei arrivato"
    >
      {etichetta}
    </button>
  );
}
