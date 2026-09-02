import { Directive, ElementRef, NgZone, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgModel } from '@angular/forms';
import { environment } from '../../environments/environment';
import { loadGoogleMaps } from './google-maps';

/**
 * REGOLA (utente, 02/09): OGNI input che contiene un INDIRIZZO è collegato a
 * Google Maps — suggerimenti mentre si scrive e, al blur, il testo scritto a
 * mano si normalizza col PRIMO risultato (città e provincia comprese).
 *
 * Si applica mettendo `appIndirizzoGoogle` su un input con ngModel. Senza la
 * chiave browser nelle Impostazioni degrada in silenzio a campo normale
 * (la geocodifica del server resta comunque).
 */

/** La chiave si chiede UNA volta per pagina, non una per campo. */
let chiavePromise: Promise<string | null> | null = null;

@Directive({ selector: '[appIndirizzoGoogle]', standalone: true })
export class IndirizzoGoogleDirective implements OnInit {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly http = inject(HttpClient);
  private readonly model = inject(NgModel, { optional: true });
  private ultimaScelta = 0;

  ngOnInit(): void {
    chiavePromise ??= new Promise((resolve) => {
      this.http
        .get<{ googleMapsBrowserKey: string | null }>(`${environment.apiUrl}/settings/public`)
        .subscribe({
          next: (cfg) => resolve(cfg?.googleMapsBrowserKey ?? null),
          error: () => resolve(null),
        });
    });
    chiavePromise.then(async (key) => {
      if (!key) return;
      try {
        await loadGoogleMaps(key);
        const g = (window as any).google;
        const ac = new g.maps.places.Autocomplete(this.el.nativeElement, {
          componentRestrictions: { country: 'it' },
          fields: ['formatted_address', 'name'],
        });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          this.zone.run(() => {
            this.ultimaScelta = Date.now();
            this.scrivi(pulisci(place?.formatted_address || this.el.nativeElement.value || ''));
          });
        });
        this.el.nativeElement.addEventListener('blur', () => this.normalizza());
      } catch {
        /* script non caricato: resta il campo normale */
      }
    });
  }

  private scrivi(testo: string): void {
    this.el.nativeElement.value = testo;
    this.model?.control.setValue(testo);
  }

  /** Al blur: il testo a mano diventa il primo risultato di Google. */
  private normalizza(): void {
    setTimeout(() => {
      // Un suggerimento appena scelto non si sovrascrive (il click sul menu
      // fa blur prima di place_changed).
      if (Date.now() - this.ultimaScelta < 800) return;
      const valore = this.el.nativeElement.value?.trim();
      if (!valore) return;
      const g = (window as any).google;
      if (!g?.maps?.Geocoder) return;
      new g.maps.Geocoder().geocode({ address: valore, region: 'it' }, (results: any, status: string) => {
        this.zone.run(() => {
          if (status !== 'OK' || !results?.length) return;
          this.scrivi(pulisci(results[0].formatted_address || valore));
        });
      });
    }, 300);
  }
}

/** Via il Google Plus Code davanti («F6P2+7H5, …»): è un codice, non un indirizzo. */
function pulisci(a: string): string {
  return (a ?? '').replace(/^\s*[0-9A-Z]{4,8}\+[0-9A-Z]{2,4}\b[,\s]*/, '').trim();
}
