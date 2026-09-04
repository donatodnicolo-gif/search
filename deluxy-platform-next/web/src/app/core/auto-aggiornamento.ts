import { DestroyRef, inject } from '@angular/core';

/** Ogni quanto una lista si riallinea da sola (regola utente 04/09/2026). */
export const AUTO_AGGIORNAMENTO_MS = 30_000;

/**
 * AUTO-AGGIORNAMENTO delle liste (04/09/2026, regola utente): chi tiene
 * aperta una pagina vede arrivare consegne, vendite, segnalazioni, attività
 * senza ricaricare. È il «tempo reale» già usato dalla chat e dai pallini:
 * un polling educato, senza websocket (serverless).
 *
 * Educato vuol dire:
 * - gira solo con la scheda VISIBILE (una scheda in secondo piano non chiede
 *   niente) e si riallinea subito quando ci si torna;
 * - salta il giro se la pagina è «occupata» (`sospeso`: un pannello aperto,
 *   un salvataggio in corso) — non si tira via la riga sotto le mani;
 * - la ricarica è SILENZIOSA (niente rotellina, niente azzeramento di
 *   selezioni o filtri): lo decide chi la implementa;
 * - si spegne con il componente (DestroyRef).
 *
 * Va chiamato in un contesto di iniezione (constructor o inizializzatore).
 */
export function avviaAutoAggiornamento(opzioni: {
  ricarica: () => void;
  sospeso?: () => boolean;
  ogni?: number;
}): void {
  const destroyRef = inject(DestroyRef);
  const ogni = opzioni.ogni ?? AUTO_AGGIORNAMENTO_MS;
  const giro = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (opzioni.sospeso?.()) return;
    opzioni.ricarica();
  };
  const timer = setInterval(giro, ogni);
  const alRitorno = () => { if (document.visibilityState === 'visible') giro(); };
  document.addEventListener('visibilitychange', alRitorno);
  destroyRef.onDestroy(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', alRitorno);
  });
}
