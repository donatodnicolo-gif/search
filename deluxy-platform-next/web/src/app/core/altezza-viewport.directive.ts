import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy, inject, input } from '@angular/core';

/**
 * ⭐ 11/09/2026 (segnalazione utente) — LA BARRA PER SCORRERE A DESTRA DEVE ESSERE RAGGIUNGIBILE.
 *
 * IL DIFETTO. Le tabelle larghe scorrono dentro `.table-wrap`, che in `styles.css` ha
 * `max-height: calc(100vh - 240px)`. Quei 240px erano una stima dello spazio occupato sopra. Nell'elenco
 * consegne sopra la tabella ci sono titolo, tre righe di filtri, la legenda e il conteggio dei record:
 * oltre quattrocento pixel. Il riquadro quindi comincia a metà schermo ed è alto quasi quanto lo schermo,
 * cioè **finisce sotto il bordo inferiore** — e con lui la barra di scorrimento orizzontale, che sta in
 * fondo al riquadro.
 *
 * Chi voleva guardare una colonna a destra doveva scorrere la PAGINA fin giù per trovare la barra, e a
 * quel punto la prima consegna era uscita dallo schermo: si scorreva alla cieca.
 *
 * LA CORREZIONE. L'altezza non si indovina con un numero fisso: si MISURA. La direttiva legge dove il
 * riquadro comincia davvero e gli dà l'altezza che resta fino al fondo della finestra, meno un margine.
 * Così la barra sta sempre sul bordo inferiore dello schermo, e le intestazioni restano in cima.
 *
 * ⚠️ Si rimisura al ridimensionamento e allo scorrimento della pagina, perché i filtri si aprono e si
 * chiudono e il riquadro si sposta.
 * ⚠️ Sotto gli 800px NON fa niente: là le righe diventano schede e `styles.css` toglie apposta
 * l'altezza massima — una finestrella che scorre dentro la pagina è proprio ciò che il telefono non deve
 * avere.
 * ⚠️ Gli ascoltatori stanno fuori da Angular (`runOutsideAngular`): sono eventi ad alta frequenza e non
 * devono far girare il rilevamento delle modifiche a ogni pixel.
 */
@Directive({
  selector: '[appAltezzaViewport]',
  standalone: true,
})
export class AltezzaViewportDirective implements AfterViewInit, OnDestroy {
  /**
   * Quanto spazio lasciare sotto il riquadro (paginazione, respiro).
   *
   * ⚠️ NON si chiama come la direttiva: scritto senza valore, `appAltezzaViewport` passerebbe la stringa
   * vuota a un input numerico, e il compilatore del template lo rifiuta. L'attributo resta un
   * interruttore, il numero ha un nome suo.
   */
  readonly margineSotto = input(24);

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private osservatore: ResizeObserver | null = null;
  private readonly ricalcola = () => this.applica();

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.applica();
      window.addEventListener('resize', this.ricalcola, { passive: true });
      window.addEventListener('scroll', this.ricalcola, { passive: true });
      // I filtri che si aprono cambiano l'altezza di ciò che sta sopra senza nessun evento di finestra.
      if (typeof ResizeObserver !== 'undefined' && this.el.nativeElement.parentElement) {
        this.osservatore = new ResizeObserver(() => this.applica());
        this.osservatore.observe(this.el.nativeElement.parentElement);
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.ricalcola);
    window.removeEventListener('scroll', this.ricalcola);
    this.osservatore?.disconnect();
    this.osservatore = null;
  }

  private applica(): void {
    const nodo = this.el.nativeElement as HTMLElement;
    if (!nodo?.isConnected) return;
    if (window.innerWidth <= 800) {
      nodo.style.removeProperty('max-height');
      return;
    }
    const alto = nodo.getBoundingClientRect().top;
    // Sotto una certa soglia il riquadro diventa una feritoia illeggibile: meglio lasciarlo crescere e
    // far scorrere la pagina, come faceva prima.
    const altezza = window.innerHeight - alto - this.margineSotto();
    nodo.style.maxHeight = altezza >= 260 ? `${Math.round(altezza)}px` : '';
  }
}
